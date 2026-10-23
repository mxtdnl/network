// Rule-based observations for the insights panel (spec §9). Each rule is a
// pure function of analysis results; its thresholds are the constants in
// INSIGHT_RULES, which the panel also uses to state the rule it applied
// (ui/copy/insights.ts). Rules return structure only: which members, which
// group, which figures, and the map view that shows them. They never rank or
// judge a member; the wording, written as questions, is in the copy layer.
//
// Quantiles use linear interpolation between order statistics (NumPy's
// default), over the members whose value is defined.

import { articulationPoints, neighboursOf, partsWithout } from './metrics/cutpoints';
import { percentile } from './metrics/percentile';
import {
  COMPOSITE,
  FI_CLASS,
  type AttributeColumn,
  type AttributeKey,
  type InsightOutcome,
  type InsightRuleId,
  type InsightUnavailable,
  type LayerKey,
  type LoadResult,
  type LoadShare,
  type LayerRef,
  type MemberId,
  type MultiplexResult,
  type NetworkMetrics,
  type NodeMetricKey,
  type NodeMetricTable,
  type Observation,
  type RatingFlag,
  type RefResult,
} from './types';

/** Thresholds of every rule. The panel quotes them, so what it says is what ran. */
export const INSIGHT_RULES = {
  brokers: {
    /** Betweenness (weighted, 1/w distances) among the top share of members… */
    topShare: 0.1,
    /** …and constraint at or below this quantile of members' constraint. */
    constraintQuantile: 0.5,
    /** …and betweenness at least this (normalised, 0–1), so that tiny differences are not read as routes. */
    minBetweenness: 0.05,
    maxMembers: 5,
  },
  peripheral: {
    /** In-strength (strength in the symmetrised view) at or below this quantile of a layer… */
    quantile: 0.2,
    /** …and at least this share below the layer's median, so near-equal values are not counted low… */
    minBelowMedian: 0.1,
    /** …on more than this share of the layers considered. */
    layerShare: 0.5,
    /** Members listed, furthest below the median first; the wording gives how many were found. */
    maxMembers: 5,
  },
  overload: {
    /** Layers the rule reads, by key. */
    layers: ['advice', 'workflow_dependency'] as readonly string[],
    /** In-degree (degree when symmetrised) at or above this quantile… */
    quantile: 0.9,
    /** …and at least this multiple of the median in-degree. */
    medianMultiple: 2,
    maxMembers: 5,
  },
  silo: {
    /**
     * Attributes groups are taken from when the project names none
     * (settings.insight_group), first one present wins. The formal–informal
     * and one-way rules use the same attribute.
     */
    attributes: ['team'] as readonly string[],
    /** E-I index at or below this value on a layer: at least three internal ties for every external one. */
    maxEi: -0.5,
    minGroupSize: 3,
    /** The rule applies only when at least this many groups have minGroupSize members. */
    minGroups: 2,
    /** A group is tested on a layer only when it has at least this many ties on it, inside and outside. */
    minTies: 5,
  },
  onlyRoutes: {
    /**
     * A group (of the grouping attribute, at least silo.minGroupSize members)
     * whose ties with every other group are held by at most this many of its
     * members…
     */
    maxGateways: 2,
    /** …and by at most this share of the group, on the composite or a working layer. */
    maxGatewayShare: 0.5,
    /** A member whose removal cuts at least this many members off from the rest (a cut point). */
    minCutOff: 3,
  },
  concentratedDemand: {
    /** Layers the rule reads, by key, as the overload rule. */
    layers: ['advice', 'workflow_dependency'] as readonly string[],
    /** The members receiving most ties: this share of members, at least one. */
    topShare: 0.1,
    /** Across the network: the top members hold at least this share of incoming ties… */
    minShare: 0.25,
    /** …of at least this many. */
    minTies: 20,
    /** Within a group of at least groupMinSize members and groupMinTies incoming ties… */
    groupMinSize: 5,
    groupMinTies: 10,
    /** …the group's top members hold at least this multiple of their even share (top / members). */
    groupMultiple: 2.5,
  },
  negativeCluster: {
    /** Members joined by pairs who rate each other negatively in both directions, at least this many. */
    minSize: 3,
  },
  oneWayNegative: {
    /** Negative ratings whose reverse is not negative, at least this many on a layer. */
    minCount: 3,
  },
  overlap: {
    /**
     * When at least this share of a silo group's members are peripheral
     * members too, they are named in the silo observation and left out of the
     * peripheral list, so one finding is not reported twice.
     */
    minGroupShare: 0.5,
  },
  shared: {
    /**
     * An observation naming at least this many members states the attribute
     * values more than this share of them have, when that share is also above
     * the value's share among all members (build plan session 4)…
     */
    minMembers: 2,
    minShare: 0.5,
    /** …at most this many, most shared first. */
    maxAttributes: 2,
  },
  /**
   * Layer groups the silo and peripheral rules leave out: conflict is not a
   * working tie, and conflict between people who work together stays inside
   * their group by nature (build plan session 3).
   */
  excludedLayerGroups: ['conflict'] as readonly string[],
  formalInformal: {
    /**
     * Groups (the first attribute of silo.attributes present) are compared in
     * pairs, and each with itself, where at least this share of the formal
     * (informal) ties has no informal (formal) counterpart…
     */
    minShare: 0.5,
    /** …and at least this many such ties. */
    minPairs: 5,
    /** The members in the most such ties, highlighted on the map. */
    maxMembers: 5,
  },
} as const;

/** Panel order. */
export const INSIGHT_RULE_ORDER: readonly InsightRuleId[] = [
  'brokers',
  'onlyRoutes',
  'peripheral',
  'overload',
  'concentratedDemand',
  'silo',
  'negativeCluster',
  'oneWayNegative',
  'formalOnly',
  'informalOnly',
];

const definedSorted = (column: ArrayLike<number>): number[] =>
  Array.from(column)
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);

