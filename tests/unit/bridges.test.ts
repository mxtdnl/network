// Bridges, cut points and load concentration (build plan session 7): the
// measures on small graphs, the two rules at their thresholds, and what the
// rules find on the demo and the scenario projects.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProject } from '../../src/data/projectFile';
import { analyse } from '../../src/engine/analyse';
import { denseGraph } from '../../src/engine/graphs';
import {
  concentratedDemand,
  groupRoutes,
  INSIGHT_RULES,
  onlyRoutes,
} from '../../src/engine/insights';
import { buildAnalysisInput } from '../../src/engine/input';
import { localBridges } from '../../src/engine/metrics/bridges';
import { cutPoints } from '../../src/engine/metrics/cutpoints';
import { incomingTies, loadConcentration, loadShare } from '../../src/engine/metrics/load';
import type {
  AttributeColumn,
  InsightOutcome,
  InsightRuleId,
  SymmetriseRule,
  ViewKind,
} from '../../src/engine/types';
import { effectiveWeights, initialWeightState } from '../../src/ui/state/presets';
import { scenarioFile } from '../../scripts/scenario-kit';

/** Symmetric 0/1 weights from undirected edges. */
function edges(n: number, list: [number, number][]): Float64Array {
  const w = new Float64Array(n * n);
  for (const [a, b] of list) {
    w[a * n + b] = 1;
    w[b * n + a] = 1;
  }
  return w;
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${String(i)}`);
const column = (values: (string | null)[]): AttributeColumn => ({ categories: [], values });

describe('local bridges and cut points', () => {
  // Two triangles 0-1-2 and 3-4-5 joined by 2–3, and a pendant 6 on 5.
  const n = 7;
  const w = edges(n, [
    [0, 1],
    [1, 2],
    [0, 2],
    [3, 4],
    [4, 5],
    [3, 5],
    [2, 3],
    [5, 6],
  ]);
  const g = denseGraph(w, n, false);

  it('finds ties whose members share no contact, with their span', () => {
    const lb = localBridges(g);
    expect(Array.from(lb.from)).toEqual([2, 5]);
    expect(Array.from(lb.to)).toEqual([3, 6]);
    expect(Array.from(lb.span)).toEqual([Infinity, Infinity]);
  });

  it('gives the steps of the other route when there is one', () => {
    // A square 0-1-2-3: every tie is a local bridge with span 3.
    const sq = denseGraph(
      edges(4, [
        [0, 1],
        [1, 2],
        [2, 3],
        [0, 3],
      ]),
      4,
      false,
    );
    expect(Array.from(localBridges(sq).span)).toEqual([3, 3, 3, 3]);
  });

  it('finds cut points and the members each cuts off', () => {
    const cp = cutPoints(g);
    expect(Array.from(cp.members)).toEqual([2, 3, 5]);
    // Removing 2 leaves {0,1} and {3,4,5,6}; removing 3 leaves {0,1,2} and {4,5,6}; 5 cuts off 6.
    expect(Array.from(cp.cutOff)).toEqual([2, 3, 1]);
  });

  it('reads directed ties without direction', () => {
    const d = new Float64Array(9);
    d[0 * 3 + 1] = 1;
    d[2 * 3 + 1] = 1;
    expect(Array.from(cutPoints(denseGraph(d, 3, true)).members)).toEqual([1]);
  });
});

describe('load concentration', () => {
  it('counts ties received from the directed ratings', () => {
    const d = new Float64Array(9).fill(NaN);
    d[0 * 3 + 2] = 0.5;
    d[1 * 3 + 2] = 0;
    d[2 * 3 + 0] = 1;
    expect(Array.from(incomingTies(d, 3))).toEqual([1, 0, 1]);
  });

  it('takes the top 10 %, at least one member, and their share', () => {
    const incoming = [10, 0, 5, 5, 0, 0, 0, 0, 0, 0, 0, 1];
    const s = loadShare(incoming, [...incoming.keys()]);
    // ⌈0.1 · 12⌉ = 2 members: 10 and one of the 5s, 15 of 21.
    expect(Array.from(s.top)).toEqual([0, 2]);
    expect(s.share).toBeCloseTo(15 / 21, 12);
    expect(loadShare([0, 0], [0, 1]).share).toBeNaN();
  });

  it('measures each group against its own members', () => {
    const n = 4;
    const d = new Float64Array(n * n);
    d[1 * n + 0] = 1;
    d[2 * n + 0] = 1;
    d[3 * n + 2] = 1;
    const load = loadConcentration(d, n, { team: column(['A', 'A', 'B', 'B']) });
    expect(load.byGroup.team?.map((g) => [g.group, g.received, g.share])).toEqual([
      ['A', 2, 1],
      ['B', 1, 1],
    ]);
  });
});

describe('ties between groups', () => {
  it('lists the members holding each group’s ties with other groups', () => {
    const n = 6;
    const w = edges(n, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [2, 4],
    ]);
    const r = groupRoutes(w, n, column(['A', 'A', 'A', 'B', 'B', null]));
    expect(r.groups.map((g) => [g.group, g.externalTies, g.gateways])).toEqual([
      ['A', 2, [2]],
      ['B', 2, [3, 4]],
    ]);
    expect(r.pairs).toEqual([{ a: 'A', b: 'B', sizeA: 3, sizeB: 2, ties: 2, members: [2, 3, 4] }]);
  });
});

describe('only routes between groups', () => {
  const T = INSIGHT_RULES.onlyRoutes;
  // Group A (0–7) is a ring with chords; group B (8–15) likewise. k members of
  // A each hold one tie to B.
  const build = (gateways: number) => {
    const n = 16;
    const list: [number, number][] = [];
    for (const base of [0, 8])
      for (let i = 0; i < 8; i++) {
        list.push([base + i, base + ((i + 1) % 8)]);
        list.push([base + i, base + ((i + 2) % 8)]);
      }
    for (let k = 0; k < gateways; k++) list.push([k, 8 + k]);
    return { n, w: edges(n, list) };
  };
  const teams = column([...Array(8).fill('A'), ...Array(8).fill('B')] as string[]);
  const groupObs = (o: InsightOutcome) => o.observations.filter((x) => x.evidence.cutPoint === 0);

  it(`names a group whose ties with other groups are held by ${String(T.maxGateways)} members`, () => {
    const { n, w } = build(T.maxGateways);
    const o = onlyRoutes(ids(n), [{ ref: 'composite', weights: w }], { team: teams });
    expect(groupObs(o).map((x) => [x.group?.value, x.members])).toEqual([
      ['A', ['m0', 'm1']],
      ['B', ['m8', 'm9']],
    ]);
    expect(groupObs(o)[0]?.groups).toEqual([
      { attribute: 'team', value: 'A', other: 'B', count: 2 },
    ]);
  });

  it(`not by ${String(T.maxGateways + 1)}`, () => {
    const { n, w } = build(T.maxGateways + 1);
    expect(
      groupObs(onlyRoutes(ids(n), [{ ref: 'composite', weights: w }], { team: teams })),
    ).toEqual([]);
  });

  it('needs the members to be at most half the group', () => {
    // Groups of 3, two gateways each: 2 > 1.5.
    const n = 6;
    const w = edges(n, [
      [0, 1],
      [1, 2],
      [3, 4],
      [4, 5],
      [0, 3],
      [1, 4],
    ]);
    const o = onlyRoutes(ids(n), [{ ref: 'composite', weights: w }], {
      team: column(['A', 'A', 'A', 'B', 'B', 'B']),
    });
    expect(groupObs(o)).toEqual([]);
  });

  it(`names a cut point that cuts off at least ${String(T.minCutOff)} members`, () => {
    // A ring of 6 (0–5) with a path 5–6, and 6 joined to a triangle 7-8-9.
    const n = 10;
    const list: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [7, 9],
    ];
    const o = onlyRoutes(ids(n), [{ ref: 'composite', weights: edges(n, list) }], {});
    const cuts = o.observations.filter((x) => x.evidence.cutPoint === 1);
    // 5 cuts off 6–9 (4 members), 6 cuts off 7–9 (3), 7 cuts off only 8 and 9 (2, below the rule).
    expect(cuts.map((x) => [x.members[0], x.evidence.cutOff])).toEqual([
      ['m5', 4],
      ['m6', 3],
    ]);
    expect(cuts[1]?.view.highlight).toEqual(['m6', 'm7', 'm8', 'm9']);
  });
});

describe('concentrated demand', () => {
  const T = INSIGHT_RULES.concentratedDemand;
  // 20 members; member 0 and 1 receive `top` ties each, every other member receives one.
  const load = (top: number, members = 20) => {
    const incoming = new Float64Array(members).fill(1);
    incoming[0] = top;
    incoming[1] = top;
    const all = [...Array(members).keys()];
    return { incoming, topShare: 0.1, overall: loadShare(incoming, all), byGroup: {} };
  };
  const run = (l: ReturnType<typeof load>) =>
    concentratedDemand(ids(20), [{ ref: 'advice', layer: 'advice', load: l }], true, {});

  it(`is observed when the top 10 % hold ${String(T.minShare)} of incoming ties`, () => {
    // Two members with 3 each: 6 of 24 = 0.25.
    expect(run(load(3)).observations.map((o) => o.evidence.share)).toEqual([0.25]);
  });

  it('not below it', () => {
    // Two members with 2 each: 4 of 22 ≈ 0.18.
    expect(run(load(2)).status).toBe('none');
  });

  it('is not applied without the advice or workflow dependency layer', () => {
    expect(
      concentratedDemand(ids(2), [{ ref: 'x', layer: 'x', load: null }], true, {}).reason,
    ).toBe('layersNotEnabled');
  });

  it(`names a group whose top members hold ${String(T.groupMultiple)} times their even share`, () => {
    // Group of 6 (one top member, even share 1/6, so at least 2.5/6 ≈ 0.417): 11 of 26 ≈ 0.423; 10 of 25 = 0.4 is below.
    const make = (top: number) => {
      const incoming = Float64Array.from([top, 3, 3, 3, 3, 3]);
      const group = { group: 'A', ...loadShare(incoming, [0, 1, 2, 3, 4, 5]) };
      return {
        incoming,
        topShare: 0.1,
        overall: { ...group, share: 0 },
        byGroup: { team: [group] },
      };
    };
    const at = (top: number) =>
      concentratedDemand(
        ids(6),
        [{ ref: 'w', layer: 'workflow_dependency', load: make(top) }],
        true,
        {
          team: column(['A', 'A', 'A', 'A', 'A', 'A']),
        },
      );
    expect(at(11).observations.map((o) => o.group?.value)).toEqual(['A']);
    expect(at(10).status).toBe('none');
  });
});

describe('the rules on the demo and the scenarios', () => {
  const VIEWS: [ViewKind, SymmetriseRule][] = [
    ['directed', 'mean'],
    ['symmetrised', 'mean'],
    ['symmetrised', 'min'],
  ];
  const outcome = async (slug: string, view: [ViewKind, SymmetriseRule], rule: InsightRuleId) => {
    const file = slug === 'demo' ? 'demo.ona.json' : scenarioFile(slug);
    const project = parseProject(
      readFileSync(join(import.meta.dirname, '..', '..', 'src', 'demo', file), 'utf8'),
    );
    const weights = effectiveWeights(project, initialWeightState());
    const r = await analyse(
      buildAnalysisInput(project, { view: view[0], symmetrise: view[1], ...weights }, slug),
    );
    return r.insights.find((o) => o.rule === rule) as InsightOutcome;
  };

  it.each(VIEWS)('finds Finance’s two routes and OPE04 in the demo (%s, %s)', async (v, s) => {
    const o = await outcome('demo', [v, s], 'onlyRoutes');
    expect(
      o.observations.map((x) => [x.ref, x.group?.value ?? null, x.members, x.evidence.cutOff]),
    ).toEqual([
      ['connection_strength', 'Finance', ['FIN03', 'FIN06'], undefined],
      ['connection_strength', null, ['OPE04'], 8],
    ]);
    expect((await outcome('demo', [v, s], 'concentratedDemand')).reason).toBe('layersNotEnabled');
  });

  it('finds the Integration Office’s single route and its demand in the post-merger project', async () => {
    for (const v of VIEWS) {
      const routes = await outcome('post-merger', v, 'onlyRoutes');
      const demand = await outcome('post-merger', v, 'concentratedDemand');
      expect(demand.observations.map((x) => [x.ref, x.group?.value, x.members])).toEqual([
        ['workflow_dependency', 'Integration Office', ['INT01']],
      ]);
      expect(routes.observations.map((x) => [x.group?.value ?? null, x.members])).toEqual(
        v[1] === 'min'
          ? []
          : [
              ['Integration Office', ['INT01']],
              [null, ['INT01']],
            ],
      );
    }
  });

  it.each([
    'partial-response',
    'asymmetric-ratings',
    'compressed-ratings',
    'matrix-organisation',
    'large-department',
    'dense-team',
    'silent-leaders',
    'polite-dense-team',
    'merger-matrix',
    'single-team-shifts',
    'messy-survey',
  ])('finds nothing in %s', async (slug) => {
    for (const v of VIEWS) {
      expect((await outcome(slug, v, 'onlyRoutes')).observations).toEqual([]);
      expect((await outcome(slug, v, 'concentratedDemand')).observations).toEqual([]);
    }
  });
});
