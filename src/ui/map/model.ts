// The map model: which members and ties are drawn and how each one is encoded
// (spec §8). Pure: no DOM, no canvas. The canvas painter and the SVG export
// (Phase 7) both draw from a scene built on this model, so the two cannot
// disagree.
//
// One visual channel carries one variable, chosen by the analyst (CLAUDE.md D126):
//   node size   → the chosen metric on the selected layer, by value or by rank
//   node fill   → the chosen attribute, or the community on the selected layer
//   edge width  → the tie's weight (0–1) on the selected layer, another layer, or none
//   edge colour → a signed layer on the diverging scale (valence by default,
//                 negative ratings only), an unsigned layer on the sequential
//                 ramp, within or between groups, or none
//   edge style  → formal versus informal, when chosen
//   arrowheads  → directed view only, on ties rated one way; a pair rated
//                 both ways is one line, its two directions combined
//   outlines    → optional: the communities on the selected layer

import { FI_CLASS, type AnalysisResult, type CompositeFormula } from '../engineClient';
import {
  isCategorical,
  type AttributeDefinition,
  type LayerDefinition,
  type Project,
} from '../../data/schema';
import type { MapSettings, SizeMetric } from '../state/store';
import { PALETTE_TOKENS, paletteChoice, pinnedHues, type PaletteChoice } from './palettes';

export const NOT_RECORDED = '\u0000not-recorded';

export type EdgeStyle = 'plain' | 'formal' | 'informal' | 'both' | 'neither';

export interface MapNode {
  index: number;
  id: string;
  name: string;
  visible: boolean;
  /** Raw metric value; NaN when not defined. */
  sizeValue: number;
  radius: number;
  /** Index into `fill.groups`. */
  group: number;
  /** Gave no ratings: drawn hollow, with its own legend entry (session 4). */
  noRatings: boolean;
}

export interface MapEdge {
  source: number;
  target: number;
  /** Weight on the "Ties from" layer, which decides that the tie is drawn. */
  weight: number;
  width: number;
  /**
   * The pair's value on the colour encoding: a signed layer on the palette
   * scale −3…+3, an unsigned layer's ramp class 1–5 (0 when rated 0), or 0
   * within and 1 between groups. NaN when not rated, or no colour is shown.
   */
  colour: number;
  /** The pair has no rating on the width layer: drawn thinnest, in stone (D126). */
  widthNotRated: boolean;
  style: EdgeStyle;
  /**
   * Directed view: the pair is tied both ways and drawn as one line without
   * arrowheads; weight, width, valence and style combine the two directions
   * by the symmetrisation rule (CLAUDE.md D131). Source is the lower index.
   */
  reciprocated: boolean;
  /** A local bridge on the layer drawn, marked when bridge ties are marked (build plan session 7). */
  bridge: boolean;
}

export type FillGroupKind = 'value' | 'community' | 'other' | 'notRecorded' | 'noCommunity';

export interface FillGroup {
  key: string;
  kind: FillGroupKind;
  /** The attribute value, or the community number from 1. */
  label: string;
  /** Palette index 0–7, or -1 for the "Other" / "Not recorded" grey. */
  hue: number;
  members: number;
}

export interface SizeScale {
  metric: SizeMetric;
  /** Area linear in the value, or in the rank (D134). */
  scale: 'value' | 'rank';
  lo: number;
  hi: number;
  /** Members whose value is defined (the ranks run from 1 to this). */
  defined: number;
  anyUndefined: boolean;
}

/** How edge colour is used, for the scene and the legend (D126). */
export interface EdgeColourModel {
  kind: 'signed' | 'unsigned' | 'groups' | 'none';
  /** The colour layer's label (signed and unsigned). */
  layerLabel: string;
  /** Signed: the full scale, or negative ratings only (D132). */
  full: boolean;
  /** Some tie drawn has no rating on the colour layer. */
  anyMissing: boolean;
  /** Unsigned: some tie drawn is rated 0 on the colour layer. */
  anyZero: boolean;
  /** Groups: classes follow the communities, or the node-fill attribute named here. */
  communities: boolean;
  groupLabel: string;
  /** None: chosen, the chosen layer is not enabled, or the export left it out. */
  reason: 'chosen' | 'unavailable' | 'excluded' | null;
}