const unavailable = (rule: InsightRuleId, reason: InsightUnavailable): InsightOutcome => ({
  rule,
  status: 'unavailable',
  reason,
  observations: [],
});

const outcome = (rule: InsightRuleId, observations: Observation[]): InsightOutcome => ({
  rule,
  status: observations.length > 0 ? 'observed' : 'none',
  observations,
});

/** Member indices ordered by value, highest first, then by member order. */
const byValueDesc = (indices: number[], column: ArrayLike<number>) =>
  indices.sort((a, b) => (column[b] as number) - (column[a] as number) || a - b);

// ------------------------------------------------------------------ brokers

/**
 * Potential brokers: members whose betweenness is among the top
 * INSIGHT_RULES.brokers.topShare of members (at least one member; members
 * tied with the last one included) and at least
 * INSIGHT_RULES.brokers.minBetweenness, and whose constraint is at or below
 * the median. High betweenness with low constraint means a member lies
 * on many shortest routes between others whose contacts are not tied to each
 * other (docs/method-notes.md §3).
 */
export function potentialBrokers(
  ids: readonly MemberId[],
  ref: LayerRef,
  node: NodeMetricTable,
  directed: boolean,
): InsightOutcome {
  const T = INSIGHT_RULES.brokers;
  const betweenness = node.columns.betweenness;
  const constraint = node.columns.constraint;
  if (!betweenness || !constraint) return unavailable('brokers', 'noComposite');
  const n = ids.length;
  const k = Math.max(1, Math.ceil(T.topShare * n));
  const ranked = byValueDesc(
    [...Array(n).keys()].filter((i) => (betweenness[i] as number) >= T.minBetweenness),
    betweenness,
  );
  const cutoff = ranked[Math.min(k, ranked.length) - 1];
  if (cutoff === undefined) return outcome('brokers', []);
  const floor = betweenness[cutoff] as number;
  const medianConstraint = percentile(definedSorted(constraint), T.constraintQuantile);
  const chosen = ranked
    .filter((i) => (betweenness[i] as number) >= floor)
    .filter((i) => Number.isFinite(constraint[i]) && (constraint[i] as number) <= medianConstraint)
    .slice(0, T.maxMembers);
  if (chosen.length === 0) return outcome('brokers', []);
  return outcome('brokers', [
    {
      rule: 'brokers',
      ref,
      members: chosen.map((i) => ids[i] as MemberId),
      evidence: {
        count: chosen.length,
        topShare: T.topShare,
        medianConstraint,
        highestBetweenness: betweenness[chosen[0] as number] as number,
        directed: directed ? 1 : 0,
      },
      view: {
        layer: ref,
        sizeMetric: 'betweenness',
        layout: 'force',
        groupBy: null,
        filters: [],
        highlight: chosen.map((i) => ids[i] as MemberId),
        show: [],
      },
    },
  ]);
}

// --------------------------------------------------------------- peripheral

export interface LayerNodeTable {
  ref: LayerRef;
  node: NodeMetricTable;
}

/** Peripheral members found, before the list is capped: ranked, with the figures the wording quotes. */
export interface PeripheralRanking {
  /** Member indices, most low layers first, then furthest below the median. */
  ranked: number[];
  /** Layers on which each member counts low, by member index. */
  low: number[];
  considered: number;
}

/**
 * Peripheral members: members whose in-strength (strength when symmetrised) is
 * at or below the INSIGHT_RULES.peripheral.quantile of members, and at least
 * minBelowMedian below the layer's median, on more than half of the layers
 * considered: every unsigned layer and the positive part of each signed
 * layer, not the composite, not negative ratings and not the layer groups in
 * INSIGHT_RULES.excludedLayerGroups. A layer on which nobody receives any tie
 * is not considered, and a member at the layer's highest value is never
 * counted low. Members are ranked by the number of layers on which they are
 * low, then by their mean value as a share of the median, lowest first. Null
 * when no layer is considered.
 */
export function rankPeripheral(
  n: number,
  layers: readonly LayerNodeTable[],
  directed: boolean,
): PeripheralRanking | null {
  const T = INSIGHT_RULES.peripheral;
  const metric: NodeMetricKey = directed ? 'inStrength' : 'strength';
  const low = new Array<number>(n).fill(0);
  const share = new Array<number>(n).fill(0);
  let considered = 0;
  for (const { node } of layers) {
    const column = node.columns[metric];
    if (!column) continue;
    const values = definedSorted(column);
    const max = values[values.length - 1] ?? 0;
    if (max <= 0) continue;
    considered += 1;
    const q = percentile(values, T.quantile);
    const median = percentile(values, 0.5);
    const below = (1 - T.minBelowMedian) * median;
    for (let i = 0; i < n; i++) {
      const v = column[i] as number;
      if (!Number.isFinite(v) || v > q || v >= max || v > below) continue;
      low[i] = (low[i] ?? 0) + 1;
      share[i] = (share[i] ?? 0) + (median > 0 ? v / median : 0);
    }
  }
  if (considered === 0) return null;
  const mean = (i: number) => (share[i] ?? 0) / (low[i] ?? 1);
  const ranked = [...Array(n).keys()]
    .filter((i) => (low[i] ?? 0) > T.layerShare * considered)
    .sort((a, b) => (low[b] ?? 0) - (low[a] ?? 0) || mean(a) - mean(b) || a - b);
  return { ranked, low, considered };
}

/**
 * The peripheral outcome from a ranking: at most
 * INSIGHT_RULES.peripheral.maxMembers members listed. Members in `inSilo` are
 * left out and counted, because a silo observation names them
 * (INSIGHT_RULES.overlap).
 */
