// Legend content derived from the map model, so the legend always shows the
// encodings in use (spec §8: every encoding is explained in a persistent
// legend). Pure data: the on-screen legend renders it, and the Phase 7 SVG
// and PNG exports will compose the same entries.

import { formatScale, formatValue, formatWeight, mapCopy } from '../copy/map';
import { metricCopy } from '../copy/metrics';
import { remediesCopy } from '../copy/remedies';
import type { EdgeStyle, MapModel } from './model';

const L = mapCopy.legend;

export type LegendSection =
  | {
      kind: 'size';
      title: string;
      variable: string;
      samples: { radius: number; label: string }[];
      notDefined: { radius: number; label: string } | null;
    }
  | {
      kind: 'fill';
      title: string;
      variable: string;
      /** hue: palette index, or -1 for the grey used by "Other" and "Not recorded" (dashed outline). */
      items: { hue: number; label: string }[];
    }
  | {
      kind: 'width';
      title: string;
      variable: string;
      samples: { width: number; label: string }[];
      /** A tie with no rating on the width layer: the thinnest width, in stone (D126). */
      notRated: { width: number; label: string } | null;
      notes: string[];
    }
  | {
      kind: 'colour';
      title: string;
      variable: string;
      /** A colour scale drawn as a ramp, with labels under its start, middle (optional) and end. */
      ramp: { swatches: Swatch[]; labels: [string, string | null, string] } | null;
      /** Single colours, drawn as line samples. */
      items: { colour: 'stone' | 'graphite'; label: string }[];
    }
  | { kind: 'style'; title: string; variable: string; items: { style: EdgeStyle; label: string }[] }
  | {
      kind: 'arrows';
      title: string;
      variable: string;
      /** One way: a line with an arrowhead; both ways: a plain line (CLAUDE.md D131). */
      items: { arrow: boolean; label: string }[];
    }
  | { kind: 'position'; title: string; variable: string; reportingLines: string | null }
  | {
      kind: 'marks';
      title: string;
      variable: string;
      items: { mark: 'group' | 'path' | 'highlight' | 'outline' | 'hollow'; label: string }[];
    };

/** A step of a colour scale: the valence scale (−3 … +3) or the sequential ramp (1 … 5). */
export type Swatch = { scale: 'valence'; step: number } | { scale: 'ramp'; step: number };

/** Layout and selection marks the legend explains besides the encodings. */
export interface LegendExtras {
  layout: 'force' | 'grouped' | 'circular' | 'hierarchy';
  /** Label of the attribute the grouped or circular layout uses. */
  groupBy: string;
  group: number;
  path: boolean;
  /** Members highlighted by an insight or a saved view. */
  highlight?: number;
}

export interface LegendRadii {
  nodeMin: number;
  nodeMax: number;
  nodeUndefined: number;
  edgeMin: number;
  edgeMax: number;
}

export function layerName(model: MapModel): string {
  return model.layer === 'composite' ? mapCopy.controls.composite : model.layerLabel;
}