/** How edge width is used. */
export interface EdgeWidthModel {
  kind: 'tiesFrom' | 'layer' | 'uniform';
  layerLabel: string;
  /** Some tie drawn has no rating on the width layer. */
  anyMissing: boolean;
}

export interface MapModel {
  n: number;
  directed: boolean;
  layer: string;
  layerLabel: string;
  /** The layer whose ties are drawn: `layer`, or the informal layer over the formal hierarchy. */
  edgeLayer: string;
  edgeLayerLabel: string;
  /** Ego view in force: the member at the centre and the depth. */
  ego: { index: number; name: string; depth: 1 | 2 } | null;
  /** Members hidden on the map by the resilience simulation. */
  removed: number;
  nodes: MapNode[];
  edges: MapEdge[];
  /** Neighbours through the drawn ties, either direction, visible members only. */
  neighbours: number[][];
  size: SizeScale;
  fill: {
    kind: 'attribute' | 'community';
    label: string;
    groups: FillGroup[];
    otherGroups: number;
  };
  colour: EdgeColourModel;
  width: EdgeWidthModel;
  styleShown: boolean;
  stylesPresent: EdgeStyle[];
  /** Directed view: which kinds of tie are drawn, for the legend (D131). */
  directions: { oneWay: boolean; bothWays: boolean };
  /** How the two directions of a pair are combined. */
  symmetrise: MapSettings['symmetrise'];
  /** The tie-strength range drawn, inclusive (D141). */
  threshold: number;
  thresholdTo: number;
  /** Ties with a negative rating are drawn outside the range (D145): on, and a signed layer is enabled. */
  negativeOutsideRange: boolean;
  /** Layers switched off whose ties are hidden (keys). */
  hiddenLayers: string[];
  hiddenLabels: string[];
  searchMatches: Set<number> | null;
  /** Members named by an insight or a saved view (settings.highlight), visible ones only. */
  highlighted: Set<number> | null;
  /** Community per member on the selected layer, when communities are outlined (D136); -1 for none. */
  outlines: number[] | null;
  /**
   * Bridge ties are marked (build plan session 7): the setting is on and the
   * layer drawn has tie structure (not a negative sub-layer).
   */
  markBridges: boolean;
  /** Bridge ties drawn, when marked. */
  bridges: number;
  /** The project's palettes (D127): renderers take their colours from the theme's palette of that id. */
  palette: PaletteChoice;
  /** Tie directions reconstructed from colleagues' ratings, all layers (build plan session 5). */
  reconstructed: number;
  /** Each rater's ratings on unsigned layers are ranks within the rater (build plan session 5). */
  standardised: boolean;
  /** The composite's formula when ties come from it, so the legend states its weights (build plan session 8). */
  composite: CompositeFormula | null;
}

export interface Radii {
  nodeMin: number;
  nodeMax: number;
  nodeUndefined: number;
  edgeMin: number;
  edgeMax: number;
}

/** The valence layer: the core `valence` layer when enabled. */
export function valenceLayer(project: Project): LayerDefinition | undefined {
  return signedColourLayers(project).find((l) => l.key === 'valence');
}

/** Signed layers edge colour can show, on the diverging scale. */
export function signedColourLayers(project: Project): LayerDefinition[] {
  return project.layers.filter((l) => l.enabled && l.signed && !isCategorical(l));
}

/**
 * Directed pairs (rater × n + rated) with a negative rating on any enabled
 * signed layer, wave 1; null when no signed layer is enabled.
 */
export function negativeRatings(project: Project): Uint8Array | null {
  const keys = new Set(signedColourLayers(project).map((l) => l.key));
  if (keys.size === 0) return null;
  const n = project.members.length;
  const index = new Map(project.members.map((m, i) => [m.id, i]));
  const out = new Uint8Array(n * n);
  for (const t of project.ties) {
    if (!keys.has(t.variable) || t.wave !== 1 || typeof t.value !== 'number' || t.value >= 0)
      continue;
    const i = index.get(t.rater_id);
    const j = index.get(t.ratee_id);
    if (i !== undefined && j !== undefined && i !== j) out[i * n + j] = 1;
  }
  return out;
}

export function roleLayer(project: Project, role: 'formal' | 'informal') {
  return project.layers.find((l) => l.role === role && l.enabled && !l.signed);
}

/**
 * Layers whose map switch is offered when switching a layer off hides its ties
 * (CLAUDE.md D59): every enabled rated layer. The encodings have choices of
 * their own (D126), so the switches only hide ties.
 */
