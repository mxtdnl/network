// Cut points (build plan session 7, docs/method-notes.md §16): members whose
// removal splits the part of the network they belong to, on the ties read
// without direction, as nx.articulation_points. For each, how many members
// would be cut off from the largest part that remains.

import type { DenseGraph } from '../graphs';
import type { CutPoints } from '../types';
import { undirectedNeighbours } from './bridges';

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

/** Sizes of the parts the member's own part falls into once the member is removed, largest first. */
function partsWithout(adj: readonly number[][], v: number): number[] {
  const n = adj.length;
  const seen = new Uint8Array(n);
  seen[v] = 1;
  const sizes: number[] = [];
  for (const start of adj[v] as number[]) {
    if (seen[start]) continue;
    let size = 0;
    const queue = [start];
    seen[start] = 1;
    while (queue.length > 0) {
      const u = queue.pop() as number;
      size += 1;
      for (const w of adj[u] as number[]) {
        if (!seen[w]) {
          seen[w] = 1;
          queue.push(w);
        }
      }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}

/** Cut points, with the members each would cut off from the largest remaining part. */
export function cutPoints(g: DenseGraph): CutPoints {
  const adj = undirectedNeighbours(g);
  const members = articulationPoints(adj);
  const cutOff = members.map((v) =>
    partsWithout(adj, v)
      .slice(1)
      .reduce((a, b) => a + b, 0),
  );
  return { members: Int32Array.from(members), cutOff: Int32Array.from(cutOff) };
}
