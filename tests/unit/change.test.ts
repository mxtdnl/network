// What changed between two waves (build plan session 15): the engine's
// comparison on the two-wave scenario and on constructed networks, the
// thresholds at their boundaries, the coverage rule, the change observations,
// the wave pair, the audience filter and the sentences.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProject } from '../../src/data/projectFile';
import type { Project } from '../../src/data/schema';
import { analyse } from '../../src/engine/analyse';
import { buildAnalysisInput } from '../../src/engine/input';
import {
  CHANGE_RULES,
  changeObservations,
  classifyTie,
  compareWaves,
} from '../../src/engine/metrics/change';
import type { AnalysisInput, SymmetriseRule, ViewKind } from '../../src/engine/types';
import { changeCopy, groupPairSentence } from '../../src/ui/copy/change';
import { audiencePolicy } from '../../src/ui/state/audience';
import { audienceChange, ratedWaves, runChange, wavePair } from '../../src/ui/state/change';
import { effectiveWeights, initialWeightState } from '../../src/ui/state/presets';
import { initialMapSettings } from '../../src/ui/state/store';

const twoWaves = (): Project =>
  parseProject(
    readFileSync(
      join(import.meta.dirname, '..', '..', 'src', 'demo', 'scenario-two-waves.ona.json'),
      'utf8',
    ),
  );

async function scenarioRun(
  view: ViewKind,
  symmetrise: SymmetriseRule,
  ref = 'connection_strength',
  project = twoWaves(),
) {
  return runChange(
    project,
    { ...initialMapSettings(), view, symmetrise },
    initialWeightState(),
    { before: 1, after: 2 },
    ref,
    (input) => analyse(input),
  );
}

describe('classifying a tie', () => {
  it('reads the thresholds at their boundaries', () => {
    expect(CHANGE_RULES.strengthen).toBe(0.4);
    expect(classifyTie(0.2, 0.6)).toBe('strengthened');
    expect(classifyTie(0.2, 0.59)).toBe('steady');
    expect(classifyTie(0.8, 0.4)).toBe('weakened');
    expect(classifyTie(0.8, 0.41)).toBe('steady');
    expect(classifyTie(0, 0.2)).toBe('gained');
    expect(classifyTie(0.2, 0)).toBe('lost');
    expect(classifyTie(0, 0)).toBeNull();
  });

  it('never guesses a rating that is missing in one wave', () => {
    expect(classifyTie(Number.NaN, 0.6)).toBe('notComparable');
    expect(classifyTie(0.6, Number.NaN)).toBe('notComparable');
    expect(classifyTie(Number.NaN, 0)).toBeNull();
    expect(classifyTie(Number.NaN, Number.NaN)).toBeNull();
  });
});

