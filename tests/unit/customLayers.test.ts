// Relations the analyst creates and the question bank (build plan session 11):
// keys, scales and roles; roles read by presets, questions, the map and the
// export exclusion; the bank's items; deleting one.

import { describe, expect, it } from 'vitest';
import { defaultLayers } from '../../src/data/defaults';
import { parseProject, ProjectFileError, serialiseProject } from '../../src/data/projectFile';
import { QUESTION_BANK, bankRelation, hasTopic, withTopic } from '../../src/data/questionBank';
import {
  RELATION_SCALES,
  ROLE_SCALES,
  addRelation,
  createRelation,
  defaultColourLayer,
  deletionImpact,
  relationForRole,
  relationKeyFor,
  relationProblems,
  relationScale,
  roleAllows,
} from '../../src/data/relations';
import { parseCsv } from '../../src/data/import/csv';
import { validateTies } from '../../src/data/import/validate';
import {
  BUILTIN_ROLES,
  LAYER_ROLES,
  isMutualLayer,
  layerRole,
  type Project,
} from '../../src/data/schema';
import { excludedLayers, exportProject } from '../../src/ui/export/scope';
import { effectiveWeights, presetWeights } from '../../src/ui/state/presets';
import { questionAvailability, questionLayer } from '../../src/ui/state/questions';
import { openingMapSettings } from '../../src/ui/state/store';
import { incomingLayer } from '../../src/ui/views/incoming';
import { demandLayerKeys } from '../../src/ui/views/incoming';
import { CUSTOM_KEYS, demo, withCustomRelations } from '../fixtures/customRelations';

describe('roles', () => {
  it('gives every built-in layer a role, on a scale its role allows', () => {
    for (const l of defaultLayers()) {
      expect(BUILTIN_ROLES[l.key], l.key).toBeDefined();
      expect(roleAllows(layerRole(l), relationScale(l)), l.key).toBe(true);
    }
    expect(Object.keys(BUILTIN_ROLES).sort()).toEqual(
      defaultLayers()
        .map((l) => l.key)
        .sort(),
    );
  });

  it('reads a layer’s own role first, then the built-in role of its key, else other', () => {
    expect(layerRole({ key: 'advice' })).toBe('advice');
    expect(layerRole({ key: 'advice', role: 'information' })).toBe('information');
    expect(layerRole({ key: 'whatever' })).toBe('other');
  });

  it('makes working connection and both collaborations mutual by nature, by role', () => {
    expect(isMutualLayer({ key: 'connection_strength' })).toBe(true);
    expect(isMutualLayer({ key: 'x', role: 'informal' })).toBe(true);
    expect(isMutualLayer({ key: 'x', role: 'advice' })).toBe(false);
    expect(isMutualLayer({ key: 'x', role: 'advice', mutual: true })).toBe(true);
  });

  it('allows categories only for other, and signed only for affect and other', () => {
    for (const role of LAYER_ROLES) {
      expect(roleAllows(role, 'categories')).toBe(role === 'other');
      expect(roleAllows(role, 'signed')).toBe(role === 'affect' || role === 'other');
      expect(ROLE_SCALES[role].length).toBeGreaterThan(0);
    }
  });
});

