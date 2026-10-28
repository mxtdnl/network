import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../../data/schema';
import { Icon } from '../components/Icon';
import { audienceCopy as A } from '../copy/audience';
import { coveragePercent, percent } from '../copy/data';
import { sharePercent } from '../copy/groups';
import { mapCopy } from '../copy/map';
import { groupLegendLines } from '../export/groupDocument';
import {
  groupMapModel,
  groupMixing,
  pairCell,
  paintGroupMap,
  readGroupMapTheme,
  type GroupMapTheme,
} from '../map/groupModel';
import type { MapData } from '../map/useMapModel';
import {
  audienceGroups,
  viewGrouping,
  type AudienceGroups,
  type AudiencePolicy,
} from '../state/audience';

// Presentation steps for audience levels (build plan session 9). A board or a
// leadership team sees each saved view as its group picture: one node per
// group, small groups pooled or left out, with its key and, for a leadership
// team, the roles between groups. A team workshop sees the view's map for its
// team, with its ties to other groups counted beside it.

const layerLabel = (project: Project, ref: string) => {
  if (ref === 'composite') return mapCopy.controls.composite;
  const key = ref.replace(/[+-]$/, '');
  return project.layers.find((l) => l.key === key)?.label ?? key;
};

/** The group picture of a view, for a board or a leadership team. */
export function GroupStep({ data, policy }: { data: MapData; policy: AudiencePolicy }) {
  const { project, result, settings } = data;
  const directed = result.view === 'directed';
  const groups = audienceGroups(
    project,
    result.refs[settings.layer],
    directed,
    viewGrouping(project, settings),
    policy,
  );
  const [maxShare, setMaxShare] = useState(0);
  const lines = groupLegendLines({
    project,
    insights: result.insights,
    policy,
    groups,
    layerName: layerLabel(project, settings.layer),
    maxShare,
    layerLabel: (ref) => layerLabel(project, ref),
  });
  return (
    <div className="presentation__body">
      <div className="presentation__map">
        {groups ? (
          <GroupCanvas groups={groups} onModel={setMaxShare} />
        ) : (
          <p className="map__message">{A.board.key.noLines}</p>
        )}
        {groups && <PairsTable groups={groups} />}
      </div>
      <aside
        className="presentation__legend"
        aria-label={mapCopy.legend.heading}
        // The key scrolls when a leadership team's roles are many, so it can take focus (as D114).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        <div className="presentation__key">
          {lines.map((l, k) =>
            l.heading ? (
              <h2 key={k} className="presentation__key-heading">
                {l.text}
              </h2>
            ) : (
              <p key={k}>{l.text}</p>
            ),
          )}
        </div>
        {result.coverage?.belowThreshold && (
          <p className="presentation__coverage" role="note">
            <Icon name="warning" />
            {mapCopy.coverage(
              coveragePercent(result.coverage.rate, result.coverage.threshold),
              percent(result.coverage.threshold),
            )}
          </p>
        )}
      </aside>
    </div>
  );
}

function GroupCanvas({
  groups,
  onModel,
}: {
  groups: AudienceGroups;
  onModel: (maxShare: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 });
  const [theme, setTheme] = useState<GroupMapTheme | null>(null);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // The presentation raises --map-group-size, so the theme is read from inside it.
    setTheme(readGroupMapTheme(box));
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
    () => (theme ? groupMapModel(groups.mix, groups.directed, size, theme) : null),
    [groups, size, theme],
  );
  useEffect(() => {
    if (model) onModel(model.maxShare);
  }, [model, onModel]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !model || !theme || size.width === 0) return;
    canvas.width = Math.max(1, Math.round(size.width * size.dpr));
    canvas.height = Math.max(1, Math.round(size.height * size.dpr));
    const ctx = canvas.getContext('2d');
    if (ctx) paintGroupMap(ctx, model, theme, groups.names, -1, size.dpr);
  }, [model, theme, groups, size]);
  return (
    <div ref={boxRef} className="presentation__groups">
      <canvas ref={canvasRef} className="presentation__group-canvas" aria-hidden="true" />
    </div>
  );
}

/** The group picture's alternative for screen readers: every pair of groups with its ties. */
function PairsTable({ groups }: { groups: AudienceGroups }) {
  const T = A.board.pairsTable;
  const k = groups.mix.groups.length;
  const rows: { a: number; b: number; ties: number; possible: number }[] = [];
  for (let a = 0; a < k; a++)
    for (let b = a; b < k; b++) rows.push({ a, b, ...pairCell(groups.mix, a, b, groups.directed) });
  return (
    <div className="visually-hidden">
      <table>
        <caption>{A.board.pairs}</caption>
        <thead>
          <tr>
            <th scope="col">{T.from}</th>
            <th scope="col">{T.to}</th>
            <th scope="col">{T.ties}</th>
            <th scope="col">{T.possible}</th>
            <th scope="col">{T.share}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${String(r.a)}-${String(r.b)}`}>
              <th scope="row">{groups.names[r.a]}</th>
              <td>{groups.names[r.b]}</td>
              <td>{r.ties}</td>
              <td>{r.possible}</td>
              <td>{sharePercent(r.ties, r.possible)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A workshop team's ties with each other group, counted both ways: groups of at
 * least the minimum size by name, smaller ones pooled when together they reach
 * it (otherwise left out). The team itself is never pooled.
 */
export function workshopOutside(
  data: MapData,
  policy: AudiencePolicy,
): { group: string; ties: number }[] {
  const attr = policy.attribute;
  if (!attr || policy.team === null) return [];
  const mix = groupMixing(data.result.refs[data.settings.layer], {
    kind: 'attribute',
    key: attr.key,
  });
  if (!mix) return [];
  const directed = data.result.view === 'directed';
  const t = mix.groups.indexOf(policy.team);
  if (t < 0) return [];
  const out: { group: string; ties: number }[] = [];
  let pooledTies = 0;
  let pooledMembers = 0;
  mix.groups.forEach((g, h) => {
    if (h === t) return;
    const ties = pairCell(mix, t, h, directed).ties;
    const size = mix.perGroup[h]?.size ?? 0;
    if (size >= policy.minGroupSize) {
      if (ties > 0) out.push({ group: g, ties });
    } else {
      pooledTies += ties;
      pooledMembers += size;
    }
  });
  if (pooledMembers >= policy.minGroupSize && pooledTies > 0)
    out.push({ group: A.otherGroups(pooledMembers), ties: pooledTies });
  return out;
}

/** Beside a team workshop's map: whether members are named, and the team's ties with other groups. */
export function WorkshopNotes({ data, policy }: { data: MapData; policy: AudiencePolicy }) {
  const W = A.workshop;
  const outside = workshopOutside(data, policy);
  return (
    <div className="presentation__key">
      <p>{policy.teamNamed ? W.named : W.codes}</p>
      <p>{W.signed}</p>
      <h2 className="presentation__key-heading">{W.outside}</h2>
      <p>{W.outsideHelp}</p>
      {outside.length === 0 ? (
        <p>{W.noOutside}</p>
      ) : (
        <ul className="presentation__key-list">
          {outside.map((x) => (
            <li key={x.group}>{W.outsideRow(x.group, x.ties)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
