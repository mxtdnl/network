// The workshop pack (build plan session 17): one section per group of the
// insight rules' grouping attribute (team by default), each prepared exactly as
// a team workshop is (build plan session 9): the group's own network, filtered
// to its members, named only if the group agreed and otherwise in codes, with
// no signed layer drawn; its row of the group connection matrix, other groups
// below the minimum size counted together or left out; questions for
// discussion; and a page of notes for the facilitator. Every section has its
// own export context, so Hide names, the signed-layer exclusion and the wave
// apply as to any other export. export/pdf.ts lays the pack out.

import { coveragePercent, percent } from '../copy/data';
import { exportCopy } from '../copy/export';
import { audienceCopy } from '../copy/audience';
import { packCopy as K } from '../copy/slides';
import { questionText, type InsightContext } from '../copy/insights';
import { audienceInsights, audiencePolicy, assertAllowed, groupSizes } from '../state/audience';
import { groupCell, groupMixing, pairCell } from '../map/groupModel';
import { exportContext, type Analyse, type ExportContext, type ExportRequest } from './context';
import type { MapDocument } from './document';
import { pictureExport, type ExportDeps } from './files';
import type { MapState } from './mapScene';
import type { Block } from './report';
import { refName } from './tables';
import { readPrintTheme, tokenLength } from './theme';

export interface PackSection {
  /** The group's value. */
  group: string;
  members: number;
  /** Members appear by name (the group agreed and names are not hidden). */
  named: boolean;
  layerName: string;
  /** The group's own network, as a team workshop sees it. */
  doc: MapDocument;
  /** The group's row of the group connection matrix. */
  row: Block[];
  /** Questions for discussion. */
  prompts: string[];
  /** Notes for the facilitator. */
  notes: Block[];
}

export interface WorkshopPack {
  title: string;
  subtitle: string;
  date: string;
  intro: string;
  /** Hide names and the exclusion, as on the report's cover. */
  cover: string[];
  sections: PackSection[];
}

/** Groups the pack has a section for: values of the team attribute with at least two members, in category order. */
export function packGroups(ctx: ExportContext): string[] {
  const attr = ctx.policy.attribute;
  if (!attr) return [];
  const sizes = groupSizes(ctx.project, attr.key);
  const categories = attr.categories ?? [];
  const order = [...categories, ...[...sizes.keys()].filter((v) => !categories.includes(v))];
  return order.filter((v) => (sizes.get(v) ?? 0) >= 2);
}

const fmt = (v: number) => (Number.isFinite(v) ? String(Math.round(v)) : '–');

/** The group's row of the group connection matrix, with small groups pooled or left out. */
export function groupRow(
  ctx: ExportContext,
): { block: Block; best: string | null; none: string[] } | null {
  const attr = ctx.policy.attribute;
  const team = ctx.policy.team;
  if (!attr || team === null) return null;
  const mix = groupMixing(ctx.result.refs[ctx.settings.layer], {
    kind: 'attribute',
    key: attr.key,
  });
  if (!mix) return null;
  const t = mix.groups.indexOf(team);
  if (t < 0) return null;
  const directed = ctx.result.view === 'directed';
  const C = K.columns;
  const min = ctx.policy.minGroupSize;
  const rows: string[][] = [];
  const within = groupCell(mix, t, t);
  rows.push([
    C.within,
    ...(directed ? [fmt(within.ties), fmt(within.ties)] : [fmt(within.ties)]),
    Number.isFinite(within.share) ? percent(within.share) : '–',
  ]);
  let best: { group: string; share: number } | null = null;
  const none: string[] = [];
  const pool = { given: 0, received: 0, ties: 0, possible: 0, members: 0 };
  mix.groups.forEach((g, h) => {
    if (h === t) return;
    const out = groupCell(mix, t, h);
    const back = groupCell(mix, h, t);
    const both = pairCell(mix, t, h, directed);
    const size = mix.perGroup[h]?.size ?? 0;
    if (size < min) {
      pool.given += out.ties;
      pool.received += back.ties;
      pool.ties += both.ties;
      pool.possible += both.possible;
      pool.members += size;
      return;
    }
    rows.push([
      g,
      ...(directed ? [fmt(out.ties), fmt(back.ties)] : [fmt(both.ties)]),
      Number.isFinite(both.share) ? percent(both.share) : '–',
    ]);
    if (both.ties === 0) none.push(g);
    else if (!best || both.share > best.share) best = { group: g, share: both.share };
  });
  if (pool.members >= min && pool.members > 0)
    rows.push([
      audienceCopy.otherGroups(pool.members),
      ...(directed ? [fmt(pool.given), fmt(pool.received)] : [fmt(pool.ties)]),
      pool.possible > 0 ? percent(pool.ties / pool.possible) : '–',
    ]);
  return {
    block: {
      kind: 'table',
      columns: [
        { label: C.group, numeric: false },
        ...(directed
          ? [
              { label: C.given, numeric: true },
              { label: C.received, numeric: true },
            ]
          : [{ label: C.ties, numeric: true }]),
        { label: C.share, numeric: true },
      ],
      rows,
    },
    best: (best as { group: string } | null)?.group ?? null,
    none,
  };
}