export function legendSections(
  model: MapModel,
  r: LegendRadii,
  extras: LegendExtras | null = null,
): LegendSection[] {
  const sections: LegendSection[] = [];
  const { lo, hi } = model.size;
  const defined = Number.isFinite(lo) && Number.isFinite(hi);
  const mid = (lo + hi) / 2;
  const radiusAt = (t: number) => Math.sqrt(r.nodeMin ** 2 + (r.nodeMax ** 2 - r.nodeMin ** 2) * t);
  const metric = metricCopy[model.size.metric].label;
  const byRank = model.size.scale === 'rank';
  // By rank (D134): the smallest member is the lowest rank, the largest rank 1.
  const m = model.size.defined;
  const rankSamples = (): { radius: number; label: string }[] =>
    m > 1
      ? [m, Math.round((m + 1) / 2), 1].map((rank) => ({
          radius: radiusAt((m - rank) / (m - 1)),
          label: L.rank(rank),
        }))
      : [{ radius: radiusAt(0.5), label: L.rank(1) }];
  sections.push({
    kind: 'size',
    title: L.size,
    variable: byRank ? L.byRank(metric) : metric,
    samples: !defined
      ? []
      : byRank
        ? rankSamples()
        : hi > lo
          ? formatScale([lo, mid, hi]).map((label, i) => ({ radius: radiusAt(i / 2), label }))
          : [{ radius: radiusAt(0.5), label: formatValue(lo) }],
    notDefined: model.size.anyUndefined ? { radius: r.nodeUndefined, label: L.notDefined } : null,
  });

  sections.push({
    kind: 'fill',
    title: L.fill,
    variable: model.fill.kind === 'community' ? L.communityOf(layerName(model)) : model.fill.label,
    items: model.fill.groups.map((g) => ({
      hue: g.hue,
      label:
        g.kind === 'value'
          ? g.label
          : g.kind === 'community'
            ? L.community(Number(g.label))
            : g.kind === 'other'
              ? L.other(model.fill.otherGroups)
              : g.kind === 'notRecorded'
                ? L.notRecorded
                : L.noCommunity,
    })),
  });

  // Edge width: the layer the ties are drawn from, another layer, or the same for every tie (D126).
  const tiesFrom = model.edgeLayer === model.layer ? layerName(model) : model.edgeLayerLabel;
  const width = model.width;
  const widthLabel = width.kind === 'layer' ? width.layerLabel : tiesFrom;
  // The tie-strength range: which ties it hides, if any (D141).
  const lower = model.threshold > 0;
  const upper = model.thresholdTo < 1;
  const rangeNote =
    lower && upper
      ? L.thresholdRange(formatWeight(model.threshold), formatWeight(model.thresholdTo))
      : lower
        ? L.threshold(formatWeight(model.threshold))
        : upper
          ? L.thresholdTo(formatWeight(model.thresholdTo))
          : null;
  sections.push({
    kind: 'width',
    title: L.width,
    variable: width.kind === 'uniform' ? L.widthUniform : L.widthScale(widthLabel),
    samples:
      width.kind === 'uniform'
        ? [{ width: r.edgeMin + (r.edgeMax - r.edgeMin) * 0.5, label: L.everyTie }]
        : [0.2, 0.6, 1].map((w) => ({
            width: r.edgeMin + (r.edgeMax - r.edgeMin) * w,
            label: formatWeight(w),
          })),
    notRated:
      width.kind === 'layer' && width.anyMissing
        ? { width: r.edgeMin, label: L.notRatedOn(width.layerLabel) }
        : null,
    notes: [
      ...(width.kind === 'tiesFrom' ? [] : [L.tiesFrom(tiesFrom)]),
      ...(rangeNote ? [rangeNote] : []),
      ...(rangeNote && model.negativeOutsideRange ? [L.negativeOutside] : []),
      ...(model.hiddenLayers.length > 0 ? [L.hiddenLayers(model.hiddenLabels)] : []),
      ...(rangeNote || model.hiddenLayers.length > 0 ? [L.metricsUseAllTies] : []),
      ...(model.standardised ? [remediesCopy.applied.standardise] : []),
      ...(model.reconstructed > 0 ? [remediesCopy.reconstructedNote(model.reconstructed)] : []),
    ],
  });

  sections.push(colourSection(model));

  if (model.styleShown && model.stylesPresent.length > 0) {
    sections.push({
      kind: 'style',
      title: L.style,
      variable: L.styleVariable,
      items: model.stylesPresent.map((style) => ({
        style,
        label:
          style === 'formal'
            ? L.formal
            : style === 'informal'
              ? L.informal
              : style === 'both'
                ? L.both
                : L.neither,
      })),
    });
  }

  if (model.directed && (model.directions.oneWay || model.directions.bothWays)) {
    sections.push({
      kind: 'arrows',
      title: L.arrows,
      variable: '',
      items: [
        ...(model.directions.oneWay ? [{ arrow: true, label: L.oneWay }] : []),
        ...(model.directions.bothWays
          ? [{ arrow: false, label: L.bothWays(L.combinedBy[model.symmetrise]) }]
          : []),
      ],
    });
  }

  if (extras && extras.layout !== 'force') {
    sections.push({
      kind: 'position',
      title: L.position,
      variable:
        extras.layout === 'grouped'
          ? L.groupedBy(extras.groupBy)
          : extras.layout === 'circular'
            ? L.circleBy(extras.groupBy)
            : L.hierarchy,
      reportingLines: extras.layout === 'hierarchy' ? L.reportingLines : null,
    });
  }
  const highlighted = extras?.highlight ?? 0;
  const outlined = model.outlines !== null;
  // Members who gave no ratings are drawn hollow (session 4), whatever else is marked.
  const hollow = model.nodes.some((n) => n.visible && n.noRatings);
  if (outlined || hollow || (extras && (extras.group > 0 || extras.path || highlighted > 0))) {
    sections.push({
      kind: 'marks',
      title: L.marks,
      variable: '',
      items: [
        ...(hollow ? [{ mark: 'hollow' as const, label: L.noRatings }] : []),
        ...(outlined ? [{ mark: 'outline' as const, label: L.outlines(layerName(model)) }] : []),
        ...(extras?.path ? [{ mark: 'path' as const, label: L.path }] : []),
        ...(extras && extras.group > 0
          ? [{ mark: 'group' as const, label: L.group(extras.group) }]
          : []),
        ...(highlighted > 0
          ? [{ mark: 'highlight' as const, label: L.highlighted(highlighted) }]
          : []),
      ],
    });
  }
  return sections;
}

