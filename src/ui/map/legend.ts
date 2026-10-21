// Legend content derived from the map model, so the legend always shows the
// encodings in use (spec §8: every encoding is explained in a persistent
// legend). Pure data: the on-screen legend renders it, and the Phase 7 SVG
// and PNG exports will compose the same entries.

import { formatScale, formatValue, formatWeight, mapCopy } from '../copy/map';
import { metricCopy } from '../copy/metrics';
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
      notes: string[];
    }
  | {
      kind: 'colour';
      title: string;
      variable: string;
      /** Seven steps, −3 … +3, or empty when valence is hidden. */
      steps: { step: number; label: string }[];
      notRated: string | null;
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
      items: { mark: 'group' | 'path' | 'highlight'; label: string }[];
    };

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
  sections.push({
    kind: 'size',
    title: L.size,
    variable: metricCopy[model.size.metric].label,
    samples: defined
      ? hi > lo
        ? formatScale([lo, mid, hi]).map((label, i) => ({ radius: radiusAt(i / 2), label }))
        : [{ radius: radiusAt(0.5), label: formatValue(lo) }]
      : [],
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

  sections.push({
    kind: 'width',
    title: L.width,
    variable: L.widthScale(
      model.edgeLayer === model.layer ? layerName(model) : model.edgeLayerLabel,
    ),
    samples: [0.2, 0.6, 1].map((w) => ({
      width: r.edgeMin + (r.edgeMax - r.edgeMin) * w,
      label: formatWeight(w),
    })),
    notes: [
      ...(model.threshold > 0 ? [L.threshold(formatWeight(model.threshold))] : []),
      ...(model.hiddenLayers.length > 0 ? [L.hiddenLayers(model.hiddenLabels)] : []),
    ],
  });

  sections.push({
    kind: 'colour',
    title: L.colour,
    variable: model.valenceShown ? L.valence : model.valenceAvailable ? L.colourOff : L.colourNone,
    steps: model.valenceShown
      ? [-3, -2, -1, 0, 1, 2, 3].map((step) => ({
          step,
          label: step > 0 ? `+${String(step)}` : step < 0 ? `−${String(-step)}` : '0',
        }))
      : [],
    notRated: model.valenceShown && model.anyValenceMissing ? L.valenceNotRated : null,
  });

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
  if (extras && (extras.group > 0 || extras.path || highlighted > 0)) {
    sections.push({
      kind: 'marks',
      title: L.marks,
      variable: '',
      items: [
        ...(extras.path ? [{ mark: 'path' as const, label: L.path }] : []),
        ...(extras.group > 0 ? [{ mark: 'group' as const, label: L.group(extras.group) }] : []),
        ...(highlighted > 0
          ? [{ mark: 'highlight' as const, label: L.highlighted(highlighted) }]
          : []),
      ],
    });
  }
  return sections;
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
