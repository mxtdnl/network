// What changed between two waves (build plan session 15, docs/method-notes.md
// §21): one layer, one view, two analyses of the same survey run twice. Pure:
// it reads two AnalysisResults, so it runs in the worker after both analyses
// and in tests on any pair of results.
//
// Ties are compared only between members on both waves' rosters. A pair with
// a member in one wave only is never counted as gained or lost: those ties are
// reported apart, as ties of members who left or joined. A pair not rated in
// one of the waves (NaN) is reported as not comparable, never guessed.
// Network figures (density, E-I, the group matrix, load, bridges) are each
// wave's own, on its own roster, as each wave's analysis shows them.

import type {
  AnalysisResult,
  AttributeKey,
  GroupMixing,
  LayerRef,
  MemberId,
  NodeMetricKey,
  RefResult,
} from '../types';

/**
 * Thresholds for reading change (owner, build plan session 15). Weights are
 * on 0–1 (every layer is rescaled, CLAUDE.md D3), so 0.2 is one point on a
 * 0–5 scale.
 */
export const CHANGE_RULES = {
  /** A tie present in both waves is strengthened or weakened when its weight moves by at least this. */
  strengthen: 0.4,
  /** Change is reported only when both waves' coverage reaches this share. */
  minCoverage: 0.8,
  /** A pair of groups changed when its density moved by at least this (share of possible ties)… */
  groupDensity: 0.1,
  /** …and it had at least this many ties in one of the waves. */
  groupMinTies: 5,
  /** E-I changed when it moved by at least this. */
  ei: 0.2,
  /** The top 10 %'s share of incoming ties changed when it moved by at least this. */
  load: 0.1,
} as const;

export type TieChangeKind =
  | 'gained'
  | 'lost'
  | 'strengthened'
  | 'weakened'
  | 'steady'
  /** Not rated in one of the waves: not compared. */
  | 'notComparable';

export interface TieChange {
  from: MemberId;
  to: MemberId;
  before: number;
  after: number;
  kind: Exclude<TieChangeKind, 'steady'>;
}

export interface TieChangeCounts {
  gained: number;
  lost: number;
  strengthened: number;
  weakened: number;
  steady: number;
  notComparable: number;
}

export interface GroupPairChange {
  /** Row group (gives, in the directed view) and column group; equal on the diagonal. */
  from: string;
  to: string;
  before: { ties: number; possible: number; density: number } | null;
  after: { ties: number; possible: number; density: number } | null;
}

export interface MemberChange {
  id: MemberId;
  /** Ties the member gave and received (directed ratings), before and after. */
  given: [number, number];
  received: [number, number];
  /** Ties involving the member, by kind of change. */
  ties: TieChangeCounts;
  /** Node metrics in both waves, for the metrics the view reports; NaN where not defined. */
  metrics: Partial<Record<NodeMetricKey, [number, number]>>;
}

export interface WaveSideSummary {
  wave: number;
  members: number;
  ties: number;
  density: number;
  /** Coverage of the wave (rate), NaN without coverage. */
  coverage: number;
  /** E-I index by the grouping attribute, NaN without it. */
  ei: number;
  /** Share of incoming ties held by the top 10 %, NaN without load. */
  load: number;
  localBridges: number;
  cutPoints: MemberId[];
}

export interface WaveChange {
  ref: LayerRef;
  view: AnalysisResult['view'];
  symmetrise: AnalysisResult['symmetrise'];
  group: AttributeKey | null;
  before: WaveSideSummary;
  after: WaveSideSummary;
  /** Members on both rosters, on the earlier only, on the later only (each in the wave's own order). */
  members: { both: MemberId[]; left: MemberId[]; joined: MemberId[] };
  /** Both waves reach CHANGE_RULES.minCoverage, so change may be reported. */
  reportable: boolean;
  /** Pairs between members on both rosters, by kind of change. */
  counts: TieChangeCounts;
  /** Every pair whose tie changed or could not be compared (steady pairs left out). */
  ties: TieChange[];
  /** Ties in the earlier wave involving a member who left, and in the later involving one who joined. */
  leftTies: number;
  joinedTies: number;
  /** Local bridges present in one wave only, between members on both rosters (from < to). */
  bridges: { gained: [MemberId, MemberId][]; lost: [MemberId, MemberId][] };
  /** Each pair of groups (both waves' groups, earlier wave's order first). */
  groups: string[];
  groupPairs: GroupPairChange[];
  /** Members on both rosters, in the later wave's order. */
  perMember: MemberChange[];
}

const emptyCounts = (): TieChangeCounts => ({
  gained: 0,
  lost: 0,
  strengthened: 0,
  weakened: 0,
  steady: 0,
  notComparable: 0,
});