/** The edge colour section (D126, D132): what colour shows, its scale and its single colours. */
function colourSection(model: MapModel): LegendSection {
  const c = model.colour;
  const label = c.layerLabel;
  const base = { kind: 'colour' as const, title: L.colour };
  const notRated = c.anyMissing
    ? [{ colour: 'graphite' as const, label: L.colourNotRated(label) }]
    : [];
  switch (c.kind) {
    case 'signed':
      return c.full
        ? {
            ...base,
            variable: L.signedFull(label),
            ramp: {
              swatches: [-3, -2, -1, 0, 1, 2, 3].map((step) => ({ scale: 'valence', step })),
              labels: ['−3', '0', '+3'],
            },
            items: notRated,
          }
        : {
            ...base,
            variable: L.signedNegative(label),
            ramp: {
              swatches: [-3, -2, -1].map((step) => ({ scale: 'valence', step })),
              labels: ['−3', null, '−1'],
            },
            items: [{ colour: 'stone', label: L.neutralOrPositive }, ...notRated],
          };
    case 'unsigned':
      return {
        ...base,
        variable: L.rampVariable(label === 'composite' ? mapCopy.controls.composite : label),
        ramp: {
          swatches: [1, 2, 3, 4, 5].map((step) => ({ scale: 'ramp', step })),
          labels: [L.rampLow(formatWeight(0.2)), null, L.rampHigh(formatWeight(0.8))],
        },
        items: [
          ...(c.anyZero ? [{ colour: 'stone' as const, label: L.ratedZero }] : []),
          ...notRated,
        ],
      };
    case 'groups':
      return {
        ...base,
        variable: c.communities ? L.groupsCommunity(layerName(model)) : L.groupsOf(c.groupLabel),
        ramp: null,
        items: [
          { colour: 'stone', label: c.communities ? L.withinCommunity : L.withinGroup },
          { colour: 'graphite', label: c.communities ? L.betweenCommunities : L.betweenGroups },
        ],
      };
    case 'none':
      return {
        ...base,
        variable:
          c.reason === 'excluded'
            ? L.colourExcluded
            : c.reason === 'unavailable'
              ? L.colourUnavailable
              : L.colourNone,
        ramp: null,
        items: [],
      };
  }
}

/**
 * The condensed legend (D125): one line per encoding, with its variable and
 * the end points of a scale. Every section and note is kept, so nothing the
 * map encodes goes unexplained (spec §8); only the scales' middle samples go.
 */
export function condensedSections(sections: readonly LegendSection[]): LegendSection[] {
  const ends = <T>(xs: readonly T[]): T[] =>
    xs.length > 2 ? [xs[0] as T, xs[xs.length - 1] as T] : [...xs];
  return sections.map((section) => {
    switch (section.kind) {
      case 'size':
        return { ...section, samples: ends(section.samples) };
      case 'width':
        return { ...section, samples: ends(section.samples) };
      default:
        return section;
    }
  });
}