export function peripheralOutcome(
  ids: readonly MemberId[],
  ranking: PeripheralRanking | null,
  directed: boolean,
  inSilo: ReadonlySet<number> = new Set(),
): InsightOutcome {
  const T = INSIGHT_RULES.peripheral;
  if (!ranking) return unavailable('peripheral', 'noLayers');
  const { low, considered } = ranking;
  const found = ranking.ranked.filter((i) => !inSilo.has(i));
  const moved = ranking.ranked.length - found.length;
  const extra = moved > 0 ? { inSilo: moved } : {};
  if (found.length === 0) return { ...outcome('peripheral', []), ...extra };
  const chosen = found.slice(0, T.maxMembers);
  const members = chosen.map((i) => ids[i] as MemberId);
  const metric: NodeMetricKey = directed ? 'inStrength' : 'strength';
  return {
    ...outcome('peripheral', [
      {
        rule: 'peripheral',
        ref: COMPOSITE,
        members,
        evidence: {
          count: chosen.length,
          found: found.length,
          inSilo: moved,
          layers: considered,
          fewestLowLayers: Math.min(...found.map((i) => low[i] ?? 0)),
          quantile: T.quantile,
          directed: directed ? 1 : 0,
        },
        view: {
          layer: COMPOSITE,
          sizeMetric: metric,
          layout: 'force',
          groupBy: null,
          filters: [],
          highlight: members,
          show: [],
        },
      },
    ]),
    ...extra,
  };
}

/** Peripheral members (rankPeripheral, then peripheralOutcome), without the silo overlap. */
export function peripheralMembers(
  ids: readonly MemberId[],
  layers: readonly LayerNodeTable[],
  directed: boolean,
): InsightOutcome {
  return peripheralOutcome(ids, rankPeripheral(ids.length, layers, directed), directed);
}

// ----------------------------------------------------------------- overload

/**
 * Possible overload: on the advice and workflow dependency layers, members
 * whose in-degree (degree when symmetrised) is at or above the
 * INSIGHT_RULES.overload.quantile of members and at least medianMultiple times
 * the median in-degree, and above 0; at most maxMembers per layer, highest
 * first. One observation per layer.
 */
export function possibleOverload(
  ids: readonly MemberId[],
  layers: readonly (LayerNodeTable & { layer: LayerKey })[],
  directed: boolean,
): InsightOutcome {
  const T = INSIGHT_RULES.overload;
  const metric: NodeMetricKey = directed ? 'inDegree' : 'degree';
  const read = layers.filter((l) => T.layers.includes(l.layer));
  if (read.length === 0) return unavailable('overload', 'layersNotEnabled');
  const observations: Observation[] = [];
  for (const { ref, node } of read) {
    const column = node.columns[metric];
    if (!column) continue;
    const values = definedSorted(column);
    const q = percentile(values, T.quantile);
    const median = percentile(values, 0.5);
    const floor = Math.max(q, T.medianMultiple * median);
    const chosen = byValueDesc(
      [...Array(ids.length).keys()].filter((i) => {
        const v = column[i] as number;
        return Number.isFinite(v) && v > 0 && v >= floor;
      }),
      column,
    ).slice(0, T.maxMembers);
    if (chosen.length === 0) continue;
    const members = chosen.map((i) => ids[i] as MemberId);
    observations.push({
      rule: 'overload',
      ref,
      members,
      evidence: {
        count: chosen.length,
        highest: column[chosen[0] as number] as number,
        median,
        directed: directed ? 1 : 0,
      },
      view: {
        layer: ref,
        sizeMetric: metric,
        layout: 'force',
        groupBy: null,
        filters: [],
        highlight: members,
        show: [],
      },
    });
  }
  return outcome('overload', observations);
}

// -------------------------------------------------------------------- silos

/**
 * The attribute the group rules use: the project's choice
 * (settings.insight_group) when members have it, otherwise the first of
 * INSIGHT_RULES.silo.attributes present. Null when there is none.
 */
export function groupAttribute(
  attributes: Readonly<Record<AttributeKey, AttributeColumn>>,
  chosen?: AttributeKey,
): AttributeKey | null {
  if (chosen && attributes[chosen]) return chosen;
  return INSIGHT_RULES.silo.attributes.find((a) => attributes[a]) ?? null;
}

/**
 * Silos: groups of the grouping attribute (groupAttribute) of at least
 * minGroupSize members, whose E-I index is at or below maxEi on at least one
 * of the layers given (each unsigned layer outside
 * INSIGHT_RULES.excludedLayerGroups, and the composite) with at least minTies
 * ties involving the group: most ties involving the group stay inside it. The
 * rule is not applied when fewer than minGroups groups have minGroupSize
 * members, because with one group E-I is −1 by construction; a group with no
 * member outside it is never tested. One observation per group, quoting the
 * layer with the lowest index. The E-I index counts ties, not strength
 * (docs/method-notes.md §4).
 */
export function silos(
  ids: readonly MemberId[],
  layers: readonly { ref: LayerRef; network: NetworkMetrics }[],
  attributes: Readonly<Record<AttributeKey, AttributeColumn>>,
  chosen?: AttributeKey,
): InsightOutcome {
  const T = INSIGHT_RULES.silo;
  const attribute = groupAttribute(attributes, chosen);
  const column = attribute ? attributes[attribute] : undefined;
  if (!attribute || !column) return unavailable('silo', 'noGroupAttribute');
  const sizes = new Map<string, number>();
  for (const v of column.values) if (v !== null) sizes.set(v, (sizes.get(v) ?? 0) + 1);
  const valued = [...sizes.values()].reduce((a, b) => a + b, 0);
  if ([...sizes.values()].filter((x) => x >= T.minGroupSize).length < T.minGroups)
    return unavailable('silo', 'tooFewGroups');
  if (layers.length === 0) return unavailable('silo', 'noLayers');
  const found = new Map<
    string,
    { ref: LayerRef; ei: number; internal: number; external: number; size: number; layers: number }
  >();
  for (const { ref, network } of layers) {
    for (const g of network.mixing[attribute]?.perGroup ?? []) {
      if (g.size < T.minGroupSize || valued - g.size === 0) continue;
      if (g.internal + g.external < T.minTies || !(g.ei <= T.maxEi)) continue;
      const best = found.get(g.group);
      if (!best || g.ei < best.ei) {
        found.set(g.group, {
          ref,
          ei: g.ei,
          internal: g.internal,
          external: g.external,
          size: g.size,
          layers: (best?.layers ?? 0) + 1,
        });
      } else best.layers += 1;
    }
  }
  const observations: Observation[] = [...found].map(([group, f]) => {
    const members = ids.filter((_, i) => column.values[i] === group);
    return {
      rule: 'silo',
      ref: f.ref,
      members,
      group: { attribute, value: group },
      evidence: {
        ei: f.ei,
        internal: f.internal,
        external: f.external,
        size: f.size,
        layers: f.layers,
        maxEi: T.maxEi,
      },
      view: {
        layer: f.ref,
        sizeMetric: 'betweenness',
        layout: 'grouped',
        groupBy: attribute,
        filters: [],
        highlight: members,
        show: [],
      },
    };
  });
  observations.sort((a, b) => (a.evidence.ei ?? 0) - (b.evidence.ei ?? 0));
  return outcome('silo', observations);
}

