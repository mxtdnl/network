// Phase 8: colour contrast of text and of data marks against the grounds they
// are drawn on (WCAG 2.2 AA: 1.4.3 text 4.5:1, 1.4.11 non-text 3:1), computed
// from tokens.css, and the separation of the edge colours under simulated
// colour-vision deficiencies. The figures are printed for docs/design-audit.md.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rampColours } from '../../src/ui/map/colour';
import { PALETTE_TOKENS } from '../../src/ui/map/palettes';
import { CVD, contrast, deltaE00, hex, mixLab, over, simulate, type Rgb } from './colour';

const css = readFileSync(
  join(import.meta.dirname, '..', '..', 'src', 'styles', 'tokens.css'),
  'utf8',
);
const token = (name: string): Rgb => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m?.[1]) throw new Error(`No colour token --${name}`);
  return hex(m[1]);
};
const fade = Number(/--map-fade:\s*([\d.]+)/.exec(css)?.[1]);

const ink = token('ink');
const graphite = token('graphite');
const stone = token('stone');
const field = token('field');
const paper = token('paper');
const accent = token('accent');
const valence = ['val-n3', 'val-n2', 'val-n1', 'val-0', 'val-p1', 'val-p2', 'val-p3'].map(token);
const categorical = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => token(`cat-${String(i)}`));

const rows: string[] = [];
function check(label: string, fg: Rgb, bg: Rgb, min: number) {
  const ratio = contrast(fg, bg);
  rows.push(`${label}: ${ratio.toFixed(2)} (needs ${String(min)})`);
  expect(ratio, label).toBeGreaterThanOrEqual(min);
}

describe('contrast of text', () => {
  it('body, secondary and link text on both grounds', () => {
    for (const [name, bg] of [
      ['field', field],
      ['paper', paper],
    ] as const) {
      check(`ink on ${name}`, ink, bg, 4.5);
      check(`graphite on ${name}`, graphite, bg, 4.5);
      check(`accent (links, active tab) on ${name}`, accent, bg, 4.5);
    }
    check('paper on accent (primary button)', paper, accent, 4.5);
    check('paper on ink (selected segment)', paper, ink, 4.5);
  });

  it('matrix cell values on every shade', () => {
    [0.12, 0.24, 0.36, 0.48, 0.6].forEach((p, k) => {
      check(`ink on shade-${String(k + 1)}`, ink, mixLab(token('val-p3'), p, paper), 4.5);
    });
    valence.forEach((v, k) => {
      check(`ink on signed shade ${String(k - 3)}`, ink, mixLab(v, 0.6, paper), 4.5);
    });
  });

  it('map labels on their paper halo', () => {
    check('map label (ink on paper halo)', ink, paper, 4.5);
    // Names of members outside a highlight are faded on purpose: they are part
    // of a picture, and every member stays named in the table beside the map.
    rows.push(
      `faded map label (ink at ${String(fade)} on paper): ${contrast(over(ink, fade, paper), paper).toFixed(2)} (part of a picture, exempt)`,
    );
  });
});

