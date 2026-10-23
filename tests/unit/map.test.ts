// The map's pure layers: the model (which members and ties are drawn and how
// each is encoded), the legend built from it, the renderer-neutral scene,
// keyboard traversal, ranks and valence colours.

import { describe, expect, it } from 'vitest';
import { parseProject } from '../../src/data/projectFile';
import type { Project } from '../../src/data/schema';
import { analyse } from '../../src/engine/analyse';
import { buildAnalysisInput } from '../../src/engine/input';
import type { AnalysisResult } from '../../src/engine/types';
import { hexToLab, labToHex, valenceColour } from '../../src/ui/map/colour';
import { legendSections } from '../../src/ui/map/legend';
import {
  averageRanks,
  buildMapModel,
  inTieRange,
  nextMember,
  NOT_RECORDED,
  valenceMatrix,
  type MapModel,
} from '../../src/ui/map/model';
import { ForceLayout, groupBoxes } from '../../src/ui/map/layout';
import { rankOf } from '../../src/ui/map/rank';
import { buildScene, convexHull, highlightSet, type Point } from '../../src/ui/map/scene';
import type { MapTheme } from '../../src/ui/map/theme';
import { paletteChoice, pinnedHues, withPalette, withPin } from '../../src/ui/map/palettes';
import { initialMapSettings, type MapSettings } from '../../src/ui/state/store';
import { demoText } from './engineFixtures';

const demo = parseProject(demoText);

const VALENCE = ['#833110', '#9d5524', '#a67b55', '#919191', '#5188a1', '#156d8e', '#004d6e'];
const CATEGORICAL = [
  '#44aa99',
  '#332288',
  '#999933',
  '#117733',
  '#ddcc77',
  '#cc6677',
  '#88ccee',
  '#882255',
];
const theme: MapTheme = {
  ink: '#1c2127',
  graphite: '#4e5761',
  stone: '#7a838e',
  paper: '#fbfcfc',
  palettes: {
    categorical: {
      'tol-muted': CATEGORICAL,
    },
    diverging: {
      'orange-blue': VALENCE,
      'purple-green': ['#701b98', '#8f4cae', '#a475b7', '#919191', '#66915c', '#3a7530', '#005302'],
      'red-blue': ['#8e0b04', '#ac4731', '#bb7360', '#919191', '#7685bf', '#4c66b1', '#144594'],
    },
  },
  other: '#b4b9bf',
  bridge: '#e06800',
  bridgeMark: 5,
  ramp: ['#6694a8', '#4c8098', '#336b85', '#195c79', '#004d6e'],
  nodeMin: 4,
  nodeMax: 16,
  nodeUndefined: 2,
  edgeMin: 0.5,
  edgeMax: 3,
  arrow: 6,
  dash: 4,
  gap: 3,
  dot: 1,
  line: 1,
  focusWidth: 2,
  fade: 0.3,
  labelFont: '500 12px sans-serif',
  labelSize: 12,
  groupFont: '600 14px Fira Sans',
  groupSize: 14,
  labelGap: 4,
  swatch: 24,
};

const results = new Map<string, AnalysisResult>();
async function resultFor(project: Project, s: MapSettings): Promise<AnalysisResult> {
  const key = `${project.meta.title}|${s.view}|${s.symmetrise}`;
  let r = results.get(key);
  if (!r) {
    const input = buildAnalysisInput(
      project,
      { view: s.view, symmetrise: s.symmetrise, weights: {}, signedTreatment: {} },
      key,
    );
    r = await analyse(input);
    results.set(key, r);
  }
  return r;
}

async function model(patch: Partial<MapSettings> = {}, project = demo): Promise<MapModel> {
  const s = { ...initialMapSettings(), ...patch };
  const names = project.members.map((m) => m.display_name);
  return buildMapModel(project, await resultFor(project, s), s, theme, names);
}

describe('valence colours', () => {
  it('returns the token colour at every whole step', () => {
    for (let v = -3; v <= 3; v++) expect(valenceColour(VALENCE, v)).toBe(VALENCE[v + 3]);
  });

  it('interpolates between steps in CIELAB', () => {
    const mid = hexToLab(valenceColour(VALENCE, -0.5));
    const a = hexToLab(VALENCE[2] ?? '');
    const b = hexToLab(VALENCE[3] ?? '');
    for (let k = 0; k < 3; k++) {
      expect(mid[k]).toBeCloseTo(((a[k] ?? 0) + (b[k] ?? 0)) / 2, 0);
    }
  });

  it('round-trips hex through CIELAB', () => {
    for (const hex of VALENCE) expect(labToHex(hexToLab(hex))).toBe(hex);
  });

  it('clamps values beyond the scale', () => {
    expect(valenceColour(VALENCE, 7)).toBe(VALENCE[6]);
    expect(valenceColour(VALENCE, -9)).toBe(VALENCE[0]);
  });
});

