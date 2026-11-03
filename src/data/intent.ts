// Assessment against intent (build plan session 16, method notes §24): for each pair of groups
// the client gave an expected level of collaboration, the share of the possible pairs of members
// between the two groups that are tied, compared with the level's band. Pure; the caller passes
// one layer's weights in the view on screen (RefResult.weights).

import type { AttributeKey, Engagement, ExpectedLevel, MemberId } from './schema';
import { EXPECTED_LEVELS } from './schema';

export const INTENT_RULES = {
  /** A pair of members counts as tied at or above this weight (the map's default lower bound, D129). */
  minWeight: 0.3,
  /** Bands of the share of possible pairs tied, [lower, upper), per expected level. */
  bands: {
    none: [0, 0.05],
    occasional: [0.05, 0.15],
    regular: [0.15, 0.4],
    close: [0.4, Infinity],
  } satisfies Record<ExpectedLevel, readonly [number, number]>,
  /** Below this many possible pairs the share is noted as resting on few pairs. */
  fewPairs: 10,
  /** Tolerance on band edges and the weight. */
  tolerance: 1e-9,
} as const;

export type IntentVerdict = 'below' | 'within' | 'above';

export interface PairAssessment {
  attribute: AttributeKey;
  a: string;
  b: string;
  expected: ExpectedLevel;
  /** Pairs of members tied (either direction in the directed view). */
  tied: number;
  /** Pairs of members possible between the two groups. */
  possible: number;
  /** tied / possible; NaN when nothing is possible. */
  share: number;
  /** Null when no pair is possible (a group has no member in this wave). */
  verdict: IntentVerdict | null;
  few: boolean;
}

export interface IntentInput {
  /** n × n weights (0–1, NaN not rated) in member order. */
  weights: Float64Array;
  memberIds: readonly MemberId[];
  /** Each member's value of the attribute, in member order (null: none). */
  values: readonly (string | null)[];
  directed: boolean;
}

export function verdictFor(level: ExpectedLevel, share: number): IntentVerdict {
  const [lo, hi] = INTENT_RULES.bands[level];
  const t = INTENT_RULES.tolerance;
  if (share < lo - t) return 'below';
  if (share >= hi - t) return 'above';
  return 'within';
}

/** Ties and possible pairs between two groups of members. */
export function pairCounts(input: IntentInput, a: string, b: string) {
  const { weights, values, directed } = input;
  const n = input.memberIds.length;
  const min = INTENT_RULES.minWeight - INTENT_RULES.tolerance;
  const tiedAt = (i: number, j: number) => {
    const w = weights[i * n + j] ?? NaN;
    return w > 0 && w >= min;
  };
  let tied = 0;
  let possible = 0;
  for (let i = 0; i < n; i++) {
    const vi = values[i];
    if (vi !== a && vi !== b) continue;
    for (let j = i + 1; j < n; j++) {
      const vj = values[j];
      // The pair joins one member of each group (both of one group when a = b).
      if (!((vi === a && vj === b) || (vi === b && vj === a))) continue;
      possible++;
      if (tiedAt(i, j) || (directed && tiedAt(j, i))) tied++;
    }
  }
  return { tied, possible };
}

/** Every expected pair of `attribute`, assessed, in the order the analyst set them. */
export function assessIntent(
  engagement: Engagement,
  attribute: AttributeKey,
  input: IntentInput,
): PairAssessment[] {
  return engagement.intent.pairs
    .filter((p) => p.attribute === attribute)
    .map((p) => {
      const { tied, possible } = pairCounts(input, p.a, p.b);
      const share = possible > 0 ? tied / possible : NaN;
      return {
        attribute,
        a: p.a,
        b: p.b,
        expected: p.level,
        tied,
        possible,
        share,
        verdict: possible > 0 ? verdictFor(p.level, share) : null,
        few: possible > 0 && possible < INTENT_RULES.fewPairs,
      };
    })
    .sort(
      (x, y) =>
        EXPECTED_LEVELS.indexOf(y.expected) - EXPECTED_LEVELS.indexOf(x.expected) ||
        x.a.localeCompare(y.a) ||
        x.b.localeCompare(y.b),
    );
}

/** The share of possible pairs tied within one group, and between it and everyone else. */
export function groupShares(input: IntentInput, value: string) {
  const { weights, values, directed } = input;
  const n = input.memberIds.length;
  const min = INTENT_RULES.minWeight - INTENT_RULES.tolerance;
  const tiedAt = (i: number, j: number) => {
    const w = weights[i * n + j] ?? NaN;
    return w > 0 && w >= min;
  };
  let inside = 0;
  let insidePossible = 0;
  let outside = 0;
  let outsidePossible = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ini = values[i] === value;
      const inj = values[j] === value;
      if (!ini && !inj) continue;
      // Members without a value are left out of "everyone else".
      if ((!ini && values[i] === null) || (!inj && values[j] === null)) continue;
      const t = tiedAt(i, j) || (directed && tiedAt(j, i)) ? 1 : 0;
      if (ini && inj) {
        insidePossible++;
        inside += t;
      } else {
        outsidePossible++;
        outside += t;
      }
    }
  }
  return {
    inside,
    insidePossible,
    outside,
    outsidePossible,
    insideShare: insidePossible > 0 ? inside / insidePossible : NaN,
    outsideShare: outsidePossible > 0 ? outside / outsidePossible : NaN,
  };
}
