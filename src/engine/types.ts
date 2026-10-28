// Engine types shared by the analysis modules, the worker and ui/engineClient.ts
// (plan §1.2). Pure data: no functions, no graph objects, so every value can
// cross the worker boundary by structured clone or transfer.
//
import type { CoverageResult } from '../data/coverage';
import type { RatingFlag } from '../data/quality';
import type { LayerRole } from '../data/schema';

export type { CoverageResult, RatingFlag };

// Conventions (docs/method-notes.md):
// - Matrices are n × n, row-major, `m[i * n + j]` for the tie i → j.
// - Inside the engine a missing rating is NaN (CLAUDE.md D2); `null` exists only
//   in project files and the store. engine/input.ts is the only place one
//   becomes the other.
// - A metric that is not defined for a member is NaN, and `flags` says why.

export type MemberId = string;
export type LayerKey = string;
export type AttributeKey = string;
/** A layer key, `${key}+` / `${key}-` for a signed layer's sub-layers, or 'composite'. */
export type LayerRef = string;

export type ViewKind = 'directed' | 'symmetrised';
/** 'both': a tie only where both directions report one (build plan session 5). */
export type SymmetriseRule = 'mean' | 'min' | 'max' | 'both';
export type SignedTreatment = 'positive' | 'filterNegative' | 'multiplier';
/** Rater standardisation of unsigned layers (engine/remedies.ts, build plan session 5). */
export type StandardiseMethod = 'none' | 'rank';
/** Members who gave no ratings: marked in the results (default) or left out (engine/remedies.ts). */
export type NonRespondentTreatment = 'mark' | 'leaveOut';

export const COMPOSITE: LayerRef = 'composite';

export interface EngineLayer {
  key: LayerKey;
  label: string;
  min: number;
  max: number;
  signed: boolean;
  /** The kind of relation (layerRole); the rules read roles, never keys (build plan session 11).
   *  Absent means 'other'. */
  role?: LayerRole;
  defaultWeight: number;
  /** The relation is mutual by nature, so a missing direction may be reconstructed (engine/remedies.ts). */
  mutual?: boolean;
}

export interface EngineSettings {
  view: ViewKind;
  symmetrise: SymmetriseRule;
  /** Raw slider values; layers without an entry use their default weight. */
  weights: Record<LayerKey, number>;
  /** Signed layers without an entry use 'positive'. */
  signedTreatment: Record<LayerKey, SignedTreatment>;
  /** Louvain seed (project settings.random_seed). */
  seed: number;
  /** Attribute the silo, formal–informal and one-way rules group members by (settings.insight_group). */
  insightGroup?: AttributeKey;
  /** Members who gave no ratings (build plan session 5); absent means 'mark'. */
  nonRespondents?: NonRespondentTreatment;
  /** Reconstruct the ties of members who gave no ratings on mutual layers; absent means off. */
  reconstruct?: boolean;
  /** Rater standardisation of unsigned layers; absent means 'none'. */
  standardise?: StandardiseMethod;
}

export interface AttributeColumn {
  /** Known categories in display order; values not listed follow in order of first appearance. */
  categories: string[];
  /** One value per member; null = not recorded. */
  values: (string | null)[];
}

export interface AnalysisInput {
  /** Identifies the project revision and settings this input was built from. */
  inputKey: string;
  /**
   * Identifies the ratings, view and symmetrisation rule without the composite
   * weights. When it matches the previous input, the worker reuses every
   * result except the composite's, so a weight change recomputes only the
   * composite (plan §5 risk 4).
   */
  baseKey?: string;
  memberIds: MemberId[];
  attributes: Record<AttributeKey, AttributeColumn>;
  /** Enabled, non-categorical layers. */
  layers: EngineLayer[];
  /** One n × n tensor per layer, aligned with `layers`; NaN = not rated, diagonal NaN. */
  ratings: Float64Array[];
  settings: EngineSettings;
  /** Data coverage, computed from the project on the main thread (CLAUDE.md D29), passed through. */
  coverage?: CoverageResult | null;
}

