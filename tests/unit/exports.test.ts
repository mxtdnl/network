// Phase 7: every export type under both export settings (spec §11, §14).
// For each of the seven exports (map as PNG and SVG, member metrics, network
// metrics and formal–informal CSV, the metrics table's CSV, and the PDF
// report) and each combination of "hide names" and "leave out signed layers":
// - names hidden: no member's display name appears anywhere in the file;
// - signed layers left out: no label or key of valence, energy or either
//   conflict layer appears, no colour of the valence scale is drawn, and the
//   figures equal an analysis of the project without those layers.
// The counter-checks (names shown, layers kept) prove each test can fail.

import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { analyse } from '../../src/engine/analyse';
import { buildAnalysisInput } from '../../src/engine/input';
import { paintDocument, pngScale, type PaintContext } from '../../src/ui/export/canvas';
import type { ExportContext } from '../../src/ui/export/context';
import { documentColours, roughMeasure } from '../../src/ui/export/document';
import { mapExport, pdfExport, svgExport, type ExportDeps } from '../../src/ui/export/files';
import type { MapState } from '../../src/ui/export/mapScene';
import { exportProject } from '../../src/ui/export/scope';
import {
  formalInformalCsv,
  memberMetricsCsv,
  metricsTableCsv,
  networkMetricsCsv,
} from '../../src/ui/export/tables';
import { readExportTheme } from '../../src/ui/export/theme';
import { withPalette, withPin } from '../../src/ui/map/palettes';
import { DIRECTED_METRICS } from '../../src/ui/copy/metrics';
import { effectiveWeights, type WeightState } from '../../src/ui/state/presets';
import type { MapSettings } from '../../src/ui/state/store';
import {
  EXCLUDED_KEYS,
  contextFor,
  diskFonts,
  methodNotes,
  nodeInflate,
  sensitiveProject,
  tokensCss,
} from './exportHarness';

const project = sensitiveProject();
const NAMES = project.members.map((m) => m.display_name);
const EXCLUDED_LABELS = project.layers
  .filter((l) => EXCLUDED_KEYS.includes(l.key))
  .map((l) => l.label);
// Relationship health uses valence as a multiplier, so the composite depends on it.
const HEALTH: WeightState = { preset: 'health', custom: {}, customTreatment: {} };
const tokens = tokensCss();
const theme = readExportTheme(tokens);
const VALENCE_COLOURS = theme.map.palettes.diverging['orange-blue'].map((c) => c.toLowerCase());
const CAPTION = `Prepared with ${NAMES[0] ?? ''} and ${NAMES[1] ?? ''}.`;

const deps: ExportDeps = {
  tokens,
  measure: roughMeasure,
  loadFont: diskFonts,
  inflate: nodeInflate,
  now: new Date('2026-09-27T12:00:00Z'),
  notes: methodNotes(),
};
const mapState: MapState = {
  positions: null,
  layoutKey: null,
  viewport: null,
  revision: 1,
  group: [],
  path: null,
};

/** A canvas context that records what is drawn. */
function recorder() {
  const texts: string[] = [];
  const colours = new Set<string>();
  const ctx = {
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save() {},
    restore() {},
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {},
    rect() {},
    clip() {},
    fill() {},
    stroke() {},
    fillRect() {},
    setLineDash() {},
    fillText(text: string) {
      texts.push(text);
    },
    strokeText(text: string) {
      texts.push(text);
    },
  } as unknown as PaintContext;
  let fill = '';
  let stroke = '';
  Object.defineProperty(ctx, 'fillStyle', {
    get: () => fill,
    set: (v: string) => {
      fill = v;
      colours.add(v.toLowerCase());
    },
  });
  Object.defineProperty(ctx, 'strokeStyle', {
    get: () => stroke,
    set: (v: string) => {
      stroke = v;
      colours.add(v.toLowerCase());
    },
  });
  return { ctx, texts, colours };
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const meta = await doc.getMetadata();
  let text = JSON.stringify(meta.info);
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += `\n${content.items.map((x) => ('str' in x ? x.str : '')).join(' ')}`;
  }
  return text;
}