// ------------------------------------------------------- routes between groups

export interface GroupRoutes {
  groups: {
    group: string;
    size: number;
    /** Pairs (one in the group, one outside it, members with a value) tied in either direction. */
    externalTies: number;
    /** Members of the group in those ties, most ties first, then in member order. */
    gateways: number[];
    /** Ties each gateway holds, aligned with `gateways`. */
    gatewayTies: number[];
  }[];
  pairs: {
    a: string;
    b: string;
    sizeA: number;
    sizeB: number;
    /** Pairs of members, one in each group, tied in either direction. */
    ties: number;
    /** Members in those ties, most ties first. */
    members: number[];
  }[];
}

/**
 * The ties between groups of an attribute, read without direction (a tie in
 * either direction counts once): per group, the members holding every tie
 * with other groups; per pair of groups, the ties directly between them.
 * Members without a value are left out. `weights` are a layer's view weights.
 */
export function groupRoutes(
  weights: ArrayLike<number>,
  n: number,
  column: AttributeColumn,
): GroupRoutes {
  const order = [...column.categories];
  for (const v of column.values) if (v !== null && !order.includes(v)) order.push(v);
  const present = order.filter((g) => column.values.includes(g));
  const index = new Map(present.map((g, k) => [g, k]));
  const gi = column.values.map((v) => (v === null ? -1 : (index.get(v) ?? -1)));
  const k = present.length;
  const size = new Array<number>(k).fill(0);
  for (const g of gi) if (g >= 0) size[g] = (size[g] ?? 0) + 1;
  const external = new Array<number>(k).fill(0);
  const held = new Array<number>(n).fill(0);
  const pairTies = new Array<number>(k * k).fill(0);
  const pairMembers = Array.from({ length: k * k }, () => new Map<number, number>());
  for (let i = 0; i < n; i++) {
    const a = gi[i] as number;
    if (a < 0) continue;
    for (let j = i + 1; j < n; j++) {
      const b = gi[j] as number;
      if (b < 0 || a === b) continue;
      if (!((weights[i * n + j] as number) > 0 || (weights[j * n + i] as number) > 0)) continue;
      external[a] = (external[a] ?? 0) + 1;
      external[b] = (external[b] ?? 0) + 1;
      held[i] = (held[i] ?? 0) + 1;
      held[j] = (held[j] ?? 0) + 1;
      const key = Math.min(a, b) * k + Math.max(a, b);
      pairTies[key] = (pairTies[key] ?? 0) + 1;
      const m = pairMembers[key] as Map<number, number>;
      m.set(i, (m.get(i) ?? 0) + 1).set(j, (m.get(j) ?? 0) + 1);
    }
  }
  const byHeld = (xs: number[], count: (i: number) => number) =>
    xs.sort((x, y) => count(y) - count(x) || x - y);
  const groups = present.map((group, g) => {
    const gateways = byHeld(
      [...Array(n).keys()].filter((i) => gi[i] === g && (held[i] ?? 0) > 0),
      (i) => held[i] ?? 0,
    );
    return {
      group,
      size: size[g] ?? 0,
      externalTies: external[g] ?? 0,
      gateways,
      gatewayTies: gateways.map((i) => held[i] ?? 0),
    };
  });
  const pairs: GroupRoutes['pairs'] = [];
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      const m = pairMembers[a * k + b] as Map<number, number>;
      pairs.push({
        a: present[a] as string,
        b: present[b] as string,
        sizeA: size[a] ?? 0,
        sizeB: size[b] ?? 0,
        ties: pairTies[a * k + b] ?? 0,
        members: byHeld([...m.keys()], (i) => m.get(i) ?? 0),
      });
    }
  }
  return { groups, pairs };
}

/**
 * Only routes between groups (build plan session 7), on the composite and each
 * working layer (unsigned, outside INSIGHT_RULES.excludedLayerGroups), ties
 * read without direction:
 * - a group of at least silo.minGroupSize members, with members outside it,
 *   whose ties with every other group are held by at most
 *   onlyRoutes.maxGateways of its members and at most maxGatewayShare of the
 *   group; one observation per group, quoting the layer with fewest such
 *   members (the first in layer order on a tie), with its ties per other group;
 * - a cut point whose removal cuts at least minCutOff members off from the
 *   largest part that remains; one observation per member, quoting the layer
 *   on which it cuts off most.
 * The group part is skipped, without making the rule unavailable, when no
 * grouping attribute applies (fewer than silo.minGroups groups of
 * silo.minGroupSize members).
 */