// ------------------------------------------------------------ node metrics

export type NodeMetricKey =
  | 'inStrength'
  | 'outStrength'
  | 'strength'
  | 'inDegree'
  | 'outDegree'
  | 'degree'
  | 'betweenness'
  | 'betweennessBinary'
  | 'harmonicIn'
  | 'harmonicOut'
  | 'harmonic'
  | 'eigenvector'
  | 'constraint'
  | 'effectiveSize'
  | 'clustering';

/** Why a value is not defined (NaN), or why a defined value needs a note. */
export type NodeFlag =
  | 'isolated'
  | 'outsideLargestComponent'
  | 'noComponent'
  | 'notConverged'
  | 'fewerThanTwoContacts'
  /** Not defined because the member gave no ratings and the analysis leaves them out (engine/remedies.ts). */
  | 'leftOut'
  | RatingFlag;

export interface NodeMetricTable {
  /** Only the metrics computed for this layer and view are present. */
  columns: Partial<Record<NodeMetricKey, Float64Array>>;
  /** Per-member flags for a metric, null where there is nothing to say. */
  flags: Partial<Record<NodeMetricKey, (NodeFlag | null)[]>>;
  /** Metrics deliberately not computed for this layer, with the reason. */
  omitted: { metrics: NodeMetricKey[]; reason: 'negativeSubLayer' } | null;
}

// --------------------------------------------------------- network metrics

export interface Reciprocity {
  /** Share of directed ties that are reciprocated (nx.overall_reciprocity). */
  overall: number;
  /** Mutual dyads / (mutual + asymmetric dyads). */
  dyad: number;
  mutualDyads: number;
  asymmetricDyads: number;
}

export interface Components {
  /** Directed view: weakly and strongly connected component sizes, largest first. */
  weak?: number[];
  strong?: number[];
  /** Symmetrised view: connected component sizes, largest first. */
  connected?: number[];
}

export interface Centralisation {
  inDegree?: number;
  outDegree?: number;
  degree?: number;
  /** Freeman centralisation of binary (unweighted) betweenness. */
  betweenness?: number;
}

export interface GroupMixing {
  groups: string[];
  /** Members with no value for the attribute; their ties are left out. */
  excluded: number;
  internal: number;
  external: number;
  /** (E − I) / (E + I). */
  ei: number;
  perGroup: { group: string; size: number; internal: number; external: number; ei: number }[];
  /** groups × groups, row-major: tie density from row group to column group. */
  density: Float64Array;
  /** groups × groups, row-major: ties from row group to column group (symmetric when mutual). */
  ties: Float64Array;
  /** groups × groups, row-major: the ties possible, the denominator of `density`. */
  possible: Float64Array;
}

export interface NetworkMetrics {
  members: number;
  ties: number;
  density: number;
  reciprocity: Reciprocity;
  averageClustering: number;
  components: Components;
  centralisation: Centralisation;
  mixing: Record<AttributeKey, GroupMixing>;
  /** Mixing by the layer's own communities (groups named "1", "2", …), null without communities. */
  communityMixing: GroupMixing | null;
}

export interface CommunityResult {
  /** Community index per member, numbered by lowest member index. */
  membership: Int32Array;
  count: number;
  modularity: number;
  resolution: number;
  seed: number;
  /** Louvain runs from the seeded stream; the best partition is kept. */
  restarts: number;
}

export type RefKind = 'unsigned' | 'positive' | 'negative' | 'composite';

// ------------------------------------------------- ties, cut points and load

/** Edge betweenness of every tie of the view graph (directed: ordered; mutual: from < to). */
export interface TieBetweenness {
  from: Int32Array;
  to: Int32Array;
  /** nx.edge_betweenness_centrality(weight='distance', normalized=True). */
  values: Float64Array;
}

