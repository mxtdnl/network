// What changed between two waves (build plan session 15, docs/method-notes.md
// §23): one layer, one view, two analyses of the same survey run twice. Pure
// and cheap (one pass over the pairs): the two analyses run on the engine
// worker, and this reads their results wherever they are, as subgroup.ts does
// for the linked views (CLAUDE.md D67).
//
// Ties are compared only between members on both waves' rosters. A pair with
// a member in one wave only is never counted as gained or lost: those ties are
// reported apart, as ties of members who left or joined. A pair rated in one
// wave and not the other (NaN) is reported as not comparable, never guessed.
// Network figures (density, E-I, the group matrix, load, bridges) are each
// wave's own, on its own roster, as each wave's analysis shows them.

import type {
  AnalysisResult,
  AttributeColumn,
  AttributeKey,
  GroupMixing,
  LayerRef,
  MemberId,
  NodeMetricKey,
  RefResult,
} from '../types';

/**
 * Thresholds for reading change (owner, build plan session 15). Weights are on
 * 0–1 (every layer is rescaled, CLAUDE.md D3), so 0.2 is one point on a 0–5
 * scale. The minimum coverage is the project's coverage threshold, passed in.
 */
export const CHANGE_RULES = {
  /** A tie in both waves is strengthened or weakened when its weight moves by at least this (two points on 0–5). */
  strengthen: 0.4,
  /** A pair of groups changed when its density moved by at least this (share of possible ties)… */
  groupDensity: 0.1,
  /** …and it had at least this many ties in one of the waves. */
  groupMinTies: 5,
  /** The E-I index changed when it moved by at least this. */
  ei: 0.2,
  /** The top 10 %'s share of incoming ties changed when it moved by at least this. */
  load: 0.1,
} as const;

/** Tolerance for a move of exactly a threshold, so rounding does not lose it. */
const TOLERANCE = 1e-9;

export type TieChangeKind =
  | 'gained'
  | 'lost'
  | 'strengthened'
  | 'weakened'
  | 'steady'
  /** A tie in one wave and no rating in the other: not compared. */
  | 'notComparable';

export interface TieChange {
  from: MemberId;
  to: MemberId;
  before: number;
  after: number;
  kind: Exclude<TieChangeKind, 'steady'>;
}

export type TieChangeCounts = Record<TieChangeKind, number>;

export interface GroupCell {
  ties: number;
  possible: number;
  density: number;
}

export interface GroupPairChange {
  /** Row group (gives, in the directed view) and column group; equal on the diagonal. */
  from: string;
  to: string;
  before: GroupCell | null;
  after: GroupCell | null;
  /** Both groups reach the minimum coverage in both waves. */
  covered: boolean;
}

export interface MemberChange {
  id: MemberId;
  /** Ties received (directed ratings, in either view), before and after. */
  received: [number, number];
  /** Ties given (directed view); NaN in the mutual view, where a tie has no giver. */
  given: [number, number];
  /** Pairs involving the member, by kind of change. */
  ties: TieChangeCounts;
  /** Node metrics in both waves; NaN where not defined. */
  metrics: Partial<Record<NodeMetricKey, [number, number]>>;
}

export interface WaveSideSummary {
  wave: number;
  members: number;
  ties: number;
  density: number;
  /** Coverage of the wave; NaN without coverage. */
  coverage: number;
  /** E-I index by the grouping attribute; NaN without it. */
  ei: number;
  /** Share of incoming ties held by the top 10 %; NaN without load. */
  load: number;
  localBridges: number;
  cutPoints: MemberId[];
  /** Coverage per group of the grouping attribute. */
  groupCoverage: Record<string, number>;
  /** Members per group of the grouping attribute. */
  groupSizes: Record<string, number>;
}

