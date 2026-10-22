// Data-quality checks (build plan session 4, src/data/quality.ts): each
// condition built into the scenario projects (docs/scenarios.md) is found, the
// thresholds hold at their boundaries, the engine flags values that rest on a
// member's own ratings, observations state what the members named share, and
// the data-quality statement names no one.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/data/defaults';
import { parseProject } from '../../src/data/projectFile';
import { QUALITY_RULES, computeQuality } from '../../src/data/quality';
import type { Member, Project, Tie } from '../../src/data/schema';
import { analyse } from '../../src/engine/analyse';
import { buildAnalysisInput } from '../../src/engine/input';
import type { SymmetriseRule, ViewKind } from '../../src/engine/types';
import { membersText } from '../../src/ui/copy/insights';
import { qualityStatement } from '../../src/ui/copy/quality';
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

const SLUGS = [
  'demo',
  'partial-response',
  'asymmetric-ratings',
  'compressed-ratings',
  'matrix-organisation',
  'large-department',
  'dense-team',
  'post-merger',
  'silent-leaders',
  'polite-dense-team',
  'merger-matrix',
  'single-team-shifts',
  'messy-survey',
];

const sorted = (ids: readonly string[]) => [...ids].sort();

async function run(project: Project, view: ViewKind, symmetrise: SymmetriseRule = 'mean') {
  const weights = effectiveWeights(project, initialWeightState());
  return analyse(buildAnalysisInput(project, { view, symmetrise, ...weights }, 'quality'));
}

describe('the conditions built into the scenarios', () => {
  it('partial response: three silent members, one who stopped part way', () => {
    const q = computeQuality(load('partial-response'));
    expect(sorted(q.noRatings)).toEqual(['CHA05', 'FIE01', 'FIE04']);
    expect(q.fewRatings).toEqual(['HYD06']);
    const field = q.byGroup?.rows.find((r) => r.value === 'Field Operations');
    expect(field?.noRatings).toBe(2);
    expect(field?.respondents).toBe(4);
  });

  it('silent leaders: the partners and the Analysis lead; a generous and a harsh rater', () => {
    const q = computeQuality(load('silent-leaders'));
    expect(sorted(q.noRatings)).toEqual(['ANA01', 'PAR01', 'PAR02', 'PAR03', 'PAR04']);
    expect(q.higher).toEqual(['ADV04']);
    expect(q.lower).toEqual(['ANA05']);
    expect(q.byGroup?.rows.find((r) => r.value === 'Partners')?.rate).toBe(0);
    expect(q.coverage.belowThreshold).toBe(true);
  });

  it('single team on shifts: eight night agents silent, coverage lowest on the night shift', () => {
    const q = computeQuality(load('single-team-shifts'));
    expect(sorted(q.noRatings)).toEqual(
      ['CC38', 'CC39', 'CC40', 'CC41', 'CC42', 'CC44', 'CC45', 'CC46'].sort(),
    );
    expect(q.fewRatings).toEqual(['CC12']);
    // Coverage passes the threshold overall while one shift is mostly silent (issue 4).
    expect(q.coverage.belowThreshold).toBe(false);
    expect(q.lowestGroup?.attribute).toBe('shift');
    expect(q.lowestGroup?.row.value).toBe('Night');
    const s = qualityStatement(q).join(' ');
    expect(s).toContain('all in Night by shift, eight of its 12 members');
    expect(s).toContain('Coverage is lowest in Night');
  });

  it('messy survey: silent, partial, same-answer, generous and harsh raters', () => {
    const q = computeQuality(load('messy-survey'));
    expect(sorted(q.noRatings)).toEqual(['ADM04', 'CLI08', 'LAB06']);
    expect(sorted(q.fewRatings)).toEqual(['ADM07', 'CLI02', 'LAB03']);
    expect(sorted(q.sameAnswer)).toEqual(['ADM06', 'LAB07']);
    expect(q.higher).toContain('ADM03');
    expect(q.lower).toContain('LAB04');
    const s = qualityStatement(q);
    // The consultant review's example statement (§7, item 3).
    expect(s[0]).toBe('Coverage 79.6%, below the 80% threshold.');
    expect(s[1]).toBe(
      'Three of 26 people gave no ratings (one each in Clinic, Labs and Admin), and three more gave fewer than half of the ratings possible.',
    );
    expect(s[2]).toBe(
      "What these six people's own ratings would show is missing; their results rest largely on other people's reports.",
    );
  });

  it('compressed ratings: three give everyone the same answer, and nearly everyone reports a tie', () => {
    const q = computeQuality(load('compressed-ratings'));
    expect(sorted(q.sameAnswer)).toEqual(['BAK06', 'DIS03', 'MIL05']);
    expect(q.denseReporting).toBe(true);
    // Seventeen respondents avoid both ends: on average they use at most three of six points.
    const full = ['MIL02', 'BAK03', 'DIS01', 'DIS07'];
    for (const r of q.raters) {
      if (q.sameAnswer.includes(r.id)) expect(r.spread).toBeCloseTo(0, 12);
      else if (!full.includes(r.id)) expect(r.scaleUsed).toBeLessThan(0.6);
    }
  });

  it('polite dense team: four give everyone 4 and +2', () => {
    const q = computeQuality(load('polite-dense-team'));
    expect(sorted(q.sameAnswer)).toEqual(['DES03', 'ENG05', 'ENG08', 'PRO03']);
    expect(q.oneWay).toBe(0);
  });

  it('asymmetric ratings: the generous and the harsh rater; reliance one way only', () => {
    const q = computeQuality(load('asymmetric-ratings'));
    expect(q.higher).toEqual(['DES04']);
    expect(q.lower).toContain('ENG05');
    // Client Services rely on Engineering, which rarely works with them in return.
    const rows = q.byGroup?.rows ?? [];
    const client = rows.find((r) => r.value === 'Client Services');
    for (const r of rows) expect(client?.oneWayShare ?? 0).toBeGreaterThanOrEqual(r.oneWayShare);
  });

  it('post-merger: four partial responders; Northbank rates higher than Southbank', () => {
    const q = computeQuality(load('post-merger'));
    expect(q.fewRatings).toHaveLength(4);
    const legacy = q.breakdowns.find((b) => b.attribute === 'legacy_org');
    const north = legacy?.rows.find((r) => r.value === 'Northbank')?.meanGiven ?? NaN;
    const south = legacy?.rows.find((r) => r.value === 'Southbank')?.meanGiven ?? NaN;
    expect(north - south).toBeGreaterThan(0.1);
  });

  it('merger matrix: Eastgate respondents rate higher than Westmoor', () => {
    const q = computeQuality(load('merger-matrix'));
    const legacy = q.breakdowns.find((b) => b.attribute === 'legacy_org');
    const east = legacy?.rows.find((r) => r.value === 'Eastgate')?.meanGiven ?? NaN;
    const west = legacy?.rows.find((r) => r.value === 'Westmoor')?.meanGiven ?? NaN;
    expect(east - west).toBeGreaterThan(0.1);
  });

  it('dense team: nothing flagged, every tie reported back', () => {
    const q = computeQuality(load('dense-team'));
    expect([...q.noRatings, ...q.fewRatings, ...q.sameAnswer, ...q.higher, ...q.lower]).toEqual([]);
    expect(q.oneWay).toBe(0);
    expect(q.denseReporting).toBe(true);
  });

  it('the demo: the two members who answered about half the survey', () => {
    const q = computeQuality(load('demo'));
    expect(q.noRatings).toEqual([]);
    expect(sorted(q.fewRatings)).toEqual(['OPE07', 'SAL08']);
  });

  it('the statement names no member in any project', () => {
    for (const slug of SLUGS) {
      const project = load(slug);
      const text = qualityStatement(computeQuality(project)).join(' ');
      for (const m of project.members) {
        expect(text.includes(m.display_name), `${slug}: ${m.id}`).toBe(false);
        expect(new RegExp(`\\b${m.id}\\b`).test(text), `${slug}: ${m.id}`).toBe(false);
      }
    }
  });
});