interface Output {
  text: string;
  /** Colours drawn in the map, when the export has one. */
  colours: Set<string> | null;
}

type ExportType = 'png' | 'svg' | 'members' | 'network' | 'formalInformal' | 'table' | 'pdf';

async function produce(type: ExportType, ctx: ExportContext): Promise<Output> {
  switch (type) {
    case 'png': {
      const { doc } = mapExport(ctx, mapState, deps, CAPTION);
      const r = recorder();
      paintDocument(r.ctx, doc, theme, pngScale('x2', doc, theme));
      return { text: r.texts.join('\n'), colours: r.colours };
    }
    case 'svg': {
      const out = await svgExport(ctx, mapState, deps, CAPTION);
      // The embedded fonts are base64 data; everything else is searched.
      const text = out.text.replace(/<style>[\s\S]*?<\/style>/, '');
      const colours = new Set([...text.matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0].toLowerCase()));
      return { text, colours };
    }
    case 'members':
      return { text: memberMetricsCsv(ctx).text, colours: null };
    case 'network':
      return { text: networkMetricsCsv(ctx).text, colours: null };
    case 'formalInformal':
      return { text: formalInformalCsv(ctx)?.text ?? '', colours: null };
    case 'table':
      return {
        text: metricsTableCsv(ctx, {
          order: project.members.map((m) => m.id),
          metrics: DIRECTED_METRICS,
          fillKey: 'team',
          rank: null,
        }).text,
        colours: null,
      };
    case 'pdf': {
      const out = await pdfExport(ctx, mapState, deps, CAPTION);
      expect(new TextDecoder().decode(out.bytes.slice(0, 5))).toBe('%PDF-');
      return {
        text: `${out.fileName}\n${await pdfText(out.bytes)}`,
        colours: documentColours(out.doc),
      };
    }
  }
}

const TYPES: ExportType[] = ['png', 'svg', 'members', 'network', 'formalInformal', 'table', 'pdf'];
/** Exports that name members: the counter-check expects names there when they are shown. */
const NAMES_MEMBERS: ExportType[] = ['png', 'svg', 'members', 'formalInformal', 'table', 'pdf'];
/** Exports that show signed layers when they are kept. */
const SHOWS_SIGNED: ExportType[] = ['png', 'svg', 'members', 'network', 'pdf'];

const wordIn = (text: string, word: string) =>
  new RegExp(
    `(^|[^\\p{L}\\p{N}_])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}_])`,
    'iu',
  ).test(text);

describe.each(TYPES)('%s export', (type) => {
  describe.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])('names hidden %s, signed layers left out %s', (anonymise, excludeSigned) => {
    it('respects both settings', async () => {
      const ctx = await contextFor(project, { anonymise, excludeSigned, weights: HEALTH });
      const out = await produce(type, ctx);
      expect(out.text.length).toBeGreaterThan(0);

      const namesFound = NAMES.filter((n) => out.text.includes(n));
      if (anonymise) {
        expect(namesFound).toEqual([]);
        // Member ids can be names or addresses, so they are left out too.
        if (type === 'members') expect(out.text).not.toContain('FIN01');
      } else if (NAMES_MEMBERS.includes(type)) {
        expect(namesFound.length).toBeGreaterThan(0);
      }

      const signedFound = [...EXCLUDED_KEYS, ...EXCLUDED_LABELS].filter((w) => wordIn(out.text, w));
      const valenceDrawn = out.colours ? VALENCE_COLOURS.filter((c) => out.colours?.has(c)) : [];
      if (excludeSigned) {
        expect(signedFound).toEqual([]);
        expect(valenceDrawn).toEqual([]);
      } else if (SHOWS_SIGNED.includes(type)) {
        expect(signedFound.length).toBeGreaterThan(0);
        if (out.colours) expect(valenceDrawn.length).toBeGreaterThan(0);
      }
    }, 30_000);
  });
});

const label = (key: string) => project.layers.find((l) => l.key === key)?.label ?? key;

/**
 * The encoding choices (CLAUDE.md D126, D132, D134, D136), each with text the
 * map's legend shows when the encoding's layer is kept, and when the
 * signed-layer exclusion leaves it out.
 */