/** How a tie moved between two weights (0–1, NaN = not rated). Null when there is no tie in either. */
export function classifyTie(
  before: number,
  after: number,
  threshold: number = CHANGE_RULES.strengthen,
): TieChangeKind | null {
  // A tie in one wave and no rating in the other cannot be compared; with no
  // tie in the wave that was rated there is nothing to report.
  if (Number.isNaN(before) || Number.isNaN(after))
    return before > 0 || after > 0 ? 'notComparable' : null;
  const b = before > 0;
  const a = after > 0;
  if (!b && !a) return null;
  if (!b) return 'gained';
  if (!a) return 'lost';
  const d = after - before;
  // A tolerance keeps a move of exactly one scale step from being lost to rounding.
  if (d >= threshold - 1e-9) return 'strengthened';
  if (-d >= threshold - 1e-9) return 'weakened';
  return 'steady';
}

function countTies(w: Float64Array, n: number, directed: boolean, keep: (i: number) => boolean) {
  let ties = 0;
  for (let i = 0; i < n; i++) {
    for (let j = directed ? 0 : i + 1; j < n; j++) {
      if (i === j) continue;
      if ((w[i * n + j] as number) > 0 && (keep(i) || keep(j))) ties++;
    }
  }
  return ties;
}

function side(result: AnalysisResult, ref: RefResult, group: AttributeKey | null): WaveSideSummary {
  const mix = group ? ref.network.mixing[group] : undefined;
  return {
    wave: result.wave,
    members: result.memberIds.length,
    ties: ref.network.ties,
    density: ref.network.density,
    coverage: result.coverage?.rate ?? NaN,
    ei: mix?.ei ?? NaN,
    load: ref.load?.overall.share ?? NaN,
    localBridges: ref.ties?.localBridges.from.length ?? 0,
    cutPoints: ref.ties
      ? [...ref.ties.cutPoints.members].map((i) => result.memberIds[i] as MemberId)
      : [],
  };
}

function bridgeSet(result: AnalysisResult, ref: RefResult): Set<string> {
  const out = new Set<string>();
  const lb = ref.ties?.localBridges;
  if (!lb) return out;
  for (let k = 0; k < lb.from.length; k++) {
    const a = result.memberIds[lb.from[k] as number] as MemberId;
    const b = result.memberIds[lb.to[k] as number] as MemberId;
    out.add(a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  }
  return out;
}

function groupPairs(
  before: GroupMixing | undefined,
  after: GroupMixing | undefined,
  directed: boolean,
): { groups: string[]; pairs: GroupPairChange[] } {
  const groups = [...(before?.groups ?? [])];
  for (const g of after?.groups ?? []) if (!groups.includes(g)) groups.push(g);
  const cell = (mix: GroupMixing | undefined, a: string, b: string) => {
    if (!mix) return null;
    const r = mix.groups.indexOf(a);
    const c = mix.groups.indexOf(b);
    if (r < 0 || c < 0) return null;
    const k = mix.groups.length;
    const possible = mix.possible[r * k + c] as number;
    if (possible <= 0) return null;
    const ties = mix.ties[r * k + c] as number;
    return { ties, possible, density: ties / possible };
  };
  const pairs: GroupPairChange[] = [];
  for (let r = 0; r < groups.length; r++) {
    for (let c = directed ? 0 : r; c < groups.length; c++) {
      const a = groups[r] as string;
      const b = groups[c] as string;
      pairs.push({ from: a, to: b, before: cell(before, a, b), after: cell(after, a, b) });
    }
  }
  return { groups, pairs };
}

/** Ties given and received per member from a ref's directed reading (weights > 0). */
function givenReceived(
  result: AnalysisResult,
  ref: RefResult,
  directedWeights: Float64Array | null,
) {
  const n = result.memberIds.length;
  const w = directedWeights ?? ref.weights;
  const given = new Float64Array(n);
  const received = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && (w[i * n + j] as number) > 0) {
        given[i] = (given[i] as number) + 1;
        received[j] = (received[j] as number) + 1;
      }
    }
  }
  return { given, received };
}

export interface CompareOptions {
  /** Attribute for E-I and the group matrix; null leaves them out. */
  group: AttributeKey | null;
  strengthen?: number;
  minCoverage?: number;
  /**
   * The directed weights of the ref in each wave, for ties given and received
   * when the view is mutual (the result holds the view's weights only). Absent:
   * read from the view's weights.
   */
  directedBefore?: Float64Array;
  directedAfter?: Float64Array;
}

/**
 * Compares the same ref of two analyses (the earlier wave first). Both must be
 * in the same view and rule; the caller analyses each wave with the same weights
 * and options.
 */