describe('map model', () => {
  it('draws one edge per tie with weight above the threshold on the selected layer', async () => {
    const all = await model({ layer: 'connection_strength', threshold: 0 });
    const r = await resultFor(demo, { ...initialMapSettings() });
    const w = r.refs.connection_strength?.weights ?? new Float64Array();
    const n = demo.members.length;
    // One edge per pair tied in either direction (CLAUDE.md D131).
    let expected = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if ((w[i * n + j] as number) > 0 || (w[j * n + i] as number) > 0) expected += 1;
    expect(all.edges.length).toBe(expected);
    const strong = await model({ layer: 'connection_strength', threshold: 0.6 });
    expect(strong.edges.length).toBeLessThan(all.edges.length);
    expect(strong.edges.every((e) => e.weight >= 0.6)).toBe(true);
    for (const e of all.edges) {
      expect(e.width).toBeGreaterThanOrEqual(theme.edgeMin);
      expect(e.width).toBeLessThanOrEqual(theme.edgeMax);
    }
  });

  it('draws only ties within the tie-strength range, bounds included (D141)', async () => {
    const all = await model({ layer: 'connection_strength', threshold: 0 });
    const band = await model({ layer: 'connection_strength', threshold: 0.4, thresholdTo: 0.6 });
    expect(band.edges.length).toBeGreaterThan(0);
    expect(band.edges.length).toBeLessThan(all.edges.length);
    // A drawn pair's weight combines directions that are each within the range.
    expect(band.edges.every((e) => e.weight >= 0.4 - 1e-9 && e.weight <= 0.6 + 1e-9)).toBe(true);
    const below = await model({ layer: 'connection_strength', threshold: 0, thresholdTo: 0.4 });
    const above = await model({ layer: 'connection_strength', threshold: 0.6, thresholdTo: 1 });
    expect(below.edges.every((e) => e.weight <= 0.4 + 1e-9)).toBe(true);
    expect(above.edges.every((e) => e.weight >= 0.6 - 1e-9)).toBe(true);
    // Mutual view and a point range: only ties equal to the bound.
    const point = await model({
      layer: 'connection_strength',
      view: 'symmetrised',
      threshold: 0.5,
      thresholdTo: 0.5,
    });
    expect(point.edges.every((e) => Math.abs(e.weight - 0.5) <= 1e-9)).toBe(true);
  });

  it('draws ties with a negative rating outside the range when asked (D145)', async () => {
    // Valence as a multiplier lowers the composite of negatively rated ties below 0.30.
    const n = demo.members.length;
    const index = new Map(demo.members.map((m, i) => [m.id, i]));
    const negative = new Set<number>();
    for (const t of demo.ties)
      if (t.variable === 'valence' && typeof t.value === 'number' && t.value < 0)
        negative.add((index.get(t.rater_id) ?? 0) * n + (index.get(t.ratee_id) ?? 0));
    const key = (e: { source: number; target: number }) => e.source * n + e.target;
    const touches = (e: { source: number; target: number }) =>
      negative.has(key(e)) || negative.has(e.target * n + e.source);
    const off = await model();
    const on = await model({ negativeOutsideRange: true });
    expect(off.negativeOutsideRange).toBe(false);
    expect(on.negativeOutsideRange).toBe(true);
    const added = on.edges.filter((e) => !off.edges.some((x) => key(x) === key(e)));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(touches)).toBe(true);
    expect(added.some((e) => e.weight < 0.3)).toBe(true);
    const notes = legendSections(on, theme).find((x) => x.kind === 'width')?.notes ?? [];
    expect(notes).toContain('Ties with a negative rating drawn whatever their strength');
    // Without a signed layer the switch draws nothing extra.
    const noValence = {
      ...demo,
      layers: demo.layers.map((l) => (l.key === 'valence' ? { ...l, enabled: false } : l)),
    };
    const plain = await model({ negativeOutsideRange: true }, noValence);
    expect(plain.negativeOutsideRange).toBe(false);
  });

  it('compares the bounds with a tolerance of 1e-9 (D141)', () => {
    const third = 1 / 3;
    expect(inTieRange(0.1 + 0.2, 0.3, 1)).toBe(true);
    expect(inTieRange(0.7, 0, 0.1 + 0.2 + 0.4)).toBe(true);
    expect(inTieRange(third * 3, 0, 1)).toBe(true);
    expect(inTieRange(0.3 - 1e-8, 0.3, 1)).toBe(false);
    expect(inTieRange(0.5 + 1e-8, 0, 0.5)).toBe(false);
  });

  it('draws a pair as one line only when both directions are within the range (D131, D141)', async () => {
    const r = await resultFor(demo, initialMapSettings());
    const w = r.refs.connection_strength?.weights ?? new Float64Array();
    const n = demo.members.length;
    const [from, to] = [0.3, 0.6];
    const m = await model({ layer: 'connection_strength', threshold: from, thresholdTo: to });
    const inside = (k: number) => {
      const x = w[k] as number;
      return x > 0 && inTieRange(x, from, to);
    };
    let both = 0;
    let one = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = inside(i * n + j);
        const b = inside(j * n + i);
        if (a && b) both += 1;
        else if (a || b) one += 1;
      }
    expect(m.edges.filter((e) => e.reciprocated).length).toBe(both);
    expect(m.edges.filter((e) => !e.reciprocated).length).toBe(one);
  });

  it('draws one edge per pair in both views, a one-way tie in its direction', async () => {
    const directed = await model({ layer: 'connection_strength' });
    const mutual = await model({ layer: 'connection_strength', view: 'symmetrised' });
    expect(directed.directed).toBe(true);
    expect(mutual.directed).toBe(false);
    expect(mutual.edges.every((e) => e.source < e.target)).toBe(true);
    expect(mutual.edges.some((e) => e.reciprocated)).toBe(false);
    const pairs = directed.edges.map((e) =>
      [Math.min(e.source, e.target), Math.max(e.source, e.target)].join('-'),
    );
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(directed.edges.some((e) => e.reciprocated)).toBe(true);
    expect(directed.edges.some((e) => !e.reciprocated)).toBe(true);
    expect(directed.edges.filter((e) => e.reciprocated).every((e) => e.source < e.target)).toBe(
      true,
    );
    // A one-way tie keeps its direction, so some run from a higher index to a lower one.
    expect(directed.edges.some((e) => !e.reciprocated && e.source > e.target)).toBe(true);
    expect(directed.directions).toEqual({ oneWay: true, bothWays: true });
  });

  it('combines the two directions of a pair by the chosen rule', async () => {
    const r = await resultFor(demo, initialMapSettings());
    const w = r.refs.connection_strength?.weights ?? new Float64Array();
    const v = valenceMatrix(demo, initialMapSettings()) ?? new Float64Array();
    const n = demo.members.length;
    for (const rule of ['mean', 'min', 'max', 'both'] as const) {
      // The rule only combines directions on the map; the directed analysis is the same.
      const m = await model({ layer: 'connection_strength', symmetrise: rule, threshold: 0 });
      const pick = (a: number, b: number) =>
        rule === 'both'
          ? Number.isNaN(a) || Number.isNaN(b)
            ? NaN
            : a * b > 0
              ? Math.sign(a) * Math.min(Math.abs(a), Math.abs(b))
              : 0
          : Number.isNaN(a)
            ? b
            : Number.isNaN(b)
              ? a
              : rule === 'mean'
                ? (a + b) / 2
                : rule === 'min'
                  ? Math.min(a, b)
                  : Math.max(a, b);
      for (const e of m.edges) {
        const k = e.source * n + e.target;
        const back = e.target * n + e.source;
        if (e.reciprocated) {
          expect(e.weight).toBeCloseTo(pick(w[k] as number, w[back] as number), 12);
          const valence = pick(v[k] as number, v[back] as number);
          if (Number.isNaN(valence)) expect(e.colour).toBeNaN();
          else expect(e.colour).toBeCloseTo(valence, 12);
          expect(e.width).toBeCloseTo(theme.edgeMin + (theme.edgeMax - theme.edgeMin) * e.weight);
        } else {
          expect(e.weight).toBe(w[k]);
          expect((w[back] as number) > 0).toBe(false);
        }
      }
    }
  });

  it('keeps a valence of 0 distinct from a valence that was not rated', async () => {
    const m = await model({ layer: 'connection_strength' });
    const v = valenceMatrix(demo, { ...initialMapSettings() });
    expect(v).not.toBeNull();
    expect(m.edges.some((e) => e.colour === 0)).toBe(true);
    expect(m.edges.some((e) => Number.isNaN(e.colour))).toBe(true);
    expect(m.colour.anyMissing).toBe(true);
    const off = await model({ layer: 'connection_strength', edgeColour: { kind: 'none' } });
    expect(off.colour).toMatchObject({ kind: 'none', reason: 'chosen' });
    expect(off.edges.every((e) => Number.isNaN(e.colour))).toBe(true);
  });

  it('styles ties by formal and informal only when that style is chosen', async () => {
    // Edge style is off until the analyst chooses it (CLAUDE.md D126, D133).
    const initial = await model();
    expect(initial.styleShown).toBe(false);
    expect(initial.edges.every((e) => e.style === 'plain')).toBe(true);
    const both = await model({ edgeStyle: 'formalInformal' });
    expect(both.styleShown).toBe(true);
    expect(both.stylesPresent).toEqual(expect.arrayContaining(['formal', 'informal', 'both']));
    // The switches only hide ties; they no longer set the style.
    const switched = await model({
      layerToggles: { formal_collaboration: true, informal_collaboration: true },
    });
    expect(switched.styleShown).toBe(false);
    // Without the informal layer there is no style to draw.
    const noInformal = {
      ...demo,
      layers: demo.layers.map((l) =>
        l.key === 'informal_collaboration' ? { ...l, enabled: false } : l,
      ),
    };
    const one = buildMapModel(
      noInformal,
      await resultFor(demo, initialMapSettings()),
      { ...initialMapSettings(), edgeStyle: 'formalInformal' },
      theme,
      demo.members.map((m) => m.display_name),
    );
    expect(one.styleShown).toBe(false);
    expect(one.edges.every((e) => e.style === 'plain')).toBe(true);
    // A pair styled in the directed view combines its two directions' ratings.
    const directed = await model({ edgeStyle: 'formalInformal', layer: 'connection_strength' });
    expect(directed.edges.some((e) => e.reciprocated && e.style !== 'plain')).toBe(true);
  });

  it('starts every layer switched on when switched-off layers hide their ties', async () => {
    const hide = await model({ hideOffLayers: true });
    expect(hide.hiddenLayers).toEqual([]);
    expect(hide.styleShown).toBe(false);
  });

  it('hides the ties of a switched-off layer only when asked to', async () => {
    const off = { formal_collaboration: false };
    const keep = await model({ layerToggles: off });
    const all = await model();
    expect(keep.edges.length).toBe(all.edges.length);
    expect(keep.hiddenLayers).toEqual([]);
    const hide = await model({ layerToggles: off, hideOffLayers: true });
    expect(hide.hiddenLayers).toEqual(['formal_collaboration']);
    expect(hide.edges.length).toBeLessThan(all.edges.length);
    const r = await resultFor(demo, initialMapSettings());
    const f = r.refs.formal_collaboration?.weights ?? new Float64Array();
    const n = demo.members.length;
    expect(hide.edges.every((e) => !((f[e.source * n + e.target] as number) > 0))).toBe(true);
    // A signed layer switched off hides ties of either sign.
    const noValence = await model({ layerToggles: { valence: false }, hideOffLayers: true });
    const vp = r.refs['valence+']?.weights ?? new Float64Array();
    const vn = r.refs['valence-']?.weights ?? new Float64Array();
    for (const e of noValence.edges) {
      const k = e.source * n + e.target;
      expect((vp[k] as number) > 0 || (vn[k] as number) > 0).toBe(false);
    }
    const legend = legendSections(hide, theme).find((x) => x.kind === 'width');
    expect(legend?.kind === 'width' && legend.notes).toEqual([
      'Ties below 0.30 hidden',
      'Ties on Formal collaboration hidden',
      'Every metric uses all ties, hidden or not',
    ]);
  });

  it('hides members outside the filters, and their ties', async () => {
    const m = await model({ filters: [{ key: 'team', values: ['Finance'] }] });
    const finance = new Set(
      demo.members.filter((x) => x.attributes.team === 'Finance').map((x) => x.id),
    );
    expect(
      m.nodes
        .filter((x) => x.visible)
        .map((x) => x.id)
        .sort(),
    ).toEqual([...finance].sort());
    for (const e of m.edges) {
      expect(finance.has(m.nodes[e.source]?.id ?? '')).toBe(true);
      expect(finance.has(m.nodes[e.target]?.id ?? '')).toBe(true);
    }
  });

  it('treats a missing attribute as "Not recorded" in fill and filters', async () => {
    const p: Project = {
      ...demo,
      members: demo.members.map((x, i) =>
        i === 0 ? { ...x, attributes: { ...x.attributes, team: null } } : x,
      ),
      meta: { ...demo.meta, title: 'demo-missing-team' },
    };
    const m = await model({}, p);
    const g = m.fill.groups[m.nodes[0]?.group ?? -1];
    expect(g?.kind).toBe('notRecorded');
    expect(g?.hue).toBe(-1);
    const f = await model({ filters: [{ key: 'team', values: [NOT_RECORDED] }] }, p);
    expect(f.nodes.filter((x) => x.visible).map((x) => x.index)).toEqual([0]);
  });

  it('uses at most eight hues and groups the rest as Other', async () => {
    const p: Project = {
      ...demo,
      members: demo.members.map((x, i) => ({
        ...x,
        attributes: { ...x.attributes, team: `T${String(i % 11)}` },
      })),
      meta: { ...demo.meta, title: 'demo-eleven-teams' },
    };
    const m = await model({}, p);
    expect(m.fill.groups.filter((g) => g.hue >= 0)).toHaveLength(8);
    expect(m.fill.groups.find((g) => g.kind === 'other')?.members).toBeGreaterThan(0);
    expect(m.fill.otherGroups).toBe(3);
  });

  it('colours by community on the selected layer', async () => {
    const m = await model({ fill: { kind: 'community' } });
    const r = await resultFor(demo, initialMapSettings());
    expect(m.fill.kind).toBe('community');
    expect(m.fill.groups.filter((g) => g.kind === 'community')).toHaveLength(
      Math.min(8, r.refs.composite?.communities?.count ?? 0),
    );
  });

  it('sizes nodes by area between the smallest and largest value', async () => {
    const m = await model({ sizeMetric: 'inStrength' });
    const defined = m.nodes.filter((x) => Number.isFinite(x.sizeValue));
    const lo = defined.reduce((a, b) => (a.sizeValue < b.sizeValue ? a : b));
    const hi = defined.reduce((a, b) => (a.sizeValue > b.sizeValue ? a : b));
    expect(lo.radius).toBeCloseTo(theme.nodeMin);
    expect(hi.radius).toBeCloseTo(theme.nodeMax);
  });

  it('finds members by part of their name', async () => {
    const name = demo.members[3]?.display_name ?? '';
    const m = await model({ search: name.slice(0, 5).toUpperCase() });
    expect(m.searchMatches?.has(3)).toBe(true);
    const none = await model({ search: 'zzzz-no-one' });
    expect(none.searchMatches?.size).toBe(0);
  });
});