export interface WaveChange {
  ref: LayerRef;
  view: AnalysisResult['view'];
  symmetrise: AnalysisResult['symmetrise'];
  group: AttributeKey | null;
  minCoverage: number;
  before: WaveSideSummary;
  after: WaveSideSummary;
  /** Members on both rosters (later wave's order), on the earlier only, on the later only. */
  members: { both: MemberId[]; left: MemberId[]; joined: MemberId[] };
  /** Both waves reach the minimum coverage, so change may be reported. */
  reportable: boolean;
  /** Pairs between members on both rosters, by kind of change. */
  counts: TieChangeCounts;
  /** Every pair that changed or could not be compared (steady pairs left out). */
  ties: TieChange[];
  /** Ties in the earlier wave involving a member who left; in the later, a member who joined. */
  leftTies: number;
  joinedTies: number;
  /** Local bridges in one wave only, between members on both rosters (from < to by id). */
  bridges: { gained: [MemberId, MemberId][]; lost: [MemberId, MemberId][] };
  /** Groups of both waves, the earlier wave's order first. */
  groups: string[];
  groupPairs: GroupPairChange[];
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

/** How a tie moved between two weights (0–1, NaN = not rated); null when there is no tie to compare. */
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
  if (d >= threshold - TOLERANCE) return 'strengthened';
  if (-d >= threshold - TOLERANCE) return 'weakened';
  return 'steady';
}

function countTies(w: Float64Array, n: number, directed: boolean, keep: (i: number) => boolean) {
  let ties = 0;
  for (let i = 0; i < n; i++) {
    for (let j = directed ? 0 : i + 1; j < n; j++) {
      if (i !== j && (w[i * n + j] as number) > 0 && (keep(i) || keep(j))) ties++;
    }
  }
  return ties;
}

function groupCoverage(result: AnalysisResult, column: AttributeColumn | undefined) {
  const out: Record<string, number> = {};
  if (!column || !result.coverage) return out;
  const index = new Map(result.memberIds.map((id, i) => [id, i]));
  const sums = new Map<string, [number, number]>();
  for (const r of result.coverage.raters) {
    const i = index.get(r.id);
    const g = i === undefined ? null : (column.values[i] ?? null);
    if (g === null) continue;
    const s = sums.get(g) ?? [0, 0];
    s[0] += r.rated;
    s[1] += r.possible;
    sums.set(g, s);
  }
  for (const [g, [rated, possible]] of sums) out[g] = possible > 0 ? rated / possible : NaN;
  return out;
}

function side(
  result: AnalysisResult,
  ref: RefResult,
  group: AttributeKey | null,
  column: AttributeColumn | undefined,
): WaveSideSummary {
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
    groupCoverage: groupCoverage(result, column),
    groupSizes: Object.fromEntries((mix?.perGroup ?? []).map((g) => [g.group, g.size])),
  };
}

const pairKey = (a: MemberId, b: MemberId) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

function bridgeSet(result: AnalysisResult, ref: RefResult): Set<string> {
  const out = new Set<string>();
  const lb = ref.ties?.localBridges;
  if (!lb) return out;
  for (let k = 0; k < lb.from.length; k++) {
    out.add(
      pairKey(
        result.memberIds[lb.from[k] as number] as MemberId,
        result.memberIds[lb.to[k] as number] as MemberId,
      ),
    );
  }
  return out;
}

function cell(mix: GroupMixing | undefined, a: string, b: string): GroupCell | null {
  if (!mix) return null;
  const r = mix.groups.indexOf(a);
  const c = mix.groups.indexOf(b);
  if (r < 0 || c < 0) return null;
  const k = mix.groups.length;
  const possible = mix.possible[r * k + c] as number;
  if (!(possible > 0)) return null;
  const ties = mix.ties[r * k + c] as number;
  return { ties, possible, density: ties / possible };
}

function givenReceived(result: AnalysisResult, ref: RefResult) {
  const n = result.memberIds.length;
  const directed = result.view === 'directed';
  const given = new Float64Array(n).fill(directed ? 0 : NaN);
  if (directed) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j && (ref.weights[i * n + j] as number) > 0) given[i] = (given[i] as number) + 1;
      }
    }
  }
  return { given, received: ref.load?.incoming ?? new Float64Array(n).fill(NaN) };
}

