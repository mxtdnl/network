// What an export may contain (spec §10, §11). Two settings apply to every
// analysis export: anonymisation (names become codes, through the names layer)
// and the signed-layer exclusion, which leaves the sensitive layers out
// altogether: every signed layer, and every layer whose role is affect or
// friction whatever its scale (CLAUDE.md D105, by role since build plan
// session 11). The conflict sub-layers are frequencies rather than signed
// scales but carry the same negative content, and their role is friction.
//
// The exclusion works on the project, not on the finished output: the layers
// and their ratings are removed and the analysis is run again, so the
// composite, the communities, the insights and every figure derived from them
// are computed as if those layers had never been collected.

import { EXCLUDED_ROLES, layerRole, type LayerDefinition, type Project } from '../../data/schema';

/** A layer the exclusion removes: a signed layer, or one whose role is affect or friction. */
export function isExcludable(layer: LayerDefinition): boolean {
  return layer.signed || EXCLUDED_ROLES.includes(layerRole(layer));
}

/** Layers of the project the exclusion removes (enabled or not). */
export function excludedLayers(project: Project): LayerDefinition[] {
  return project.layers.filter(isExcludable);
}

/** True when the exclusion changes what an export contains: an excludable layer is enabled. */
export function exclusionApplies(project: Project, excludeSigned: boolean): boolean {
  return excludeSigned && project.layers.some((l) => l.enabled && isExcludable(l));
}

/**
 * The project an export is built from. With the exclusion on, excludable
 * layers and every rating on them are removed, so no label, rating or derived
 * figure of theirs can reach the export. Surveys are dropped as well: their
 * versions carry the removed layers' questions, and an analysis export never
 * needs them (response rates are read from the original project).
 */
export function exportProject(project: Project, excludeSigned: boolean): Project {
  if (!excludeSigned || !project.layers.some(isExcludable)) return project;
  const removed = new Set(excludedLayers(project).map((l) => l.key));
  return {
    ...project,
    layers: project.layers.filter((l) => !removed.has(l.key)),
    ties: project.ties.filter((t) => !removed.has(t.variable)),
    surveys: [],
  };
}