describe('legend', () => {
  it('explains every encoding in use, and only those', async () => {
    const kinds = (m: MapModel) => legendSections(m, theme).map((s) => s.kind);
    const on = { edgeStyle: 'formalInformal' } as const;
    expect(kinds(await model())).toEqual(['size', 'fill', 'width', 'colour', 'arrows']);
    expect(kinds(await model(on))).toEqual(['size', 'fill', 'width', 'colour', 'style', 'arrows']);
    expect(kinds(await model({ view: 'symmetrised', ...on }))).toEqual([
      'size',
      'fill',
      'width',
      'colour',
      'style',
    ]);
    expect(kinds(await model({ edgeStyle: 'none' }))).not.toContain('style');
  });

  it('explains one-way and both-way ties in the directed view', async () => {
    const direction = (m: MapModel) => legendSections(m, theme).find((x) => x.kind === 'arrows');
    const d = direction(await model({ symmetrise: 'min' }));
    expect(d?.kind === 'arrows' && d.items).toEqual([
      { arrow: true, label: 'One way, from rater to rated member' },
      { arrow: false, label: 'Both ways: one line, the weaker direction' },
    ]);
  });

  it('names the chosen metric, attribute and layer, and states the threshold', async () => {
    const s = legendSections(
      await model({ layer: 'connection_strength', sizeMetric: 'inStrength', threshold: 0.4 }),
      theme,
    );
    expect(s.find((x) => x.kind === 'size')?.variable).toBe('Received strength');
    expect(s.find((x) => x.kind === 'fill')?.variable).toBe('Team or function');
    const width = s.find((x) => x.kind === 'width');
    expect(width?.variable).toBe('Connection strength');
    expect(width?.kind === 'width' && width.notes).toEqual([
      'Ties below 0.40 hidden',
      'Every metric uses all ties, hidden or not',
    ]);
    const notes = async (threshold: number, thresholdTo: number) => {
      const x = legendSections(await model({ threshold, thresholdTo }), theme).find(
        (y) => y.kind === 'width',
      );
      return x?.kind === 'width' ? x.notes : [];
    };
    expect(await notes(0, 0.5)).toEqual([
      'Ties above 0.50 hidden',
      'Every metric uses all ties, hidden or not',
    ]);
    expect(await notes(0.3, 0.5)).toEqual([
      'Ties outside 0.30–0.50 hidden',
      'Every metric uses all ties, hidden or not',
    ]);
    // With every tie drawn there is nothing hidden to explain.
    const none = legendSections(await model({ threshold: 0 }), theme).find(
      (x) => x.kind === 'width',
    );
    expect(none?.kind === 'width' && none.notes).toEqual([]);
  });

  it('shows the valence scale, and a separate entry for valence not rated', async () => {
    const colour = legendSections(await model({ signedScale: 'full' }), theme).find(
      (x) => x.kind === 'colour',
    );
    expect(colour?.kind === 'colour' && colour.ramp?.swatches.map((x) => x.step)).toEqual([
      -3, -2, -1, 0, 1, 2, 3,
    ]);
    expect(colour?.variable).toBe('Valence, −3 to +3');
    expect(colour?.kind === 'colour' && colour.items).toEqual([
      { colour: 'graphite', label: 'Valence not rated' },
    ]);
  });
});

