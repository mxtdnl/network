// Relations the analyst creates (build plan session 11, spec §4.2): a label,
// question wording, a scale from a fixed set and a declared role. The key is
// generated from the label once and never changes, because ties, surveys,
// saved views and imports name the layer by key.

import { builtinLayer, defaultLayers } from './defaults';
import {
  DEFAULT_WAVE,
  layerRole,
  MUTUAL_ROLES,
  type LayerDefinition,
  type LayerKey,
  type LayerRole,
  type Project,
} from './schema';

/** The scales a created relation may use. */
export const RELATION_SCALES = ['frequency', 'agreement', 'signed', 'categories'] as const;
export type RelationScale = (typeof RELATION_SCALES)[number];

/** Which scales each role allows (method notes §10). */
export const ROLE_SCALES: Readonly<Record<LayerRole, readonly RelationScale[]>> = {
  connection: ['frequency', 'agreement'],
  formal: ['frequency', 'agreement'],
  informal: ['frequency', 'agreement'],
  information: ['frequency', 'agreement'],
  advice: ['frequency', 'agreement'],
  dependency: ['frequency', 'agreement'],
  ideas: ['frequency', 'agreement'],
  trust: ['agreement'],
  influence: ['frequency', 'agreement'],
  awareness: ['agreement'],
  affect: ['signed', 'agreement'],
  friction: ['frequency', 'agreement'],
  other: ['frequency', 'agreement', 'signed', 'categories'],
};

export function roleAllows(role: LayerRole, scale: RelationScale): boolean {
  return ROLE_SCALES[role].includes(scale);
}

/** The scale a layer uses, read from its definition. */
export function relationScale(layer: LayerDefinition): RelationScale {
  if (layer.scale_type === 'categorical') return 'categories';
  if (layer.signed) return 'signed';
  return layer.scale_type === 'frequency' ? 'frequency' : 'agreement';
}

/** Default weight in the composite by role: friction is not a tie (D143). */
export function roleDefaultWeight(role: LayerRole, scale: RelationScale): number {
  if (scale === 'categories' || role === 'friction') return 0;
  return 1;
}

export const FREQUENCY_SCALE_LABELS: Readonly<Record<string, string>> = {
  '0': 'Never',
  '1': 'Less than monthly',
  '2': 'Monthly',
  '3': 'Weekly',
  '4': 'Several times a week',
  '5': 'Daily',
};
export const AGREEMENT_SCALE_LABELS: Readonly<Record<string, string>> = {
  '0': 'Not at all',
  '5': 'Completely',
};
export const SIGNED_SCALE_LABELS: Readonly<Record<string, string>> = {
  '-3': 'Very negative',
  '0': 'Neutral',
  '3': 'Very positive',
};

/** Categories of a categorical relation: 2 to 8 (spec §12's hue limit). */
export const MIN_CATEGORIES = 2;
export const MAX_CATEGORIES = 8;

/** Words that cannot be a key: the composite's reference (D38). */
const RESERVED_KEYS = new Set(['composite']);
const MAX_KEY_LENGTH = 40;

/**
 * The key a relation with this label would get: lower case, accents removed,
 * other characters as underscores, at most 40 characters, never a built-in
 * key (a deleted built-in can be added back) and unique in the project,
 * including keys a survey version asked about, so a deleted relation's
 * responses are never read as a new one's.
 */
