// Data remedies (build plan session 5, CLAUDE.md D150–D153): rank
// standardisation within each rater, members who gave no ratings left out or
// marked, reconstruction of their ties on mutual layers, and the previews in
// "Check the data", which must equal a full analysis with the option.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProject, serialiseProject } from '../../src/data/projectFile';
import { isMutualLayer, type Project } from '../../src/data/schema';
import { analyse } from '../../src/engine/analyse';
import { buildAnalysisInput, type AnalysisOptions } from '../../src/engine/input';
import { reconstruct, standardiseRows } from '../../src/engine/remedies';
import type { AnalysisInput, AnalysisResult } from '../../src/engine/types';
import { effectiveWeights, initialWeightState } from '../../src/ui/state/presets';
import {
  appliedRemedies,
  compareInsights,
  previewInput,
  previewRemedy,
  REMEDY_ORDER,
  remedyAvailability,
  remedyOn,
  toggleRemedy,
} from '../../src/ui/state/remedies';
import { mapToSaved, savedToMap } from '../../src/ui/state/savedViews';
import { initialMapSettings, type MapSettings } from '../../src/ui/state/store';

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

type Options = Omit<AnalysisOptions, 'weights' | 'signedTreatment'>;
const DIRECTED: Options = { view: 'directed', symmetrise: 'mean' };
const MEAN: Options = { view: 'symmetrised', symmetrise: 'mean' };

function run(project: Project, options: Options): Promise<AnalysisResult> {
  const w = effectiveWeights(project, initialWeightState());
  return analyse(buildAnalysisInput(project, { ...options, ...w }, JSON.stringify(options)));
}

const silentIds = (r: AnalysisResult) =>
  r.memberIds.filter((_, i) => r.ratingFlags[i] === 'gaveNoRatings');
const members = (r: AnalysisResult, rule: string) =>
  r.insights.find((o) => o.rule === rule)?.observations.flatMap((o) => o.members) ?? [];

const tensor = (n: number, cells: Record<string, number>) => {
  const m = new Float64Array(n * n).fill(NaN);
  for (const [k, v] of Object.entries(cells)) {
    const [i, j] = k.split(',').map(Number) as [number, number];
    m[i * n + j] = v;
  }
  return m;
};

describe('rank standardisation within each rater', () => {
  it('replaces a rater’s ties by (rank − 0.5) / k, sharing ranks, and keeps 0 and missing', () => {
    const w = tensor(4, { '0,1': 1, '0,2': 0.6, '0,3': 0, '1,0': 0.4, '1,2': 0.4, '2,0': 0.2 });
    const s = standardiseRows(w, 4, 'rank');
    expect([s[1], s[2], s[3]]).toEqual([0.75, 0.25, 0]);
    // Equal ratings, or a single tie, give 0.5.
    expect([s[4], s[6], s[8]]).toEqual([0.5, 0.5, 0.5]);
    expect(s[12]).toBeNaN();
    // 'none' and skipped rows are unchanged.
    expect(Array.from(standardiseRows(w, 4, 'none'))).toEqual(Array.from(w));
    expect(standardiseRows(w, 4, 'rank', new Set([0]))[1]).toBe(1);
  });

  it('gives the composite and strength the ranked weights, with the same ties', async () => {
    const input = (standardise: 'none' | 'rank'): AnalysisInput => ({
      inputKey: standardise,
      memberIds: ['a', 'b', 'c', 'd'],
      attributes: {},
      layers: [{ key: 's', label: 'S', min: 0, max: 5, signed: false, defaultWeight: 1 }],
      ratings: [tensor(4, { '0,1': 5, '0,2': 3, '0,3': 0, '1,0': 2 })],
      settings: {
        view: 'directed',
        symmetrise: 'mean',
        weights: {},
        signedTreatment: {},
        seed: 1,
        standardise,
      },
    });
    const plain = await analyse(input('none'));
    const ranked = await analyse(input('rank'));
    const c = ranked.refs.composite;
    expect(Array.from(c?.weights.slice(1, 4) ?? [])).toEqual([0.75, 0.25, 0]);
    expect(c?.node.columns.outStrength?.[0]).toBe(1);
    expect(c?.network.ties).toBe(plain.refs.composite?.network.ties);
    expect(ranked.refs.s?.network.ties).toBe(plain.refs.s?.network.ties);
    expect(ranked.remedies.standardise).toBe('rank');
  });

  it('leaves signed layers and every tie count unchanged on the demo', async () => {
    const demo = load('demo');
    const plain = await run(demo, DIRECTED);
    const ranked = await run(demo, { ...DIRECTED, standardise: 'rank' });
    for (const ref of plain.refOrder)
      expect(ranked.refs[ref]?.network.ties, ref).toBe(plain.refs[ref]?.network.ties);
    expect(Array.from(ranked.refs['valence+']?.weights ?? [])).toEqual(
      Array.from(plain.refs['valence+']?.weights ?? []),
    );
    expect(ranked.signed).toEqual(plain.signed);
  });
});