const ENCODINGS: {
  name: string;
  map: Partial<MapSettings>;
  kept: string[];
  excluded: string[];
}[] = [
  {
    name: 'valence, negative ratings only (the default)',
    map: {},
    kept: ['Valence: negative ratings only', 'Neutral or positive'],
    excluded: ['Not used: its layer is left out of this export'],
  },
  {
    name: 'valence, full scale',
    map: { signedScale: 'full' },
    kept: ['Valence, −3 to +3'],
    excluded: ['Not used: its layer is left out of this export'],
  },
  {
    name: 'energy',
    map: { edgeColour: { kind: 'signed', layer: 'energy' } },
    kept: [`${label('energy')}: negative ratings only`],
    excluded: ['Not used: its layer is left out of this export'],
  },
  {
    name: 'a conflict layer on the ramp',
    map: { edgeColour: { kind: 'unsigned', layer: 'conflict_task' } },
    kept: [`${label('conflict_task')}, strength`],
    excluded: ['Not used: its layer is left out of this export'],
  },
  {
    name: 'formal collaboration on the ramp',
    map: { edgeColour: { kind: 'unsigned', layer: 'formal_collaboration' } },
    kept: ['Formal collaboration, strength'],
    excluded: ['Formal collaboration, strength'],
  },
  {
    name: 'within or between groups',
    map: { edgeColour: { kind: 'groups' } },
    kept: ['Within or between groups of Team or function', 'Between groups'],
    excluded: ['Within or between groups of Team or function', 'Between groups'],
  },
  {
    name: 'no colour',
    map: { edgeColour: { kind: 'none' } },
    kept: ['Edge colour'],
    excluded: ['Edge colour'],
  },
  {
    name: 'width by a conflict layer',
    map: { edgeWidth: { kind: 'layer', layer: 'conflict_personal' } },
    kept: [`Not rated on ${label('conflict_personal')}`, 'Ties drawn from Composite of all layers'],
    // Left out, the width falls back to the layer the ties are drawn from.
    excluded: ['Composite of all layers'],
  },
  {
    name: 'the same width for every tie',
    map: { edgeWidth: { kind: 'uniform' } },
    kept: ['Not used: the same for every tie'],
    excluded: ['Not used: the same for every tie'],
  },
  {
    name: 'formal and informal style',
    map: { edgeStyle: 'formalInformal' },
    kept: ['Edge style', 'Formal only'],
    excluded: ['Edge style', 'Formal only'],
  },
  {
    name: 'size by rank',
    map: { sizeScale: 'rank' },
    kept: ['Bridging, by rank', 'Rank 1'],
    excluded: ['Bridging, by rank', 'Rank 1'],
  },
  {
    name: 'community outlines',
    map: { communityOutlines: true },
    kept: ['Community outline, detected on Composite of all layers'],
    excluded: ['Community outline, detected on Composite of all layers'],
  },
];

const MAP_TYPES = ['png', 'svg', 'pdf'] as const;

describe.each(ENCODINGS)('map encoding: $name', ({ map, kept, excluded }) => {
  describe.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])('names hidden %s, signed layers left out %s', (anonymise, excludeSigned) => {
    // The PDF draws the same document as the SVG; it runs for two of the four combinations to save time.
    const types = anonymise === excludeSigned ? MAP_TYPES : MAP_TYPES.filter((x) => x !== 'pdf');
    it.each(types)(
      '%s respects both settings and explains the encoding',
      async (type) => {
        const ctx = await contextFor(project, { anonymise, excludeSigned, weights: HEALTH, map });
        const out = await produce(type, ctx);
        const namesFound = NAMES.filter((n) => out.text.includes(n));
        if (anonymise) expect(namesFound).toEqual([]);
        else expect(namesFound.length).toBeGreaterThan(0);
        const signedFound = [...EXCLUDED_KEYS, ...EXCLUDED_LABELS].filter((w) =>
          wordIn(out.text, w),
        );
        // The ramp's darkest step is val-p3 itself (the matrix's ramp runs towards it), so with an
        // unsigned colour layer that one colour is the ramp's, not valence's.
        const ramp =
          map.edgeColour?.kind === 'unsigned' ? theme.map.ramp.map((c) => c.toLowerCase()) : [];
        const valenceDrawn = VALENCE_COLOURS.filter(
          (c) => out.colours?.has(c) && !ramp.includes(c),
        );
        // Legend lines wrap into separate text items, so text is searched without markup or line breaks.
        const flat = out.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        if (excludeSigned) {
          expect(signedFound).toEqual([]);
          expect(valenceDrawn).toEqual([]);
          for (const text of excluded) expect(flat).toContain(text);
        } else {
          for (const text of kept) expect(flat).toContain(text);
        }
      },
      30_000,
    );
  });
});

