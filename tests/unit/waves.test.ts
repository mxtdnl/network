// Waves (build plan session 14): rosters per wave, the project one wave sees,
// the engine and coverage on a chosen wave, the wave setting in the store and
// saved views, and the project file.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { computeCoverage } from '../../src/data/coverage';
import { addMembers, removeMembers } from '../../src/data/members';
import { parseProject, serialiseProject } from '../../src/data/projectFile';
import { computeQuality } from '../../src/data/quality';
import { applyRatingChanges } from '../../src/data/ratings';
import type { Project, Survey } from '../../src/data/schema';
import {
  addToLatestWave,
  isMultiWave,
  latestRatedWave,
  nextWave,
  recordNewWave,
  resolveWave,
  scopeToWave,
  setOnWaveRoster,
  waveNumbers,
  waveRosterIds,
  waveSummaries,
} from '../../src/data/waves';
import { analyse } from '../../src/engine/analyse';
import { buildAnalysisInput } from '../../src/engine/input';
import { sharedLayout } from '../../src/ui/map/useMapModel';
import { effectiveWeights, initialWeightState } from '../../src/ui/state/presets';
import { mapToSaved, restoreViewById, saveCurrentView } from '../../src/ui/state/savedViews';
import { initialMapSettings, useAppStore } from '../../src/ui/state/store';
import { analysedWave, selectWaveInfo, selectWaveProject } from '../../src/ui/state/waves';

const read = (file: string) =>
  readFileSync(join(import.meta.dirname, '..', '..', 'src', 'demo', file), 'utf8');
const demo = () => parseProject(read('demo.ona.json'));
const twoWaves = () => parseProject(read('scenario-two-waves.ona.json'));

/** The demo with its ratings repeated as wave 2, one member off wave 2's roster. */
function demoTwoWaves(): Project {
  const p = demo();
  const leaver = 'SAL07';
  return recordNewWave(
    {
      ...p,
      ties: [
        ...p.ties,
        ...p.ties
          .filter((t) => t.rater_id !== leaver && t.ratee_id !== leaver && t.variable !== 'valence')
          .map((t) => ({ ...t, wave: 2 })),
      ],
    },
    2,
    p.members.map((m) => m.id).filter((id) => id !== leaver),
  );
}

const weights = (p: Project) => effectiveWeights(p, initialWeightState());

describe('wave rosters', () => {
  it('puts every member on a wave without a record, so one wave behaves as before', () => {
    const p = demo();
    expect(waveNumbers(p)).toEqual([1]);
    expect(isMultiWave(p)).toBe(false);
    expect(latestRatedWave(p)).toBe(1);
    expect(waveRosterIds(p, 1)).toEqual(p.members.map((m) => m.id));
    expect(scopeToWave(p, 1)).toBe(p);
    expect(nextWave(p)).toBe(2);
  });

  it('records earlier waves when a new one is recorded, and scopes each wave to its roster', () => {
    const p = demoTwoWaves();
    expect(waveNumbers(p)).toEqual([1, 2]);
    expect(isMultiWave(p)).toBe(true);
    expect(latestRatedWave(p)).toBe(2);
    expect(resolveWave(p, null)).toBe(2);
    expect(resolveWave(p, 1)).toBe(1);
    expect(p.settings.waves?.map((w) => [w.wave, w.roster.length])).toEqual([
      [1, 40],
      [2, 39],
    ]);
    const one = scopeToWave(p, 1);
    const two = scopeToWave(p, 2);
    expect(one.members).toHaveLength(40);
    expect(two.members.map((m) => m.id)).not.toContain('SAL07');
    expect(new Set(one.ties.map((t) => t.wave))).toEqual(new Set([1]));
    expect(new Set(two.ties.map((t) => t.wave))).toEqual(new Set([2]));
    // Cached: the same object for the same project and wave.
    expect(scopeToWave(p, 2)).toBe(two);
    expect(waveSummaries(p).map((w) => [w.wave, w.roster, w.joined, w.left])).toEqual([
      [1, 40, 0, 0],
      [2, 39, 0, 1],
    ]);
  });

  it('leaves out ratings by or about a member taken off a roster, and keeps them in the file', () => {
    const p = setOnWaveRoster(demoTwoWaves(), 1, 'FIN01', false);
    const one = scopeToWave(p, 1);
    expect(one.members.map((m) => m.id)).not.toContain('FIN01');
    expect(one.ties.some((t) => t.rater_id === 'FIN01' || t.ratee_id === 'FIN01')).toBe(false);
    expect(p.ties.some((t) => t.wave === 1 && t.rater_id === 'FIN01')).toBe(true);
    // And back on.
    const back = setOnWaveRoster(p, 1, 'FIN01', true);
    expect(waveRosterIds(back, 1)).toEqual(back.members.map((m) => m.id));
  });

  it('adds a joiner to the latest recorded wave only, and removes a member from every record', () => {
    const p = demoTwoWaves();
    const joined = addMembers(p, [{ name: 'Wren Newcomer' }]);
    const id = joined.members.at(-1)?.id ?? '';
    expect(waveRosterIds(joined, 1)).not.toContain(id);
    expect(waveRosterIds(joined, 2)).toContain(id);
    // A project without records keeps everyone on its one roster.
    const single = addMembers(demo(), [{ name: 'Wren Newcomer' }]);
    expect(single.settings.waves).toBeUndefined();
    expect(addToLatestWave(demo(), ['x'])).toEqual(demo());
    const removed = removeMembers(p, ['FIN02']);
    expect(removed.settings.waves?.every((w) => !w.roster.includes('FIN02'))).toBe(true);
  });

  it('freezes a wave with surveys to the members its surveys asked', () => {
    const p = demo();
    const asked = p.members.slice(0, 30).map((m) => m.id);
    const withSurvey: Project = {
      ...p,
      surveys: [
        {
          id: 's1',
          title: 'Wave 1',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'closed',
          wave: 1,
          texts: { introduction: 'i', confidentiality: 'c', return_instructions: 'r' },
          deadline: null,
          settings: { burden_limit_minutes: 15, expected_nominations: 12, link_mode: 'auto' },
          // Not used here: no response is imported.
          key: p.surveys[0]?.key ?? ({} as Survey['key']),
          versions: [
            {
              version: 1,
              created_at: '2026-10-01T00:00:00.000Z',
              roster: asked,
              layers: [],
              entry: 'full',
              nomination_question: '',
              shared_attributes: [],
              required: [],
            },
          ],
          respondents: [],
          log: [],
        },
      ],
    };
    const recorded = recordNewWave(
      withSurvey,
      2,
      p.members.map((m) => m.id),
    );
    expect(waveRosterIds(recorded, 1)).toEqual(asked);
    expect(waveRosterIds(recorded, 2)).toHaveLength(40);
  });
});