/** One group's section, from its workshop-level export context. */
export function packSection(
  ctx: ExportContext,
  state: MapState,
  deps: Pick<ExportDeps, 'tokens' | 'measure'>,
): PackSection {
  const team = ctx.policy.team ?? '';
  const layer = refName(ctx, ctx.settings.layer);
  const directed = ctx.result.view === 'directed';
  // The picture is fitted to an A4 landscape page below its heading lines.
  const print = readPrintTheme(deps.tokens);
  const picture = pictureExport(ctx, state, deps, '', {
    width: print.pageHeight - print.margin * 2 - legendRoom(deps),
    height: print.pageWidth - print.margin * 2 - print.heading.line * 2 - print.body.line * 2,
  });
  const row = groupRow(ctx);
  const members = (ctx.policy.shown ?? new Set()).size;
  const insightCtx: InsightContext = {
    layerLabel: (ref) => refName(ctx, ref),
    attributeLabel: (key) =>
      ctx.project.attribute_definitions.find((a) => a.key === key)?.label ?? key,
  };
  // Questions: the group's own ties, its ties with others, the rules about it, then general ones.
  const P = K.prompts;
  const prompts: string[] = [];
  const attr = ctx.policy.attribute;
  const mix = attr
    ? groupMixing(ctx.result.refs[ctx.settings.layer], { kind: 'attribute', key: attr.key })
    : null;
  const t = mix ? mix.groups.indexOf(team) : -1;
  if (mix && t >= 0) {
    const within = groupCell(mix, t, t);
    if (Number.isFinite(within.share)) prompts.push(P.within(percent(within.share)));
  }
  if (row?.best) prompts.push(P.outside(row.best));
  if (row && row.none.length > 0) prompts.push(P.none(listOf(row.none)));
  for (const outcome of audienceInsights(ctx.source, ctx.result.insights, ctx.policy))
    for (const o of outcome.observations) prompts.push(questionText(o, insightCtx));
  prompts.push(...P.general);

  // Notes for the facilitator.
  const N = K.notes;
  const cov = ctx.result.coverage;
  const coverage =
    cov && Number.isFinite(cov.rate)
      ? cov.belowThreshold
        ? N.coverageLow(coveragePercent(cov.rate, cov.threshold), percent(cov.threshold))
        : N.coverageFine(coveragePercent(cov.rate, cov.threshold))
      : '';
  const shown = ctx.policy.shown ?? new Set<string>();
  const silent = ctx.project.members.filter(
    (m, i) => shown.has(m.id) && ctx.result.ratingFlags[i] === 'gaveNoRatings',
  ).length;
  const notes: Block[] = [
    { kind: 'paragraph', text: N.purpose },
    { kind: 'paragraph', text: N.before(members, coverage).trim() },
    ...(silent > 0 ? [{ kind: 'paragraph' as const, text: N.noRatings(silent) }] : []),
    { kind: 'paragraph', text: ctx.policy.codes ? N.codes : N.names },
    { kind: 'paragraph', text: N.signed },
    { kind: 'heading', text: N.runningHeading },
    ...N.running.map((text): Block => ({ kind: 'paragraph', text })),
  ];
  return {
    group: team,
    members,
    named: !ctx.policy.codes,
    layerName: layer,
    doc: picture.doc,
    row: row
      ? [{ kind: 'paragraph', text: K.rowIntro(layer, directed), tone: 'graphite' }, row.block]
      : [{ kind: 'paragraph', text: K.noRow }],
    prompts,
    notes,
  };
}