describe('creating a relation', () => {
  const project = demo();

  it('generates the key from the label: lower case, ASCII, underscores, at most 40 characters', () => {
    expect(relationKeyFor(project, 'Advice about Café rollout!')).toBe('advice_about_cafe_rollout');
    expect(relationKeyFor(project, '   ')).toBe('relation');
    expect(relationKeyFor(project, 'a'.repeat(60))).toHaveLength(40);
  });

  it('never takes a built-in key, even one deleted, the composite, or a key in use', () => {
    const without = { ...project, layers: project.layers.filter((l) => l.key !== 'advice') };
    expect(relationKeyFor(without, 'Advice')).toBe('advice_2');
    expect(relationKeyFor(project, 'Composite')).toBe('composite_2');
    const p = addRelation(project, createRelation(project, spec('Rollout')));
    expect(relationKeyFor(p, 'Rollout')).toBe('rollout_2');
  });

  it('never reuses a key a survey asked about, so old responses never read as a new relation', () => {
    const p = {
      ...project,
      surveys: [
        {
          versions: [{ layers: [{ key: 'rollout' }] }],
        } as unknown as Project['surveys'][number],
      ],
    };
    expect(relationKeyFor(p, 'Rollout')).toBe('rollout_2');
  });

  it('builds each scale with its range and labels, and a weight by role', () => {
    const freq = createRelation(project, spec('A', 'frequency'));
    expect(freq).toMatchObject({
      scale_type: 'frequency',
      min: 0,
      max: 5,
      signed: false,
      builtin: false,
      core: false,
      enabled: true,
      role: 'information',
      default_weight: 1,
    });
    const agree = createRelation(project, spec('B', 'agreement'));
    expect(agree).toMatchObject({ scale_type: 'strength', min: 0, max: 5 });
    const signed = createRelation(project, { ...spec('C', 'signed'), role: 'affect' });
    expect(signed).toMatchObject({ scale_type: 'signed', min: -3, max: 3, signed: true });
    const cats = createRelation(project, {
      ...spec('D', 'categories'),
      role: 'other',
      categories: ['On site', 'Remote', ' '],
    });
    expect(cats).toMatchObject({
      scale_type: 'categorical',
      categories: ['on_site', 'remote'],
      default_weight: 0,
    });
    expect(cats.category_labels).toEqual({ on_site: 'On site', remote: 'Remote' });
    const friction = createRelation(project, { ...spec('E'), role: 'friction' });
    expect(friction.default_weight).toBe(0);
    for (const s of RELATION_SCALES)
      expect(
        relationScale(
          createRelation(project, { ...spec('F', s), role: 'other', categories: ['x', 'y'] }),
        ),
      ).toBe(s);
  });

  it('stores mutual only when it differs from the role’s default', () => {
    expect(
      createRelation(project, { ...spec('G'), role: 'informal', mutual: true }).mutual,
    ).toBeUndefined();
    expect(createRelation(project, { ...spec('G'), mutual: true }).mutual).toBe(true);
  });

  it('lists what is wrong', () => {
    expect(relationProblems({ ...spec(''), question_wording: '' })).toEqual([
      'emptyLabel',
      'emptyWording',
    ]);
    expect(relationProblems({ ...spec('X', 'signed'), role: 'advice' })).toEqual([
      'scaleNotAllowed',
    ]);
    expect(
      relationProblems({ ...spec('X', 'categories'), role: 'other', categories: ['a'] }),
    ).toEqual(['tooFewCategories']);
    expect(
      relationProblems({ ...spec('X', 'categories'), role: 'other', categories: ['a', 'A'] }),
    ).toEqual(['repeatedCategory']);
    expect(
      relationProblems({
        ...spec('X', 'categories'),
        role: 'other',
        categories: 'abcdefghi'.split(''),
      }),
    ).toEqual(['tooManyCategories']);
  });

  it('keeps the key when the label changes, and imports ratings by that key', () => {
    const p0 = withCustomRelations();
    const renamed = {
      ...p0,
      layers: p0.layers.map((l) =>
        l.key === CUSTOM_KEYS.advice ? { ...l, label: 'Rollout advice' } : l,
      ),
    };
    const back = parseProject(serialiseProject(renamed));
    expect(back.layers.find((l) => l.key === CUSTOM_KEYS.advice)?.label).toBe('Rollout advice');
    const csv = `rater_id,ratee_id,variable,value\nFIN01,FIN02,${CUSTOM_KEYS.advice},4\n`;
    const empty = { ...back, ties: back.ties.filter((t) => t.variable !== CUSTOM_KEYS.advice) };
    const report = validateTies(parseCsv('ties.csv', csv), {
      memberIds: new Set(empty.members.map((m) => m.id)),
      layers: empty.layers,
    });
    expect(report.ties).toEqual([
      expect.objectContaining({ variable: CUSTOM_KEYS.advice, value: 4, rater_id: 'FIN01' }),
    ]);
  });

  it('counts what deleting one removes', () => {
    const p = withCustomRelations();
    const impact = deletionImpact(p, CUSTOM_KEYS.tension);
    expect(impact.ratings).toBe(p.ties.filter((t) => t.variable === CUSTOM_KEYS.tension).length);
    expect(impact.ratings).toBeGreaterThan(0);
    expect(impact.surveys).toBe(0);
  });
});

