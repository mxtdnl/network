// The analysis pipeline (plan §1.4): rescale → directed or symmetrised view →
// composite → graphs → metrics. `prepare` builds every layer's weights once;
// the worker keeps the prepared input so resilience and bootstrap requests
// reuse it.

import { ratingFlag } from '../data/quality';
import { reciprocity, rescaleUnsigned, scaleSigned, signedPart, symmetrise } from './aggregate';
import { compositeFormula, compositeMatrix } from './composite';
import { denseGraph, pathGraph, tieCount, type DenseGraph } from './graphs';
import { INSIGHT_RULES, observe } from './insights';
import { bootstrap } from './metrics/bootstrap';
import { multiplex, type MultiplexLayer } from './metrics/multiplex';
import {
  averageClustering,
  centralisation,
  communities,
  communityColumn,
  components,
  density,
  mixing,
} from './metrics/network';
import { metricKeysFor, nodeMetrics } from './metrics/node';
import { resilience } from './metrics/resilience';
import { leaveOut, reconstruct, standardiseRows } from './remedies';
import { shortestPath } from './paths';
import { signedResult } from './metrics/signed';
import { Scheduler, type RunControl } from './schedule';
import {
  COMPOSITE,
  type AnalysisInput,
  type AnalysisResult,
  type BootstrapOptions,
  type BootstrapResult,
  type CompositeFormula,
  type EngineLayer,
  type EngineWarning,
  type LayerKey,
  type LayerRef,
  type MemberId,
  type NodeMetricKey,
  type RefKind,
  type PathResult,
  type RefResult,
  type ResilienceResult,
} from './types';

export interface PreparedRef {
  ref: LayerRef;
  kind: RefKind;
  layer?: LayerKey;
  /** Directed weights before symmetrisation (≥ 0, NaN = not rated). */
  directed: Float64Array;
  /** Weights in the requested view (≥ 0, NaN = not rated). */
  view: Float64Array;
  /** Symmetrised weights (by the chosen rule), used for communities. */
  symmetric: Float64Array;
}

export interface Prepared {
  input: AnalysisInput;
  n: number;
  refs: PreparedRef[];
  /** Signed layers on the −1..1 scale, directed. */
  signedScaled: Map<LayerKey, Float64Array>;
  composite: CompositeFormula | null;
  warnings: EngineWarning[];
  /** Members who gave no ratings (from the coverage the input carries), by index. */
  silent: Set<number>;
  /** Directions reconstructed per layer (engine/remedies.ts): a 0/1 mask, directed. */
  reconstructed: Map<LayerKey, Uint8Array>;
}

/** Members who gave none of the ratings possible for them (data/quality.ts ratingFlag). */
export function silentMembers(input: AnalysisInput): Set<number> {
  const index = new Map(input.memberIds.map((id, i) => [id, i]));
  const out = new Set<number>();
  for (const r of input.coverage?.raters ?? []) {
    const i = index.get(r.id);
    if (i !== undefined && ratingFlag(r) === 'gaveNoRatings') out.add(i);
  }
  return out;
}

