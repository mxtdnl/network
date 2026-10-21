// Applying an insight's view configuration (spec §9: each observation "links
// to the view that shows it"). The engine names the ties to draw, the node
// size, the layout, filters and the members to highlight; this turns them
// into map settings. Weights and the analysis view stay as they are, because
// the observation was computed with them.

import type { InsightView, Observation } from '../engineClient';
import { insightsCopy, questionText, type InsightContext } from '../copy/insights';
import { saveCurrentView, setViewCaption } from './savedViews';
import type { Project } from '../../data/schema';
import { metricForView, useAppStore, type MapSettings, type SizeMetric } from './store';

/**
 * The encodings an insight switches on (CLAUDE.md D126): a signed layer it
 * shows becomes the edge colour, and the formal and informal layers together
 * become the edge style. Other encodings stay as the analyst set them.
 */
function insightEncodings(view: InsightView, project: Project | null): Partial<MapSettings> {
  const layers = project?.layers ?? [];
  const shown = layers.filter((l) => view.show.includes(l.key));
  const signed = shown.find((l) => l.signed);
  const style =
    shown.some((l) => l.role === 'formal' && !l.signed) &&
    shown.some((l) => l.role === 'informal' && !l.signed);
  return {
    ...(signed ? { edgeColour: { kind: 'signed', layer: signed.key } } : {}),
    ...(style ? { edgeStyle: 'formalInformal' } : {}),
  };
}

export function insightMapPatch(
  view: InsightView,
  map: MapSettings,
  project: Project | null = null,
): Partial<MapSettings> {
  // A layer the insight shows is switched on, so its ties are drawn when switched-off layers hide them.
  const toggles = { ...map.layerToggles };
  for (const key of view.show) toggles[key] = true;
  return {
    ...insightEncodings(view, project),
    layer: view.layer,
    sizeMetric: metricForView(view.sizeMetric as SizeMetric, map.view),
    layout: view.layout,
    groupBy: view.groupBy ?? map.groupBy,
    filters: view.filters.map((f) => ({ key: f.key, values: [...f.values] })),
    highlight: [...view.highlight],
    layerToggles: toggles,
    ego: null,
    search: '',
  };
}

export function showInsight(o: Observation): void {
  const s = useAppStore.getState();
  s.setMap(insightMapPatch(o.view, s.map, s.data.project));
  s.setTools({ path: null });
  s.setCentreView('map');
  s.setStatus({ text: insightsCopy.shown(insightsCopy.titles[o.rule]), tone: 'info' });
}

/** Shows the insight, then saves the map as a view captioned with the insight's question. */
export function saveInsightAsView(o: Observation, ctx: InsightContext): void {
  showInsight(o);
  // Positions are captured once the map has drawn the new configuration.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const view = saveCurrentView(insightsCopy.titles[o.rule]);
      if (view) setViewCaption(view.id, questionText(o, ctx));
    });
  });
}
