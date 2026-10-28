// Builds each export file from the export context. Shared by the browser
// (export actions) and the tests, so what is tested is what is downloaded;
// only the PNG's rasterising and the download itself need a browser.

import { exportCopy, reportCopy } from '../copy/export';
import type { ExportContext } from './context';
import { composeMap, wrap, type MapDocument, type Measure } from './document';
import type { FontLoader, Inflate } from './fonts';
import { exportMap, type ExportMap, type MapState } from './mapScene';
import { groupMapExport } from './groupDocument';
import { assertAllowed } from '../state/audience';
import { buildCard, type CardModel } from '../state/card';
import { buildReport, type ReportModel, type ReportView } from './report';
import type { ViewSource } from './viewPages';
import { mapCopy } from '../copy/map';
import { documentToSvg } from './svg';
import { refName, viewSlug } from './tables';
import {
  readExportTheme,
  readPrintTheme,
  type ExportTheme,
  type PrintTheme,
  type TokenSource,
} from './theme';

export interface ExportDeps {
  tokens: TokenSource;
  measure: Measure;
  loadFont: FontLoader;
  inflate: Inflate;
  now: Date;
  /** docs/method-notes.md as text. */
  notes: string;
}

export interface MapExport {
  doc: MapDocument;
  map: ExportMap;
  theme: ExportTheme;
}

/** The composed map picture: map, legend and caption (names in the caption replaced when anonymised). */
export function mapExport(
  ctx: ExportContext,
  state: MapState,
  deps: Pick<ExportDeps, 'tokens' | 'measure'>,
  caption: string,
  fitTo: { width: number; height: number } | null = null,
): MapExport {
  // The member map: for a board or leadership team, the picture is the group map (pictureExport).
  assertAllowed(ctx.policy, 'map');
  if (ctx.policy.groupsOnly) throw new Error(exportCopy.groupsOnly);
  const theme = readExportTheme(deps.tokens);
  const map = exportMap(
    ctx,
    state,
    theme,
    (text) => deps.measure(text, 'label', theme.map.labelSize),
    fitTo,
  );
  const doc = composeMap({
    scene: map.scene,
    model: map.model,
    extras: map.extras,
    theme,
    caption: ctx.names.text(caption),
    measure: deps.measure,
    title: reportCopy.mapTitle(ctx.names.text(ctx.project.meta.title)),
  });
  return { doc, map, theme };
}

export interface PictureExport {
  doc: MapDocument;
  theme: ExportTheme;
  layerName: string;
}

/**
 * The picture an audience may see (build plan session 9): the group map for a
 * board or a leadership team, otherwise the member map (a workshop's filtered
 * to its team by the export context).
 */
export function pictureExport(
  ctx: ExportContext,
  state: MapState,
  deps: Pick<ExportDeps, 'tokens' | 'measure'>,
  caption: string,
  fitTo: { width: number; height: number } | null = null,
): PictureExport {
  assertAllowed(ctx.policy, 'map');
  if (ctx.policy.groupsOnly) {
    const { doc, theme, layerName } = groupMapExport(ctx, deps, caption, fitTo);
    return { doc, theme, layerName };
  }
  const { doc, theme, map } = mapExport(ctx, state, deps, caption, fitTo);
  return { doc, theme, layerName: map.layerName };
}

export function mapFileName(ctx: ExportContext, ext: 'png' | 'svg'): string {
  return exportCopy.files.map(viewSlug(ctx), ext);
}

export async function svgExport(
  ctx: ExportContext,
  state: MapState,
  deps: ExportDeps,
  caption: string,
): Promise<{ fileName: string; text: string; doc: MapDocument }> {
  const { doc, theme, layerName } = pictureExport(ctx, state, deps, caption);
  const description = [reportCopy.map.intro(layerName), ctx.names.text(caption)]
    .filter((s) => s.trim() !== '')
    .join(' ');
  const text = await documentToSvg(doc, theme, deps.loadFont, description);
  return { fileName: mapFileName(ctx, 'svg'), text, doc };
}

export interface PdfExport {
  fileName: string;
  bytes: Uint8Array;
  report: ReportModel;
  /** The first view's picture. */
  doc: MapDocument;
  /** Every view's picture, in page order. */
  docs: MapDocument[];
  pages: number;
  substituted: string[];
}

/** What the report holds besides the export context (build plan session 10). */
export interface ReportChoice {
  /** Saved views to show, one page each, in presentation order; none shows the map on screen. */
  views?: readonly ViewSource[];
  /** Print the appendices; on by default. */
  appendices?: boolean;
}