describe('contrast of data marks and control boundaries', () => {
  it('control boundaries and the focus ring', () => {
    check('stone boundary on field', stone, field, 3);
    check('stone boundary on paper', stone, paper, 3);
    check('accent focus ring on field', accent, field, 3);
    check('accent focus ring on paper', accent, paper, 3);
  });

  it('edges on the map ground', () => {
    valence.forEach((v, k) => {
      check(`valence ${String(k - 3)} edge on paper`, v, paper, 3);
    });
    check('valence not rated edge (graphite, D113) on paper', graphite, paper, 3);
    check('edge with valence hidden (stone) on paper', stone, paper, 3);
    check('shortest path (ink) on paper', ink, paper, 3);
    // Edge colour by an unsigned layer (D126): five steps from --map-ramp-low to val-p3.
    const low = Number(/--map-ramp-low:\s*([\d.]+)/.exec(css)?.[1]);
    const text = (name: string) =>
      new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1] ?? '';
    const ramp = rampColours(text('val-p3'), text('paper'), low);
    ramp.forEach((c, k) => {
      check(`edge ramp step ${String(k + 1)} on paper`, hex(c), paper, 3);
    });
    expect(ramp[4]).toBe(text('val-p3').toLowerCase());
    // Ties between groups (graphite) and within a group (stone) stay apart under every condition.
    let min = Infinity;
    for (const c of ['normal', ...Object.keys(CVD)]) {
      const f = (x: Rgb) => (c === 'normal' ? x : simulate(x, c as keyof typeof CVD));
      min = Math.min(min, deltaE00(f(graphite), f(stone)));
    }
    rows.push(`within (stone) vs between groups (graphite), worst ΔE00: ${min.toFixed(1)}`);
    expect(min).toBeGreaterThan(9);
  });

  it('nodes: the ink outline carries the boundary; the fills are listed', () => {
    check('node outline and selection ring (ink) on paper', ink, paper, 3);
    check('selection ring (ink) against its paper halo', ink, paper, 3);
    check('not-rated hatch (stone) on paper', stone, paper, 3);
    categorical.forEach((c, k) => {
      rows.push(
        `cat-${String(k + 1)} fill on paper: ${contrast(c, paper).toFixed(2)}; against its ink outline ${contrast(c, ink).toFixed(2)}`,
      );
    });
  });

  it('edge colours stay apart under colour-vision simulation', () => {
    // A tie with no valence rating must never read as a rated one, the neutral grey included.
    const conditions = ['normal', ...Object.keys(CVD)] as const;
    let min = Infinity;
    for (const c of conditions) {
      const f = (x: Rgb) => (c === 'normal' ? x : simulate(x, c as keyof typeof CVD));
      for (const v of valence) min = Math.min(min, deltaE00(f(graphite), f(v)));
    }
    rows.push(
      `valence not rated vs every valence step, worst ΔE00 over all conditions: ${min.toFixed(1)}`,
    );
    expect(min).toBeGreaterThan(9);
  });
});

// Palettes the analyst may choose (D127, docs/design-system.md §2). A palette
// is offered only if it passes; a candidate that fails is listed under
// REJECTED, with a test that it still fails, rather than the floor relaxed.
const CONDITIONS = ['normal', ...Object.keys(CVD)] as const;
const seen = (c: (typeof CONDITIONS)[number], x: Rgb) =>
  c === 'normal' ? x : simulate(x, c as keyof typeof CVD);

/** Smallest ΔE00 between any two colours, over normal vision and the three simulations. */
function worstPair(colours: Rgb[]): number {
  let min = Infinity;
  for (const c of CONDITIONS)
    for (let i = 0; i < colours.length; i++)
      for (let j = i + 1; j < colours.length; j++)
        min = Math.min(min, deltaE00(seen(c, colours[i] as Rgb), seen(c, colours[j] as Rgb)));
  return min;
}

/** Smallest ΔE00 over all conditions between pairs picked by `pairs` (indices into the scale). */
function worstOf(scale: Rgb[], pairs: [number, number][]): number {
  let min = Infinity;
  for (const c of CONDITIONS)
    for (const [i, j] of pairs)
      min = Math.min(min, deltaE00(seen(c, scale[i] as Rgb), seen(c, scale[j] as Rgb)));
  return min;
}

// Floors from design-system §2.1 and §2.2, the default palettes' worst cases:
// categorical 11.8 (indigo / wine under protanopia); diverging 30 between the
// two signs and 9.5 between adjacent steps, where 9.5 is the table's rounding
// of the default's 9.46 (+1 / +2 under tritanopia), so the floor is 9.45.
const CATEGORICAL_FLOOR = 11.8;
const OPPOSITE_FLOOR = 30;
const ADJACENT_FLOOR = 9.45;
// Not rated (graphite, D113) and neutral or positive in the negative-only
// colouring (stone, D132) stay apart from the scale as graphite does now.
const MARK_FLOOR = 9;