describe('members who gave no ratings', () => {
  it('reconstruct() fills only missing directions of silent members, from the other side', () => {
    const m = tensor(3, { '0,1': 4, '0,2': 2, '2,1': 3, '1,0': 1 });
    const r = reconstruct(m, 3, new Set([2]));
    expect(r.ratings[2 * 3 + 0]).toBe(2);
    expect(r.ratings[2 * 3 + 1]).toBe(3); // already given: kept
    expect(r.count).toBe(1);
    expect(Array.from(r.filled)).toEqual([0, 0, 0, 0, 0, 0, 1, 0, 0]);
    expect(m[2 * 3 + 0]).toBeNaN();
  });

  it('left out: values from their own ratings are not defined, incoming ones are kept', async () => {
    const project = load('partial-response');
    const marked = await run(project, DIRECTED);
    const left = await run(project, { ...DIRECTED, nonRespondents: 'leaveOut' });
    const silent = silentIds(marked);
    expect(silent.length).toBeGreaterThan(0);
    const c = left.refs.composite;
    for (const id of silent) {
      const i = left.memberIds.indexOf(id);
      for (const m of left.ownRatingMetrics) {
        const col = c?.node.columns[m];
        if (!col) continue;
        expect(col[i], m).toBeNaN();
        expect(c.node.flags[m]?.[i]).toBe('leftOut');
      }
      expect(c?.node.columns.inStrength?.[i]).toBe(
        marked.refs.composite?.node.columns.inStrength?.[i],
      );
    }
  });

  it('left out: the member-level rules neither name nor count them', async () => {
    for (const slug of ['partial-response', 'silent-leaders', 'single-team-shifts', 'messy-survey'])
      for (const view of [DIRECTED, MEAN]) {
        const project = load(slug);
        const r = await run(project, { ...view, nonRespondents: 'leaveOut' });
        const silent = new Set(silentIds(r));
        for (const rule of ['brokers', 'peripheral', 'overload'])
          for (const id of members(r, rule))
            expect(silent.has(id), `${slug} ${rule} ${id}`).toBe(false);
      }
  });

  it('reconstruction fills their ties on mutual layers only, and reports each direction', async () => {
    const project = load('partial-response');
    const plain = await run(project, DIRECTED);
    const rebuilt = await run(project, { ...DIRECTED, reconstruct: true });
    const silent = new Set(silentIds(plain).map((id) => plain.memberIds.indexOf(id)));
    const mutual = project.layers.filter((l) => l.enabled && isMutualLayer(l)).map((l) => l.key);
    expect(Object.keys(rebuilt.reconstructed).sort()).toEqual([...mutual].sort());
    const n = project.members.length;
    for (const [key, pairs] of Object.entries(rebuilt.reconstructed)) {
      expect(pairs.length).toBeGreaterThan(0);
      const before = plain.refs[key]?.weights;
      const after = rebuilt.refs[key]?.weights;
      for (const [i, j] of pairs) {
        expect(silent.has(i)).toBe(true);
        expect(before?.[i * n + j]).toBeNaN();
        expect(after?.[i * n + j]).toBe(before?.[j * n + i]);
      }
    }
    // Valence is not mutual by nature: unchanged.
    expect(Array.from(rebuilt.refs['valence+']?.weights ?? [])).toEqual(
      Array.from(plain.refs['valence+']?.weights ?? []),
    );
    expect(
      (rebuilt.refs.composite?.network.ties ?? 0) > (plain.refs.composite?.network.ties ?? 0),
    ).toBe(true);
  });

  it('a layer’s mutual flag overrides the default list', async () => {
    const project = load('partial-response');
    const patched: Project = {
      ...project,
      layers: project.layers.map((l) =>
        l.key === 'formal_collaboration' ? { ...l, mutual: false } : l,
      ),
    };
    const r = await run(patched, { ...DIRECTED, reconstruct: true });
    expect(r.reconstructed.formal_collaboration).toBeUndefined();
    expect(r.reconstructed.connection_strength?.length).toBeGreaterThan(0);
  });

  it('under "both report a tie", reconstruction restores the ties the rule removes', async () => {
    const project = load('silent-leaders');
    const both = await run(project, { view: 'symmetrised', symmetrise: 'both' });
    const rebuilt = await run(project, {
      view: 'symmetrised',
      symmetrise: 'both',
      reconstruct: true,
    });
    expect(both.refs.composite?.network.ties).toBe(79);
    expect(rebuilt.refs.composite?.network.ties).toBe(161);
  });
});

