import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/data/defaults';
import {
  migrate,
  MIGRATIONS,
  ProjectFileError,
  savedViewV1toV2,
  savedViewV3toV4,
  type Migration,
} from '../../src/data/migrations';
import { V1_PROJECT, V1_VIEW_MIGRATED } from '../fixtures/migrations/v1';
import { V2_PROJECT } from '../fixtures/migrations/v2';
import { V3_PROJECT } from '../fixtures/migrations/v3';
import { parseProject, projectFileName, serialiseProject } from '../../src/data/projectFile';
import { SCHEMA_VERSION, type Project } from '../../src/data/schema';

// A project with every field populated, including the awkward cases: null and
// zero ratings, negative and categorical values, a later wave, unicode text,
// custom attributes, a disabled core layer, a saved view and non-default settings.
export function richProject(): Project {
  const p = createProject('Équipe “Nord” 2026', '2026-09-26T10:00:00.000Z');
  p.meta.modified_at = '2026-09-26T11:30:00.000Z';
  p.meta.notes = 'Line one\nLine two, with a tab\tand emoji-free text.';
  p.attribute_definitions.push({
    key: 'office_floor',
    label: 'Office floor',
    type: 'categorical',
    categories: ['2', '3'],
    builtin: false,
  });
  const team = p.attribute_definitions.find((a) => a.key === 'team');
  if (team) team.categories = ['Finance', 'Operations'];
  p.members = [
    {
      id: 'A01',
      display_name: 'Zoë Ødegaard',
      attributes: { team: 'Finance', level: 'L4', manager_id: null, office_floor: '3' },
    },
    {
      id: 'A02',
      display_name: 'Bram Contour',
      attributes: { team: 'Finance', level: null, manager_id: 'A01', office_floor: null },
    },
    {
      id: 'A03',
      display_name: 'Chiara Meridian',
      attributes: { team: 'Operations', level: 'L3', manager_id: 'A01', office_floor: '2' },
    },
  ];
  const valence = p.layers.find((l) => l.key === 'valence');
  if (valence) valence.enabled = false;
  const channel = p.layers.find((l) => l.key === 'primary_channel');
  if (channel) channel.enabled = true;
  const advice = p.layers.find((l) => l.key === 'advice');
  if (advice) {
    advice.label = 'Advice';
    advice.question_wording = 'Whom do you ask for advice?';
  }
  p.ties = [
    { rater_id: 'A01', ratee_id: 'A02', variable: 'connection_strength', value: 0, wave: 1 },
    { rater_id: 'A02', ratee_id: 'A01', variable: 'connection_strength', value: null, wave: 1 },
    { rater_id: 'A01', ratee_id: 'A03', variable: 'valence', value: -3, wave: 1 },
    { rater_id: 'A03', ratee_id: 'A01', variable: 'valence', value: 2.5, wave: 1 },
    { rater_id: 'A03', ratee_id: 'A02', variable: 'primary_channel', value: 'video', wave: 1 },
    { rater_id: 'A01', ratee_id: 'A02', variable: 'connection_strength', value: 5, wave: 2 },
  ];
  p.saved_views = [
    {
      id: 'v1',
      name: 'Finance links',
      caption: 'Who connects Finance to Operations?',
      created_at: '2026-09-26T11:00:00.000Z',
      weights: {
        preset: 'custom',
        custom: { connection_strength: 0.5, informal_collaboration: 0.5 },
        customTreatment: { valence: 'multiplier', energy: 'positive' },
      },
      map: {
        view: 'symmetrised',
        symmetrise: 'min',
        layer: 'composite',
        sizeMetric: 'betweenness',
        fill: { kind: 'attribute', key: 'team' },
        threshold: 0.2,
        layerToggles: { connection_strength: true },
        hideOffLayers: false,
        filters: [{ key: 'team', values: ['Finance'] }],
        layout: 'grouped',
        groupBy: 'team',
        ego: { member: 'A01', depth: 2 },
        highlight: ['A03'],
        // As a version 3 view migrates: valence on its full scale (CLAUDE.md D128).
        edgeColour: { kind: 'signed', layer: 'valence' },
        signedScale: 'full',
        edgeWidth: { kind: 'tiesFrom' },
        edgeStyle: 'none',
        sizeScale: 'value',
        communityOutlines: false,
      },
      positions: { A01: { x: 1.5, y: -2, pinned: true } },
      selection: { member: null, group: ['A01', 'A03'] },
    },
  ];
  p.settings = {
    coverage_threshold: 0.65,
    anonymise: true,
    exclude_signed_from_exports: true,
    random_seed: 42,
    bootstrap: { replicates: 500, drop_fraction: 0.2 },
    anonymisation_scheme: 'role_team',
  };
  return p;
}

