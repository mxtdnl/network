// Project data model (spec §4, docs/plan.md §2). Pure types and constants: no
// React, no DOM, no engine imports.
//
// Missing ratings. A rating that was not given is `null` or absent, never 0,
// never `undefined` and never NaN (spec §4.2, CLAUDE.md D2). A tie whose value
// is `null` records that the rater declined to rate; a (rater, ratee, variable,
// wave) key with no tie at all means the rating was never entered. Both count
// as "not rated" everywhere; only the coverage view tells them apart (plan Q1).
//
// A third state, "does not apply", is a `null` tie with `not_applicable: true`:
// the rater said the question has no answer for this colleague (for example
// the quality of a relationship they do not have). It is not 0 (on a signed
// layer 0 is "neutral") and it is not missing: metrics treat it as no rating,
// and coverage leaves it out of the ratings that were possible (CLAUDE.md D102).

export const SCHEMA_VERSION = 4;
export const APP_NAME = 'Graticule';
export const APP_VERSION = '1.0.0';
export const PROJECT_FILE_EXTENSION = '.ona.json';
export const DEFAULT_WAVE = 1;

export type MemberId = string;
export type LayerKey = string;
export type AttributeKey = string;
export type ViewId = string;
export type ISODateTime = string;

/** A rating as stored: a number for scaled layers, a category key for
 *  categorical layers, `null` when the rater declined to rate. */
export type RatingValue = number | string | null;

export interface Member {
  id: MemberId;
  display_name: string;
  /** `null` means the attribute was not recorded for this member. */
  attributes: Record<AttributeKey, string | null>;
}

/** `email` holds an address for survey administration only (spec §4.1): it is
 *  never analysed, shown in analysis views, or placed in a survey link. */
export type AttributeType = 'categorical' | 'ordinal' | 'member_ref' | 'email';

export interface AttributeDefinition {
  key: AttributeKey;
  label: string;
  type: AttributeType;
  /** Known values; ordered for ordinal attributes. */
  categories?: string[];
  builtin: boolean;
  /** Included in survey links and shown to respondents (spec §4.1); absent means false. */
  shareable?: boolean;
}

export type ScaleType = 'strength' | 'frequency' | 'signed' | 'categorical';

export interface LayerDefinition {
  key: LayerKey;
  label: string;
  question_wording: string;
  scale_type: ScaleType;
  /** Ignored for categorical layers. */
  min: number;
  max: number;
  signed: boolean;
  default_weight: number;
  enabled: boolean;
  /** Core layers can be disabled but not deleted (spec §4.2). */
  core: boolean;
  builtin: boolean;
  scale_labels?: Record<string, string>;
  categories?: string[];
  category_labels?: Record<string, string>;
  /** Sub-layers of one question share a group, e.g. the two conflict layers. */
  group?: string;
  /** Marks the pair used by the formal–informal comparison. */
  role?: 'formal' | 'informal';
  /**
   * The relation is mutual by nature, so a missing direction may be
   * reconstructed from the other (build plan session 5). Absent: true for
   * the layers in MUTUAL_LAYER_KEYS, false otherwise (isMutualLayer). Added
   * to schema 4 in place, before release.
   */
  mutual?: boolean;
}

/** Layers mutual by nature when `mutual` is not set: working together involves both people. */
export const MUTUAL_LAYER_KEYS: readonly string[] = [
  'connection_strength',
  'formal_collaboration',
  'informal_collaboration',
];

export function isMutualLayer(layer: Pick<LayerDefinition, 'key' | 'mutual'>): boolean {
  return layer.mutual ?? MUTUAL_LAYER_KEYS.includes(layer.key);
}

export interface Tie {
  rater_id: MemberId;
  ratee_id: MemberId;
  variable: LayerKey;
  value: RatingValue;
  /** Survey wave; 1 unless stated (spec §2). */
  wave: number;
  /** The rater said the question does not apply to this colleague; `value` is then null. */
  not_applicable?: true;
  /** Where the rating came from (spec §4.2). Absent on ties saved before
   *  schema version 3: "Not recorded", never guessed. */
  source?: TieSource;
  /** The survey and version a self-reported rating answered. */
  survey?: { id: SurveyId; version: number };
}

