// What changed between two waves in the exports (build plan session 15): the
// change CSV and the report's change section. Both read the export context's
// comparison, which was analysed under the signed-layer exclusion, and name
// members through the context's names layer under the audience policy: a
// board or leadership team sees the network and pairs of groups that reach the
// minimum size in both waves, a workshop its own team, and the analyst
// everything, down to each tie.

import { changeCopy } from '../copy/change';
import { exportCopy } from '../copy/export';
import { formatValue, mapCopy } from '../copy/map';
import { percent } from '../copy/data';
import { assertAllowed } from '../state/audience';
import { audienceChange } from '../state/change';
import { toCsv } from '../views/csv';
import type { ExportContext } from './context';
import type { Block } from './report';
import type { ExportFile } from './tables';

const W = changeCopy.csv;
const cell = (v: number) => (Number.isFinite(v) ? String(v) : '');
const diff = (b: number, a: number) => (Number.isFinite(a - b) ? String(a - b) : '');

/** Which pairs of groups, ties and members the export's audience may see. */
function scope(ctx: ExportContext) {
  const run = ctx.change;
  const { policy } = ctx;
  // Group sizes in each wave, as each wave's analysis counted them.
  const sizes = run ? [run.change.before.groupSizes, run.change.after.groupSizes] : [];
  const bigGroup = (g: string) => sizes.every((s) => (s[g] ?? 0) >= policy.minGroupSize);
  return {
    group: (from: string, to: string) =>
      policy.level === 'analyst'
        ? true
        : policy.level === 'workshop'
          ? from === policy.team || to === policy.team
          : bigGroup(from) && bigGroup(to),
    member: (id: string) =>
      policy.level === 'analyst'
        ? true
        : policy.level === 'workshop'
          ? !!policy.shown?.has(id)
          : false,
  };
}

const layerName = (ctx: ExportContext, ref: string) =>
  ref === 'composite'
    ? mapCopy.controls.composite
    : (ctx.project.layers.find((l) => l.key === ref)?.label ?? ref);

/** The change CSV: network, groups, and (as the audience allows) ties and members. Null without two waves. */
export function changeCsv(ctx: ExportContext): ExportFile | null {
  assertAllowed(ctx.policy, 'change');
  const run = ctx.change;
  if (!run) return null;
  const { change, pair } = run;
  const M = W.measures;
  const see = scope(ctx);
  const names = ctx.names;
  const rows: string[][] = [[...W.columns]];
  const add = (
    section: string,
    measure: string,
    before: string,
    after: string,
    delta: string,
    extra: { group?: string; other?: string; member?: string; otherMember?: string } = {},
  ) => {
    rows.push([
      section,
      measure,
      extra.group ?? '',
      extra.other ?? '',
      extra.member ?? '',
      extra.otherMember ?? '',
      before,
      after,
      delta,
    ]);
  };
  const net = W.network;
  const view =
    change.view === 'directed'
      ? exportCopy.csv.directed
      : exportCopy.csv.symmetrised(exportCopy.csv.rules[change.symmetrise]);
  add(net, M.waves, String(pair.before), String(pair.after), '');
  add(net, M.layer, layerName(ctx, run.ref), layerName(ctx, run.ref), '');
  add(net, M.view, view, view, '');
  add(net, M.reportable, change.reportable ? W.yes : W.no, '', '');
  const { before: b, after: a } = change;
  add(net, M.members, cell(b.members), cell(a.members), diff(b.members, a.members));
  add(net, M.coverage, cell(b.coverage), cell(a.coverage), diff(b.coverage, a.coverage));
  add(net, M.ties, cell(b.ties), cell(a.ties), diff(b.ties, a.ties));
  add(net, M.density, cell(b.density), cell(a.density), diff(b.density, a.density));
  if (change.group) add(net, M.ei, cell(b.ei), cell(a.ei), diff(b.ei, a.ei));
  add(net, M.load, cell(b.load), cell(a.load), diff(b.load, a.load));
  add(
    net,
    M.bridges,
    cell(b.localBridges),
    cell(a.localBridges),
    diff(b.localBridges, a.localBridges),
  );
  add(net, M.left, cell(change.members.left.length), '', '');
  add(net, M.joined, '', cell(change.members.joined.length), '');
  add(net, M.leftTies, cell(change.leftTies), '', '');
  add(net, M.joinedTies, '', cell(change.joinedTies), '');
  for (const k of [
    'gained',
    'lost',
    'strengthened',
    'weakened',
    'steady',
    'notComparable',
  ] as const)
    add(net, changeCopy.kinds[k], '', '', cell(change.counts[k]));
  if (ctx.policy.level === 'analyst')
    for (const [w, list] of [
      [b.wave, b.cutPoints],
      [a.wave, a.cutPoints],
    ] as const)
      for (const id of list)
        add(net, M.cutPoints, w === b.wave ? W.yes : '', w === a.wave ? W.yes : '', '', {
          member: names.of(id),
        });

  for (const p of change.groupPairs) {
    if (!see.group(p.from, p.to)) continue;
    const g = { group: p.from, other: p.to };
    add(
      W.groups,
      M.groupTies,
      cell(p.before?.ties ?? NaN),
      cell(p.after?.ties ?? NaN),
      diff(p.before?.ties ?? NaN, p.after?.ties ?? NaN),
      g,
    );
    add(
      W.groups,
      M.groupDensity,
      cell(p.before?.density ?? NaN),
      cell(p.after?.density ?? NaN),
      diff(p.before?.density ?? NaN, p.after?.density ?? NaN),
      g,
    );
  }

  for (const t of change.ties) {
    if (!see.member(t.from) || !see.member(t.to)) continue;
    add(W.tie, changeCopy.kinds[t.kind], cell(t.before), cell(t.after), diff(t.before, t.after), {
      member: names.of(t.from),
      otherMember: names.of(t.to),
    });
  }
  for (const m of change.perMember) {
    if (!see.member(m.id)) continue;
    const member = { member: names.of(m.id) };
    add(
      W.member,
      M.received,
      cell(m.received[0]),
      cell(m.received[1]),
      diff(m.received[0], m.received[1]),
      member,
    );
    if (Number.isFinite(m.given[0]))
      add(
        W.member,
        M.given,
        cell(m.given[0]),
        cell(m.given[1]),
        diff(m.given[0], m.given[1]),
        member,
      );
  }
  // The file names both waves, so the suffix leaves the wave out.
  const base = change.view === 'directed' ? 'directed' : `mutual-${change.symmetrise}`;
  const slug = `${base}${exportCopy.suffix(ctx.anonymised, ctx.reanalysed, ctx.policy.level, null)}`;
  return {
    fileName: exportCopy.files.change(pair.before, pair.after, slug),
    text: toCsv(rows),
  };
}

