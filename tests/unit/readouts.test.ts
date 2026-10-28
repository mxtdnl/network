// Questions first and plain-language readouts (build plan session 8): the
// question catalogue, what each question sets, when a project cannot answer
// one, the sentences read out for each number, the member comparisons, the
// composite's weights on the map, and the question saved with a view.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseProject, serialiseProject } from '../../src/data/projectFile';
import type { Project } from '../../src/data/schema';
import { analyse } from '../../src/engine/analyse';
import { buildAnalysisInput } from '../../src/engine/input';
import type { AnalysisResult } from '../../src/engine/types';
import { compositeStatement, questionsCopy } from '../../src/ui/copy/questions';
import { memberSentence, readoutSentence } from '../../src/ui/copy/readouts';
import { legendSections } from '../../src/ui/map/legend';
import { buildMapModel } from '../../src/ui/map/model';
import { readMapTheme } from '../../src/ui/map/theme';
import { tokensCss } from './exportHarness';
import { insightMapPatch } from '../../src/ui/state/insights';
import { effectiveWeights, initialWeightState } from '../../src/ui/state/presets';
import {
  QUESTION_IDS,
  activeQuestion,
  applyQuestion,
  availabilityNote,
  questionAvailability,
  questionLayer,
  questionSettings,
} from '../../src/ui/state/questions';
import {
  memberReadout,
  networkReadouts,
  questionReadouts,
  type Readout,
} from '../../src/ui/state/readouts';
import { restoreViewById, saveCurrentView } from '../../src/ui/state/savedViews';
import {
  initialMapSettings,
  openingMapSettings,
  useAppStore,
  type MapSettings,
} from '../../src/ui/state/store';

const root = join(import.meta.dirname, '..', '..');
const load = (file: string) => parseProject(readFileSync(join(root, 'src/demo', file), 'utf8'));
const demo = load('demo.ona.json');
const merger = load('scenario-post-merger.ona.json');
const state = () => useAppStore.getState();

async function resultFor(project: Project, map: Partial<MapSettings> = {}) {
  const s = { ...initialMapSettings(), ...map };
  const weights = effectiveWeights(project, initialWeightState());
  return analyse(
    buildAnalysisInput(project, { view: s.view, symmetrise: s.symmetrise, ...weights }, 'test'),
  );
}

const sentences = (rs: readonly Readout[], name = (id: string) => id) =>
  rs.map((r) => readoutSentence(r, name));

