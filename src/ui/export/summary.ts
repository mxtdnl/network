// The executive summary's draft (build plan session 10; spec §11): three to
// five group-level headlines drawn from the structured observations of the
// insight rules, as the audience level may see them, by fixed rules and
// templates. No language model is used, so no data leaves the browser
// (spec §2, §10). This module chooses and orders the headlines and gathers
// their figures; ui/copy/summary.ts writes them (D9). The analyst edits the
// draft before export (SummaryEditor), and the edit is saved with the project.

import { isCategorical, type AttributeKey } from '../../data/schema';
import type { InsightContext } from '../copy/insights';
import { audienceLine, headlineText, summaryCopy, type HeadlineText } from '../copy/summary';
import { refName } from './tables';
import type { InsightOutcome, Observation } from '../engineClient';
import { audienceInsights } from '../state/audience';
import { insightGroup } from '../state/insightGroup';
import type { ExportContext } from './context';

/** Headlines a summary aims for, and at most. */
export const SUMMARY_RULES = {
  minHeadlines: 3,
  maxHeadlines: 5,
  /** Groups that work mostly within themselves, at most. */
  maxGroups: 2,
  /** Further pairs of groups quoted beside a formal–informal headline. */
  morePairs: 3,
  /** The between-group headline is drafted when the E-I index is at or below this… */
  mixingInward: -0.2,
  /** …or at or above this. */
  mixingOutward: 0.2,
} as const;

export interface GroupFacts {
  kind: 'group';
  attribute: AttributeKey;
  group: string;
  size: number;
  /** Most ties stay within the group (silos). */
  inward?: { ref: string; internal: number; external: number; ei: number; alsoPeripheral: number };
  /** The group's ties with others are held by a few of its members (only routes). */
  gateways?: {
    ref: string;
    members: number;
    ties: number;
    others: { group: string; count: number }[];
  };
  /** Demand within the group falls on a few of its members (concentrated demand). */
  demand?: { ref: string; top: number; share: number; even: number; received: number };
}

export interface PairFacts {
  kind: 'formalOnly' | 'informalOnly';
  a: string;
  b: string;
  pairs: number;
  total: number;
  share: number;
  directed: boolean;
  /** Further pairs of groups the rule found, largest share first. */
  more: { a: string; b: string; share: number }[];
}

export interface OneWayFacts {
  kind: 'oneWayNegative';
  ref: string;
  count: number;
  negative: number;
  notRated: number;
  pairs: { from: string; to: string; count: number }[];
}

/** Routes across the network that run through a few members (analyst and workshop only). */
export interface RoutesFacts {
  kind: 'routes';
  /** Potential brokers found. */
  brokers: number;
  /** An attribute value most of them share. */
  shared: { attribute: AttributeKey; value: string; count: number } | null;
  /** The largest number of colleagues one member alone links to the rest. */
  cutOff: number;
  /** The group of the members cut off, when they share one. */
  cutOffGroup: string | null;
}

/** Network-wide demand falling on a few members (analyst and workshop only). */
export interface LoadFacts {
  kind: 'load';
  ref: string;
  top: number;
  share: number;
  even: number;
  received: number;
}

/** Ties within and between groups across the network, from the group mixing. */
export interface MixingFacts {
  kind: 'mixing';
  attribute: AttributeKey;
  ref: string;
  internal: number;
  external: number;
  ei: number;
  /** Share of possible pairs whose members are in different groups. */
  possibleBetween: number;
}

export type HeadlineFacts =
  GroupFacts | PairFacts | OneWayFacts | RoutesFacts | LoadFacts | MixingFacts;

export interface DraftHeadline {
  /** Stable across redrafts of the same analysis: the kind and the groups it is about. */
  id: string;
  facts: HeadlineFacts;
}

const n = (o: Observation, k: string) => o.evidence[k] ?? NaN;

function headlineId(f: HeadlineFacts): string {
  switch (f.kind) {
    case 'group':
      return `group:${f.attribute}=${f.group}`;
    case 'formalOnly':
    case 'informalOnly':
      return `${f.kind}:${f.a}|${f.b}`;
    case 'oneWayNegative':
    case 'load':
      return `${f.kind}:${f.ref}`;
    case 'mixing':
      return `mixing:${f.attribute}`;
    case 'routes':
      return 'routes';
  }
}

