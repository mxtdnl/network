// Load concentration (build plan session 7, docs/method-notes.md §16): how
// many ties each member receives, read from the directed ratings in either
// view, and the share of them held by the members who receive most.

import type { AttributeColumn, AttributeKey, GroupLoad, LoadResult, LoadShare } from '../types';

/** Share of members counted as the top: 10 %, at least one member. */
export const LOAD_TOP_SHARE = 0.1;

/** Ties received per member: raters j with w[j → i] > 0 (NaN = not rated counts as none). */
export function incomingTies(directed: Float64Array, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (i !== j && (directed[j * n + i] as number) > 0) out[i] = (out[i] as number) + 1;
    }
  }
  return out;
}

/**
 * Among `members`, the ⌈topShare · m⌉ (at least one) who receive most ties,
 * highest first and then in member order, and their share of the ties the
 * members receive. The share does not depend on how a tie at the cut is
 * broken. NaN when the members receive no ties.
 */
export function loadShare(
  incoming: ArrayLike<number>,
  members: readonly number[],
  topShare = LOAD_TOP_SHARE,
): LoadShare {
  const k = Math.max(1, Math.ceil(topShare * members.length));
  const ranked = [...members].sort(
    (a, b) => (incoming[b] as number) - (incoming[a] as number) || a - b,
  );
  const top = ranked.slice(0, k);
  let received = 0;
  for (const i of members) received += incoming[i] as number;
  let held = 0;
  for (const i of top) held += incoming[i] as number;
  return {
    members: members.length,
    top: Int32Array.from(top),
    received,
    held,
    share: received > 0 ? held / received : NaN,
  };
}

/** Load concentration overall and within each group of every attribute. */
export function loadConcentration(
  directed: Float64Array,
  n: number,
  attributes: Readonly<Record<AttributeKey, AttributeColumn>>,
): LoadResult {
  const incoming = incomingTies(directed, n);
  const all = [...Array(n).keys()];
  const byGroup: Record<AttributeKey, GroupLoad[]> = {};
  for (const [key, column] of Object.entries(attributes)) {
    const order = [...column.categories];
    for (const v of column.values) if (v !== null && !order.includes(v)) order.push(v);
    byGroup[key] = order.flatMap((group) => {
      const members = all.filter((i) => column.values[i] === group);
      return members.length === 0 ? [] : [{ group, ...loadShare(incoming, members) }];
    });
  }
  return { incoming, topShare: LOAD_TOP_SHARE, overall: loadShare(incoming, all), byGroup };
}