// ------------------------------------------------------------------ boundaries

const member = (id: string): Member => ({ id, display_name: id, attributes: { team: 'T' } });

/** Five members on connection strength alone; `rows[i][j]` is i's rating of j, null for none. */
function grid(rows: (number | null)[][]): Project {
  const p = createProject('Boundaries', '2026-10-22T00:00:00.000Z');
  p.members = rows.map((_, i) => member(`M${String(i)}`));
  p.layers = p.layers.map((l) => ({ ...l, enabled: l.key === 'connection_strength' }));
  const ties: Tie[] = [];
  rows.forEach((row, i) => {
    row.forEach((value, j) => {
      if (i !== j && value !== null)
        ties.push({
          rater_id: `M${String(i)}`,
          ratee_id: `M${String(j)}`,
          variable: 'connection_strength',
          value,
          wave: 1,
        });
    });
  });
  p.ties = ties;
  return p;
}

describe('thresholds at their boundaries', () => {
  it('few ratings: below half, not at half', () => {
    // Seven members, six possible ratings each: three is half, two is below.
    const n = 7;
    const rows = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? null : 3)),
    );
    rows[1] = rows[1]?.map((v, j) => (j > 0 && j <= 4 && j !== 1 ? v : null)) ?? [];
    rows[2] = rows[2]?.map((v, j) => (j === 0 || j === 1 ? v : null)) ?? [];
    rows[3] = rows[3]?.map(() => null) ?? [];
    const q = computeQuality(grid(rows));
    expect(QUALITY_RULES.fewRatings).toBe(0.5);
    expect(q.coverage.raters[1]?.rate).toBe(0.5);
    expect(q.flags[1]).toBeNull();
    expect(q.flags[2]).toBe('gaveFewRatings');
    expect(q.flags[3]).toBe('gaveNoRatings');
  });

  it('same answer: needs the minimum number of ratings on a layer', () => {
    const rate = (n: number, fill: (j: number) => number | null) => {
      const rows = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? null : (j + i) % 5)),
      );
      rows[0] = Array.from({ length: n }, (_, j) => (j === 0 ? null : fill(j)));
      return computeQuality(grid(rows));
    };
    const min = QUALITY_RULES.sameAnswerMinRatings;
    expect(rate(min + 1, () => 4).raters[0]?.sameAnswer).toBe(true);
    expect(rate(min, () => 4).raters[0]?.sameAnswer).toBe(false);
    expect(rate(min + 1, (j) => (j === 1 ? 3 : 4)).raters[0]?.sameAnswer).toBe(false);
  });

  it('rating style: a mean exactly the threshold from the median counts', () => {
    // Everyone rates 2 of 5 (0.4); M0 rates 2.75 (0.55), 0.15 above.
    const n = 6;
    const rows = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j): number | null => (i === j ? null : 2)),
    );
    rows[0] = rows[0]?.map((v) => (v === null ? null : 2.75)) ?? [];
    rows[1] = rows[1]?.map((v) => (v === null ? null : 1.3)) ?? [];
    const q = computeQuality(grid(rows));
    expect(q.medianMean).toBeCloseTo(0.4, 12);
    expect(q.raters[0]?.style).toBe('higher');
    expect(q.raters[1]?.style).toBe(null);
  });

  it('many ties: at least the margin above the median', () => {
    // Nine members, eight colleagues each: most tie four (0.5); M0 ties six (0.75), M1 five.
    const n = 9;
    const rows = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => {
        if (i === j) return null;
        const k = (j - i + n) % n;
        const ties = i === 0 ? 6 : i === 1 ? 5 : 4;
        return k <= ties ? 3 : 0;
      }),
    );
    const q = computeQuality(grid(rows));
    expect(q.medianTiedShare).toBe(0.5);
    expect(q.raters[0]?.tiedShare).toBe(0.75);
    expect(q.raters[0]?.manyTies).toBe(true);
    expect(q.raters[1]?.manyTies).toBe(false);
  });
});

