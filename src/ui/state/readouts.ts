// Plain-language readouts (build plan session 8, spec §8): structured facts
// derived from the engine's results, one per number the centre column shows,
// which ui/copy/readouts.ts turns into sentences (D9). Nothing here is a new
// metric: every figure is read from the analysis (or, for negative ratings,
// counted from the ratings as given), so a sentence states what a table states.

import { DEFAULT_WAVE, type Project } from '../../data/schema';
import { FI_CLASS, type AnalysisResult, type RefResult } from '../engineClient';
import type { SizeMetric } from './store';
import { insightGroup } from './insightGroup';
import { questionSignedLayer, type QuestionId } from './questions';

export type NetworkReadout =
  | {
      kind: 'density';
      directed: boolean;
      layer: string;
      ties: number;
      possible: number;
      share: number;
    }
  | { kind: 'reciprocity'; directed: boolean; share: number }
  | { kind: 'parts'; directed: boolean; members: number; sizes: number[] }
  | { kind: 'communities'; count: number; modularity: number }
  | { kind: 'centralisation'; directed: boolean; value: number; max: number; median: number }
  | {
      kind: 'mixing';
      attribute: string;
      internal: number;
      external: number;
      ei: number;
      /** Share of all possible pairs (members with a value) whose values differ. */
      possibleBetween: number;
    };

export type QuestionReadout =
  | { kind: 'asked'; asked: number; members: number; max: number; median: number }
  | {
      kind: 'groupPairs';
      most: { a: string; b: string; ties: number } | null;
      none: [string, string][];
    }
  | { kind: 'topBroker'; members: string[]; others: number }
  | {
      kind: 'load';
      layer: string;
      top: number;
      members: number;
      held: number;
      received: number;
      share: number;
    }
  | {
      kind: 'formalInformal';
      tied: number;
      formalOnly: number;
      informalOnly: number;
      both: number;
      /** The pair of groups (or one group) with the largest informal-only share. */
      pair: { a: string; b: string; informalOnly: number; tied: number } | null;
    }
  | { kind: 'bridges'; count: number }
  | { kind: 'cutPoints'; count: number; member: string | null; cutOff: number }
  | {
      kind: 'negative';
      layer: string;
      given: number;
      returned: number;
      balance: { triads: number; balanced: number } | null;
    };

export type Readout = NetworkReadout | QuestionReadout;

/** Pairs of groups need this many working ties before their informal-only share is quoted. */
export const MIN_PAIR_TIES = 5;

export function median(values: readonly number[]): number {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1
    ? (v[mid] as number)
    : ((v[mid - 1] as number) + (v[mid] as number)) / 2;
}

function maxOf(values: ArrayLike<number>): number {
  let m = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    if (Number.isFinite(v) && v > m) m = v;
  }
  return m;
}

/** The six network measures of spec §6, as readouts, for one layer of the analysis. */
export function networkReadouts(
  project: Project,
  result: AnalysisResult,
  ref: string,
  layerLabel: string,
): NetworkReadout[] {
  const r = result.refs[ref];
  if (!r) return [];
  const directed = result.view === 'directed';
  const net = r.network;
  const n = net.members;
  const out: NetworkReadout[] = [];
  const possible = directed ? n * (n - 1) : (n * (n - 1)) / 2;
  out.push({
    kind: 'density',
    directed,
    layer: layerLabel,
    ties: net.ties,
    possible,
    share: net.density,
  });
  if (net.ties > 0) out.push({ kind: 'reciprocity', directed, share: net.reciprocity.overall });
  const sizes = (directed ? net.components.weak : net.components.connected) ?? [];
  out.push({ kind: 'parts', directed, members: n, sizes: [...sizes] });
  if (r.communities)
    out.push({
      kind: 'communities',
      count: r.communities.count,
      modularity: r.communities.modularity,
    });
  const degree = r.node.columns[directed ? 'inDegree' : 'degree'];
  const central = directed ? net.centralisation.inDegree : net.centralisation.degree;
  if (degree && central !== undefined && Number.isFinite(central))
    out.push({
      kind: 'centralisation',
      directed,
      value: central,
      max: maxOf(degree),
      median: median(Array.from(degree)),
    });
  const attr = insightGroup(project);
  const mix = attr ? net.mixing[attr.key] : undefined;
  if (attr && mix && mix.internal + mix.external > 0 && mix.groups.length > 1) {
    const sizesOf = mix.perGroup.map((g) => g.size);
    const total = sizesOf.reduce((a, b) => a + b, 0);
    const same = sizesOf.reduce((a, s) => a + s * (s - 1), 0);
    out.push({
      kind: 'mixing',
      attribute: attr.label,
      internal: mix.internal,
      external: mix.external,
      ei: mix.ei,
      possibleBetween: total > 1 ? 1 - same / (total * (total - 1)) : NaN,
    });
  }
  return out;
}