export type TieSource = 'self_report' | 'imported' | 'entered';

// Saved views (spec §8, schema version 2; encodings added in version 4). A saved view records everything
// needed to show the map again as it was: the composite weights, the map's
// encodings, filters and layout, where each member was drawn and whether it
// was pinned, and the selection. Field names inside `weights`, `map` and
// `selection` follow the app's state (ui/state/store.ts) so a view is restored
// without translation. Version 1's shape is converted by migrations.ts.
export type LayerRef = string;
export type Preset = 'formal' | 'informal' | 'health' | 'custom';
export type SignedTreatment = 'positive' | 'filterNegative' | 'multiplier';

export interface AttributeFilter {
  key: AttributeKey;
  values: string[];
}

export interface SavedWeights {
  preset: Preset;
  /** Raw slider values under Custom; layers without an entry use their default weight. */
  custom: Record<LayerKey, number>;
  customTreatment: Record<LayerKey, SignedTreatment>;
}

/**
 * What edge colour shows (CLAUDE.md D126): a signed layer on the diverging
 * scale, an unsigned layer (or the composite) on the sequential ramp, whether
 * a tie runs within or between the node-fill groups, or nothing (stone).
 */
export type EdgeColourChoice =
  | { kind: 'signed'; layer: LayerKey }
  | { kind: 'unsigned'; layer: LayerRef }
  | { kind: 'groups' }
  | { kind: 'none' };

/** What edge width shows: the "Ties from" layer, another unsigned layer (or the composite), or nothing. */
export type EdgeWidthChoice =
  { kind: 'tiesFrom' } | { kind: 'layer'; layer: LayerRef } | { kind: 'uniform' };

export interface SavedMapSettings {
  view: 'directed' | 'symmetrised';
  /** 'both' added to schema 4 in place, before release (build plan session 5). */
  symmetrise: 'mean' | 'min' | 'max' | 'both';
  /** The layer the map draws ties from: a layer key or 'composite'. */
  layer: LayerRef;
  /** Node-size metric (engine NodeMetricKey). */
  sizeMetric: string;
  fill: { kind: 'attribute'; key: AttributeKey } | { kind: 'community' };
  /** Lower bound of the tie-strength range drawn. */
  threshold: number;
  /** Upper bound of the range (D141); absent means 1. Added to schema 4 in place, before release. */
  thresholdTo?: number;
  /** Ties with a negative rating drawn outside the range (D145); absent means false. Added to
   *  schema 4 in place, before release. */
  negativeOutsideRange?: boolean;
  /** Bridge ties marked (build plan session 7); absent means false. Schema 4 in place. */
  markBridges?: boolean;
  /** The question the view answers (build plan session 8), by catalogue id; absent or null means
   *  the analyst's own settings. Schema 4 in place. An id the app no longer knows is ignored. */
  question?: string | null;
  /** Members who gave no ratings: marked (absent) or left out (build plan session 5; schema 4 in place). */
  nonRespondents?: 'mark' | 'leaveOut';
  /** Reconstruct their ties on mutual layers from colleagues' ratings; absent means false. */
  reconstruct?: boolean;
  /** Rater standardisation of unsigned layers; absent means none. */
  standardise?: 'none' | 'rank';
  layerToggles: Record<LayerKey, boolean>;
  hideOffLayers: boolean;
  filters: AttributeFilter[];
  layout: 'force' | 'grouped' | 'circular' | 'hierarchy';
  groupBy: AttributeKey | null;
  ego: { member: MemberId; depth: 1 | 2 } | null;
  /** Members highlighted on the map; the rest are faded. */
  highlight: MemberId[];
  // Schema version 4 (CLAUDE.md D126, D132, D134, D136).
  edgeColour: EdgeColourChoice;
  /** A signed colour layer shows its negative ratings only, or the full scale (D132). */
  signedScale: 'negative' | 'full';
  edgeWidth: EdgeWidthChoice;
  edgeStyle: 'none' | 'formalInformal';
  /** Node area linear in the metric's value or in its rank (D134). */
  sizeScale: 'value' | 'rank';
  /** An outline around each community on the "Ties from" layer (D136). */
  communityOutlines: boolean;
}

