import { useEffect, useId, useMemo, useState } from 'react';
import type { Project } from '../../data/schema';
import { scopeToWave } from '../../data/waves';
import { changeCopy } from '../copy/change';
import { percent } from '../copy/data';
import { formatValue, mapCopy } from '../copy/map';
import {
  EngineClient,
  type ChangeObservation,
  type GroupPairChange,
  type TieChangeKind,
  type WaveChange,
} from '../engineClient';
import { ForceLayout } from '../map/layout';
import { buildMapModel, refLabel, type MapEdge, type MapModel } from '../map/model';
import type { Point } from '../map/scene';
import { effectiveSettings, type MapData } from '../map/useMapModel';
import { runChange, wavePair, ratedWaves, type ChangeRun, type WavePair } from '../state/change';
import { alignNames, useMemberNames, type MemberNames } from '../state/names';
import { useAppStore, type MapSettings } from '../state/store';
import { analysedWave } from '../state/waves';
import { MiniMap } from './MiniMap';

const C = changeCopy;

// The Compare tab's "Two waves" mode (build plan session 15): what changed
// between two waves on the "Ties from" layer, in the current view. Each wave
// is analysed with the same weights and options on a worker of its own; the
// engine's compareWaves reads the two results. Members sit in the same place
// on both maps (one layout over everyone on either roster).

type RunState =
  | { status: 'running'; key: string }
  | { status: 'ready'; key: string; run: ChangeRun }
  | { status: 'failed'; key: string };

/**
 * Comparisons run or running, by the settings they read; the last few are
 * kept, so a change of a map setting the comparison does not read reuses one.
 */
const runs = new Map<string, Promise<ChangeRun>>();
const KEEP = 4;

