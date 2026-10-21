// Design tokens for the map, read from the CSS custom properties in
// src/styles/tokens.css. The canvas cannot use CSS, so colours and sizes are
// read with getComputedStyle once and passed to the scene builder (the same
// approach as the matrix, CLAUDE.md D31). No design value is written here.

import { rampColours } from './colour';
import { PALETTE_TOKENS, type CategoricalPalette, type DivergingPalette } from './palettes';

export interface MapTheme {
  ink: string;
  graphite: string;
  stone: string;
  paper: string;
  /** Every palette the analyst may choose (D127); the model picks the project's (`model.colours`). */
  palettes: {
    categorical: Record<CategoricalPalette, string[]>;
    /** Diverging scales, −3 … +3. */
    diverging: Record<DivergingPalette, string[]>;
  };
  other: string;
  /** Sequential ramp for edge colour by an unsigned layer, five steps from light to dark (D126). */
  ramp: string[];
  /** Node radius range in CSS pixels, and the radius of a member whose size metric is not defined. */
  nodeMin: number;
  nodeMax: number;
  nodeUndefined: number;
  edgeMin: number;
  edgeMax: number;
  arrow: number;
  dash: number;
  gap: number;
  dot: number;
  line: number;
  focusWidth: number;
  fade: number;
  labelFont: string;
  labelSize: number;
  /** Group names in the grouped and circular layouts. */
  groupFont: string;
  groupSize: number;
  labelGap: number;
  /** Length of a legend line sample. */
  swatch: number;
}

function mapRecord<K extends string>(
  names: Record<K, string[]>,
  text: (name: string) => string,
): Record<K, string[]> {
  return Object.fromEntries(
    Object.entries<string[]>(names).map(([id, list]) => [id, list.map(text)]),
  ) as Record<K, string[]>;
}

/** Reads a token's value by custom-property name; the page's stylesheet, or tokens.css in tests. */
export type TokenSource = (name: string) => string;

export function readMapTheme(source: Element | TokenSource = document.documentElement): MapTheme {
  const style = typeof source === 'function' ? null : getComputedStyle(source);
  const text = (name: string) =>
    (typeof source === 'function'
      ? source(name)
      : (style as CSSStyleDeclaration).getPropertyValue(name)
    ).trim();
  const number = (name: string) => {
    const v = Number.parseFloat(text(name));
    if (!Number.isFinite(v)) throw new Error(`Design token ${name} is missing or not a number.`);
    return v;
  };
  return {
    ink: text('--ink'),
    graphite: text('--graphite'),
    stone: text('--stone'),
    paper: text('--paper'),
    palettes: {
      categorical: mapRecord(PALETTE_TOKENS.categorical, text),
      diverging: mapRecord(PALETTE_TOKENS.diverging, text),
    },
    other: text('--cat-other'),
    ramp: rampColours(text('--val-p3'), text('--paper'), number('--map-ramp-low')),
    nodeMin: number('--map-node-min'),
    nodeMax: number('--map-node-max'),
    nodeUndefined: number('--map-node-undefined'),
    edgeMin: number('--map-edge-min'),
    edgeMax: number('--map-edge-max'),
    arrow: number('--map-arrow'),
    dash: number('--map-dash'),
    gap: number('--map-gap'),
    dot: number('--map-dot'),
    line: number('--line-width'),
    focusWidth: number('--focus-width'),
    fade: number('--map-fade'),
    // Label sizes are tokens of their own so presentation mode can raise them
    // (design-system §3.2: map labels at t--1 in the workspace, t-1 when presenting).
    labelFont: `${text('--weight-medium')} ${text('--map-label-size')} ${text('--font-condensed')}`,
    labelSize: number('--map-label-size'),
    groupFont: `${text('--weight-semibold')} ${text('--map-group-size')} ${text('--font-sans')}`,
    groupSize: number('--map-group-size'),
    labelGap: number('--s-1'),
    swatch: number('--map-legend-swatch'),
  };
}