const demoText = readFileSync(
  join(import.meta.dirname, '..', '..', 'src', 'demo', 'demo.ona.json'),
  'utf8',
);

describe('save → load round trip', () => {
  it('loses nothing: the loaded project deep-equals the saved one', () => {
    const project = richProject();
    const loaded = parseProject(serialiseProject(project));
    expect(loaded).toStrictEqual(project);
  });

  it('is stable: saving a loaded project writes identical text', () => {
    const text = serialiseProject(richProject());
    expect(serialiseProject(parseProject(text))).toBe(text);
  });

  it('round-trips the demo project', () => {
    const demo = parseProject(demoText);
    expect(parseProject(serialiseProject(demo))).toStrictEqual(demo);
    expect(serialiseProject(demo)).toBe(demoText);
  });

  it('writes schema_version first', () => {
    expect(
      serialiseProject(richProject()).startsWith(
        `{\n  "schema_version": ${String(SCHEMA_VERSION)},`,
      ),
    ).toBe(true);
  });

  it('names the file after the project title', () => {
    expect(projectFileName(richProject())).toBe('equipe-nord-2026.ona.json');
    expect(projectFileName(createProject('', 'x'))).toBe('project.ona.json');
  });
});

describe('schema versions and migrations', () => {
  const v2 = () => JSON.parse(serialiseProject(richProject())) as Record<string, unknown>;
  // The version 1 and 2 fixtures were written by Graticule 0.2.0, which their
  // `app` field records; a migration keeps it.
  const writtenBy = { name: 'Graticule', version: '0.2.0' };

  it('has three registered steps, from version 1 to 2, 2 to 3 and 3 to 4', () => {
    expect(MIGRATIONS.map((m) => [m.from, m.to])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
    expect(SCHEMA_VERSION).toBe(4);
  });

  it('migrates the version 3 fixture: saved views gain encodings that draw what they drew', () => {
    const loaded = parseProject(V3_PROJECT);
    expect(loaded.schema_version).toBe(4);
    const [first, second] = loaded.saved_views;
    // Everything but the second view is unchanged.
    expect({ ...loaded, saved_views: [first] }).toStrictEqual({
      ...richProject(),
      app: { name: 'Graticule', version: '1.0.0' },
    });
    // Its switches turned valence off and the formal and informal style on.
    expect(second?.map).toStrictEqual({
      ...richProject().saved_views[0]?.map,
      layerToggles: { valence: false, formal_collaboration: true, informal_collaboration: true },
      filters: [],
      ego: null,
      highlight: [],
      edgeColour: { kind: 'none' },
      edgeStyle: 'formalInformal',
    });
    expect(parseProject(serialiseProject(loaded))).toStrictEqual(loaded);
  });

  it('reads version 3 switches as version 3 did when ties of switched-off layers were hidden', () => {
    const view = (toggles: Record<string, boolean>) => ({
      id: 'x',
      map: { layerToggles: toggles, hideOffLayers: true },
    });
    const roles = { formal: 'formal_collaboration', informal: 'informal_collaboration' };
    const map = (v: unknown) => (v as { map: Record<string, unknown> }).map;
    // With hidden ties every switch started on, so the style was drawn.
    expect(map(savedViewV3toV4(view({}), roles))).toMatchObject({
      edgeColour: { kind: 'signed', layer: 'valence' },
      edgeStyle: 'formalInformal',
      signedScale: 'full',
    });
    expect(map(savedViewV3toV4(view({ informal_collaboration: false }), roles)).edgeStyle).toBe(
      'none',
    );
    // A project without the two layers had no style.
    expect(map(savedViewV3toV4(view({}), {})).edgeStyle).toBe('none');
    // An unset signed treatment was "positive ratings" in version 3 (D130).
    const weighted = {
      id: 'x',
      map: {},
      weights: { preset: 'custom', custom: {}, customTreatment: { energy: 'filterNegative' } },
    };
    expect(
      (savedViewV3toV4(weighted, {}, ['valence', 'energy']) as typeof weighted).weights
        .customTreatment,
    ).toStrictEqual({ energy: 'filterNegative', valence: 'positive' });
    expect(savedViewV3toV4('not a view')).toBe('not a view');
    expect(savedViewV3toV4({ id: 'x' })).toStrictEqual({ id: 'x' });
  });

  it('round-trips every encoding choice', () => {
    const project = richProject();
    const view = project.saved_views[0];
    if (!view) throw new Error('no view');
    const choices = [
      {
        edgeColour: { kind: 'unsigned', layer: 'composite' },
        edgeWidth: { kind: 'layer', layer: 'formal_collaboration' },
      },
      { edgeColour: { kind: 'groups' }, edgeWidth: { kind: 'uniform' } },
      { edgeColour: { kind: 'signed', layer: 'energy' }, signedScale: 'negative' },
    ] as const;
    for (const choice of choices) {
      project.saved_views = [
        {
          ...view,
          map: {
            ...view.map,
            ...choice,
            edgeStyle: 'formalInformal',
            sizeScale: 'rank',
            communityOutlines: true,
          },
        },
      ];
      expect(parseProject(serialiseProject(project))).toStrictEqual(project);
    }
  });

  it('migrates the version 2 fixture: an empty survey list, ties without a source', () => {
    const loaded = parseProject(V2_PROJECT);
    expect(loaded.schema_version).toBe(4);
    expect(loaded.surveys).toStrictEqual([]);
    expect(loaded).toStrictEqual({ ...richProject(), app: writtenBy });
    expect(loaded.ties.every((t) => t.source === undefined)).toBe(true);
    expect(parseProject(serialiseProject(loaded))).toStrictEqual(loaded);
  });

  it('migrates the version 1 fixture: saved views take the version 2 shape', () => {
    const loaded = parseProject(V1_PROJECT);
    expect(loaded.schema_version).toBe(4);
    // Everything but the saved views and the version is unchanged.
    expect({ ...loaded, saved_views: [] }).toStrictEqual({
      ...richProject(),
      app: writtenBy,
      saved_views: [],
    });
    expect(loaded.saved_views).toStrictEqual([V1_VIEW_MIGRATED]);
    // And the migrated file round-trips as version 4.
    expect(parseProject(serialiseProject(loaded))).toStrictEqual(loaded);
  });

  it('carries defaults for fields a version 1 view left out', () => {
    expect(savedViewV1toV2({ id: 'x', name: 'n', caption: '', created_at: 't' })).toStrictEqual({
      id: 'x',
      name: 'n',
      caption: '',
      created_at: 't',
      weights: { preset: 'custom', custom: {}, customTreatment: {} },
      map: {
        view: 'directed',
        symmetrise: 'mean',
        layer: 'composite',
        sizeMetric: 'betweenness',
        fill: { kind: 'community' },
        threshold: 0,
        layerToggles: {},
        hideOffLayers: false,
        filters: [],
        layout: 'force',
        groupBy: null,
        ego: null,
        highlight: [],
      },
      positions: {},
      selection: { member: null, group: [] },
    });
    expect(savedViewV1toV2('not a view')).toBe('not a view');
  });

  it('refuses a file from a newer version with a clear message', () => {
    const text = JSON.stringify({ ...v2(), schema_version: SCHEMA_VERSION + 1 });
    expect(() => parseProject(text)).toThrow(ProjectFileError);
    expect(() => parseProject(text)).toThrow(
      `This file was saved by a newer version of Graticule (schema ${String(SCHEMA_VERSION + 1)}). Update Graticule to open it.`,
    );
  });

  it.each([
    [{ members: [] }, 'has no schema_version'],
    [{ schema_version: '1' }, 'is not a version Graticule recognises'],
    [{ schema_version: 0 }, 'is not a version Graticule recognises'],
  ])('refuses %j', (file, message) => {
    expect(() => parseProject(JSON.stringify(file))).toThrow(message);
  });

  it('refuses text that is not JSON, or not an object', () => {
    expect(() => parseProject('{ not json')).toThrow('not valid JSON');
    expect(() => parseProject('[1, 2]')).toThrow('does not contain a Graticule project');
  });

  it('runs every step in order from an older version', () => {
    const registry: Migration[] = [
      { from: 2, to: 3, description: 'rename b to c', up: ({ b, ...rest }) => ({ ...rest, c: b }) },
      { from: 1, to: 2, description: 'add b', up: (f) => ({ ...f, b: 'added' }) },
    ];
    expect(migrate({ schema_version: 1, a: 1 }, registry, 3)).toEqual({
      schema_version: 3,
      a: 1,
      c: 'added',
    });
    expect(migrate({ schema_version: 2, a: 1, b: 'x' }, registry, 3)).toEqual({
      schema_version: 3,
      a: 1,
      c: 'x',
    });
    expect(() => migrate({ schema_version: 4 }, registry, 3)).toThrow('newer version');
  });

  it('refuses a version with no migration path', () => {
    expect(() => migrate({ schema_version: 1 }, [], 2)).toThrow('no migration is registered');
  });
});

describe('damaged files are refused, never repaired', () => {
  const mutate = (fn: (p: Record<string, unknown>) => void) => {
    const file = JSON.parse(serialiseProject(richProject())) as Record<string, unknown>;
    fn(file);
    return JSON.stringify(file);
  };
  const ties = (f: Record<string, unknown>) => f.ties as Record<string, unknown>[];

  it.each([
    [
      'a duplicate rating',
      (f: Record<string, unknown>) => ties(f).push({ ...ties(f)[0] }),
      'duplicates',
    ],
    [
      'an unknown rater',
      (f: Record<string, unknown>) => {
        (ties(f)[0] ?? {}).rater_id = 'Z';
      },
      'unknown rater_id',
    ],
    [
      'a self-rating',
      (f: Record<string, unknown>) => {
        (ties(f)[0] ?? {}).ratee_id = 'A01';
      },
      'self-rating',
    ],
    [
      'an out-of-range value',
      (f: Record<string, unknown>) => {
        (ties(f)[0] ?? {}).value = 9;
      },
      'outside',
    ],
    [
      'a missing value',
      (f: Record<string, unknown>) => {
        delete (ties(f)[0] ?? {}).value;
      },
      'Use null for a rating that was not given',
    ],
    [
      'an unknown variable',
      (f: Record<string, unknown>) => {
        (ties(f)[0] ?? {}).variable = 'x';
      },
      'unknown variable',
    ],
    [
      'an unknown manager',
      (f: Record<string, unknown>) => {
        const members = f.members as { attributes: Record<string, unknown> }[];
        const second = members[1];
        if (second) second.attributes.manager_id = 'Z';
      },
      'unknown manager id',
    ],
  ])('refuses %s', (_name, fn, message) => {
    expect(() => parseProject(mutate(fn))).toThrow(message);
  });
});

describe('saved views: every encoding field is checked on load', () => {
  const withMap = (patch: Record<string, unknown>, drop?: string) => {
    const file = JSON.parse(serialiseProject(richProject())) as Record<string, unknown>;
    const view = (file.saved_views as { map: Record<string, unknown> }[])[0];
    if (!view) throw new Error('no view');
    Object.assign(view.map, patch);
    if (drop) Reflect.deleteProperty(view.map, drop);
    return JSON.stringify(file);
  };

  it.each([
    ['edgeColour', { edgeColour: { kind: 'valence' } }, 'has an invalid edge colour'],
    ['edgeColour layer', { edgeColour: { kind: 'signed' } }, 'has an invalid edge colour'],
    ['edgeColour empty layer', { edgeColour: { kind: 'unsigned', layer: '' } }, 'edge colour'],
    ['signedScale', { signedScale: 'positive' }, 'has an invalid colour scale'],
    ['edgeWidth', { edgeWidth: { kind: 'layer' } }, 'has an invalid edge width'],
    ['edgeWidth kind', { edgeWidth: 'tiesFrom' }, 'has an invalid edge width'],
    ['edgeStyle', { edgeStyle: 'formal' }, 'has an invalid edge style'],
    ['sizeScale', { sizeScale: 'log' }, 'has an invalid node-size scale'],
    ['communityOutlines', { communityOutlines: 'yes' }, 'whether communities are outlined'],
  ])('refuses an invalid %s', (_name, patch, message) => {
    expect(() => parseProject(withMap(patch))).toThrow(message);
  });

  it.each([
    ['edgeColour', 'has an invalid edge colour'],
    ['signedScale', 'has an invalid colour scale'],
    ['edgeWidth', 'has an invalid edge width'],
    ['edgeStyle', 'has an invalid edge style'],
    ['sizeScale', 'has an invalid node-size scale'],
    ['communityOutlines', 'whether communities are outlined'],
  ])('refuses a view without %s', (field, message) => {
    expect(() => parseProject(withMap({}, field))).toThrow(message);
  });

  it('accepts a layer that is not enabled: the map falls back', () => {
    expect(() =>
      parseProject(
        withMap({
          edgeColour: { kind: 'signed', layer: 'removed_layer' },
          edgeWidth: { kind: 'layer', layer: 'removed_layer' },
        }),
      ),
    ).not.toThrow();
  });
});

describe('palettes and pinned colours (D127) are checked on load', () => {
  const withSettings = (patch: Record<string, unknown>) => {
    const file = JSON.parse(serialiseProject(richProject())) as Record<string, unknown>;
    Object.assign(file.settings as Record<string, unknown>, patch);
    return JSON.stringify(file);
  };

  it('round-trips a chosen palette and pins, and a project with neither', () => {
    const p = richProject();
    const chosen: Project = {
      ...p,
      settings: {
        ...p.settings,
        palette: { categorical: 'tol-muted', diverging: 'red-blue' },
        group_colours: { team: { Sales: 7, Finance: 0 } },
      },
    };
    expect(parseProject(serialiseProject(chosen))).toEqual(chosen);
    expect(parseProject(serialiseProject(p)).settings.palette).toBeUndefined();
  });

  it.each([
    [
      'an unknown diverging palette',
      { palette: { categorical: 'tol-muted', diverging: 'rainbow' } },
    ],
    [
      'an unknown categorical palette',
      { palette: { categorical: 'okabe-ito', diverging: 'red-blue' } },
    ],
    ['a palette that is not an object', { palette: 'red-blue' }],
    ['a hue beyond the palette', { group_colours: { team: { Sales: 8 } } }],
    ['a hue that is not a whole number', { group_colours: { team: { Sales: 1.5 } } }],
    ['one hue pinned to two values', { group_colours: { team: { Sales: 2, Finance: 2 } } }],
    ['pins that are not by attribute', { group_colours: { Sales: 2 } }],
  ])('refuses %s', (_name, patch) => {
    expect(() => parseProject(withSettings(patch))).toThrow(/settings\.(palette|group_colours)/);
  });
});
