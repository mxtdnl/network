// Wording for the insights panel (spec §9, CLAUDE.md D9). The engine's rules
// (src/engine/insights.ts) return structure; this module turns it into
// neutral questions for inquiry. Nothing here describes a person as good or
// bad: tests/unit/insightsCopy.test.ts fails if any string contains a word
// from the banned list in CLAUDE.md ("Insight wording").
//
// Rule descriptions quote the thresholds from INSIGHT_RULES, so the rule shown
// is the rule that ran.

import {
  INSIGHT_RULES,
  type InsightRuleId,
  type InsightUnavailable,
  type InsightView,
  type Observation,
} from '../engineClient';
import { percent } from './data';
import { formatValue } from './map';
import type { SizeMetric } from '../state/store';
import { metricCopy } from './metrics';

/** What the copy needs from the project: plain labels for layers and attributes. */
export interface InsightContext {
  /** Label of a layer, a signed sub-layer or the composite. */
  layerLabel: (ref: string) => string;
  attributeLabel: (key: string) => string;
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** "Three members", "12 members": counts up to ten in words, as in running text. */
export function countOf(n: number, singular: string, plural: string): string {
  const word = WORDS[n] ?? String(n);
  return `${word} ${n === 1 ? singular : plural}`;
}

const lower = (s: string) => (s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** −0.89: two decimals with a true minus sign. */
export function signed2(v: number): string {
  const text = Math.abs(v).toFixed(2);
  return v < 0 ? `−${text}` : text;
}

const ordinal = (q: number) => {
  const p = Math.round(q * 100);
  const suffix =
    p % 10 === 1 && p !== 11
      ? 'st'
      : p % 10 === 2 && p !== 12
        ? 'nd'
        : p % 10 === 3 && p !== 13
          ? 'rd'
          : 'th';
  return `${String(p)}${suffix}`;
};

const R = INSIGHT_RULES;

export const insightsCopy = {
  tab: 'Insights',
  intro:
    'Rule-based observations from the analysis on screen. Each is a question to explore with the people involved, not a finding about anyone. Every observation shows the rule that produced it.',
  coverage: (rate: string) =>
    `Data coverage is ${rate}, below the threshold, so observations about the whole network rest on incomplete data.`,
  noResult: 'Insights appear here once the analysis has run.',
  titles: {
    brokers: 'Potential brokers',
    peripheral: 'Peripheral members',
    overload: 'Possible overload',
    silo: 'Silos',
    negativeCluster: 'Negative clusters',
    formalOnly: 'Formal ties with no informal counterpart',
    informalOnly: 'Informal ties with no formal counterpart',
    oneWayNegative: 'Negative ratings not returned',
  } satisfies Record<InsightRuleId, string>,
  ruleLabel: 'Rule',
  membersLabel: (n: number, rule?: InsightRuleId) =>
    rule === 'formalOnly' || rule === 'informalOnly'
      ? `Members in the most such ties (${String(n)})`
      : n === 1
        ? 'Member'
        : `Members (${String(n)})`,
  viewLabel: 'View',
  none: 'No observation: nothing in this analysis meets the rule.',
  unavailable: {
    noComposite: 'Not applied: the composite is not defined. Give at least one layer a weight.',
    noLayers: 'Not applied: no enabled layer has ties.',
    layersNotEnabled:
      'Not applied: this rule reads the advice and workflow dependency layers. Enable either layer and add its ratings.',
    noGroupAttribute: 'Not applied: members have no attribute to group them by, such as team.',
    tooFewGroups: `Not applied: fewer than ${String(R.silo.minGroups)} groups have at least ${String(R.silo.minGroupSize)} members, so almost every tie stays within one group.`,
    noSignedLayer: 'Not applied: no signed layer (valence or energy) is enabled.',
    noFormalInformal:
      'Not applied: this rule needs both the formal and the informal collaboration layers.',
  } satisfies Record<InsightUnavailable, string>,
  nth: (title: string, k: number, n: number) => `${title}, ${String(k)} of ${String(n)}`,
  show: 'Show on the map',
  showLabel: (title: string) => `Show on the map: ${title}`,
  shown: (title: string) => `Shown on the map: ${title}`,
  saveView: 'Save as view',
  saveViewLabel: (title: string) => `Save as view: ${title}`,
  clearHighlight: 'Clear highlight',
  groupBy: 'Group members by',
  groupByHelp:
    'Used by the rules on silos, formal and informal ties, and negative ratings not returned.',
  peripheralInSilo: (n: number) =>
    `${countOf(n, 'member this rule found is', 'members this rule found are')} part of a group listed under Silos, and named there.`,
} as const;

/** The excluded layer groups in words: "the conflict layers". */
const excludedText = R.excludedLayerGroups.map((g) => `the ${g} layers`).join(' and ');

/**
 * The rule as applied, with its thresholds. `group` is the plain label of the
 * attribute the group rules use (the project's choice, team by default).
 */
export function ruleText(rule: InsightRuleId, directed: boolean, group = 'team'): string {
  const received = directed ? metricCopy.inStrength.label : metricCopy.strength.label;
  const connectionsIn = directed ? metricCopy.inDegree.label : metricCopy.degree.label;
  const by = lower(group);
  switch (rule) {
    case 'brokers':
      return `Bridging (betweenness) on the composite among the highest ${percent(R.brokers.topShare)} of members and at least ${String(R.brokers.minBetweenness)}, and constraint at or below the median. At most ${String(R.brokers.maxMembers)} members, highest bridging first.`;
    case 'peripheral':
      return `${received} at or below the ${ordinal(R.peripheral.quantile)} percentile of members and at least ${percent(R.peripheral.minBelowMedian)} below the median, on more than half of the layers considered: each unsigned layer except ${excludedText}, and the positive ratings of each signed layer, not the composite. A layer on which no one receives a tie is not considered. At most ${String(R.peripheral.maxMembers)} members are listed, furthest below the median first. Members who make up at least ${percent(R.overlap.minGroupShare)} of a silo group are named with that group instead.`;
    case 'overload':
      return `On the advice and workflow dependency layers: ${lower(connectionsIn)} at or above the ${ordinal(R.overload.quantile)} percentile of members and at least ${String(R.overload.medianMultiple)} times the median. At most ${String(R.overload.maxMembers)} members per layer.`;
    case 'silo':
      return `Members are grouped by ${by}. A group of at least ${String(R.silo.minGroupSize)} members whose E-I index is ${signed2(R.silo.maxEi)} or lower on the composite or on any unsigned layer except ${excludedText}, which means at least three ties inside the group for every tie outside it, counting only layers with at least ${String(R.silo.minTies)} ties involving the group. The layer with the lowest index is quoted. Not applied when fewer than ${String(R.silo.minGroups)} groups have ${String(R.silo.minGroupSize)} members or more.`;
    case 'negativeCluster':
      return `Pairs who rate each other negatively in both directions on a signed layer, joined into groups through shared members. A group of at least ${String(R.negativeCluster.minSize)} members is shown. Read from the directed ratings in either view.`;
    case 'oneWayNegative':
      return `On each signed layer, negative ratings whose reverse rating is not negative: neutral, positive or not given. A layer with at least ${String(R.oneWayNegative.minCount)} is shown, with counts by ${by}, the rater's group first. Read from the directed ratings in either view.`;
    case 'formalOnly':
      return `Members are grouped by ${by}. For every pair of groups, and every group on its own: at least ${percent(R.formalInformal.minShare)} of formal collaboration ties have no informal collaboration tie, and there are at least ${String(R.formalInformal.minPairs)} such ties. Pairs with a missing rating on either layer are left out. The ${String(R.formalInformal.maxMembers)} members in the most such ties are highlighted.`;
    case 'informalOnly':
      return `Members are grouped by ${by}. For every pair of groups, and every group on its own: at least ${percent(R.formalInformal.minShare)} of informal collaboration ties have no formal collaboration tie, and there are at least ${String(R.formalInformal.minPairs)} such ties. Pairs with a missing rating on either layer are left out. The ${String(R.formalInformal.maxMembers)} members in the most such ties are highlighted.`;
  }
}

const between = (o: Observation) => {
  const g = o.group;
  if (!g) return 'Across the network';
  return g.other === undefined || g.other === g.value
    ? `Within ${g.value}`
    : `Between ${g.value} and ${g.other}`;
};

/** The observation as a neutral question, with the figures that support it. */
export function questionText(o: Observation, ctx: InsightContext): string {
  const e = o.evidence;
  const n = (k: string) => e[k] ?? NaN;
  switch (o.rule) {
    case 'brokers':
      return `${countOf(o.members.length, 'member lies', 'members lie')} on many of the shortest routes between colleagues, while their own contacts are not closely tied to one another. What would happen to those routes if one of them were unavailable?`;
    case 'peripheral': {
      const found = e.found ?? o.members.length;
      const listed =
        found > o.members.length
          ? ` The ${formatValue(o.members.length)} furthest below the median are listed.`
          : '';
      const inSilo =
        (e.inSilo ?? 0) > 0
          ? ` ${countOf(n('inSilo'), 'more member is', 'more members are')} named under Silos.`
          : '';
      return `${countOf(found, 'member receives', 'members receive')} fewer ties than most colleagues on at least ${formatValue(n('fewestLowLayers'))} of ${formatValue(n('layers'))} layers.${listed}${inSilo} Are they new, working remotely, or working through channels the survey does not ask about?`;
    }
    case 'overload':
      return `On ${lower(ctx.layerLabel(o.ref))}, ${lower(countOf(o.members.length, 'member is', 'members are'))} named by the most colleagues: up to ${formatValue(n('highest'))} each, against a median of ${formatValue(n('median'))}. How is the demand on their time shared?`;
    case 'silo': {
      const team = o.group?.value ?? '';
      const also =
        (e.alsoPeripheral ?? 0) > 0
          ? ` ${countOf(n('alsoPeripheral'), 'of its', 'of its')} ${formatValue(n('size'))} members also receive fewer ties than most colleagues on most layers (see Peripheral members).`
          : '';
      return `On ${lower(ctx.layerLabel(o.ref))}, most ties involving ${team} stay within ${team}: ${formatValue(n('internal'))} inside and ${formatValue(n('external'))} outside (E-I index ${signed2(n('ei'))}).${also} How does work reach the rest of the organisation?`;
    }
    case 'oneWayNegative': {
      const groups = (o.groups ?? [])
        .slice(0, 3)
        .map((g) =>
          g.value === g.other
            ? `${formatValue(g.count)} within ${g.value}`
            : `${formatValue(g.count)} from ${g.value} to ${g.other}`,
        );
      const where = groups.length > 0 ? ` (${groups.join(', ')})` : '';
      const notRated =
        (e.notRated ?? 0) > 0
          ? ` For ${formatValue(n('notRated'))} of them, the colleague rated gave no rating in return.`
          : '';
      return `On ${lower(ctx.layerLabel(o.ref))}, ${formatValue(n('count'))} of ${formatValue(n('negative'))} negative ratings are not returned negatively${where}.${notRated} What might lie behind ratings that differ by direction?`;
    }
    case 'negativeCluster':
      return `In a group of ${formatValue(n('size'))} members, ${formatValue(n('pairs'))} pairs rate each other negatively on ${lower(ctx.layerLabel(o.ref))} in both directions. What shared circumstances might lie behind these ratings?`;
    case 'formalOnly':
      return `${between(o)}, ${formatValue(n('pairs'))} of ${formatValue(n('total'))} formal collaboration ties (${percent(n('share'))}) have no informal counterpart. What happens between these people outside formal processes?`;
    case 'informalOnly':
      return `${between(o)}, ${formatValue(n('pairs'))} of ${formatValue(n('total'))} informal collaboration ties (${percent(n('share'))}) have no formal counterpart. What work do these ties carry that the formal structure does not show?`;
  }
}

/**
 * What most of the members named share, and who among them gave no ratings
 * (build plan session 4): "Three of the five share tenure band Under 1 year."
 * Null when there is nothing to add.
 */
export function membersText(o: Observation, ctx: InsightContext): string | null {
  const n = o.members.length;
  const word = (k: number) => (k <= 10 ? lower(countOf(k, '', '').trim()) : String(k));
  const parts = (o.shared ?? []).map((s) => {
    const who =
      s.count === n
        ? n === 2
          ? 'Both'
          : `All ${word(n)}`
        : `${countOf(s.count, '', '').trim()} of the ${word(n)}`;
    return `${who} share ${lower(ctx.attributeLabel(s.attribute))} ${s.value}.`;
  });
  const silent = o.noRatings?.length ?? 0;
  if (silent > 0)
    parts.push(
      silent === n
        ? `${n === 1 ? 'This member' : `All ${String(n)}`} gave no ratings, so only colleagues’ reports of their ties are counted.`
        : `${countOf(silent, 'of them', 'of them')} gave no ratings, so only colleagues’ reports of their ties are counted.`,
    );
  return parts.length > 0 ? parts.join(' ') : null;
}

/** Marks a member named in an observation who gave no ratings. */
export const noRatingsMark = 'gave no ratings';

function metricLabel(key: string): string {
  const copy = (metricCopy as Partial<Record<string, { label: string }>>)[key as SizeMetric];
  return copy?.label ?? key;
}

const LAYOUTS: Record<InsightView['layout'], string> = {
  force: 'force-directed layout',
  grouped: 'grouped layout',
  hierarchy: 'formal hierarchy',
};

/** The view configuration in words: ties drawn, node size, layout, filters and highlight. */
export function viewText(view: InsightView, ctx: InsightContext): string {
  const parts = [
    `Ties from ${lower(ctx.layerLabel(view.layer))}`,
    `node size by ${lower(metricLabel(view.sizeMetric))}`,
    view.layout === 'grouped' && view.groupBy
      ? `grouped by ${lower(ctx.attributeLabel(view.groupBy))}`
      : LAYOUTS[view.layout],
  ];
  for (const f of view.filters) {
    parts.push(`showing ${lower(ctx.attributeLabel(f.key))} ${f.values.join(' or ')}`);
  }
  if (view.highlight.length > 0) {
    parts.push(`${countOf(view.highlight.length, 'member', 'members').toLowerCase()} highlighted`);
  }
  if (view.drawNegative) parts.push('negative ratings drawn whatever the tie strength');
  const text = parts.join(', ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