describe('outcomes on the scenario projects (npm run scenarios:remedies)', () => {
  it('both report a tie shows each team as a silo on formal collaboration in partial-response', async () => {
    const r = await run(load('partial-response'), { view: 'symmetrised', symmetrise: 'both' });
    const silos = r.insights.find((o) => o.rule === 'silo')?.observations ?? [];
    expect(silos.map((o) => `${o.ref} ${o.group?.value ?? ''}`).sort()).toEqual([
      'formal_collaboration Charting',
      'formal_collaboration Field Operations',
      'formal_collaboration Hydrography',
    ]);
  });

  it('leaving out drops the non-respondent brokers of the mutual view', async () => {
    const pr = load('partial-response');
    expect(members(await run(pr, MEAN), 'brokers')).toEqual(['FIE01']);
    expect(members(await run(pr, { ...MEAN, nonRespondents: 'leaveOut' }), 'brokers')).toEqual([
      'HYD01',
    ]);
    const sl = load('silent-leaders');
    expect(members(await run(sl, { ...MEAN, nonRespondents: 'leaveOut' }), 'brokers')).toEqual([
      'ADV04',
      'ADV01',
    ]);
  });

  it('rank standardisation finds brokers among compressed ratings, where there were none', async () => {
    const project = load('compressed-ratings');
    expect(members(await run(project, DIRECTED), 'brokers')).toEqual([]);
    expect(members(await run(project, { ...DIRECTED, standardise: 'rank' }), 'brokers')).toEqual([
      'DIS03',
      'MIL05',
    ]);
  });

  it('changes nothing for members who answered when everyone did', async () => {
    const project = load('dense-team');
    for (const options of [{ nonRespondents: 'leaveOut' as const }, { reconstruct: true }]) {
      const a = await run(project, DIRECTED);
      const b = await run(project, { ...DIRECTED, ...options });
      expect(b.insights).toEqual(a.insights);
      expect(Array.from(b.refs.composite?.weights ?? [])).toEqual(
        Array.from(a.refs.composite?.weights ?? []),
      );
    }
  });
});

