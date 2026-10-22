// Outcome tests for the insight rules on the demo and the twelve scenario
// projects (build plan session 3, docs/reports/initial-assessment.md issues 1–3,
// 5, 7 and 9). Each scenario is analysed under the app's default weights in the
// directed view and symmetrised by mean and by min, as
// `npm run scenarios:measure` prints it. tests/unit/scenarios.test.ts checks
// the data; this file checks what the rules make of it, so a change to a rule
// or a default that alters an outcome fails here.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Project } from '../../src/data/schema';
import { parseProject } from '../../src/data/projectFile';
import { analyse } from '../../src/engine/analyse';
import { buildAnalysisInput } from '../../src/engine/input';
import { INSIGHT_RULES } from '../../src/engine/insights';
import type {
  AnalysisResult,
  InsightOutcome,
  InsightRuleId,
  SymmetriseRule,
  ViewKind,
} from '../../src/engine/types';
import { effectiveWeights, initialWeightState } from '../../src/ui/state/presets';

const load = (slug: string): Project =>
  parseProject(
    readFileSync(
      join(
        import.meta.dirname,
        '..',
        '..',
        'src',
        'demo',
        slug === 'demo' ? 'demo.ona.json' : `scenario-${slug}.ona.json`,
      ),
      'utf8',
    ),
  );

type ViewName = 'directed' | 'mean' | 'min';
const VIEWS: Record<ViewName, [ViewKind, SymmetriseRule]> = {
  directed: ['directed', 'mean'],
  mean: ['symmetrised', 'mean'],
  min: ['symmetrised', 'min'],
};

const cache = new Map<string, Promise<AnalysisResult>>();
function run(slug: string, view: ViewName, patch?: (p: Project) => Project) {
  const key = `${slug}/${view}/${patch ? 'patched' : ''}`;
  let r = cache.get(key);
  if (!r) {
    const base = load(slug);
    const project = patch ? patch(base) : base;
    const [kind, rule] = VIEWS[view];
    r = analyse(
      buildAnalysisInput(
        project,
        { view: kind, symmetrise: rule, ...effectiveWeights(project, initialWeightState()) },
        key,
      ),
    );
    cache.set(key, r);
  }
  return r;
}

async function outcome(
  slug: string,
  view: ViewName,
  rule: InsightRuleId,
  patch?: (p: Project) => Project,
) {
  const r = await run(slug, view, patch);
  return r.insights.find((o) => o.rule === rule) as InsightOutcome;
}
const members = (o: InsightOutcome) => o.observations.flatMap((x) => x.members);
const groups = (o: InsightOutcome) =>
  o.observations.map((x) =>
    x.group?.other ? `${x.group.value}/${x.group.other}` : x.group?.value,
  );
const all: ViewName[] = ['directed', 'mean', 'min'];

describe('silos (issues 1 and 2)', () => {
  it.each([['large-department'], ['single-team-shifts']])(
    'is not applied when every member is in one group (%s)',
    async (slug) => {
      for (const view of all)
        expect(await outcome(slug, view, 'silo')).toMatchObject({
          status: 'unavailable',
          reason: 'tooFewGroups',
        });
    },
  );

  it('reads no conflict layer: merger-matrix has no silo', async () => {
    for (const view of all)
      expect((await outcome('merger-matrix', view, 'silo')).status).toBe('none');
  });

  it('finds post-merger silos on workflow dependency, never on conflict', async () => {
    for (const view of all) {
      const o = await outcome('post-merger', view, 'silo');
      expect(o.observations.length).toBeGreaterThan(0);
      for (const x of o.observations) expect(x.ref).toBe('workflow_dependency');
    }
    expect(groups(await outcome('post-merger', 'directed', 'silo'))).toEqual([
      'Customer',
      'Technology',
      'Finance',
    ]);
  });

  it('still finds Finance in the demo, naming its peripheral members there (overlap)', async () => {
    for (const view of all) {
      const silo = await outcome('demo', view, 'silo');
      expect(groups(silo)).toEqual(['Finance']);
      const peripheral = await outcome('demo', view, 'peripheral');
      expect(peripheral.status).toBe('none');
      expect(peripheral.inSilo).toBe(silo.observations[0]?.evidence.alsoPeripheral);
    }
    expect(
      (await outcome('demo', 'directed', 'silo')).observations[0]?.evidence.alsoPeripheral,
    ).toBe(6);
    expect((await outcome('demo', 'min', 'silo')).observations[0]?.evidence.alsoPeripheral).toBe(4);
  });

  it('stays quiet where there is no silo', async () => {
    for (const slug of [
      'partial-response',
      'asymmetric-ratings',
      'compressed-ratings',
      'matrix-organisation',
      'dense-team',
      'silent-leaders',
      'polite-dense-team',
      'messy-survey',
    ])
      for (const view of all) expect((await outcome(slug, view, 'silo')).status, slug).toBe('none');
  });
});

