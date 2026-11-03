// The workshop pack, slides and notes on the map (build plan session 17): the
// deck, the pack and the notes under both export settings (Hide names, and
// leaving out how people feel about each other and friction) and at each
// audience level, with the notes drawn by the scene into every renderer.

import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { memberCodes } from '../../src/data/anonymise';
import { parseProject, serialiseProject } from '../../src/data/projectFile';
import type { AudienceLevel, MapAnnotation, Project, SavedView } from '../../src/data/schema';
import { analyse } from '../../src/engine/analyse';
import { paintDocument, pngScale, type PaintContext } from '../../src/ui/export/canvas';
import { documentText, roughMeasure } from '../../src/ui/export/document';
import { mapExport, svgExport, type ExportDeps } from '../../src/ui/export/files';
import type { MapState } from '../../src/ui/export/mapScene';
import { deckText, slidesExport } from '../../src/ui/export/slides';
import { readExportTheme } from '../../src/ui/export/theme';
import { packExport, packText } from '../../src/ui/export/workshop';
import { chosenViews, viewSources } from '../../src/ui/export/viewPages';
import { buildMapModel } from '../../src/ui/map/model';
import { buildScene, NO_HIGHLIGHT } from '../../src/ui/map/scene';
import { noteProblem, nextNoteId, withNote } from '../../src/ui/state/annotations';
import type { AudienceChoice } from '../../src/ui/state/audienceSettings';
import { allows } from '../../src/ui/state/audience';
import { initialWeightState } from '../../src/ui/state/presets';
import { mapToSaved, savedToMap } from '../../src/ui/state/savedViews';
import { openingMapSettings } from '../../src/ui/state/store';
import {
  EXCLUDED_KEYS,
  contextFor,
  diskFonts,
  methodNotes,
  nodeInflate,
  sensitiveProject,
  tokensCss,
} from './exportHarness';

const sensitive = sensitiveProject();
const NAMES = sensitive.members.map((m) => m.display_name);
const CODES = memberCodes(sensitive.members).codes;
const IDS = sensitive.members.map((m) => m.id);
const EXCLUDED_LABELS = sensitive.layers
  .filter((l) => EXCLUDED_KEYS.includes(l.key))
  .map((l) => l.label);