export function prepare(input: AnalysisInput): Prepared {
  const n = input.memberIds.length;
  const { view, symmetrise: rule } = input.settings;
  const warnings: EngineWarning[] = [];
  const refs: PreparedRef[] = [];
  const signedScaled = new Map<LayerKey, Float64Array>();
  const layers: EngineLayer[] = [];
  const ratings: Float64Array[] = [];
  const silent = silentMembers(input);
  const reconstructed = new Map<LayerKey, Uint8Array>();
  const scaled = new Map<LayerKey, Float64Array>();
  const standardise = input.settings.standardise ?? 'none';
  const fill = (key: LayerKey, m: Float64Array, layer: EngineLayer): Float64Array => {
    if (!input.settings.reconstruct || !layer.mutual || silent.size === 0) return m;
    const r = reconstruct(m, n, silent);
    if (r.count > 0) reconstructed.set(key, r.filled);
    return r.ratings;
  };

  input.layers.forEach((layer, k) => {
    const r = input.ratings[k];
    if (!r || r.length !== n * n)
      throw new Error(`prepare: ratings for ${layer.key} are not ${String(n)}×${String(n)}`);
    if (!(layer.max > layer.min) || (layer.signed && !(layer.min < 0 && layer.max > 0))) {
      warnings.push({ code: 'invalidScale', layer: layer.key });
      return;
    }
    layers.push(layer);
    ratings.push(r);
  });

  const add = (
    ref: LayerRef,
    kind: RefKind,
    directed: Float64Array,
    sym: Float64Array,
    layer?: LayerKey,
  ) => {
    refs.push({
      ref,
      kind,
      ...(layer === undefined ? {} : { layer }),
      directed,
      view: view === 'directed' ? directed : sym,
      symmetric: sym,
    });
  };

  layers.forEach((layer, k) => {
    const r = ratings[k] as Float64Array;
    if (layer.signed) {
      // Signed layers are symmetrised before the split, so a dyad's sign follows the rule (plan Q4).
      const s = fill(layer.key, scaleSigned(r, layer), layer);
      scaled.set(layer.key, s);
      signedScaled.set(layer.key, s);
      const sSym = symmetrise(s, n, rule);
      add(`${layer.key}+`, 'positive', signedPart(s, 1), signedPart(sSym, 1), layer.key);
      add(`${layer.key}-`, 'negative', signedPart(s, -1), signedPart(sSym, -1), layer.key);
    } else {
      // Standardise each rater's own ratings, then reconstruct from them (engine/remedies.ts).
      const w = fill(
        layer.key,
        standardiseRows(rescaleUnsigned(r, layer), n, standardise, silent),
        layer,
      );
      scaled.set(layer.key, w);
      add(layer.key, 'unsigned', w, symmetrise(w, n, rule), layer.key);
    }
  });

  let composite: CompositeFormula | null = null;
  if (layers.length === 0) {
    warnings.push({ code: 'compositeUndefined', reason: 'noLayers' });
  } else {
    composite = compositeFormula(layers, input.settings);
    if (composite) {
      const c = compositeMatrix(composite, layers, ratings, n, scaled);
      add(COMPOSITE, 'composite', c, symmetrise(c, n, rule));
    } else {
      warnings.push({ code: 'compositeUndefined', reason: 'noWeightedLayers' });
    }
  }
  return { input, n, refs, signedScaled, composite, warnings, silent, reconstructed };
}

export function viewGraph(p: Prepared, ref: LayerRef): DenseGraph {
  const r = p.refs.find((x) => x.ref === ref);
  if (!r) throw new Error(`Unknown layer ${ref}`);
  return denseGraph(r.view, p.n, p.input.settings.view === 'directed');
}

function refResult(p: Prepared, r: PreparedRef, warnings: EngineWarning[]): RefResult {
  const directed = p.input.settings.view === 'directed';
  const g = denseGraph(r.view, p.n, directed);
  const metrics = nodeMetrics(g, r.kind);
  const { eigenvectorReason } = metrics;
  const table =
    p.input.settings.nonRespondents === 'leaveOut'
      ? leaveOut(metrics.table, p.silent, ownRatingMetrics(directed))
      : metrics.table;
  if (eigenvectorReason)
    warnings.push({ code: 'eigenvectorUndefined', ref: r.ref, reason: eigenvectorReason });
  const clusteringValues = table.columns.clustering ?? new Float64Array(0);
  const mix: RefResult['network']['mixing'] = {};
  for (const [key, column] of Object.entries(p.input.attributes)) mix[key] = mixing(g, column);
  const found = communities(denseGraph(r.symmetric, p.n, false), p.input.settings.seed);
  return {
    ref: r.ref,
    kind: r.kind,
    ...(r.layer === undefined ? {} : { layer: r.layer }),
    node: table,
    network: {
      members: p.n,
      ties: tieCount(g),
      density: density(g),
      reciprocity: reciprocity(r.directed, p.n),
      averageClustering: averageClustering(clusteringValues),
      components: components(g),
      centralisation: centralisation(p.n, directed, table),
      mixing: mix,
      communityMixing: found ? mixing(g, communityColumn(found)) : null,
    },
    communities: found,
    weights: r.view.slice(),
  };
}