const spiral = (n: number): Point[] =>
  Array.from({ length: n }, (_, i) => ({
    x: 12 * Math.sqrt(i + 0.5) * Math.cos(i * 2.4),
    y: 12 * Math.sqrt(i + 0.5) * Math.sin(i * 2.4),
  }));

describe('scene', () => {
  const size = { width: 800, height: 600 };
  const t = { x: 400, y: 300, k: 1 };
  const none = { hovered: null, focused: null, selected: null };

  it('draws every visible member once, at full strength when nothing is highlighted', async () => {
    const m = await model();
    const scene = buildScene(m, spiral(m.n), t, size, theme, none);
    expect(scene.nodes).toHaveLength(m.n);
    expect(scene.nodes.every((x) => x.alpha === 1)).toBe(true);
    expect(scene.arrows.length).toBeGreaterThan(0);
  });

  it('fades members outside a hovered neighbourhood', async () => {
    const m = await model();
    const h = { ...none, hovered: 0 };
    const lit = highlightSet(m, h);
    expect(lit).toEqual(new Set([0, ...(m.neighbours[0] ?? [])]));
    const scene = buildScene(m, spiral(m.n), t, size, theme, h);
    for (const node of scene.nodes) {
      expect(node.alpha).toBe(lit?.has(node.index) ? 1 : theme.fade);
    }
    const litOnly = buildScene(m, spiral(m.n), t, size, theme, h, 'lit');
    expect(litOnly.nodes.every((x) => lit?.has(x.index))).toBe(true);
    expect(litOnly.lines.every((b) => b.alpha === 1)).toBe(true);
  });

  /** A label's box as the scene places it, with the scene's default measure. */
  const labelBox = (l: { x: number; y: number; text: string; align?: string }) => {
    const w = l.text.length * theme.labelSize * 0.5 + theme.labelGap * 2;
    const x0 = l.align === 'left' ? l.x : l.align === 'right' ? l.x - w : l.x - w / 2;
    return { x0, x1: x0 + w, y0: l.y - theme.labelSize, y1: l.y + theme.labelGap };
  };
  const covers = (b: ReturnType<typeof labelBox>, c: { x: number; y: number; r: number }) => {
    const dx = c.x - Math.min(Math.max(c.x, b.x0), b.x1);
    const dy = c.y - Math.min(Math.max(c.y, b.y0), b.y1);
    return dx * dx + dy * dy < (c.r + theme.line) ** 2;
  };
  /** Members 2 onwards in rows across the lower half; members 0 and 1 placed by the test. */
  const rows = (n: number, first: Point, second: Point): Point[] =>
    Array.from({ length: n }, (_, i) =>
      i === 0
        ? first
        : i === 1
          ? second
          : { x: -360 + 80 * ((i - 2) % 10), y: 40 + 60 * Math.floor((i - 2) / 10) },
    );

  it('never lets two labels overlap', async () => {
    const m = await model();
    const scene = buildScene(m, spiral(m.n), t, size, theme, none);
    const boxes = scene.labels.map(labelBox);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a || !b) continue;
        expect(a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0).toBe(false);
      }
    }
  });

  it('never draws a name over another member', async () => {
    const m = await model();
    const scene = buildScene(m, spiral(m.n), t, size, theme, none);
    for (const l of scene.labels) {
      for (const node of scene.nodes) {
        if (node.index !== l.index) expect(covers(labelBox(l), node)).toBe(false);
      }
    }
  });

  it('moves a name above its member when the place below would cover another (Q36)', async () => {
    const m = await model();
    const r = m.nodes[0]?.radius ?? 0;
    const scene = buildScene(
      m,
      rows(m.n, { x: 0, y: -200 }, { x: 0, y: -200 + r + 12 }),
      t,
      size,
      theme,
      none,
    );
    const label = scene.labels.find((l) => l.index === 0);
    expect(label?.align ?? 'center').toBe('center');
    expect(label?.y).toBeLessThan(100);
  });

  it('keeps a moved name on the canvas', async () => {
    const m = await model();
    const r = m.nodes[0]?.radius ?? 0;
    // At the top edge, the place above is off the canvas: the name goes to the
    // right of the member (text anchored at its left end).
    const top = -300 + r + 10;
    const scene = buildScene(
      m,
      rows(m.n, { x: 0, y: top }, { x: 0, y: top + r + 12 }),
      t,
      size,
      theme,
      none,
    );
    const label = scene.labels.find((l) => l.index === 0);
    expect(label?.align).toBe('left');
    const box = label ? labelBox(label) : undefined;
    expect(box && box.y0 >= 0 && box.x1 <= size.width).toBe(true);
  });

  it('labels a focused member even when every place covers another', async () => {
    const m = await model();
    const r = m.nodes[0]?.radius ?? 0;
    // Members below, above, right and left of member 0, where its name would go.
    const at = (i: number): Point =>
      [
        { x: 0, y: -200 },
        { x: 0, y: -200 + r + 12 },
        { x: 0, y: -200 - r - 14 },
        { x: r + 20, y: -200 },
        { x: -r - 20, y: -200 },
      ][i] ?? { x: -360 + 80 * ((i - 5) % 10), y: 40 + 60 * Math.floor((i - 5) / 10) };
    const positions = Array.from({ length: m.n }, (_, i) => at(i));
    const plain = buildScene(m, positions, t, size, theme, none);
    expect(plain.labels.some((l) => l.index === 0)).toBe(false);
    const focused = buildScene(m, positions, t, size, theme, { ...none, focused: 0 });
    expect(focused.labels.some((l) => l.index === 0)).toBe(true);
  });

  it('draws arrowheads on one-way ties only, and one line per pair', async () => {
    const m = await model({ layer: 'connection_strength' });
    const scene = buildScene(
      m,
      spiral(m.n),
      { ...t, k: 4 },
      { width: 4000, height: 4000 },
      theme,
      none,
    );
    const heads = scene.arrows.reduce((s, a) => s + a.coords.length / 6, 0);
    const oneWay = m.edges.filter((e) => !e.reciprocated).length;
    expect(heads).toBe(oneWay);
    const segments = scene.lines.reduce((s, b) => s + b.coords.length / 4, 0);
    expect(segments).toBe(m.edges.length);
    // A pair tied both ways runs from member to member, without an offset.
    const pos = spiral(m.n).map((p) => ({ x: p.x * 4 + t.x, y: p.y * 4 + t.y }));
    const e = m.edges.find((x) => x.reciprocated);
    const a = pos[e?.source ?? 0] as Point;
    const b = pos[e?.target ?? 0] as Point;
    const found = scene.lines.some((batch) => {
      for (let k = 0; k < batch.coords.length; k += 4)
        if (
          Math.hypot((batch.coords[k] as number) - a.x, (batch.coords[k + 1] as number) - a.y) <
            1e-9 &&
          Math.hypot((batch.coords[k + 2] as number) - b.x, (batch.coords[k + 3] as number) - b.y) <
            1e-9
        )
          return true;
      return false;
    });
    expect(found).toBe(true);
  });

  it('draws the selection and focus rings', async () => {
    const m = await model();
    const scene = buildScene(m, spiral(m.n), t, size, theme, { ...none, selected: 2, focused: 5 });
    expect(scene.rings).toHaveLength(2);
  });
});

