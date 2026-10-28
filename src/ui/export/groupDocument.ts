// The group map as an export picture (build plan session 9): for a board or a
// leadership team, the map shows groups, never members. One node per group
// (area by members), one line per pair of groups with ties (width by the share
// of possible ties), small groups pooled or left out; a key in the legend
// column, and for a leadership team the roles between groups. The same
// primitives as the member map (document.ts), so PNG, SVG and the PDF report
// draw it alike.

import { audienceCopy } from '../copy/audience';
import { percent } from '../copy/data';
import { reportCopy } from '../copy/export';
import { groupMapModel, readGroupMapTheme } from '../map/groupModel';
import {
  audienceGroups,
  roleSentences,
  type AudienceGroups,
  type AudiencePolicy,
} from '../state/audience';
import type { Project } from '../../data/schema';
import type { InsightOutcome } from '../engineClient';
import { effectiveGrouping } from '../map/groupModel';
import type { ExportContext } from './context';
import { translate, wrap, type MapDocument, type Measure, type Primitive } from './document';
import { refName } from './tables';
import { readExportTheme, type ExportTheme, type TokenSource } from './theme';

export interface GroupExport {
  doc: MapDocument;
  layerName: string;
  groups: AudienceGroups | null;
  theme: ExportTheme;
}

/** The legend column's lines: what the picture shows, the pooling, and roles for a leadership team. */
export function groupLegendLines(input: {
  project: Project;
  insights: readonly InsightOutcome[];
  policy: AudiencePolicy;
  groups: AudienceGroups | null;
  layerName: string;
  maxShare: number;
  layerLabel: (ref: string) => string;
}): { heading: boolean; text: string }[] {
  const { groups, layerName, maxShare, policy: P } = input;
  const B = audienceCopy.board;
  const out: { heading: boolean; text: string }[] = [];
  out.push({ heading: true, text: B.title(groups?.attribute ?? '') });
  out.push({ heading: false, text: B.key.layer(layerName) });
  out.push({ heading: false, text: B.key.area });
  out.push({ heading: false, text: maxShare > 0 ? B.key.width(percent(maxShare)) : B.key.noLines });
  const mix = groups?.mix;
  if (mix?.pooled)
    out.push({
      heading: false,
      text: audienceCopy.pooled(mix.pooled.groups, mix.pooled.members, P.minGroupSize),
    });
  if (mix?.leftOut)
    out.push({
      heading: false,
      text: audienceCopy.leftOut(mix.leftOut.groups, mix.leftOut.members, P.minGroupSize),
    });
  if (P.level === 'leadership') {
    out.push({ heading: true, text: audienceCopy.rolesHeading });
    const roles = roleSentences(input.project, input.insights, P, input.layerLabel);
    if (roles.length === 0) out.push({ heading: false, text: audienceCopy.noRoles });
    for (const r of roles) out.push({ heading: false, text: r });
  }
  return out;
}

export function groupMapExport(
  ctx: ExportContext,
  deps: { tokens: TokenSource; measure: Measure },
  caption: string,
  fitTo: { width: number; height: number } | null = null,
): GroupExport {
  const theme = readExportTheme(deps.tokens);
  const gt = readGroupMapTheme(deps.tokens);
  const t = theme.map;
  const pad = theme.padding;
  const gap = theme.gap;
  const layer = ctx.settings.layer;
  const layerName = refName(ctx, layer);
  const groups = audienceGroups(
    ctx.project,
    ctx.result.refs[layer],
    ctx.result.view === 'directed',
    effectiveGrouping(ctx.project, ctx.grouping),
    ctx.policy,
  );
  const box = fitTo ?? {
    width: theme.defaultSize.width - theme.legendWidth - gap,
    height: theme.defaultSize.height,
  };
  const items: Primitive[] = [];
  let maxShare = 0;
  if (groups) {
    const model = groupMapModel(groups.mix, groups.directed, box, gt);
    maxShare = model.maxShare;
    for (const l of model.links) {
      const a = model.nodes[l.a];
      const b = model.nodes[l.b];
      if (!a || !b) continue;
      items.push({
        kind: 'lines',
        stroke: gt.graphite,
        width: l.width,
        dash: [],
        alpha: 1,
        coords: [a.x, a.y, b.x, b.y],
      });
    }
    for (const node of model.nodes)
      items.push({
        kind: 'circle',
        x: node.x,
        y: node.y,
        r: node.r,
        fill: gt.paper,
        stroke: gt.ink,
        strokeWidth: gt.line,
        dash: [],
        alpha: 1,
      });
    for (const node of model.nodes)
      items.push({
        kind: 'text',
        x: node.x,
        y: node.y + node.r + gt.gap + gt.fontSize * 0.8,
        text: groups.names[node.index] ?? node.group,
        role: 'group',
        size: gt.fontSize,
        fill: gt.ink,
        align: 'center',
        halo: { colour: gt.paper, width: gt.focusWidth * 2 },
        alpha: 1,
      });
  }

  // The legend column.
  const L = theme.legend;
  const legend: Primitive[] = [];
  let y = 0;
  const lines = groupLegendLines({
    project: ctx.source,
    insights: ctx.result.insights,
    policy: ctx.policy,
    groups,
    layerName,
    maxShare,
    layerLabel: (ref) => refName(ctx, ref),
  });
  for (const line of lines) {
    if (line.heading && y > 0) y += theme.legendSectionGap;
    const role = line.heading ? 'medium' : 'regular';
    for (const row of wrap(line.text, theme.legendWidth, (s) => deps.measure(s, role, L.size))) {
      legend.push({
        kind: 'text',
        x: 0,
        y: y + (L.line + L.size * 0.7) / 2,
        text: row,
        role,
        size: L.size,
        fill: line.heading ? t.ink : t.graphite,
        align: 'left',
        halo: null,
        alpha: 1,
      });
      y += L.line;
    }
  }

  const width = pad + box.width + gap + theme.legendWidth + pad;
  let bottom = pad + Math.max(box.height, y);
  const captionItems: Primitive[] = [];
  const text = ctx.names.text(caption).trim();
  if (text !== '') {
    bottom += gap;
    const C = theme.caption;
    for (const line of wrap(text, width - pad * 2, (s) => deps.measure(s, 'regular', C.size))) {
      captionItems.push({
        kind: 'text',
        x: pad,
        y: bottom + (C.line + C.size * 0.7) / 2,
        text: line,
        role: 'regular',
        size: C.size,
        fill: t.ink,
        align: 'left',
        halo: null,
        alpha: 1,
      });
      bottom += C.line;
    }
  }
  const doc: MapDocument = {
    width,
    height: bottom + pad,
    background: t.paper,
    title: reportCopy.mapTitle(ctx.names.text(ctx.project.meta.title)),
    layers: [
      { clip: { x: pad, y: pad, ...box }, items: translate(items, pad, pad) },
      { clip: null, items: translate(legend, pad + box.width + gap, pad) },
      { clip: null, items: captionItems },
    ],
  };
  return { doc, layerName, groups, theme };
}