/** The plain name of the layer a picture draws, as pictureExport names it. */
function pictureLayerName(ctx: ExportContext): string {
  const layer = ctx.settings.layer;
  if (ctx.policy.groupsOnly) return refName(ctx, layer);
  return layer === 'composite'
    ? mapCopy.controls.composite
    : (ctx.project.layers.find((l) => l.key === layer)?.label ?? layer);
}

/** Height of a view page's text above its map, laid out as export/pdf.ts lays it out. */
function viewTextHeight(v: ReportView, print: PrintTheme, measure: Measure): number {
  const width = print.pageHeight - print.margin * 2;
  const measureWidth = Math.min(print.measure, width);
  const lines = (text: string, size: number, w: number, role: 'regular' | 'medium') =>
    wrap(text, w, (x) => measure(x, role, size)).length;
  let h = lines(v.title, print.heading.size, width, 'medium') * print.heading.line;
  h += print.space[3] ?? 0;
  const para = (text: string, small: boolean) => {
    const style = small ? print.small : print.body;
    h += lines(text, style.size, measureWidth, 'regular') * style.line + (print.space[1] ?? 0);
  };
  if (v.question) para(`${reportCopy.view.question} ${v.question}`, false);
  if (v.caption !== '') para(v.caption, false);
  for (const s of v.sentences) para(s, true);
  para(v.mapIntro, true);
  return h;
}

export async function pdfExport(
  ctx: ExportContext,
  state: MapState,
  deps: ExportDeps,
  caption: string,
  choice: ReportChoice = {},
): Promise<PdfExport> {
  assertAllowed(ctx.policy, 'report');
  const sources =
    choice.views && choice.views.length > 0 ? choice.views : [{ view: null, ctx, state } as const];
  const report = buildReport(ctx, {
    notes: deps.notes,
    now: deps.now,
    layerName: pictureLayerName(ctx),
    caption,
    appendices: choice.appendices ?? true,
    ...(choice.views && choice.views.length > 0
      ? {
          views: choice.views.map((v) => ({
            name: v.view.name,
            caption: v.view.caption,
            ctx: v.ctx,
            layerName: pictureLayerName(v.ctx),
          })),
        }
      : {}),
  });
  // Each view's page is A4 landscape: the members are fitted into the space
  // beside the legend and below the page's text, at full size, so legend and
  // labels print at their token sizes.
  const print = readPrintTheme(deps.tokens);
  const ex = readExportTheme(deps.tokens);
  const maps: MapDocument[] = [];
  let theme = ex;
  sources.forEach((source, k) => {
    const page = report.views[k];
    if (!page) return;
    const fitTo = {
      width: print.pageHeight - print.margin * 2 - ex.gap - ex.legendWidth,
      height: Math.max(
        print.pageWidth - print.margin * 2 - viewTextHeight(page, print, deps.measure) - ex.padding,
        ex.legendWidth,
      ),
    };
    const picture = pictureExport(source.ctx, source.state, deps, '', fitTo);
    maps.push(picture.doc);
    theme = picture.theme;
  });
  const { reportPdf } = await import('./pdf');
  const out = await reportPdf({
    report,
    maps,
    exportTheme: theme,
    print,
    loadFont: deps.loadFont,
    inflate: deps.inflate,
    now: deps.now,
  });
  const date = deps.now.toISOString().slice(0, 10);
  return {
    fileName: exportCopy.files.report(
      `${date}${exportCopy.suffix(ctx.anonymised, ctx.reanalysed, ctx.policy.level)}`,
    ),
    bytes: out.bytes,
    report,
    doc: maps[0] as MapDocument,
    docs: maps,
    pages: out.pages,
    substituted: out.substituted,
  };
}

export interface CardExport {
  fileName: string;
  bytes: Uint8Array;
  card: CardModel;
  pages: number;
  substituted: string[];
}

/** The personal network card of a one-to-one (build plan session 9), as a PDF. */
export async function cardExport(
  ctx: ExportContext,
  deps: Pick<ExportDeps, 'tokens' | 'loadFont' | 'inflate' | 'now'>,
): Promise<CardExport> {
  assertAllowed(ctx.policy, 'card');
  const card = buildCard(ctx.project, ctx.result, ctx.settings, ctx.policy);
  if (!card) throw new Error(exportCopy.noMember);
  const { cardPdf } = await import('./pdf');
  const out = await cardPdf({
    card,
    print: readPrintTheme(deps.tokens),
    loadFont: deps.loadFont,
    inflate: deps.inflate,
    now: deps.now,
  });
  const date = deps.now.toISOString().slice(0, 10);
  return {
    fileName: exportCopy.files.card(
      `${date}${exportCopy.suffix(ctx.anonymised, ctx.reanalysed, ctx.policy.level)}`,
    ),
    bytes: out.bytes,
    card,
    pages: out.pages,
    substituted: out.substituted,
  };
}