describe('encoding choices (D126, D132, D134, D136)', () => {
  const size = { width: 800, height: 600 };
  const t = { x: 400, y: 300, k: 1 };
  const none = { hovered: null, focused: null, selected: null };
  /** Stroke of each drawn tie, by pair, from the scene's line batches (straight ties: one segment each). */
  const strokes = (m: MapModel) => {
    const scene = buildScene(m, spiral(m.n), t, size, theme, none);
    return new Set(scene.lines.map((b) => b.stroke));
  };
  const n = demo.members.length;

  it('colours only negative ratings by default, and the full scale when asked (D132)', async () => {
    const m = await model({ layer: 'connection_strength' });
    expect(m.colour).toMatchObject({ kind: 'signed', layerLabel: 'Valence', full: false });
    const used = strokes(m);
    // Negative steps are drawn; positive steps and the neutral grey are not.
    expect(VALENCE.slice(0, 3).some((c) => used.has(c))).toBe(true);
    expect(VALENCE.slice(3).some((c) => used.has(c))).toBe(false);
    expect(used.has(theme.stone)).toBe(true);
    const full = strokes(await model({ layer: 'connection_strength', signedScale: 'full' }));
    expect(VALENCE.slice(4).some((c) => full.has(c))).toBe(true);
    const legend = legendSections(m, theme).find((x) => x.kind === 'colour');
    expect(legend?.variable).toBe('Valence: negative ratings only');
    expect(legend?.kind === 'colour' && legend.items[0]).toEqual({
      colour: 'stone',
      label: 'Neutral or positive',
    });
  });

  it('colours by any enabled signed layer, and by none when that layer is not enabled', async () => {
    const withEnergy = {
      ...demo,
      layers: demo.layers.map((l) => (l.key === 'energy' ? { ...l, enabled: true } : l)),
    };
    const s = { ...initialMapSettings(), edgeColour: { kind: 'signed', layer: 'energy' } as const };
    const r = await resultFor(demo, s);
    const names = demo.members.map((x) => x.display_name);
    const on = buildMapModel(withEnergy, r, s, theme, names);
    expect(on.colour).toMatchObject({ kind: 'signed', layerLabel: 'Energy' });
    // The demo has no energy ratings, so every tie is "not rated" on it.
    expect(on.edges.every((e) => Number.isNaN(e.colour))).toBe(true);
    expect(on.colour.anyMissing).toBe(true);
    const off = buildMapModel(demo, r, s, theme, names);
    expect(off.colour).toMatchObject({ kind: 'none', reason: 'unavailable' });
    expect(legendSections(off, theme).find((x) => x.kind === 'colour')?.variable).toBe(
      'Not used: the chosen layer is not enabled',
    );
  });

  it('colours by an unsigned layer on the sequential ramp, with 0 and not rated apart', async () => {
    const m = await model({
      layer: 'connection_strength',
      edgeColour: { kind: 'unsigned', layer: 'formal_collaboration' },
    });
    const r = await resultFor(demo, initialMapSettings());
    const f = r.refs.formal_collaboration?.weights ?? new Float64Array();
    for (const e of m.edges) {
      const a = f[e.source * n + e.target] as number;
      const b = f[e.target * n + e.source] as number;
      const v = e.reciprocated ? (Number.isNaN(a) ? b : Number.isNaN(b) ? a : (a + b) / 2) : a;
      if (Number.isNaN(v)) expect(e.colour).toBeNaN();
      else if (v === 0) expect(e.colour).toBe(0);
      else expect(e.colour).toBe(Math.ceil(v * 5 - 1e-9));
    }
    expect(m.colour.anyZero).toBe(true);
    const used = strokes(m);
    expect(theme.ramp.some((c) => used.has(c))).toBe(true);
    const legend = legendSections(m, theme).find((x) => x.kind === 'colour');
    expect(legend?.kind === 'colour' && legend.ramp?.swatches).toHaveLength(5);
    expect(legend?.kind === 'colour' && legend.items.map((x) => x.label)).toContain('Rated 0');
  });

  it('colours ties within and between the node-fill groups, or communities', async () => {
    const m = await model({ edgeColour: { kind: 'groups' } });
    for (const e of m.edges) {
      const a = demo.members[e.source]?.attributes.team;
      const b = demo.members[e.target]?.attributes.team;
      expect(e.colour).toBe(a === b ? 0 : 1);
    }
    expect(m.edges.some((e) => e.colour === 0) && m.edges.some((e) => e.colour === 1)).toBe(true);
    const used = strokes(m);
    expect([...used].sort()).toEqual([theme.graphite, theme.stone].sort());
    expect(legendSections(m, theme).find((x) => x.kind === 'colour')?.variable).toBe(
      'Within or between groups of Team or function',
    );
    const c = await model({ edgeColour: { kind: 'groups' }, fill: { kind: 'community' } });
    const membership = (await resultFor(demo, initialMapSettings())).refs.composite?.communities
      ?.membership;
    for (const e of c.edges)
      expect(e.colour).toBe(membership?.[e.source] === membership?.[e.target] ? 0 : 1);
    expect(c.colour.communities).toBe(true);
  });

  it('sets width by another layer, thinnest in stone where it is not rated', async () => {
    const m = await model({ edgeWidth: { kind: 'layer', layer: 'formal_collaboration' } });
    const r = await resultFor(demo, initialMapSettings());
    const f = r.refs.formal_collaboration?.weights ?? new Float64Array();
    expect(m.width).toMatchObject({ kind: 'layer', layerLabel: 'Formal collaboration' });
    const missing = m.edges.filter((e) => e.widthNotRated);
    expect(missing.length).toBeGreaterThan(0);
    for (const e of missing) {
      expect(e.width).toBe(theme.edgeMin);
      expect(Number.isNaN(f[e.source * n + e.target] as number)).toBe(true);
    }
    for (const e of m.edges.filter((x) => !x.widthNotRated && !x.reciprocated))
      expect(e.width).toBeCloseTo(
        theme.edgeMin + (theme.edgeMax - theme.edgeMin) * (f[e.source * n + e.target] as number),
      );
    // The drawn ties are still those of "Ties from".
    expect(m.edges.length).toBe((await model()).edges.length);
    const legend = legendSections(m, theme).find((x) => x.kind === 'width');
    expect(legend?.kind === 'width' && legend.notRated).toEqual({
      width: theme.edgeMin,
      label: 'Not rated on Formal collaboration',
    });
    expect(legend?.kind === 'width' && legend.notes).toEqual([
      'Ties drawn from Composite of all layers',
      'Ties below 0.30 hidden',
      'Every metric uses all ties, hidden or not',
    ]);
    // The scene draws them in stone whatever the colour.
    const scene = buildScene(m, spiral(m.n), t, size, theme, none);
    expect(scene.lines.some((b) => b.stroke === theme.stone && b.width === theme.edgeMin)).toBe(
      true,
    );
  });

  it('draws every tie at one width when width is not used', async () => {
    const m = await model({ edgeWidth: { kind: 'uniform' } });
    const w = theme.edgeMin + (theme.edgeMax - theme.edgeMin) / 2;
    expect(m.edges.every((e) => e.width === w)).toBe(true);
    expect(legendSections(m, theme).find((x) => x.kind === 'width')?.variable).toBe(
      'Not used: the same for every tie',
    );
  });

  it('a width layer that is not in the analysis falls back to "Ties from"', async () => {
    const m = await model({ edgeWidth: { kind: 'layer', layer: 'not_a_layer' } });
    expect(m.width.kind).toBe('tiesFrom');
  });

  it('sizes members by rank, highest largest, ties at their average rank (D134)', async () => {
    const byValue = await model();
    const byRank = await model({ sizeScale: 'rank' });
    const values = byRank.nodes.map((x) => x.sizeValue);
    const ranks = averageRanks(values);
    const m = byRank.size.defined;
    for (const node of byRank.nodes) {
      const rank = ranks[node.index] as number;
      if (Number.isNaN(rank)) {
        expect(node.radius).toBe(theme.nodeUndefined);
        continue;
      }
      const tt = (m - rank) / (m - 1);
      expect(node.radius).toBeCloseTo(
        Math.sqrt(theme.nodeMin ** 2 + (theme.nodeMax ** 2 - theme.nodeMin ** 2) * tt),
      );
    }
    // Ranks spread members out: more members above the smallest third of the range.
    const big = (x: MapModel) => x.nodes.filter((node) => node.radius > theme.nodeMax / 2).length;
    expect(big(byRank)).toBeGreaterThan(big(byValue));
    const legend = legendSections(byRank, theme).find((x) => x.kind === 'size');
    expect(legend?.variable).toBe('Bridging, by rank');
    expect(legend?.kind === 'size' && legend.samples.map((x) => x.label)).toEqual([
      `Rank ${String(m)}`,
      `Rank ${String(Math.round((m + 1) / 2))}`,
      'Rank 1',
    ]);
  });

  it('ranks ties at their average rank', () => {
    expect(averageRanks([3, 1, 3, NaN, 2])).toEqual([1.5, 4, 1.5, NaN, 3]);
  });

  it('outlines communities under the members while fill shows an attribute (D136)', async () => {
    const off = await model();
    expect(off.outlines).toBeNull();
    const m = await model({ communityOutlines: true });
    expect(m.outlines).not.toBeNull();
    expect(legendSections(m, theme).find((x) => x.kind === 'marks')?.kind === 'marks').toBe(true);
    const marks = legendSections(m, theme).find((x) => x.kind === 'marks');
    expect(marks?.kind === 'marks' && marks.items[0]).toEqual({
      mark: 'outline',
      label: 'Community outline, detected on Composite of all layers',
    });
    const positions = spiral(m.n);
    const withOutlines = buildScene(m, positions, t, size, theme, none);
    const without = buildScene(off, positions, t, size, theme, none);
    const segments = (sc: typeof without) =>
      sc.lines
        .filter((b) => b.stroke === theme.stone && b.width === theme.line)
        .reduce((k, b) => k + b.coords.length / 4, 0);
    expect(segments(withOutlines)).toBeGreaterThan(segments(without));
    // The outlines are drawn first, so they sit under the ties.
    expect(withOutlines.lines[0]?.stroke).toBe(theme.stone);
    // A community fill already shows them.
    expect((await model({ communityOutlines: true, fill: { kind: 'community' } })).outlines).toBe(
      null,
    );
  });

  it('marks bridge ties with a diamond and a legend entry (build plan session 7)', async () => {
    const patch: Partial<MapSettings> = {
      view: 'symmetrised',
      symmetrise: 'min',
      layer: 'connection_strength',
      threshold: 0,
    };
    const off = await model(patch);
    expect(off.markBridges).toBe(false);
    expect(off.edges.some((e) => e.bridge)).toBe(false);
    const m = await model({ ...patch, markBridges: true });
    const r = await resultFor(demo, { ...initialMapSettings(), ...patch });
    const lb = r.refs.connection_strength?.ties?.localBridges;
    expect(lb && lb.from.length).toBeGreaterThan(0);
    // Every local bridge is drawn at threshold 0, and only those are marked.
    expect(m.bridges).toBe(lb?.from.length);
    for (const e of m.edges.filter((x) => x.bridge)) {
      const k = Array.from(lb?.from ?? []).findIndex(
        (a, i) => a === Math.min(e.source, e.target) && lb?.to[i] === Math.max(e.source, e.target),
      );
      expect(k).toBeGreaterThanOrEqual(0);
    }
    const marks = legendSections(m, theme).find((x) => x.kind === 'marks');
    expect(marks?.kind === 'marks' && marks.items.map((i) => i.mark)).toContain('bridge');
    expect(marks?.kind === 'marks' && marks.items.find((i) => i.mark === 'bridge')?.label).toBe(
      `Bridge tie: its two members have no contact in common (${String(m.bridges)} drawn)`,
    );
    const scene = buildScene(m, spiral(m.n), t, size, theme, none);
    const diamonds = scene.arrows
      .filter((a) => a.fill === theme.bridge)
      .reduce((k, a) => k + a.coords.length / 12, 0);
    expect(diamonds).toBe(m.bridges);
    // Each diamond sits on a paper halo drawn before it.
    const order = scene.arrows.map((a) => a.fill);
    expect(order.indexOf(theme.paper)).toBeLessThan(order.indexOf(theme.bridge));
    // With no bridge among the ties drawn the legend says so.
    const none0 = await model({ ...patch, markBridges: true, threshold: 1 });
    const marks0 = legendSections(none0, theme).find((x) => x.kind === 'marks');
    expect(marks0?.kind === 'marks' && marks0.items.find((i) => i.mark === 'bridge')?.label).toBe(
      'Bridge ties: none among the ties drawn',
    );
  });

  it('builds a convex hull round its points', () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 1, y: 1 });
  });
});