describe('the two-wave scenario', () => {
  it('counts ties between members on both rosters only, directed', async () => {
    const { change } = await scenarioRun('directed', 'mean');
    expect(change.members.both).toHaveLength(31);
    expect([...change.members.left].sort()).toEqual(['BRI01', 'SAL07']);
    expect([...change.members.joined].sort()).toEqual(['SAL08', 'SUP09', 'SUP10']);
    expect(change.counts).toEqual({
      gained: 173,
      lost: 42,
      strengthened: 14,
      weakened: 9,
      steady: 338,
      notComparable: 26,
    });
    const outsiders = new Set([...change.members.left, ...change.members.joined]);
    expect(change.ties.some((t) => outsiders.has(t.from) || outsiders.has(t.to))).toBe(false);
    expect(change.leftTies).toBeGreaterThan(0);
    expect(change.joinedTies).toBeGreaterThan(0);
    expect(change.reportable).toBe(true);
    // Every change counted is listed, and its kind agrees with the weights.
    const listed = change.ties.length;
    expect(listed).toBe(173 + 42 + 14 + 9 + 26);
    for (const t of change.ties) expect(classifyTie(t.before, t.after)).toBe(t.kind);
  });

  it('finds the joint programme between Build and Support', async () => {
    const directed = await scenarioRun('directed', 'mean');
    const first = directed.observations.observations[0];
    expect(first).toMatchObject({ kind: 'groupPair', from: 'Build', to: 'Support' });
    const mutual = await scenarioRun('symmetrised', 'mean');
    expect(mutual.observations.observations).toEqual([
      {
        kind: 'groupPair',
        from: 'Build',
        to: 'Support',
        before: { ties: 17, possible: 80, density: 17 / 80 },
        after: { ties: 90, possible: 90, density: 1 },
      },
    ]);
    const o = mutual.observations.observations[0];
    if (o?.kind !== 'groupPair') throw new Error('expected a pair of groups');
    expect(groupPairSentence(mutual.change, o.from, o.to, o.before, o.after)).toBe(
      'Ties between Build and Support rose from 17 to 90 (from 21% to 100% of those possible). Build shrank from 10 to 9 members and Support grew from 8 to 10 members.',
    );
    expect(changeCopy.question(o, mutual.change, (id) => id)).toBe(
      'What brought Build and Support closer between the waves?',
    );
  });

  it('summarises each wave on its own roster', async () => {
    const { change, before, after } = await scenarioRun('symmetrised', 'mean');
    expect(change.before.members).toBe(33);
    expect(change.after.members).toBe(34);
    expect(change.before.density).toBe(before.refs.connection_strength?.network.density);
    expect(change.after.density).toBe(after.refs.connection_strength?.network.density);
    expect(change.before.coverage).toBeCloseTo(0.97, 2);
    expect(change.after.coverage).toBeCloseTo(0.955, 3);
    expect(change.before.groupCoverage.Design).toBeCloseTo(0.875, 3);
    expect(change.after.groupCoverage.Support).toBeCloseTo(0.9, 3);
    expect(change.before.groupSizes).toEqual({ Design: 8, Build: 10, Support: 8, Sales: 7 });
    // Per member: incoming ties of each wave, from the engine's load.
    const sup01 = change.perMember.find((m) => m.id === 'SUP01');
    const b = before.memberIds.indexOf('SUP01');
    const a = after.memberIds.indexOf('SUP01');
    expect(sup01?.received).toEqual([
      before.refs.connection_strength?.load?.incoming[b],
      after.refs.connection_strength?.load?.incoming[a],
    ]);
    expect(Number.isNaN(sup01?.given[0])).toBe(true);
    expect(sup01?.metrics.strength).toHaveLength(2);
  });

  it('describes no change when a wave is below the coverage threshold', async () => {
    const project = twoWaves();
    project.settings.coverage_threshold = 0.96;
    const run = await scenarioRun('directed', 'mean', 'connection_strength', project);
    expect(run.change.reportable).toBe(false);
    expect(run.observations).toEqual({
      withheld: 'lowCoverage',
      observations: [],
      groupsWithheld: 0,
    });
    expect(changeCopy.withheld(run.change)).toBe(
      'Coverage is 95% in wave 2, below the 96% threshold, so no change is described: a difference between the waves could come from who answered. The figures are shown for reference.',
    );
  });

  it('leaves out pairs of groups below the threshold in a wave', async () => {
    const project = twoWaves();
    project.settings.coverage_threshold = 0.89;
    const run = await scenarioRun('directed', 'mean', 'connection_strength', project);
    expect(run.change.reportable).toBe(true);
    const groups = run.observations.observations.flatMap((o) =>
      o.kind === 'groupPair' ? [o.from, o.to] : [],
    );
    // Design covered 87.5 % in wave 1.
    expect(groups).not.toContain('Design');
    expect(groups).toContain('Build');
    expect(run.observations.groupsWithheld).toBeGreaterThan(0);
  });

  it('finds nothing when a wave is compared with itself', async () => {
    const project = twoWaves();
    const input = buildAnalysisInput(
      project,
      {
        view: 'directed',
        symmetrise: 'mean',
        ...effectiveWeights(project, initialWeightState()),
        wave: 2,
      },
      'same',
    );
    const r = await analyse(input);
    const change = compareWaves(r, r, 'connection_strength', { group: 'team', minCoverage: 0.8 });
    expect(change.ties).toEqual([]);
    expect(change.counts.gained + change.counts.lost).toBe(0);
    expect(changeObservations(change).observations).toEqual([]);
  });
});

/** Four members, one unsigned layer, in two waves of the same ratings matrix shape. */
function input(wave: number, ids: string[], ties: [string, string][]): AnalysisInput {
  const n = ids.length;
  const ratings = new Float64Array(n * n).fill(0);
  for (let i = 0; i < n; i++) ratings[i * n + i] = Number.NaN;
  for (const [a, b] of ties) {
    ratings[ids.indexOf(a) * n + ids.indexOf(b)] = 5;
    ratings[ids.indexOf(b) * n + ids.indexOf(a)] = 5;
  }
  return {
    inputKey: `w${String(wave)}`,
    wave,
    memberIds: ids,
    attributes: {
      team: { categories: ['X', 'Y'], values: ids.map((_, i) => (i < 2 ? 'X' : 'Y')) },
    },
    layers: [
      {
        key: 'connection_strength',
        label: 'Connection strength',
        min: 0,
        max: 5,
        signed: false,
        defaultWeight: 1,
      },
    ],
    ratings: [ratings],
    settings: {
      view: 'symmetrised',
      symmetrise: 'mean',
      weights: {},
      signedTreatment: {},
      seed: 1,
    },
  };
}

