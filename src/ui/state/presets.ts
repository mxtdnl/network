// Composite weighting presets (spec §7) and the weights the engine receives.
// A preset names raw slider values for the layers it uses; every other
// enabled layer gets 0 and is left out of the composite. The engine
// normalises the weights of the summed layers to 1 (docs/method-notes.md §6),
// so only the proportions matter. Under Custom the analyst's own slider
// values apply, and a layer without one uses its default weight; a signed
// layer without a chosen treatment is a multiplier on the composite.

import {
  isCategorical,
  layerRole,
  type LayerKey,
  type LayerRole,
  type Project,
} from '../../data/schema';

export type Preset = 'formal' | 'informal' | 'health' | 'custom';
export type SignedTreatment = 'positive' | 'filterNegative' | 'multiplier';

export const PRESETS: readonly Preset[] = ['formal', 'informal', 'health', 'custom'];

// A signed layer whose treatment neither the analyst nor a preset chose
// adjusts the composite's ties rather than adding ties of its own, so a
// positive valence rating alone does not create a tie (CLAUDE.md D130).
export const DEFAULT_SIGNED_TREATMENT: SignedTreatment = 'multiplier';

interface PresetDefinition {
  /** Raw weight of every unsigned layer of each role; roles not named get 0. */
  roles: Partial<Record<LayerRole, number>>;
  /** Signed layers whose role is affect: the first in layer order, and every other. */
  affect?: {
    first: { weight: number; treatment: SignedTreatment };
    others: { weight: number; treatment: SignedTreatment };
  };
}

// One rule for every preset: the defining role has twice the raw weight of
// each supporting role. Presets read roles, not keys (build plan session 11),
// so a relation the analyst created takes part through its role, and every
// layer of a role gets the role's weight. Relationship health uses the first
// signed affect layer (valence, when enabled) as a multiplier, so negative
// ratings lower the composite rather than being ignored; its weight only
// switches it on. Further signed affect layers (energy) count their positive
// ratings.
export const PRESET_DEFINITIONS: Record<Exclude<Preset, 'custom'>, PresetDefinition> = {
  // Ties required by role, process or reporting line.
  formal: { roles: { formal: 0.4, dependency: 0.2 } },
  // Collaboration and help that happen outside formal channels.
  informal: { roles: { informal: 0.4, advice: 0.2, ideas: 0.2 } },
  // The quality of relationships: valence scales the composite, which sums
  // connection strength, positive energy and, where collected, trust and safety.
  health: {
    roles: { connection: 0.2, trust: 0.2, affect: 0.2 },
    affect: {
      first: { weight: 0.4, treatment: 'multiplier' },
      others: { weight: 0.2, treatment: 'positive' },
    },
  },
};

/** A preset's raw weight and, for signed layers, treatment for each weighted layer. */
export function presetWeights(
  preset: Exclude<Preset, 'custom'>,
  project: Project,
): { weights: Record<LayerKey, number>; treatment: Record<LayerKey, SignedTreatment> } {
  const def = PRESET_DEFINITIONS[preset];
  const weights: Record<LayerKey, number> = {};
  const treatment: Record<LayerKey, SignedTreatment> = {};
  let firstAffect = true;
  for (const layer of weightedLayers(project)) {
    const role = layerRole(layer);
    if (layer.signed) {
      if (role === 'affect' && def.affect) {
        const t = firstAffect ? def.affect.first : def.affect.others;
        firstAffect = false;
        weights[layer.key] = t.weight;
        treatment[layer.key] = t.treatment;
      } else weights[layer.key] = 0;
    } else weights[layer.key] = def.roles[role] ?? 0;
  }
  return { weights, treatment };
}

export interface WeightState {
  preset: Preset;
  /** Raw slider values under Custom; layers without an entry use their default weight. */
  custom: Record<LayerKey, number>;
  customTreatment: Record<LayerKey, SignedTreatment>;
}

export function initialWeightState(): WeightState {
  return { preset: 'custom', custom: {}, customTreatment: {} };
}

/** Enabled layers that take part in the composite (the engine's layers). */
export function weightedLayers(project: Project) {
  return project.layers.filter((l) => l.enabled && !isCategorical(l));
}

/** Raw weights and signed treatments for every weighted layer, as sent to the engine. */
export function effectiveWeights(
  project: Project,
  state: WeightState,
): { weights: Record<LayerKey, number>; signedTreatment: Record<LayerKey, SignedTreatment> } {
  const weights: Record<LayerKey, number> = {};
  const signedTreatment: Record<LayerKey, SignedTreatment> = {};
  const preset = state.preset === 'custom' ? null : presetWeights(state.preset, project);
  for (const layer of weightedLayers(project)) {
    weights[layer.key] = preset
      ? (preset.weights[layer.key] ?? 0)
      : (state.custom[layer.key] ?? layer.default_weight);
    if (layer.signed) {
      signedTreatment[layer.key] =
        (preset ? preset.treatment[layer.key] : state.customTreatment[layer.key]) ??
        DEFAULT_SIGNED_TREATMENT;
    }
  }
  return { weights, signedTreatment };
}

/** A stable text form of the weights, part of the analysis input key. */
export function weightsKey(w: ReturnType<typeof effectiveWeights>): string {
  const keys = Object.keys(w.weights).sort();
  return keys
    .map(
      (k) =>
        `${k}=${String(w.weights[k])}${w.signedTreatment[k] ? `/${w.signedTreatment[k]}` : ''}`,
    )
    .join(',');
}