/** The report's change section, or null without two waves. */
export function changeSection(ctx: ExportContext): { title: string; blocks: Block[] } | null {
  const run = ctx.change;
  if (!run) return null;
  const { change, pair } = run;
  const R = changeCopy.report;
  const named = ctx.policy.level === 'analyst';
  const blocks: Block[] = [
    {
      kind: 'paragraph',
      text: R.layer(layerName(ctx, run.ref), changeCopy.view(change.view, change.symmetrise)),
      tone: 'graphite',
    },
    ...changeCopy
      .summary(change, named ? ctx.names.of : null)
      .map((text): Block => ({ kind: 'paragraph', text })),
  ];
  if (run.observations.withheld) {
    blocks.push({ kind: 'warning', text: changeCopy.withheld(change) });
  } else {
    const items = audienceChange(run, ctx.policy);
    blocks.push({ kind: 'heading', text: changeCopy.questions });
    if (items.length === 0) blocks.push({ kind: 'paragraph', text: changeCopy.noObservations });
    for (const o of items) {
      blocks.push({ kind: 'paragraph', text: changeCopy.saw(o, change, ctx.names.of) });
      blocks.push({
        kind: 'paragraph',
        lead: changeCopy.questions,
        text: changeCopy.question(o, change, ctx.names.of),
      });
    }
  }
  const see = scope(ctx);
  const pairs = change.groupPairs.filter((p) => p.before && p.after && see.group(p.from, p.to));
  if (pairs.length > 0) {
    const directed = change.view === 'directed';
    blocks.push({ kind: 'heading', text: changeCopy.matrix.title });
    blocks.push({
      kind: 'table',
      columns: [
        { label: directed ? exportCopy.csv.from : exportCopy.csv.group, numeric: false },
        { label: directed ? exportCopy.csv.to : exportCopy.csv.otherGroup, numeric: false },
        { label: changeCopy.waveOption(pair.before), numeric: true },
        { label: changeCopy.waveOption(pair.after), numeric: true },
        { label: changeCopy.report.points, numeric: true },
      ],
      rows: pairs.map((p) => [
        p.from,
        p.to,
        `${formatValue(p.before?.ties ?? NaN)} (${percent(p.before?.density ?? NaN)})`,
        `${formatValue(p.after?.ties ?? NaN)} (${percent(p.after?.density ?? NaN)})`,
        changeCopy.matrix.points((p.after?.density ?? NaN) - (p.before?.density ?? NaN)),
      ]),
    });
  }
  blocks.push({ kind: 'paragraph', text: changeCopy.thresholds, tone: 'graphite', small: true });
  blocks.push({ kind: 'paragraph', text: changeCopy.regression, tone: 'graphite', small: true });
  return { title: R.heading(pair.before, pair.after), blocks };
}
