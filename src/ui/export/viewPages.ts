// The saved views a report shows (build plan session 10): for each, the
// analysis the view asks for (its weights, view, rule and analysis options),
// the export context built from it under the same settings as every other
// export (names, the signed-layer exclusion, the audience level), and the map
// state that draws it at its saved positions.

import type { Project, SavedView } from '../../data/schema';
import { buildAnalysisInput } from '../engineClient';
import { layoutRequest } from '../map/useMapModel';
import { viewGrouping } from '../state/audience';
import { effectiveWeights, type WeightState } from '../state/presets';
import { analysisOptions } from '../state/remedies';
import { savedToMap } from '../state/savedViews';
import { exportContext, type Analyse, type ExportContext, type ExportRequest } from './context';
import { exclusionApplies } from './scope';
import type { MapState } from './mapScene';

export interface ViewSource {
  view: SavedView;
  ctx: ExportContext;
  state: MapState;
}

/** The chosen views in presentation order (the project's order); null chooses every view. */
export function chosenViews(project: Project, ids: readonly string[] | null): SavedView[] {
  return ids === null ? project.saved_views : project.saved_views.filter((v) => ids.includes(v.id));
}

export async function viewSources(
  request: ExportRequest,
  views: readonly SavedView[],
  analyse: Analyse,
): Promise<ViewSource[]> {
  const { project } = request;
  const out: ViewSource[] = [];
  for (const view of views) {
    const map = savedToMap(view.map, project);
    const weights: WeightState = {
      preset: view.weights.preset,
      custom: { ...view.weights.custom },
      customTreatment: { ...view.weights.customTreatment },
    };
    // With the exclusion the export context runs its own analysis, so none is run here.
    let result = request.result;
    if (!exclusionApplies(project, request.excludeSigned)) {
      const w = effectiveWeights(project, weights);
      result = await analyse(
        buildAnalysisInput(
          project,
          {
            view: map.view,
            symmetrise: map.symmetrise,
            ...analysisOptions(map),
            weights: w.weights,
            signedTreatment: w.signedTreatment,
          },
          `report-view:${view.id}`,
        ),
      );
    }
    const ctx = await exportContext(
      { ...request, result, map, weights, grouping: viewGrouping(project, map) },
      analyse,
    );
    // Saved positions are used as they are when every member has one; otherwise the layout runs.
    const positions: Partial<Record<string, SavedView['positions'][string]>> = view.positions;
    const points = ctx.project.members.map((m) => positions[m.id] ?? null);
    const complete = points.every((p) => p !== null);
    const revision = 0;
    const state: MapState = {
      positions: complete ? points : null,
      layoutKey: complete
        ? layoutRequest(ctx.project, ctx.result, ctx.settings, revision, ctx.names).key
        : null,
      viewport: null,
      revision,
      group: view.selection.group,
      path: null,
    };
    out.push({ view, ctx, state });
  }
  return out;
}