/** Room the legend column and the gap beside it take on the page. */
function legendRoom(deps: Pick<ExportDeps, 'tokens'>): number {
  return (
    tokenLength(deps.tokens, '--export-legend-width') + tokenLength(deps.tokens, '--export-gap')
  );
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

export interface PackExport {
  fileName: string;
  bytes: Uint8Array;
  pack: WorkshopPack;
  pages: number;
  substituted: string[];
}

/**
 * The pack for every group (analyst level) or for the workshop's own team
 * (workshop level). Each group gets a workshop-level export context of its own.
 */
export async function buildPack(
  request: ExportRequest,
  base: ExportContext,
  state: MapState,
  deps: ExportDeps,
  analyse: Analyse,
): Promise<WorkshopPack> {
  assertAllowed(base.policy, 'pack');
  const groups =
    base.policy.level === 'workshop' && base.policy.team !== null
      ? [base.policy.team]
      : packGroups(base);
  if (groups.length === 0) throw new Error(K.noGroups);
  const sections: PackSection[] = [];
  for (const team of groups) {
    const ctx = await exportContext(
      {
        ...request,
        audience: { level: 'workshop', team, member: null },
        compareWaves: false,
      },
      analyse,
    );
    sections.push(packSection(ctx, state, deps));
  }
  const date = deps.now.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const attribute = base.policy.attribute?.label ?? '';
  // The pack is handed to the groups, so its title names no member: anyone named is "a colleague".
  const nobody = audiencePolicy(
    base.source,
    { level: 'board', team: null, member: null },
    request.anonymise,
  );
  return {
    title: nobody.names.text(base.project.meta.title),
    subtitle: K.subtitle(sections.length, attribute),
    date: K.date(date),
    intro: K.intro,
    cover: [
      ...(request.anonymise ? [K.coverCodes] : []),
      ...(base.excludeSigned ? [K.coverExcluded] : []),
    ],
    sections,
  };
}

export async function packExport(
  request: ExportRequest,
  base: ExportContext,
  state: MapState,
  deps: ExportDeps,
  analyse: Analyse,
): Promise<PackExport> {
  const pack = await buildPack(request, base, state, deps, analyse);
  const { packPdf } = await import('./pdf');
  const out = await packPdf({
    pack,
    print: readPrintTheme(deps.tokens),
    loadFont: deps.loadFont,
    inflate: deps.inflate,
    now: deps.now,
    padding: tokenLength(deps.tokens, '--export-padding'),
  });
  const date = deps.now.toISOString().slice(0, 10);
  return {
    fileName: K.file(
      `${date}${exportCopy.suffix(base.anonymised, base.reanalysed, base.policy.level, base.wave.shown ? base.wave.wave : null)}`,
    ),
    bytes: out.bytes,
    pack,
    pages: out.pages,
    substituted: out.substituted,
  };
}

/** Every piece of text in the pack (tests check it for names and excluded layers). */
export function packText(pack: WorkshopPack): string[] {
  const blocks = (bs: readonly Block[]) =>
    bs.flatMap((b) =>
      b.kind === 'table'
        ? [...b.columns.map((c) => c.label), ...b.rows.flat()]
        : b.kind === 'paragraph'
          ? [...(b.lead ? [b.lead] : []), b.text]
          : [b.text],
    );
  return [
    pack.title,
    pack.subtitle,
    pack.date,
    pack.intro,
    ...pack.cover,
    ...pack.sections.flatMap((s) => [
      s.group,
      s.layerName,
      ...blocks(s.row),
      ...s.prompts,
      ...blocks(s.notes),
    ]),
  ];
}