/** The members named share one group (by the rules' attribute), or null. */
function sharedGroup(ctx: ExportContext, ids: readonly string[], key: AttributeKey | undefined) {
  if (!key || ids.length === 0) return null;
  const values = new Set(
    ids.map((id) => ctx.project.members.find((m) => m.id === id)?.attributes[key] ?? null),
  );
  const [only] = [...values];
  return values.size === 1 && typeof only === 'string' ? only : null;
}

/**
 * The observations, as the audience may see them and without the rules on
 * signed layers when those are left out, turned into headlines in order of
 * priority, at most `maxHeadlines`.
 */
export function draftHeadlines(ctx: ExportContext): DraftHeadline[] {
  const { project, result, policy } = ctx;
  if (policy.level === 'oneToOne') return [];
  const outcomes: InsightOutcome[] = audienceInsights(ctx.source, result.insights, policy).filter(
    (o) => !(ctx.excludeSigned && (o.rule === 'negativeCluster' || o.rule === 'oneWayNegative')),
  );
  const of = (rule: InsightOutcome['rule']) =>
    outcomes.find((o) => o.rule === rule)?.observations ?? [];
  const attr = insightGroup(project);
  const sizeOf = (key: AttributeKey, value: string) =>
    project.members.filter((m) => m.attributes[key] === value).length;

  // Groups: silos, a group's only routes and demand within a group, one headline per group.
  const groups = new Map<string, GroupFacts>();
  const groupFor = (o: Observation): GroupFacts | null => {
    const g = o.group;
    if (!g) return null;
    const id = `${g.attribute}=${g.value}`;
    let f = groups.get(id);
    if (!f) {
      f = {
        kind: 'group',
        attribute: g.attribute,
        group: g.value,
        size: sizeOf(g.attribute, g.value),
      };
      groups.set(id, f);
    }
    return f;
  };
  for (const o of of('silo')) {
    const f = groupFor(o);
    if (f)
      f.inward = {
        ref: o.ref,
        internal: n(o, 'internal'),
        external: n(o, 'external'),
        ei: n(o, 'ei'),
        alsoPeripheral: o.evidence.alsoPeripheral ?? 0,
      };
  }
  for (const o of of('onlyRoutes')) {
    if (o.evidence.cutPoint === 1) continue;
    const f = groupFor(o);
    if (f)
      f.gateways = {
        ref: o.ref,
        members: n(o, 'gateways'),
        ties: n(o, 'ties'),
        others: (o.groups ?? []).map((x) => ({ group: x.other, count: x.count })),
      };
  }
  for (const o of of('concentratedDemand')) {
    if (!o.group) continue;
    const f = groupFor(o);
    if (f)
      f.demand = {
        ref: o.ref,
        top: n(o, 'top'),
        share: n(o, 'share'),
        even: n(o, 'even'),
        received: n(o, 'received'),
      };
  }
  // Inward groups first, the lowest E-I first; then groups with gateways or demand only.
  const groupList = [...groups.values()].sort(
    (a, b) =>
      (a.inward?.ei ?? Infinity) - (b.inward?.ei ?? Infinity) ||
      b.size - a.size ||
      a.group.localeCompare(b.group),
  );

  const pairFacts = (kind: 'formalOnly' | 'informalOnly'): PairFacts | null => {
    const obs = of(kind)
      .filter((o) => o.group)
      .sort((x, y) => n(y, 'share') - n(x, 'share') || n(y, 'pairs') - n(x, 'pairs'));
    const [top, ...rest] = obs;
    if (!top?.group) return null;
    return {
      kind,
      a: top.group.value,
      b: top.group.other ?? top.group.value,
      pairs: n(top, 'pairs'),
      total: n(top, 'total'),
      share: n(top, 'share'),
      directed: n(top, 'directed') === 1,
      more: rest.map((o) => ({
        a: o.group?.value ?? '',
        b: o.group?.other ?? o.group?.value ?? '',
        share: n(o, 'share'),
      })),
    };
  };

  const oneWay: OneWayFacts[] = of('oneWayNegative').map((o) => ({
    kind: 'oneWayNegative',
    ref: o.ref,
    count: n(o, 'count'),
    negative: n(o, 'negative'),
    notRated: o.evidence.notRated ?? 0,
    pairs: (o.groups ?? []).map((g) => ({ from: g.value, to: g.other, count: g.count })),
  }));

  // Member-level rules, at levels that may see them, as counts: never names.
  let routes: RoutesFacts | null = null;
  if (!policy.groupsOnly) {
    const brokers = of('brokers')[0];
    const cut = of('onlyRoutes')
      .filter((o) => o.evidence.cutPoint === 1)
      .sort((x, y) => n(y, 'cutOff') - n(x, 'cutOff'))[0];
    if (brokers || cut) {
      // Who a cut point cuts off is in the view's highlight, after the cut point itself.
      const cutOffIds = cut ? cut.view.highlight.filter((id) => !cut.members.includes(id)) : [];
      routes = {
        kind: 'routes',
        brokers: brokers?.members.length ?? 0,
        shared: brokers?.shared?.[0] ?? null,
        cutOff: cut ? n(cut, 'cutOff') : 0,
        cutOffGroup: cut ? sharedGroup(ctx, cutOffIds, attr?.key) : null,
      };
    }
  }
  const load: LoadFacts[] = policy.groupsOnly
    ? []
    : of('concentratedDemand')
        .filter((o) => !o.group)
        .map((o) => ({
          kind: 'load',
          ref: o.ref,
          top: n(o, 'top'),
          share: n(o, 'share'),
          even: n(o, 'even'),
          received: n(o, 'received'),
        }));

  const out: HeadlineFacts[] = [
    ...groupList.slice(0, SUMMARY_RULES.maxGroups),
    ...[pairFacts('formalOnly'), pairFacts('informalOnly')].filter(
      (f): f is PairFacts => f !== null,
    ),
    ...oneWay.slice(0, 1),
    ...load.slice(0, 1),
    ...(routes ? [routes] : []),
  ];

  // Too few: the network's ties within and between groups, when they lean either way.
  if (out.length < SUMMARY_RULES.minHeadlines) {
    const m = mixingFacts(ctx);
    if (m) out.push(m);
  }
  return out
    .slice(0, SUMMARY_RULES.maxHeadlines)
    .map((facts) => ({ id: headlineId(facts), facts }));
}

