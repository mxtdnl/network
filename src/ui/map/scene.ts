// Scene: the map as renderer-neutral drawing instructions in screen space
// (CSS pixels). The canvas painter draws it on every frame; the Phase 7 SVG
// export will serialise the same scene, so exports match the screen.
//
// Zoom is semantic: it spreads member positions, while node radii, edge widths
// and labels keep their screen size, so text stays legible on a projector at
// every zoom level.

import { valenceColour } from './colour';
import type { LayoutAnnotation } from './layout';
import type { EdgeStyle, MapModel } from './model';
import type { MapTheme } from './theme';

export interface Transform {
  x: number;
  y: number;
  k: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface LineBatch {
  stroke: string;
  width: number;
  dash: number[];
  alpha: number;
  /** x1, y1, x2, y2 for each segment. */
  coords: number[];
}

export interface ArrowBatch {
  fill: string;
  alpha: number;
  /** Three points per arrowhead. */
  coords: number[];
}

/**
 * The paper disc inside a hollow node: half the radius, leaving a ring of the
 * fill at least one line wide, so the group colour stays readable.
 */
export function hollowRadius(r: number, line: number): number {
  return Math.max(Math.min(r * 0.5, r - line * 1.5), 0);
}

export interface NodeMark {
  index: number;
  x: number;
  y: number;
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dashed: boolean;
  alpha: number;
  /** The member gave no ratings: a paper disc inside the fill, of this radius (session 4). */
  hollow: number;
}

export interface RingMark {
  x: number;
  y: number;
  r: number;
}

export interface LabelMark {
  x: number;
  y: number;
  text: string;
  alpha: number;
  /** Anchor of the text at x; centred when absent. */
  align?: 'center' | 'left' | 'right';
  /** The member named, for member labels. */
  index?: number;
}

/** Where a member's label sits relative to the member, in screen pixels. */
export interface LabelAnchor {
  dx: number;
  dy: number;
  align: 'center' | 'left' | 'right';
}

/** Label positions of a full picture, relative to their members (see `buildScene`'s `anchors`). */
export function labelAnchors(scene: Scene): Map<number, LabelAnchor> {
  const at = new Map(scene.nodes.map((n) => [n.index, n]));
  const out = new Map<number, LabelAnchor>();
  for (const l of scene.labels) {
    const n = l.index === undefined ? undefined : at.get(l.index);
    if (n && l.index !== undefined)
      out.set(l.index, { dx: l.x - n.x, dy: l.y - n.y, align: l.align ?? 'center' });
  }
  return out;
}

export interface Scene {
  width: number;
  height: number;
  background: string;
  lines: LineBatch[];
  arrows: ArrowBatch[];
  nodes: NodeMark[];
  rings: RingMark[];
  /** Members of the subgroup: a thin ink ring (the selection ring is thicker). */
  groupRings: RingMark[];
  labels: LabelMark[];
  /** Names of the groups in the grouped and circular layouts. */
  groupLabels: LabelMark[];
  theme: MapTheme;
}

export interface Highlight {
  hovered: number | null;
  focused: number | null;
  selected: number | null;
  /** The subgroup (multi-select or lasso). */
  group?: ReadonlySet<number> | null;
  /** A shortest path, in order. */
  path?: readonly number[] | null;
}

export const NO_HIGHLIGHT: Highlight = {
  hovered: null,
  focused: null,
  selected: null,
  group: null,
  path: null,
};

/**
 * Members to keep at full strength; null when nothing is highlighted. The
 * member under the pointer or keyboard focus comes first, then a shortest
 * path, then the selected member, then the subgroup, then search matches,
 * then the members an insight or saved view highlights.
 */
export function highlightSet(model: MapModel, h: Highlight): Set<number> | null {
  const pointer = h.hovered ?? h.focused;
  const neighbourhood = (c: number) => new Set([c, ...(model.neighbours[c] ?? [])]);
  if (pointer !== null && model.nodes[pointer]?.visible) return neighbourhood(pointer);
  if (h.path && h.path.length > 0) return new Set(h.path);
  if (h.selected !== null && model.nodes[h.selected]?.visible) return neighbourhood(h.selected);
  if (h.group && h.group.size > 0) return new Set(h.group);
  if (model.searchMatches) return model.searchMatches;
  if (model.highlighted && model.highlighted.size > 0) return model.highlighted;
  return null;
}

/** The member whose ties are emphasised: under the pointer or focus, else the selected one unless a path is shown. */
function centreOf(model: MapModel, h: Highlight): number | null {
  const pointer = h.hovered ?? h.focused;
  if (pointer !== null && model.nodes[pointer]?.visible) return pointer;
  if (h.path && h.path.length > 0) return null;
  return h.selected !== null && model.nodes[h.selected]?.visible ? h.selected : null;
}

interface LabelPlace {
  x: number;
  y: number;
  align: 'center' | 'left' | 'right';
}

/** Points on the circle round each member from which a community outline is built. */
const OUTLINE_STEPS = 16;

/** Convex hull of points, in order round the hull (Andrew's monotone chain). */
export function convexHull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (
        out.length >= 2 &&
        cross(out[out.length - 2] as Point, out[out.length - 1] as Point, p) <= 0
      )
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** Up to this many visible members, every member is labelled. */
export const LABEL_ALL_BELOW = 60;

export function toScreen(p: Point, t: Transform): Point {
  return { x: p.x * t.k + t.x, y: p.y * t.k + t.y };
}

/**
 * Builds the scene. `part` 'all' is the complete picture (used for export and
 * as the interaction cache); 'lit' is only the highlighted members and their
 * ties, at full strength and without background, drawn over a faded copy of
 * the cached picture while something is highlighted. `anchors` are the label
 * positions of that cached picture: a highlighted member keeps its label where
 * the faded copy has it, so no name appears twice.
 */
export function buildScene(
  model: MapModel,
  positions: readonly Point[],
  t: Transform,
  size: { width: number; height: number },
  theme: MapTheme,
  h: Highlight,
  part: 'all' | 'lit' = 'all',
  measure: (text: string) => number = (text) => text.length * theme.labelSize * 0.5,
  annotation: LayoutAnnotation = { kind: 'none' },
  anchors?: ReadonlyMap<number, LabelAnchor>,
): Scene {
  const lit = highlightSet(model, h);
  const onlyLit = part === 'lit' && lit !== null;
  const faded = (i: number) => lit !== null && !lit.has(i);
  const screen = positions.map((p) => toScreen(p, t));
  const batches = new Map<string, LineBatch>();
  const arrows = new Map<string, ArrowBatch>();
  const margin = theme.nodeMax + theme.edgeMax;
  const outside = (a: Point, b: Point) =>
    (a.x < -margin && b.x < -margin) ||
    (a.y < -margin && b.y < -margin) ||
    (a.x > size.width + margin && b.x > size.width + margin) ||
    (a.y > size.height + margin && b.y > size.height + margin);

  const dashFor = (style: EdgeStyle, width: number): number[] => {
    const f = Math.max(1, width);
    if (style === 'informal') return [theme.dash * f, theme.gap * f];
    if (style === 'neither') return [theme.dot * f, theme.gap * f];
    return [];
  };
  const line = (
    stroke: string,
    width: number,
    dash: number[],
    alpha: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) => {
    // Widths are grouped in quarter pixels so ties draw in few batches.
    const w = Math.round(width * 4) / 4;
    const key = `${stroke}|${String(w)}|${dash.join(',')}|${String(alpha)}`;
    let b = batches.get(key);
    if (!b) {
      b = { stroke, width: w, dash, alpha, coords: [] };
      batches.set(key, b);
    }
    b.coords.push(x1, y1, x2, y2);
  };

  // The project's palettes (D127).
  const diverging = theme.palettes.diverging[model.palette.diverging];
  const categorical = theme.palettes.categorical[model.palette.categorical];
  const valenceCache = new Map<number, string>();
  const signed = (v: number) => {
    const q = Math.round(v * 10) / 10;
    let c = valenceCache.get(q);
    if (c === undefined) {
      c = valenceColour(diverging, q);
      valenceCache.set(q, c);
    }
    return c;
  };
  const colour = model.colour;
  const colourFor = (e: (typeof model.edges)[number]) => {
    // No rating on the width layer: thinnest, in stone (D126).
    if (e.widthNotRated) return theme.stone;
    const v = e.colour;
    switch (colour.kind) {
      case 'none':
        return theme.stone;
      case 'groups':
        // Ties between groups in graphite stand out from ties within a group in stone.
        return v === 1 ? theme.graphite : theme.stone;
      default:
        // Not rated on the colour layer: graphite, which reaches 3:1 on paper
        // and stays apart from every valence step, including the grey neutral (D113).
        if (Number.isNaN(v)) return theme.graphite;
        if (colour.kind === 'unsigned')
          return v === 0 ? theme.stone : (theme.ramp[v - 1] ?? theme.stone);
        // Negative ratings only, unless the full scale is asked for (D132).
        if (!colour.full && Math.round(v * 10) / 10 >= 0) return theme.stone;
        return signed(v);
    }
  };

  // Community outlines (D136), under the ties: a stone line round each community's members.
  if (model.outlines && !onlyLit) {
    const pad = theme.labelGap * 2;
    const groups = new Map<number, Point[]>();
    for (const node of model.nodes) {
      const c = model.outlines[node.index] ?? -1;
      const p = screen[node.index];
      if (c < 0 || !node.visible || !p) continue;
      let pts = groups.get(c);
      if (!pts) groups.set(c, (pts = []));
      const r = node.radius + theme.line + pad;
      for (let k = 0; k < OUTLINE_STEPS; k++) {
        const a = (2 * Math.PI * k) / OUTLINE_STEPS;
        pts.push({ x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) });
      }
    }
    for (const pts of groups.values()) {
      const hull = convexHull(pts);
      for (let k = 0; k < hull.length; k++) {
        const a = hull[k] as Point;
        const b = hull[(k + 1) % hull.length] as Point;
        line(theme.stone, theme.line, [], 1, a.x, a.y, b.x, b.y);
      }
    }
  }