describe('map encodings in exports', () => {
  it('draws only negative valence steps by default, and every step on the full scale', async () => {
    const steps = async (m: Partial<MapSettings>) => {
      const ctx = await contextFor(project, { anonymise: true, excludeSigned: false, map: m });
      const out = await produce('svg', ctx);
      return VALENCE_COLOURS.map((c) => out.colours?.has(c) ?? false);
    };
    // The legend's ramp shows the steps it uses; the map draws whole steps in the directed view.
    expect(await steps({})).toEqual([true, true, true, false, false, false, false]);
    expect(await steps({ signedScale: 'full' })).toEqual(VALENCE_COLOURS.map(() => true));
  });

  it('draws the sequential ramp for an unsigned colour layer', async () => {
    const ctx = await contextFor(project, {
      anonymise: true,
      excludeSigned: false,
      map: { edgeColour: { kind: 'unsigned', layer: 'formal_collaboration' } },
    });
    const out = await produce('svg', ctx);
    expect(theme.map.ramp.every((c) => out.colours?.has(c.toLowerCase()))).toBe(true);
  });

  it('says why colour is not used when the exclusion removed its layer', async () => {
    const ctx = await contextFor(project, {
      anonymise: false,
      excludeSigned: true,
      map: { edgeColour: { kind: 'signed', layer: 'energy' } },
    });
    expect(ctx.colourExcluded).toBe(true);
    const { map } = mapExport(ctx, mapState, deps, '');
    expect(map.model.colour).toMatchObject({ kind: 'none', reason: 'excluded' });
    // A colour layer the exclusion keeps is not affected.
    const kept = await contextFor(project, {
      anonymise: false,
      excludeSigned: true,
      map: { edgeColour: { kind: 'unsigned', layer: 'formal_collaboration' } },
    });
    expect(kept.colourExcluded).toBe(false);
    expect(mapExport(kept, mapState, deps, '').map.model.colour.kind).toBe('unsigned');
  });

  it('carries the community outlines into the exported map', async () => {
    const lines = async (communityOutlines: boolean) => {
      const ctx = await contextFor(project, {
        anonymise: true,
        excludeSigned: false,
        map: { communityOutlines },
      });
      const { map } = mapExport(ctx, mapState, deps, '');
      return map.scene.lines
        .filter((b) => b.stroke === theme.map.stone)
        .reduce((k, b) => k + b.coords.length, 0);
    };
    expect(await lines(true)).toBeGreaterThan(await lines(false));
  });
});

