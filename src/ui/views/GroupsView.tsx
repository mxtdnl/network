import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { GroupMixing } from '../engineClient';
import type { MemberId } from '../../data/schema';
import { groupsCopy as G, sharePercent } from '../copy/groups';
import { formatValue, mapCopy } from '../copy/map';
import {
  chosenGroup,
  effectiveGrouping,
  groupAt,
  groupCell,
  groupMapModel,
  groupMembers,
  groupMixing,
  groupingOptions,
  pairCell,
  paintGroupMap,
  readGroupMapTheme,
} from '../map/groupModel';
import { drawableLayers, useMapData, type MapData } from '../map/useMapModel';
import { useAppStore, type Grouping } from '../state/store';
import { heatClass } from './AdjacencyView';
import { EmptyState } from './EmptyState';

// Positions are integer indices passed to CSS as custom properties (D31).
const place = (name: string, value: number) => (el: HTMLElement | null) => {
  el?.style.setProperty(name, String(value));
};

const signed = (v: number) =>
  Number.isFinite(v) ? (v > 0 ? `+${formatValue(v)}` : formatValue(v)) : mapCopy.legend.notDefined;

/** Heat step for a share of possible ties: none possible, no ties, or 1–5 on the matrix ramp. */
function shareClass(ties: number, possible: number): string {
  if (!(possible > 0)) return 'groups__cell--impossible';
  return heatClass(ties / possible);
}

// The Groups view (D154, spec §8): ties within and between groups of members,
// by any category attribute or by community, on the layer the map draws ties
// from, in the current view. A group connection matrix, a group map and a
// table per group; choosing a group makes its members the subgroup, so the
// map, the matrix and the table follow (D64).
export function GroupsView() {
  const project = useAppStore((s) => s.data.project);
  const data = useMapData();
  if (!project || project.members.length === 0) return <EmptyState />;
  if (!data) return <p className="placeholder">{mapCopy.calculating}</p>;
  return <Groups data={data} />;
}

interface Labels {
  /** Display name of each group, in mixing order. */
  names: string[];
  attribute: string;
}