// ------------------------------------------------------------------ the engine

describe('rating flags in the analysis', () => {
  it('flags the silent hub and leaves incoming metrics unflagged when directed', async () => {
    const project = load('partial-response');
    const directed = await run(project, 'directed');
    const fie01 = project.members.findIndex((m) => m.id === 'FIE01');
    const hyd06 = project.members.findIndex((m) => m.id === 'HYD06');
    expect(directed.ratingFlags[fie01]).toBe('gaveNoRatings');
    expect(directed.ratingFlags[hyd06]).toBe('gaveFewRatings');
    expect(directed.ownRatingMetrics).toContain('outStrength');
    expect(directed.ownRatingMetrics).toContain('betweenness');
    expect(directed.ownRatingMetrics).not.toContain('inStrength');
    expect(directed.ownRatingMetrics).not.toContain('harmonicIn');
    const mutual = await run(project, 'symmetrised');
    expect(mutual.ownRatingMetrics).toContain('strength');
    // The symmetrised view names FIE01 as the only broker, and marks them.
    const brokers = mutual.insights.find((o) => o.rule === 'brokers');
    expect(brokers?.observations[0]?.members).toEqual(['FIE01']);
    expect(brokers?.observations[0]?.noRatings).toEqual(['FIE01']);
  });

  it('marks silent members named by a rule, and says what most of them share', async () => {
    const project = load('single-team-shifts');
    const r = await run(project, 'directed');
    const o = r.insights.find((x) => x.rule === 'peripheral')?.observations[0];
    if (!o) throw new Error('no peripheral observation');
    expect(o.noRatings?.length).toBeGreaterThan(0);
    expect(o.shared?.find((s) => s.attribute === 'shift')).toMatchObject({ value: 'Night' });
    const text = membersText(o, {
      layerLabel: (k) => k,
      attributeLabel: (k) => project.attribute_definitions.find((a) => a.key === k)?.label ?? k,
    });
    expect(text).toContain('share shift Night');
    expect(text).toContain('gave no ratings');
  });

  it('states shared attributes only when they are more common than among all members', async () => {
    const project = load('large-department');
    const r = await run(project, 'directed');
    const o = r.insights.find((x) => x.rule === 'peripheral')?.observations[0];
    // Every member is in Operations, so team is never quoted; the remote workers are.
    expect(o?.shared?.some((s) => s.attribute === 'team')).toBe(false);
    expect(o?.shared?.find((s) => s.attribute === 'location')).toMatchObject({
      value: 'Remote',
      count: 5,
    });
  });
});