export interface CompareOptions {
  /** Attribute for E-I, the group matrix and group coverage; null leaves them out. */
  group: AttributeKey | null;
  /** The grouping attribute's column in each wave (input.attributes), for group coverage. */
  columns?: { before: AttributeColumn | undefined; after: AttributeColumn | undefined } | undefined;
  /** The minimum coverage in both waves (the project's coverage threshold). */
  minCoverage: number;
  strengthen?: number;
}

/**
 * Compares the same ref of two analyses, the earlier wave first. Both must be
 * in the same view and rule; the caller analyses each wave with the same
 * weights and options.
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
  const { minCoverage, group } = options;
  const directed = before.view === 'directed';

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
      const p = both[x] as MemberId;
      const q = both[y] as MemberId;
      // A mutual pair is read in the earlier wave's order, so `from` is the same member in both.
      const [from, to] =
        directed || (ib.get(p) as number) < (ib.get(q) as number) ? [p, q] : [q, p];
      const wb = rb.weights[(ib.get(from) as number) * nb + (ib.get(to) as number)] as number;
      const wa = ra.weights[(ia.get(from) as number) * na + (ia.get(to) as number)] as number;
      const kind = classifyTie(wb, wa, strengthen);
      if (kind === null) continue;
      counts[kind]++;
      (perMemberCounts.get(from) as TieChangeCounts)[kind]++;
      (perMemberCounts.get(to) as TieChangeCounts)[kind]++;
      if (kind !== 'steady') ties.push({ from, to, before: wb, after: wa, kind });
    }
  }

  const leftSet = new Set(left.map((id) => ib.get(id) as number));
  const joinedSet = new Set(joined.map((id) => ia.get(id) as number));

  const sb = bridgeSet(before, rb);
  const sa = bridgeSet(after, ra);
  const onBoth = (key: string) => key.split('\u0000').every((id) => ib.has(id) && ia.has(id));
  const split = (key: string) => key.split('\u0000') as [MemberId, MemberId];
  const bridges = {
    gained: [...sa]
      .filter((k) => !sb.has(k) && onBoth(k))
      .sort()
      .map(split),
    lost: [...sb]
      .filter((k) => !sa.has(k) && onBoth(k))
      .sort()
      .map(split),
  };

  const sideBefore = side(before, rb, group, options.columns?.before);
  const sideAfter = side(after, ra, group, options.columns?.after);
  const reaches = (c: number | undefined) =>
    c === undefined || Number.isNaN(c) || c >= minCoverage - TOLERANCE;
  const groupCovered = (g: string) =>
    reaches(sideBefore.groupCoverage[g]) && reaches(sideAfter.groupCoverage[g]);

  const mb = group ? rb.network.mixing[group] : undefined;
  const ma = group ? ra.network.mixing[group] : undefined;
  const groups = [...(mb?.groups ?? [])];
  for (const g of ma?.groups ?? []) if (!groups.includes(g)) groups.push(g);
  const groupPairs: GroupPairChange[] = [];
  for (let r = 0; r < groups.length; r++) {
    for (let c = directed ? 0 : r; c < groups.length; c++) {
      const a = groups[r] as string;
      const b = groups[c] as string;
      groupPairs.push({
        from: a,
        to: b,
        before: cell(mb, a, b),
        after: cell(ma, a, b),
        covered: groupCovered(a) && groupCovered(b),
      });
    }
  }

  const grb = givenReceived(before, rb);
  const gra = givenReceived(after, ra);
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
      received: [grb.received[b] as number, gra.received[a] as number],
      given: [grb.given[b] as number, gra.given[a] as number],
      ties: perMemberCounts.get(id) as TieChangeCounts,
      metrics,
    };
  });

  return {
    ref: refKey,
    view: before.view,
    symmetrise: before.symmetrise,
    group,
    minCoverage,
    before: sideBefore,
    after: sideAfter,
    members: { both, left, joined },
    reportable: reaches(sideBefore.coverage) && reaches(sideAfter.coverage),
    counts,
    ties,
    leftTies: countTies(rb.weights, nb, directed, (i) => leftSet.has(i)),
    joinedTies: countTies(ra.weights, na, directed, (i) => joinedSet.has(i)),
    bridges,
    groups,
    groupPairs,
    perMember,
  };
}

// ------------------------------------------------------------ observations

/**
 * Structured change observations (wording in ui/copy/change.ts, D9). Each is
 * worded as a question about what lies behind the change, never as a verdict.
 */