describe('palettes and pinned colours in exports (D127)', () => {
  const PURPLE_GREEN = theme.map.palettes.diverging['purple-green'].map((c) => c.toLowerCase());
  const MID = PURPLE_GREEN[3] ?? '';
  const MUTED = theme.map.palettes.categorical['tol-muted'].map((c) => c.toLowerCase());
  const teams = [...new Set(project.members.map((m) => m.attributes.team ?? ''))].filter(Boolean);
  const pinnedTeam = teams[0] ?? '';
  // The first team takes hue 1 unless pinned; wine (hue 8) is beyond the demo's teams.
  const WINE = 7;
  const chosen = withPin(
    withPalette(project, { categorical: 'tol-muted', diverging: 'purple-green' }),
    'team',
    pinnedTeam,
    WINE,
  );
  const map: Partial<MapSettings> = {
    signedScale: 'full',
    fill: { kind: 'attribute', key: 'team' },
  };

  it('has fewer teams than hues, so the pinned hue is drawn only when pinned', () => {
    expect(teams.length).toBeLessThan(WINE + 1);
  });

  it.each(['png', 'svg', 'pdf'] as const)(
    '%s draws the chosen diverging palette and the pinned hue, and no default steps',
    async (type) => {
      const ctx = await contextFor(chosen, { anonymise: true, excludeSigned: false, map });
      const out = await produce(type, ctx);
      const colours = out.colours ?? new Set<string>();
      expect(PURPLE_GREEN.filter((c) => !colours.has(c))).toEqual([]);
      expect(VALENCE_COLOURS.filter((c) => c !== MID && colours.has(c))).toEqual([]);
      expect(colours.has(MUTED[WINE] ?? '')).toBe(true);
      const group = mapExport(ctx, mapState, deps, '').map.model.fill.groups.find(
        (g) => g.key === pinnedTeam,
      );
      expect(group?.hue).toBe(WINE);
      // Counter-check: the default palettes draw neither.
      const plain = await produce(
        type,
        await contextFor(project, { anonymise: true, excludeSigned: false, map }),
      );
      expect(plain.colours?.has(MUTED[WINE] ?? '')).toBe(false);
      expect(PURPLE_GREEN.filter((c) => c !== MID && plain.colours?.has(c))).toEqual([]);
    },
    30_000,
  );

  it.each(['png', 'svg', 'pdf'] as const)(
    '%s draws none of the chosen scale when signed layers are left out',
    async (type) => {
      const ctx = await contextFor(chosen, { anonymise: true, excludeSigned: true, map });
      const out = await produce(type, ctx);
      expect(PURPLE_GREEN.filter((c) => c !== MID && out.colours?.has(c))).toEqual([]);
    },
    30_000,
  );
});

describe('signed-layer exclusion recalculates every figure', () => {
  it('gives the composite of the project without those layers, not the one on screen', async () => {
    const kept = await contextFor(project, {
      anonymise: false,
      excludeSigned: false,
      weights: HEALTH,
    });
    const left = await contextFor(project, {
      anonymise: false,
      excludeSigned: true,
      weights: HEALTH,
    });
    expect(left.reanalysed).toBe(true);
    const stripped = exportProject(project, true);
    const w = effectiveWeights(stripped, HEALTH);
    const reference = await analyse(
      buildAnalysisInput(
        stripped,
        {
          view: 'directed',
          symmetrise: 'mean',
          weights: w.weights,
          signedTreatment: w.signedTreatment,
        },
        'reference',
      ),
    );
    const col = (c: ExportContext) => c.result.refs.composite?.node.columns.inStrength;
    expect([...(col(left) ?? [])]).toEqual([
      ...(reference.refs.composite?.node.columns.inStrength ?? []),
    ]);
    expect([...(col(left) ?? [])]).not.toEqual([...(col(kept) ?? [])]);
    expect(Object.keys(left.result.signed)).toEqual([]);
    expect(left.result.refOrder.some((r) => EXCLUDED_KEYS.some((k) => r.startsWith(k)))).toBe(
      false,
    );
    // Negative clusters read only signed layers, so they cannot appear.
    expect(left.result.insights.find((o) => o.rule === 'negativeCluster')?.observations).toEqual(
      [],
    );
  });

  it('drops a highlight that may come from a signed-layer insight', async () => {
    const ctx = await contextFor(project, {
      anonymise: false,
      excludeSigned: true,
      map: { highlight: [project.members[0]?.id ?? ''] },
    });
    expect(ctx.settings.highlight).toEqual([]);
  });

  it('changes nothing for a project without those layers enabled', async () => {
    const plain = {
      ...project,
      layers: project.layers.map((l) =>
        EXCLUDED_KEYS.includes(l.key) ? { ...l, enabled: false } : l,
      ),
    };
    const ctx = await contextFor(plain, { anonymise: false, excludeSigned: true });
    expect(ctx.reanalysed).toBe(false);
  });
});

