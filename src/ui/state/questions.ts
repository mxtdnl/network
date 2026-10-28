// The question catalogue (build plan session 8, spec §8): questions a client
// asks, each bound to the relation that answers it and the view and map
// settings that show it. Choosing a question sets the view; its text becomes
// the view's title and, when the view is saved, its default caption. A
// question whose relation is missing, switched off or not rated says so and
// changes nothing: no other layer is put in its place.
//
// Wording lives in ui/copy/questions.ts (D9); the sentences shown with each
// question are built in ui/state/readouts.ts.

import { builtinLayer } from '../../data/defaults';
import { builtinForRole, relationForRole } from '../../data/relations';
import {
  DEFAULT_WAVE,
  layerRole,
  type LayerDefinition,
  type LayerRole,
  type Project,
} from '../../data/schema';
import type { AnalysisResult } from '../engineClient';
import { questionsCopy } from '../copy/questions';
import { hierarchyAvailable } from '../map/useMapModel';
import { insightGroup } from './insightGroup';
import {
  DEFAULT_THRESHOLD,
  DEFAULT_THRESHOLD_TO,
  initialMapSettings,
  metricForView,
  useAppStore,
  type CentreView,
  type MapSettings,
  type SizeMetric,
  type UiState,
} from './store';

export type QuestionId =
  | 'connected'
  | 'information'
  | 'groups'
  | 'brokers'
  | 'depend'
  | 'informal'
  | 'singleRoute'
  | 'negative';

/** Picker order. The first is the question the map opens on. */
export const QUESTION_IDS: readonly QuestionId[] = [
  'connected',
  'information',
  'groups',
  'brokers',
  'depend',
  'informal',
  'singleRoute',
  'negative',
];

export const DEFAULT_QUESTION: QuestionId = 'connected';

export function isQuestionId(value: unknown): value is QuestionId {
  return typeof value === 'string' && (QUESTION_IDS as readonly string[]).includes(value);
}

/**
 * Roles of the relations the catalogue reads (build plan session 11): a
 * question reads the layer that stands for its role (relationForRole), so a
 * relation the analyst created with that role answers it too.
 */
export const QUESTION_ROLES = {
  connection: 'connection',
  advice: 'advice',
  dependency: 'dependency',
  informal: 'informal',
  formal: 'formal',
} as const satisfies Record<string, LayerRole>;

export type Availability =
  | { ok: true }
  | {
      ok: false;
      reason: 'notInProject' | 'notEnabled' | 'notRated' | 'noGroups';
      /** The relation in words, for the picker and its note. */
      relation: string;
    };

const lowerFirst = (s: string) => (s === '' ? s : s.charAt(0).toLowerCase() + s.slice(1));

function relationName(project: Project, key: string): string {
  const label = project.layers.find((l) => l.key === key)?.label ?? builtinLayer(key)?.label;
  return lowerFirst(label ?? key);
}

/** Whether the layer has at least one rating with a value in wave 1. */
export function hasRatings(project: Project, key: string): boolean {
  return project.ties.some(
    (t) => t.variable === key && t.wave === DEFAULT_WAVE && typeof t.value === 'number',
  );
}

function layerState(project: Project, layer: LayerDefinition | undefined, key: string) {
  const relation = layer ? lowerFirst(layer.label) : relationName(project, key);
  if (!layer) return { ok: false as const, reason: 'notInProject' as const, relation };
  if (!layer.enabled) return { ok: false as const, reason: 'notEnabled' as const, relation };
  if (!hasRatings(project, layer.key))
    return { ok: false as const, reason: 'notRated' as const, relation };
  return null;
}

const byKey = (project: Project, key: string) => project.layers.find((l) => l.key === key);

/** The key of the layer standing for a role, or the built-in key of that role when the project has none. */
function roleKey(project: Project, role: LayerRole): string {
  return relationForRole(project, role)?.key ?? builtinForRole(role)?.key ?? role;
}

/**
 * The signed layer the negative-ratings question colours by: valence first,
 * then a signed layer whose role is affect, then any other.
 */
