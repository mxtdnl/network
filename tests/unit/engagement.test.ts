// The engagement record, the assessment against intent, the checklists, the guided first run's
// tasks and "Explain this view" (build plan session 16).

import { describe, expect, it } from 'vitest';
import {
  addAction,
  addExpectation,
  addOutcome,
  checkEngagement,
  currentStep,
  emptyEngagement,
  expectedLevel,
  nextId,
  retentionPassed,
  setExpectedPair,
  toggleCheck,
  updateEngagement,
} from '../../src/data/engagement';
import {
  assessIntent,
  groupShares,
  INTENT_RULES,
  pairCounts,
  verdictFor,
  type IntentInput,
} from '../../src/data/intent';
import { parseProject, serialiseProject, ProjectFileError } from '../../src/data/projectFile';
import type { Engagement, Project } from '../../src/data/schema';
import { buildMapModel } from '../../src/ui/map/model';
import { readMapTheme } from '../../src/ui/map/theme';
import { effectiveSettings, type MapData } from '../../src/ui/map/useMapModel';
import {
  centreShown,
  checklist,
  CHECKLISTS,
  expectationData,
  intentInput,
  intentLayer,
  observationKey,
  presentValues,
  rightShown,
  STEP_TABS,
} from '../../src/ui/state/engagement';
import { explainView } from '../../src/ui/state/explain';
import { initialWeightState } from '../../src/ui/state/presets';
import { initialMapSettings, useAppStore } from '../../src/ui/state/store';
import { taskDone } from '../../src/ui/state/tourTasks';
import { demoText } from './engineFixtures';
import { screenResult, tokensCss } from './exportHarness';

const demo = () => parseProject(demoText);

function withEngagement(project: Project, e: Engagement): Project {
  return { ...project, engagement: e };
}