export function compareWaves(
  before: AnalysisResult,
  after: AnalysisResult,
  refKey: LayerRef,
  options: CompareOptions,
): WaveChange {
  const rb = before.refs[refKey];
  const ra = after.refs[refKey];
  if (!rb || !ra) throw new Error(`Layer ${refKey} is not in both analyses.`);
  if (before.view !== after.view || before.symmetrise !== after.symmetrise)
    throw new Error('Both waves must be analysed in the same view.');
  const strengthen = options.strengthen ?? CHANGE_RULES.strengthen;
  const minCoverage = options.minCoverage ?? CHANGE_RULES.minCoverage;
  const directed = before.view === 'directed';
  const group = options.group;

  const ib = new Map(before.memberIds.map((id, i) => [id, i]));
  const ia = new Map(after.memberIds.map((id, i) => [id, i]));
  const both = after.memberIds.filter((id) => ib.has(id));
  const left = before.memberIds.filter((id) => !ia.has(id));
  const joined = after.memberIds.filter((id) => !ib.has(id));
  const nb = before.memberIds.length;
  const na = after.memberIds.length;

  const counts = emptyCounts();
  const ties: TieChange[] = [];
  const perMemberCounts = new Map(both.map((id) => [id, emptyCounts()]));
  for (let x = 0; x < both.length; x++) {
    for (let y = directed ? 0 : x + 1; y < both.length; y++) {
      if (x === y) continue;
      // Mutual weights are symmetric; read each unordered pair in the earlier wave's order.
      const p = both[x] as MemberId;
      const q = both[y] as MemberId;
      const [from, to] =
        directed || (ib.get(p) as number) < (ib.get(q) as number) ? [p, q] : [q, p];
      const bi = ib.get(from) as number;
      const bj = ib.get(to) as number;
      const ai = ia.get(from) as number;
      const aj = ia.get(to) as number;
      const wb = rb.weights[bi * nb + bj] as number;
      const wa = ra.weights[ai * na + aj] as number;
      const kind = classifyTie(wb, wa, strengthen);
      if (kind === null) continue;
      counts[kind]++;
      const pf = perMemberCounts.get(from) as TieChangeCounts;
      const pt = perMemberCounts.get(to) as TieChangeCounts;
      pf[kind]++;
      pt[kind]++;
      if (kind !== 'steady') ties.push({ from, to, before: wb, after: wa, kind });
    }
  }

  const leftSet = new Set(left.map((id) => ib.get(id) as number));
  const joinedSet = new Set(joined.map((id) => ia.get(id) as number));
  const leftTies = countTies(rb.weights, nb, directed, (i) => leftSet.has(i));
  const joinedTies = countTies(ra.weights, na, directed, (i) => joinedSet.has(i));

  const sb = bridgeSet(before, rb);
  const sa = bridgeSet(after, ra);
  const onBoth = (key: string) => {
    const [a, b] = key.split('\u0000') as [MemberId, MemberId];
    return ib.has(a) && ib.has(b) && ia.has(a) && ia.has(b);
  };
  const split = (key: string) => key.split('\u0000') as [MemberId, MemberId];
  const bridges = {
    gained: [...sa]
      .filter((k) => !sb.has(k) && onBoth(k))
      .map(split)
      .sort(),
    lost: [...sb]
      .filter((k) => !sa.has(k) && onBoth(k))
      .map(split)
      .sort(),
  };

  const { groups, pairs } = groupPairs(
    group ? rb.network.mixing[group] : undefined,
    group ? ra.network.mixing[group] : undefined,
    directed,
  );

  const grb = givenReceived(before, rb, options.directedBefore ?? null);
  const gra = givenReceived(after, ra, options.directedAfter ?? null);
  const metricKeys = Object.keys(ra.node.columns) as NodeMetricKey[];
  const perMember: MemberChange[] = both.map((id) => {
    const b = ib.get(id) as number;
    const a = ia.get(id) as number;
    const metrics: Partial<Record<NodeMetricKey, [number, number]>> = {};
    for (const k of metricKeys) {
      const cb = rb.node.columns[k];
      const ca = ra.node.columns[k];
      if (cb && ca) metrics[k] = [cb[b] as number, ca[a] as number];
    }
    return {
      id,
      given: [grb.given[b] as number, gra.given[a] as number],
      received: [grb.received[b] as number, gra.received[a] as number],
      ties: perMemberCounts.get(id) as TieChangeCounts,
      metrics,
    };
  });

  const sideBefore = side(before, rb, group);
  const sideAfter = side(after, ra, group);
  const covered = (c: number) => Number.isNaN(c) || c >= minCoverage - 1e-9;
  return {
    ref: refKey,
    view: before.view,
    symmetrise: before.symmetrise,
    group,
    before: sideBefore,
    after: sideAfter,
    members: { both, left, joined },
    reportable: covered(sideBefore.coverage) && covered(sideAfter.coverage),
    counts,
    ties,
    leftTies,
    joinedTies,
    bridges,
    groups,
    groupPairs: pairs,
    perMember,
  };
}