describe('palettes and pinned group colours (D127)', () => {
  const t = { k: 1, x: 0, y: 0 };
  const size = { width: 800, height: 600 };
  const none = { hovered: null, focused: null, selected: null };
  const spiral = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      x: Math.cos(i) * (50 + i * 5),
      y: Math.sin(i) * (50 + i * 5),
    }));
  const teams = (m: MapModel) =>
    new Map(m.fill.groups.filter((g) => g.kind === 'value').map((g) => [g.key, g.hue]));

  it('assigns hues in category order when nothing is pinned', async () => {
    const m = await model();
    expect([...teams(m).values()]).toEqual([...teams(m).keys()].map((_, i) => i));
    expect(m.palette).toEqual({ categorical: 'tol-muted', diverging: 'orange-blue' });
  });

  it('keeps a pinned value on its hue and gives the others the free hues in order', async () => {
    const before = teams(await model());
    const [first, second] = [...before.keys()];
    const p = withPin(
      { ...demo, meta: { ...demo.meta, title: 'pinned' } },
      'team',
      second ?? '',
      0,
    );
    const after = teams(await model({}, p));
    expect(after.get(second ?? '')).toBe(0);
    expect(after.get(first ?? '')).toBe(1);
    // Every hue is used once.
    expect(new Set(after.values()).size).toBe(after.size);
  });

  it('colours a pinned value beyond the eighth, and makes an unpinned one "Other"', async () => {
    const p0: Project = {
      ...demo,
      members: demo.members.map((x, i) => ({
        ...x,
        attributes: { ...x.attributes, team: `T${String(i % 11).padStart(2, '0')}` },
      })),
      meta: { ...demo.meta, title: 'eleven-teams-pinned' },
    };
    const p = withPin(p0, 'team', 'T10', 3);
    const m = await model({}, p);
    const hues = teams(m);
    expect(hues.get('T10')).toBe(3);
    expect(hues.has('T07')).toBe(false);
    expect(hues.size).toBe(8);
    const other = m.fill.groups.findIndex((g) => g.kind === 'other');
    const t07 = demo.members.findIndex((_, i) => i % 11 === 7);
    expect(m.nodes[t07]?.group).toBe(other);
  });

  it('moves a hue to the value pinned last, and releases a pin', () => {
    const a = withPin(demo, 'team', 'X', 2);
    const b = withPin(a, 'team', 'Y', 2);
    expect(b.settings.group_colours).toEqual({ team: { Y: 2 } });
    expect(withPin(b, 'team', 'Y', null).settings.group_colours).toBeUndefined();
    expect(pinnedHues(b, 'team', 8)).toEqual(new Map([['Y', 2]]));
    // A hue beyond the palette is ignored.
    expect(pinnedHues(withPin(demo, 'team', 'X', 9), 'team', 8).size).toBe(0);
  });

  it('stores the default palettes as no setting', () => {
    const p = withPalette(demo, { categorical: 'tol-muted', diverging: 'purple-green' });
    expect(paletteChoice(p).diverging).toBe('purple-green');
    expect(withPalette(p, paletteChoice(demo)).settings.palette).toBeUndefined();
  });

  it('draws fills and the diverging scale from the chosen palette', async () => {
    const p = withPalette(
      { ...demo, meta: { ...demo.meta, title: 'red-blue' } },
      { categorical: 'tol-muted', diverging: 'red-blue' },
    );
    const s: Partial<MapSettings> = { signedScale: 'full' };
    const m = await model(s, p);
    const scene = buildScene(m, spiral(m.n), t, size, theme, none);
    const strokes = new Set(scene.lines.map((b) => b.stroke));
    const redBlue = theme.palettes.diverging['red-blue'];
    expect(redBlue.filter((c) => c !== VALENCE[3]).some((c) => strokes.has(c))).toBe(true);
    expect(VALENCE.filter((c) => c !== VALENCE[3] && strokes.has(c))).toEqual([]);
    const fills = new Set(scene.nodes.map((x) => x.fill));
    expect([...fills].every((c) => CATEGORICAL.includes(c) || c === theme.other)).toBe(true);
  });
});

