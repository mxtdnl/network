// The data every export is built from: the project and analysis after the
// signed-layer exclusion, the map settings that apply to them, and the names
// layer under the anonymisation setting. Building this is the one place both
// settings are applied, so no export can skip either (spec §11).

import type { Project } from '../../data/schema';
import type { AnalysisInput, AnalysisResult } from '../engineClient';
import { buildAnalysisInput } from '../engineClient';
import { effectiveSettings } from '../map/useMapModel';
import type { MemberNames } from '../state/names';
import { effectiveWeights, type WeightState } from '../state/presets';
import type { Grouping, MapSettings } from '../state/store';
import { exclusionApplies, exportProject } from './scope';
import { analysisOptions } from '../state/remedies';
import {
  audiencePolicy,
  workshopMap,
  type AudienceChoice,
  type AudiencePolicy,
} from '../state/audience';

/** Runs one analysis; the browser uses a worker of its own, tests call the engine directly. */
export type Analyse = (input: AnalysisInput) => Promise<AnalysisResult>;

export interface ExportRequest {
  /** The open project. */
  project: Project;
  /** The analysis on screen. */
  result: AnalysisResult;
  map: MapSettings;
  weights: WeightState;
  anonymise: boolean;
  excludeSigned: boolean;
  /** The Groups view's grouping, which the report's mixing table follows (D154); absent follows the default. */
  grouping?: Grouping | null;
  /** Who the export is for (build plan session 9); absent means the analyst, unrestricted. */
  audience?: AudienceChoice;
}

export interface ExportContext {
  /** The open project, for figures the exclusion does not touch (survey response rates). */
  source: Project;
  /** The project the export shows: without the excluded layers when the exclusion applies. */
  project: Project;
  result: AnalysisResult;
  /** Map settings corrected for the export's analysis. */
  settings: MapSettings;
  /** Names under the audience policy: anyone the audience may not see is "a colleague". */
  names: MemberNames;
  /** Members appear as codes (Hide names, or a workshop whose team has not agreed to be named). */
  anonymised: boolean;
  /** The audience level's policy (build plan session 9). */
  policy: AudiencePolicy;
  /** The exclusion is on (whether or not the project has layers it removes). */
  excludeSigned: boolean;
  /** The exclusion removed at least one enabled layer, so the analysis was run again. */
  reanalysed: boolean;
  /** The exclusion removed the layer edge colour shows, so the map draws no colour and the legend says why (D126). */
  colourExcluded: boolean;
  weights: ReturnType<typeof effectiveWeights>;
  weightsPreset: WeightState['preset'];
  /** The grouping the report's mixing table uses (D154). */
  grouping: Grouping | null;
}

export async function exportContext(
  request: ExportRequest,
  analyse: Analyse,
): Promise<ExportContext> {
  const { project: source, anonymise, excludeSigned } = request;
  const reanalysed = exclusionApplies(source, excludeSigned);
  const project = exportProject(source, excludeSigned);
  const weights = effectiveWeights(project, request.weights);
  let result = request.result;
  let map = request.map;
  const colour = request.map.edgeColour;
  const colourExcluded =
    reanalysed &&
    (colour.kind === 'signed' || colour.kind === 'unsigned') &&
    !project.layers.some((l) => l.key === colour.layer) &&
    source.layers.some((l) => l.key === colour.layer && l.enabled);
  if (reanalysed) {
    const input = buildAnalysisInput(
      project,
      {
        view: map.view,
        symmetrise: map.symmetrise,
        ...analysisOptions(map),
        weights: weights.weights,
        signedTreatment: weights.signedTreatment,
      },
      `export:${request.result.inputKey}`,
    );
    result = await analyse(input);
    // A highlight may come from an insight on a removed layer (negative
    // clusters), so the members it names could reveal signed ratings.
    map = { ...map, highlight: [] };
  }
  // Codes and names depend only on the members, which the exclusion keeps.
  const policy = audiencePolicy(
    source,
    request.audience ?? { level: 'analyst', team: null, member: null },
    anonymise,
  );
  return {
    source,
    project,
    result,
    // A team workshop shows the team only, without signed layers (build plan session 9).
    settings: workshopMap(effectiveSettings(project, result, map), policy),
    names: policy.names,
    anonymised: policy.codes,
    policy,
    excludeSigned,
    reanalysed,
    colourExcluded,
    weights,
    weightsPreset: request.weights.preset,
    grouping: request.grouping ?? null,
  };
}