/** Local bridges on the ties read without direction (nx.local_bridges, with_span), from < to. */
export interface LocalBridges {
  from: Int32Array;
  to: Int32Array;
  /** Steps between the two members once the tie is removed; Infinity when no other route. */
  span: Float64Array;
}

/** Cut points on the ties read without direction (nx.articulation_points), in member order. */
export interface CutPoints {
  members: Int32Array;
  /** Per cut point: members cut off from the largest part that remains once it is removed. */
  cutOff: Int32Array;
}

export interface TieStructure {
  betweenness: TieBetweenness;
  localBridges: LocalBridges;
  cutPoints: CutPoints;
}

export interface LoadShare {
  /** Members counted. */
  members: number;
  /** The members receiving most ties, ⌈top share · members⌉ (at least one), highest first. */
  top: Int32Array;
  /** Ties the members receive. */
  received: number;
  /** Ties the top members receive. */
  held: number;
  /** held / received; NaN when nobody receives a tie. */
  share: number;
}

export interface GroupLoad extends LoadShare {
  group: string;
}

export interface LoadResult {
  /** Ties received per member, from the directed ratings in either view. */
  incoming: Float64Array;
  topShare: number;
  overall: LoadShare;
  /** Within each group of every attribute, the share held by the group's own top members. */
  byGroup: Record<AttributeKey, GroupLoad[]>;
}

export interface RefResult {
  ref: LayerRef;
  kind: RefKind;
  /** Source layer; absent for the composite. */
  layer?: LayerKey;
  node: NodeMetricTable;
  network: NetworkMetrics;
  /** Louvain on the symmetrised graph of this layer (plan Q9), null when it has no ties. */
  communities: CommunityResult | null;
  /** Edge betweenness, local bridges and cut points (build plan session 7); null on negative sub-layers. */
  ties: TieStructure | null;
  /** Ties received per member and their concentration; null on negative sub-layers. */
  load: LoadResult | null;
  /**
   * n × n tie weights (0–1) in the requested view, NaN = not rated: the values
   * the metrics were computed from, used by the map for edge width, the
   * threshold and layout attraction (CLAUDE.md D51). A copy, so transferring
   * it leaves the worker's prepared input intact.
   */
  weights: Float64Array;
}

// ------------------------------------------------------------------ signed

export interface TriadCounts {
  ppp: number;
  ppn: number;
  pnn: number;
  nnn: number;
  balanced: number;
  unbalanced: number;
  /** balanced / (balanced + unbalanced). */
  balanceRatio: number;
}

export interface SignedResult {
  layer: LayerKey;
  /** Σ_j of positive (negative) ratings received, on the −1..1 scale. */
  inPositive: Float64Array;
  inNegative: Float64Array;
  inPositiveCount: Int32Array;
  inNegativeCount: Int32Array;
  /** Structural balance on the signed graph symmetrised by the chosen rule. */
  triads: TriadCounts;
}

// ------------------------------------------------------------- multiplexity

export interface FormalInformalCounts {
  formalOnly: number;
  informalOnly: number;
  both: number;
  neither: number;
  notClassified: number;
}

export const FI_CLASS = {
  none: 0,
  formalOnly: 1,
  informalOnly: 2,
  both: 3,
  neither: 4,
  notClassified: 5,
} as const;

export interface MultiplexResult {
  refs: LayerRef[];
  /** refs × refs, row-major Jaccard overlap of tie sets. */
  jaccard: Float64Array;
  /** Index k: number of pairs tied in exactly k of `refs`. */
  overlapDistribution: number[];
  /** n × n: number of refs in which the pair is tied (symmetric in the symmetrised view). */
  pairCounts: Uint8Array;
  formalInformal: {
    formal: LayerKey;
    informal: LayerKey;
    counts: FormalInformalCounts;
    /** n × n, FI_CLASS codes; the diagonal is FI_CLASS.none. */
    classes: Uint8Array;
  } | null;
}

// ---------------------------------------------------------------- composite