describe('the question catalogue', () => {
  it('opens the map on "Who is connected to whom?", ties from connection strength', () => {
    const map = openingMapSettings(demo);
    expect(map.question).toBe('connected');
    expect(map.layer).toBe('connection_strength');
    expect(map.sizeMetric).toBe('inDegree');
    expect(activeQuestion(demo, map)).toBe('connected');
  });

  it('opens on the composite with own settings when connection strength is not rated', () => {
    const p: Project = {
      ...demo,
      ties: demo.ties.filter((t) => t.variable !== 'connection_strength'),
    };
    const map = openingMapSettings(p);
    expect(map.layer).toBe('composite');
    expect(map.question).toBeNull();
  });

  it('says which questions the demo cannot answer, and why', () => {
    const available = QUESTION_IDS.filter((id) => questionAvailability(id, demo).ok);
    expect(available).toEqual([
      'connected',
      'groups',
      'brokers',
      'informal',
      'singleRoute',
      'negative',
    ]);
    const advice = questionAvailability('information', demo);
    expect(advice).toEqual({
      ok: false,
      reason: 'notEnabled',
      relation: 'advice and information seeking',
    });
    expect(availabilityNote(advice)).toBe(
      'This question needs advice and information seeking ratings. Switch on advice and information seeking under Layers, then import or enter its ratings.',
    );
    // Post-merger rates every relation the catalogue reads.
    expect(QUESTION_IDS.filter((id) => !questionAvailability(id, merger).ok)).toEqual([]);
  });

  it('tells a missing layer from one switched off or not yet rated', () => {
    const noAdvice: Project = { ...demo, layers: demo.layers.filter((l) => l.key !== 'advice') };
    expect(questionAvailability('information', noAdvice)).toMatchObject({
      reason: 'notInProject',
    });
    const enabled: Project = {
      ...demo,
      layers: demo.layers.map((l) => (l.key === 'advice' ? { ...l, enabled: true } : l)),
    };
    expect(questionAvailability('information', enabled)).toMatchObject({ reason: 'notRated' });
    const noValence: Project = {
      ...demo,
      ties: demo.ties.filter((t) => t.variable !== 'valence'),
    };
    expect(questionAvailability('negative', noValence)).toMatchObject({ ok: false });
    const oneGroup: Project = {
      ...demo,
      members: demo.members.map((m) => ({ ...m, attributes: { ...m.attributes, team: 'All' } })),
    };
    expect(questionAvailability('groups', oneGroup)).toMatchObject({ reason: 'noGroups' });
  });

  it('sets the view and map settings each question names', async () => {
    const result = await resultFor(merger);
    const map = initialMapSettings();
    const s = (id: (typeof QUESTION_IDS)[number]) => questionSettings(id, merger, map, result);
    expect(s('connected')).toMatchObject({
      centreView: 'map',
      map: { layer: 'connection_strength', sizeMetric: 'inDegree', threshold: 0.3 },
    });
    expect(s('information').map).toMatchObject({
      view: 'directed',
      layer: 'advice',
      sizeMetric: 'inStrength',
    });
    expect(s('groups')).toMatchObject({ centreView: 'groups', map: { layout: 'grouped' } });
    expect(s('brokers').map).toMatchObject({
      layer: 'informal_collaboration',
      sizeMetric: 'betweenness',
      communityOutlines: true,
    });
    expect(s('depend')).toMatchObject({
      centreView: 'table',
      ui: { tableMode: 'incoming', incomingLayer: 'workflow_dependency' },
      map: { layer: 'workflow_dependency' },
    });
    expect(s('informal').map).toMatchObject({ edgeStyle: 'formalInformal', layout: 'hierarchy' });
    expect(s('singleRoute').map).toMatchObject({ markBridges: true, threshold: 0 });
    expect(s('negative').map).toMatchObject({
      edgeColour: { kind: 'signed', layer: 'valence' },
      negativeOutsideRange: true,
    });
    // The mutual view keeps its own metric names.
    expect(
      questionSettings('connected', merger, { ...map, view: 'symmetrised' }).map.sizeMetric,
    ).toBe('degree');
  });

  it('highlights the cut points when a question asks where the network relies on one route', async () => {
    const result = await resultFor(demo);
    const cut = result.refs.connection_strength?.ties?.cutPoints.members ?? new Int32Array();
    expect(cut.length).toBeGreaterThan(0);
    const highlight = questionSettings('singleRoute', demo, initialMapSettings(), result).map
      .highlight;
    expect(highlight).toEqual(Array.from(cut, (i) => result.memberIds[i]));
  });
});

describe('choosing a question in the app', () => {
  beforeEach(() => {
    state().setProject(demo);
  });

  it('applies an answerable question and keeps it while "Ties from" is its layer', () => {
    expect(applyQuestion('brokers')).toBe(true);
    expect(state().map.question).toBe('brokers');
    expect(state().map.layer).toBe('informal_collaboration');
    expect(state().ui.centreView).toBe('map');
    state().setMap({ threshold: 0.5, filters: [{ key: 'team', values: ['Finance'] }] });
    expect(activeQuestion(demo, state().map)).toBe('brokers');
    state().setMap({ layer: 'composite' });
    expect(state().map.question).toBeNull();
    expect(activeQuestion(demo, state().map)).toBeNull();
  });

  it('changes nothing for a question the project cannot answer', () => {
    const before = state().map;
    expect(applyQuestion('information')).toBe(false);
    expect(state().map).toBe(before);
  });

  it('opens the Groups and Table tabs for the questions they answer', () => {
    applyQuestion('groups');
    expect(state().ui.centreView).toBe('groups');
    state().setProject(merger);
    applyQuestion('depend');
    expect(state().ui).toMatchObject({
      centreView: 'table',
      tableMode: 'incoming',
      incomingLayer: 'workflow_dependency',
    });
  });

  it('drops the question when an insight is shown, since an observation is not one', () => {
    const patch = insightMapPatch(
      {
        layer: 'connection_strength',
        sizeMetric: 'betweenness',
        layout: 'force',
        groupBy: null,
        filters: [],
        highlight: [],
        show: [],
      },
      state().map,
      demo,
    );
    state().setMap(patch);
    expect(state().map.question).toBeNull();
  });

  it('captions a saved view with its question, and restores the question', () => {
    applyQuestion('negative');
    const view = saveCurrentView('');
    expect(view?.caption).toBe(questionsCopy.questions.negative);
    expect(view?.map.question).toBe('negative');
    state().setMap({ layer: 'composite' });
    if (view) restoreViewById(view.id);
    expect(state().map.question).toBe('negative');
    // The question survives the project file.
    const project = state().data.project;
    expect(project).not.toBeNull();
    if (project) {
      const reopened = parseProject(serialiseProject(project));
      expect(reopened.saved_views.at(-1)?.map.question).toBe('negative');
    }
    // Own settings save no caption.
    state().setMap({ layer: 'formal_collaboration' });
    expect(saveCurrentView('')?.caption).toBe('');
  });

  it('ignores an unknown question in a saved view', () => {
    const view = saveCurrentView('x');
    expect(view).not.toBeNull();
    if (!view) return;
    state().updateProjectViews((p) => ({
      ...p,
      saved_views: p.saved_views.map((v) =>
        v.id === view.id ? { ...v, map: { ...v.map, question: 'no-such-question' } } : v,
      ),
    }));
    restoreViewById(view.id);
    expect(state().map.question).toBeNull();
  });
});

