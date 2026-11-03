// The engagement record in exports (build plan session 16): the brief on the report's cover, the
// assessment against the client's expectations, the action log and the outcomes, in the report
// and as a CSV file. Built from the export context, so the audience level's names (free text goes
// through `ctx.names.text`) and the signed-layer exclusion apply: under the exclusion, actions and
// expectations about negative ratings are left out, and the export says how many.

import { assessIntent } from '../../data/intent';
import type { ActionLink, Engagement, EngagementAction, Expectation } from '../../data/schema';
import { audienceLevelName } from '../copy/audience';
import { engagementCopy as E, verdictWord } from '../copy/engagement';
import { exportCopy } from '../copy/export';
import { mapCopy } from '../copy/map';
import { assertAllowed, groupSizes } from '../state/audience';
import { expectationData, intentInput, intentLayer } from '../state/engagement';
import { insightGroup } from '../state/insightGroup';
import { toCsv } from '../views/csv';
import type { ExportContext } from './context';
import type { Block, ReportSection } from './report';
import type { ExportFile } from './tables';

/** Rules about negative ratings, which the signed-layer exclusion leaves out (D105). */
const SIGNED_RULES = new Set(['negativeCluster', 'oneWayNegative']);

export function engagementFor(ctx: ExportContext): Engagement | null {
  return ctx.source.engagement ?? ctx.project.engagement ?? null;
}

function expectationExcluded(ctx: ExportContext, x: Expectation): boolean {
  return ctx.excludeSigned && x.link?.kind === 'question' && x.link.id === 'negative';
}

function actionExcluded(ctx: ExportContext, e: Engagement, a: EngagementAction): boolean {
  if (!ctx.excludeSigned || !a.link) return false;
  if (a.link.kind === 'observation') return SIGNED_RULES.has(a.link.rule);
  if (a.link.kind === 'expectation') {
    const id = a.link.id;
    const x = e.expectations.find((y) => y.id === id);
    return x !== undefined && expectationExcluded(ctx, x);
  }
  return false;
}

/** Whether a pair of groups may be shown at this level: both groups reach the minimum size at
 *  board and leadership level, and a workshop sees only pairs involving its team. */
function pairShown(ctx: ExportContext, attribute: string, a: string, b: string): boolean {
  const p = ctx.policy;
  if (p.groupsOnly) {
    const sizes = groupSizes(ctx.project, attribute);
    return (sizes.get(a) ?? 0) >= p.minGroupSize && (sizes.get(b) ?? 0) >= p.minGroupSize;
  }
  if (p.level === 'workshop' && p.attribute?.key === attribute && p.team !== null)
    return a === p.team || b === p.team;
  return true;
}

function linkText(ctx: ExportContext, e: Engagement, link: ActionLink | null): string {
  if (!link) return E.actions.noLink;
  if (link.kind === 'observation')
    return ctx.names.text(E.actions.observation(link.text, link.wave, ctx.wave.shown));
  if (link.kind === 'expectation') {
    const id = link.id;
    const x = e.expectations.find((y) => y.id === id);
    return ctx.names.text(E.actions.expectation(x?.text ?? ''));
  }
  return pairShown(ctx, link.attribute, link.a, link.b)
    ? E.actions.pair(link.a, link.b)
    : E.export.pairHidden;
}

export interface ActionRows {
  rows: string[][];
  leftOut: number;
}

/** The action log as rows: action, answers, owner, due, status, notes, created. */
export function actionRows(ctx: ExportContext): ActionRows {
  const e = engagementFor(ctx);
  if (!e) return { rows: [], leftOut: 0 };
  const kept = e.actions.filter((a) => !actionExcluded(ctx, e, a));
  return {
    leftOut: e.actions.length - kept.length,
    rows: kept.map((a) => [
      ctx.names.text(a.text),
      linkText(ctx, e, a.link),
      ctx.names.text(a.owner),
      a.due ?? '',
      E.actions.statuses[a.status],
      ctx.names.text(a.notes),
      a.created_at.slice(0, 10),
    ]),
  };
}

/** The action log as a CSV file, under both export settings and the audience level. */
export function actionLogCsv(ctx: ExportContext, now: Date): ExportFile | null {
  assertAllowed(ctx.policy, 'actions');
  const { rows, leftOut } = actionRows(ctx);
  if (rows.length === 0 && leftOut === 0) return null;
  const C = E.export.columns;
  const header = [C.action, C.answers, C.owner, C.due, C.status, C.notes, C.created];
  const out = [header, ...rows];
  if (leftOut > 0) out.push([E.export.leftOut(leftOut), '', '', '', '', '', '']);
  const suffix = exportCopy.suffix(
    ctx.anonymised,
    ctx.reanalysed,
    ctx.policy.level,
    ctx.wave.shown ? ctx.wave.wave : null,
  );
  return {
    fileName: exportCopy.files.actions(now.toISOString().slice(0, 10), suffix),
    text: toCsv(out),
  };
}

/** Lines for the report's cover: the business question, sponsor, boundary, who sees this level
 *  and the retention date, as the analyst wrote them, with names replaced as the level requires. */