export function onlyRoutes(
  ids: readonly MemberId[],
  layers: readonly { ref: LayerRef; weights: Float64Array }[],
  attributes: Readonly<Record<AttributeKey, AttributeColumn>>,
  chosen?: AttributeKey,
): InsightOutcome {
  const T = INSIGHT_RULES.onlyRoutes;
  const S = INSIGHT_RULES.silo;
  if (layers.length === 0) return unavailable('onlyRoutes', 'noLayers');
  const n = ids.length;
  const observations: Observation[] = [];
  const attribute = groupAttribute(attributes, chosen);
  const column = attribute ? attributes[attribute] : undefined;
  const sizes = new Map<string, number>();
  for (const v of column?.values ?? []) if (v !== null) sizes.set(v, (sizes.get(v) ?? 0) + 1);
  const valued = [...sizes.values()].reduce((a, b) => a + b, 0);
  if (
    attribute &&
    column &&
    [...sizes.values()].filter((x) => x >= S.minGroupSize).length >= S.minGroups
  ) {
    const found = new Map<
      string,
      {
        ref: LayerRef;
        group: GroupRoutes['groups'][number];
        pairs: GroupRoutes['pairs'];
        layers: number;
      }
    >();
    for (const { ref, weights } of layers) {
      const routes = groupRoutes(weights, n, column);
      for (const g of routes.groups) {
        const k = g.gateways.length;
        if (g.size < S.minGroupSize || valued - g.size === 0 || g.externalTies === 0) continue;
        if (k > T.maxGateways || k > T.maxGatewayShare * g.size) continue;
        const best = found.get(g.group);
        const pairs = routes.pairs.filter(
          (p) => p.ties > 0 && (p.a === g.group || p.b === g.group),
        );
        if (!best || k < best.group.gateways.length)
          found.set(g.group, { ref, group: g, pairs, layers: (best?.layers ?? 0) + 1 });
        else best.layers += 1;
      }
    }
    for (const [value, f] of found) {
      const members = f.group.gateways.map((i) => ids[i] as MemberId);
      observations.push({
        rule: 'onlyRoutes',
        ref: f.ref,
        members,
        group: { attribute, value },
        groups: f.pairs
          .map((p) => ({ attribute, value, other: p.a === value ? p.b : p.a, count: p.ties }))
          .sort((a, b) => b.count - a.count || (a.other < b.other ? -1 : 1)),
        evidence: {
          cutPoint: 0,
          gateways: members.length,
          size: f.group.size,
          ties: f.group.externalTies,
          layers: f.layers,
          maxGateways: T.maxGateways,
        },
        view: {
          layer: f.ref,
          sizeMetric: 'betweenness',
          layout: 'grouped',
          groupBy: attribute,
          filters: [],
          highlight: members,
          show: [],
        },
      });
    }
  }
  const cuts = new Map<number, { ref: LayerRef; cutOff: number[]; layers: number }>();
  for (const { ref, weights } of layers) {
    const adj = neighboursOf(weights, n);
    for (const v of articulationPoints(adj)) {
      const cutOff = partsWithout(adj, v)
        .slice(1)
        .flat()
        .sort((a, b) => a - b);
      if (cutOff.length < T.minCutOff) continue;
      const best = cuts.get(v);
      if (!best || cutOff.length > best.cutOff.length)
        cuts.set(v, { ref, cutOff, layers: (best?.layers ?? 0) + 1 });
      else best.layers += 1;
    }
  }
  const cutObservations = [...cuts]
    .sort(([a, x], [b, y]) => y.cutOff.length - x.cutOff.length || a - b)
    .map(([v, c]): Observation => {
      const member = ids[v] as MemberId;
      return {
        rule: 'onlyRoutes',
        ref: c.ref,
        members: [member],
        evidence: {
          cutPoint: 1,
          cutOff: c.cutOff.length,
          layers: c.layers,
          minCutOff: T.minCutOff,
        },
        view: {
          layer: c.ref,
          sizeMetric: 'betweenness',
          layout: 'force',
          groupBy: null,
          filters: [],
          highlight: [member, ...c.cutOff.map((i) => ids[i] as MemberId)],
          show: [],
        },
      };
    });
  observations.sort((a, b) => (a.evidence.gateways ?? 0) - (b.evidence.gateways ?? 0));
  return outcome('onlyRoutes', [...observations, ...cutObservations]);
}

// ------------------------------------------------------- concentrated demand

/**
 * Concentrated demand (build plan session 7), on the advice and workflow
 * dependency layers: ties received per member are read from the directed
 * ratings in either view (RefResult.load). An observation when the top
 * concentratedDemand.topShare of members (at least one) hold at least minShare
 * of at least minTies incoming ties; and for each group of the grouping
 * attribute with at least groupMinSize members and groupMinTies incoming ties
 * whose own top members hold at least groupMultiple times their even share.
 */
export function concentratedDemand(
  ids: readonly MemberId[],
  layers: readonly { ref: LayerRef; layer: LayerKey; load: LoadResult | null }[],
  directed: boolean,
  attributes: Readonly<Record<AttributeKey, AttributeColumn>>,
  chosen?: AttributeKey,
): InsightOutcome {
  const T = INSIGHT_RULES.concentratedDemand;
  const read = layers.filter((l) => T.layers.includes(l.layer));
  if (read.length === 0) return unavailable('concentratedDemand', 'layersNotEnabled');
  const attribute = groupAttribute(attributes, chosen);
  const sizeMetric: NodeMetricKey = directed ? 'inDegree' : 'degree';
  const observations: Observation[] = [];
  for (const { ref, load } of read) {
    if (!load) continue;
    const make = (share: LoadShare, group: string | null): Observation => {
      const members = Array.from(share.top, (i) => ids[i] as MemberId);
      return {
        rule: 'concentratedDemand',
        ref,
        members,
        ...(group !== null && attribute ? { group: { attribute, value: group } } : {}),
        evidence: {
          share: share.share,
          held: share.held,
          received: share.received,
          top: share.top.length,
          of: share.members,
          even: share.top.length / share.members,
          highest: load.incoming[share.top[0] as number] as number,
        },
        view: {
          layer: ref,
          sizeMetric,
          layout: group !== null && attribute ? 'grouped' : 'force',
          groupBy: group !== null && attribute ? attribute : null,
          filters: [],
          highlight: members,
          show: [],
        },
      };
    };
    const o = load.overall;
    if (o.received >= T.minTies && o.share >= T.minShare) observations.push(make(o, null));
    for (const g of attribute ? (load.byGroup[attribute] ?? []) : []) {
      if (g.members < T.groupMinSize || g.received < T.groupMinTies) continue;
      if (!(g.share >= T.groupMultiple * (g.top.length / g.members))) continue;
      observations.push(make(g, g.group));
    }
  }
  return outcome('concentratedDemand', observations);
}