describe('the engagement record', () => {
  it('starts empty, at a step, with the suggested criteria', () => {
    const e = emptyEngagement();
    expect(e.step).toBe('plan');
    expect(e.criteria.length).toBe(5);
    expect(checkEngagement(e)).toEqual([]);
    expect(currentStep(demo())).toBe('all');
    expect(currentStep(withEngagement(demo(), emptyEngagement('act')))).toBe('act');
  });

  it('round-trips through the project file with every part filled', () => {
    let e = emptyEngagement('understand');
    e = { ...e, question: 'Why do handovers stall?', sponsor: 'COO', boundary: 'All of HQ' };
    e = { ...e, governance: { audiences: { board: 'The board' }, retention_date: '2027-03-31' } };
    e = addExpectation(e, 'Finance works closely with Operations');
    e = {
      ...e,
      expectations: e.expectations.map((x) => ({
        ...x,
        link: { kind: 'pair', attribute: 'team', a: 'Finance', b: 'Operations' },
        notes: 'Fewer ties than expected',
      })),
    };
    e = setExpectedPair(e, 'team', 'Operations', 'Finance', 'regular');
    e = addAction(
      e,
      {
        text: 'Joint planning meeting',
        link: { kind: 'expectation', id: 'e1' },
        owner: 'Head of Finance',
        due: '2026-12-01',
        status: 'agreed',
      },
      '2026-11-03T10:00:00.000Z',
    );
    e = addOutcome(e, 'Support across groups', 1);
    e = toggleCheck(e, 'audience', true);
    const project = withEngagement(demo(), e);
    const back = parseProject(serialiseProject(project));
    expect(back.engagement).toStrictEqual(e);
    expect(back.engagement?.intent.pairs).toEqual([
      { attribute: 'team', a: 'Finance', b: 'Operations', level: 'regular' },
    ]);
  });

  it('opens a project without a record unchanged', () => {
    const back = parseProject(serialiseProject(demo()));
    expect(back.engagement).toBeUndefined();
  });

  it('refuses a record that breaks its rules', () => {
    const bad = (patch: Record<string, unknown>) =>
      checkEngagement({ ...emptyEngagement(), ...patch });
    expect(bad({ step: 'later' })).toHaveLength(1);
    expect(bad({ question: 3 })).toHaveLength(1);
    expect(bad({ governance: { audiences: { nobody: 'x' }, retention_date: null } })).toHaveLength(
      1,
    );
    expect(bad({ governance: { audiences: {}, retention_date: '31/03/2027' } })).toHaveLength(1);
    expect(
      bad({
        intent: { layer: null, pairs: [{ attribute: 'team', a: 'b', b: 'a', level: 'close' }] },
      }),
    ).toHaveLength(1);
    expect(
      bad({
        intent: { layer: null, pairs: [{ attribute: 'team', a: 'a', b: 'b', level: 'some' }] },
      }),
    ).toHaveLength(1);
    const action = addAction(emptyEngagement(), {}, 'now').actions[0];
    expect(bad({ actions: [action, action] })).toHaveLength(1);
    expect(bad({ actions: [{ ...action, status: 'late' }] })).toHaveLength(1);
    expect(
      bad({
        actions: [
          { ...action, link: { kind: 'observation', key: 'k', text: '', wave: 0, rule: 'silo' } },
        ],
      }),
    ).toHaveLength(1);
    expect(
      bad({ outcomes: [{ id: 'o1', criterion: '', assessment: '', wave: 1.5, date: null }] }),
    ).toHaveLength(1);
    expect(bad({ checks: [1] })).toHaveLength(1);
    const file = JSON.parse(serialiseProject(demo())) as Record<string, unknown>;
    file.engagement = { step: 'plan' };
    expect(() => parseProject(JSON.stringify(file))).toThrow(ProjectFileError);
  });

  it('keeps ids increasing and orders pairs', () => {
    expect(nextId('a', [{ id: 'a1' }, { id: 'a7' }, { id: 'x9' }])).toBe('a8');
    let e = setExpectedPair(emptyEngagement(), 'team', 'Sales', 'Finance', 'close');
    expect(e.intent.pairs[0]).toMatchObject({ a: 'Finance', b: 'Sales' });
    expect(expectedLevel(e, 'team', 'Sales', 'Finance')).toBe('close');
    e = setExpectedPair(e, 'team', 'Finance', 'Sales', 'none');
    expect(e.intent.pairs).toHaveLength(1);
    e = setExpectedPair(e, 'team', 'Finance', 'Sales', null);
    expect(e.intent.pairs).toHaveLength(0);
  });

  it('creates a record when one is changed on a project without one', () => {
    const p = updateEngagement(demo(), (e) => ({ ...e, question: 'Q' }));
    expect(p.engagement?.step).toBe('all');
    expect(p.engagement?.question).toBe('Q');
  });

  it('reports a retention date that has passed', () => {
    const p = withEngagement(demo(), {
      ...emptyEngagement(),
      governance: { audiences: {}, retention_date: '2026-11-02' },
    });
    expect(retentionPassed(p, '2026-11-03')).toBe(true);
    expect(retentionPassed(p, '2026-11-02')).toBe(false);
    expect(retentionPassed(demo(), '2030-01-01')).toBe(false);
  });
});