describe('project files', () => {
  it('round-trip relations the analyst created, with their role and ratings', () => {
    const p = withCustomRelations();
    expect(parseProject(serialiseProject(p))).toStrictEqual(p);
  });

  it('refuse a created relation without a role, or on a scale its role does not allow', () => {
    const p = withCustomRelations();
    const noRole = JSON.parse(serialiseProject(p)) as { layers: Record<string, unknown>[] };
    const advice = noRole.layers.find((l) => l.key === CUSTOM_KEYS.advice);
    if (!advice) throw new Error('advice');
    delete advice.role;
    expect(() => parseProject(JSON.stringify(noRole))).toThrow(/has no role/);
    advice.role = 'trust';
    expect(() => parseProject(JSON.stringify(noRole))).toThrow(/scale its role does not allow/);
    advice.role = 'boss';
    expect(() => parseProject(JSON.stringify(noRole))).toThrow(ProjectFileError);
  });
});

describe('roles in presets, questions, the map and exports', () => {
  it('weights every layer of a role in a preset, and uses the first signed affect layer as the multiplier', () => {
    const p = withCustomRelations();
    const enabled = {
      ...p,
      layers: p.layers.map((l) =>
        l.key === 'energy' || l.key === 'competence_trust' ? { ...l, enabled: true } : l,
      ),
    };
    const informal = presetWeights('informal', enabled);
    expect(informal.weights[CUSTOM_KEYS.advice]).toBe(0.2);
    expect(informal.weights.informal_collaboration).toBe(0.4);
    expect(informal.weights[CUSTOM_KEYS.tension]).toBe(0);
    const health = presetWeights('health', enabled);
    expect(health.weights.valence).toBe(0.4);
    expect(health.treatment.valence).toBe('multiplier');
    expect(health.weights.energy).toBe(0.2);
    expect(health.treatment.energy).toBe('positive');
    expect(health.weights[CUSTOM_KEYS.enjoy]).toBe(0.2);
    expect(health.weights.competence_trust).toBe(0.2);
    // Friction has weight 0 under Custom too, until the analyst raises it.
    const custom = effectiveWeights(p, { preset: 'custom', custom: {}, customTreatment: {} });
    expect(custom.weights[CUSTOM_KEYS.tension]).toBe(0);
    expect(custom.weights[CUSTOM_KEYS.advice]).toBe(1);
  });

  it('keeps the built-in presets’ weights for the built-in layers', () => {
    const p = demo();
    expect(presetWeights('formal', p).weights).toMatchObject({
      formal_collaboration: 0.4,
      connection_strength: 0,
      informal_collaboration: 0,
      valence: 0,
    });
    expect(presetWeights('health', p).weights).toMatchObject({
      valence: 0.4,
      connection_strength: 0.2,
      formal_collaboration: 0,
    });
  });

  it('answers questions with a relation of the right role when the built-in one is missing', () => {
    const p = withCustomRelations();
    // The built-in advice layer is off, so the created one, enabled and rated, answers.
    expect(questionLayer('information', p)).toBe(CUSTOM_KEYS.advice);
    expect(questionAvailability('information', p).ok).toBe(true);
    // Without the built-in advice layer, the created one answers.
    const noAdvice = { ...p, layers: p.layers.filter((l) => l.key !== 'advice') };
    expect(questionLayer('information', noAdvice)).toBe(CUSTOM_KEYS.advice);
    expect(questionAvailability('information', noAdvice).ok).toBe(true);
    // Switching the built-in on but leaving it unrated also lets the rated created one answer.
    const offBuiltin = {
      ...p,
      layers: p.layers.map((l) => (l.key === 'advice' ? { ...l, enabled: true } : l)),
    };
    expect(relationForRole(offBuiltin, 'advice')?.key).toBe(CUSTOM_KEYS.advice);
  });

  it('opens the map on a created working connection when the project has no built-in one', () => {
    const p = demo();
    const conn = createRelation(p, {
      ...spec('Works together on the rollout'),
      role: 'connection',
    });
    const project: Project = {
      ...addRelation(
        {
          ...p,
          layers: p.layers.filter((l) => l.key !== 'connection_strength'),
          ties: p.ties.filter((t) => t.variable !== 'connection_strength'),
        },
        conn,
      ),
    };
    project.ties = [
      ...project.ties,
      { rater_id: 'FIN01', ratee_id: 'FIN02', variable: conn.key, value: 3, wave: 1 },
    ];
    expect(openingMapSettings(project).layer).toBe(conn.key);
    expect(openingMapSettings(project).question).toBe('connected');
  });

  it('colours edges by a created signed affect layer when valence is off', () => {
    const p = demo();
    const feel = createRelation(p, { ...spec('Feeling', 'signed'), role: 'affect' });
    const q = addRelation(
      { ...p, layers: p.layers.map((l) => (l.key === 'valence' ? { ...l, enabled: false } : l)) },
      feel,
    );
    expect(defaultColourLayer(q)?.key).toBe(feel.key);
    expect(openingMapSettings(q).edgeColour).toEqual({ kind: 'signed', layer: feel.key });
    expect(defaultColourLayer(p)?.key).toBe('valence');
  });

  it('shows created advice and dependency relations first among incoming ties', () => {
    const p = withCustomRelations();
    const keys = demandLayerKeys(p);
    expect(keys).toEqual(['advice', CUSTOM_KEYS.advice, 'workflow_dependency']);
    expect(incomingLayer([CUSTOM_KEYS.advice, 'composite'], null, 'composite', keys)).toBe(
      CUSTOM_KEYS.advice,
    );
  });

  it('leaves out affect and friction relations whatever their scale, with signed layers, and keeps the rest', () => {
    const p = withCustomRelations();
    const removed = excludedLayers(p).map((l) => l.key);
    expect(removed).toEqual(
      expect.arrayContaining([
        'valence',
        'energy',
        'conflict_task',
        'conflict_personal',
        CUSTOM_KEYS.tension,
        CUSTOM_KEYS.enjoy,
      ]),
    );
    expect(removed).not.toContain(CUSTOM_KEYS.advice);
    const out = exportProject(p, true);
    expect(out.ties.some((t) => t.variable === CUSTOM_KEYS.tension)).toBe(false);
    expect(out.ties.some((t) => t.variable === CUSTOM_KEYS.advice)).toBe(true);
  });
});