describe('grouped layout', () => {
  it('keeps names inside a group apart and spreads each group over its cell', async () => {
    const r = await resultFor(demo, initialMapSettings());
    const teams = [...new Set(demo.members.map((m) => m.attributes.team ?? ''))];
    const group = demo.members.map((m) => teams.indexOf(m.attributes.team ?? ''));
    const radii = demo.members.map((_, i) => theme.nodeMin + (i % 13));
    for (const names of [
      demo.members.map((m) => m.display_name),
      demo.members.map((_, i) => `ABC-L2-${String(i).padStart(2, '0')}`),
    ]) {
      const spec = { kind: 'grouped' as const, group, groups: teams, names };
      const layout = new ForceLayout();
      layout.update('a', demo.members.length, r.refs.composite?.weights, radii, spec);
      const { boxes, cell } = groupBoxes(layout.nodes, spec);
      const at = layout.settled;
      // No two boxes of one group (member and the name below it) overlap by more than a fraction of a unit.
      for (let i = 0; i < at.length; i++) {
        for (let j = i + 1; j < at.length; j++) {
          if (group[i] !== group[j]) continue;
          const a = at[i] as Point;
          const b = at[j] as Point;
          const ba = boxes[i];
          const bb = boxes[j];
          if (!ba || !bb) continue;
          const dy = b.y - a.y;
          const ox = ba.half + bb.half - Math.abs(b.x - a.x);
          const oy = (dy >= 0 ? ba.down + bb.up : ba.up + bb.down) - Math.abs(dy);
          expect(Math.min(ox, oy)).toBeLessThan(0.5);
        }
      }
      // Every group, small ones included, spreads over a good part of its cell.
      teams.forEach((_, g) => {
        const xs = at.filter((_, i) => group[i] === g);
        const w = Math.max(...xs.map((p) => p.x)) - Math.min(...xs.map((p) => p.x));
        const h = Math.max(...xs.map((p) => p.y)) - Math.min(...xs.map((p) => p.y));
        expect(Math.max(w, h)).toBeGreaterThan(cell * 0.3);
        expect(Math.max(w, h)).toBeLessThan(cell);
      });
    }
  });
});