export function toggleLayers(project: Project): LayerDefinition[] {
  return project.layers.filter((l) => l.enabled && !isCategorical(l));
}

/** Tie weights (view) of the layers switched off whose ties are hidden; a signed layer counts both signs. */
function hiddenLayerWeights(
  project: Project,
  result: AnalysisResult,
  settings: MapSettings,
): { key: string; weights: Float64Array[] }[] {
  if (!settings.hideOffLayers) return [];
  return toggleLayers(project)
    .filter((l) => !isToggledOn(settings, l))
    .map((l) => ({
      key: l.key,
      weights: (l.signed ? [`${l.key}+`, `${l.key}-`] : [l.key])
        .map((ref) => result.refs[ref]?.weights)
        .filter((w): w is Float64Array => w !== undefined),
    }));
}

/** Whether a layer's map switch is on; every layer starts on, so nothing is hidden by default. */
export function isToggledOn(settings: MapSettings, layer: Pick<LayerDefinition, 'key'>): boolean {
  return settings.layerToggles[layer.key] ?? true;
}

/** Combines the two directions of a pair as the engine does (engine/aggregate.ts `combine`). */
export function combineDirections(a: number, b: number, rule: MapSettings['symmetrise']): number {
  if (rule === 'both') {
    if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
    if (a > 0 && b > 0) return Math.min(a, b);
    if (a < 0 && b < 0) return Math.max(a, b);
    return 0;
  }
  if (Number.isNaN(a)) return b;
  if (Number.isNaN(b)) return a;
  if (rule === 'mean') return (a + b) / 2;
  if (rule === 'min') return Math.min(a, b);
  return Math.max(a, b);
}

/** Attributes that can colour nodes or filter them (not member references). */
export function groupAttributes(project: Project): AttributeDefinition[] {
  return project.attribute_definitions.filter((a) => a.type !== 'member_ref' && a.type !== 'email');
}

/** Values of an attribute that members have, in display order: defined categories, then first appearance. */
export function attributeValues(project: Project, key: string): string[] {
  const def = project.attribute_definitions.find((a) => a.key === key);
  const present = new Set<string>();
  const appearance: string[] = [];
  for (const m of project.members) {
    const v = m.attributes[key];
    if (v !== null && v !== undefined && !present.has(v)) {
      present.add(v);
      appearance.push(v);
    }
  }
  const defined = (def?.categories ?? []).filter((c) => present.has(c));
  const known = new Set(defined);
  return [...defined, ...appearance.filter((v) => !known.has(v))];
}

/** Pair valence on the palette scale (−3…+3) in the current view; NaN = not rated. */
export function valenceMatrix(project: Project, settings: MapSettings): Float64Array | null {
  return signedMatrix(project, 'valence', settings);
}

/** A signed layer's pair values on the palette scale (−3…+3) in the current view; NaN = not rated. */
export function signedMatrix(
  project: Project,
  key: string,
  settings: Pick<MapSettings, 'view' | 'symmetrise'>,
): Float64Array | null {
  const layer = signedColourLayers(project).find((l) => l.key === key);
  if (!layer) return null;
  const n = project.members.length;
  const index = new Map(project.members.map((m, i) => [m.id, i]));
  const raw = new Float64Array(n * n).fill(NaN);
  for (const t of project.ties) {
    if (t.variable !== layer.key || t.wave !== 1 || typeof t.value !== 'number') continue;
    const i = index.get(t.rater_id);
    const j = index.get(t.ratee_id);
    if (i === undefined || j === undefined || i === j) continue;
    // Same scaling as the engine (method notes §1.2): −1…+1, then to the 7-step palette.
    const s = t.value >= 0 ? t.value / layer.max : t.value / Math.abs(layer.min);
    raw[i * n + j] = s * 3;
  }
  if (settings.view === 'directed') return raw;
  const out = new Float64Array(n * n).fill(NaN);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = combineDirections(
        raw[i * n + j] as number,
        raw[j * n + i] as number,
        settings.symmetrise,
      );
      out[i * n + j] = v;
      out[j * n + i] = v;
    }
  }
  return out;
}

function memberMatchesFilters(
  attributes: Record<string, string | null>,
  filters: MapSettings['filters'],
): boolean {
  return filters.every((f) => {
    if (f.values.length === 0) return true;
    const v = attributes[f.key] ?? null;
    return f.values.includes(v ?? NOT_RECORDED);
  });
}