  // Faded ties first, so highlighted ties sit on top of them.
  const edges = lit
    ? [
        ...model.edges.filter((e) => !(lit.has(e.source) && lit.has(e.target))),
        ...model.edges.filter((e) => lit.has(e.source) && lit.has(e.target)),
      ]
    : model.edges;
  const centre = centreOf(model, h);

  // Reporting lines of the formal hierarchy, under the ties: elbow connectors in stone.
  if (annotation.kind === 'hierarchy' && !onlyLit) {
    for (let i = 0; i < model.n; i++) {
      const p = annotation.parent[i] ?? -1;
      if (p < 0 || !model.nodes[i]?.visible || !model.nodes[p]?.visible) continue;
      const a = screen[p];
      const b = screen[i];
      if (!a || !b || outside(a, b)) continue;
      const alpha = lit && !(lit.has(i) && lit.has(p)) ? theme.fade : 1;
      const spine = annotation.spine[i] ?? NaN;
      if (annotation.column[i] && Number.isFinite(spine)) {
        // Down from the manager, across to the column's line, down it, and across to the member.
        const my = a.y + annotation.drop * t.k;
        const sx = spine * t.k + t.x;
        line(theme.stone, theme.line, [], alpha, a.x, a.y, a.x, my);
        line(theme.stone, theme.line, [], alpha, a.x, my, sx, my);
        line(theme.stone, theme.line, [], alpha, sx, my, sx, b.y);
        line(theme.stone, theme.line, [], alpha, sx, b.y, b.x, b.y);
      } else {
        const my = a.y + annotation.drop * t.k;
        line(theme.stone, theme.line, [], alpha, a.x, a.y, a.x, my);
        line(theme.stone, theme.line, [], alpha, a.x, my, b.x, my);
        line(theme.stone, theme.line, [], alpha, b.x, my, b.x, b.y);
      }
    }
  }