describe('the question bank', () => {
  it('has about 30 items with unique ids, each on a scale its role allows', () => {
    expect(QUESTION_BANK.length).toBe(32);
    expect(new Set(QUESTION_BANK.map((i) => i.id)).size).toBe(QUESTION_BANK.length);
    for (const item of QUESTION_BANK) {
      expect(roleAllows(item.role, item.scale), item.id).toBe(true);
      expect(relationProblems(bankRelation(item, 'the rollout')), item.id).toEqual([]);
    }
  });

  it('puts the topic in the label and wording, and starts the label with a capital', () => {
    const item = QUESTION_BANK.find((i) => i.id === 'info_give');
    if (!item) throw new Error('info_give');
    expect(hasTopic(item)).toBe(true);
    const spec = bankRelation(item, ' the CI programme ');
    expect(spec.question_wording).toBe(
      'How often do you give information about the CI programme to this person?',
    );
    expect(spec.label).toBe('Gives information about the CI programme');
    expect(withTopic('No topic here.', 'x')).toBe('No topic here.');
    const energy = QUESTION_BANK.find((i) => i.scale === 'signed');
    expect(energy && bankRelation(energy, 'x').scale_labels).toEqual({
      '-3': 'Very drained',
      '0': 'Neutral',
      '3': 'Very energised',
    });
  });
});

function spec(label: string, scale: (typeof RELATION_SCALES)[number] = 'frequency') {
  return {
    label,
    question_wording: `How often ${label}?`,
    role: 'information' as const,
    scale,
  };
}
