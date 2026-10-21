import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseProject, serialiseProject } from '../../src/data/projectFile';
import { ForceLayout } from '../../src/ui/map/layout';
import { sharedLayout } from '../../src/ui/map/useMapModel';
import {
  captureView,
  deleteView,
  mapToSaved,
  moveView,
  renameView,
  restoreViewById,
  saveCurrentView,
  setViewCaption,
  updateView,
} from '../../src/ui/state/savedViews';
import { insightMapPatch } from '../../src/ui/state/insights';
import { initialMapSettings, useAppStore } from '../../src/ui/state/store';

const demoText = readFileSync(
  join(import.meta.dirname, '..', '..', 'src', 'demo', 'demo.ona.json'),
  'utf8',
);

const state = () => useAppStore.getState();
const views = () => state().data.project?.saved_views ?? [];

beforeEach(() => {
  state().setProject(parseProject(demoText));
});

describe('saving a view', () => {
  it('captures weights, map settings, encodings, filters, layout, selection and positions', () => {
    const s = state();
    s.setPreset('informal');
    s.setMap({
      view: 'symmetrised',
      symmetrise: 'max',
      layer: 'informal_collaboration',
      sizeMetric: 'eigenvector',
      fill: { kind: 'community' },
      threshold: 0.4,
      layerToggles: { valence: false, formal_collaboration: true },
      hideOffLayers: true,
      filters: [{ key: 'team', values: ['Finance', 'Sales'] }],
      layout: 'circular',
      groupBy: 'level',
      ego: { member: 'FIN01', depth: 2 },
      highlight: ['FIN02'],
      search: 'not saved',
      tool: 'lasso',
      edgeColour: { kind: 'unsigned', layer: 'formal_collaboration' },
      signedScale: 'full',
      edgeWidth: { kind: 'layer', layer: 'connection_strength' },
      edgeStyle: 'formalInformal',
      sizeScale: 'rank',
      communityOutlines: true,
    });
    s.selectMember('SAL03');
    s.setGroup(['SAL01', 'SAL02']);
    const n = s.data.project?.members.length ?? 0;
    sharedLayout.update('test', n, undefined, new Array<number>(n).fill(4));
    sharedLayout.pin(3, 12.5, -7);

    const view = saveCurrentView('Informal ties');
    expect(view).not.toBeNull();
    expect(views()).toHaveLength(1);
    expect(view).toMatchObject({
      name: 'Informal ties',
      caption: '',
      weights: { preset: 'informal' },
      map: {
        view: 'symmetrised',
        symmetrise: 'max',
        layer: 'informal_collaboration',
        sizeMetric: 'eigenvector',
        fill: { kind: 'community' },
        threshold: 0.4,
        layerToggles: { valence: false, formal_collaboration: true },
        hideOffLayers: true,
        filters: [{ key: 'team', values: ['Finance', 'Sales'] }],
        layout: 'circular',
        groupBy: 'level',
        ego: { member: 'FIN01', depth: 2 },
        highlight: ['FIN02'],
        edgeColour: { kind: 'unsigned', layer: 'formal_collaboration' },
        signedScale: 'full',
        edgeWidth: { kind: 'layer', layer: 'connection_strength' },
        edgeStyle: 'formalInformal',
        sizeScale: 'rank',
        communityOutlines: true,
      },
      selection: { member: 'SAL03', group: ['SAL01', 'SAL02'] },
    });
    expect(Object.keys(view?.map ?? {})).not.toContain('search');
    expect(Object.keys(view?.positions ?? {})).toHaveLength(n);
    const id = s.data.project?.members[3]?.id ?? '';
    expect(view?.positions[id]).toEqual({ x: 12.5, y: -7, pinned: true });
  });

  it('does not change the analysis revision', () => {
    const revision = state().data.revision;
    saveCurrentView('A');
    setViewCaption(views()[0]?.id ?? '', 'Caption');
    expect(state().data.revision).toBe(revision);
  });

  it('names a view "View n" when no name is given', () => {
    saveCurrentView('');
    saveCurrentView('  ');
    expect(views().map((v) => v.name)).toEqual(['View 1', 'View 2']);
  });
});

describe('managing views', () => {
  beforeEach(() => {
    for (const name of ['One', 'Two', 'Three']) saveCurrentView(name);
  });

  it('renames, refusing an empty name', () => {
    const id = views()[1]?.id ?? '';
    expect(renameView(id, '  Second  ')).toBe(true);
    expect(renameView(id, '   ')).toBe(false);
    expect(views().map((v) => v.name)).toEqual(['One', 'Second', 'Three']);
  });

  it('reorders, and ignores moves past either end', () => {
    const [a, b, c] = views().map((v) => v.id);
    moveView(c ?? '', -1);
    expect(views().map((v) => v.id)).toEqual([a, c, b]);
    moveView(a ?? '', -1);
    moveView(b ?? '', 1);
    expect(views().map((v) => v.id)).toEqual([a, c, b]);
  });

  it('deletes', () => {
    deleteView(views()[0]?.id ?? '');
    expect(views().map((v) => v.name)).toEqual(['Two', 'Three']);
  });

  it('updates a view to the current state, keeping its name and caption', () => {
    const id = views()[0]?.id ?? '';
    setViewCaption(id, 'Kept');
    state().setMap({ layout: 'grouped' });
    updateView(id);
    expect(views()[0]).toMatchObject({ name: 'One', caption: 'Kept', map: { layout: 'grouped' } });
  });

  it('persists in the project file and round-trips', () => {
    setViewCaption(views()[0]?.id ?? '', 'Who links Finance to the rest?');
    const project = state().data.project;
    if (!project) throw new Error('no project');
    const loaded = parseProject(serialiseProject(project));
    expect(loaded.saved_views).toStrictEqual(project.saved_views);
  });
});