  const arrowAt = (stroke: string, alpha: number, tip: Point, base: Point, head: number) => {
    const len = Math.hypot(tip.x - base.x, tip.y - base.y) || 1;
    const px = -(tip.y - base.y) / len;
    const py = (tip.x - base.x) / len;
    const half = head / 2;
    const key = `${stroke}|${String(alpha)}`;
    let ab = arrows.get(key);
    if (!ab) {
      ab = { fill: stroke, alpha, coords: [] };
      arrows.set(key, ab);
    }
    ab.coords.push(
      tip.x,
      tip.y,
      base.x + px * half,
      base.y + py * half,
      base.x - px * half,
      base.y - py * half,
    );
  };

  // Over the formal hierarchy, ties bend away from the straight line, so ties
  // between members of one row stay apart from it and from the reporting lines.
  const curved = annotation.kind === 'hierarchy';
  const SEGMENTS = 10;
  // Bridge ties (build plan session 7): a diamond at the middle of the tie, on a paper halo.
  const bridgeMarks: { x: number; y: number; alpha: number }[] = [];
  const curve = (e: (typeof edges)[number], a: Point, b: Point, stroke: string, alpha: number) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const px = -(b.y - a.y) / len;
    const py = (b.x - a.x) / len;
    const drawOne = (bend: number, dash: number[], withArrow: boolean) => {
      const cx = (a.x + b.x) / 2 + px * bend;
      const cy = (a.y + b.y) / 2 + py * bend;
      const at = (t: number): Point => ({
        x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * b.x,
        y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * b.y,
      });
      let end = 1;
      if (model.directed && !e.reciprocated) {
        const tip = (model.nodes[e.target]?.radius ?? 0) + theme.line;
        const head = theme.arrow + e.width;
        const away = (t: number) => Math.hypot(at(t).x - b.x, at(t).y - b.y);
        let tTip = 1;
        while (tTip > 0 && away(tTip) < tip) tTip -= 0.01;
        end = tTip;
        while (end > 0 && away(end) < tip + head) end -= 0.01;
        end = Math.max(end, 0.05);
        if (withArrow) arrowAt(stroke, alpha, at(tTip), at(end), head);
      }
      let prev = at(0);
      for (let k = 1; k <= SEGMENTS; k++) {
        const q = at((end * k) / SEGMENTS);
        line(stroke, e.width, dash, alpha, prev.x, prev.y, q.x, q.y);
        prev = q;
      }
    };
    const bend = len * 0.2;
    // The middle of the quadratic curve lies half the bend from the chord's middle.
    if (model.markBridges && e.bridge)
      bridgeMarks.push({
        x: (a.x + b.x) / 2 + (px * bend) / 2,
        y: (a.y + b.y) / 2 + (py * bend) / 2,
        alpha,
      });
    if (e.style === 'both') {
      drawOne(bend, dashFor('formal', e.width), true);
      drawOne(bend + e.width + theme.gap, dashFor('informal', e.width), false);
    } else {
      drawOne(bend, dashFor(e.style, e.width), true);
    }
  };

  for (const e of edges) {
    const a = screen[e.source];
    const b = screen[e.target];
    if (!a || !b || outside(a, b)) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len;
    const uy = dy / len;
    // Perpendicular, to the right of the direction of travel.
    const px = -uy;
    const py = ux;
    const incident =
      lit === null ||
      (centre !== null && model.nodes[centre]?.visible
        ? e.source === centre || e.target === centre
        : lit.has(e.source) && lit.has(e.target));
    if (onlyLit && !incident) continue;
    const alpha = incident ? 1 : theme.fade;
    const stroke = colourFor(e);
    if (curved) {
      curve(e, a, b, stroke, alpha);
      continue;
    }
    if (model.markBridges && e.bridge)
      bridgeMarks.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, alpha });
    let x1 = a.x;
    let y1 = a.y;
    let x2 = b.x;
    let y2 = b.y;

    // A pair tied both ways is one line without arrowheads (CLAUDE.md D131).
    if (model.directed && !e.reciprocated) {
      const target = model.nodes[e.target];
      const head = theme.arrow + e.width;
      const tip = (target?.radius ?? 0) + theme.line;
      if (len > tip + head) {
        const tx = x2 - ux * tip;
        const ty = y2 - uy * tip;
        const bx = tx - ux * head;
        const by = ty - uy * head;
        const half = head / 2;
        const key = `${stroke}|${String(alpha)}`;
        let ab = arrows.get(key);
        if (!ab) {
          ab = { fill: stroke, alpha, coords: [] };
          arrows.set(key, ab);
        }
        ab.coords.push(tx, ty, bx + px * half, by + py * half, bx - px * half, by - py * half);
        x2 = bx;
        y2 = by;
      }
    }
    if (e.style === 'both') {
      // Solid line with a parallel dashed line (design-system §2.3).
      const o = e.width + theme.gap / 2;
      line(
        stroke,
        e.width,
        [],
        alpha,
        x1 - (px * o) / 2,
        y1 - (py * o) / 2,
        x2 - (px * o) / 2,
        y2 - (py * o) / 2,
      );
      x1 += (px * o) / 2;
      y1 += (py * o) / 2;
      x2 += (px * o) / 2;
      y2 += (py * o) / 2;
      line(stroke, e.width, dashFor('informal', e.width), alpha, x1, y1, x2, y2);
    } else {
      line(stroke, e.width, dashFor(e.style, e.width), alpha, x1, y1, x2, y2);
    }
  }

  const diamond = (fill: string, alpha: number, x: number, y: number, r: number) => {
    const key = `${fill}|${String(alpha)}`;
    let ab = arrows.get(key);
    if (!ab) {
      ab = { fill, alpha, coords: [] };
      arrows.set(key, ab);
    }
    ab.coords.push(x - r, y, x, y - r, x + r, y, x - r, y, x, y + r, x + r, y);
  };
  for (const m of bridgeMarks)
    diamond(theme.paper, m.alpha, m.x, m.y, theme.bridgeMark + theme.line);
  for (const m of bridgeMarks) diamond(theme.bridge, m.alpha, m.x, m.y, theme.bridgeMark);

  // A shortest path: ink segments over the ties, between the members in order.
  const pathLines: LineBatch[] = [];
  if (h.path && h.path.length > 1) {
    const coords: number[] = [];
    for (let k = 1; k < h.path.length; k++) {
      const a = screen[h.path[k - 1] as number];
      const b = screen[h.path[k] as number];
      if (a && b) coords.push(a.x, a.y, b.x, b.y);
    }
    pathLines.push({ stroke: theme.ink, width: theme.focusWidth, dash: [], alpha: 1, coords });
  }

  // The circle of the circular layout: labels point away from its centre.
  let circle: { x: number; y: number; r: number } | null = null;
  if (annotation.kind === 'groups' && annotation.circular) {
    let sx = 0;
    let sy = 0;
    let k = 0;
    for (const node of model.nodes) {
      const p = screen[node.index];
      if (!node.visible || !p) continue;
      sx += p.x;
      sy += p.y;
      k += 1;
    }
    if (k > 0) {
      const cx = sx / k;
      const cy = sy / k;
      let r = 0;
      for (const node of model.nodes) {
        const p = screen[node.index];
        if (node.visible && p) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
      }
      circle = { x: cx, y: cy, r };
    }
  }

  const nodes: NodeMark[] = [];
  const candidates: (LabelMark & {
    index: number;
    priority: number;
    alternatives: LabelPlace[];
    important: boolean;
  })[] = [];
  const visibleCount = model.nodes.filter((n) => n.visible).length;
  const order = model.nodes.filter((n) => n.visible && (!onlyLit || lit.has(n.index)));
  if (lit) order.sort((p, q) => Number(lit.has(p.index)) - Number(lit.has(q.index)));
  for (const node of order) {
    const p = screen[node.index];
    if (!p) continue;
    const group = model.fill.groups[node.group];
    const hue = group?.hue ?? -1;
    const alpha = faded(node.index) ? theme.fade : 1;
    nodes.push({
      index: node.index,
      x: p.x,
      y: p.y,
      r: node.radius,
      fill: hue >= 0 ? (categorical[hue] ?? theme.other) : theme.other,
      stroke: theme.ink,
      strokeWidth: theme.line,
      dashed: hue < 0,
      alpha,
      hollow: node.noRatings ? hollowRadius(node.radius, theme.line) : 0,
    });
    const labelled =
      visibleCount <= LABEL_ALL_BELOW ||
      (lit !== null && lit.has(node.index) && lit.size <= LABEL_ALL_BELOW) ||
      node.index === h.selected;
    if (labelled) {
      const own = node.index === (h.hovered ?? h.focused ?? h.selected);
      let place: { x: number; y: number; align: 'center' | 'left' | 'right' } = {
        x: p.x,
        y: p.y + node.radius + theme.labelGap + theme.labelSize,
        align: 'center',
      };
      if (circle) {
        const d = Math.hypot(p.x - circle.x, p.y - circle.y) || 1;
        const ux = (p.x - circle.x) / d;
        const uy = (p.y - circle.y) / d;
        const off = node.radius + theme.labelGap * 2;
        if (Math.abs(ux) > 0.4) {
          place = {
            x: p.x + ux * off,
            y: p.y + uy * off + theme.labelSize / 3,
            align: ux > 0 ? 'left' : 'right',
          };
        } else if (uy < 0) {
          place = { x: p.x, y: p.y - node.radius - theme.labelGap * 2, align: 'center' };
        }
      }
      // If a name's first place (below) is taken, it may go above, right or
      // left of the member instead (D80, Q36).
      const important = own || (lit?.has(node.index) === true && alpha === 1);
      const mid = p.y + theme.labelSize / 3;
      const side = node.radius + theme.labelGap * 2;
      const alternatives: LabelPlace[] = !circle
        ? [
            { x: p.x, y: p.y - node.radius - theme.labelGap * 2, align: 'center' },
            { x: p.x + side, y: mid, align: 'left' },
            { x: p.x - side, y: mid, align: 'right' },
          ]
        : [];
      // Over the faded picture, a name goes where the picture already has it.
      const anchor = onlyLit ? anchors?.get(node.index) : undefined;
      if (anchor) {
        alternatives.unshift(place);
        place = { x: p.x + anchor.dx, y: p.y + anchor.dy, align: anchor.align };
      }
      candidates.push({
        ...place,
        alternatives,
        important,
        text: node.name,
        alpha,
        index: node.index,
        // Anchored names first (they cleared each other in the full picture),
        // then the member in focus, then highlighted members, then larger members.
        priority:
          (anchor ? 4e6 : 0) +
          (own ? 2e6 : 0) +
          (lit?.has(node.index) === true && alpha === 1 ? 1e6 : 0) +
          node.radius,
      });
    }
  }

  // Labels never overlap: each is placed only if it clears those already placed.
  // Outside the circular layout a name also never covers another member, and a
  // place other than its first stays on the canvas (Q36). A highlighted or
  // focused member's name that finds no such place may still cover a member.
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const placed: Box[] = [];
  const labels: LabelMark[] = [];
  const discs = circle
    ? []
    : model.nodes.flatMap((n) => {
        const p = screen[n.index];
        return n.visible && p ? [{ index: n.index, x: p.x, y: p.y, r: n.radius + theme.line }] : [];
      });
  const coversMember = (box: Box, own: number) =>
    discs.some((d) => {
      if (d.index === own) return false;
      const dx = d.x - Math.min(Math.max(d.x, box.x0), box.x1);
      const dy = d.y - Math.min(Math.max(d.y, box.y0), box.y1);
      return dx * dx + dy * dy < d.r * d.r;
    });
  candidates.sort((a, b) => b.priority - a.priority);
  for (const c of candidates) {
    const w = measure(c.text) + theme.labelGap * 2;
    const places = [{ x: c.x, y: c.y, align: c.align ?? 'center' }, ...c.alternatives];
    const boxes = places.map((at): Box => {
      const x0 = at.align === 'left' ? at.x : at.align === 'right' ? at.x - w : at.x - w / 2;
      return { x0, y0: at.y - theme.labelSize, x1: x0 + w, y1: at.y + theme.labelGap };
    });
    const clear = (box: Box) =>
      !placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
    const onCanvas = (box: Box) =>
      box.x0 >= 0 && box.y0 >= 0 && box.x1 <= size.width && box.y1 <= size.height;
    let k = boxes.findIndex(
      (box, i) => clear(box) && (i === 0 || onCanvas(box)) && !coversMember(box, c.index),
    );
    if (k < 0 && c.important) k = boxes.findIndex(clear);
    const at = places[k];
    const box = boxes[k];
    if (!at || !box) continue;
    placed.push(box);
    labels.push({
      x: at.x,
      y: at.y,
      text: c.text,
      alpha: c.alpha,
      align: at.align,
      index: c.index,
    });
  }

  const rings: RingMark[] = [];
  const ringed = new Set([h.selected, h.focused, ...(h.path ?? [])]);
  for (const i of ringed) {
    if (i === null) continue;
    const node = model.nodes[i];
    const p = screen[i];
    if (node?.visible && p) rings.push({ x: p.x, y: p.y, r: node.radius });
  }
  const groupRings: RingMark[] = [];
  for (const i of h.group ?? []) {
    const node = model.nodes[i];
    const p = screen[i];
    if (!ringed.has(i) && node?.visible && p && (!onlyLit || lit.has(i)))
      groupRings.push({ x: p.x, y: p.y, r: node.radius });
  }

  // Group names for the grouped and circular layouts, placed clear of the group.
  const groupLabels: LabelMark[] = [];
  if (annotation.kind === 'groups' && !onlyLit) {
    const boxes = annotation.groups.map(() => ({
      x0: Infinity,
      y0: Infinity,
      x1: -Infinity,
      y1: -Infinity,
      sx: 0,
      sy: 0,
      k: 0,
    }));
    let cx = 0;
    let cy = 0;
    let count = 0;
    for (const node of model.nodes) {
      if (!node.visible) continue;
      const p = screen[node.index];
      const b = boxes[annotation.group[node.index] ?? -1];
      if (!p || !b) continue;
      b.x0 = Math.min(b.x0, p.x);
      b.y0 = Math.min(b.y0, p.y);
      b.x1 = Math.max(b.x1, p.x);
      b.y1 = Math.max(b.y1, p.y);
      b.sx += p.x;
      b.sy += p.y;
      b.k += 1;
      cx += p.x;
      cy += p.y;
      count += 1;
    }
    cx /= Math.max(count, 1);
    cy /= Math.max(count, 1);
    let radius = 0;
    for (const node of model.nodes) {
      const p = screen[node.index];
      if (node.visible && p) radius = Math.max(radius, Math.hypot(p.x - cx, p.y - cy));
    }
    boxes.forEach((b, g) => {
      if (b.k === 0) return;
      const text = annotation.groups[g] ?? '';
      if (annotation.circular) {
        // Inside the circle, towards the middle of the group's arc: member names are outside.
        const mx = b.sx / b.k - cx;
        const my = b.sy / b.k - cy;
        const d = Math.hypot(mx, my) || 1;
        const inward = Math.max(radius - theme.nodeMax - theme.groupSize * 2, radius * 0.5);
        groupLabels.push({
          x: cx + (mx / d) * inward,
          y: cy + (my / d) * inward + theme.groupSize / 3,
          text,
          alpha: 1,
        });
      } else {
        groupLabels.push({
          x: (b.x0 + b.x1) / 2,
          y: b.y0 - theme.nodeMax - theme.labelGap,
          text,
          alpha: 1,
        });
      }
    });
  }

  return {
    width: size.width,
    height: size.height,
    background: onlyLit ? '' : theme.paper,
    lines: [...batches.values(), ...pathLines],
    arrows: [...arrows.values()],
    nodes,
    rings,
    groupRings,
    labels,
    groupLabels,
    theme,
  };
}

/** The member under a screen point, topmost first; a small margin eases small targets. */
export function hitTest(scene: Scene, x: number, y: number, slop: number): number | null {
  for (let k = scene.nodes.length - 1; k >= 0; k--) {
    const n = scene.nodes[k];
    if (!n) continue;
    const r = Math.max(n.r, slop) + scene.theme.line;
    if ((x - n.x) ** 2 + (y - n.y) ** 2 <= r * r) return n.index;
  }
  return null;
}

/** Whether a point lies inside a polygon (even–odd rule). */
export function insidePolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as Point;
    const b = poly[j] as Point;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