describe('network readouts', () => {
  let directed: AnalysisResult;
  let mutual: AnalysisResult;
  beforeAll(async () => {
    directed = await resultFor(demo);
    mutual = await resultFor(demo, { view: 'symmetrised' });
  });

  it('reads out the six network measures in words, from the engine’s figures', () => {
    const net = directed.refs.connection_strength?.network;
    expect(
      sentences(networkReadouts(demo, directed, 'connection_strength', 'Connection strength')),
    ).toEqual([
      `On connection strength, ${String(net?.ties)} of the 1,560 possible ties are present (35%), counting each direction separately.`,
      '70% of ties are returned: the colleague named also names the member who named them.',
      'Everyone is connected, directly or through others, in either direction.',
      '5 clusters of members tie mostly among themselves (found automatically). Modularity is 0.46; networks with clear clusters typically score between 0.3 and 0.7.',
      'The most-named member is named by 19 colleagues; the median member by 15. Centralisation is 0.14 (0 when everyone is named equally often, 1 when every tie points to the same member).',
      '49% of ties stay within one team or function and 51% cross between them; of all possible pairs, 82% cross. E-I index +0.02 (−1: every tie within, +1: every tie across).',
    ]);
    expect(
      sentences(networkReadouts(demo, mutual, 'connection_strength', 'Connection strength'))[0],
    ).toBe('On connection strength, 356 of the 780 possible pairs have a tie (46%).');
  });

  it('describes separate parts and members without a tie', () => {
    const say = (sizes: number[]) =>
      readoutSentence({ kind: 'parts', directed: false, members: 10, sizes }, (id) => id);
    expect(say([10])).toBe('Everyone is connected, directly or through others.');
    expect(say([8, 1, 1])).toBe(
      'Everyone except 2 members is connected, directly or through others; those members have no tie.',
    );
    expect(say([5, 3, 1, 1])).toBe(
      'The network falls into 2 separate parts of two or more members; the largest holds 5 of the 10 members. 2 members have no tie.',
    );
    expect(say([1, 1, 1])).toBe('No two members are tied.');
  });

  it('answers each question on the demo with sentences from its results', () => {
    const say = (id: (typeof QUESTION_IDS)[number]) => {
      const layer = questionLayer(id, demo);
      const label = demo.layers.find((l) => l.key === layer)?.label ?? layer;
      return sentences(questionReadouts(id, demo, directed, layer, label));
    };
    expect(say('groups')[1]).toBe(
      'Product and People share the most ties between groups: 55. No tie joins Finance and Product, Finance and Sales, or Finance and People.',
    );
    expect(say('brokers')[1]).toBe(
      'OPE04 lies on more of the shortest routes between colleagues than any of their 39 colleagues.',
    );
    expect(say('informal')[0]).toMatch(
      /^Of the 628 working ties, 16% are formal only, 17% informal only and 67% both\./,
    );
    expect(say('singleRoute')).toEqual([
      'Every tie links two members who share at least one contact.',
      '8 members would be cut off from the rest if OPE04 were away.',
    ]);
    expect(say('negative')[0]).toMatch(
      /^11 negative valence ratings were given; 10 of them were rated negatively in return\./,
    );
  });

  it('answers the advice and dependency questions where they are rated', async () => {
    const result = await resultFor(merger);
    const say = (id: 'information' | 'depend') => {
      const layer = questionLayer(id, merger);
      return sentences(questionReadouts(id, merger, result, layer, 'Workflow dependency'));
    };
    expect(say('information')[0]).toBe(
      'All 36 members are asked for advice by at least one colleague. The most-asked member is named by 30 colleagues; the median member by 17.',
    );
    expect(say('depend')[0]).toBe(
      'The 4 members receiving most workflow dependency ties (11% of members) receive 22% of all 244, against 11% if ties were spread evenly.',
    );
  });

  it('names members only through the names given', () => {
    const r = questionReadouts('brokers', demo, directed, 'informal_collaboration', 'x');
    const text = sentences(r, () => 'OPE-L3-02').join(' ');
    expect(text).toContain('OPE-L3-02');
    expect(text).not.toContain('OPE04');
  });
});