describe('restoring a view', () => {
  it('puts back the weights, map settings and selection, and ends explore tools', () => {
    const s = state();
    s.setPreset('formal');
    s.setMap({
      layout: 'grouped',
      filters: [{ key: 'team', values: ['People'] }],
      edgeColour: { kind: 'groups' },
      edgeWidth: { kind: 'uniform' },
      edgeStyle: 'formalInformal',
      sizeScale: 'rank',
      communityOutlines: true,
      signedScale: 'full',
    });
    s.setGroup(['PEO01']);
    const saved = saveCurrentView('Formal');
    s.setPreset('health');
    s.setMap({ ...initialMapSettings(), search: 'x' });
    s.setGroup([]);
    s.setTools({ removal: ['PEO01'] });
    restoreViewById(saved?.id ?? '');
    const after = state();
    expect(after.weights.preset).toBe('formal');
    expect(mapToSaved(after.map)).toStrictEqual(saved?.map);
    expect(after.map).toMatchObject({
      edgeColour: { kind: 'groups' },
      edgeWidth: { kind: 'uniform' },
      edgeStyle: 'formalInformal',
      sizeScale: 'rank',
      communityOutlines: true,
      signedScale: 'full',
    });
    expect(after.map.search).toBe('');
    expect(after.selection.group).toEqual(['PEO01']);
    expect(after.tools.removal).toEqual([]);
    expect(after.ui.centreView).toBe('map');
  });

  it('drops members that are no longer in the project', () => {
    const view = captureView('x');
    if (!view) throw new Error('no view');
    state().updateProjectViews((p) => ({
      ...p,
      saved_views: [
        {
          ...view,
          map: { ...view.map, highlight: ['GONE', 'FIN01'], ego: { member: 'GONE', depth: 1 } },
          selection: { member: 'GONE', group: ['GONE'] },
        },
      ],
    }));
    restoreViewById(view.id);
    expect(state().map.highlight).toEqual(['FIN01']);
    expect(state().map.ego).toBeNull();
    expect(state().selection).toMatchObject({ member: null, group: [] });
  });
});

describe('layout positions from a saved view', () => {
  it('are applied after the next layout update, with pins', () => {
    const layout = new ForceLayout();
    layout.update('a', 3, undefined, [4, 4, 4]);
    layout.requestPositions([{ x: 1, y: 2, pinned: true }, null, { x: 5, y: 6, pinned: false }]);
    const kept = { ...layout.settled[1] };
    // Same key: nothing is laid out again, but the positions are applied.
    expect(layout.update('a', 3, undefined, [4, 4, 4])).toBe(true);
    expect(layout.takeRestored()).toBe(true);
    expect(layout.takeRestored()).toBe(false);
    expect(layout.snapshot()).toEqual([
      { x: 1, y: 2, pinned: true },
      { x: kept.x, y: kept.y, pinned: false },
      { x: 5, y: 6, pinned: false },
    ]);
  });

  it('are applied after a new layout settles, so the settle does not move them', () => {
    const layout = new ForceLayout();
    layout.update('a', 2, undefined, [4, 4]);
    layout.requestPositions([
      { x: 10, y: 10, pinned: false },
      { x: -10, y: -10, pinned: false },
    ]);
    layout.update('b', 2, Float64Array.from([NaN, 1, 1, NaN]), [4, 4]);
    expect(layout.snapshot().map((p) => [p.x, p.y])).toEqual([
      [10, 10],
      [-10, -10],
    ]);
  });
});

describe('an insight shown on the map', () => {
  const view = {
    layer: 'composite',
    sizeMetric: 'betweenness' as const,
    layout: 'force' as const,
    groupBy: null,
    filters: [],
    highlight: ['SAL02'],
  };

  it('colours ties by the signed layer it shows, keeping other encodings', () => {
    const s = state();
    s.setMap({ edgeColour: { kind: 'none' }, sizeScale: 'rank', edgeWidth: { kind: 'uniform' } });
    const patch = insightMapPatch({ ...view, show: ['valence'] }, s.map, s.data.project);
    expect(patch.edgeColour).toEqual({ kind: 'signed', layer: 'valence' });
    expect(patch.edgeStyle).toBeUndefined();
    s.setMap(patch);
    expect(state().map).toMatchObject({ sizeScale: 'rank', edgeWidth: { kind: 'uniform' } });
  });

  it('switches the formal and informal style on when it shows both layers', () => {
    const s = state();
    const both = insightMapPatch(
      { ...view, show: ['formal_collaboration', 'informal_collaboration'] },
      s.map,
      s.data.project,
    );
    expect(both.edgeStyle).toBe('formalInformal');
    expect(both.edgeColour).toBeUndefined();
    // Their ties are drawn even when switched-off layers hide them.
    expect(both.layerToggles).toMatchObject({
      formal_collaboration: true,
      informal_collaboration: true,
    });
    const one = insightMapPatch({ ...view, show: ['formal_collaboration'] }, s.map, s.data.project);
    expect(one.edgeStyle).toBeUndefined();
  });

  it('draws every tie, since the rule counted every tie (D129)', () => {
    const s = state();
    expect(s.map.threshold).toBe(0.3);
    expect(insightMapPatch({ ...view, show: [] }, s.map, s.data.project).threshold).toBe(0);
  });
});