function fillGroups(
  project: Project,
  result: AnalysisResult,
  settings: MapSettings,
  layerLabel: string,
): MapModel['fill'] & { memberGroup: number[] } {
  const n = project.members.length;
  const groups: FillGroup[] = [];
  const memberGroup = new Array<number>(n).fill(0);
  const hues = PALETTE_TOKENS.categorical[paletteChoice(project).categorical].length;

  if (settings.fill.kind === 'community') {
    const c = result.refs[settings.layer]?.communities ?? null;
    const base = { kind: 'community' as const, label: layerLabel };
    if (!c) {
      groups.push({ key: 'none', kind: 'noCommunity', label: '', hue: -1, members: n });
      return { ...base, groups, otherGroups: 0, memberGroup };
    }
    const sizes = new Array<number>(c.count).fill(0);
    for (const k of c.membership) sizes[k] = (sizes[k] ?? 0) + 1;
    const coloured = Math.min(c.count, hues);
    for (let k = 0; k < coloured; k++) {
      groups.push({
        key: String(k),
        kind: 'community',
        label: String(k + 1),
        hue: k,
        members: sizes[k] ?? 0,
      });
    }
    const otherGroups = c.count - coloured;
    if (otherGroups > 0) {
      const members = sizes.slice(coloured).reduce((s, x) => s + x, 0);
      groups.push({ key: 'other', kind: 'other', label: '', hue: -1, members });
    }
    c.membership.forEach((k, i) => {
      memberGroup[i] = k < coloured ? k : coloured;
    });
    return { ...base, groups, otherGroups, memberGroup };
  }

  const key = settings.fill.key;
  const def = project.attribute_definitions.find((a) => a.key === key);
  const values = attributeValues(project, key);
  const position = new Map(values.map((v, i) => [v, i]));
  const counts = new Array<number>(values.length).fill(0);
  let missing = 0;
  project.members.forEach((m) => {
    const v = m.attributes[key];
    const p = v === null || v === undefined ? undefined : position.get(v);
    if (p === undefined) missing += 1;
    else counts[p] = (counts[p] ?? 0) + 1;
  });
  // Pinned values keep their hue (D127); the others take the free hues in
  // category order, and values beyond the palette are "Other".
  const pins = pinnedHues(project, key, hues);
  const hueOf = values.map((v) => pins.get(v) ?? -1);
  const taken = new Set(hueOf.filter((h) => h >= 0));
  let next = 0;
  hueOf.forEach((h, i) => {
    if (h >= 0) return;
    while (next < hues && taken.has(next)) next += 1;
    if (next < hues) {
      hueOf[i] = next;
      taken.add(next);
      next += 1;
    }
  });
  const groupOf = new Array<number>(values.length).fill(-1);
  values.forEach((v, i) => {
    const hue = hueOf[i] ?? -1;
    if (hue < 0) return;
    groupOf[i] = groups.length;
    groups.push({ key: v, kind: 'value', label: v, hue, members: counts[i] ?? 0 });
  });
  const otherGroups = groupOf.filter((g) => g < 0).length;
  const otherIndex = groups.length;
  if (otherGroups > 0) {
    const members = counts.reduce((s, x, i) => ((groupOf[i] ?? -1) < 0 ? s + x : s), 0);
    groups.push({ key: 'other', kind: 'other', label: '', hue: -1, members });
  }
  const missingIndex = groups.length;
  if (missing > 0)
    groups.push({ key: NOT_RECORDED, kind: 'notRecorded', label: '', hue: -1, members: missing });
  project.members.forEach((m, i) => {
    const v = m.attributes[key];
    const p = v === null || v === undefined ? undefined : position.get(v);
    const g = p === undefined ? -1 : (groupOf[p] ?? -1);
    memberGroup[i] = p === undefined ? missingIndex : g >= 0 ? g : otherIndex;
  });
  return { kind: 'attribute', label: def?.label ?? key, groups, otherGroups, memberGroup };
}

/** The engine's formal–informal class of a pair from its two weights (engine/metrics/multiplex.ts). */
function classOf(f: number, g: number): number {
  if (Number.isNaN(f) || Number.isNaN(g)) return FI_CLASS.notClassified;
  if (f > 0 && g > 0) return FI_CLASS.both;
  if (f > 0) return FI_CLASS.formalOnly;
  if (g > 0) return FI_CLASS.informalOnly;
  return FI_CLASS.neither;
}