export function briefLines(ctx: ExportContext): string[] {
  const e = engagementFor(ctx);
  if (!e) return [];
  const t = (s: string) => ctx.names.text(s.trim());
  const lines: string[] = [];
  if (e.question.trim()) lines.push(E.export.question(t(e.question)));
  if (e.sponsor.trim()) lines.push(E.export.sponsor(t(e.sponsor)));
  if (e.boundary.trim()) lines.push(E.export.boundary(t(e.boundary)));
  const who = e.governance.audiences[ctx.policy.level];
  if (who?.trim()) lines.push(E.export.seenBy(audienceLevelName(ctx.policy.level), t(who)));
  if (e.governance.retention_date) lines.push(E.export.retention(e.governance.retention_date));
  return lines;
}

/** "Against expectations": each expectation with what the data show, and the pairs of groups. */
export function expectationsSection(ctx: ExportContext): ReportSection | null {
  const e = engagementFor(ctx);
  if (!e) return null;
  const expectations = e.expectations.filter((x) => x.text.trim() && !expectationExcluded(ctx, x));
  const group = insightGroup(ctx.project);
  const layer = intentLayer(ctx.project, ctx.result);
  const input = group ? intentInput(ctx.project, ctx.result, layer, group.key) : null;
  const pairs =
    group && input
      ? assessIntent(e, group.key, input).filter((r) => pairShown(ctx, group.key, r.a, r.b))
      : [];
  if (expectations.length === 0 && pairs.length === 0) return null;
  const blocks: Block[] = [
    { kind: 'paragraph', text: E.export.expectationsIntro, tone: 'graphite' },
  ];
  expectations.forEach((x, i) => {
    blocks.push({
      kind: 'paragraph',
      lead: E.export.expectationLead(i + 1),
      text: ctx.names.text(x.text),
    });
    const link =
      x.link?.kind === 'pair' && !pairShown(ctx, x.link.attribute, x.link.a, x.link.b)
        ? null
        : x.link;
    for (const s of expectationData(
      ctx.project,
      ctx.result,
      link,
      ctx.names.of,
      ctx.policy.level !== 'analyst',
    ) ?? [])
      blocks.push({ kind: 'paragraph', text: s, small: true });
    if (x.notes.trim())
      blocks.push({
        kind: 'paragraph',
        lead: E.export.notesLead,
        text: ctx.names.text(x.notes),
        small: true,
      });
  });
  if (pairs.length > 0) {
    const label =
      layer === 'composite'
        ? mapCopy.controls.composite
        : (ctx.project.layers.find((l) => l.key === layer)?.label ?? layer);
    const view =
      ctx.result.view === 'directed'
        ? E.assessment.directed
        : E.assessment.mutual(mapCopy.controls[ctx.result.symmetrise].toLowerCase());
    blocks.push({ kind: 'heading', text: E.sections.intent });
    blocks.push({
      kind: 'paragraph',
      text: `${E.assessment.intro} ${E.assessment.layerLine(label.toLowerCase(), view)}`,
      small: true,
    });
    blocks.push({
      kind: 'table',
      columns: [
        { label: E.assessment.groups, numeric: false },
        { label: E.assessment.expected, numeric: false },
        { label: E.assessment.observed, numeric: true },
        { label: E.assessment.result, numeric: false },
      ],
      rows: pairs.map((r) => [
        E.assessment.pairRow(r.a, r.b),
        E.intent.levelShort[r.expected],
        r.possible > 0 ? E.assessment.observedCell(r.tied, r.possible, r.share) : '–',
        `${verdictWord(r.verdict)}${r.few ? ` ${E.assessment.few}` : ''}`,
      ]),
    });
  }
  return { title: E.sections.assessment, blocks };
}

/** "Agreed actions": the action log as a table. */
export function actionsSection(ctx: ExportContext): ReportSection | null {
  const { rows, leftOut } = actionRows(ctx);
  if (rows.length === 0 && leftOut === 0) return null;
  const C = E.export.columns;
  const blocks: Block[] = [{ kind: 'paragraph', text: E.actions.intro, tone: 'graphite' }];
  if (rows.length > 0)
    blocks.push({
      kind: 'table',
      columns: [
        { label: C.action, numeric: false },
        { label: C.answers, numeric: false },
        { label: C.owner, numeric: false },
        { label: C.due, numeric: false },
        { label: C.status, numeric: false },
      ],
      rows: rows.map((r) => r.slice(0, 5)),
    });
  if (leftOut > 0) blocks.push({ kind: 'paragraph', text: E.export.leftOut(leftOut), small: true });
  return { title: E.export.actionsHeading, blocks };
}

/** "Outcomes": what was seen against each criterion. */
export function outcomesSection(ctx: ExportContext): ReportSection | null {
  const e = engagementFor(ctx);
  const outcomes = e?.outcomes.filter((o) => o.assessment.trim()) ?? [];
  if (!e || outcomes.length === 0) return null;
  return {
    title: E.sections.outcomes,
    blocks: [
      { kind: 'paragraph', text: E.outcomes.intro, tone: 'graphite' },
      {
        kind: 'table',
        columns: [
          { label: E.outcomes.criterion, numeric: false },
          { label: E.outcomes.assessment, numeric: false },
          { label: E.outcomes.wave, numeric: false },
          { label: E.outcomes.date, numeric: false },
        ],
        rows: outcomes.map((o) => [
          ctx.names.text(o.criterion),
          ctx.names.text(o.assessment),
          o.wave === null ? '–' : E.outcomes.waveN(o.wave),
          o.date ?? '–',
        ]),
      },
    ],
  };
}
