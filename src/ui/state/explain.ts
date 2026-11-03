// "Explain this view" (build plan session 16): a plain description of the map on screen, built
// from the same map model and legend data the map draws from, so it describes exactly what is
// drawn. Also names the notes for readers (method notes §19) that explain its terms.

import { engagementCopy as E } from '../copy/engagement';
import { mapCopy } from '../copy/map';
import { metricCopy } from '../copy/metrics';
import { compositeStatement } from '../copy/questions';
import { legendSections, type LegendRadii } from '../map/legend';
import type { MapData } from '../map/useMapModel';

const X = E.explain;
const lowerFirst = (s: string) => (s === '' ? s : `${s.charAt(0).toLowerCase()}${s.slice(1)}`);

/** Headings of method notes §19 that explain each term the view uses. */
const TERMS = {
  layers: 'Kinds of relationship',
  directions: 'Directions',
  connections: 'Connections in and out',
  bridging: 'Bridging',
  clusters: 'Clusters',
  bridges: 'Bridge ties and cut points',
  negative: 'Negative ratings',
  formalInformal: 'Formal and informal collaboration',
  groups: 'Ties within and between groups',
} as const;

export interface Explanation {
  sentences: string[];
  /** Headings of the notes for readers to show beside the sentences, in order. */
  terms: string[];
}

export function explainView(
  data: MapData,
  radii: LegendRadii,
  memberName: (index: number) => string,
): Explanation {
  const { mapModel: m, settings, project } = data;
  const terms = new Set<string>();
  const out: string[] = [];
  const shown = m.nodes.filter((n) => n.visible).length;
  out.push(X.members(shown, m.n));
  if (settings.filters.length > 0) {
    const label = (key: string) =>
      lowerFirst(project.attribute_definitions.find((a) => a.key === key)?.label ?? key);
    out.push(
      X.filters(
        settings.filters.map((f) => `${label(f.key)} ${f.values.join(' or ')}`).join(', and '),
      ),
    );
  }
  if (m.ego) out.push(X.ego(memberName(m.ego.index), m.ego.depth));
  if (m.removed > 0) out.push(X.removed(m.removed));

  const visible = new Set(m.nodes.filter((n) => n.visible).map((n) => n.index));
  const drawn = m.edges.filter((e) => visible.has(e.source) && visible.has(e.target)).length;
  const layer = m.edgeLayer === 'composite' ? mapCopy.controls.composite : m.edgeLayerLabel;
  if (m.directed) out.push(X.tiesDirected(lowerFirst(layer), drawn));
  else
    out.push(X.tiesMutual(lowerFirst(layer), drawn, mapCopy.controls[m.symmetrise].toLowerCase()));
  terms.add(TERMS.directions);
  if (m.composite) {
    out.push(X.composite(compositeStatement(m.composite)));
    terms.add(TERMS.layers);
  }
  const from = m.threshold > 0;
  const to = m.thresholdTo < 1;
  const f = (x: number) => x.toFixed(2);
  if (from && to) out.push(X.range(f(m.threshold), f(m.thresholdTo)));
  else if (from) out.push(X.rangeFrom(f(m.threshold)));
  else if (to) out.push(X.rangeTo(f(m.thresholdTo)));
  if (m.hiddenLabels.length > 0) out.push(X.hiddenLayers(m.hiddenLabels.join(', ')));
  if (m.negativeOutsideRange) out.push(X.negative);

  const metric = m.size.metric;
  out.push(X.size(lowerFirst(metricCopy[metric].label), m.size.scale === 'rank'));
  if (metric === 'betweenness') terms.add(TERMS.bridging);
  if (/(in|out)?(Strength|Degree)|^strength$|^degree$|harmonic/.test(metric))
    terms.add(TERMS.connections);
  if (m.fill.kind === 'community') {
    out.push(X.fillCommunity);
    terms.add(TERMS.clusters);
  } else out.push(X.fillAttribute(lowerFirst(m.fill.label)));

  const sections = legendSections(m, radii);
  const width = sections.find((s) => s.kind === 'width');
  if (m.width.kind === 'uniform') out.push(X.widthUniform);
  else if (width) out.push(X.width(lowerFirst(width.variable)));
  const colour = sections.find((s) => s.kind === 'colour');
  if (m.colour.kind === 'none' || !colour) out.push(X.colourNone);
  else {
    out.push(X.colour(lowerFirst(colour.variable)));
    if (m.colour.kind === 'signed') terms.add(TERMS.negative);
    if (m.colour.kind === 'groups') terms.add(TERMS.groups);
  }
  if (m.styleShown) {
    out.push(X.style);
    terms.add(TERMS.formalInformal);
  }

  const layout = settings.layout;
  const by = lowerFirst(
    project.attribute_definitions.find((a) => a.key === settings.groupBy)?.label ?? '',
  );
  if (layout === 'grouped') out.push(X.layout.grouped(by));
  else if (layout === 'circular') out.push(X.layout.circular(by));
  else if (layout === 'hierarchy') out.push(X.layout.hierarchy);
  else out.push(X.layout.force);
  if (m.outlines) {
    out.push(X.outlines);
    terms.add(TERMS.clusters);
  }
  if (m.markBridges) {
    out.push(X.bridges(m.bridges));
    terms.add(TERMS.bridges);
  }
  if (m.highlighted && m.highlighted.size > 0) out.push(X.highlight(m.highlighted.size));
  // Notes on the map (build plan session 17) are the analyst's, not the data's.
  if (m.annotations.length > 0) out.push(X.notes(m.annotations.length));
  if (m.wave) out.push(X.wave(m.wave.wave));
  return { sentences: out, terms: [...terms] };
}