describe('analysis and coverage of one wave', () => {
  it('reads the chosen wave in the engine, on its roster, and the latest by default', async () => {
    const p = demoTwoWaves();
    const w = weights(p);
    const latest = await analyse(
      buildAnalysisInput(p, { view: 'directed', symmetrise: 'mean', ...w }, 'latest'),
    );
    const first = await analyse(
      buildAnalysisInput(p, { view: 'directed', symmetrise: 'mean', ...w, wave: 1 }, 'first'),
    );
    expect(latest.wave).toBe(2);
    expect(latest.memberIds).toHaveLength(39);
    expect(latest.memberIds).not.toContain('SAL07');
    expect(first.wave).toBe(1);
    expect(first.memberIds).toHaveLength(40);
    // Wave 1 equals the demo analysed alone.
    const alone = await analyse(
      buildAnalysisInput(demo(), { view: 'directed', symmetrise: 'mean', ...w }, 'alone'),
    );
    expect(Array.from(first.refs.composite?.node.columns.inStrength ?? [])).toEqual(
      Array.from(alone.refs.composite?.node.columns.inStrength ?? []),
    );
    expect(first.insights).toEqual(alone.insights);
    // Wave 2 has no valence ratings, so its signed results differ from wave 1's.
    expect(first.signed.valence).toBeDefined();
    expect(latest.refs['valence+']?.network.ties ?? 0).toBe(0);
  });

  it('counts coverage per wave on that wave’s roster', () => {
    const p = demoTwoWaves();
    const one = computeCoverage(p, 1);
    const two = computeCoverage(p, 2);
    expect(one.wave).toBe(1);
    expect(one.raters).toHaveLength(40);
    expect(one.rate).toBeCloseTo(computeCoverage(demo()).rate, 12);
    expect(two.wave).toBe(2);
    expect(two.raters).toHaveLength(39);
    // Valence is not rated in wave 2, so its coverage is lower.
    expect(two.rate).toBeLessThan(one.rate);
    expect(computeCoverage(p).wave).toBe(2);
    expect(computeQuality(p, 1).coverage.rate).toBe(one.rate);
    expect(computeQuality(p).coverage.wave).toBe(2);
  });

  it('enters matrix ratings into the wave given', () => {
    const p = demoTwoWaves();
    const next = applyRatingChanges(
      p,
      'connection_strength',
      [{ rater: 'FIN01', ratee: 'FIN02', kind: 'set', value: 5 }],
      '2026-10-30T00:00:00.000Z',
      2,
    );
    const tie = next.ties.find(
      (t) =>
        t.rater_id === 'FIN01' &&
        t.ratee_id === 'FIN02' &&
        t.variable === 'connection_strength' &&
        t.wave === 2,
    );
    expect(tie?.value).toBe(5);
    const w1 = next.ties.find(
      (t) =>
        t.rater_id === 'FIN01' &&
        t.ratee_id === 'FIN02' &&
        t.variable === 'connection_strength' &&
        t.wave === 1,
    );
    expect(w1).toEqual(
      p.ties.find(
        (t) =>
          t.rater_id === 'FIN01' &&
          t.ratee_id === 'FIN02' &&
          t.variable === 'connection_strength' &&
          t.wave === 1,
      ),
    );
  });
});

