// The Groups view (D154): group-to-group structure from the mixing figures the
// engine computes for every attribute and for the layer's communities
// (engine/metrics/network.ts `mixing`). Pure functions, so the matrix, the
// group map, the table and the report read the same figures and can be tested
// without a page.

import type { GroupMixing, RefResult } from '../engineClient';
import type { AttributeDefinition, MemberId, Project } from '../../data/schema';
import { groupingAttributes, insightGroup } from '../state/insightGroup';
import type { Grouping } from '../state/store';

/** Attributes the Groups view offers: categories and ordered categories (as the insight rules). */
export function groupingOptions(project: Project): AttributeDefinition[] {
  return groupingAttributes(project);
}

/**
 * The grouping in use: the chosen one while it is still available, else the
 * insight rules' attribute (settings.insight_group, else team), else the
 * first category attribute, else communities.
 */
export function effectiveGrouping(project: Project, chosen: Grouping | null): Grouping {
  const options = groupingOptions(project);
  if (chosen?.kind === 'attribute' && options.some((a) => a.key === chosen.key)) return chosen;
  if (chosen?.kind === 'community') return chosen;
  const attr = insightGroup(project) ?? options[0];
  return attr ? { kind: 'attribute', key: attr.key } : { kind: 'community' };
}

/** The engine's mixing for a grouping on one layer, or null when it has none. */
export function groupMixing(ref: RefResult | undefined, grouping: Grouping): GroupMixing | null {
  if (!ref) return null;
  if (grouping.kind === 'community') return ref.network.communityMixing ?? null;
  return ref.network.mixing[grouping.key] ?? null;
}

/**
 * Members of one group, in project order. Community groups are named "1", "2", …
 * as `communityColumn` names them.
 */
export function groupMembers(
  project: Project,
  ref: RefResult | undefined,
  grouping: Grouping,
  group: string,
): MemberId[] {
  if (grouping.kind === 'community') {
    const membership = ref?.communities?.membership;
    if (!membership) return [];
    return project.members
      .filter((_, i) => String((membership[i] ?? -2) + 1) === group)
      .map((m) => m.id);
  }
  return project.members.filter((m) => m.attributes[grouping.key] === group).map((m) => m.id);
}

/** The group whose members are exactly the subgroup, or −1. */
export function chosenGroup(
  project: Project,
  ref: RefResult | undefined,
  grouping: Grouping,
  mix: GroupMixing,
  subgroup: readonly MemberId[],
): number {
  if (subgroup.length === 0) return -1;
  const set = new Set(subgroup);
  return mix.groups.findIndex((g) => {
    const members = groupMembers(project, ref, grouping, g);
    return members.length === set.size && members.every((id) => set.has(id));
  });
}

export interface GroupCell {
  ties: number;
  possible: number;
  /** ties / possible; NaN when no tie is possible (a group of one, within itself). */
  share: number;
}

/** One cell of the group matrix: from row group `a` to column group `b` (both directions combined when mutual). */
export function groupCell(mix: GroupMixing, a: number, b: number): GroupCell {
  const k = mix.groups.length;
  const ties = mix.ties[a * k + b] ?? 0;
  const possible = mix.possible[a * k + b] ?? 0;
  return { ties, possible, share: possible > 0 ? ties / possible : NaN };
}

/**
 * Two groups' ties in both directions: in the directed view, a → b and b → a
 * added, over the ties possible both ways; when mutual, the cell itself.
 */
export function pairCell(mix: GroupMixing, a: number, b: number, directed: boolean): GroupCell {
  if (!directed || a === b) return groupCell(mix, a, b);
  const x = groupCell(mix, a, b);
  const y = groupCell(mix, b, a);
  const ties = x.ties + y.ties;
  const possible = x.possible + y.possible;
  return { ties, possible, share: possible > 0 ? ties / possible : NaN };
}

// ------------------------------------------------------------- group map

/** Design values for the group map, read from tokens (groups.css, tokens.css). */
export interface GroupMapTheme {
  ink: string;
  graphite: string;
  paper: string;
  field: string;
  nodeMin: number;
  nodeMax: number;
  edgeMin: number;
  edgeMax: number;
  line: number;
  focusWidth: number;
  font: string;
  fontSize: number;
  gap: number;
}

export function readGroupMapTheme(
  source: Element | ((name: string) => string) = document.documentElement,
): GroupMapTheme {
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
    paper: text('--paper'),
    field: text('--field'),
    nodeMin: number('--group-node-min'),
    nodeMax: number('--group-node-max'),
    edgeMin: number('--map-edge-min'),
    edgeMax: number('--group-edge-max'),
    line: number('--line-width'),
    focusWidth: number('--focus-width'),
    font: `${text('--weight-semibold')} ${text('--map-group-size')} ${text('--font-sans')}`,
    fontSize: number('--map-group-size'),
    gap: number('--s-2'),
  };
}