export interface SavedPosition {
  x: number;
  y: number;
  pinned: boolean;
}

export interface SavedView {
  id: ViewId;
  name: string;
  /** Shown under the map in presentation mode. */
  caption: string;
  created_at: ISODateTime;
  weights: SavedWeights;
  map: SavedMapSettings;
  /** Layout coordinates by member; empty when the map had not been drawn. */
  positions: Record<MemberId, SavedPosition>;
  selection: { member: MemberId | null; group: MemberId[] };
}

/** Palettes the analyst may choose (D127): only those that pass tests/unit/contrast.test.ts. */
export const CATEGORICAL_PALETTES = ['tol-muted'] as const;
export const DIVERGING_PALETTES = ['orange-blue', 'purple-green', 'red-blue'] as const;
export type CategoricalPalette = (typeof CATEGORICAL_PALETTES)[number];
export type DivergingPalette = (typeof DIVERGING_PALETTES)[number];
/** Hues in a categorical palette (spec §12: at most 8). */
export const PALETTE_HUES = 8;

export interface ProjectSettings {
  /** Share of possible ratings below which whole-network metrics are flagged. */
  coverage_threshold: number;
  anonymise: boolean;
  exclude_signed_from_exports: boolean;
  random_seed: number;
  bootstrap: { replicates: number; drop_fraction: number };
  anonymisation_scheme: 'role_team';
  /** Palettes for node fill and the diverging edge scale (D127); absent means the defaults. */
  palette?: { categorical: CategoricalPalette; diverging: DivergingPalette };
  /** Hues pinned to attribute values (D127): attribute key → value → hue index (0-based) in the
   *  categorical palette. A hue is pinned to at most one value of an attribute. */
  group_colours?: Record<string, Record<string, number>>;
  /** Attribute the silo, formal–informal and one-way negative rules group members by
   *  (build plan session 3); absent means team. */
  insight_group?: string;
  /** Audience levels for presentation and exports (build plan session 9); absent means the
   *  analyst's own, unrestricted outputs. Schema 4 in place. */
  audience?: AudienceSettings;
  /** The executive summary as the analyst edited it, one per audience level (build plan
   *  session 10); absent for a level means the draft. Schema 4 in place. */
  summaries?: Partial<Record<AudienceLevel, SavedSummary>>;
}

/** One headline of an edited executive summary (build plan session 10). */
export interface SavedSummaryHeadline {
  /** The draft headline it came from (export/summary.ts), or `custom:<n>` for one the analyst added. */
  id: string;
  title: string;
  saw: string;
  matters: string;
  questions: string[];
  /** Left out of the report while false, but kept for later. */
  include: boolean;
}

export interface SavedSummary {
  intro: string;
  headlines: SavedSummaryHeadline[];
  closing: string;
}

/** Who an output is for (build plan session 9, spec §8 and §11). */
export const AUDIENCE_LEVELS = ['analyst', 'board', 'leadership', 'workshop', 'oneToOne'] as const;
export type AudienceLevel = (typeof AUDIENCE_LEVELS)[number];
/** The smallest group shown at board and leadership level, unless the analyst raises it. */
export const DEFAULT_MIN_GROUP_SIZE = 5;
/** The minimum group size cannot be set below this. */
export const MIN_GROUP_SIZE_FLOOR = 3;

export interface AudienceSettings {
  /** The default level of presentation mode and the exports. */
  level: AudienceLevel;
  /** Groups smaller than this are pooled or left out at board and leadership level (at least 3). */
  min_group_size: number;
  /** Groups that agreed to be named in a team workshop, by attribute key → values. */
  named_teams: Record<AttributeKey, string[]>;
  /** Members who agreed to be named in leadership outputs. */
  named_members: MemberId[];
}

export interface ProjectMeta {
  title: string;
  created_at: ISODateTime;
  modified_at: ISODateTime;
  notes: string;
}