describe('the wave setting', () => {
  const state = () => useAppStore.getState();
  beforeEach(() => {
    state().setProject(demoTwoWaves());
  });

  it('follows the latest wave with ratings until a wave is chosen', () => {
    expect(state().map.wave).toBeNull();
    expect(analysedWave(state())).toBe(2);
    expect(selectWaveInfo(state())).toEqual({ wave: 2, waves: [1, 2], shown: true });
    expect(selectWaveProject(state())?.members).toHaveLength(39);
    state().setMap({ wave: 1 });
    expect(analysedWave(state())).toBe(1);
    expect(selectWaveProject(state())?.members).toHaveLength(40);
  });

  it('drops a selection that is not on the new wave’s roster', () => {
    state().setMap({ wave: 1, ego: { member: 'SAL07', depth: 1 }, highlight: ['SAL07', 'FIN01'] });
    state().selectMember('SAL07');
    state().setGroup(['SAL07', 'FIN02']);
    state().setMap({ wave: 2 });
    expect(state().selection.member).toBeNull();
    expect(state().selection.group).toEqual(['FIN02']);
    expect(state().map.ego).toBeNull();
    expect(state().map.highlight).toEqual(['FIN01']);
  });

  it('saves the wave in a view as a number and restores it', () => {
    state().setMap({ wave: 1 });
    const n = selectWaveProject(state())?.members.length ?? 0;
    sharedLayout.update('waves', n, undefined, new Array<number>(n).fill(4));
    const first = saveCurrentView('Wave 1');
    expect(first?.map.wave).toBe(1);
    expect(Object.keys(first?.positions ?? {})).toHaveLength(40);
    // A view saved while following the latest wave keeps the wave it showed.
    state().setMap({ wave: null });
    const latest = saveCurrentView('Latest');
    expect(latest?.map.wave).toBe(2);
    state().setMap({ wave: 2 });
    restoreViewById(first?.id ?? '');
    expect(state().map.wave).toBe(1);
    expect(analysedWave(state())).toBe(1);
    // Through the file.
    const p = state().data.project as Project;
    const back = parseProject(serialiseProject(p));
    expect(back.saved_views.map((v) => v.map.wave)).toEqual([1, 2]);
    expect(back.settings.waves).toEqual(p.settings.waves);
  });

  it('restores a view without a wave, or with a wave the project no longer has, on the latest', () => {
    const saved = mapToSaved(initialMapSettings());
    expect(saved.wave).toBeUndefined();
    const p = state().data.project as Project;
    state().updateProjectViews(() => ({
      ...p,
      saved_views: [
        {
          id: 'a',
          name: 'Old',
          caption: '',
          created_at: '',
          weights: { preset: 'custom', custom: {}, customTreatment: {} },
          map: saved,
          positions: {},
          selection: { member: null, group: [] },
        },
        {
          id: 'b',
          name: 'Gone',
          caption: '',
          created_at: '',
          weights: { preset: 'custom', custom: {}, customTreatment: {} },
          map: { ...saved, wave: 7 },
          positions: {},
          selection: { member: null, group: [] },
        },
      ],
    }));
    state().setMap({ wave: 1 });
    restoreViewById('a');
    expect(state().map.wave).toBeNull();
    state().setMap({ wave: 1 });
    restoreViewById('b');
    expect(state().map.wave).toBeNull();
  });
});

describe('the project file', () => {
  it('round-trips the rosters and refuses invalid ones', () => {
    const p = twoWaves();
    expect(parseProject(serialiseProject(p))).toStrictEqual(p);
    const bad = (waves: unknown) =>
      JSON.stringify({ ...JSON.parse(serialiseProject(p)), settings: { ...p.settings, waves } });
    expect(() => parseProject(bad([{ wave: 0, roster: [] }]))).toThrow(/settings\.waves/);
    expect(() =>
      parseProject(
        bad([
          { wave: 1, roster: [] },
          { wave: 1, roster: [] },
        ]),
      ),
    ).toThrow(/settings\.waves/);
    expect(() => parseProject(bad([{ wave: 1, roster: [3] }]))).toThrow(/settings\.waves/);
    expect(() => parseProject(bad('all'))).toThrow(/settings\.waves/);
  });

  it('refuses a saved view with an invalid wave', () => {
    const p = twoWaves();
    const view = {
      id: 'v',
      name: 'V',
      caption: '',
      created_at: '2026-10-30T00:00:00.000Z',
      weights: { preset: 'custom', custom: {}, customTreatment: {} },
      map: { ...mapToSaved(initialMapSettings()), wave: 1.5 },
      positions: {},
      selection: { member: null, group: [] },
    };
    const text = JSON.stringify({ ...JSON.parse(serialiseProject(p)), saved_views: [view] });
    expect(() => parseProject(text)).toThrow(/invalid wave/);
  });
});