export interface GroupMapNode {
  index: number;
  group: string;
  size: number;
  x: number;
  y: number;
  r: number;
}

export interface GroupMapLink extends GroupCell {
  a: number;
  b: number;
  /** Line width in CSS pixels: linear in the share, from the thinnest width to the thickest at `maxShare`. */
  width: number;
}

export interface GroupMapModel {
  nodes: GroupMapNode[];
  /** Pairs of groups with at least one tie, either direction; pairs without ties are not drawn. */
  links: GroupMapLink[];
  /** The largest share between two groups, which the thickest line shows. */
  maxShare: number;
  minShare: number;
}

/**
 * One node per group, placed on a circle in group order (the first at the
 * top, or at the left when there are two), with area linear in its members;
 * one line per pair of groups with ties, whose width is linear in the share
 * of possible ties between them, from the thinnest line to the thickest at
 * the largest share between any two groups.
 */
export function groupMapModel(
  mix: GroupMixing,
  directed: boolean,
  box: { width: number; height: number },
  theme: GroupMapTheme,
): GroupMapModel {
  const k = mix.groups.length;
  const sizes = mix.perGroup.map((g) => g.size);
  const largest = Math.max(1, ...sizes);
  const radius = (size: number) =>
    Math.max(theme.nodeMin, theme.nodeMax * Math.sqrt(size / largest));
  // Room for a name under each node.
  const labelRoom = theme.fontSize * 2 + theme.gap;
  const ring = Math.max(0, Math.min(box.width, box.height) / 2 - theme.nodeMax - labelRoom);
  const start = k === 2 ? Math.PI : -Math.PI / 2;
  const nodes = mix.groups.map((group, index) => {
    const angle = start + (2 * Math.PI * index) / Math.max(k, 1);
    const at = k === 1 ? 0 : ring;
    return {
      index,
      group,
      size: sizes[index] ?? 0,
      x: box.width / 2 + at * Math.cos(angle),
      y: box.height / 2 + at * Math.sin(angle) - labelRoom / 2,
      r: radius(sizes[index] ?? 0),
    };
  });
  const cells: (GroupCell & { a: number; b: number })[] = [];
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      const c = pairCell(mix, a, b, directed);
      if (c.ties > 0) cells.push({ ...c, a, b });
    }
  }
  const shares = cells.map((c) => c.share);
  const maxShare = shares.length > 0 ? Math.max(...shares) : 0;
  const minShare = shares.length > 0 ? Math.min(...shares) : 0;
  const links = cells.map((c) => ({
    ...c,
    width:
      maxShare > 0
        ? theme.edgeMin + ((theme.edgeMax - theme.edgeMin) * c.share) / maxShare
        : theme.edgeMin,
  }));
  return { nodes, links, maxShare, minShare };
}

/** The group under a point, or −1. */
export function groupAt(model: GroupMapModel, x: number, y: number, slack: number): number {
  let best = -1;
  let bestD = Infinity;
  for (const n of model.nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= n.r + slack && d < bestD) {
      best = n.index;
      bestD = d;
    }
  }
  return best;
}

/** Draws the group map: lines under the nodes, names under each node, the chosen group ringed. */
export function paintGroupMap(
  ctx: CanvasRenderingContext2D,
  model: GroupMapModel,
  theme: GroupMapTheme,
  labels: readonly string[],
  chosen: number,
  dpr: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineCap = 'round';
  ctx.strokeStyle = theme.graphite;
  for (const l of model.links) {
    const a = model.nodes[l.a];
    const b = model.nodes[l.b];
    if (!a || !b) continue;
    ctx.lineWidth = l.width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const n of model.nodes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, 2 * Math.PI);
    ctx.fillStyle = n.index === chosen ? theme.field : theme.paper;
    ctx.fill();
    ctx.lineWidth = theme.line;
    ctx.strokeStyle = theme.ink;
    ctx.stroke();
    if (n.index === chosen) {
      // The selection ring of the map: ink outside a paper halo.
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + theme.focusWidth * 1.5, 0, 2 * Math.PI);
      ctx.lineWidth = theme.focusWidth;
      ctx.stroke();
    }
  }
  ctx.font = theme.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  for (const n of model.nodes) {
    const text = labels[n.index] ?? n.group;
    const y = n.y + n.r + theme.gap;
    ctx.lineWidth = theme.focusWidth * 2;
    ctx.strokeStyle = theme.paper;
    ctx.strokeText(text, n.x, y);
    ctx.fillStyle = theme.ink;
    ctx.fillText(text, n.x, y);
  }
}