describe('keyboard traversal', () => {
  it('moves to the connected member in the direction of the arrow', async () => {
    const m = await model();
    const positions = spiral(m.n);
    const from = 0;
    const p = positions[from] as Point;
    const right = nextMember(m, positions, from, { x: 1, y: 0 });
    expect(right).not.toBeNull();
    const q = positions[right as number] as Point;
    expect(q.x).toBeGreaterThan(p.x);
    expect(m.neighbours[from]).toContain(right);
  });

  it('reaches a member without ties by falling back to the nearest one that way', () => {
    const m = {
      nodes: [0, 1, 2].map((i) => ({ index: i, visible: true })),
      neighbours: [[], [], []],
    } as unknown as MapModel;
    const positions = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(nextMember(m, positions, 0, { x: 1, y: 0 })).toBe(1);
    expect(nextMember(m, positions, 0, { x: 0, y: 1 })).toBe(2);
    expect(nextMember(m, positions, 0, { x: -1, y: 0 })).toBeNull();
  });
});

describe('ranks', () => {
  it('ranks from the highest value and shows tied values as a range', () => {
    const c = new Float64Array([0.5, 0.9, 0.5, NaN, 0.1, 0.5]);
    expect(rankOf(c, 1)).toBe('1');
    expect(rankOf(c, 0)).toBe('2–4');
    expect(rankOf(c, 4)).toBe('5');
    expect(rankOf(c, 3)).toBe('–');
  });
});