describe('conflict in the composite (issue 3)', () => {
  it.each([['post-merger'], ['merger-matrix'], ['single-team-shifts']])(
    'leaves the conflict layers out of the default composite (%s)',
    async (slug) => {
      const r = await run(slug, 'directed');
      expect(r.composite?.excluded).toEqual(
        expect.arrayContaining(['conflict_task', 'conflict_personal']),
      );
      expect(r.composite?.terms.map((t) => t.layer)).not.toContain('conflict_task');
    },
  );

  it('names merger-matrix brokers above the floor once friction no longer adds to ties', async () => {
    for (const view of all) {
      const o = await outcome('merger-matrix', view, 'brokers');
      expect(o.observations[0]?.members[0]).toBe('SAL01');
      expect(o.observations[0]?.evidence.highestBetweenness).toBeGreaterThanOrEqual(0.1);
    }
  });
});

describe('relative rules (issue 5)', () => {
  it('names no broker from differences below the floor', async () => {
    for (const slug of ['compressed-ratings', 'polite-dense-team', 'dense-team'])
      for (const view of all)
        expect((await outcome(slug, view, 'brokers')).status, slug).toBe('none');
  });

  it('finds no peripheral member in the dense team', async () => {
    for (const view of all)
      expect((await outcome('dense-team', view, 'peripheral')).status).toBe('none');
  });

  it('finds only the part-timer in the polite dense team', async () => {
    for (const view of all)
      expect(members(await outcome('polite-dense-team', view, 'peripheral'))).toEqual(['RES04']);
  });

  it('lists five of the large department remote workers and counts the rest', async () => {
    const remote = ['OPS57', 'OPS58', 'OPS59', 'OPS60', 'OPS61', 'OPS62', 'OPS63', 'OPS64'];
    for (const view of all) {
      const o = await outcome('large-department', view, 'peripheral');
      const listed = members(o);
      expect(listed).toHaveLength(INSIGHT_RULES.peripheral.maxMembers);
      for (const id of listed) expect(remote).toContain(id);
      expect(o.observations[0]?.evidence.found).toBeGreaterThan(5);
    }
  });

  it('never lists more than five peripheral members', async () => {
    for (const slug of ['single-team-shifts', 'post-merger', 'messy-survey', 'merger-matrix'])
      for (const view of all)
        expect(members(await outcome(slug, view, 'peripheral')).length).toBeLessThanOrEqual(5);
  });

  it('keeps the brokers the scenarios were built with', async () => {
    expect(members(await outcome('post-merger', 'directed', 'brokers'))[0]).toBe('INT01');
    expect(members(await outcome('matrix-organisation', 'directed', 'brokers'))).toEqual([
      'ENG05',
      'DES03',
      'SHA02',
    ]);
    expect(members(await outcome('demo', 'directed', 'brokers'))).toContain('OPE04');
  });
});

describe('grouping attribute (issue 7)', () => {
  const groupBy = (key: string) => (p: Project) => ({
    ...p,
    settings: { ...p.settings, insight_group: key },
  });

  it('examines the legacy split after the merger', async () => {
    const informal = await outcome(
      'post-merger',
      'directed',
      'informalOnly',
      groupBy('legacy_org'),
    );
    expect(groups(informal)).toContain('Southbank/Southbank');
    const formal = await outcome('post-merger', 'directed', 'formalOnly', groupBy('legacy_org'));
    expect(formal.observations.every((x) => x.group?.attribute === 'legacy_org')).toBe(true);
    expect(formal.observations.length).toBeGreaterThan(0);
  });

  it('compares programmes in the merger matrix', async () => {
    const o = await outcome('merger-matrix', 'min', 'formalOnly', groupBy('programme'));
    expect(groups(o)).toEqual(expect.arrayContaining(['Harbour/Pier']));
  });

  it('finds the day shift a silo in the contact centre, by shift', async () => {
    const o = await outcome('single-team-shifts', 'min', 'silo', groupBy('shift'));
    expect(groups(o)).toEqual(['Day']);
    expect(o.observations[0]?.group?.attribute).toBe('shift');
  });

  it('falls back to team when the chosen attribute is gone', async () => {
    const o = await outcome('demo', 'directed', 'silo', groupBy('no_such_attribute'));
    expect(groups(o)).toEqual(['Finance']);
  });
});

describe('negative ratings not returned (issue 9)', () => {
  it.each([
    ['asymmetric-ratings', 3, 0],
    ['compressed-ratings', 3, 0],
    ['large-department', 3, 1],
    ['merger-matrix', 4, 0],
    ['messy-survey', 4, 2],
    ['post-merger', 3, 1],
  ])('counts them on valence in %s', async (slug, count, notRated) => {
    for (const view of all) {
      const o = await outcome(slug, view, 'oneWayNegative');
      const valence = o.observations.find((x) => x.ref === 'valence');
      expect(valence?.evidence).toMatchObject({ count, notRated });
      expect(valence?.view.drawNegative).toBe(true);
    }
  });

  it('finds the strain inside the clinic in the messy survey', async () => {
    const o = await outcome('messy-survey', 'directed', 'oneWayNegative');
    expect(o.observations[0]?.groups).toEqual([
      { attribute: 'team', value: 'Clinic', other: 'Clinic', count: 4 },
    ]);
  });

  it.each([
    ['demo'],
    ['polite-dense-team'],
    ['dense-team'],
    ['partial-response'],
    ['silent-leaders'],
  ])('stays quiet below three (%s)', async (slug) => {
    expect((await outcome(slug, 'directed', 'oneWayNegative')).status).toBe('none');
  });
});
