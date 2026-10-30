// Data remedies (build plan session 5; docs/method-notes.md §14): the four
// analysis options that counter what "Check the data" shows, and their
// previews. A preview runs the analysis on screen again with one option
// switched, on a worker of its own (as the export exclusion does, D105), and
// compares the insight observations, so the analyst sees what an option would
// change before applying it. The comparison is structure; wording is in
// ui/copy/remedies.ts.

import { isCategorical, isMutualLayer, type Project } from '../../data/schema';
import {
  buildAnalysisInput,
  type AnalysisInput,
  type AnalysisOptions,
  type AnalysisResult,
  type InsightOutcome,
  type InsightRuleId,
  type Observation,
} from '../engineClient';
import { effectiveWeights, type WeightState } from './presets';
import type { MapSettings } from './store';

export type RemedyId = 'bothReport' | 'leaveOut' | 'reconstruct' | 'standardise';

export const REMEDY_ORDER: readonly RemedyId[] = [
  'bothReport',
  'leaveOut',
  'reconstruct',
  'standardise',
];

/** The analysis options in the map settings that the engine reads. */
export function analysisOptions(
  map: Pick<MapSettings, 'nonRespondents' | 'reconstruct' | 'standardise'> &
    Partial<Pick<MapSettings, 'wave'>>,
): Pick<AnalysisOptions, 'nonRespondents' | 'reconstruct' | 'standardise' | 'wave'> {
  return {
    nonRespondents: map.nonRespondents,
    reconstruct: map.reconstruct,
    standardise: map.standardise,
    wave: map.wave ?? null,
  };
}

/** The remedies an analysis was run with, in panel order (for exports). */
export function appliedRemedies(result: AnalysisResult): RemedyId[] {
  const on: Record<RemedyId, boolean> = {
    bothReport: result.view === 'symmetrised' && result.symmetrise === 'both',
    leaveOut: result.remedies.nonRespondents === 'leaveOut',
    reconstruct: result.remedies.reconstruct,
    standardise: result.remedies.standardise === 'rank',
  };
  return REMEDY_ORDER.filter((id) => on[id]);
}

/** Whether the option is applied in these settings. */
export function remedyOn(id: RemedyId, map: MapSettings): boolean {
  switch (id) {
    case 'bothReport':
      return map.view === 'symmetrised' && map.symmetrise === 'both';
    case 'leaveOut':
      return map.nonRespondents === 'leaveOut';
    case 'reconstruct':
      return map.reconstruct;
    case 'standardise':
      return map.standardise === 'rank';
  }
}

/**
 * The settings with the option switched. Switching "Both report a tie" on
 * moves to the mutual view; switching it off keeps the mutual view, combined
 * by the average.
 */
export function toggleRemedy(id: RemedyId, map: MapSettings): Partial<MapSettings> {
  const on = remedyOn(id, map);
  switch (id) {
    case 'bothReport':
      return on ? { symmetrise: 'mean' } : { view: 'symmetrised', symmetrise: 'both' };
    case 'leaveOut':
      return { nonRespondents: on ? 'mark' : 'leaveOut' };
    case 'reconstruct':
      return { reconstruct: !on };
    case 'standardise':
      return { standardise: on ? 'none' : 'rank' };
  }
}

export type RemedyAvailability =
  'available' | 'everyoneAnswered' | 'noMutualLayer' | 'noUnsignedLayer' | 'noLayers';

/** Whether the option can change anything in this project, and why not. */
export function remedyAvailability(
  id: RemedyId,
  project: Project,
  result: AnalysisResult | null,
): RemedyAvailability {
  const layers = project.layers.filter((l) => l.enabled && !isCategorical(l));
  if (layers.length === 0) return 'noLayers';
  const silent = (result?.ratingFlags ?? []).some((f) => f === 'gaveNoRatings');
  switch (id) {
    case 'bothReport':
      return 'available';
    case 'leaveOut':
      return silent ? 'available' : 'everyoneAnswered';
    case 'reconstruct':
      if (!layers.some(isMutualLayer)) return 'noMutualLayer';
      return silent ? 'available' : 'everyoneAnswered';
    case 'standardise':
      return layers.some((l) => !l.signed) ? 'available' : 'noUnsignedLayer';
  }
}

/** One observation, as the preview compares it: the rule, layer, group and members. */
export function observationKey(o: Observation): string {
  const group = o.group ? `${o.group.value}/${o.group.other ?? ''}` : '';
  return `${o.rule}|${o.ref}|${group}|${[...o.members].sort().join(',')}`;
}

export interface RuleChange {
  rule: InsightRuleId;
  before: InsightOutcome;
  after: InsightOutcome;
  /** Observations only before, and only after the option. */
  removed: Observation[];
  added: Observation[];
}

/** The rules whose outcome the option changes, in panel order. */
export function compareInsights(
  before: readonly InsightOutcome[],
  after: readonly InsightOutcome[],
): RuleChange[] {
  const changes: RuleChange[] = [];
  for (const b of before) {
    const a = after.find((x) => x.rule === b.rule);
    if (!a) continue;
    const bk = new Set(b.observations.map(observationKey));
    const ak = new Set(a.observations.map(observationKey));
    const removed = b.observations.filter((o) => !ak.has(observationKey(o)));
    const added = a.observations.filter((o) => !bk.has(observationKey(o)));
    const statusChanged =
      b.status !== a.status ||
      (b.status === 'unavailable' && a.status === 'unavailable' && b.reason !== a.reason);
    if (removed.length > 0 || added.length > 0 || statusChanged)
      changes.push({ rule: b.rule, before: b, after: a, removed, added });
  }
  return changes;
}

export interface RemedyPreview {
  id: RemedyId;
  /** The settings the preview ran with. */
  settings: MapSettings;
  result: AnalysisResult;
  changes: RuleChange[];
  /** Composite ties before and after (in each view's own count), when there is a composite. */
  ties: { before: number; after: number } | null;
  /** Directions reconstructed in the preview, over every layer. */
  reconstructed: number;
}

export type Analyse = (input: AnalysisInput) => Promise<AnalysisResult>;

/** The analysis input for a project under map settings and weights, as the analysis on screen builds it. */
export function previewInput(
  project: Project,
  map: MapSettings,
  weights: WeightState,
  key: string,
): AnalysisInput {
  const w = effectiveWeights(project, weights);
  return buildAnalysisInput(
    project,
    {
      view: map.view,
      symmetrise: map.symmetrise,
      ...analysisOptions(map),
      weights: w.weights,
      signedTreatment: w.signedTreatment,
    },
    key,
  );
}

/**
 * Runs the analysis with one option switched and compares it with `current`,
 * the analysis on screen for `map`.
 */
export async function previewRemedy(
  id: RemedyId,
  project: Project,
  map: MapSettings,
  weights: WeightState,
  current: AnalysisResult,
  analyse: Analyse,
): Promise<RemedyPreview> {
  const settings = { ...map, ...toggleRemedy(id, map) };
  const result = await analyse(
    previewInput(project, settings, weights, `preview:${id}:${current.inputKey}`),
  );
  const before = current.refs.composite?.network.ties;
  const after = result.refs.composite?.network.ties;
  return {
    id,
    settings,
    result,
    changes: compareInsights(current.insights, result.insights),
    ties: before === undefined || after === undefined ? null : { before, after },
    reconstructed: Object.values(result.reconstructed).reduce((s, p) => s + p.length, 0),
  };
}