/** The mixing of the rules' grouping on the composite (or the first layer), when it leans. */
function mixingFacts(ctx: ExportContext): MixingFacts | null {
  const attr = insightGroup(ctx.project);
  if (!attr || ctx.policy.level === 'workshop') return null;
  const ref = ctx.result.refs.composite ? 'composite' : Object.keys(ctx.result.refs)[0];
  const mix = ref ? ctx.result.refs[ref]?.network.mixing[attr.key] : undefined;
  if (!ref || !mix || mix.groups.length < 2 || mix.internal + mix.external === 0) return null;
  if (mix.ei > SUMMARY_RULES.mixingInward && mix.ei < SUMMARY_RULES.mixingOutward) return null;
  const sizes = mix.perGroup.map((g) => g.size);
  const total = sizes.reduce((a, b) => a + b, 0);
  const same = sizes.reduce((a, s) => a + s * (s - 1), 0);
  return {
    kind: 'mixing',
    attribute: attr.key,
    ref,
    internal: mix.internal,
    external: mix.external,
    ei: mix.ei,
    possibleBetween: total > 1 ? 1 - same / (total * (total - 1)) : NaN,
  };
}

// ------------------------------------------------------------------ the text

export interface SummaryHeadline extends HeadlineText {
  id: string;
}

export interface SummaryText {
  /** Who it was prepared for, what it covers and how to read it. */
  intro: string[];
  headlines: SummaryHeadline[];
  closing: string;
}

/** The layer and attribute labels the copy needs, from the export's project. */
export function summaryLabels(ctx: ExportContext): InsightContext {
  return {
    layerLabel: (ref) => refName(ctx, ref),
    attributeLabel: (key) =>
      ctx.project.attribute_definitions.find((a) => a.key === key)?.label ?? key,
  };
}

/** The summary as drafted for this export: deterministic, from the observations. */
export function draftSummary(ctx: ExportContext): SummaryText {
  const labels = summaryLabels(ctx);
  const headlines = draftHeadlines(ctx).map((h) => ({
    id: h.id,
    ...headlineText(h.facts, labels),
  }));
  const attr = insightGroup(ctx.project);
  const groups = attr
    ? new Set(
        ctx.project.members
          .map((m) => m.attributes[attr.key])
          .filter((v): v is string => typeof v === 'string'),
      ).size
    : null;
  const layers = ctx.project.layers.filter((l) => l.enabled && !isCategorical(l)).length;
  const intro = [
    ...[audienceLine(ctx.policy.level, ctx.policy.team)].filter((s): s is string => s !== null),
    summaryCopy.intro(ctx.project.members.length, groups, attr?.label ?? '', layers),
  ];
  if (headlines.length < SUMMARY_RULES.minHeadlines)
    intro.push(summaryCopy.fewer(headlines.length));
  return { intro, headlines, closing: summaryCopy.closing };
}