// Surveys (spec §4.4, §15, schema version 3). A survey's versions snapshot what
// respondents were asked; its key holds the private key only in encrypted form;
// its log records every import decision. The passphrase and the decrypted key
// are never stored.
export type SurveyId = string;
export type SurveyEntry = 'nominate' | 'full';
/** What a colleague who was not selected is stored as, per layer (CLAUDE.md D88, D102). */
export type UnselectedRule = 'zero' | 'not_applicable';

export interface SurveyLayer {
  key: LayerKey;
  label: string;
  question_wording: string;
  scale_type: ScaleType;
  min: number;
  max: number;
  signed: boolean;
  scale_labels?: Record<string, string>;
  categories?: string[];
  category_labels?: Record<string, string>;
  unselected: UnselectedRule;
  /** Respondents may answer "Does not apply" as well as a scale point (D102). */
  offer_not_applicable: boolean;
}

export interface SurveyVersion {
  version: number;
  created_at: ISODateTime;
  /** Member ids in roster order; a link names its respondent by position. */
  roster: MemberId[];
  layers: SurveyLayer[];
  entry: SurveyEntry;
  nomination_question: string;
  /** Attributes shown to respondents beside names. */
  shared_attributes: AttributeKey[];
  /** Colleagues every respondent is asked about, selected or not (D103). */
  required: MemberId[];
}

export interface SurveyTexts {
  introduction: string;
  confidentiality: string;
  return_instructions: string;
}

export interface SurveySettings {
  burden_limit_minutes: number;
  expected_nominations: number;
  /** 'auto' issues links within the length budget and packages beyond it. */
  link_mode: 'auto' | 'package';
}

/** Base64url fields: the private key encrypted under a passphrase-derived key. */
export interface WrappedKey {
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface SurveyKey {
  /** Uncompressed P-256 point, base64url. */
  public_key: string;
  fingerprint: string;
  wrapped: WrappedKey;
}

export interface SurveyRespondent {
  member_id: MemberId;
  token: string;
  /** The latest version this member was issued a link for. */
  version: number;
  issued_at: ISODateTime;
}

export type RejectReason =
  | 'unreadable'
  | 'other_survey'
  | 'other_key'
  | 'tampered'
  | 'unknown_version'
  | 'unknown_token'
  | 'token_mismatch'
  | 'already_imported'
  | 'closed';

export type SurveyLogEntry =
  | {
      kind: 'accepted';
      receipt: string;
      member_id: MemberId;
      version: number;
      submitted_at: ISODateTime;
      imported_at: ISODateTime;
      ratings: number;
      /** Receipt of a later submission that replaced this one. */
      replaced_by: string | null;
    }
  | {
      kind: 'duplicate';
      member_id: MemberId;
      kept: string;
      set_aside: string;
      imported_at: ISODateTime;
    }
  | {
      kind: 'rejected';
      /** File name, or "Pasted text n". */
      source: string;
      receipt: string | null;
      reason: RejectReason;
      imported_at: ISODateTime;
    };

export interface Survey {
  id: SurveyId;
  title: string;
  created_at: ISODateTime;
  status: 'open' | 'closed';
  wave: number;
  texts: SurveyTexts;
  /** YYYY-MM-DD, or null. */
  deadline: string | null;
  settings: SurveySettings;
  key: SurveyKey;
  versions: SurveyVersion[];
  respondents: SurveyRespondent[];
  log: SurveyLogEntry[];
}

export interface Project {
  schema_version: typeof SCHEMA_VERSION;
  app: { name: typeof APP_NAME; version: string };
  meta: ProjectMeta;
  attribute_definitions: AttributeDefinition[];
  members: Member[];
  layers: LayerDefinition[];
  ties: Tie[];
  saved_views: SavedView[];
  surveys: Survey[];
  settings: ProjectSettings;
}

/** Key that identifies one rating; unique within a project. */
export function tieKey(rater: MemberId, ratee: MemberId, variable: LayerKey, wave: number): string {
  return `${rater}\u0000${ratee}\u0000${variable}\u0000${String(wave)}`;
}

export function isCategorical(layer: LayerDefinition): boolean {
  return layer.scale_type === 'categorical';
}
