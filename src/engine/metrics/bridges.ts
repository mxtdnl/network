// Tie-level structure (build plan session 7): edge betweenness and local
// bridges with their span (docs/method-notes.md §16).
//
// Edge betweenness follows nx.edge_betweenness_centrality(weight='distance',
// normalized=True): the sum over ordered pairs (s, t) of the share of
// shortest s→t paths (distance 1/w) through the tie, divided by n(n − 1) in
// both views. graphology-metrics' edgeBetweenness accumulates and rescales in
// the same way (checked against the fixtures).
//
// Local bridges follow nx.local_bridges(G, with_span=True, weight=None) on the
// ties read without direction: a tie whose two members have no contact in
// common; its span is the number of steps between them once the tie is
// removed, Infinity when there is no other route at all.

import edgeBetweennessCentrality from 'graphology-metrics/centrality/edge-betweenness';
import { graphologyForPaths, type DenseGraph, type PathGraph } from '../graphs';
import type { LocalBridges, TieBetweenness } from '../types';

/** Normalised edge betweenness (distance 1/w) of every tie of the view graph. */
export function edgeBetweenness(p: PathGraph): TieBetweenness {
  const graph = graphologyForPaths(p);
  const scores = edgeBetweennessCentrality(graph, { getEdgeWeight: 'distance', normalized: true });
  const n = p.n;
  const from: number[] = [];
  const to: number[] = [];
  const values: number[] = [];
  const w = p.source.w;
  for (let i = 0; i < n; i++) {
    for (let j = p.directed ? 0 : i + 1; j < n; j++) {
      if (i === j || !((w[i * n + j] as number) > 0)) continue;
      const edge = graph.edge(String(i), String(j));
      from.push(i);
      to.push(j);
      values.push(edge === undefined ? NaN : (scores[edge] ?? NaN));
    }
  }
  return {
    from: Int32Array.from(from),
    to: Int32Array.from(to),
    values: Float64Array.from(values),
  };
}

/** Neighbour lists of the ties read without direction (a tie in either direction). */
export function undirectedNeighbours(g: DenseGraph): number[][] {
  const { n, w } = g;
  const out: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if ((w[i * n + j] as number) > 0 || (w[j * n + i] as number) > 0) {
        (out[i] as number[]).push(j);
        (out[j] as number[]).push(i);
      }
    }
  }
  return out;
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
