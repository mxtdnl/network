// Remedies for data problems the data-quality checks show (build plan
// session 5; docs/method-notes.md §14). Each is an analysis option, off by
// default, applied in `prepare` (ratings and weights) or after the metrics
// (members who gave no ratings):
//
// - reconstruction: on a layer that is mutual by nature, a member who gave no
//   ratings is given, for each colleague who rated them, that colleague's
//   rating as their own (j → i := i → j). Only missing directions are filled,
//   and only for members who gave no ratings at all.
// - rater standardisation: each rater's ties on an unsigned layer (weights
//   above 0) are re-expressed within that rater, so a rater who rates
//   everyone high and one who rates everyone low contribute the same spread.
//   A rated 0 stays 0 and a missing rating stays missing, so standardisation
//   changes how strong ties are, never which ties exist.
// - leaving out: values that depend on a member's own ratings are not
//   defined for members who gave no ratings, and the member-level rules do
//   not name or count them.

import type { NodeFlag, NodeMetricKey, NodeMetricTable, StandardiseMethod } from './types';

/**
 * Fills each missing direction j → i, for j in `silent`, from i → j. Returns
 * the filled ratings (a copy) and a 0/1 mask of the cells filled.
 */
export function reconstruct(
  ratings: Float64Array,
  n: number,
  silent: ReadonlySet<number>,
): { ratings: Float64Array; filled: Uint8Array; count: number } {
  const out = ratings.slice();
  const filled = new Uint8Array(n * n);
  let count = 0;
  for (const j of silent) {
    for (let i = 0; i < n; i++) {
      if (i === j) continue;
      const back = out[j * n + i] as number;
      const given = ratings[i * n + j] as number;
      if (!Number.isNaN(back) || Number.isNaN(given) || silent.has(i)) continue;
      out[j * n + i] = given;
      filled[j * n + i] = 1;
      count += 1;
    }
  }
  return { ratings: out, filled, count };
}

/** Average ranks (1-based) of `values`, ties sharing their mean rank. */
function averageRanks(values: readonly number[]): number[] {
  const order = values.map((v, k) => [v, k] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(values.length);
  for (let a = 0; a < order.length;) {
    let b = a;
    while (b + 1 < order.length && order[b + 1]?.[0] === order[a]?.[0]) b += 1;
    const mean = (a + b) / 2 + 1;
    for (let k = a; k <= b; k++) ranks[(order[k] as readonly [number, number])[1]] = mean;
    a = b + 1;
  }
  return ranks;
}

/**
 * Standardises each rater's (row's) weights above 0 within that rater.
 *
 *   rank  w' = (rank − 0.5) / k, average ranks over the rater's k ties, so
 *         ties spread evenly over (0, 1) and a rater whose ties are all equal
 *         (or who has one) gets 0.5 for each.
 *   z     w' = clamp(μ + σ·(w − μ_i)/σ_i, step, 1), with μ_i, σ_i the rater's
 *         mean and standard deviation over their ties and μ, σ those of every
 *         tie on the layer; a rater with one tie, or all ties equal, gets μ.
 *         `step` is the layer's smallest scale step, 1 / (max − min), so a
 *         tie never becomes 0.
 *
 * Rows in `skip` (members who gave no ratings) are left as they are.
 */
export function standardiseRows(
  w: Float64Array,
  n: number,
  method: StandardiseMethod,
  step: number,
  skip: ReadonlySet<number> = new Set(),
): Float64Array {
  const out = w.slice();
  if (method === 'none') return out;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    if (!skip.has(i))
      for (let j = 0; j < n; j++) if (i !== j && (w[i * n + j] as number) > 0) row.push(j);
    rows.push(row);
  }
  if (method === 'rank') {
    rows.forEach((row, i) => {
      const ranks = averageRanks(row.map((j) => w[i * n + j] as number));
      row.forEach((j, k) => {
        out[i * n + j] = ((ranks[k] as number) - 0.5) / row.length;
      });
    });
    return out;
  }
  const all = rows.flatMap((row, i) => row.map((j) => w[i * n + j] as number));
  if (all.length === 0) return out;
  const mu = all.reduce((s, x) => s + x, 0) / all.length;
  const sigma = Math.sqrt(all.reduce((s, x) => s + (x - mu) ** 2, 0) / all.length);
  rows.forEach((row, i) => {
    if (row.length === 0) return;
    const xs = row.map((j) => w[i * n + j] as number);
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
    row.forEach((j, k) => {
      const z = sd > 0 ? ((xs[k] as number) - m) / sd : 0;
      out[i * n + j] = Math.min(1, Math.max(step, mu + sigma * z));
    });
  });
  return out;
}

/**
 * The node table with `metrics` not defined (NaN, flag gaveNoRatings) for
 * the members in `silent`. Columns are copied, so the input is unchanged.
 */
export function leaveOut(
  table: NodeMetricTable,
  silent: ReadonlySet<number>,
  metrics: readonly NodeMetricKey[],
): NodeMetricTable {
  if (silent.size === 0) return table;
  const columns: NodeMetricTable['columns'] = { ...table.columns };
  const flags: NodeMetricTable['flags'] = { ...table.flags };
  for (const m of metrics) {
    const c = table.columns[m];
    if (!c) continue;
    const copy = c.slice();
    const f: (NodeFlag | null)[] = [
      ...(table.flags[m] ?? new Array<NodeFlag | null>(c.length).fill(null)),
    ];
    for (const i of silent) {
      copy[i] = NaN;
      f[i] = 'gaveNoRatings';
    }
    columns[m] = copy;
    flags[m] = f;
  }
  return { ...table, columns, flags };
}