// -------------------------------------------------------- negative clusters

/**
 * Negative clusters: on each signed layer, pairs who rate each other
 * negatively in both directions (read from the directed ratings in either
 * view), grouped into connected sets; a set of at least
 * INSIGHT_RULES.negativeCluster.minSize members is an observation. `signed`
 * holds each signed layer's directed ratings on the −1..1 scale, NaN = not
 * rated.
 */
export function negativeClusters(
  ids: readonly MemberId[],
  signed: ReadonlyMap<LayerKey, Float64Array>,
  drawLayer: LayerRef,
): InsightOutcome {
  const T = INSIGHT_RULES.negativeCluster;
  if (signed.size === 0) return unavailable('negativeCluster', 'noSignedLayer');
  const n = ids.length;
  const observations: Observation[] = [];
  for (const [layer, s] of signed) {
    const parent = [...Array(n).keys()];
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i] as number] as number;
        i = parent[i] as number;
      }
      return i;
    };
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if ((s[i * n + j] as number) < 0 && (s[j * n + i] as number) < 0) {
          pairs.push([i, j]);
          const a = find(i);
          const b = find(j);
          if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
        }
      }
    }
    const sets = new Map<number, number[]>();
    for (const [i, j] of pairs)
      for (const x of [i, j]) {
        const root = find(x);
        const list = sets.get(root) ?? [];
        if (!list.includes(x)) list.push(x);
        sets.set(root, list);
      }
    for (const [root, members] of sets) {
      if (members.length < T.minSize) continue;
      members.sort((a, b) => a - b);
      const within = pairs.filter(([i]) => find(i) === root).length;
      const memberIds = members.map((i) => ids[i] as MemberId);
      observations.push({
        rule: 'negativeCluster',
        ref: `${layer}-`,
        members: memberIds,
        evidence: { size: members.length, pairs: within },
        view: {
          layer: drawLayer,
          sizeMetric: 'betweenness',
          layout: 'force',
          groupBy: null,
          filters: [],
          highlight: memberIds,
          show: [layer],
        },
      });
    }
  }
  observations.sort((a, b) => (b.evidence.size ?? 0) - (a.evidence.size ?? 0));
  return outcome('negativeCluster', observations);
}

// ------------------------------------------------- one-way negative ratings

/**
 * Negative ratings not returned: on each signed layer, ratings below 0 whose
 * reverse rating is not below 0 (neutral, positive, or not given), read from
 * the directed ratings in either view. A layer with at least
 * INSIGHT_RULES.oneWayNegative.minCount such ratings is an observation, with
 * the counts by pair of groups (rater's group first) of the grouping
 * attribute. The members are everyone who gave or received one, most involved
 * first. Descriptive only: a rating that differs by direction may reflect
 * rating habits, a missing response or a real difference in experience.
 */
export function oneWayNegative(
  ids: readonly MemberId[],
  signed: ReadonlyMap<LayerKey, Float64Array>,
  drawLayer: LayerRef,
  attributes: Readonly<Record<AttributeKey, AttributeColumn>>,
  chosen?: AttributeKey,
): InsightOutcome {
  const T = INSIGHT_RULES.oneWayNegative;
  if (signed.size === 0) return unavailable('oneWayNegative', 'noSignedLayer');
  const n = ids.length;
  const attribute = groupAttribute(attributes, chosen);
  const values = attribute ? (attributes[attribute]?.values ?? []) : [];
  const observations: Observation[] = [];
  for (const [layer, s] of signed) {
    let negative = 0;
    let oneWay = 0;
    let notRated = 0;
    const involved = new Map<number, number>();
    const byGroups = new Map<string, { value: string; other: string; count: number }>();
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || !((s[i * n + j] as number) < 0)) continue;
        negative += 1;
        const back = s[j * n + i] as number;
        if (back < 0) continue;
        oneWay += 1;
        if (Number.isNaN(back)) notRated += 1;
        involved.set(i, (involved.get(i) ?? 0) + 1).set(j, (involved.get(j) ?? 0) + 1);
        const a = values[i] ?? null;
        const b = values[j] ?? null;
        if (attribute && a !== null && b !== null) {
          const key = `${a}\u0000${b}`;
          const g = byGroups.get(key) ?? { value: a, other: b, count: 0 };
          g.count += 1;
          byGroups.set(key, g);
        }
      }
    }
    if (oneWay < T.minCount) continue;
    const members = [...involved.keys()]
      .sort((a, b) => (involved.get(b) ?? 0) - (involved.get(a) ?? 0) || a - b)
      .map((i) => ids[i] as MemberId);
    const groups = [...byGroups.values()].sort(
      (x, y) => y.count - x.count || (x.value < y.value ? -1 : x.value > y.value ? 1 : 0),
    );
    observations.push({
      rule: 'oneWayNegative',
      ref: layer,
      members,
      ...(attribute ? { groups: groups.map((g) => ({ attribute, ...g })) } : {}),
      evidence: {
        count: oneWay,
        negative,
        returned: negative - oneWay,
        notRated,
        minCount: T.minCount,
      },
      view: {
        layer: drawLayer,
        sizeMetric: 'betweenness',
        layout: 'force',
        groupBy: null,
        filters: [],
        highlight: members,
        show: [layer],
        drawNegative: true,
      },
    });
  }
  observations.sort((a, b) => (b.evidence.count ?? 0) - (a.evidence.count ?? 0));
  return outcome('oneWayNegative', observations);
}

