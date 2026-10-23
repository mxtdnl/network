// Tie-level structure (build plan session 7): edge betweenness and local
// bridges with their span (docs/method-notes.md §16).
//
// Edge betweenness follows nx.edge_betweenness_centrality(weight='distance',
// normalized=True): the sum over ordered pairs (s, t) of the share of
// shortest s→t paths (distance 1/w) through the tie, divided by n(n − 1) in
// both views. graphology-metrics' edgeBetweenness rescales the same way
// (checked against the fixtures), but it looks up a graphology edge for every
// predecessor and added about 40 % to the analysis of 250 members, so the
// accumulation is done here on the path graph's arrays.
//
// Local bridges follow nx.local_bridges(G, with_span=True, weight=None) on the
// ties read without direction: a tie whose two members have no contact in
// common; its span is the number of steps between them once the tie is
// removed, Infinity when there is no other route at all.

import type { DenseGraph, PathGraph } from '../graphs';
import type { LocalBridges, TieBetweenness } from '../types';
import { undirectedNeighbours } from './cutpoints';

/**
 * Normalised edge betweenness (distance 1/w) of every tie of the view graph,
 * by Brandes' accumulation over an array-based Dijkstra from every member
 * (O(n²) per source, as harmonic closeness). Equal distances are detected by
 * floating-point equality of sums along each path, as NetworkX does.
 */
export function edgeBetweenness(p: PathGraph): TieBetweenness {
  return brandes(p).edges;
}

/**
 * Weighted betweenness of members and of ties from one Brandes pass.
 * Members: nx.betweenness_centrality(weight='distance', normalized=True), the
 * accumulated dependencies divided by (n − 1)(n − 2) in both views; ties as
 * edgeBetweenness.
 */
export function brandes(p: PathGraph): { node: Float64Array; edges: TieBetweenness } {
  const { n, starts, targets, distances } = p;
  const eb = new Float64Array(n * n);
  const bc = new Float64Array(n);
  const dist = new Float64Array(n);
  const sigma = new Float64Array(n);
  const delta = new Float64Array(n);
  const done = new Uint8Array(n);
  const order = new Int32Array(n);
  const preds: number[][] = Array.from({ length: n }, () => []);
  for (let s = 0; s < n; s++) {
    dist.fill(Infinity);
    sigma.fill(0);
    delta.fill(0);
    done.fill(0);
    for (const list of preds) list.length = 0;
    dist[s] = 0;
    sigma[s] = 1;
    let settled = 0;
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let v = 0; v < n; v++) {
        if (done[v] === 0 && (dist[v] as number) < best) {
          best = dist[v] as number;
          u = v;
        }
      }
      if (u < 0) break;
      done[u] = 1;
      order[settled++] = u;
      const end = starts[u + 1] as number;
      for (let e = starts[u] as number; e < end; e++) {
        const v = targets[e] as number;
        if (done[v] === 1) continue;
        const d = best + (distances[e] as number);
        if (d < (dist[v] as number)) {
          dist[v] = d;
          sigma[v] = sigma[u] as number;
          (preds[v] as number[]).length = 0;
          (preds[v] as number[]).push(u);
        } else if (d === dist[v]) {
          sigma[v] = (sigma[v] as number) + (sigma[u] as number);
          (preds[v] as number[]).push(u);
        }
      }
    }
    for (let k = settled - 1; k >= 0; k--) {
      const w = order[k] as number;
      const coefficient = (1 + (delta[w] as number)) / (sigma[w] as number);
      for (const v of preds[w] as number[]) {
        const c = (sigma[v] as number) * coefficient;
        eb[v * n + w] = (eb[v * n + w] as number) + c;
        delta[v] = (delta[v] as number) + c;
      }
      if (w !== s) bc[w] = (bc[w] as number) + (delta[w] as number);
    }
  }
  const nodeScale = n > 2 ? 1 / ((n - 1) * (n - 2)) : 1;
  for (let i = 0; i < n; i++) bc[i] = (bc[i] as number) * nodeScale;
  const scale = n > 1 ? 1 / (n * (n - 1)) : 1;
  const from: number[] = [];
  const to: number[] = [];
  const values: number[] = [];
  const w = p.source.w;
  for (let i = 0; i < n; i++) {
    for (let j = p.directed ? 0 : i + 1; j < n; j++) {
      if (i === j || !((w[i * n + j] as number) > 0)) continue;
      from.push(i);
      to.push(j);
      // A tie read without direction carries the routes through it either way.
      const both = p.directed
        ? (eb[i * n + j] as number)
        : (eb[i * n + j] as number) + (eb[j * n + i] as number);
      values.push(both * scale);
    }
  }
  return {
    node: bc,
    edges: {
      from: Int32Array.from(from),
      to: Int32Array.from(to),
      values: Float64Array.from(values),
    },
  };
}

/** Steps from a to b without using the tie a–b itself; Infinity when there is no route. */
function spanWithout(adj: readonly number[][], a: number, b: number): number {
  const n = adj.length;
  const hops = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  hops[a] = 0;
  queue[tail++] = a;
  while (head < tail) {
    const u = queue[head++] as number;
    for (const v of adj[u] as number[]) {
      if (hops[v] !== -1 || (u === a && v === b)) continue;
      hops[v] = (hops[u] as number) + 1;
      if (v === b) return hops[v];
      queue[tail++] = v;
    }
  }
  return Infinity;
}

/** Local bridges and their span, as unordered pairs (from < to) in member order. */
export function localBridges(g: DenseGraph): LocalBridges {
  const adj = undirectedNeighbours(g);
  const n = g.n;
  const mark = new Int32Array(n).fill(-1);
  const from: number[] = [];
  const to: number[] = [];
  const span: number[] = [];
  for (let i = 0; i < n; i++) {
    for (const k of adj[i] as number[]) mark[k] = i;
    for (const j of adj[i] as number[]) {
      if (j <= i) continue;
      if ((adj[j] as number[]).some((k) => mark[k] === i)) continue;
      from.push(i);
      to.push(j);
      span.push(spanWithout(adj, i, j));
    }
  }
  return { from: Int32Array.from(from), to: Int32Array.from(to), span: Float64Array.from(span) };
}
