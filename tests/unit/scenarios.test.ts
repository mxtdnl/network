// The scenario projects (scripts/generate-scenarios.ts, CLAUDE.md D138): each
// committed file is the generator's output, opens through parseProject, holds
// the condition it was built to contain, and analyses in both views.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCENARIOS, scenarioFile } from '../../scripts/generate-scenarios';
import { computeCoverage } from '../../src/data/coverage';
import { parseProject, serialiseProject } from '../../src/data/projectFile';
import type { Project } from '../../src/data/schema';
import { analyse } from '../../src/engine/analyse';
import { buildAnalysisInput } from '../../src/engine/input';
import { effectiveWeights, initialWeightState } from '../../src/ui/state/presets';

const dir = join(import.meta.dirname, '..', '..', 'src', 'demo');
const committed = (slug: string) => readFileSync(join(dir, scenarioFile(slug)), 'utf8');
const scenario = (slug: string) => parseProject(committed(slug));

/** Values given by `rater` on `variable` (numbers only). */
function given(p: Project, rater: string, variable: string): number[] {
  return p.ties
    .filter((t) => t.rater_id === rater && t.variable === variable && typeof t.value === 'number')
    .map((t) => t.value as number);
}
const rating = (p: Project, a: string, b: string, variable: string) =>
  p.ties.find((t) => t.rater_id === a && t.ratee_id === b && t.variable === variable)?.value;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe('scenario projects', () => {
  it.each(SCENARIOS.map((s) => [s.slug, s] as const))(
    '%s is deterministic, fictional and analyses in both views',
    async (slug, { generate }) => {
      const text = committed(slug);
      expect(serialiseProject(generate())).toBe(text);
      const p = parseProject(text);
      expect(p.meta.notes).toContain('Fictional data');
      expect(new Set(p.members.map((m) => m.display_name)).size).toBe(p.members.length);
      const weights = effectiveWeights(p, initialWeightState());
      for (const view of ['directed', 'symmetrised'] as const) {
        const r = await analyse(
          buildAnalysisInput(p, { view, symmetrise: 'mean', ...weights }, view),
        );
        expect(r.refs.composite?.network.members).toBe(p.members.length);
        expect(r.warnings).toEqual([]);
      }
    },
  );

  it('partial response: 15 of 18 responded, one stopped halfway, the hub is missing', () => {
    const p = scenario('partial-response');
    const c = computeCoverage(p);
    expect(p.members).toHaveLength(18);
    expect(c.raters.filter((r) => r.rated === 0).map((r) => r.id)).toEqual([
      'CHA05',
      'FIE01',
      'FIE04',
    ]);
    expect(new Set(p.ties.filter((t) => t.rater_id === 'HYD06').map((t) => t.ratee_id)).size).toBe(
      8,
    );
    // Coverage clears the default threshold although three members gave no ratings.
    expect(c.rate).toBeGreaterThan(0.8);
    const received = (id: string) =>
      p.ties.filter((t) => t.ratee_id === id && t.variable === 'connection_strength').length;
    // Rated by the 14 full respondents; HYD06 stopped before reaching them.
    expect(received('FIE01')).toBe(14);
    expect(given(p, 'FIE01', 'connection_strength')).toEqual([]);
  });

  it('asymmetric ratings: generous and harsh raters, seniority, one-way warmth and reliance', () => {
    const p = scenario('asymmetric-ratings');
    expect(computeCoverage(p).rate).toBe(1);
    const means = p.members.map(
      (m) => [m.id, mean(given(p, m.id, 'connection_strength'))] as const,
    );
    const sorted = [...means].sort((a, b) => b[1] - a[1]);
    expect(sorted[0]?.[0]).toBe('DES04');
    expect(sorted.at(-1)?.[0]).toBe('ENG05');
    for (const [a, b] of [
      ['DES06', 'CLI02'],
      ['ENG03', 'LEA03'],
      ['CLI04', 'DES02'],
    ] as const) {
      expect(rating(p, a, b, 'valence')).toBeGreaterThan(0);
      expect(rating(p, b, a, 'valence')).toBeLessThan(0);
    }
    expect(rating(p, 'CLI03', 'ENG02', 'connection_strength')).toBeGreaterThanOrEqual(4);
    expect(rating(p, 'ENG02', 'CLI03', 'connection_strength')).toBeLessThanOrEqual(1);
    // The director gives far less than they receive.
    const toDirector = p.ties.filter(
      (t) => t.ratee_id === 'LEA01' && t.variable === 'connection_strength',
    );
    expect(mean(toDirector.map((t) => t.value as number))).toBeGreaterThan(
      mean(given(p, 'LEA01', 'connection_strength')) + 1,
    );
  });

  it('compressed ratings: most avoid the ends, three give one answer, four use the scale', () => {
    const p = scenario('compressed-ratings');
    const scaled = ['connection_strength', 'informal_collaboration', 'formal_collaboration'];
    const styles = p.members.map((m) => {
      const values = scaled.flatMap((v) => given(p, m.id, v));
      return {
        id: m.id,
        distinct: new Set(values).size,
        min: Math.min(...values),
        max: Math.max(...values),
      };
    });
    expect(styles.filter((s) => s.distinct === 1).map((s) => s.id)).toEqual([
      'MIL05',
      'BAK06',
      'DIS03',
    ]);
    expect(styles.filter((s) => s.min >= 2 && s.max <= 4 && s.distinct > 1)).toHaveLength(17);
    const negative = new Set(
      p.ties
        .filter((t) => t.variable === 'valence' && (t.value as number) < 0)
        .map((t) => t.rater_id),
    );
    expect([...negative]).toEqual(['BAK03']);
  });

  it('matrix organisation: communities follow programmes, not functions', async () => {
    const p = scenario('matrix-organisation');
    expect(p.attribute_definitions.map((a) => a.key)).toEqual(
      expect.arrayContaining(['programme', 'second_programme']),
    );
    expect(p.members.filter((m) => m.attributes.team === null)).toHaveLength(2);
    const weights = effectiveWeights(p, initialWeightState());
    const r = await analyse(
      buildAnalysisInput(p, { view: 'directed', symmetrise: 'mean', ...weights }, 'k'),
    );
    const membership = r.refs.composite?.communities?.membership ?? new Int32Array();
    /** Share of members in their community's most common value of `key`. */
    const purity = (key: string) => {
      const counts = new Map<string, number>();
      p.members.forEach((m, i) => {
        const k = `${String(membership[i])}|${m.attributes[key] ?? ''}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      });
      const best = new Map<string, number>();
      for (const [k, n] of counts) {
        const c = k.split('|')[0] ?? '';
        best.set(c, Math.max(best.get(c) ?? 0, n));
      }
      return [...best.values()].reduce((s, n) => s + n, 0) / p.members.length;
    };
    expect(purity('programme')).toBeGreaterThanOrEqual(0.85);
    expect(purity('team')).toBeLessThan(0.5);
  });

  it('large department: 64 members, one team value, "does not apply" for strangers', () => {
    const p = scenario('large-department');
    expect(p.members).toHaveLength(64);
    expect(new Set(p.members.map((m) => m.attributes.team))).toEqual(new Set(['Operations']));
    const na = p.ties.filter((t) => t.not_applicable);
    expect(na.length).toBeGreaterThan(1000);
    expect(na.every((t) => t.variable === 'valence' && t.value === null)).toBe(true);
    expect(na.every((t) => rating(p, t.rater_id, t.ratee_id, 'connection_strength') === 0)).toBe(
      true,
    );
    const c = computeCoverage(p);
    expect(c.raters.filter((r) => r.rate < 0.8).map((r) => r.id)).toEqual([
      'OPS20',
      'OPS59',
      'OPS62',
    ]);
  });

  it('dense team: everyone rates everyone 3 or more on connection strength', () => {
    const p = scenario('dense-team');
    const strength = p.ties.filter((t) => t.variable === 'connection_strength');
    expect(strength).toHaveLength(18 * 17);
    expect(strength.every((t) => (t.value as number) >= 3)).toBe(true);
    expect(p.ties.filter((t) => t.value === null)).toHaveLength(1);
  });

  it('post-merger: leniency by legacy organisation, a sought-after lead, a new joiner', () => {
    const p = scenario('post-merger');
    const enabled = p.layers.filter((l) => l.enabled).map((l) => l.key);
    expect(enabled).toEqual(
      expect.arrayContaining([
        'advice',
        'workflow_dependency',
        'energy',
        'conflict_task',
        'conflict_personal',
      ]),
    );
    const legacy = new Map(p.members.map((m) => [m.id, m.attributes.legacy_org]));
    const byLegacy = (org: string) =>
      mean(
        p.ties
          .filter(
            (t) =>
              t.variable === 'connection_strength' &&
              legacy.get(t.rater_id) === org &&
              typeof t.value === 'number',
          )
          .map((t) => t.value as number),
      );
    expect(byLegacy('Northbank')).toBeGreaterThan(byLegacy('Southbank') + 0.5);
    // INT01 is asked for advice monthly or more by 28 colleagues, far more than anyone else.
    const advisers = (id: string) =>
      p.ties.filter((t) => t.ratee_id === id && t.variable === 'advice' && (t.value as number) >= 2)
        .length;
    expect(advisers('INT01')).toBeGreaterThanOrEqual(25);
    for (const m of p.members.filter((m) => m.id !== 'INT01')) {
      expect(advisers(m.id)).toBeLessThan(advisers('INT01') - 8);
    }
    const joiner = p.ties.filter(
      (t) => (t.rater_id === 'CUS12' || t.ratee_id === 'CUS12') && t.variable === 'valence',
    );
    expect(joiner.filter((t) => t.not_applicable).length).toBeGreaterThan(60);
    expect(legacy.get('CUS12')).toBe('Joined after the merger');
  });
});