describe('previews in Check the data', () => {
  const weights = initialWeightState();

  it('each preview equals a full analysis with the option switched', async () => {
    const project = load('messy-survey');
    for (const base of [
      { ...initialMapSettings(), threshold: 0 },
      { ...initialMapSettings(), view: 'symmetrised' as const, standardise: 'rank' as const },
    ] satisfies MapSettings[]) {
      const current = await analyse(previewInput(project, base, weights, 'current'));
      for (const id of REMEDY_ORDER) {
        const p = await previewRemedy(id, project, base, weights, current, analyse);
        const settings = { ...base, ...toggleRemedy(id, base) };
        expect(remedyOn(id, settings)).toBe(!remedyOn(id, base));
        const full = await analyse(previewInput(project, settings, weights, 'full'));
        expect(p.result.insights).toEqual(full.insights);
        expect(Array.from(p.result.refs.composite?.weights ?? [])).toEqual(
          Array.from(full.refs.composite?.weights ?? []),
        );
        expect(p.changes).toEqual(compareInsights(current.insights, full.insights));
        expect(appliedRemedies(full).includes(id)).toBe(remedyOn(id, settings));
      }
    }
  });

  it('reports the rules an option changes, and nothing when it changes nothing', async () => {
    const project = load('partial-response');
    const base: MapSettings = { ...initialMapSettings(), view: 'symmetrised' };
    const current = await analyse(previewInput(project, base, weights, 'current'));
    const leave = await previewRemedy('leaveOut', project, base, weights, current, analyse);
    const brokers = leave.changes.find((c) => c.rule === 'brokers');
    expect(brokers?.removed.flatMap((o) => o.members)).toEqual(['FIE01']);
    expect(brokers?.added.flatMap((o) => o.members)).toEqual(['HYD01']);
    const dense = load('dense-team');
    const dc = await analyse(previewInput(dense, base, weights, 'dense'));
    expect((await previewRemedy('leaveOut', dense, base, weights, dc, analyse)).changes).toEqual(
      [],
    );
  });

  it('offers the options about non-respondents only when someone gave no ratings', async () => {
    const dense = load('dense-team');
    const r = await run(dense, DIRECTED);
    expect(remedyAvailability('leaveOut', dense, r)).toBe('everyoneAnswered');
    expect(remedyAvailability('reconstruct', dense, r)).toBe('everyoneAnswered');
    expect(remedyAvailability('standardise', dense, r)).toBe('available');
    const pr = load('partial-response');
    expect(remedyAvailability('reconstruct', pr, await run(pr, DIRECTED))).toBe('available');
    const noMutual: Project = { ...pr, layers: pr.layers.map((l) => ({ ...l, mutual: false })) };
    expect(remedyAvailability('reconstruct', noMutual, await run(noMutual, DIRECTED))).toBe(
      'noMutualLayer',
    );
  });
});

describe('saving', () => {
  it('saved views keep the options; views saved before them restore with every option off', () => {
    const demo = load('demo');
    const map: MapSettings = {
      ...initialMapSettings(),
      view: 'symmetrised',
      symmetrise: 'both',
      nonRespondents: 'leaveOut',
      reconstruct: true,
      standardise: 'rank',
    };
    const saved = mapToSaved(map);
    expect(savedToMap(saved, demo)).toMatchObject({
      symmetrise: 'both',
      nonRespondents: 'leaveOut',
      reconstruct: true,
      standardise: 'rank',
    });
    const older = { ...saved };
    delete older.nonRespondents;
    delete older.reconstruct;
    delete older.standardise;
    expect(savedToMap(older, demo)).toMatchObject({
      nonRespondents: 'mark',
      reconstruct: false,
      standardise: 'none',
    });
  });

  it('the project file round-trips the options and the mutual flag, and checks them', () => {
    const demo = load('demo');
    const view = {
      id: 'v1',
      name: 'Remedies',
      caption: '',
      created_at: '2026-10-22T00:00:00Z',
      weights: { preset: 'custom' as const, custom: {}, customTreatment: {} },
      map: mapToSaved({
        ...initialMapSettings(),
        view: 'symmetrised',
        symmetrise: 'both',
        nonRespondents: 'leaveOut',
        reconstruct: true,
        standardise: 'rank',
      }),
      positions: {},
      selection: { member: null, group: [] },
    };
    const project: Project = {
      ...demo,
      layers: demo.layers.map((l) => (l.key === 'advice' ? { ...l, mutual: true } : l)),
      saved_views: [view],
    };
    const back = parseProject(serialiseProject(project));
    expect(back.saved_views[0]?.map).toMatchObject({
      symmetrise: 'both',
      nonRespondents: 'leaveOut',
      reconstruct: true,
      standardise: 'rank',
    });
    expect(back.layers.find((l) => l.key === 'advice')?.mutual).toBe(true);
    const bad = JSON.parse(serialiseProject(project)) as {
      layers: { mutual?: unknown }[];
      saved_views: { map: Record<string, unknown> }[];
    };
    (bad.saved_views[0] as { map: Record<string, unknown> }).map.standardise = 'z';
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
    (bad.saved_views[0] as { map: Record<string, unknown> }).map.standardise = 'rank';
    (bad.layers[0] as { mutual?: unknown }).mutual = 'yes';
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
  });
});