function Groups({ data }: { data: MapData }) {
  const { project, result, settings } = data;
  const chosen = useAppStore((s) => s.ui.grouping);
  const setGrouping = useAppStore((s) => s.setGrouping);
  const setMap = useAppStore((s) => s.setMap);
  const subgroup = useAppStore((s) => s.selection.group);
  const setGroup = useAppStore((s) => s.setGroup);
  const setStatus = useAppStore((s) => s.setStatus);
  const ids = { layer: useId(), group: useId(), help: useId(), intro: useId() };

  const ref = result.refs[settings.layer];
  const grouping = effectiveGrouping(project, chosen);
  const mix = groupMixing(ref, grouping);
  const directed = result.view === 'directed';
  const options = groupingOptions(project);
  const layerLabel = (key: string) =>
    key === 'composite'
      ? mapCopy.controls.composite
      : (project.layers.find((l) => l.key === key)?.label ?? key);
  const attribute =
    grouping.kind === 'community'
      ? G.community
      : (options.find((a) => a.key === grouping.key)?.label ?? grouping.key);
  const labels: Labels = {
    names: (mix?.groups ?? []).map((g) => (grouping.kind === 'community' ? G.communityName(g) : g)),
    attribute,
  };
  const current = mix ? chosenGroup(project, ref, grouping, mix, subgroup) : -1;

  // Choosing a group again clears the subgroup; a pair of groups becomes one subgroup.
  const choose = (groups: number[]) => {
    if (!mix) return;
    const members: MemberId[] = [];
    for (const g of new Set(groups))
      members.push(...groupMembers(project, ref, grouping, mix.groups[g] ?? ''));
    const same = members.length === subgroup.length && members.every((id) => subgroup.includes(id));
    if (same || members.length === 0) {
      setGroup([]);
      setStatus({ text: G.status.cleared, tone: 'info' });
      return;
    }
    setGroup(members);
    const [a, b] = [...new Set(groups)];
    const text =
      b === undefined
        ? G.status.chosen(labels.names[a ?? 0] ?? '', members.length)
        : G.status.pair(labels.names[a ?? 0] ?? '', labels.names[b] ?? '', members.length);
    setStatus({ text, tone: 'info' });
  };

  const value = grouping.kind === 'community' ? 'community' : `attr:${grouping.key}`;
  return (
    <div className="groups">
      <div className="view-toolbar">
        <div className="field field--inline">
          <label htmlFor={ids.layer} className="field__label">
            {G.layer}
          </label>
          <select
            id={ids.layer}
            className="select"
            value={settings.layer}
            onChange={(e) => {
              setMap({ layer: e.currentTarget.value });
            }}
          >
            {drawableLayers(project, result).map((key) => (
              <option key={key} value={key}>
                {layerLabel(key)}
              </option>
            ))}
          </select>
        </div>
        <div className="field field--inline">
          <label htmlFor={ids.group} className="field__label">
            {G.groupBy}
          </label>
          <select
            id={ids.group}
            className="select"
            value={value}
            onChange={(e) => {
              const v = e.currentTarget.value;
              const next: Grouping =
                v === 'community' ? { kind: 'community' } : { kind: 'attribute', key: v.slice(5) };
              setGrouping(next);
            }}
          >
            {options.length > 0 && (
              <optgroup label={G.attributes}>
                {options.map((a) => (
                  <option key={a.key} value={`attr:${a.key}`}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            )}
            <option value="community">{G.community}</option>
          </select>
        </div>
      </div>
      <p className="groups__intro field__help" id={ids.intro}>
        {G.intro(layerLabel(settings.layer), directed)}
        {grouping.kind === 'community' && ` ${G.communityNote(layerLabel(settings.layer))}`}
      </p>
      {!mix || mix.groups.length === 0 ? (
        <p className="placeholder">
          {grouping.kind === 'community' ? G.noCommunities : G.noGroups}
        </p>
      ) : (
        <>
          {mix.excluded > 0 && (
            <p className="field__help">{G.excluded(mix.excluded, attribute.toLowerCase())}</p>
          )}
          {mix.groups.length === 1 && <p className="field__help">{G.oneGroup}</p>}
          <div className="groups__pictures">
            <GroupMatrix
              key={`${settings.layer}|${value}`}
              mix={mix}
              labels={labels}
              directed={directed}
              layer={layerLabel(settings.layer)}
              current={current}
              onChoose={choose}
            />
            <GroupMap
              mix={mix}
              labels={labels}
              directed={directed}
              layer={layerLabel(settings.layer)}
              current={current}
              onChoose={choose}
            />
          </div>
          <GroupTable mix={mix} labels={labels} current={current} onChoose={choose} />
        </>
      )}
    </div>
  );
}

interface PartProps {
  mix: GroupMixing;
  labels: Labels;
  current: number;
  onChoose: (groups: number[]) => void;
}

function GroupMatrix({
  mix,
  labels,
  directed,
  layer,
  current,
  onChoose,
}: PartProps & { directed: boolean; layer: string }) {
  const k = mix.groups.length;
  const baseId = useId();
  const helpId = useId();
  const [active, setActive] = useState({ r: Math.max(0, current), c: Math.max(0, current) });
  const cellId = (r: number, c: number) => `${baseId}-r${String(r)}c${String(c)}`;
  const name = (x: number) => labels.names[x] ?? '';

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const ctrl = e.ctrlKey || e.metaKey;
    const moves: Record<string, [number, number] | undefined> = {
      ArrowUp: [active.r - 1, active.c],
      ArrowDown: [active.r + 1, active.c],
      ArrowLeft: [active.r, active.c - 1],
      ArrowRight: [active.r, active.c + 1],
      Home: ctrl ? [0, 0] : [active.r, 0],
      End: ctrl ? [k - 1, k - 1] : [active.r, k - 1],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      setActive({
        r: Math.max(0, Math.min(k - 1, move[0])),
        c: Math.max(0, Math.min(k - 1, move[1])),
      });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChoose(e.shiftKey ? [active.r, active.c] : [active.r]);
    }
  }

  function onClick(e: MouseEvent<HTMLDivElement>) {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
    if (!target) return;
    const r = Number(target.dataset.r);
    const c = target.dataset.c === undefined ? active.c : Number(target.dataset.c);
    setActive({ r, c });
    onChoose(e.shiftKey && target.dataset.c !== undefined ? [r, c] : [r]);
  }

  const a = groupCell(mix, active.r, active.c);
  const readout = G.matrix.readout(name(active.r), name(active.c), a.ties, a.possible, directed);

  return (
    <section className="groups__matrix" aria-labelledby={`${baseId}-heading`}>
      <h3 id={`${baseId}-heading`} className="member__heading">
        {G.matrix.heading}
      </h3>
      <ul className="matrix-key" aria-label={G.matrix.key}>
        <li>
          <span className="matrix-key__swatch groups__cell--impossible" aria-hidden="true" />
          {G.matrix.impossible}
        </li>
        <li>
          <span className="matrix-key__swatch shade-0" aria-hidden="true" />
          {G.matrix.none}
        </li>
        <li>
          <span className="matrix-key__ramp" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((v) => (
              <span key={v} className={`matrix-key__step shade-${String(v)}`} />
            ))}
          </span>
          <span className="num">{G.matrix.ramp}</span>
        </li>
        <li>{directed ? G.matrix.directed : G.matrix.symmetrised}</li>
      </ul>
      <p className="matrix__help" id={helpId}>
        {G.matrix.help}
      </p>
      <div className="groups__viewport">
        {/* The grid is operated from the keyboard through aria-activedescendant. */}
        <div
          ref={(el) => {
            place('--cols', k)(el);
          }}
          role="grid"
          aria-readonly="true"
          aria-label={G.matrix.gridLabel(layer)}
          aria-describedby={helpId}
          aria-rowcount={k + 1}
          aria-colcount={k + 1}
          aria-activedescendant={cellId(active.r, active.c)}
          tabIndex={0}
          className="groups__grid"
          onKeyDown={onKeyDown}
          onClick={onClick}
          data-testid="group-grid"
        >
          <div role="row" aria-rowindex={1} className="groups__row">
            <div role="columnheader" aria-colindex={1} className="groups__corner">
              {G.matrix.corner(directed)}
            </div>
            {mix.groups.map((g, c) => (
              <div
                key={g}
                role="columnheader"
                aria-colindex={c + 2}
                className={[
                  'groups__col-header',
                  c === active.c ? 'is-active' : '',
                  c === current ? 'is-chosen' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={name(c)}
              >
                <span className="matrix__col-label">{name(c)}</span>
              </div>
            ))}
          </div>
          {mix.groups.map((g, r) => (
            <div
              key={g}
              role="row"
              aria-rowindex={r + 2}
              aria-selected={r === current}
              className="groups__row"
            >
              <div
                role="rowheader"
                data-r={r}
                aria-colindex={1}
                className={[
                  'groups__row-header',
                  r === active.r ? 'is-active' : '',
                  r === current ? 'is-chosen' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={name(r)}
              >
                <span className="groups__name">{name(r)}</span>
              </div>
              {mix.groups.map((h, c) => {
                const cell = groupCell(mix, r, c);
                return (
                  <div
                    key={h}
                    data-r={r}
                    data-c={c}
                    id={cellId(r, c)}
                    role="gridcell"
                    aria-colindex={c + 2}
                    className={[
                      'groups__cell',
                      'num',
                      shareClass(cell.ties, cell.possible),
                      r === c ? 'groups__cell--within' : '',
                      r === active.r && c === active.c ? 'is-active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {cell.possible > 0 ? sharePercent(cell.ties, cell.possible) : '–'}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="matrix__position num" aria-live="polite" data-testid="group-readout">
        {readout}
      </p>
    </section>
  );
}

function GroupMap({
  mix,
  labels,
  directed,
  layer,
  current,
  onChoose,
}: PartProps & { directed: boolean; layer: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 });
  const theme = useMemo(() => readGroupMapTheme(), []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      const r = box.getBoundingClientRect();
      setSize({ width: r.width, height: r.height, dpr: window.devicePixelRatio || 1 });
    });
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
  }, []);

  const model = useMemo(
    () => groupMapModel(mix, directed, size, theme),
    [mix, directed, size, theme],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;
    canvas.width = Math.max(1, Math.round(size.width * size.dpr));
    canvas.height = Math.max(1, Math.round(size.height * size.dpr));
    const ctx = canvas.getContext('2d');
    if (ctx) paintGroupMap(ctx, model, theme, labels.names, current, size.dpr);
  }, [model, theme, labels, current, size]);

  const pairs = useMemo(() => {
    const out: { a: number; b: number; ties: number; possible: number }[] = [];
    const k = mix.groups.length;
    for (let a = 0; a < k; a++)
      for (let b = a + 1; b < k; b++) out.push({ a, b, ...pairCell(mix, a, b, directed) });
    return out;
  }, [mix, directed]);

  const pct = (share: number) => (Number.isFinite(share) ? formatShare(share) : '');
  return (
    <section className="groups__map" aria-labelledby={headingId}>
      <h3 id={headingId} className="member__heading">
        {G.map.heading}
      </h3>
      <div ref={boxRef} className="groups__stage">
        <canvas
          ref={canvasRef}
          className="groups__canvas"
          aria-hidden="true"
          data-testid="group-map"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const hit = groupAt(model, e.clientX - r.left, e.clientY - r.top, theme.gap);
            e.currentTarget.classList.toggle('groups__canvas--group', hit >= 0);
          }}
          onPointerUp={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const hit = groupAt(model, e.clientX - r.left, e.clientY - r.top, theme.gap);
            if (hit >= 0) onChoose(e.shiftKey && current >= 0 ? [current, hit] : [hit]);
          }}
        />
      </div>
      <ul className="matrix-key groups__key" aria-label={G.map.legend}>
        <li>{G.map.size}</li>
        {model.links.length > 0 && <li>{G.map.width(pct(model.minShare), pct(model.maxShare))}</li>}
        <li>{G.map.noLine}</li>
        <li>{G.map.chosen}</li>
        <li>{G.map.pointer}</li>
      </ul>
      {/* The group map's table alternative for screen readers (pointer-only canvas). */}
      <div className="visually-hidden">
        <table data-testid="group-map-table">
          <caption>
            {G.map.label(layer)} {G.map.caption}
          </caption>
          <thead>
            <tr>
              <th scope="col">{G.map.pair}</th>
              <th scope="col">{G.map.ties}</th>
              <th scope="col">{G.map.possible}</th>
              <th scope="col">{G.map.share}</th>
            </tr>
          </thead>
          <tbody>
            {pairs.length === 0 ? (
              <tr>
                <td colSpan={4}>{G.map.noLinks}</td>
              </tr>
            ) : (
              pairs.map((p) => (
                <tr key={`${String(p.a)}-${String(p.b)}`}>
                  <th scope="row">
                    {labels.names[p.a]}, {labels.names[p.b]}
                  </th>
                  <td>{p.ties}</td>
                  <td>{p.possible}</td>
                  <td>{sharePercent(p.ties, p.possible)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A share in the legend: as in the matrix cells. */
function formatShare(share: number): string {
  return sharePercent(share * 1e6, 1e6);
}

function GroupTable({ mix, labels, current, onChoose }: PartProps) {
  const captionId = useId();
  const k = mix.groups.length;
  const totalMembers = mix.perGroup.reduce((s, g) => s + g.size, 0);
  return (
    <section className="groups__table">
      <table className="member__table" aria-labelledby={captionId} data-testid="group-table">
        <caption id={captionId} className="field__label compare__caption">
          {G.table.caption(labels.attribute.toLowerCase())}
        </caption>
        <thead>
          <tr>
            <th scope="col">{G.table.group}</th>
            <th scope="col" className="numeric">
              {G.table.members}
            </th>
            <th scope="col" className="numeric">
              {G.table.inside}
            </th>
            <th scope="col" className="numeric">
              {G.table.leaving}
            </th>
            <th scope="col" className="numeric">
              {G.table.density}
            </th>
            <th scope="col" className="numeric">
              {G.table.ei}
            </th>
          </tr>
        </thead>
        <tbody>
          {mix.perGroup.map((g, x) => {
            const within = groupCell(mix, x, x);
            const name = labels.names[x] ?? g.group;
            return (
              <tr key={g.group} className={x === current ? 'is-chosen' : undefined}>
                <th scope="row">
                  <button
                    type="button"
                    className="link-button"
                    aria-pressed={x === current}
                    title={x === current ? G.table.chosen(name) : G.table.choose(name)}
                    onClick={() => {
                      onChoose([x]);
                    }}
                  >
                    {name}
                  </button>
                </th>
                <td className="numeric">{g.size}</td>
                <td className="numeric">{g.internal}</td>
                <td className="numeric">{g.external}</td>
                <td className="numeric">
                  {within.possible > 0 ? sharePercent(within.ties, within.possible) : '–'}
                </td>
                <td className="numeric">{signed(g.ei)}</td>
              </tr>
            );
          })}
          {k > 1 && (
            <tr>
              <th scope="row">{G.table.all}</th>
              <td className="numeric">{totalMembers}</td>
              <td className="numeric">{mix.internal}</td>
              <td className="numeric">{mix.external}</td>
              <td className="numeric" />
              <td className="numeric">{signed(mix.ei)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="field__help groups__note">{G.table.note}</p>
    </section>
  );
}
