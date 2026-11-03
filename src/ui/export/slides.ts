// The slide deck (build plan session 17): a 16:9 PDF with an opening slide
// about the data and one slide per saved view chosen, each with the view's
// caption or question as its title, the map (or, for a board or leadership
// team, the group picture) with its legend, and the sentences that read out
// its figures. Built from the same export contexts as the report's view pages
// (export/viewPages.ts), so names, the signed-layer exclusion, the audience
// level and the wave apply to every slide; export/pdf.ts draws it with pdf-lib.

import { computeQuality } from '../../data/quality';
import { coveragePercent, percent } from '../copy/data';
import { audienceCopy } from '../copy/audience';
import { exportCopy, reportCopy } from '../copy/export';
import { qualityCopy, qualityStatement } from '../copy/quality';
import { slidesCopy as S } from '../copy/slides';
import { assertAllowed } from '../state/audience';
import type { ExportContext } from './context';
import { wrap, type MapDocument, type Measure } from './document';
import type { ExportDeps } from './files';
import { pictureExport } from './files';
import type { MapState } from './mapScene';
import { refName } from './tables';
import { viewPage, type ReportView } from './report';
import { readExportTheme, readSlideTheme, type SlideTheme } from './theme';
import type { ViewSource } from './viewPages';
import { mapCopy } from '../copy/map';

export interface Slide {
  /** The view's caption, else its question, else its name. */
  title: string;
  /** The view's name, in the footer. */
  name: string;
  /** The question, when the title is not already the question. */
  question: string | null;
  sentences: string[];
  mapIntro: string;
  /** The coverage warning, on every slide while coverage is below the threshold. */
  warning: string | null;
}

export interface SlideDeck {
  title: string;
  subtitle: string;
  date: string;
  audience: string;
  cover: string[];
  statementHeading: string;
  statement: string[];
  slides: Slide[];
}

/** The plain name of the layer a picture draws. */
function layerName(ctx: ExportContext): string {
  const layer = ctx.settings.layer;
  if (ctx.policy.groupsOnly) return refName(ctx, layer);
  return layer === 'composite'
    ? mapCopy.controls.composite
    : (ctx.project.layers.find((l) => l.key === layer)?.label ?? layer);
}

function coverageWarning(ctx: ExportContext): string | null {
  const cov = ctx.result.coverage;
  if (!cov?.belowThreshold) return null;
  return reportCopy.coverage.warning(
    coveragePercent(cov.rate, cov.threshold),
    percent(cov.threshold),
  );
}

/** One slide from a report view page. */
export function slideFrom(page: ReportView, ctx: ExportContext): Slide {
  const title = page.caption !== '' ? page.caption : (page.question ?? page.title);
  return {
    title,
    name: page.title,
    question: page.question !== null && page.question !== title ? page.question : null,
    sentences: page.sentences,
    mapIntro: page.mapIntro,
    warning: coverageWarning(ctx),
  };
}

export interface DeckView {
  name: string;
  caption: string;
  ctx: ExportContext;
}

/** The deck's content: the opening slide and one slide per view (the map on screen when none). */
export function buildDeck(
  ctx: ExportContext,
  views: readonly DeckView[],
  now: Date,
  caption = '',
): SlideDeck {
  assertAllowed(ctx.policy, 'slides');
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const inputs =
    views.length > 0 ? views : [{ name: S.mapOnScreen, caption, ctx } satisfies DeckView];
  const slides = inputs.map((v) =>
    slideFrom(
      viewPage({ name: v.name, caption: v.caption, ctx: v.ctx, layerName: layerName(v.ctx) }),
      v.ctx,
    ),
  );
  return {
    title: ctx.names.text(ctx.project.meta.title),
    subtitle: S.subtitle,
    date: S.date(date),
    audience: audienceCopy.cover(ctx.policy.level, ctx.policy.minGroupSize),
    cover: [
      ctx.anonymised ? reportCopy.cover.anonymised : reportCopy.cover.named,
      ...(ctx.excludeSigned
        ? [ctx.reanalysed ? reportCopy.cover.excluded : reportCopy.cover.excludedNone]
        : []),
      S.descriptive,
    ],
    statementHeading: qualityCopy.exportHeading,
    statement: qualityStatement(computeQuality(ctx.project, ctx.wave.wave)),
    slides,
  };
}

/** Every piece of text in the deck (tests check it for names and excluded layers). */
export function deckText(deck: SlideDeck): string[] {
  return [
    deck.title,
    deck.subtitle,
    deck.date,
    deck.audience,
    ...deck.cover,
    deck.statementHeading,
    ...deck.statement,
    ...deck.slides.flatMap((s) => [
      s.title,
      s.name,
      ...(s.question ? [s.question] : []),
      ...s.sentences,
      s.mapIntro,
      ...(s.warning ? [s.warning] : []),
    ]),
  ];
}

/** Height of a slide's title, wrapped to the slide's width. */
export function slideTitleHeight(title: string, theme: SlideTheme, measure: Measure): number {
  const lines = wrap(title, theme.width - theme.margin * 2, (x) =>
    measure(x, 'medium', theme.title.size),
  );
  return lines.length * theme.title.line;
}

/** The picture's box on a slide: right of the text column, below the title, above the footer. */
export function pictureBox(title: string, theme: SlideTheme, measure: Measure) {
  const top = theme.margin + slideTitleHeight(title, theme, measure) + theme.gap;
  const left = theme.margin + theme.textWidth + theme.gap;
  return {
    x: left,
    y: top,
    width: theme.width - theme.margin - left,
    height: theme.height - theme.margin - top,
  };
}

export interface SlidesExport {
  fileName: string;
  bytes: Uint8Array;
  deck: SlideDeck;
  /** Each slide's picture, in order. */
  docs: MapDocument[];
  pages: number;
  substituted: string[];
}

/** The deck as a 16:9 PDF; with no views chosen, one slide of the map on screen. */
export async function slidesExport(
  ctx: ExportContext,
  state: MapState,
  deps: ExportDeps,
  views: readonly ViewSource[] = [],
  caption = '',
): Promise<SlidesExport> {
  assertAllowed(ctx.policy, 'slides');
  const deck = buildDeck(
    ctx,
    views.map((v) => ({ name: v.view.name, caption: v.view.caption, ctx: v.ctx })),
    deps.now,
    caption,
  );
  const theme = readSlideTheme(deps.tokens);
  const ex = readExportTheme(deps.tokens);
  const sources = views.length > 0 ? views : [{ ctx, state }];
  const docs = sources.map((source, k) => {
    const slide = deck.slides[k] as Slide;
    const box = pictureBox(slide.title, theme, deps.measure);
    // The members are fitted into the space the picture has, beside its legend, at full size.
    const fitTo = {
      width: Math.max(box.width - ex.gap - ex.legendWidth, ex.legendWidth),
      height: Math.max(box.height - ex.padding, ex.legendWidth),
    };
    return pictureExport(source.ctx, source.state, deps, '', fitTo).doc;
  });
  const { slidesPdf } = await import('./pdf');
  const out = await slidesPdf({
    deck,
    docs,
    exportTheme: ex,
    slide: theme,
    loadFont: deps.loadFont,
    inflate: deps.inflate,
    now: deps.now,
  });
  const date = deps.now.toISOString().slice(0, 10);
  return {
    fileName: S.file(
      `${date}${exportCopy.suffix(ctx.anonymised, ctx.reanalysed, ctx.policy.level, ctx.wave.shown ? ctx.wave.wave : null)}`,
    ),
    bytes: out.bytes,
    deck,
    docs,
    pages: out.pages,
    substituted: out.substituted,
  };
}