function edgeStyle(cls: number, f: number, g: number): EdgeStyle {
  switch (cls) {
    case FI_CLASS.formalOnly:
      return 'formal';
    case FI_CLASS.informalOnly:
      return 'informal';
    case FI_CLASS.both:
      return 'both';
    case FI_CLASS.notClassified:
      // One of the two was not rated: show what is known (CLAUDE.md D53).
      if (f > 0) return 'formal';
      if (g > 0) return 'informal';
      return 'neither';
    default:
      return 'neither';
  }
}

export interface ModelOptions {
  /** Draw ties from this layer instead of `settings.layer` (the formal hierarchy's informal overlay). */
  edgeLayer?: string;
  /** Members hidden by the resilience simulation (map only). */
  removed?: ReadonlySet<string>;
  /** The export left out the colour layer (signed-layer exclusion, D105), so the legend says so. */
  colourExcluded?: boolean;
}

/** Plain label of a layer reference: a layer, a signed sub-layer or the composite. */
export function refLabel(project: Project, ref: string): string {
  const key = ref.endsWith('+') || ref.endsWith('-') ? ref.slice(0, -1) : ref;
  return project.layers.find((l) => l.key === key)?.label ?? ref;
}

/** Tolerance of the tie-strength range: composite weights are sums of fractions (D141). */
export const TIE_RANGE_TOLERANCE = 1e-9;

/** Whether a weight lies within the tie-strength range, bounds included (D141). */
export function inTieRange(w: number, from: number, to: number): boolean {
  return w >= from - TIE_RANGE_TOLERANCE && w <= to + TIE_RANGE_TOLERANCE;
}

/** Members within `depth` steps of `centre` along the given neighbour lists. */
export function egoSet(neighbours: readonly (readonly number[])[], centre: number, depth: number) {
  const seen = new Set<number>([centre]);
  let frontier = [centre];
  for (let d = 0; d < depth; d++) {
    const next: number[] = [];
    for (const v of frontier)
      for (const w of neighbours[v] ?? [])
        if (!seen.has(w)) {
          seen.add(w);
          next.push(w);
        }
    frontier = next;
  }
  return seen;
}