export function questionSignedLayer(project: Project): LayerDefinition | undefined {
  const usable = (l: LayerDefinition) => l.signed && l.enabled && hasRatings(project, l.key);
  return (
    project.layers.find((l) => l.key === 'valence' && usable(l)) ??
    project.layers.find((l) => layerRole(l) === 'affect' && usable(l)) ??
    project.layers.find(usable)
  );
}

/** The layer a question draws ties from, whether or not it is usable. */
export function questionLayer(id: QuestionId, project: Project): string {
  switch (id) {
    case 'information':
      return roleKey(project, QUESTION_ROLES.advice);
    case 'depend':
      return roleKey(project, QUESTION_ROLES.dependency);
    case 'brokers':
    case 'informal':
      return roleKey(project, QUESTION_ROLES.informal);
    default:
      return roleKey(project, QUESTION_ROLES.connection);
  }
}

/** Groups present among members for the attribute the group rules use. */
function groupCount(project: Project): number {
  const attr = insightGroup(project);
  if (!attr) return 0;
  const values = new Set<string>();
  for (const m of project.members) {
    const v = m.attributes[attr.key];
    if (v !== null && v !== undefined && v !== '') values.add(v);
  }
  return values.size;
}

export function questionAvailability(id: QuestionId, project: Project): Availability {
  const key = questionLayer(id, project);
  const layer = byKey(project, key);
  const own = layerState(project, layer, key);
  if (id === 'informal') {
    const formal = relationForRole(project, QUESTION_ROLES.formal);
    const ok =
      !own &&
      formal !== undefined &&
      formal.enabled &&
      hasRatings(project, formal.key) &&
      layer !== undefined;
    if (!ok) {
      const missing = !layer || !formal;
      const off = (layer && !layer.enabled) || (formal && !formal.enabled);
      return {
        ok: false,
        reason: missing ? 'notInProject' : off ? 'notEnabled' : 'notRated',
        relation: questionsCopy.bothLayers,
      };
    }
    return { ok: true };
  }
  if (own) return own;
  if (id === 'groups' && groupCount(project) < 2)
    return { ok: false, reason: 'noGroups', relation: '' };
  if (id === 'negative' && !questionSignedLayer(project)) {
    const valence = byKey(project, 'valence');
    const anySigned = project.layers.filter((l) => l.signed);
    return {
      ok: false,
      reason:
        anySigned.length === 0
          ? 'notInProject'
          : anySigned.some((l) => l.enabled)
            ? 'notRated'
            : 'notEnabled',
      relation: valence ? lowerFirst(valence.label) : questionsCopy.signedLayer,
    };
  }
  return { ok: true };
}

/** The note shown when a question cannot be answered with this project. */
export function availabilityNote(a: Availability): string | null {
  if (a.ok) return null;
  switch (a.reason) {
    case 'notInProject':
      return questionsCopy.notInProject(a.relation);
    case 'notEnabled':
      return questionsCopy.notEnabled(a.relation);
    case 'notRated':
      return questionsCopy.notRated(a.relation);
    case 'noGroups':
      return questionsCopy.noGroups;
  }
}

/** The fill a question uses: the attribute the group rules use, else communities. */
function questionFill(project: Project): MapSettings['fill'] {
  const attr = insightGroup(project);
  return attr ? { kind: 'attribute', key: attr.key } : { kind: 'community' };
}

export interface QuestionSettings {
  map: Partial<MapSettings>;
  centreView: CentreView;
  ui: Partial<Pick<UiState, 'tableMode' | 'incomingLayer' | 'grouping'>>;
}

/**
 * The view and map settings that answer a question. Everything a question
 * does not decide (the direction rule, the analysis options, the legend's
 * form) stays as the analyst set it; filters, the ego view, search and
 * highlights are cleared, because a question is about everyone.
 */