/**
 * Runs every metric on a prepared input. `reuse`, an earlier result for the
 * same ratings, view and rule (the same `baseKey`), supplies every layer's
 * results, the signed results and multiplexity; only the composite, the one
 * thing weights change, is then recomputed.
 */
export async function analysePrepared(
  p: Prepared,
  control: RunControl = {},
  reuse: AnalysisResult | null = null,
): Promise<AnalysisResult> {
  const s = new Scheduler(control);
  const { input, n } = p;
  const directed = input.settings.view === 'directed';
  const warnings = [...p.warnings];
  const steps = p.refs.length + 2;
  let done = 0;

  const refs: Record<LayerRef, RefResult> = {};
  for (const r of p.refs) {
    s.progress(done / steps, r.ref);
    const earlier = r.kind === 'composite' ? undefined : reuse?.refs[r.ref];
    if (earlier) {
      // Warnings belong to the layer's own metrics, so they are carried over too.
      for (const w of reuse?.warnings ?? [])
        if (w.code === 'eigenvectorUndefined' && w.ref === r.ref) warnings.push(w);
      refs[r.ref] = earlier;
    } else {
      await s.pause();
      refs[r.ref] = refResult(p, r, warnings);
    }
    done += 1;
  }

  s.progress(done / steps, 'signed');
  await s.pause();
  let signed: AnalysisResult['signed'] = {};
  if (reuse) signed = reuse.signed;
  else
    for (const [key, sc] of p.signedScaled)
      signed[key] = signedResult(key, sc, n, input.settings.symmetrise);
  done += 1;

  s.progress(done / steps, 'multiplex');
  await s.pause();
  const layerRefs = p.refs.filter((r) => r.kind !== 'composite');
  let mx: AnalysisResult['multiplex'] = null;
  if (reuse) {
    mx = reuse.multiplex;
  } else if (layerRefs.length > 1) {
    const find = (role: 'formal' | 'informal') =>
      input.layers.find((l) => l.role === role && !l.signed);
    const formal = find('formal');
    const informal = find('informal');
    const fRef = formal && p.refs.find((r) => r.ref === formal.key);
    const gRef = informal && p.refs.find((r) => r.ref === informal.key);
    mx = multiplex(
      layerRefs.map((r): MultiplexLayer => ({ ref: r.ref, weights: r.view })),
      n,
      directed,
      formal && informal && fRef && gRef
        ? { formal: formal.key, informal: informal.key, f: fRef.view, g: gRef.view }
        : null,
    );
  }
  s.progress(1, 'done');

  const coverage = input.coverage ?? null;
  const raters = new Map(coverage?.raters.map((r) => [r.id, r]));
  const ratingFlags = input.memberIds.map((id) => {
    const c = raters.get(id);
    return c ? ratingFlag(c) : null;
  });

  // Left out of the rules: no value of theirs is read by the member-level rules (engine/remedies.ts).
  const ruleRefs: Record<LayerRef, RefResult> =
    input.settings.nonRespondents === 'leaveOut' && p.silent.size > 0
      ? Object.fromEntries(
          Object.entries(refs).map(([k, r]) => [
            k,
            { ...r, node: leaveOut(r.node, p.silent, OWN_RATING_METRICS) },
          ]),
        )
      : refs;
  const insights = observe({
    ids: input.memberIds,
    ratingFlags,
    directed,
    refs: ruleRefs,
    refOrder: p.refs.map((r) => r.ref),
    attributes: input.attributes,
    signed: p.signedScaled,
    multiplex: mx,
    ...(input.settings.insightGroup ? { groupAttribute: input.settings.insightGroup } : {}),
    excludedLayers: input.layers
      .filter((l) => l.group !== undefined && INSIGHT_RULES.excludedLayerGroups.includes(l.group))
      .map((l) => l.key),
  });

  return {
    inputKey: input.inputKey,
    view: input.settings.view,
    symmetrise: input.settings.symmetrise,
    memberIds: input.memberIds,
    refOrder: p.refs.map((r) => r.ref),
    refs,
    signed,
    multiplex: mx,
    composite: p.composite,
    coverage,
    ratingFlags,
    ownRatingMetrics: ownRatingMetrics(directed),
    remedies: {
      nonRespondents: input.settings.nonRespondents ?? 'mark',
      reconstruct: input.settings.reconstruct ?? false,
      standardise: input.settings.standardise ?? 'none',
    },
    reconstructed: Object.fromEntries(
      [...p.reconstructed].map(([key, mask]) => {
        const pairs: [number, number][] = [];
        mask.forEach((v, k) => {
          if (v) pairs.push([Math.floor(k / n), k % n]);
        });
        return [key, pairs];
      }),
    ),
    insights,
    warnings,
  };
}

