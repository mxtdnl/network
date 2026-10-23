// Cut points (build plan session 7, docs/method-notes.md §16): members whose
// removal splits the part of the network they belong to, on the ties read
// without direction, as nx.articulation_points. For each, how many members
// would be cut off from the largest part that remains.
//
// No graphology here: the insight rules, which the main thread also imports
// for their thresholds, read these helpers.

import type { DenseGraph } from '../graphs';
import type { CutPoints } from '../types';

/** Neighbour lists of `weights` (n × n, a layer's view weights) read without direction. */
export function neighboursOf(weights: ArrayLike<number>, n: number): number[][] {
  const out: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if ((weights[i * n + j] as number) > 0 || (weights[j * n + i] as number) > 0) {
        (out[i] as number[]).push(j);
        (out[j] as number[]).push(i);
      }
    }
  }
  return out;
}

/** Neighbour lists of the ties read without direction (a tie in either direction). */
export function undirectedNeighbours(g: DenseGraph): number[][] {
  return neighboursOf(g.w, g.n);
}

/** Articulation points by Hopcroft–Tarjan (iterative), in member order. */
export function articulationPoints(adj: readonly number[][]): number[] {
  const n = adj.length;
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const parent = new Int32Array(n).fill(-1);
  const next = new Int32Array(n);
  const children = new Int32Array(n);
  const cut = new Uint8Array(n);
  let time = 0;
  for (let root = 0; root < n; root++) {
    if (disc[root] !== -1) continue;
    const stack = [root];
    disc[root] = low[root] = time++;
    while (stack.length > 0) {
      const u = stack[stack.length - 1] as number;
      const list = adj[u] as number[];
      if ((next[u] as number) < list.length) {
        const v = list[next[u] as number] as number;
        next[u] = (next[u] as number) + 1;
        if (disc[v] === -1) {
          parent[v] = u;
          children[u] = (children[u] as number) + 1;
          disc[v] = low[v] = time++;
          stack.push(v);
        } else if (v !== parent[u]) {
          low[u] = Math.min(low[u] as number, disc[v] as number);
        }
      } else {
        stack.pop();
        const p = parent[u] as number;
        if (p >= 0) {
          low[p] = Math.min(low[p] as number, low[u] as number);
          if (parent[p] !== -1 && (low[u] as number) >= (disc[p] as number)) cut[p] = 1;
        }
      }
    }
    if ((children[root] as number) > 1) cut[root] = 1;
  }
  const out: number[] = [];
  cut.forEach((c, i) => {
    if (c) out.push(i);
  });
  return out;
}

/** The parts the member's own part falls into once the member is removed, largest first. */
export function partsWithout(adj: readonly number[][], v: number): number[][] {
  const n = adj.length;
  const seen = new Uint8Array(n);
  seen[v] = 1;
  const parts: number[][] = [];
  for (const start of adj[v] as number[]) {
    if (seen[start]) continue;
    const part: number[] = [];
    const queue = [start];
    seen[start] = 1;
    while (queue.length > 0) {
      const u = queue.pop() as number;
      part.push(u);
      for (const w of adj[u] as number[]) {
        if (!seen[w]) {
          seen[w] = 1;
          queue.push(w);
        }
      }
    }
    parts.push(part.sort((a, b) => a - b));
  }
  // Largest first; among equal sizes, the part holding the lowest member index.
  return parts.sort((a, b) => b.length - a.length || (a[0] as number) - (b[0] as number));
}

/** Cut points, with the members each would cut off from the largest remaining part. */
export function cutPoints(g: DenseGraph): CutPoints {
  const adj = undirectedNeighbours(g);
  const members = articulationPoints(adj);
  const cutOff = members.map((v) =>
    partsWithout(adj, v)
      .slice(1)
      .reduce((a, b) => a + b.length, 0),
  );
  return { members: Int32Array.from(members), cutOff: Int32Array.from(cutOff) };
}