export function buildMapModel(
  project: Project,
  result: AnalysisResult,
  settings: MapSettings,
  radii: Radii,
  /** Member names in project order, from the names layer (ui/state/names.ts), so anonymisation applies. */
  names: readonly string[],
  options: ModelOptions = {},
): MapModel {
  const n = project.members.length;
  const directed = result.view === 'directed';
  const ref = result.refs[settings.layer];
  const layerDef = project.layers.find((l) => l.key === settings.layer);
  const layerLabel = layerDef?.label ?? settings.layer;
  const edgeLayer = options.edgeLayer ?? settings.layer;
  const edgeLayerLabel = refLabel(project, edgeLayer);

  // Node size: area proportional to the metric, or to its rank (D134), between
  // the smallest and largest defined value.
  const column = ref?.node.columns[settings.sizeMetric];
  const values = Array.from({ length: n }, (_, i) => (column ? (column[i] as number) : NaN));
  let lo = Infinity;
  let hi = -Infinity;
  let defined = 0;
  for (const v of values)
    if (Number.isFinite(v)) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      defined += 1;
    }
  const anyUndefined = defined < n;
  const ranks = settings.sizeScale === 'rank' ? averageRanks(values) : null;
  const area = (t: number) =>
    Math.sqrt(radii.nodeMin ** 2 + (radii.nodeMax ** 2 - radii.nodeMin ** 2) * t);
  const radius = (i: number) => {
    const v = values[i] as number;
    if (!Number.isFinite(v)) return radii.nodeUndefined;
    if (ranks) {
      // Rank 1 is the highest value and the largest member.
      const rank = ranks[i] as number;
      return area(defined > 1 ? (defined - rank) / (defined - 1) : 0.5);
    }
    return area(hi > lo ? (v - lo) / (hi - lo) : 0.5);
  };

  const fill = fillGroups(project, result, settings, layerLabel);
  const query = settings.search.trim().toLocaleLowerCase('en-GB');
  const searchMatches = query === '' ? null : new Set<number>();

  const nodes: MapNode[] = project.members.map((m, i) => {
    const sizeValue = values[i] as number;
    const name = names[i] ?? m.id;
    if (searchMatches && name.toLocaleLowerCase('en-GB').includes(query)) searchMatches.add(i);
    return {
      index: i,
      id: m.id,
      name,
      visible: memberMatchesFilters(m.attributes, settings.filters),
      sizeValue,
      radius: radius(i),
      group: fill.memberGroup[i] ?? 0,
      noRatings: result.ratingFlags[i] === 'gaveNoRatings',
    };
  });
  const weights = result.refs[edgeLayer]?.weights;
  // Local bridges of the layer drawn, from every tie (metrics use all ties), as unordered pairs.
  const lb = settings.markBridges ? (result.refs[edgeLayer]?.ties?.localBridges ?? null) : null;
  const bridgePairs = new Set<number>();
  if (lb) lb.from.forEach((a, k) => bridgePairs.add(a * n + (lb.to[k] as number)));

  // Edge colour (D126). A choice whose layer is not in this analysis draws no
  // colour, and the legend says why.
  const choice = settings.edgeColour;
  const colourLayer = choice.kind === 'signed' || choice.kind === 'unsigned' ? choice.layer : null;
  const signedValues =
    choice.kind === 'signed' ? signedMatrix(project, choice.layer, settings) : null;
  const unsignedValues =
    choice.kind === 'unsigned' &&
    (result.refs[choice.layer]?.kind === 'unsigned' ||
      result.refs[choice.layer]?.kind === 'composite')
      ? (result.refs[choice.layer]?.weights ?? null)
      : null;
  const groupOf = choice.kind === 'groups' ? pairGroups(project, result, settings) : null;
  const colourKind: EdgeColourModel['kind'] = signedValues
    ? 'signed'
    : unsignedValues
      ? 'unsigned'
      : groupOf
        ? 'groups'
        : 'none';
  const colourReason: EdgeColourModel['reason'] =
    colourKind !== 'none'
      ? null
      : choice.kind === 'none'
        ? 'chosen'
        : options.colourExcluded
          ? 'excluded'
          : 'unavailable';

  // Edge width (D126): another layer's weight, or the same width for every tie.
  const widthChoice = settings.edgeWidth;
  const widthWeights =
    widthChoice.kind === 'layer' ? (result.refs[widthChoice.layer]?.weights ?? null) : null;
  const widthKind: EdgeWidthModel['kind'] =
    widthChoice.kind === 'uniform' ? 'uniform' : widthWeights ? 'layer' : 'tiesFrom';
  const widthOf = (w: number) => radii.edgeMin + (radii.edgeMax - radii.edgeMin) * w;

  const formal = roleLayer(project, 'formal');
  const informal = roleLayer(project, 'informal');
  const fi = result.multiplex?.formalInformal ?? null;
  const styleShown =
    settings.edgeStyle === 'formalInformal' &&
    fi !== null &&
    formal !== undefined &&
    informal !== undefined;
  const fW = formal ? result.refs[formal.key]?.weights : undefined;
  const gW = informal ? result.refs[informal.key]?.weights : undefined;

  const present = new Set<EdgeStyle>();
  let anyColourMissing = false;
  let anyColourZero = false;
  let anyWidthMissing = false;
  const hidden = hiddenLayerWeights(project, result, settings);
  const hiddenWeights = hidden.flatMap((h) => h.weights);
  // Negative ratings whatever the range (D145): a pair rated on "Ties from"
  // (0 included) with a negative rating, in that direction when directed and
  // in either direction when mutual.
  const negative = settings.negativeOutsideRange ? negativeRatings(project) : null;
  const isNegative = (k: number) =>
    negative !== null &&
    (negative[k] === 1 || (!directed && negative[(k % n) * n + Math.floor(k / n)] === 1));
  const shown = (k: number) => {
    if (hiddenWeights.some((hw) => (hw[k] as number) > 0)) return false;
    const w = weights ? (weights[k] as number) : NaN;
    if (w > 0 && inTieRange(w, settings.threshold, settings.thresholdTo)) return true;
    return w >= 0 && isNegative(k);
  };
  const buildEdges = () => {
    const edges: MapEdge[] = [];
    const neighbours: number[][] = Array.from({ length: n }, () => []);
    present.clear();
    anyColourMissing = false;
    anyColourZero = false;
    anyWidthMissing = false;
    if (!weights) return { edges, neighbours };
    const rule = settings.symmetrise;
    const at = (m: Float64Array | null | undefined, k: number) => (m ? (m[k] as number) : NaN);
    for (let i = 0; i < n; i++) {
      if (!nodes[i]?.visible) continue;
      for (let j = directed ? 0 : i + 1; j < n; j++) {
        if (i === j || !nodes[j]?.visible) continue;
        const k = i * n + j;
        if (!shown(k)) continue;
        // Directed view: a pair shown both ways is one line, drawn once from
        // the lower index, its two directions combined (CLAUDE.md D131).
        const back = j * n + i;
        const both = directed && shown(back);
        if (both && j < i) continue;
        const pick = (m: Float64Array | null | undefined) =>
          both ? combineDirections(at(m, k), at(m, back), rule) : at(m, k);
        const w = pick(weights);
        let colour = NaN;
        if (signedValues) colour = pick(signedValues);
        else if (unsignedValues) {
          const u = pick(unsignedValues);
          colour = Number.isNaN(u)
            ? NaN
            : u > 0
              ? Math.min(5, Math.max(1, Math.ceil(u * 5 - 1e-9)))
              : 0;
          if (colour === 0) anyColourZero = true;
        } else if (groupOf) colour = groupOf[i] === groupOf[j] ? 0 : 1;
        if (colourKind !== 'none' && Number.isNaN(colour)) anyColourMissing = true;
        let width = widthOf(widthKind === 'uniform' ? 0.5 : w);
        let widthNotRated = false;
        if (widthWeights) {
          const v = pick(widthWeights);
          widthNotRated = Number.isNaN(v);
          width = widthNotRated ? radii.edgeMin : widthOf(v);
          if (widthNotRated) anyWidthMissing = true;
        }
        let style: EdgeStyle = 'plain';
        if (styleShown) {
          const f = pick(fW);
          const g = pick(gW);
          style = edgeStyle(both ? classOf(f, g) : (fi.classes[k] as number), f, g);
        }
        present.add(style);
        edges.push({
          source: i,
          target: j,
          weight: w,
          width,
          colour,
          widthNotRated,
          style,
          reciprocated: both,
          bridge: bridgePairs.has(Math.min(i, j) * n + Math.max(i, j)),
        });
        const ni = neighbours[i] as number[];
        const nj = neighbours[j] as number[];
        if (!ni.includes(j)) ni.push(j);
        if (!nj.includes(i)) nj.push(i);
      }
    }
    return { edges, neighbours };
  };
  let { edges, neighbours } = buildEdges();

  // Ego view: the member and everyone within the chosen number of steps along
  // the ties shown (either direction); the rest are hidden like a filter.
  let ego: MapModel['ego'] = null;
  const egoIndex = settings.ego
    ? project.members.findIndex((m) => m.id === settings.ego?.member)
    : -1;
  if (settings.ego && egoIndex >= 0 && nodes[egoIndex]?.visible) {
    const keep = egoSet(neighbours, egoIndex, settings.ego.depth);
    for (const node of nodes) if (!keep.has(node.index)) node.visible = false;
    ego = {
      index: egoIndex,
      name: names[egoIndex] ?? '',
      depth: settings.ego.depth,
    };
    ({ edges, neighbours } = buildEdges());
  }
  let removed = 0;
  if (options.removed && options.removed.size > 0) {
    for (const node of nodes)
      if (node.visible && options.removed.has(node.id)) {
        node.visible = false;
        removed += 1;
      }
    if (removed > 0) ({ edges, neighbours } = buildEdges());
  }
  if (searchMatches) for (const i of searchMatches) if (!nodes[i]?.visible) searchMatches.delete(i);
  const marked = new Set(settings.highlight);
  const highlighted =
    marked.size === 0
      ? null
      : new Set(
          nodes.filter((node) => node.visible && marked.has(node.id)).map((node) => node.index),
        );
  const order: EdgeStyle[] = ['formal', 'informal', 'both', 'neither'];

  // Community outlines (D136): only while node fill shows an attribute, since
  // a community fill already shows them.
  const communities = ref?.communities ?? null;
  const outlines =
    settings.communityOutlines && settings.fill.kind === 'attribute' && communities
      ? Array.from(communities.membership, (c) => c)
      : null;

  return {
    n,
    directed,
    layer: settings.layer,
    layerLabel,
    edgeLayer,
    edgeLayerLabel,
    ego,
    removed,
    nodes,
    edges,
    neighbours,
    size: { metric: settings.sizeMetric, scale: settings.sizeScale, lo, hi, defined, anyUndefined },
    fill: {
      kind: fill.kind,
      label: fill.label,
      groups: fill.groups,
      otherGroups: fill.otherGroups,
    },
    colour: {
      kind: colourKind,
      layerLabel: colourLayer === null ? '' : refLabel(project, colourLayer),
      full: settings.signedScale === 'full',
      anyMissing: anyColourMissing,
      anyZero: anyColourZero,
      communities: settings.fill.kind === 'community',
      groupLabel: fill.label,
      reason: colourReason,
    },
    width: {
      kind: widthKind,
      layerLabel:
        widthChoice.kind === 'layer' && widthKind === 'layer'
          ? refLabel(project, widthChoice.layer)
          : '',
      anyMissing: anyWidthMissing,
    },
    styleShown,
    stylesPresent: order.filter((s) => present.has(s)),
    directions: {
      oneWay: directed && edges.some((e) => !e.reciprocated),
      bothWays: edges.some((e) => e.reciprocated),
    },
    symmetrise: settings.symmetrise,
    threshold: settings.threshold,
    thresholdTo: settings.thresholdTo,
    negativeOutsideRange: negative !== null,
    hiddenLayers: hidden.map((h) => h.key),
    hiddenLabels: hidden.map((h) => project.layers.find((l) => l.key === h.key)?.label ?? h.key),
    searchMatches,
    highlighted,
    outlines,
    markBridges: lb !== null,
    bridges: edges.filter((e) => e.bridge).length,
    palette: paletteChoice(project),
    reconstructed: Object.values(result.reconstructed).reduce((s, p) => s + p.length, 0),
    standardised: result.remedies.standardise === 'rank',
    composite:
      settings.layer === 'composite' || edgeLayer === 'composite' ? result.composite : null,
  };
}