const OWN_RATING_METRICS: NodeMetricKey[] = [
  'inStrength',
  'outStrength',
  'strength',
  'inDegree',
  'outDegree',
  'degree',
  'betweenness',
  'betweennessBinary',
  'harmonicIn',
  'harmonicOut',
  'harmonic',
  'eigenvector',
  'constraint',
  'effectiveSize',
  'clustering',
];
/** In the directed view these read only other members' ratings of the member. */
const INCOMING_METRICS: NodeMetricKey[] = ['inStrength', 'inDegree', 'harmonicIn'];

/** Metrics that depend on a member's own ratings in the view (D147). */
export function ownRatingMetrics(directed: boolean): NodeMetricKey[] {
  return OWN_RATING_METRICS.filter((m) => !directed || !INCOMING_METRICS.includes(m));
}

export function analyse(input: AnalysisInput, control: RunControl = {}): Promise<AnalysisResult> {
  return analysePrepared(prepare(input), control);
}

/** Path-based work is refused on negative sub-layers (plan Q11). */
function assertNotNegative(p: Prepared, ref: LayerRef, what: string): void {
  if (p.refs.find((x) => x.ref === ref)?.kind === 'negative') {
    throw new Error(`${what} is not computed on a negative sub-layer`);
  }
}

export function runResilience(
  p: Prepared,
  ref: LayerRef,
  removed: readonly MemberId[],
): ResilienceResult {
  assertNotNegative(p, ref, 'Resilience');
  return resilience(viewGraph(p, ref), ref, p.input.memberIds, removed);
}

export async function runBootstrap(
  p: Prepared,
  opts: BootstrapOptions,
  control: RunControl = {},
): Promise<BootstrapResult> {
  const directed = p.input.settings.view === 'directed';
  if (!metricKeysFor(directed, 'negative').includes(opts.metric)) {
    assertNotNegative(p, opts.ref, opts.metric);
  }
  return bootstrap(viewGraph(p, opts.ref), opts, control);
}

/**
 * Shortest path (distance 1/w) between two members on a layer in the current
 * view; null when there is no path. Refused on negative sub-layers (plan Q11).
 */
export function runPath(
  p: Prepared,
  ref: LayerRef,
  from: MemberId,
  to: MemberId,
): PathResult | null {
  assertNotNegative(p, ref, 'A shortest path');
  const ids = p.input.memberIds;
  const a = ids.indexOf(from);
  const b = ids.indexOf(to);
  if (a < 0 || b < 0) throw new Error(`Unknown member ${a < 0 ? from : to}`);
  const found = shortestPath(pathGraph(viewGraph(p, ref)), a, b);
  if (!found) return null;
  return {
    ref,
    members: found.path.map((i) => ids[i] as MemberId),
    distance: found.distance,
    hops: found.path.length - 1,
    shortestPaths: found.count,
  };
}