export function questionSettings(
  id: QuestionId,
  project: Project,
  map: MapSettings,
  result: AnalysisResult | null = null,
): QuestionSettings {
  const layer = questionLayer(id, project);
  const defaults = initialMapSettings();
  const view = id === 'information' || id === 'depend' ? 'directed' : map.view;
  const metric = (m: SizeMetric) => metricForView(m, view);
  const base: Partial<MapSettings> = {
    question: id,
    view,
    layer,
    sizeMetric: metric('inDegree'),
    sizeScale: 'value',
    fill: questionFill(project),
    threshold: DEFAULT_THRESHOLD,
    thresholdTo: DEFAULT_THRESHOLD_TO,
    negativeOutsideRange: false,
    layout: 'force',
    edgeColour: defaults.edgeColour,
    signedScale: 'negative',
    edgeWidth: { kind: 'tiesFrom' },
    edgeStyle: 'none',
    communityOutlines: false,
    markBridges: false,
    filters: [],
    ego: null,
    highlight: [],
    search: '',
  };
  const onMap = (patch: Partial<MapSettings> = {}): QuestionSettings => ({
    map: { ...base, ...patch },
    centreView: 'map',
    ui: {},
  });
  switch (id) {
    case 'connected':
      return onMap();
    case 'information':
      return onMap({ sizeMetric: metric('inStrength') });
    case 'groups':
      return {
        map: { ...base, layout: 'grouped', groupBy: insightGroup(project)?.key ?? null },
        centreView: 'groups',
        ui: { grouping: null },
      };
    case 'brokers':
      return onMap({ sizeMetric: 'betweenness', communityOutlines: true });
    case 'depend':
      return {
        map: { ...base, sizeMetric: metric('inStrength') },
        centreView: 'table',
        ui: { tableMode: 'incoming', incomingLayer: layer },
      };
    case 'informal':
      return onMap({
        edgeStyle: 'formalInformal',
        layout: hierarchyAvailable(project) ? 'hierarchy' : 'force',
      });
    case 'singleRoute': {
      // Bridge ties are mostly weak ties, so every tie is drawn; cut points are highlighted.
      const cut =
        result && result.view === view ? result.refs[layer]?.ties?.cutPoints.members : undefined;
      const highlight = cut ? Array.from(cut, (i) => result?.memberIds[i] ?? '') : [];
      return onMap({
        sizeMetric: 'betweenness',
        markBridges: true,
        threshold: 0,
        highlight: highlight.filter((m) => m !== ''),
      });
    }
    case 'negative': {
      const signed = questionSignedLayer(project);
      return onMap({
        edgeColour: signed ? { kind: 'signed', layer: signed.key } : defaults.edgeColour,
        negativeOutsideRange: true,
      });
    }
  }
}

/**
 * The question the map answers now, or null for the analyst's own settings.
 * A question stays chosen while "Ties from" is its layer (store.setMap drops it otherwise).
 */
export function activeQuestion(project: Project | null, map: MapSettings): QuestionId | null {
  if (!project || !isQuestionId(map.question)) return null;
  return map.layer === questionLayer(map.question, project) ? map.question : null;
}

/** Applies a question. Returns false, changing nothing, when the project cannot answer it. */
export function applyQuestion(id: QuestionId): boolean {
  const s = useAppStore.getState();
  const project = s.data.project;
  if (!project || !questionAvailability(id, project).ok) return false;
  const settings = questionSettings(id, project, s.map, s.results.current);
  s.setMap(settings.map);
  s.setTools({ path: null });
  if (settings.ui.tableMode) s.setTableMode(settings.ui.tableMode);
  if (settings.ui.incomingLayer !== undefined) s.setIncomingLayer(settings.ui.incomingLayer);
  if (settings.ui.grouping !== undefined) s.setGrouping(settings.ui.grouping);
  s.setCentreView(settings.centreView);
  s.setStatus({ text: questionsCopy.shown(questionsCopy.questions[id]), tone: 'info' });
  return true;
}

/** The question's text, the default caption of a view saved while it is chosen. */
export function questionText(id: QuestionId): string {
  return questionsCopy.questions[id];
}