// ---------------------------------------------------- formal–informal gaps

/**
 * Formal/informal gaps, from the formal–informal classification
 * (multiplexity). Members are grouped by the grouping attribute
 * (groupAttribute: the project's choice, team by default), or taken as one
 * group without it. For every pair of groups, and every group with
 * itself, the share of formal ties with no informal counterpart is formal only
 * / (formal only + both); the reverse share uses informal only. A pair of
 * groups is an observation when the share is at least
 * INSIGHT_RULES.formalInformal.minShare and at least minPairs ties are
 * involved. Ties are ordered pairs in the directed view and unordered pairs in
 * the symmetrised view. Pairs with a missing rating on either layer are not
 * classified and not counted.
 */
export function formalInformalGaps(
  ids: readonly MemberId[],
  fi: MultiplexResult['formalInformal'],
  directed: boolean,
  attributes: Readonly<Record<AttributeKey, AttributeColumn>>,
  chosen?: AttributeKey,
): InsightOutcome[] {
  const T = INSIGHT_RULES.formalInformal;
  if (!fi) {
    return [
      unavailable('formalOnly', 'noFormalInformal'),
      unavailable('informalOnly', 'noFormalInformal'),
    ];
  }
  const n = ids.length;
  const attribute = groupAttribute(attributes, chosen);
  const values = attribute ? (attributes[attribute]?.values ?? []) : [];
  const groupOf = (i: number): string | null => (attribute ? (values[i] ?? null) : '');
  const key = (a: string, b: string) => (a <= b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  type Tally = {
    a: string;
    b: string;
    formalOnly: number;
    informalOnly: number;
    both: number;
    fo: Map<number, number>;
    io: Map<number, number>;
  };
  const tallies = new Map<string, Tally>();
  for (let i = 0; i < n; i++) {
    for (let j = directed ? 0 : i + 1; j < n; j++) {
      if (i === j) continue;
      const c = fi.classes[i * n + j];
      if (c !== FI_CLASS.formalOnly && c !== FI_CLASS.informalOnly && c !== FI_CLASS.both) continue;
      const gi = groupOf(i);
      const gj = groupOf(j);
      if (gi === null || gj === null) continue;
      const k = key(gi, gj);
      let t = tallies.get(k);
      if (!t) {
        const [a, b] = gi <= gj ? [gi, gj] : [gj, gi];
        t = { a, b, formalOnly: 0, informalOnly: 0, both: 0, fo: new Map(), io: new Map() };
        tallies.set(k, t);
      }
      if (c === FI_CLASS.both) t.both += 1;
      else if (c === FI_CLASS.formalOnly) {
        t.formalOnly += 1;
        t.fo.set(i, (t.fo.get(i) ?? 0) + 1).set(j, (t.fo.get(j) ?? 0) + 1);
      } else {
        t.informalOnly += 1;
        t.io.set(i, (t.io.get(i) ?? 0) + 1).set(j, (t.io.get(j) ?? 0) + 1);
      }
    }
  }
  const make = (rule: 'formalOnly' | 'informalOnly'): InsightOutcome => {
    const layer = rule === 'formalOnly' ? fi.formal : fi.informal;
    const observations: Observation[] = [];
    for (const t of tallies.values()) {
      const only = rule === 'formalOnly' ? t.formalOnly : t.informalOnly;
      const total = only + t.both;
      const share = total > 0 ? only / total : 0;
      if (only < T.minPairs || share < T.minShare) continue;
      const counts = rule === 'formalOnly' ? t.fo : t.io;
      const involved = [...counts.keys()]
        .sort((x, y) => (counts.get(y) ?? 0) - (counts.get(x) ?? 0) || x - y)
        .slice(0, T.maxMembers);
      const members = involved.map((i) => ids[i] as MemberId);
      const filterValues = t.a === t.b ? [t.a] : [t.a, t.b];
      observations.push({
        rule,
        ref: layer,
        members,
        ...(attribute ? { group: { attribute, value: t.a, other: t.b } } : {}),
        evidence: { pairs: only, total, share, directed: directed ? 1 : 0, minShare: T.minShare },
        view: {
          layer,
          sizeMetric: directed ? 'inDegree' : 'degree',
          layout: attribute ? 'grouped' : 'force',
          groupBy: attribute,
          filters: attribute ? [{ key: attribute, values: filterValues }] : [],
          highlight: members,
          show: [fi.formal, fi.informal],
        },
      });
    }
    observations.sort(
      (x, y) =>
        (y.evidence.share ?? 0) - (x.evidence.share ?? 0) ||
        (y.evidence.pairs ?? 0) - (x.evidence.pairs ?? 0),
    );
    return outcome(rule, observations);
  };
  return [make('formalOnly'), make('informalOnly')];
}

// --------------------------------------------------------------------- all

export interface InsightInput {
  ids: readonly MemberId[];
  directed: boolean;
  refs: Readonly<Record<LayerRef, RefResult>>;
  refOrder: readonly LayerRef[];
  attributes: Readonly<Record<AttributeKey, AttributeColumn>>;
  /** Signed layers' directed ratings on −1..1. */
  signed: ReadonlyMap<LayerKey, Float64Array>;
  multiplex: MultiplexResult | null;
  /** The project's grouping attribute for the group rules (settings.insight_group). */
  groupAttribute?: AttributeKey;
  /** Layer keys the silo and peripheral rules leave out (INSIGHT_RULES.excludedLayerGroups). */
  excludedLayers?: readonly LayerKey[];
  /** Per member, from coverage: gave no ratings or few (AnalysisResult.ratingFlags). */
  ratingFlags?: readonly (RatingFlag | null)[];
}

/**
 * The attribute values most members of an observation share (INSIGHT_RULES.shared),
 * leaving out the attribute the observation is about, and the members named who
 * gave no ratings.
 */
function describeMembers(
  o: Observation,
  ids: readonly MemberId[],
  attributes: Readonly<Record<AttributeKey, AttributeColumn>>,
  ratingFlags: readonly (RatingFlag | null)[],
): Observation {
  const S = INSIGHT_RULES.shared;
  const at = new Map(ids.map((id, i) => [id, i]));
  const idx = o.members.flatMap((id) => {
    const i = at.get(id);
    return i === undefined ? [] : [i];
  });
  const shared: NonNullable<Observation['shared']> = [];
  if (idx.length >= S.minMembers)
    for (const [key, column] of Object.entries(attributes)) {
      if (key === o.group?.attribute || key === o.groups?.[0]?.attribute) continue;
      const counts = new Map<string, number>();
      for (const i of idx) {
        const v = column.values[i];
        if (v !== null && v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      let best: [string, number] | null = null;
      for (const e of counts) if (!best || e[1] > best[1]) best = e;
      if (!best || best[1] <= idx.length * S.minShare) continue;
      const [value, count] = best;
      const overall = column.values.filter((v) => v === value).length;
      if (count / idx.length <= overall / ids.length) continue;
      shared.push({ attribute: key, value, count });
    }
  shared.sort((a, b) => b.count - a.count);
  const silent = idx
    .filter((i) => ratingFlags[i] === 'gaveNoRatings')
    .map((i) => ids[i] as MemberId);
  return {
    ...o,
    ...(shared.length > 0 ? { shared: shared.slice(0, S.maxAttributes) } : {}),
    ...(silent.length > 0 ? { noRatings: silent } : {}),
  };
}

/**
 * Silo and peripheral overlap (INSIGHT_RULES.overlap): for each silo group,
 * the peripheral members in it when they make up at least minGroupShare of the
 * group. The silo observation names how many, and the peripheral list leaves
 * them out.
 */
function mergeOverlap(
  ids: readonly MemberId[],
  silo: InsightOutcome,
  ranking: PeripheralRanking | null,
): { silo: InsightOutcome; inSilo: Set<number> } {
  const inSilo = new Set<number>();
  if (!ranking || silo.observations.length === 0) return { silo, inSilo };
  const index = new Map(ids.map((id, i) => [id, i]));
  const peripheral = new Set(ranking.ranked);
  const observations = silo.observations.map((o) => {
    const both = o.members.map((id) => index.get(id) as number).filter((i) => peripheral.has(i));
    if (both.length === 0 || both.length < INSIGHT_RULES.overlap.minGroupShare * o.members.length)
      return o;
    for (const i of both) inSilo.add(i);
    return { ...o, evidence: { ...o.evidence, alsoPeripheral: both.length } };
  });
  return { silo: { ...silo, observations }, inSilo };
}

/** Applies every rule, in panel order. */
export function observe(input: InsightInput): InsightOutcome[] {
  const { ids, directed, refs, refOrder } = input;
  const chosen = input.groupAttribute;
  const composite = refs[COMPOSITE];
  const excluded = new Set(input.excludedLayers ?? []);
  const layerTables = refOrder
    .map((ref) => refs[ref])
    .filter(
      (r): r is RefResult => r !== undefined && (r.kind === 'unsigned' || r.kind === 'positive'),
    )
    .map((r) => ({ ref: r.ref, node: r.node, layer: r.layer ?? r.ref }));
  // Conflict layers are not working ties (INSIGHT_RULES.excludedLayerGroups).
  const ruleTables = layerTables.filter((l) => !excluded.has(l.layer));
  // Negative clusters are drawn over the composite, or the first unsigned layer without one.
  const drawLayer =
    composite?.ref ?? refOrder.find((ref) => refs[ref]?.kind === 'unsigned') ?? COMPOSITE;
  const ranking = rankPeripheral(ids.length, ruleTables, directed);
  const merged = mergeOverlap(
    ids,
    silos(
      ids,
      [
        ...(composite ? [{ ref: composite.ref, network: composite.network }] : []),
        ...ruleTables
          .filter((l) => refs[l.ref]?.kind === 'unsigned')
          .map((l) => ({ ref: l.ref, network: (refs[l.ref] as RefResult).network })),
      ],
      input.attributes,
      chosen,
    ),
    ranking,
  );
  const working = ruleTables
    .map((l) => refs[l.ref] as RefResult)
    .filter((r) => r.kind === 'unsigned');
  const out: InsightOutcome[] = [
    composite
      ? potentialBrokers(ids, composite.ref, composite.node, directed)
      : unavailable('brokers', 'noComposite'),
    onlyRoutes(
      ids,
      [...(composite ? [composite] : []), ...working].map((r) => ({
        ref: r.ref,
        weights: r.weights,
      })),
      input.attributes,
      chosen,
    ),
    concentratedDemand(
      ids,
      layerTables
        .filter((l) => refs[l.ref]?.kind === 'unsigned')
        .map((l) => ({ ref: l.ref, layer: l.layer, load: (refs[l.ref] as RefResult).load })),
      directed,
      input.attributes,
      chosen,
    ),
    peripheralOutcome(ids, ranking, directed, merged.inSilo),
    possibleOverload(
      ids,
      layerTables.filter((l) => refs[l.ref]?.kind === 'unsigned'),
      directed,
    ),
    merged.silo,
    negativeClusters(ids, input.signed, drawLayer),
    oneWayNegative(ids, input.signed, drawLayer, input.attributes, chosen),
    ...formalInformalGaps(
      ids,
      input.multiplex?.formalInformal ?? null,
      directed,
      input.attributes,
      chosen,
    ),
  ];
  const flags = input.ratingFlags ?? [];
  return INSIGHT_RULE_ORDER.map((rule) => {
    const o = out.find((x) => x.rule === rule) ?? unavailable(rule, 'noLayers');
    return {
      ...o,
      observations: o.observations.map((ob) => describeMembers(ob, ids, input.attributes, flags)),
    };
  });
}