export type ChangeObservation =
  | { kind: 'groupPair'; from: string; to: string; before: GroupCell; after: GroupCell }
  | { kind: 'ei'; before: number; after: number }
  | { kind: 'load'; before: number; after: number }
  | { kind: 'bridges'; gained: number; lost: number }
  /** A cut point in one wave only; `onRoster` false when the member is not on the other wave's roster. */
  | { kind: 'cutPoint'; member: MemberId; wave: 'before' | 'after'; onRoster: boolean };

export interface ChangeObservations {
  /** 'lowCoverage': a wave is below the minimum coverage, so nothing is drafted. */
  withheld: 'lowCoverage' | null;
  observations: ChangeObservation[];
  /** Pairs of groups that moved past the thresholds but are left out because a group is below the minimum coverage. */
  groupsWithheld: number;
}

/** The group pairs whose density moved past CHANGE_RULES, largest move first. */
export function changedGroupPairs(change: WaveChange, covered = true): GroupPairChange[] {
  return change.groupPairs
    .filter(
      (p) =>
        p.before !== null &&
        p.after !== null &&
        Math.abs(p.after.density - p.before.density) >= CHANGE_RULES.groupDensity - TOLERANCE &&
        Math.max(p.after.ties, p.before.ties) >= CHANGE_RULES.groupMinTies &&
        (!covered || p.covered),
    )
    .sort(
      (p, q) =>
        Math.abs((q.after?.density ?? 0) - (q.before?.density ?? 0)) -
        Math.abs((p.after?.density ?? 0) - (p.before?.density ?? 0)),
    );
}

export function changeObservations(change: WaveChange): ChangeObservations {
  if (!change.reportable) return { withheld: 'lowCoverage', observations: [], groupsWithheld: 0 };
  const out: ChangeObservation[] = [];
  const pairs = changedGroupPairs(change);
  for (const p of pairs) {
    out.push({
      kind: 'groupPair',
      from: p.from,
      to: p.to,
      before: p.before as GroupCell,
      after: p.after as GroupCell,
    });
  }
  const { before: b, after: a } = change;
  if (Math.abs(a.ei - b.ei) >= CHANGE_RULES.ei - TOLERANCE)
    out.push({ kind: 'ei', before: b.ei, after: a.ei });
  if (Math.abs(a.load - b.load) >= CHANGE_RULES.load - TOLERANCE)
    out.push({ kind: 'load', before: b.load, after: a.load });
  if (change.bridges.gained.length + change.bridges.lost.length > 0)
    out.push({
      kind: 'bridges',
      gained: change.bridges.gained.length,
      lost: change.bridges.lost.length,
    });
  const onBefore = new Set([...change.members.both, ...change.members.left]);
  const onAfter = new Set([...change.members.both, ...change.members.joined]);
  for (const m of b.cutPoints)
    if (!a.cutPoints.includes(m))
      out.push({ kind: 'cutPoint', member: m, wave: 'before', onRoster: onAfter.has(m) });
  for (const m of a.cutPoints)
    if (!b.cutPoints.includes(m))
      out.push({ kind: 'cutPoint', member: m, wave: 'after', onRoster: onBefore.has(m) });
  return {
    withheld: null,
    observations: out,
    groupsWithheld: changedGroupPairs(change, false).length - pairs.length,
  };
}