describe('member readouts', () => {
  it('compares a member with their colleagues, with their group’s median', async () => {
    const result = await resultFor(demo);
    const column = result.refs.connection_strength?.node.columns.betweenness ?? new Float64Array();
    const top = column.indexOf(Math.max(...column));
    const readout = memberReadout(demo, column, top, 'betweenness');
    expect(readout).not.toBeNull();
    if (readout)
      expect(memberSentence(readout)).toMatch(
        /^Lies on more of the shortest routes between colleagues than any of their 39 colleagues\. Median in Operations \(team or function, 8 members\): /,
      );
  });

  it('reads constraint the other way: the lowest value is the most open network', () => {
    const column = [0.1, 0.5, 0.9];
    const p: Project = { ...demo, members: demo.members.slice(0, 3) };
    const open = memberReadout(p, column, 0, 'constraint');
    const closed = memberReadout(p, column, 2, 'constraint');
    expect(open && memberSentence(open)).toMatch(
      /^Has a more open network \(contacts who are not tied to one another\) than any of their 2 colleagues\./,
    );
    expect(closed && memberSentence(closed)).toMatch(
      /^Has a more closed network \(contacts who are tied to one another\) than any of their 2 colleagues\./,
    );
  });

  it('counts equal values and leaves out colleagues whose value is not defined', () => {
    const p: Project = {
      ...demo,
      members: demo.members.slice(0, 5).map((m) => ({ ...m, attributes: {} })),
    };
    const r = memberReadout(p, [3, 3, 1, NaN, 5], 0, 'inDegree');
    expect(r && memberSentence(r)).toBe(
      'Is named by more colleagues than 1 of the 3 colleagues it is defined for. 1 colleague has the same value.',
    );
    expect(memberReadout(p, [3, 3, 1, NaN, 5], 3, 'inDegree')).toBeNull();
    const same = memberReadout(p, [2, 2, 2, 2, 2], 0, 'degree');
    expect(same && memberSentence(same)).toBe('The same as all 4 colleagues with a value.');
  });
});

describe('the composite on the map', () => {
  it('states the composite’s weights in the legend, and only when ties come from it', async () => {
    const result = await resultFor(demo);
    const theme = readMapTheme(tokensCss());
    const names = demo.members.map((m) => m.id);
    const notes = (layer: string) => {
      const model = buildMapModel(demo, result, { ...initialMapSettings(), layer }, theme, names);
      const width = legendSections(model, theme).find((s) => s.kind === 'width');
      return width?.kind === 'width' ? width.notes : [];
    };
    const formula = result.composite;
    expect(formula).not.toBeNull();
    if (!formula) return;
    expect(notes('composite')[0]).toBe(compositeStatement(formula));
    expect(compositeStatement(formula)).toBe(
      'Combined layers: Connection strength 33%, Informal collaboration 33%, Formal collaboration 33%; Valence adjusts each tie.',
    );
    expect(notes('connection_strength').some((n) => n.startsWith('Combined layers'))).toBe(false);
  });
});