export function relationKeyFor(
  project: Pick<Project, 'layers'> & Partial<Pick<Project, 'surveys'>>,
  label: string,
): LayerKey {
  const base =
    label
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, MAX_KEY_LENGTH)
      .replace(/_+$/, '') || 'relation';
  const used = new Set([
    ...project.layers.map((l) => l.key),
    ...defaultLayers().map((l) => l.key),
    ...(project.surveys ?? []).flatMap((s) =>
      s.versions.flatMap((v) => v.layers.map((l) => l.key)),
    ),
    ...RESERVED_KEYS,
  ]);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${String(n)}`)) n += 1;
  return `${base}_${String(n)}`;
}

/** A category key from its label, unique among those given. */
function categoryKey(label: string, used: Set<string>): string {
  const base =
    label
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'category';
  let key = base === 'n_a' ? 'category' : base;
  let n = 2;
  while (used.has(key)) key = `${base}_${String(n++)}`;
  used.add(key);
  return key;
}

export interface RelationSpec {
  label: string;
  question_wording: string;
  role: LayerRole;
  scale: RelationScale;
  /** Category labels, for the categories scale. */
  categories?: readonly string[];
  /** Absent means the role's default (MUTUAL_ROLES). */
  mutual?: boolean;
  /** Scale labels to use instead of the scale's defaults. */
  scale_labels?: Record<string, string>;
}

export type RelationProblem =
  | 'emptyLabel'
  | 'emptyWording'
  | 'scaleNotAllowed'
  | 'tooFewCategories'
  | 'tooManyCategories'
  | 'repeatedCategory';

/** What is wrong with a relation as specified, or an empty list. */
export function relationProblems(spec: RelationSpec): RelationProblem[] {
  const problems: RelationProblem[] = [];
  if (spec.label.trim() === '') problems.push('emptyLabel');
  if (spec.question_wording.trim() === '') problems.push('emptyWording');
  if (!roleAllows(spec.role, spec.scale)) problems.push('scaleNotAllowed');
  if (spec.scale === 'categories') {
    const cats = (spec.categories ?? []).map((c) => c.trim()).filter((c) => c !== '');
    if (cats.length < MIN_CATEGORIES) problems.push('tooFewCategories');
    if (cats.length > MAX_CATEGORIES) problems.push('tooManyCategories');
    if (new Set(cats.map((c) => c.toLowerCase())).size !== cats.length) {
      problems.push('repeatedCategory');
    }
  }
  return problems;
}

/** The layer definition of a new relation, enabled, with a key new to the project. */
export function createRelation(
  project: Pick<Project, 'layers'> & Partial<Pick<Project, 'surveys'>>,
  spec: RelationSpec,
): LayerDefinition {
  const label = spec.label.trim();
  const base = {
    key: relationKeyFor(project, label),
    label,
    question_wording: spec.question_wording.trim(),
    enabled: true,
    core: false,
    builtin: false,
    role: spec.role,
    default_weight: roleDefaultWeight(spec.role, spec.scale),
  };
  const mutual =
    spec.scale === 'categories' || spec.mutual === undefined
      ? {}
      : spec.mutual === MUTUAL_ROLES.includes(spec.role)
        ? {}
        : { mutual: spec.mutual };
  switch (spec.scale) {
    case 'categories': {
      const used = new Set<string>();
      const labels = (spec.categories ?? []).map((c) => c.trim()).filter((c) => c !== '');
      const keys = labels.map((c) => categoryKey(c, used));
      return {
        ...base,
        scale_type: 'categorical',
        min: 0,
        max: 0,
        signed: false,
        categories: keys,
        category_labels: Object.fromEntries(keys.map((k, i) => [k, labels[i] ?? k])),
      };
    }
    case 'signed':
      return {
        ...base,
        ...mutual,
        scale_type: 'signed',
        min: -3,
        max: 3,
        signed: true,
        scale_labels: { ...(spec.scale_labels ?? SIGNED_SCALE_LABELS) },
      };
    case 'frequency':
      return {
        ...base,
        ...mutual,
        scale_type: 'frequency',
        min: 0,
        max: 5,
        signed: false,
        scale_labels: { ...(spec.scale_labels ?? FREQUENCY_SCALE_LABELS) },
      };
    case 'agreement':
      return {
        ...base,
        ...mutual,
        scale_type: 'strength',
        min: 0,
        max: 5,
        signed: false,
        scale_labels: { ...(spec.scale_labels ?? AGREEMENT_SCALE_LABELS) },
      };
  }
}

/** Adds a relation the analyst created at the end of the project's layers. */
export function addRelation(project: Project, layer: LayerDefinition): Project {
  if (project.layers.some((l) => l.key === layer.key)) return project;
  return { ...project, layers: [...project.layers, layer] };
}

/** What deleting a layer removes, for the confirmation. */
export function deletionImpact(
  project: Project,
  key: LayerKey,
): { ratings: number; views: number; surveys: number } {
  const ratings = project.ties.filter((t) => t.variable === key).length;
  const views = project.saved_views.filter((v) => {
    const m = v.map;
    return (
      m.layer === key ||
      (m.edgeColour.kind !== 'groups' &&
        m.edgeColour.kind !== 'none' &&
        m.edgeColour.layer === key) ||
      (m.edgeWidth.kind === 'layer' && m.edgeWidth.layer === key) ||
      key in v.weights.custom
    );
  }).length;
  const surveys = project.surveys.filter((s) =>
    s.versions.some((ver) => ver.layers.some((l) => l.key === key)),
  ).length;
  return { ratings, views, surveys };
}

/** Whether a built-in layer of this key exists (one the Layers section can add back). */
export function isBuiltinKey(key: LayerKey): boolean {
  return builtinLayer(key) !== undefined;
}

/** Layers with any of the roles, in project order. */
export function layersWithRole(
  layers: readonly LayerDefinition[],
  ...roles: readonly LayerRole[]
): LayerDefinition[] {
  return layers.filter((l) => roles.includes(layerRole(l)));
}

function rated(project: Pick<Project, 'ties'>, key: LayerKey): boolean {
  return project.ties.some(
    (t) => t.variable === key && t.wave === DEFAULT_WAVE && typeof t.value === 'number',
  );
}

/**
 * The layer that stands for a role where one layer is needed (the question
 * catalogue, the map's opening layer, the formal–informal comparison):
 * among unsigned scaled layers of the role, the built-in layer of that role
 * when it is enabled and rated, else the first that is, else the first
 * enabled, else the first present. Undefined when the project has none.
 */
export function relationForRole(
  project: Pick<Project, 'layers' | 'ties'>,
  role: LayerRole,
): LayerDefinition | undefined {
  const candidates = project.layers.filter(
    (l) => layerRole(l) === role && !l.signed && l.scale_type !== 'categorical',
  );
  const usable = (l: LayerDefinition) => l.enabled && rated(project, l.key);
  return (
    candidates.find((l) => l.builtin && usable(l)) ??
    candidates.find(usable) ??
    candidates.find((l) => l.enabled) ??
    candidates[0]
  );
}

/** The built-in layer of a role, for naming a relation the project lacks. */
export function builtinForRole(role: LayerRole): LayerDefinition | undefined {
  return defaultLayers().find((l) => layerRole(l) === role && !l.signed);
}

/**
 * The signed layer edge colour shows by default: valence when it is enabled,
 * else the first enabled signed layer whose role is affect, else undefined.
 */
export function defaultColourLayer(project: Pick<Project, 'layers'>): LayerDefinition | undefined {
  const signed = project.layers.filter((l) => l.enabled && l.signed);
  return signed.find((l) => l.key === 'valence') ?? signed.find((l) => layerRole(l) === 'affect');
}