describe('the assessment against intent', () => {
  it('places shares in the bands at their edges', () => {
    expect(verdictFor('none', 0)).toBe('within');
    expect(verdictFor('none', 0.05)).toBe('above');
    expect(verdictFor('occasional', 0.0499)).toBe('below');
    expect(verdictFor('occasional', 0.05)).toBe('within');
    expect(verdictFor('occasional', 0.15)).toBe('above');
    expect(verdictFor('regular', 0.15)).toBe('within');
    expect(verdictFor('regular', 0.3999)).toBe('within');
    expect(verdictFor('regular', 0.4)).toBe('above');
    expect(verdictFor('close', 0.39)).toBe('below');
    expect(verdictFor('close', 1)).toBe('within');
  });

  it('counts a pair as tied in either direction only when directed', () => {
    // Members 0, 1 in A; 2 in B. 2 → 0 at 0.5; 2 → 1 at 0.2 (below 0.30); 1 → 2 not rated.
    // Mutual weights are symmetric, so the mutual view reads one direction only.
    const n = 3;
    const w = new Float64Array(n * n);
    w[2 * n + 0] = 0.5;
    w[2 * n + 1] = 0.2;
    w[1 * n + 2] = NaN;
    const input: IntentInput = {
      weights: w,
      memberIds: ['m1', 'm2', 'm3'],
      values: ['A', 'A', 'B'],
      directed: true,
    };
    expect(pairCounts(input, 'A', 'B')).toEqual({ tied: 1, possible: 2 });
    expect(pairCounts({ ...input, directed: false }, 'A', 'B')).toEqual({ tied: 0, possible: 2 });
    // Within A: one pair, untied.
    expect(pairCounts(input, 'A', 'A')).toEqual({ tied: 0, possible: 1 });
    expect(INTENT_RULES.minWeight).toBe(0.3);
    const g = groupShares(input, 'A');
    expect(g).toMatchObject({ inside: 0, insidePossible: 1, outside: 1, outsidePossible: 2 });
  });

  it('finds the demo’s Finance below a regular expectation and People–Product above occasional', async () => {
    const map = {
      ...initialMapSettings(),
      view: 'symmetrised' as const,
      symmetrise: 'mean' as const,
    };
    let e = setExpectedPair(
      emptyEngagement('understand'),
      'team',
      'Finance',
      'Operations',
      'regular',
    );
    e = setExpectedPair(e, 'team', 'People', 'Product', 'occasional');
    e = setExpectedPair(e, 'team', 'Operations', 'Product', 'occasional');
    const project = withEngagement(demo(), e);
    const result = await screenResult(project, map, initialWeightState());
    const layer = intentLayer(project, result);
    expect(layer).toBe('connection_strength');
    const input = intentInput(project, result, layer, 'team');
    if (!input) throw new Error('no input');
    const rows = assessIntent(e, 'team', input);
    const row = (a: string, b: string) => rows.find((r) => r.a === a && r.b === b);
    // Measured at the checkpoint: Finance–Operations 3%, People–Product 19%, Operations–Product 11%.
    expect(row('Finance', 'Operations')).toMatchObject({ verdict: 'below', expected: 'regular' });
    expect(Math.round(100 * (row('Finance', 'Operations')?.share ?? 0))).toBe(3);
    expect(row('People', 'Product')).toMatchObject({ verdict: 'above' });
    expect(Math.round(100 * (row('People', 'Product')?.share ?? 0))).toBe(19);
    expect(row('Operations', 'Product')).toMatchObject({ verdict: 'within' });
    // Ordered most collaboration expected first.
    expect(rows[0]?.expected).toBe('regular');
    // The expectation's own sentences.
    const sentences = expectationData(
      project,
      result,
      { kind: 'pair', attribute: 'team', a: 'Finance', b: 'Operations' },
      (id) => id,
    );
    expect(sentences?.[0]).toMatch(/possible pairs between Finance and Operations are tied \(3%\)/);
    expect(sentences?.[1]).toBe('Below the expected range for regular collaboration.');
    const group = expectationData(
      project,
      result,
      { kind: 'group', attribute: 'team', value: 'Finance' },
      (id) => id,
    );
    expect(group?.[0]).toMatch(/^Within Finance, /);
    const q = expectationData(project, result, { kind: 'question', id: 'groups' }, (id) => id);
    expect(q?.length).toBeGreaterThan(0);
    expect(presentValues(project, 'team')).toContain('Finance');
  });

  it('notes few pairs and a group absent from the wave', () => {
    const input: IntentInput = {
      weights: new Float64Array(4),
      memberIds: ['a', 'b'],
      values: ['A', 'B'],
      directed: false,
    };
    let e = setExpectedPair(emptyEngagement(), 'team', 'A', 'B', 'none');
    e = setExpectedPair(e, 'team', 'A', 'C', 'close');
    const rows = assessIntent(e, 'team', input);
    expect(rows.find((r) => r.b === 'B')).toMatchObject({
      few: true,
      verdict: 'within',
      possible: 1,
    });
    expect(rows.find((r) => r.b === 'C')).toMatchObject({ verdict: null, possible: 0 });
  });
});