/** Ties between two groups (either direction), from the mixing counts. */
function pairTies(ties: Float64Array, k: number, a: number, b: number, directed: boolean): number {
  const ab = ties[a * k + b] as number;
  return directed ? ab + (ties[b * k + a] as number) : ab;
}

function groupPairs(project: Project, r: RefResult, directed: boolean): QuestionReadout | null {
  const attr = insightGroup(project);
  const mix = attr ? r.network.mixing[attr.key] : undefined;
  if (!mix || mix.groups.length < 2) return null;
  const k = mix.groups.length;
  let most: { a: string; b: string; ties: number } | null = null;
  const none: [string, string][] = [];
  for (let a = 0; a < k; a++)
    for (let b = a + 1; b < k; b++) {
      const t = pairTies(mix.ties, k, a, b, directed);
      const ga = mix.groups[a] as string;
      const gb = mix.groups[b] as string;
      if (t === 0) none.push([ga, gb]);
      else if (!most || t > most.ties) most = { a: ga, b: gb, ties: t };
    }
  return { kind: 'groupPairs', most, none };
}

function topBroker(result: AnalysisResult, r: RefResult): QuestionReadout | null {
  const column = r.node.columns.betweenness;
  if (!column) return null;
  const top = maxOf(column);
  if (!(top > 0)) return null;
  const members: string[] = [];
  let defined = 0;
  for (let i = 0; i < column.length; i++) {
    const v = column[i] as number;
    if (!Number.isFinite(v)) continue;
    defined += 1;
    if (v === top) members.push(result.memberIds[i] as string);
  }
  return { kind: 'topBroker', members, others: defined - 1 };
}

function asked(r: RefResult): QuestionReadout | null {
  const incoming = r.load?.incoming;
  if (!incoming) return null;
  const values = Array.from(incoming);
  return {
    kind: 'asked',
    asked: values.filter((v) => v > 0).length,
    members: values.length,
    max: maxOf(incoming),
    median: median(values),
  };
}

function load(r: RefResult, layer: string): QuestionReadout | null {
  const o = r.load?.overall;
  if (!o || !(o.received > 0)) return null;
  return {
    kind: 'load',
    layer,
    top: o.top.length,
    members: o.members,
    held: o.held,
    received: o.received,
    share: o.share,
  };
}

function formalInformal(project: Project, result: AnalysisResult): QuestionReadout | null {
  const fi = result.multiplex?.formalInformal;
  if (!fi) return null;
  const { formalOnly, informalOnly, both } = fi.counts;
  const tied = formalOnly + informalOnly + both;
  if (tied === 0) return null;
  const attr = insightGroup(project);
  let pair: { a: string; b: string; informalOnly: number; tied: number } | null = null;
  if (attr) {
    const n = result.memberIds.length;
    const directed = result.view === 'directed';
    const value = project.members.map((m) => m.attributes[attr.key] ?? null);
    const counts = new Map<string, { a: string; b: string; informalOnly: number; tied: number }>();
    for (let i = 0; i < n; i++)
      for (let j = directed ? 0 : i + 1; j < n; j++) {
        if (i === j) continue;
        const c = fi.classes[i * n + j];
        if (c !== FI_CLASS.formalOnly && c !== FI_CLASS.informalOnly && c !== FI_CLASS.both)
          continue;
        const va = value[i];
        const vb = value[j];
        if (va === null || va === undefined || vb === null || vb === undefined) continue;
        const [a, b] = va <= vb ? [va, vb] : [vb, va];
        const key = `${a}\u0000${b}`;
        const entry = counts.get(key) ?? { a, b, informalOnly: 0, tied: 0 };
        entry.tied += 1;
        if (c === FI_CLASS.informalOnly) entry.informalOnly += 1;
        counts.set(key, entry);
      }
    for (const e of counts.values()) {
      if (e.tied < MIN_PAIR_TIES || e.informalOnly === 0) continue;
      if (!pair || e.informalOnly / e.tied > pair.informalOnly / pair.tied) pair = e;
    }
  }
  return { kind: 'formalInformal', tied, formalOnly, informalOnly, both, pair };
}

function cutPoints(result: AnalysisResult, r: RefResult): QuestionReadout[] {
  const t = r.ties;
  if (!t) return [];
  let best = -1;
  for (let k = 0; k < t.cutPoints.members.length; k++)
    if (best < 0 || (t.cutPoints.cutOff[k] as number) > (t.cutPoints.cutOff[best] as number))
      best = k;
  return [
    { kind: 'bridges', count: t.localBridges.from.length },
    {
      kind: 'cutPoints',
      count: t.cutPoints.members.length,
      member: best >= 0 ? (result.memberIds[t.cutPoints.members[best] as number] as string) : null,
      cutOff: best >= 0 ? (t.cutPoints.cutOff[best] as number) : 0,
    },
  ];
}