describe('routes between waves', () => {
  it('reports cut points and bridge ties found in one wave only', async () => {
    // Wave 1: a path a–b–c–d, so b and c are cut points and every tie is a bridge.
    const before = await analyse(
      input(
        1,
        ['a', 'b', 'c', 'd'],
        [
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'd'],
        ],
      ),
    );
    // Wave 2: c has left and e joined; a, b and d form a triangle, with e tied to d.
    const after = await analyse(
      input(
        2,
        ['a', 'b', 'd', 'e'],
        [
          ['a', 'b'],
          ['b', 'd'],
          ['d', 'a'],
          ['d', 'e'],
        ],
      ),
    );
    const change = compareWaves(before, after, 'connection_strength', {
      group: null,
      minCoverage: 0.8,
    });
    expect(change.members).toEqual({ both: ['a', 'b', 'd'], left: ['c'], joined: ['e'] });
    expect(change.before.cutPoints).toEqual(['b', 'c']);
    expect(change.after.cutPoints).toEqual(['d']);
    // a–d and b–d are new between members on both rosters; a–b stays.
    expect(change.ties.map((t) => [t.from, t.to, t.kind])).toEqual([
      ['a', 'd', 'gained'],
      ['b', 'd', 'gained'],
    ]);
    expect(change.counts.steady).toBe(1);
    // Ties with c (wave 1) and e (wave 2) are reported apart.
    expect(change.leftTies).toBe(2);
    expect(change.joinedTies).toBe(1);
    // a–b was a local bridge in wave 1 and is in a triangle now; d–e is a bridge
    // with a member who joined, so it is not counted.
    expect(change.bridges).toEqual({ gained: [], lost: [['a', 'b']] });
    const obs = changeObservations(change).observations;
    expect(obs).toContainEqual({ kind: 'bridges', gained: 0, lost: 1 });
    expect(obs).toContainEqual({ kind: 'cutPoint', member: 'b', wave: 'before', onRoster: true });
    expect(obs).toContainEqual({ kind: 'cutPoint', member: 'c', wave: 'before', onRoster: false });
    expect(obs).toContainEqual({ kind: 'cutPoint', member: 'd', wave: 'after', onRoster: true });
    const name = (id: string) => id.toUpperCase();
    const c = obs.find((o) => o.kind === 'cutPoint' && o.member === 'c');
    if (!c) throw new Error('expected c');
    expect(changeCopy.saw(c, change, name)).toBe(
      'In wave 1, C was the only link between some members and the rest of the network, and is not on the wave 2 roster.',
    );
    expect(changeCopy.question(c, change, name)).toBe(
      'How do the members C linked reach the rest of the network now?',
    );
  });

  it('refuses two analyses in different views', async () => {
    const a = await analyse(input(1, ['a', 'b'], [['a', 'b']]));
    const b = await analyse({
      ...input(2, ['a', 'b'], [['a', 'b']]),
      settings: { ...input(2, ['a', 'b'], []).settings, view: 'directed' },
    });
    expect(() =>
      compareWaves(a, b, 'connection_strength', { group: null, minCoverage: 0 }),
    ).toThrow();
  });
});

describe('the wave pair', () => {
  it('compares the wave analysed with the wave before it, or the chosen pair', () => {
    const project = twoWaves();
    expect(ratedWaves(project)).toEqual([1, 2]);
    expect(wavePair(project, 2)).toEqual({ before: 1, after: 2 });
    // Wave 1 has no earlier wave: the latest and the one before it.
    expect(wavePair(project, 1)).toEqual({ before: 1, after: 2 });
    expect(wavePair(project, 2, { before: 2, after: 1 })).toEqual({ before: 1, after: 2 });
    expect(wavePair({ ...project, ties: project.ties.filter((t) => t.wave === 1) }, 1)).toBeNull();
  });
});

describe('audiences', () => {
  it('shows a board pairs of large groups only and no member', async () => {
    const project = twoWaves();
    const run = await scenarioRun('directed', 'mean', 'connection_strength', project);
    const withCut = {
      ...run,
      observations: {
        ...run.observations,
        observations: [
          ...run.observations.observations,
          { kind: 'cutPoint' as const, member: 'SUP01', wave: 'after' as const, onRoster: true },
        ],
      },
    };
    const analyst = audienceChange(
      withCut,
      audiencePolicy(project, { level: 'analyst', team: null, member: null }, false),
    );
    expect(analyst.some((o) => o.kind === 'cutPoint')).toBe(true);
    const board = audienceChange(
      withCut,
      audiencePolicy(project, { level: 'board', team: null, member: null }, false),
    );
    expect(board.some((o) => o.kind === 'cutPoint')).toBe(false);
    // Every team has at least 7 members in both waves, so every pair stays.
    expect(board.filter((o) => o.kind === 'groupPair')).toHaveLength(
      run.observations.observations.filter((o) => o.kind === 'groupPair').length,
    );
    const workshop = audienceChange(
      withCut,
      audiencePolicy(project, { level: 'workshop', team: 'Sales', member: null }, false),
    );
    expect(workshop.length).toBeGreaterThan(0);
    for (const o of workshop) {
      expect(o.kind).toBe('groupPair');
      if (o.kind === 'groupPair') expect([o.from, o.to]).toContain('Sales');
    }
    const one = audienceChange(
      withCut,
      audiencePolicy(project, { level: 'oneToOne', team: null, member: 'SUP01' }, false),
    );
    expect(one).toEqual([]);
  });
});
