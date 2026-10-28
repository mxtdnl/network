// The ranked bars of incoming ties (build plan session 7): which layers they
// can show and the rows they draw. Pure, so it can be tested without the DOM.

import { layersWithRole } from '../../data/relations';
import type { Project } from '../../data/schema';
import type { AnalysisResult } from '../engineClient';
import type { MapModel } from '../map/model';
import { drawableLayers } from '../map/useMapModel';

/** Layers with incoming ties: the composite, each unsigned layer and each signed layer's positive ratings. */
/** Keys of the unsigned layers whose role is advice, then dependency, in project order. */
export function demandLayerKeys(project: Project): string[] {
  const unsigned = project.layers.filter((l) => !l.signed);
  return [
    ...layersWithRole(unsigned, 'advice').map((l) => l.key),
    ...layersWithRole(unsigned, 'dependency').map((l) => l.key),
  ];
}

export function incomingLayers(project: Project, result: AnalysisResult): string[] {
  const drawable = drawableLayers(project, result);
  const positive = result.refOrder.filter((ref) => result.refs[ref]?.kind === 'positive');
  return [...drawable, ...positive].filter((ref) => result.refs[ref]?.load);
}

/**
 * The layer shown: the chosen one when present, else the layers whose role is
 * advice, then dependency (build plan session 11; by default advice and
 * workflow dependency), then "Ties from".
 */
export function incomingLayer(
  layers: readonly string[],
  chosen: string | null,
  tiesFrom: string,
  preferred: readonly string[] = ['advice', 'workflow_dependency'],
): string | null {
  for (const key of [chosen, ...preferred, tiesFrom]) if (key && layers.includes(key)) return key;
  return layers[0] ?? null;
}

export interface IncomingRow {
  index: number;
  id: string;
  incoming: number;
  /** Share of every tie received on the layer, by all members. */
  share: number;
  /** Among the members who receive most ties overall (the top 10 %, RefResult.load). */
  top: boolean;
  /** Bar length as a share of the longest bar shown, 0–1. */
  bar: number;
}

/**
 * One row per member the map shows (filters and ego view apply), most ties
 * received first, then in member order; shares are of every tie received on
 * the layer, so they do not change with the filters.
 */
export function incomingRows(
  project: Project,
  result: AnalysisResult,
  layer: string,
  model: MapModel,
): IncomingRow[] {
  const load = result.refs[layer]?.load;
  if (!load) return [];
  const top = new Set(load.overall.top);
  const rows = model.nodes
    .filter((n) => n.visible)
    .map((n) => {
      const incoming = load.incoming[n.index] ?? 0;
      return {
        index: n.index,
        id: project.members[n.index]?.id ?? '',
        incoming,
        share: load.overall.received > 0 ? incoming / load.overall.received : 0,
        top: top.has(n.index),
        bar: 0,
      };
    })
    .sort((a, b) => b.incoming - a.incoming || a.index - b.index);
  const longest = rows[0]?.incoming ?? 0;
  for (const r of rows) r.bar = longest > 0 ? r.incoming / longest : 0;
  return rows;
}