function negative(project: Project, result: AnalysisResult): QuestionReadout | null {
  const layer = questionSignedLayer(project);
  if (!layer) return null;
  const ids = new Set(project.members.map((m) => m.id));
  const value = new Map<string, number>();
  for (const t of project.ties)
    if (
      t.variable === layer.key &&
      t.wave === DEFAULT_WAVE &&
      typeof t.value === 'number' &&
      ids.has(t.rater_id) &&
      ids.has(t.ratee_id)
    )
      value.set(`${t.rater_id}\u0000${t.ratee_id}`, t.value);
  let given = 0;
  let returned = 0;
  for (const [key, v] of value) {
    if (!(v < 0)) continue;
    given += 1;
    const [a, b] = key.split('\u0000') as [string, string];
    if ((value.get(`${b}\u0000${a}`) ?? 0) < 0) returned += 1;
  }
  const triads = result.signed[layer.key]?.triads;
  const total = triads ? triads.balanced + triads.unbalanced : 0;
  return {
    kind: 'negative',
    layer: layer.label,
    given,
    returned,
    balance: triads && total > 0 && given > 0 ? { triads: total, balanced: triads.balanced } : null,
  };
}

/** The readouts that answer a question, from the analysis on screen. */
export function questionReadouts(
  id: QuestionId,
  project: Project,
  result: AnalysisResult,
  ref: string,
  layerLabel: string,
): Readout[] {
  const r = result.refs[ref];
  if (!r) return [];
  const network = networkReadouts(project, result, ref, layerLabel);
  const pick = (...kinds: NetworkReadout['kind'][]) =>
    kinds.flatMap((k) => network.filter((x) => x.kind === k));
  const directed = result.view === 'directed';
  const some = <T>(x: T | null): T[] => (x ? [x] : []);
  switch (id) {
    case 'connected':
      return pick('density', 'reciprocity', 'parts');
    case 'information':
      return [...some(asked(r)), ...pick('reciprocity')];
    case 'groups':
      return [...pick('mixing'), ...some(groupPairs(project, r, directed))];
    case 'brokers':
      return [...pick('communities'), ...some(topBroker(result, r))];
    case 'depend':
      return [...some(load(r, layerLabel)), ...pick('centralisation')];
    case 'informal':
      return some(formalInformal(project, result));
    case 'singleRoute':
      return cutPoints(result, r);
    case 'negative':
      return some(negative(project, result));
  }
}

/** Whether a metric reads higher-is-more of what its sentence describes; constraint reads the other way. */
export const METRIC_DIRECTION: Partial<Record<SizeMetric, -1>> = { constraint: -1 };

export interface MemberReadout {
  metric: SizeMetric;
  /** Colleagues with a defined value whom the member exceeds, in the sentence's direction. */
  beyond: number;
  /** Colleagues with a defined value who exceed the member. */
  behind: number;
  /** Colleagues with the same value. */
  equal: number;
  /** Colleagues whose value is not defined. */
  undefinedOthers: number;
  /** Median of the member's group (the group rules' attribute), with its name and size. */
  group: { attribute: string; value: string; median: number; size: number } | null;
}

/** How a member's value compares with their colleagues', for the sentence beside the rank. */
export function memberReadout(
  project: Project,
  column: ArrayLike<number>,
  index: number,
  metric: SizeMetric,
): MemberReadout | null {
  const v = column[index] as number;
  if (!Number.isFinite(v)) return null;
  const sign = METRIC_DIRECTION[metric] ?? 1;
  let beyond = 0;
  let behind = 0;
  let equal = 0;
  let undefinedOthers = 0;
  for (let k = 0; k < column.length; k++) {
    if (k === index) continue;
    const x = column[k] as number;
    if (!Number.isFinite(x)) undefinedOthers += 1;
    else if (x === v) equal += 1;
    else if ((v - x) * sign > 0) beyond += 1;
    else behind += 1;
  }
  const attr = insightGroup(project);
  const own = attr ? (project.members[index]?.attributes[attr.key] ?? null) : null;
  let group: MemberReadout['group'] = null;
  if (attr && own !== null && own !== '') {
    const values: number[] = [];
    project.members.forEach((m, k) => {
      if (m.attributes[attr.key] === own) values.push(column[k] as number);
    });
    group = { attribute: attr.label, value: own, median: median(values), size: values.length };
  }
  return { metric, beyond, behind, equal, undefinedOthers, group };
}