describe('steps and checklists', () => {
  it('shows each step’s tabs, and every tab on all tools or under Advanced', () => {
    expect(centreShown('all', false, 'survey')).toBe(true);
    expect(centreShown('plan', false, 'map')).toBe(false);
    expect(centreShown('plan', true, 'map')).toBe(true);
    expect(centreShown('understand', false, 'groups')).toBe(true);
    expect(rightShown('act', false, 'insights')).toBe(true);
    expect(rightShown('act', false, 'explore')).toBe(false);
    for (const tabs of Object.values(STEP_TABS)) {
      expect(tabs.centre).toContain('engagement');
      expect(tabs.right.length).toBeGreaterThan(0);
    }
  });

  it('ticks items the project shows done, and keeps the analyst’s ticks', () => {
    const ids = Object.values(CHECKLISTS).flatMap((c) => c.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
    let e = { ...emptyEngagement(), question: 'Q' };
    e = toggleCheck(e, 'relations', true);
    const project = withEngagement(demo(), e);
    const plan = checklist('plan', { project, engagement: e, result: null });
    expect(plan.find((i) => i.id === 'question')).toEqual({
      id: 'question',
      auto: true,
      done: true,
    });
    expect(plan.find((i) => i.id === 'sponsor')?.done).toBe(false);
    expect(plan.find((i) => i.id === 'relations')).toEqual({
      id: 'relations',
      auto: false,
      done: true,
    });
    const collect = checklist('collect', { project, engagement: e, result: null });
    expect(collect.find((i) => i.id === 'imported')?.done).toBe(true);
    const act = checklist('act', {
      project,
      engagement: addAction(e, { owner: 'X', due: '2027-01-01' }, 'now'),
      result: null,
    });
    expect(act.map((i) => i.done)).toEqual([true, false]);
  });

  it('keys an observation by rule, layer, group and members', async () => {
    const result = await screenResult(demo(), initialMapSettings(), initialWeightState());
    const silo = result.insights.find((o) => o.rule === 'silo')?.observations[0];
    if (!silo) throw new Error('no silo');
    const key = observationKey(silo);
    expect(key.startsWith('silo:')).toBe(true);
    expect(key).toContain('team=Finance');
    expect(observationKey({ ...silo, members: [...silo.members].reverse() })).toBe(key);
  });
});

describe('the guided first run', () => {
  it('finds each task done when the workspace shows its answer', async () => {
    const project = demo();
    const result = await screenResult(project, initialMapSettings(), initialWeightState());
    useAppStore.getState().setProject(project);
    useAppStore.getState().setResults({ status: 'ready', current: result, error: null });
    const state = () => useAppStore.getState();
    expect(taskDone(0, state(), 0)).toBe(false);
    const finance = project.members.filter((m) => m.attributes.team === 'Finance').map((m) => m.id);
    state().setGroup(finance);
    expect(taskDone(0, state(), 0)).toBe(true);
    const routes = result.insights.find((o) => o.rule === 'onlyRoutes')?.observations[0];
    expect(routes).toBeDefined();
    expect(taskDone(1, state(), 0)).toBe(false);
    state().selectMember(routes?.members[0] ?? null);
    expect(taskDone(1, state(), 0)).toBe(true);
    expect(taskDone(2, state(), project.saved_views.length)).toBe(false);
  });
});

describe('Explain this view', () => {
  it('describes the map on screen in plain sentences', async () => {
    const project = demo();
    const map = {
      ...initialMapSettings(),
      threshold: 0.3,
      thresholdTo: 1,
      filters: [{ key: 'team', values: ['Finance', 'Sales'] }],
    };
    const result = await screenResult(project, map, initialWeightState());
    const settings = effectiveSettings(project, result, map);
    const theme = readMapTheme(tokensCss());
    const names = project.members.map((m) => m.display_name);
    const model = buildMapModel(project, result, settings, theme, names);
    const data = { project, result, settings, model, mapModel: model, theme } as unknown as MapData;
    const { sentences, terms } = explainView(data, theme, (i) => names[i] ?? '');
    const shown = model.nodes.filter((n) => n.visible).length;
    expect(sentences[0]).toBe(
      `The map shows ${String(shown)} of ${String(project.members.length)} members.`,
    );
    expect(sentences).toContain('Only members with team or function Finance or Sales are shown.');
    expect(
      sentences.some((s) => /^Each line is a tie on connection strength: \d+ drawn\./.test(s)),
    ).toBe(true);
    expect(sentences).toContain('Ties below 0.30 are hidden; every figure counts all ties.');
    expect(sentences.some((s) => s.startsWith('Larger circles have higher'))).toBe(true);
    expect(sentences.some((s) => s.startsWith('Line colour shows valence'))).toBe(true);
    expect(sentences.some((s) => s.startsWith('Members with stronger ties are drawn closer'))).toBe(
      true,
    );
    expect(terms).toContain('Directions');
    expect(terms).toContain('Negative ratings');
    for (const s of sentences) expect(s).toMatch(/^[A-Z].*[.]$/);
  });
});