const deps: ExportDeps = {
  tokens: tokensCss(),
  measure: roughMeasure,
  loadFont: diskFonts,
  inflate: nodeInflate,
  now: new Date('2026-11-03T12:00:00Z'),
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
const theme = readExportTheme(deps.tokens);

const finance = IDS.map((_, i) => i).filter(
  (i) => sensitive.members[i]?.attributes.team === 'Finance',
);
const others = IDS.map((_, i) => i).filter((i) => !finance.includes(i));
const inFinance = finance[0] ?? 0;
const outside = others[0] ?? 1;

// Notes: one on a Finance member naming them, one on another team's member naming
// them, and one at a point. Unique words show whether each note was drawn.
const NOTES: MapAnnotation[] = [
  {
    id: 'n1',
    text: `Alphanote ${NAMES[inFinance] ?? ''}`,
    anchor: { kind: 'member', member: IDS[inFinance] ?? '' },
    side: 'aboveRight',
  },
  {
    id: 'n2',
    text: `Betanote ${NAMES[outside] ?? ''}`,
    anchor: { kind: 'member', member: IDS[outside] ?? '' },
    side: 'belowLeft',
  },
  { id: 'n3', text: 'Gammanote here', anchor: { kind: 'point', x: 0, y: 0 }, side: 'aboveLeft' },
];

const opening = { ...openingMapSettings(sensitive), annotations: NOTES };
const W = { preset: 'custom' as const, custom: {}, customTreatment: {} };
function view(id: string, name: string, caption: string): SavedView {
  return {
    id,
    name,
    caption,
    created_at: '2026-11-03T00:00:00.000Z',
    weights: W,
    map: mapToSaved(opening),
    positions: {},
    selection: { member: null, group: [] },
  };
}
const project: Project = {
  ...sensitive,
  saved_views: [
    view('v1', `Around ${NAMES[0] ?? ''}`, `Where ${NAMES[0] ?? ''} meets others.`),
    view('v2', 'Second view', ''),
  ],
};

const choice = (level: AudienceLevel): AudienceChoice => ({
  level,
  team: level === 'workshop' ? 'Finance' : null,
  member: level === 'oneToOne' ? (IDS[0] ?? null) : null,
});

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

const word = (w: string) =>
  new RegExp(
    `(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`,
    'u',
  );
const membersIn = (text: string, among = IDS.map((_, i) => i)) =>
  among
    .flatMap((i) => [NAMES[i] ?? '', CODES[i] ?? '', IDS[i] ?? ''])
    .filter((w) => w !== '' && word(w).test(text));

async function setUp(level: AudienceLevel, anonymise: boolean, excludeSigned: boolean) {
  const audience = choice(level);
  const ctx = await contextFor(project, { anonymise, excludeSigned, audience, map: opening });
  const request = {
    project,
    result: ctx.result,
    map: opening,
    weights: initialWeightState(),
    anonymise,
    excludeSigned,
    audience,
  };
  return { ctx, request };
}

const LEVELS: AudienceLevel[] = ['analyst', 'board', 'leadership', 'workshop', 'oneToOne'];
const SETTINGS: [boolean, boolean][] = [
  [true, true],
  [true, false],
  [false, true],
  [false, false],
];

describe.each(SETTINGS)(
  'slides: names hidden %s, signed layers left out %s',
  (anonymise, excludeSigned) => {
    it.each(LEVELS)(
      '%s',
      async (level) => {
        const { ctx, request } = await setUp(level, anonymise, excludeSigned);
        if (level === 'oneToOne') {
          expect(allows(ctx.policy, 'slides')).toBe(false);
          await expect(slidesExport(ctx, mapState, deps)).rejects.toThrow();
          return;
        }
        const views = await viewSources(request, chosenViews(project, null), (i) => analyse(i));
        const out = await slidesExport(ctx, mapState, deps, views);
        // An opening slide and one slide per view, 16:9.
        expect(out.deck.slides).toHaveLength(2);
        expect(out.pages).toBe(3);
        const pdf = await getDocument({ data: out.bytes.slice(), isEvalSupported: false }).promise;
        const page = await pdf.getPage(2);
        const [, , w, h] = page.view;
        expect((w ?? 0) / (h ?? 1)).toBeCloseTo(16 / 9, 2);
        expect(out.substituted).toEqual([]);
        const drawn = out.docs.flatMap((d) => documentText(d)).join('\n');
        const text = `${await pdfText(out.bytes)}\n${deckText(out.deck).join('\n')}\n${drawn}`;
        // The caption is the title; the view's name is in the footer.
        expect(out.deck.slides[1]?.title).toBe(
          out.deck.slides[1]?.question ?? out.deck.slides[1]?.title,
        );
        expect(text).toContain('Second view');
        // Names: none at board and leadership; only the team at a workshop; hidden names never.
        if (level === 'board' || level === 'leadership') expect(membersIn(text)).toEqual([]);
        if (level === 'workshop') expect(membersIn(text, others)).toEqual([]);
        if (anonymise) expect(NAMES.filter((n) => text.includes(n))).toEqual([]);
        if (level === 'analyst' && !anonymise) expect(text).toContain(NAMES[0]);
        // Notes: drawn on member maps; a workshop sees its team's note and the point; a board none.
        if (level === 'analyst') {
          for (const n of ['Alphanote', 'Betanote', 'Gammanote']) expect(drawn).toContain(n);
        } else if (level === 'workshop') {
          expect(drawn).toContain('Alphanote');
          expect(drawn).toContain('Gammanote');
          expect(drawn).not.toContain('Betanote');
        } else expect(drawn).not.toMatch(/Alphanote|Betanote|Gammanote/);
        if (excludeSigned) for (const label of EXCLUDED_LABELS) expect(text).not.toContain(label);
        else if (level === 'analyst') expect(text).toMatch(/Valence|valence/);
      },
      90_000,
    );
  },
);

describe.each(SETTINGS)(
  'workshop pack: names hidden %s, signed layers left out %s',
  (anonymise, excludeSigned) => {
    it.each(LEVELS)(
      '%s',
      async (level) => {
        const { ctx, request } = await setUp(level, anonymise, excludeSigned);
        const run = () => packExport(request, ctx, mapState, deps, (i) => analyse(i));
        if (level !== 'analyst' && level !== 'workshop') {
          expect(allows(ctx.policy, 'pack')).toBe(false);
          await expect(run()).rejects.toThrow();
          return;
        }
        const out = await run();
        const teams = [...new Set(sensitive.members.map((m) => m.attributes.team))];
        expect(out.pack.sections.map((s) => s.group).sort()).toEqual(
          level === 'workshop' ? ['Finance'] : teams.filter((t): t is string => !!t).sort(),
        );
        expect(out.substituted).toEqual([]);
        const pdf = await pdfText(out.bytes);
        for (const s of out.pack.sections) {
          // Each group's own network shows its members only.
          const own = IDS.map((_, i) => i).filter(
            (i) => sensitive.members[i]?.attributes.team === s.group,
          );
          const rest = IDS.map((_, i) => i).filter((i) => !own.includes(i));
          const drawn = documentText(s.doc).join('\n');
          expect(membersIn(drawn, rest)).toEqual([]);
          expect(membersIn(drawn, own).length).toBeGreaterThan(0);
          // Names only when the group agreed and names are not hidden: no agreement here.
          expect(s.named).toBe(false);
          expect(NAMES.filter((n) => drawn.includes(n))).toEqual([]);
          expect(s.prompts.length).toBeGreaterThanOrEqual(3);
          for (const q of s.prompts) expect(q.endsWith('?')).toBe(true);
          expect(s.row[1]?.kind).toBe('table');
          // A note on another team's member is never drawn in a group's section.
          if (s.group !== 'Finance') expect(drawn).not.toContain('Alphanote');
        }
        const text = `${pdf}\n${packText(out.pack).join('\n')}`;
        expect(NAMES.filter((n) => text.includes(n))).toEqual([]);
        if (excludeSigned) for (const label of EXCLUDED_LABELS) expect(text).not.toContain(label);
        expect(out.fileName).toMatch(/^graticule-workshop-pack-2026-11-03/);
      },
      120_000,
    );
  },
);

// -------------------------------------------------------------- notes

/** A canvas context that records the text drawn. */
function recorder() {
  const texts: string[] = [];
  const ctx = new Proxy(
    { texts },
    {
      get: (_t, key) => {
        if (key === 'fillText' || key === 'strokeText')
          return (text: string) => {
            texts.push(text);
          };
        return () => undefined;
      },
      set: () => true,
    },
  ) as unknown as PaintContext;
  return { ctx, texts };
}

describe.each(SETTINGS)(
  'notes on the map: names hidden %s, signed layers left out %s',
  (anonymise, excludeSigned) => {
    it('are drawn in the PNG, SVG and PDF with names through the names layer', async () => {
      const ctx = await contextFor(project, { anonymise, excludeSigned, map: opening });
      const { doc } = mapExport(ctx, mapState, deps, '');
      const r = recorder();
      paintDocument(r.ctx, doc, theme, pngScale('x1', doc, theme));
      const svg = (await svgExport(ctx, mapState, deps, '')).text.replace(
        /<style>[\s\S]*?<\/style>/,
        '',
      );
      for (const text of [r.texts.join('\n'), svg]) {
        for (const n of ['Alphanote', 'Betanote', 'Gammanote']) expect(text).toContain(n);
        if (anonymise) {
          expect(text).not.toContain(NAMES[inFinance]);
          expect(text).toContain(CODES[inFinance]);
        } else expect(text).toContain(NAMES[inFinance]);
      }
    }, 60_000);
  },
);

describe('notes on the map', () => {
  it('validates text, numbers ids and caps the count', () => {
    expect(noteProblem('')).not.toBeNull();
    expect(noteProblem('x'.repeat(81))).not.toBeNull();
    expect(noteProblem('x'.repeat(80))).toBeNull();
    expect(nextNoteId(NOTES)).toBe('n4');
    let notes: MapAnnotation[] = [];
    for (let k = 0; k < 12; k++)
      notes =
        withNote(notes, `Note ${String(k)}`, { kind: 'point', x: 0, y: 0 }, 'aboveRight') ?? notes;
    expect(notes).toHaveLength(12);
    expect(withNote(notes, 'One more', { kind: 'point', x: 0, y: 0 }, 'aboveRight')).toBeNull();
  });

  it('are saved with a view and checked on load', () => {
    const file = serialiseProject(project);
    const back = parseProject(file);
    const saved = back.saved_views[0]?.map;
    if (!saved) throw new Error('no view');
    expect(saved.annotations).toEqual(NOTES);
    expect(savedToMap(saved, back).annotations).toEqual(NOTES);
    // A view without notes restores with none.
    const plain = { ...saved };
    delete plain.annotations;
    expect(savedToMap(plain, back).annotations).toEqual([]);
    // A note too long, on an unknown side or at a point that is not one, is refused.
    const bad = (a: unknown) =>
      serialiseProject({
        ...project,
        saved_views: [
          {
            ...(project.saved_views[0] as SavedView),
            map: { ...saved, annotations: [a as MapAnnotation] },
          },
        ],
      });
    expect(() => parseProject(bad({ ...NOTES[0], text: 'x'.repeat(81) }))).toThrow();
    expect(() => parseProject(bad({ ...NOTES[0], side: 'middle' }))).toThrow();
    expect(() =>
      parseProject(bad({ ...NOTES[2], anchor: { kind: 'point', x: 'a', y: 0 } })),
    ).toThrow();
  });

  it('are drawn by the scene: a member note only while the member is shown', async () => {
    const ctx = await contextFor(project, { anonymise: false, excludeSigned: false, map: opening });
    const t = readExportTheme(deps.tokens).map;
    const names = sensitive.members.map((m) => m.display_name);
    const positions = sensitive.members.map((_, i) => ({ x: i * 10, y: (i % 5) * 10 }));
    const build = (filters: { key: string; values: string[] }[]) => {
      const model = buildMapModel(ctx.project, ctx.result, { ...ctx.settings, filters }, t, names);
      return buildScene(
        model,
        positions,
        { x: 100, y: 100, k: 1 },
        { width: 800, height: 600 },
        t,
        NO_HIGHLIGHT,
      );
    };
    const all = build([]);
    expect(all.callouts).toHaveLength(3);
    const point = all.callouts.find((c) => c.dot !== null);
    expect(point?.dot).toEqual({ x: 100, y: 100 });
    // Above left: the text ends left of its anchor, right-aligned.
    expect(point?.align).toBe('right');
    expect((point?.lines[0]?.x ?? 0) < 100).toBe(true);
    const finOnly = build([{ key: 'team', values: ['Finance'] }]);
    expect(finOnly.callouts.map((c) => c.lines.map((l) => l.text).join(' '))).toEqual([
      expect.stringContaining('Alphanote'),
      expect.stringContaining('Gammanote'),
    ]);
  }, 60_000);
});