export interface CompositeTerm {
  layer: LayerKey;
  label: string;
  rawWeight: number;
  /** Normalised so the terms' weights sum to 1. */
  weight: number;
  /** rescale: (v − min)/(max − min); positivePart: max(v, 0)/max. */
  transform: 'rescale' | 'positivePart';
}

export interface CompositeFormula {
  terms: CompositeTerm[];
  /** Signed layers whose negative ratings remove the tie. */
  filters: { layer: LayerKey; label: string }[];
  /** Signed layers applied as m = 1 + α·s, s the rating on the −1..1 scale. */
  multipliers: { layer: LayerKey; label: string; alpha: number }[];
  /** Layers with weight 0, left out entirely. */
  excluded: LayerKey[];
  /** Weights are renormalised over the terms rated for each pair (plan Q2). */
  missingRule: 'renormalise';
  /** The composite is capped at this value after multipliers. */
  cap: number;
  /** Plain notation, e.g. "C = 0.25·r(Connection strength) + …". */
  notation: string;
}

// ----------------------------------------------------------------- insights

/** The rule-based observations of the insights panel (spec §9). */
export type InsightRuleId =
  | 'brokers'
  | 'peripheral'
  | 'overload'
  | 'onlyRoutes'
  | 'concentratedDemand'
  | 'silo'
  | 'negativeCluster'
  | 'formalOnly'
  | 'informalOnly'
  | 'oneWayNegative';

/** Why a rule could not be applied to this analysis. */
export type InsightUnavailable =
  | 'noComposite'
  | 'noLayers'
  | 'layersNotEnabled'
  | 'noGroupAttribute'
  | 'tooFewGroups'
  | 'noSignedLayer'
  | 'noFormalInformal';

/**
 * The map configuration that shows an observation: which ties to draw, how to
 * size and place members, and whom to highlight. The UI turns it into map
 * settings; the engine knows nothing of the UI.
 */
export interface InsightView {
  layer: LayerRef;
  sizeMetric: NodeMetricKey;
  layout: 'force' | 'grouped' | 'hierarchy';
  groupBy: AttributeKey | null;
  filters: { key: AttributeKey; values: string[] }[];
  highlight: MemberId[];
  /** Layer keys whose encodings (edge colour, edge style) should be switched on. */
  show: LayerKey[];
  /** Draw ties carrying a negative rating whatever the tie-strength range. */
  drawNegative?: boolean;
  /** Mark bridge ties (local bridges) on the map. */
  markBridges?: boolean;
}

/**
 * One observation. Structured only: wording lives in ui/copy/insights.ts
 * (CLAUDE.md D9), so it can be checked and anonymised at render time.
 */
export interface Observation {
  rule: InsightRuleId;
  /** The layer, sub-layer or composite the evidence comes from. */
  ref: LayerRef;
  /** Members the observation concerns, in the order the rule ranks them. */
  members: MemberId[];
  /** The group a silo observation concerns; for a formal–informal gap, the pair of groups. */
  group?: { attribute: AttributeKey; value: string; other?: string };
  /**
   * Counts by pair of groups: for one-way negative ratings, the rater's group
   * first; for only routes, the group's ties with each other group.
   */
  groups?: { attribute: AttributeKey; value: string; other: string; count: number }[];
  /** Figures quoted in the wording; which keys are present depends on the rule. */
  evidence: Record<string, number>;
  view: InsightView;
  /**
   * Attribute values most of `members` share, more often than members as a whole
   * (INSIGHT_RULES.shared), most shared first.
   */
  shared?: { attribute: AttributeKey; value: string; count: number }[];
  /** Members named who gave no ratings: their own view of their ties is missing. */
  noRatings?: MemberId[];
}

export interface InsightOutcome {
  rule: InsightRuleId;
  status: 'observed' | 'none' | 'unavailable';
  reason?: InsightUnavailable;
  observations: Observation[];
  /** Peripheral members found who are listed with a silo group instead (INSIGHT_RULES.overlap). */
  inSilo?: number;
}

