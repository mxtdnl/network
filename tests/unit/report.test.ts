// The storyline report (build plan session 10): the executive summary drafted
// from the observations and edited per audience level, one page per saved
// view, data quality, the method in brief, the appendices and the ethics
// statement, at every audience level that has a report and under both export
// settings (Hide names, and leaving out valence, energy and conflict).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { memberCodes } from '../../src/data/anonymise';
import { parseProject, serialiseProject } from '../../src/data/projectFile';
import type { AudienceLevel, Project, SavedSummary, SavedView } from '../../src/data/schema';
import { analyse } from '../../src/engine/analyse';
import { roughMeasure } from '../../src/ui/export/document';
import { pdfExport, type ExportDeps } from '../../src/ui/export/files';
import type { MapState } from '../../src/ui/export/mapScene';
import { readerNotes } from '../../src/ui/export/methodNotes';
import { buildReport, reportText } from '../../src/ui/export/report';
import {
  draftHeadlines,
  draftSummary,
  reconcileSummary,
  reportSummary,
  savedFromDraft,
  summaryFlags,
  SUMMARY_RULES,
} from '../../src/ui/export/summary';
import { chosenViews, viewSources } from '../../src/ui/export/viewPages';
import { reportCopy } from '../../src/ui/copy/export';
import { summaryCopy } from '../../src/ui/copy/summary';
import type { AudienceChoice } from '../../src/ui/state/audienceSettings';
import { initialWeightState } from '../../src/ui/state/presets';
import { questionSettings } from '../../src/ui/state/questions';
import { mapToSaved } from '../../src/ui/state/savedViews';
import { openingMapSettings } from '../../src/ui/state/store';
import {
  EXCLUDED_KEYS,
  contextFor,
  diskFonts,
  methodNotes,
  nodeInflate,
  root,
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
  now: new Date('2026-10-28T12:00:00Z'),
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

const opening = openingMapSettings(sensitive);
const W = { preset: 'custom' as const, custom: {}, customTreatment: {} };
function view(
  id: string,
  name: string,
  caption: string,
  question: 'groups' | 'informal',
): SavedView {
  return {
    id,
    name,
    caption,
    created_at: '2026-10-28T00:00:00.000Z',
    weights: W,
    map: mapToSaved({ ...opening, ...questionSettings(question, sensitive, opening).map }),
    positions: {},
    selection: { member: null, group: [] },
  };
}
// Two views; the first names a member by full name in its title and caption.
const project: Project = {
  ...sensitive,
  saved_views: [
    view('v1', `Teams around ${NAMES[0] ?? ''}`, `Where ${NAMES[0] ?? ''} meets Sales.`, 'groups'),
    view('v2', 'Work outside the structure', 'Informal collaboration by team.', 'informal'),
  ],
};

const choice = (level: AudienceLevel): AudienceChoice => ({
  level,
  team: level === 'workshop' ? 'Finance' : null,
  member: null,
});

async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  let text = '';
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
/** Members' names, codes and ids found in a text, as whole words. */
const membersIn = (text: string, among = IDS.map((_, i) => i)) =>
  among
    .flatMap((i) => [NAMES[i] ?? '', CODES[i] ?? '', IDS[i] ?? ''])
    .filter((w) => w !== '' && word(w).test(text));

async function exportFor(
  p: Project,
  level: AudienceLevel,
  anonymise: boolean,
  excludeSigned: boolean,
  appendices = true,
) {
  const audience = choice(level);
  const ctx = await contextFor(p, { anonymise, excludeSigned, audience, map: opening });
  const views = await viewSources(
    {
      project: p,
      result: ctx.result,
      map: opening,
      weights: initialWeightState(),
      anonymise,
      excludeSigned,
      audience,
    },
    chosenViews(p, null),
    (input) => analyse(input),
  );
  const out = await pdfExport(ctx, mapState, deps, '', { views, appendices });
  return { ctx, out, text: `${await pdfText(out.bytes)}\n${reportText(out.report).join('\n')}` };
}

// -------------------------------------------------------------------- sweep

const LEVELS: AudienceLevel[] = ['analyst', 'board', 'leadership', 'workshop'];
const finance = IDS.map((_, i) => i).filter(
  (i) => sensitive.members[i]?.attributes.team === 'Finance',
);
const others = IDS.map((_, i) => i).filter((i) => !finance.includes(i));

describe.each([
  [true, true],
  [true, false],
  [false, true],
  [false, false],
])(
  'the storyline report: names hidden %s, signed layers left out %s',
  (anonymise, excludeSigned) => {
    it.each(LEVELS)(
      '%s: cover, summary, a page per view, data quality, method, appendices, ethics',
      async (level) => {
        const { out, text } = await exportFor(project, level, anonymise, excludeSigned);
        const r = out.report;
        // Parts in order.
        expect(r.contents).toEqual([
          summaryCopy.heading,
          r.views[0]?.title,
          r.views[1]?.title,
          ...r.sections.map((s) => s.title),
        ]);
        const titles = r.sections.map((s) => s.title);
        const S = reportCopy.sections;
        expect(titles.slice(-5)).toEqual([S.brief, S.metrics, S.insights, S.method, S.ethics]);
        expect(titles).toContain(S.coverage);
        expect(r.views).toHaveLength(2);
        expect(out.docs).toHaveLength(2);
        expect(r.views.map((v) => v.question)).toEqual([
          'Where do teams connect, and where not?',
          'Where does work happen outside the formal structure?',
        ]);
        expect(r.audience).toContain('Prepared for');
        expect(r.statement.length).toBeGreaterThan(0);
        expect(r.summary.headlines.length).toBeLessThanOrEqual(SUMMARY_RULES.maxHeadlines);
        for (const t of [summaryCopy.heading, S.brief, S.ethics, 'Work outside the structure'])
          expect(text).toContain(t);
        for (const h of r.summary.headlines) expect(text).toContain(h.title.slice(0, 30));
        // Names: none at board and leadership; only the team at a workshop; hidden names never.
        if (level === 'board' || level === 'leadership') expect(membersIn(text)).toEqual([]);
        if (level === 'workshop') expect(membersIn(text, others)).toEqual([]);
        if (anonymise) expect(NAMES.filter((n) => text.includes(n))).toEqual([]);
        if (level === 'analyst' && !anonymise) expect(text).toContain(NAMES[0]);
        // The view's title names a member: replaced by code, or "a colleague" for an audience.
        if (level === 'board') expect(r.views[0]?.title).toBe('Teams around a colleague');
        // Leaving out signed and conflict layers leaves no trace of them.
        const summaryAndBrief = [
          ...r.summary.intro,
          ...r.summary.headlines.flatMap((h) => [h.title, h.saw, h.matters, ...h.questions]),
          ...(r.sections.find((s) => s.title === S.brief)?.blocks ?? []).map((b) =>
            b.kind === 'paragraph' ? `${b.lead ?? ''} ${b.text}` : '',
          ),
          ...r.views.flatMap((v) => v.sentences),
        ].join('\n');
        if (excludeSigned) {
          for (const label of EXCLUDED_LABELS) expect(text).not.toContain(label);
          expect(summaryAndBrief).not.toMatch(/negative ratings|valence/i);
        } else expect(summaryAndBrief).toMatch(/Negative ratings/);
      },
      60_000,
    );
  },
);

describe('report choices', () => {
  it('leaves the appendices out on request, keeping the method in brief', async () => {
    const { out, text } = await exportFor(project, 'analyst', true, false, false);
    const titles = out.report.sections.map((s) => s.title);
    const S = reportCopy.sections;
    for (const t of [S.metrics, S.insights, S.method]) {
      expect(titles).not.toContain(t);
      expect(text).not.toContain(t);
    }
    expect(titles).toEqual([S.coverage, S.brief, S.ethics]);
  }, 60_000);

  it('shows the map on screen when no view is chosen, and chosen views in presentation order', async () => {
    expect(chosenViews(project, []).map((v) => v.id)).toEqual([]);
    expect(chosenViews(project, ['v2', 'v1']).map((v) => v.id)).toEqual(['v1', 'v2']);
    const ctx = await contextFor(project, { anonymise: true, excludeSigned: false, map: opening });
    const out = await pdfExport(ctx, mapState, deps, 'On screen.');
    expect(out.report.views.map((v) => v.title)).toEqual([reportCopy.sections.map]);
    expect(out.report.views[0]?.caption).toBe('On screen.');
    expect(out.report.question).toBe('Who is connected to whom?');
  }, 60_000);

  it('analyses each view with its own settings', async () => {
    const ctx = await contextFor(project, { anonymise: true, excludeSigned: false, map: opening });
    const views = await viewSources(
      {
        project,
        result: ctx.result,
        map: opening,
        weights: initialWeightState(),
        anonymise: true,
        excludeSigned: false,
      },
      project.saved_views,
      (input) => analyse(input),
    );
    expect(views.map((v) => v.ctx.settings.question)).toEqual(['groups', 'informal']);
    expect(views[1]?.ctx.settings.layer).toBe('informal_collaboration');
  }, 60_000);

  it('refuses a report at one-to-one level', async () => {
    const ctx = await contextFor(project, {
      anonymise: true,
      excludeSigned: false,
      audience: { level: 'oneToOne', team: null, member: IDS[0] ?? null },
    });
    await expect(pdfExport(ctx, mapState, deps, '')).rejects.toThrow();
  });
});

// ------------------------------------------------------------------ summary

const demo = parseProject(readFileSync(join(root, 'src/demo/demo.ona.json'), 'utf8'));

describe('the executive summary draft', () => {
  it('drafts the demo’s group-level headlines, with routes for the analyst only', async () => {
    const analyst = await contextFor(demo, {
      anonymise: true,
      excludeSigned: false,
      map: openingMapSettings(demo),
    });
    const ids = draftHeadlines(analyst).map((h) => h.id);
    expect(ids).toEqual([
      'group:team=Finance',
      'formalOnly:Product|Sales',
      'informalOnly:People|Product',
      'routes',
    ]);
    const boardCtx = await contextFor(demo, {
      anonymise: true,
      excludeSigned: false,
      map: openingMapSettings(demo),
      audience: choice('board'),
    });
    expect(draftHeadlines(boardCtx).map((h) => h.id)).toEqual(ids.slice(0, 3));
    const s = draftSummary(boardCtx);
    expect(s.intro[0]).toBe(summaryCopy.audience.board);
    expect(s.headlines[0]?.title).toBe('Most of Finance’s ties stay within Finance.');
    expect(s.headlines[0]?.saw).toContain('54 of the 57 ties');
    expect(s.headlines[0]?.questions.every((q) => q.endsWith('?'))).toBe(true);
  }, 60_000);

  it('fills a short summary with groups’ mixing, pairs without ties and the formal–informal split', async () => {
    const text = readFileSync(join(root, 'src/demo/scenario-dense-team.ona.json'), 'utf8');
    const dense = parseProject(text);
    const ctx = await contextFor(dense, {
      anonymise: true,
      excludeSigned: false,
      map: openingMapSettings(dense),
      audience: choice('board'),
    });
    const kinds = draftHeadlines(ctx).map((h) => h.facts.kind);
    expect(kinds).toEqual(['mixing', 'balance']);
    // Fewer than three: the summary says so rather than inventing one.
    expect(draftSummary(ctx).intro.at(-1)).toBe(summaryCopy.fewer(2));
  }, 60_000);

  it('drafts a workshop’s team ties', async () => {
    const ctx = await contextFor(demo, {
      anonymise: true,
      excludeSigned: false,
      map: openingMapSettings(demo),
      audience: choice('workshop'),
    });
    expect(draftHeadlines(ctx).map((h) => h.id)).toEqual([
      'group:team=Finance',
      'teamTies:Finance',
    ]);
  }, 60_000);

  it('flags negative clusters to the analyst only, and never as a headline', async () => {
    const map = openingMapSettings(demo);
    const analyst = await contextFor(demo, { anonymise: true, excludeSigned: false, map });
    expect(summaryFlags(analyst)).toEqual([
      { kind: 'negativeCluster', ref: 'valence-', size: 4, pairs: 5 },
    ]);
    const ids = draftHeadlines(analyst).map((h) => h.id);
    expect(ids.some((id) => id.includes('negative'))).toBe(false);
    for (const level of ['board', 'leadership', 'workshop'] as const) {
      const ctx = await contextFor(demo, {
        anonymise: true,
        excludeSigned: false,
        map,
        audience: choice(level),
      });
      expect(summaryFlags(ctx)).toEqual([]);
    }
    const excluded = await contextFor(sensitive, { anonymise: true, excludeSigned: true, map });
    expect(summaryFlags(excluded)).toEqual([]);
  }, 60_000);
});

describe('the edited summary', () => {
  it('prints the edit saved for the level, names replaced, headlines left out omitted', async () => {
    const map = openingMapSettings(sensitive);
    const ctx0 = await contextFor(sensitive, { anonymise: true, excludeSigned: false, map });
    const saved = savedFromDraft(draftSummary(ctx0));
    const first = saved.headlines[0];
    if (!first) throw new Error('no headline');
    const edit: SavedSummary = {
      intro: `Prepared with ${NAMES[0] ?? ''}.\n\nSecond paragraph.`,
      headlines: [
        { ...first, title: `Finance and ${NAMES[1] ?? ''}` },
        { ...first, id: 'custom:1', title: 'Left out', include: false },
      ],
      closing: 'Thank you.',
    };
    const p: Project = {
      ...sensitive,
      settings: { ...sensitive.settings, summaries: { analyst: edit } },
    };
    const coded = await contextFor(p, { anonymise: true, excludeSigned: false, map });
    const s = reportSummary(coded);
    expect(s.intro).toEqual([`Prepared with ${CODES[0] ?? ''}.`, 'Second paragraph.']);
    expect(s.headlines.map((h) => h.title)).toEqual([`Finance and ${CODES[1] ?? ''}`]);
    expect(s.closing).toBe('Thank you.');
    // Saved for the analyst only: a board's report keeps its own draft, and names nobody.
    const boardCtx = await contextFor(p, {
      anonymise: false,
      excludeSigned: false,
      map,
      audience: choice('board'),
    });
    const b = reportSummary(boardCtx);
    expect(b).toEqual(draftSummary(boardCtx));
    const p2: Project = {
      ...p,
      settings: { ...p.settings, summaries: { analyst: edit, board: edit } },
    };
    const board2 = await contextFor(p2, {
      anonymise: false,
      excludeSigned: false,
      map,
      audience: choice('board'),
    });
    expect(reportSummary(board2).intro[0]).toBe('Prepared with a colleague.');
  }, 60_000);

  it('marks saved headlines the analysis no longer finds, and offers new ones', () => {
    const draft = {
      intro: ['Intro'],
      headlines: [
        { id: 'a', title: 'A', saw: '', matters: '', questions: [] },
        { id: 'c', title: 'C', saw: '', matters: '', questions: [] },
      ],
      closing: 'End',
    };
    const saved: SavedSummary = {
      intro: 'Mine',
      closing: 'End',
      headlines: [
        { id: 'a', title: 'A edited', saw: '', matters: '', questions: [], include: true },
        { id: 'b', title: 'B', saw: '', matters: '', questions: [], include: true },
        { id: 'custom:1', title: 'Mine', saw: '', matters: '', questions: [], include: true },
      ],
    };
    const r = reconcileSummary(draft, saved);
    expect(r.intro).toBe('Mine');
    expect(r.headlines.map((h) => [h.headline.id, h.stale, h.fresh, h.headline.include])).toEqual([
      ['a', false, false, true],
      ['b', true, false, true],
      ['custom:1', false, false, true],
      ['c', false, true, false],
    ]);
    // With nothing saved, the draft is the starting point, every headline included.
    const fresh = reconcileSummary(draft, undefined);
    expect(fresh.intro).toBe('Intro');
    expect(fresh.headlines.every((h) => h.headline.include && !h.stale && !h.fresh)).toBe(true);
  });

  it('round-trips through the project file and refuses a malformed summary', () => {
    const edit: SavedSummary = {
      intro: 'Intro',
      closing: 'End',
      headlines: [
        { id: 'custom:1', title: 'T', saw: 'S', matters: 'M', questions: ['Q?'], include: true },
      ],
    };
    const p: Project = { ...demo, settings: { ...demo.settings, summaries: { board: edit } } };
    expect(parseProject(serialiseProject(p)).settings.summaries).toEqual({ board: edit });
    expect(parseProject(serialiseProject(demo)).settings.summaries).toBeUndefined();
    const bad = JSON.parse(serialiseProject(p)) as { settings: { summaries: unknown } };
    bad.settings.summaries = { board: { intro: 'x', closing: 'y', headlines: [{ id: '' }] } };
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/summaries/);
    bad.settings.summaries = { everyone: edit };
    expect(() => parseProject(JSON.stringify(bad))).toThrow(/summaries/);
  });
});