const REJECTED: { name: string; colours: string[]; reason: (worst: number) => boolean }[] = [
  {
    name: 'Tol bright',
    colours: ['#4477aa', '#ee6677', '#228833', '#ccbb44', '#66ccee', '#aa3377'],
    reason: (worst) => worst < CATEGORICAL_FLOOR,
  },
  {
    name: 'Okabe–Ito',
    colours: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7'],
    reason: (worst) => worst < CATEGORICAL_FLOOR,
  },
];

describe('categorical palettes (D127)', () => {
  it.each(Object.entries(PALETTE_TOKENS.categorical))('%s keeps the ΔE00 floor', (id, names) => {
    const colours = names.map((n) => token(n.slice(2)));
    expect(colours).toHaveLength(8);
    const worst = worstPair(colours);
    rows.push(`categorical ${id}: worst pair ΔE00 over all conditions ${worst.toFixed(1)}`);
    expect(worst).toBeGreaterThanOrEqual(CATEGORICAL_FLOOR);
    // Fills are not held to 3:1 on the ground (owner, 2026-10-21): the 1 px ink
    // outline every node carries is the boundary, so that is what must reach 3:1.
    check(`${id}: node outline (ink) on paper`, ink, paper, 3);
    colours.forEach((c, k) => {
      rows.push(`${id} hue ${String(k + 1)} fill on paper: ${contrast(c, paper).toFixed(2)}`);
      expect(c, `${id} hue ${String(k + 1)} is not the accent`).not.toEqual(accent);
    });
  });

  it.each(REJECTED)('rejected candidate $name still fails', ({ name, colours, reason }) => {
    const worst = worstPair(colours.map(hex));
    rows.push(
      `rejected ${name}: worst pair ΔE00 ${worst.toFixed(1)}; fills below 3:1 on paper: ${String(colours.filter((c) => contrast(hex(c), paper) < 3).length)} of ${String(colours.length)}`,
    );
    expect(reason(worst)).toBe(true);
  });
});

describe('diverging palettes (D127)', () => {
  const adjacent: [number, number][] = [0, 1, 2, 3, 4, 5].map((i) => [i, i + 1]);
  const opposite: [number, number][] = [
    [2, 4],
    [1, 5],
    [0, 6],
  ];
  it.each(Object.entries(PALETTE_TOKENS.diverging))('%s passes every check', (id, names) => {
    const scale = names.map((n) => token(n.slice(2)));
    expect(scale).toHaveLength(7);
    scale.forEach((c, k) => {
      check(`${id} step ${String(k - 3)} edge on paper`, c, paper, 3);
      check(`${id}: ink on matrix shade ${String(k - 3)}`, ink, mixLab(c, 0.6, paper), 4.5);
      expect(c, `${id} step ${String(k - 3)} is not the accent`).not.toEqual(accent);
    });
    const adj = worstOf(scale, adjacent);
    const opp = worstOf(scale, opposite);
    let notRated = Infinity;
    let neutral = Infinity;
    for (const c of CONDITIONS) {
      for (const v of scale) notRated = Math.min(notRated, deltaE00(seen(c, graphite), seen(c, v)));
      for (const v of scale.slice(0, 3))
        neutral = Math.min(neutral, deltaE00(seen(c, stone), seen(c, v)));
    }
    rows.push(
      `diverging ${id}: adjacent ${adj.toFixed(2)}, opposite sign ${opp.toFixed(1)}, not rated (graphite) ${notRated.toFixed(1)}, negative vs stone ${neutral.toFixed(1)}`,
    );
    expect(adj).toBeGreaterThanOrEqual(ADJACENT_FLOOR);
    expect(opp).toBeGreaterThanOrEqual(OPPOSITE_FLOOR);
    expect(notRated).toBeGreaterThan(MARK_FLOOR);
    expect(neutral).toBeGreaterThan(MARK_FLOOR);
  });
});

describe('contrast report', () => {
  it('prints the table', () => {
    console.log(rows.join('\n'));
  });
});
