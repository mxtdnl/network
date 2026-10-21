// Colour palettes the analyst may choose (D127, docs/design-system.md §2) and
// the hues pinned to groups. Every palette is a set of tokens in tokens.css;
// tests/unit/contrast.test.ts admits a palette only if it keeps 3:1 on the map
// ground (edges) and the ΔE00 floors under the three colour-vision simulations.
// No colour is entered freely, and the accent is never one of them (D12).

import {
  CATEGORICAL_PALETTES,
  DIVERGING_PALETTES,
  type CategoricalPalette,
  type DivergingPalette,
  type Project,
  type ProjectSettings,
} from '../../data/schema';

export { CATEGORICAL_PALETTES, DIVERGING_PALETTES };
export type { CategoricalPalette, DivergingPalette };

export const DEFAULT_CATEGORICAL: CategoricalPalette = 'tol-muted';
export const DEFAULT_DIVERGING: DivergingPalette = 'orange-blue';

const STEPS = ['n3', 'n2', 'n1', '0', 'p1', 'p2', 'p3'] as const;

/** Custom-property names of each palette's colours, in order (categorical: hue 1 … 8; diverging: −3 … +3). */
export const PALETTE_TOKENS: {
  categorical: Record<CategoricalPalette, string[]>;
  diverging: Record<DivergingPalette, string[]>;
} = {
  categorical: {
    'tol-muted': [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `--cat-${String(i)}`),
  },
  diverging: {
    'orange-blue': STEPS.map((s) => `--val-${s}`),
    'purple-green': STEPS.map((s) => `--div-pg-${s}`),
    'red-blue': STEPS.map((s) => `--div-rb-${s}`),
  },
};

export interface PaletteChoice {
  categorical: CategoricalPalette;
  diverging: DivergingPalette;
}

/** The project's palettes, or the defaults. */
export function paletteChoice(project: Project): PaletteChoice {
  const p = project.settings.palette;
  return {
    categorical:
      p && CATEGORICAL_PALETTES.includes(p.categorical) ? p.categorical : DEFAULT_CATEGORICAL,
    diverging: p && DIVERGING_PALETTES.includes(p.diverging) ? p.diverging : DEFAULT_DIVERGING,
  };
}

/** Hues pinned to the values of one attribute (value → hue index), within the palette's size. */
export function pinnedHues(project: Project, key: string, hues: number): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Set<number>();
  for (const [value, hue] of Object.entries(project.settings.group_colours?.[key] ?? {})) {
    if (!Number.isInteger(hue) || hue < 0 || hue >= hues || taken.has(hue)) continue;
    out.set(value, hue);
    taken.add(hue);
  }
  return out;
}

/** Settings without one of the optional colour fields, so a default is stored as no setting. */
function settingsWithout(
  settings: ProjectSettings,
  field: 'palette' | 'group_colours',
): ProjectSettings {
  return Object.fromEntries(
    Object.entries(settings).filter(([k]) => k !== field),
  ) as unknown as ProjectSettings;
}

/**
 * Pins a value of an attribute to a hue, or releases it (`hue` null). A value
 * already holding that hue gives it up, so a hue stays with one value.
 */
export function withPin(project: Project, key: string, value: string, hue: number | null): Project {
  const kept = Object.entries(project.settings.group_colours?.[key] ?? {}).filter(
    ([v, h]) => v !== value && h !== hue,
  );
  const pins = hue === null ? kept : [...kept, [value, hue] as const];
  const others = Object.entries(project.settings.group_colours ?? {}).filter(([k]) => k !== key);
  const group_colours = Object.fromEntries(
    pins.length > 0 ? [...others, [key, Object.fromEntries(pins)]] : others,
  );
  const settings = settingsWithout(project.settings, 'group_colours');
  return {
    ...project,
    settings: Object.keys(group_colours).length > 0 ? { ...settings, group_colours } : settings,
  };
}

const DEFAULT_CHOICE: PaletteChoice = {
  categorical: DEFAULT_CATEGORICAL,
  diverging: DEFAULT_DIVERGING,
};

/** Sets the project's palettes; the defaults are stored as no setting. */
export function withPalette(project: Project, choice: PaletteChoice): Project {
  const settings = settingsWithout(project.settings, 'palette');
  const isDefault = (Object.keys(DEFAULT_CHOICE) as (keyof PaletteChoice)[]).every(
    (k) => choice[k] === DEFAULT_CHOICE[k],
  );
  return { ...project, settings: isDefault ? settings : { ...settings, palette: { ...choice } } };
}