/** Runs the comparison for the settings on screen; a result for older settings is ignored. */
export function useChangeRun(
  project: Project | null,
  map: MapSettings,
  pair: WavePair | null,
  ref: string,
): RunState {
  const weights = useAppStore((s) => s.weights);
  const revision = useAppStore((s) => s.data.revision);
  const key = JSON.stringify([
    revision,
    project?.settings.insight_group ?? null,
    project?.settings.coverage_threshold ?? null,
    pair,
    ref,
    map.view,
    map.symmetrise,
    map.nonRespondents,
    map.reconstruct,
    map.standardise,
    weights,
  ]);
  const [state, setState] = useState<RunState | null>(null);
  useEffect(() => {
    if (!project || !pair) return;
    let live = true;
    let promise = runs.get(key);
    if (!promise) {
      const client = new EngineClient();
      promise = runChange(
        project,
        map,
        weights,
        pair,
        ref,
        (input) => client.analyse(input).promise,
        `change:${key}`,
      ).finally(() => {
        client.dispose();
      });
      runs.set(key, promise);
      promise.catch(() => runs.delete(key));
      for (const old of [...runs.keys()].slice(0, Math.max(0, runs.size - KEEP))) runs.delete(old);
    }
    promise.then(
      (run) => {
        if (live) setState({ status: 'ready', key, run });
      },
      () => {
        if (live) setState({ status: 'failed', key });
      },
    );
    return () => {
      live = false;
    };
    // `key` encodes every value the comparison reads (the project by its revision).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state : { status: 'running', key };
}

/**
 * The comparison of the wave analysed with the wave before it (or the pair
 * chosen in the Compare tab), on `ref`; null until it is ready or when the
 * project has fewer than two waves with ratings. For presentation and the card.
 */
export function useDefaultChange(ref: string | null): ChangeRun | null {
  const project = useAppStore((s) => s.data.project);
  const map = useAppStore((s) => s.map);
  const chosen = useAppStore((s) => s.ui.wavePair);
  const analysed = useAppStore(analysedWave);
  const pair = project && ref ? wavePair(project, analysed, chosen) : null;
  const state = useChangeRun(pair ? project : null, map, pair, ref ?? '');
  return pair && state.status === 'ready' ? state.run : null;
}

const pairId = (a: string, b: string) => `${a}\u0000${b}`;

/** The change on screen for each drawn tie: ±2 gained or lost, ±1 strengthened or weakened. */
function markEdges(
  model: MapModel,
  ids: readonly string[],
  change: WaveChange,
  side: 'before' | 'after',
): MapModel {
  const kinds = new Map<string, TieChangeKind>();
  for (const t of change.ties) kinds.set(pairId(t.from, t.to), t.kind);
  const kindOf = (i: number, j: number) => {
    const a = ids[i] as string;
    const b = ids[j] as string;
    return kinds.get(pairId(a, b)) ?? kinds.get(pairId(b, a));
  };
  const value = (k: TieChangeKind | undefined) =>
    side === 'after'
      ? k === 'gained'
        ? 2
        : k === 'strengthened'
          ? 1
          : 0
      : k === 'lost'
        ? -2
        : k === 'weakened'
          ? -1
          : 0;
  const edges: MapEdge[] = model.edges.map((e) => {
    const v = value(kindOf(e.source, e.target));
    // Strengthened and weakened ties are dashed, so they are not read as gained or lost.
    return { ...e, colour: v, style: Math.abs(v) === 1 ? 'informal' : 'plain', bridge: false };
  });
  return {
    ...model,
    edges,
    colour: { ...model.colour, kind: 'change', reason: null, anyMissing: false, anyZero: false },
    styleShown: false,
    outlines: null,
    markBridges: false,
    bridges: 0,
    annotations: [],
  };
}

function useWaveModels(data: MapData, project: Project, run: ChangeRun, names: MemberNames) {
  return useMemo(() => {
    const build = (wave: number, side: 'before' | 'after') => {
      const p = scopeToWave(project, wave);
      const result = side === 'before' ? run.before : run.after;
      const settings: MapSettings = {
        ...effectiveSettings(p, result, data.settings),
        layer: run.ref,
        ego: null,
        highlight: [],
        edgeColour: { kind: 'none' },
        edgeStyle: 'none',
        markBridges: false,
        communityOutlines: false,
        negativeOutsideRange: false,
      };
      const model = buildMapModel(p, result, settings, data.theme, alignNames(names, p).byIndex);
      return markEdges(model, result.memberIds, run.change, side);
    };
    const before = build(run.pair.before, 'before');
    const after = build(run.pair.after, 'after');

    // One layout over everyone on either roster, attracted by the stronger of the two waves' ties.
    const ids = [...run.after.memberIds, ...run.change.members.left];
    const index = new Map(ids.map((id, i) => [id, i]));
    const n = ids.length;
    const weights = new Float64Array(n * n);
    const radii = new Array<number>(n).fill(data.theme.nodeMin);
    for (const [result, model] of [
      [run.before, before],
      [run.after, after],
    ] as const) {
      const m = result.memberIds.length;
      const w = result.refs[run.ref]?.weights;
      result.memberIds.forEach((id, i) => {
        const u = index.get(id) as number;
        radii[u] = Math.max(radii[u] as number, model.nodes[i]?.radius ?? 0);
        if (!w) return;
        result.memberIds.forEach((other, j) => {
          const x = w[i * m + j] as number;
          const v = index.get(other) as number;
          if (x > (weights[u * n + v] as number)) weights[u * n + v] = x;
        });
      });
    }
    const layout = new ForceLayout();
    layout.update(`change:${run.ref}:${ids.join(',')}`, n, weights, radii);
    const at = layout.settled.map((p) => ({ x: p.x, y: p.y }));
    const positionsFor = (result: ChangeRun['before']): Point[] =>
      result.memberIds.map((id) => at[index.get(id) as number] ?? { x: 0, y: 0 });
    return {
      before,
      after,
      positions: { before: positionsFor(run.before), after: positionsFor(run.after) },
    };
  }, [data, project, run, names]);
}

/** Change in density as a step of the diverging scale: below 10 points neutral, then 25 and 50 points. */
export function changeStep(d: number): number {
  if (!Number.isFinite(d)) return 0;
  const a = Math.abs(d);
  const s = a < 0.1 ? 0 : a < 0.25 ? 1 : a < 0.5 ? 2 : 3;
  return d < 0 ? -s : s;
}
const stepClass = (s: number) =>
  `shade-signed-${s < 0 ? `n${String(-s)}` : s > 0 ? `p${String(s)}` : '0'}`;

function GroupChangeMatrix({ change }: { change: WaveChange }) {
  const caption = useId();
  const directed = change.view === 'directed';
  if (!change.group || change.groups.length === 0)
    return <p className="field__help">{C.matrix.noGroups}</p>;
  const find = (a: string, b: string): GroupPairChange | undefined =>
    change.groupPairs.find((p) => p.from === a && p.to === b) ??
    (directed ? undefined : change.groupPairs.find((p) => p.from === b && p.to === a));
  return (
    // The matrix scrolls sideways in a narrow column, so its region takes focus.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <div className="change__matrix" role="region" aria-labelledby={caption} tabIndex={0}>
      <table className="member__table change__table" data-testid="change-matrix">
        <caption id={caption} className="field__label compare__caption">
          {C.matrix.title}
          <span className="field__help change__caption-help">{C.matrix.caption(directed)}</span>
        </caption>
        <thead>
          <tr>
            <td />
            {change.groups.map((g) => (
              <th key={g} scope="col" className="numeric">
                {g}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {change.groups.map((row) => (
            <tr key={row}>
              <th scope="row">{row}</th>
              {change.groups.map((col) => {
                const p = find(row, col);
                const d = p?.before && p.after ? p.after.density - p.before.density : Number.NaN;
                const text = C.matrix.readout(
                  row,
                  col,
                  directed,
                  p?.before ?? null,
                  p?.after ?? null,
                );
                return (
                  <td
                    key={col}
                    className={`numeric change__cell ${Number.isFinite(d) ? stepClass(changeStep(d)) : 'change__cell--none'}`}
                    title={text}
                  >
                    <span aria-hidden="true">{C.matrix.points(d)}</span>
                    <span className="visually-hidden">{text}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Observations({
  items,
  change,
  name,
}: {
  items: readonly ChangeObservation[];
  change: WaveChange;
  name: (id: string) => string;
}) {
  if (items.length === 0) return <p className="field__help">{C.noObservations}</p>;
  return (
    <ul className="change__observations" data-testid="change-observations">
      {items.map((o, k) => (
        <li key={`${o.kind}-${String(k)}`} className="change__observation">
          <p>{C.saw(o, change, name)}</p>
          <p className="change__question">{C.question(o, change, name)}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * What changed, as sentences and questions: the Compare view, the presentation's
 * opening step and its audiences. `named` false gives counts without names.
 */
export function ChangeSection({
  run,
  observations,
  name,
  named,
}: {
  run: ChangeRun;
  observations: readonly ChangeObservation[];
  name: (id: string) => string;
  named: boolean;
}) {
  const { change } = run;
  const withheld = run.observations.withheld;
  return (
    <>
      <div className="change__summary">
        {C.summary(change, named ? name : null).map((s) => (
          <p key={s}>{s}</p>
        ))}
      </div>
      {withheld ? (
        <p className="change__withheld" data-testid="change-withheld">
          {C.withheld(change)}
        </p>
      ) : (
        <>
          <h4 className="change__subheading">{C.questions}</h4>
          <Observations items={observations} change={change} name={name} />
          {named && run.observations.groupsWithheld > 0 && (
            <p className="field__help">
              {C.groupsWithheld(run.observations.groupsWithheld, change.minCoverage)}
            </p>
          )}
        </>
      )}
    </>
  );
}

function SidesTable({ change, name }: { change: WaveChange; name: (id: string) => string }) {
  const { before: b, after: a } = change;
  const ei = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '–');
  const rows: [string, string, string][] = [
    [C.table.members, formatValue(b.members), formatValue(a.members)],
    [C.table.coverage, percent(b.coverage), percent(a.coverage)],
    [C.table.ties, formatValue(b.ties), formatValue(a.ties)],
    [C.table.density, percent(b.density), percent(a.density)],
    ...(change.group ? [[C.table.ei, ei(b.ei), ei(a.ei)] as [string, string, string]] : []),
    [C.table.load, percent(b.load), percent(a.load)],
    [C.table.bridges, formatValue(b.localBridges), formatValue(a.localBridges)],
    [
      C.table.cutPoints,
      b.cutPoints.map(name).join(', ') || '–',
      a.cutPoints.map(name).join(', ') || '–',
    ],
  ];
  return (
    <table className="member__table compare__table" data-testid="change-sides">
      <caption className="field__label compare__caption">{C.table.caption}</caption>
      <thead>
        <tr>
          <th scope="col">{C.table.measure}</th>
          <th scope="col" className="numeric">
            {C.waveOption(b.wave)}
          </th>
          <th scope="col" className="numeric">
            {C.waveOption(a.wave)}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, x, y]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td className="numeric">{x}</td>
            <td className="numeric">{y}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const KINDS: readonly TieChangeKind[] = [
  'gained',
  'lost',
  'strengthened',
  'weakened',
  'steady',
  'notComparable',
];

function PerMember({ change, name }: { change: WaveChange; name: (id: string) => string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const selected = useAppStore((s) => s.selection.member);
  const selectMember = useAppStore((s) => s.selectMember);
  const setRightPanel = useAppStore((s) => s.setRightPanel);
  const directed = change.view === 'directed';
  const rows = [...change.perMember].sort((p, q) => name(p.id).localeCompare(name(q.id), 'en-GB'));
  return (
    <section className="compare__members">
      <button
        type="button"
        className="member__disclosure"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {open ? C.perMember.hide : C.perMember.show}
      </button>
      <div id={id} hidden={!open}>
        {open && (
          <table className="member__table compare__per-member" data-testid="change-per-member">
            <thead>
              <tr>
                <th scope="col">{C.perMember.member}</th>
                <th scope="col" className="numeric">
                  {C.perMember.received}
                </th>
                {directed && (
                  <th scope="col" className="numeric">
                    {C.perMember.given}
                  </th>
                )}
                {(['gained', 'lost', 'strengthened', 'weakened'] as const).map((k) => (
                  <th key={k} scope="col" className="numeric">
                    {C.kinds[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className={m.id === selected ? 'is-selected' : undefined}>
                  <th scope="row">
                    <button
                      type="button"
                      className="link-button"
                      aria-current={m.id === selected ? 'true' : undefined}
                      onClick={() => {
                        selectMember(m.id);
                        setRightPanel('member');
                      }}
                    >
                      {name(m.id)}
                    </button>
                  </th>
                  <td className="numeric">{C.arrow(m.received[0], m.received[1])}</td>
                  {directed && <td className="numeric">{C.arrow(m.given[0], m.given[1])}</td>}
                  {(['gained', 'lost', 'strengthened', 'weakened'] as const).map((k) => (
                    <td key={k} className="numeric">
                      {formatValue(m.ties[k])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Key() {
  return (
    <div className="change__key" data-testid="change-key">
      <p className="field__label">{C.key.title}</p>
      <ul className="change__key-list">
        {(
          [
            ['gained', 'solid'],
            ['strengthened', 'dashed'],
            ['lost', 'solid'],
            ['weakened', 'dashed'],
            ['unchanged', 'solid'],
          ] as const
        ).map(([k, line]) => (
          <li key={k} className="change__key-item">
            <span
              aria-hidden="true"
              className={`change__line change__line--${k === 'gained' || k === 'strengthened' ? 'gained' : k === 'unchanged' ? 'unchanged' : 'lost'} change__line--${line}`}
            />
            {C.key[k]}
          </li>
        ))}
      </ul>
      <p className="field__help">{C.key.notOnRoster}</p>
    </div>
  );
}

export function WaveComparison({ data }: { data: MapData }) {
  const project = useAppStore((s) => s.data.project);
  const map = useAppStore((s) => s.map);
  const chosen = useAppStore((s) => s.ui.wavePair);
  const setPair = useAppStore((s) => s.setWavePair);
  const analysed = useAppStore(analysedWave);
  const names = useMemberNames();
  const ids = { before: useId(), after: useId() };
  const pair = project ? wavePair(project, analysed, chosen) : null;
  if (!project || !pair) return <p className="placeholder">{C.needsTwoWaves}</p>;
  const waves = ratedWaves(project);
  const select = (id: string, label: string, value: number, side: keyof WavePair) => (
    <div className="field field--inline">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <select
        id={id}
        className="select"
        value={value}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          const next = { ...pair, [side]: v };
          // Keep the earlier wave first.
          setPair(
            next.before < next.after
              ? next
              : side === 'before'
                ? { before: v, after: waves.find((w) => w > v) ?? v }
                : { before: waves.filter((w) => w < v).at(-1) ?? v, after: v },
          );
        }}
      >
        {waves
          .filter((w) =>
            side === 'before' ? w < (waves.at(-1) as number) : w > (waves[0] as number),
          )
          .map((w) => (
            <option key={w} value={w}>
              {C.waveOption(w)}
            </option>
          ))}
      </select>
    </div>
  );
  return (
    <>
      <div className="view-toolbar">
        {select(ids.before, C.earlier, pair.before, 'before')}
        {select(ids.after, C.later, pair.after, 'after')}
      </div>
      <Comparison data={data} project={project} map={map} pair={pair} names={names} />
    </>
  );
}

function Comparison({
  data,
  project,
  map,
  pair,
  names,
}: {
  data: MapData;
  project: Project;
  map: MapSettings;
  pair: WavePair;
  names: MemberNames;
}) {
  const state = useChangeRun(project, map, pair, data.settings.layer);
  if (state.status === 'running')
    return (
      <p className="placeholder" role="status">
        {C.calculating}
      </p>
    );
  if (state.status === 'failed') return <p className="placeholder">{C.failed}</p>;
  return <ComparisonResult data={data} project={project} run={state.run} names={names} />;
}

function ComparisonResult({
  data,
  project,
  run,
  names,
}: {
  data: MapData;
  project: Project;
  run: ChangeRun;
  names: MemberNames;
}) {
  const models = useWaveModels(data, project, run, names);
  const heading = useId();
  const { change, observations } = run;
  const name = names.of;
  const layer = run.ref === 'composite' ? mapCopy.controls.composite : refLabel(project, run.ref);
  return (
    <div className="change" data-testid="wave-comparison">
      <p className="field__help compare__intro">
        {C.intro(layer, C.view(change.view, change.symmetrise))}
      </p>
      <div className="compare__maps compare__maps--two">
        <MiniMap
          data={data}
          model={models.before}
          positions={models.positions.before}
          label={C.mapBefore(run.pair.before)}
        />
        <MiniMap
          data={data}
          model={models.after}
          positions={models.positions.after}
          label={C.mapAfter(run.pair.after)}
        />
      </div>
      <Key />
      <section className="change__section" aria-labelledby={heading}>
        <h3 id={heading} className="compare__heading">
          {C.whatChanged}
        </h3>
        <ChangeSection run={run} observations={observations.observations} name={name} named />
        <p className="field__help">{C.thresholds}</p>
        <p className="field__help">{C.regression}</p>
      </section>
      <GroupChangeMatrix change={change} />
      <div className="compare__tables">
        <SidesTable change={change} name={name} />
        <table className="member__table compare__table" data-testid="change-ties">
          <caption className="field__label compare__caption">{C.tieTable.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{C.tieTable.kind}</th>
              <th scope="col" className="numeric">
                {C.tieTable.count}
              </th>
            </tr>
          </thead>
          <tbody>
            {KINDS.map((k) => (
              <tr key={k}>
                <th scope="row">{C.kinds[k]}</th>
                <td className="numeric">{formatValue(change.counts[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PerMember change={change} name={name} />
    </div>
  );
}