describe('the method in brief', () => {
  it('reads the notes for readers, leaving out what the analysis lacks or the exclusion removes', () => {
    const notes = methodNotes();
    const all = readerNotes(notes, { signed: true, formalInformal: true, excludeSigned: false });
    expect(all.notes.map((n) => n.heading)).toContain('Negative ratings');
    expect(all.notes.length).toBeGreaterThanOrEqual(15);
    for (const n of all.notes) expect(n.text.length).toBeGreaterThan(20);
    const ex = readerNotes(notes, { signed: true, formalInformal: false, excludeSigned: true });
    const headings = ex.notes.map((n) => n.heading);
    expect(headings).not.toContain('Negative ratings');
    expect(headings).not.toContain('Formal and informal collaboration');
    expect(ex.notes.map((n) => n.text).join(' ')).not.toMatch(/valence|signed|conflict/i);
  });

  it('keeps the technical notes in the appendix, reading the full definitions', async () => {
    const ctx = await contextFor(demo, { anonymise: true, excludeSigned: false });
    const r = buildReport(ctx, { notes: methodNotes(), now: deps.now, layerName: 'x' });
    const method = r.sections.find((s) => s.title === reportCopy.sections.method);
    const text = JSON.stringify(method?.blocks);
    // The full note on density, not the reader's sentence (section 19 repeats its heading in plain words).
    expect(text).toContain('Meaning');
    expect(text).toContain('Density');
  });
});