describe('report details', () => {
  it('replaces full names in the title, caption and survey titles, and quotes survey response rates', async () => {
    const ctx = await contextFor(project, { anonymise: true, excludeSigned: false });
    const out = await pdfExport(ctx, mapState, deps, CAPTION);
    const text = await pdfText(out.bytes);
    expect(text).toContain('Network review for FIN-L4-01');
    expect(text).toContain('Survey led by FIN-L4-01');
    expect(text).toContain('Survey response rates');
    expect(text).toContain('75%');
    expect(out.pages).toBeGreaterThanOrEqual(8);
    for (const section of [
      'Network map',
      'Key network metrics',
      'Insights',
      'Method notes',
      'Data coverage',
      'Ethics statement',
    ])
      expect(text).toContain(section);
  }, 30_000);

  it('states the coverage warning when coverage is below the threshold', async () => {
    // Energy and conflict were rated for 30 % of pairs, which pulls coverage below 80 %.
    const ctx = await contextFor(project, { anonymise: true, excludeSigned: false });
    expect(ctx.result.coverage?.belowThreshold).toBe(true);
    const text = await pdfText((await pdfExport(ctx, mapState, deps, '')).bytes);
    expect(text).toMatch(/Coverage is \d+ ?%, below the 80 ?% threshold/);
  }, 30_000);

  it('can set every character of the report in the embedded fonts or a written-out fallback', async () => {
    const ctx = await contextFor(project, { anonymise: false, excludeSigned: false });
    const out = await pdfExport(ctx, mapState, deps, CAPTION);
    // Characters without a glyph are written out (≥ as ">="); none may become "?".
    expect(
      out.substituted.filter((c) => !['≥', '≤', '≠', 'γ', 'Σ', '→', '↔', '⁺', '⁻'].includes(c)),
    ).toEqual([]);
  }, 30_000);
});

describe('export files', () => {
  it('embeds only the self-hosted fonts in the SVG, as data URIs', async () => {
    const ctx = await contextFor(project, { anonymise: true, excludeSigned: false });
    const svg = (await svgExport(ctx, mapState, deps, '')).text;
    expect(svg).toMatch(
      /@font-face\{font-family:'Fira Sans Condensed'.*src:url\(data:font\/woff2;base64,/,
    );
    expect(svg).not.toMatch(/url\((?!data:|#)/);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  });

  it('draws ties as on screen: one line per pair, arrowheads on one-way ties, no style by default', async () => {
    const ctx = await contextFor(project, { anonymise: true, excludeSigned: false });
    const { map } = mapExport(ctx, mapState, deps, '');
    expect(map.model.directed).toBe(true);
    const oneWay = map.model.edges.filter((e) => !e.reciprocated).length;
    expect(map.model.edges.some((e) => e.reciprocated)).toBe(true);
    expect(oneWay).toBeGreaterThan(0);
    const pairs = new Set(
      map.model.edges.map(
        (e) => `${String(Math.min(e.source, e.target))}-${String(Math.max(e.source, e.target))}`,
      ),
    );
    expect(pairs.size).toBe(map.model.edges.length);
    const heads = map.scene.arrows.reduce((s, a) => s + a.coords.length / 6, 0);
    expect(heads).toBeGreaterThan(0);
    expect(heads).toBeLessThanOrEqual(oneWay);
    expect(map.model.styleShown).toBe(false);
    // Legend labels wrap within the column, so the text is read without markup.
    const svg = (await svgExport(ctx, mapState, deps, '')).text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    expect(svg).toContain('One way, from rater to rated member');
    expect(svg).toContain('Both ways: one line, the two directions averaged');
    expect(svg).not.toContain('Edge style');
  });

  it('sizes the print PNG to the printable width of A4 landscape at 300 dpi', async () => {
    const ctx = await contextFor(project, { anonymise: true, excludeSigned: false });
    const { doc } = mapExport(ctx, mapState, deps, '');
    const width = Math.round(doc.width * pngScale('print', doc, theme));
    expect(width).toBe(Math.round((277 / 25.4) * 300));
    expect(pngScale('x2', doc, theme)).toBe(2);
  });
});