// ----------------------------------------------------------------- analysis

export type EngineWarning =
  | { code: 'compositeUndefined'; reason: 'noWeightedLayers' | 'noLayers' }
  | { code: 'invalidScale'; layer: LayerKey }
  | { code: 'eigenvectorUndefined'; ref: LayerRef; reason: 'noComponent' | 'notConverged' };

export interface AnalysisResult {
  inputKey: string;
  view: ViewKind;
  symmetrise: SymmetriseRule;
  memberIds: MemberId[];
  refOrder: LayerRef[];
  refs: Record<LayerRef, RefResult>;
  signed: Record<LayerKey, SignedResult>;
  multiplex: MultiplexResult | null;
  composite: CompositeFormula | null;
  /** Response rates and the threshold flag (spec §6), or null when the input had none. */
  coverage: CoverageResult | null;
  /**
   * Per member: gave no ratings, or fewer than QUALITY_RULES.fewRatings of those
   * possible (from `coverage`, build plan session 4). All null without coverage.
   */
  ratingFlags: (RatingFlag | null)[];
  /**
   * The node metrics whose values depend on a member's own ratings in this
   * view, which carry the member's rating flag: every metric when the
   * directions are combined, all but the incoming ones when directed.
   */
  ownRatingMetrics: NodeMetricKey[];
  /** The data remedies applied (build plan session 5), as given in the settings. */
  remedies: {
    nonRespondents: NonRespondentTreatment;
    reconstruct: boolean;
    standardise: StandardiseMethod;
  };
  /**
   * Directions reconstructed from the other side's rating, per layer, as
   * [rater index, rated index] pairs (engine/remedies.ts); empty without reconstruction.
   */
  reconstructed: Record<LayerKey, [number, number][]>;
  /** Every insight rule, in panel order, with its observations (spec §9). */
  insights: InsightOutcome[];
  warnings: EngineWarning[];
}

// --------------------------------------------------------------- resilience

export interface ResilienceSnapshot {
  members: number;
  /** Directed view: weak and strong counts; symmetrised: connected count. */
  components: { weak?: number; strong?: number; connected?: number; largest: number };
  reachablePairs: number;
  /** Share of ordered pairs (u, v), u ≠ v, with a path from u to v. */
  reachability: number;
  /** Mean shortest-path distance (1/w) over reachable pairs only. */
  averageDistance: number;
  /** Mean shortest-path length in steps over reachable pairs only. */
  averageHops: number;
}

export interface ResilienceResult {
  ref: LayerRef;
  removed: MemberId[];
  before: ResilienceSnapshot;
  after: ResilienceSnapshot;
  change: {
    components: number;
    largest: number;
    reachability: number;
    averageDistance: number;
    averageHops: number;
  };
}

// --------------------------------------------------------------------- path

export interface PathResult {
  ref: LayerRef;
  /** Members along one shortest path, from the first member to the second. */
  members: MemberId[];
  /** Sum of 1/w along the path. */
  distance: number;
  hops: number;
  /** How many distinct paths share this shortest length. */
  shortestPaths: number;
}

// ---------------------------------------------------------------- bootstrap

export type BootstrapMetric = Exclude<NodeMetricKey, 'betweennessBinary'>;

export interface BootstrapOptions {
  ref: LayerRef;
  metric: BootstrapMetric;
  replicates: number;
  /** Share of members dropped in each replicate. */
  dropFraction: number;
  seed: number;
}

export interface BootstrapResult {
  ref: LayerRef;
  metric: BootstrapMetric;
  replicates: number;
  dropped: number;
  /** Rank on the full network, 1 = highest value; NaN where the metric is not defined. */
  observedRank: Float64Array;
  /** 2.5th and 97.5th percentiles of the member's rank, rescaled to the full network (1..n). */
  rankLow: Float64Array;
  rankHigh: Float64Array;
  /** Replicates in which the member was retained and its value was defined. */
  samples: Int32Array;
}