/** Ranks with 1 for the highest value; tied values share their average rank; NaN where not defined. */
export function averageRanks(values: readonly number[]): number[] {
  const order = values
    .map((v, i) => ({ v, i }))
    .filter((x) => Number.isFinite(x.v))
    .sort((a, b) => b.v - a.v);
  const out = values.map(() => NaN);
  for (let a = 0; a < order.length;) {
    let b = a;
    while (
      b + 1 < order.length &&
      (order[b + 1] as { v: number }).v === (order[a] as { v: number }).v
    )
      b += 1;
    const rank = (a + b) / 2 + 1;
    for (let k = a; k <= b; k++) out[(order[k] as { i: number }).i] = rank;
    a = b + 1;
  }
  return out;
}

/**
 * Group per member for "within or between groups" (D126): the node-fill
 * attribute's value (members without one form a group of their own), or the
 * community on the selected layer. Null when communities are not available.
 */
function pairGroups(
  project: Project,
  result: AnalysisResult,
  settings: MapSettings,
): readonly (string | number)[] | null {
  if (settings.fill.kind === 'community') {
    const c = result.refs[settings.layer]?.communities;
    return c ? Array.from(c.membership, (k) => k) : null;
  }
  const key = settings.fill.key;
  return project.members.map((m) => m.attributes[key] ?? NOT_RECORDED);
}

/**
 * Keyboard traversal (spec §12): from member `from`, the neighbour whose
 * direction best matches the arrow key; when no neighbour lies that way, the
 * nearest visible member that way, so members without ties stay reachable.
 */
export function nextMember(
  model: MapModel,
  positions: readonly { x: number; y: number }[],
  from: number,
  dir: { x: number; y: number },
): number | null {
  const p = positions[from];
  if (!p) return null;
  const pick = (candidates: Iterable<number>, minCos: number) => {
    let best: number | null = null;
    let bestScore = Infinity;
    for (const j of candidates) {
      const q = positions[j];
      if (j === from || !q || !model.nodes[j]?.visible) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) continue;
      const cos = (dx * dir.x + dy * dir.y) / dist;
      if (cos < minCos) continue;
      // Prefer members straight ahead, then near ones.
      const score = dist * (2 - cos);
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    }
    return best;
  };
  // Neighbours within 90° of the arrow first, then anyone within 45°.
  return (
    pick(model.neighbours[from] ?? [], 1e-9) ??
    pick(
      model.nodes.map((node) => node.index),
      Math.SQRT1_2 - 1e-9,
    )
  );
}
