// Data-quality checks (build plan session 4; review §7, Q37 issues 4 and 6).
// Whether the ratings can bear a conclusion: coverage by group and by level,
// who gave no ratings or few, each rater's style, and how many reported ties
// the other side does not report. Like coverage (CLAUDE.md D29) it reads the
// raw ratings of one wave, on its roster, on the enabled layers and runs on the main thread; it
// builds on computeCoverage, so the two always agree.
//
// Everything here is structure. The wording, including the data-quality
// statement, is in ui/copy/quality.ts (D9); thresholds are in QUALITY_RULES,
// which the copy quotes, so the check shown is the check that ran.

import { computeCoverage, type CoverageResult, type RaterCoverage } from './coverage';
import { resolveWave, scopeToWave } from './waves';
import {
  BOUNDARY_BAND_ORDER,
  isCategorical,
  layerRole,
  NON_WORKING_ROLES,
  type AttributeDefinition,
  type AttributeKey,
  type LayerDefinition,
  type MemberId,
  type Project,
} from './schema';

export const QUALITY_RULES = {
  /** Gave at least one rating but fewer than this share of the ratings possible. */
  fewRatings: 0.5,
  /** Same answer for everyone: one value on every scaled layer with at least this many ratings. */
  sameAnswerMinRatings: 5,
  /** Rates higher or lower than most: mean rescaled rating this far from the respondents' median. */
  styleFromMedian: 0.15,
  /** Reports unusually many ties: share of colleagues tied at least this far above the median. */
  manyTiesAboveMedian: 0.25,
  /** Most respondents report a tie with nearly everyone: median share at least this. */
  denseMedian: 0.9,
  /** Groups smaller than this are not quoted for their coverage (as the silo rule's minGroupSize). */
  minGroupSize: 3,
  /** Roles that do not count as working ties (as INSIGHT_RULES.excludedRoles). */
  excludedTieRoles: NON_WORKING_ROLES,
} as const;

export type RatingFlag = 'gaveNoRatings' | 'gaveFewRatings';

export interface RaterStyle {
  id: MemberId;
  /** Numeric ratings on the enabled scaled layers. */
  ratings: number;
  /** Mean rating, each rescaled to 0–1 on its layer's scale; NaN with no ratings. */
  mean: number;
  /** Standard deviation of the rescaled ratings, averaged over layers. */
  spread: number;
  /** Share of each layer's scale points used, averaged over layers. */
  scaleUsed: number;
  sameAnswer: boolean;
  /** Share of colleagues given a rating above the scale minimum on a tie layer. */
  tiedShare: number;
  /** Mean rating this far from the median, by QUALITY_RULES.styleFromMedian; null otherwise. */
  style: 'higher' | 'lower' | null;
  manyTies: boolean;
}

export interface GroupRow {
  /** null: the attribute is not recorded for these members. */
  value: string | null;
  members: number;
  /** Members who gave at least one rating. */
  respondents: number;
  noRatings: number;
  fewRatings: number;
  /** Coverage of the group's members as raters. */
  rate: number;
  /** Ties its members reported where the other member also answered, and how many of those are one-way. */
  reportedTies: number;
  oneWay: number;
  oneWayShare: number;
  /** Mean rescaled rating its members gave. */
  meanGiven: number;
}

export interface GroupBreakdown {
  attribute: AttributeKey;
  label: string;
  rows: GroupRow[];
}

export interface QualityResult {
  coverage: CoverageResult;
  members: number;
  /** Members who gave at least one rating. */
  respondents: number;
  /** Per member, in project order. */
  flags: (RatingFlag | null)[];
  noRatings: MemberId[];
  fewRatings: MemberId[];
  raters: RaterStyle[];
  /** Medians over respondents. */
  medianMean: number;
  medianTiedShare: number;
  sameAnswer: MemberId[];
  higher: MemberId[];
  lower: MemberId[];
  manyTies: MemberId[];
  /** The median share of colleagues tied reaches QUALITY_RULES.denseMedian. */
  denseReporting: boolean;
  /** Reported ties whose reverse rating was given, and how many of those the other side did not report. */
  reportedTies: number;
  oneWay: number;
  oneWayShare: number;
  /** By the rules' grouping attribute (settings.insight_group, else team), then by level. */
  byGroup: GroupBreakdown | null;
  byLevel: GroupBreakdown | null;
  /**
   * The group with the lowest coverage among groups of at least
   * QUALITY_RULES.minGroupSize members, by any category attribute with two or
   * more such groups; null when none.
   */
  lowestGroup: { attribute: AttributeKey; label: string; row: GroupRow } | null;
  /** Every category attribute's breakdown, in attribute order. */
  breakdowns: GroupBreakdown[];
  /** Layers counted as ties for tiedShare and one-way ties. */
  tieLayers: number;
}

/** Rating flag of each member from coverage alone, for the engine (D49 passes coverage through). */
export function ratingFlag(r: RaterCoverage): RatingFlag | null {
  if (!(r.possible > 0)) return null;
  if (r.rated === 0) return 'gaveNoRatings';
  return r.rate < QUALITY_RULES.fewRatings ? 'gaveFewRatings' : null;
}

function median(xs: number[]): number {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

const groupable = (a: AttributeDefinition) => a.type === 'categorical' || a.type === 'ordinal';

function groupAttribute(project: Project): AttributeDefinition | null {
  const options = project.attribute_definitions.filter(groupable);
  const chosen = project.settings.insight_group;
  return options.find((a) => a.key === chosen) ?? options.find((a) => a.key === 'team') ?? null;
}

const isTieLayer = (l: LayerDefinition) =>
  !l.signed && !isCategorical(l) && !QUALITY_RULES.excludedTieRoles.includes(layerRole(l));

export function computeQuality(full: Project, chosenWave?: number | null): QualityResult {
  const wave = resolveWave(full, chosenWave);
  const project = scopeToWave(full, wave);
  const coverage = computeCoverage(project, wave);
  const members = project.members;
  const n = members.length;
  const index = new Map(members.map((m, i) => [m.id, i]));
  const scaled = project.layers.filter((l) => l.enabled && !isCategorical(l));
  const layerAt = new Map(scaled.map((l, k) => [l.key, k]));
  const tieLayers = scaled.map(isTieLayer);
  const L = scaled.length;

  // Rescaled numeric ratings, [layer][rater * n + ratee], NaN where not rated.
  const r = scaled.map(() => new Float64Array(n * n).fill(NaN));
  // Raw values per rater and layer, for the share of the scale used.
  for (const t of project.ties) {
    if (t.wave !== wave || typeof t.value !== 'number') continue;
    const k = layerAt.get(t.variable);
    const i = index.get(t.rater_id);
    const j = index.get(t.ratee_id);
    if (k === undefined || i === undefined || j === undefined || i === j) continue;
    const l = scaled[k] as LayerDefinition;
    (r[k] as Float64Array)[i * n + j] = (t.value - l.min) / (l.max - l.min);
  }

  // A tie i → j on any tie layer, and whether i rated j on one at all.
  const tied = new Uint8Array(n * n);
  const known = new Uint8Array(n * n);
  for (let k = 0; k < L; k++) {
    if (!tieLayers[k]) continue;
    const m = r[k] as Float64Array;
    for (let x = 0; x < n * n; x++) {
      const v = m[x] as number;
      if (Number.isNaN(v)) continue;
      known[x] = 1;
      if (v > 0) tied[x] = 1;
    }
  }

  const flags = coverage.raters.map(ratingFlag);
  const raters: RaterStyle[] = members.map((mem, i) => {
    let count = 0;
    let sum = 0;
    let spreads = 0;
    let used = 0;
    let layersRated = 0;
    let uniform = 0;
    let checked = 0;
    for (let k = 0; k < L; k++) {
      const l = scaled[k] as LayerDefinition;
      const m = r[k] as Float64Array;
      const vals: number[] = [];
      for (let j = 0; j < n; j++) {
        const v = m[i * n + j] as number;
        if (j !== i && !Number.isNaN(v)) vals.push(v);
      }
      if (vals.length === 0) continue;
      layersRated += 1;
      count += vals.length;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      sum += mean * vals.length;
      spreads += Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
      const distinct = new Set(vals.map((v) => Math.round(v * (l.max - l.min) * 1e6)));
      used += distinct.size / (Math.floor(l.max - l.min) + 1);
      if (vals.length >= QUALITY_RULES.sameAnswerMinRatings) {
        checked += 1;
        if (distinct.size === 1) uniform += 1;
      }
    }
    let tiedCount = 0;
    let anyKnown = false;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      if (tied[i * n + j]) tiedCount += 1;
      if (known[i * n + j]) anyKnown = true;
    }
    return {
      id: mem.id,
      ratings: count,
      mean: count > 0 ? sum / count : NaN,
      spread: layersRated > 0 ? spreads / layersRated : NaN,
      scaleUsed: layersRated > 0 ? used / layersRated : NaN,
      sameAnswer: checked > 0 && uniform === checked,
      tiedShare: anyKnown && n > 1 ? tiedCount / (n - 1) : NaN,
      style: null,
      manyTies: false,
    };
  });

  const responding = raters.filter((s, i) => s.ratings > 0 && flags[i] !== 'gaveNoRatings');
  const medianMean = median(responding.map((s) => s.mean));
  const medianTiedShare = median(responding.map((s) => s.tiedShare));
  for (const s of responding) {
    const d = s.mean - medianMean;
    // A small tolerance, so a difference of exactly the threshold counts.
    if (d >= QUALITY_RULES.styleFromMedian - 1e-9) s.style = 'higher';
    else if (d <= -QUALITY_RULES.styleFromMedian + 1e-9) s.style = 'lower';
    s.manyTies =
      Number.isFinite(s.tiedShare) &&
      medianTiedShare < 1 &&
      s.tiedShare >= medianTiedShare + QUALITY_RULES.manyTiesAboveMedian - 1e-9;
  }

  // One-way ties: i reports a tie to j, j answered about i on a tie layer and reported none.
  const oneWayFrom = new Int32Array(n);
  const reportedFrom = new Int32Array(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j || !tied[i * n + j] || !known[j * n + i]) continue;
      reportedFrom[i] = (reportedFrom[i] as number) + 1;
      if (!tied[j * n + i]) oneWayFrom[i] = (oneWayFrom[i] as number) + 1;
    }
  const total = (a: Int32Array) => a.reduce((x, y) => x + y, 0);
  const reportedTies = total(reportedFrom);
  const oneWay = total(oneWayFrom);

  const breakdown = (attr: AttributeDefinition | null): GroupBreakdown | null => {
    if (!attr) return null;
    const order = [...(attr.categories ?? [])];
    for (const m of members) {
      const v = m.attributes[attr.key] ?? null;
      if (v !== null && !order.includes(v)) order.push(v);
    }
    const values: (string | null)[] = [...order];
    if (members.some((m) => (m.attributes[attr.key] ?? null) === null)) values.push(null);
    const rows = values
      .map((value): GroupRow => {
        const idx = members.flatMap((m, i) =>
          (m.attributes[attr.key] ?? null) === value ? [i] : [],
        );
        let rated = 0;
        let possible = 0;
        let given = 0;
        let givenCount = 0;
        let reported = 0;
        let one = 0;
        for (const i of idx) {
          const c = coverage.raters[i] as RaterCoverage;
          rated += c.rated;
          possible += c.possible;
          const s = raters[i] as RaterStyle;
          if (s.ratings > 0) {
            given += s.mean * s.ratings;
            givenCount += s.ratings;
          }
          reported += reportedFrom[i] as number;
          one += oneWayFrom[i] as number;
        }
        return {
          value,
          members: idx.length,
          respondents: idx.filter((i) => (coverage.raters[i] as RaterCoverage).rated > 0).length,
          noRatings: idx.filter((i) => flags[i] === 'gaveNoRatings').length,
          fewRatings: idx.filter((i) => flags[i] === 'gaveFewRatings').length,
          rate: possible > 0 ? rated / possible : NaN,
          reportedTies: reported,
          oneWay: one,
          oneWayShare: reported > 0 ? one / reported : NaN,
          meanGiven: givenCount > 0 ? given / givenCount : NaN,
        };
      })
      .filter((row) => row.members > 0);
    return { attribute: attr.key, label: attr.label, rows };
  };

  const group = groupAttribute(project);
  let lowestGroup: QualityResult['lowestGroup'] = null;
  const breakdowns = project.attribute_definitions
    .filter(groupable)
    .map(breakdown)
    .filter((b): b is GroupBreakdown => b !== null);
  for (const b of breakdowns) {
    const rows = b.rows.filter(
      (r) => r.value !== null && r.members >= QUALITY_RULES.minGroupSize && Number.isFinite(r.rate),
    );
    if (rows.length < 2) continue;
    for (const row of rows)
      if (!lowestGroup || row.rate < lowestGroup.row.rate)
        lowestGroup = { attribute: b.attribute, label: b.label, row };
  }
  const level = project.attribute_definitions.find((a) => a.key === 'level' && groupable(a));
  const ids = (pred: (s: RaterStyle, i: number) => boolean) =>
    raters.flatMap((s, i) => (pred(s, i) ? [s.id] : []));

  return {
    coverage,
    members: n,
    respondents: coverage.raters.filter((c) => c.rated > 0).length,
    flags,
    noRatings: ids((_, i) => flags[i] === 'gaveNoRatings'),
    fewRatings: ids((_, i) => flags[i] === 'gaveFewRatings'),
    raters,
    medianMean,
    medianTiedShare,
    sameAnswer: ids((s) => s.sameAnswer),
    higher: ids((s) => s.style === 'higher'),
    lower: ids((s) => s.style === 'lower'),
    manyTies: ids((s) => s.manyTies),
    denseReporting:
      Number.isFinite(medianTiedShare) && medianTiedShare >= QUALITY_RULES.denseMedian - 1e-9,
    reportedTies,
    oneWay,
    oneWayShare: reportedTies > 0 ? oneWay / reportedTies : NaN,
    byGroup: breakdown(group),
    byLevel: level && level.key !== group?.key ? breakdown(level) : null,
    lowestGroup,
    breakdowns,
    tieLayers: tieLayers.filter(Boolean).length,
  };
}

// People outside the roster (build plan session 12, D181): the boundary
// question's answers, read from the import log of the latest survey that asks
// it. Counts per group and answer band; no member is named.

export interface BoundaryRow {
  /** null: the attribute is not recorded for these respondents. */
  value: string | null;
  respondents: number;
  /** [function][band], bands in BOUNDARY_BAND_ORDER. */
  counts: number[][];
}

export interface BoundaryResult {
  surveyId: string;
  title: string;
  functions: string[];
  /** Respondents whose current response is imported. */
  responded: number;
  /** Of those, the ones who answered the boundary question. */
  answered: number;
  /** Respondents whose version did not ask it. */
  notAsked: number;
  overall: number[][];
  /** By the rules' grouping attribute; null without one. */
  groups: { attribute: AttributeKey; label: string; rows: BoundaryRow[] } | null;
}

export function computeBoundary(project: Project): BoundaryResult | null {
  const surveys = project.surveys.filter((s) => s.versions.some((v) => v.boundary));
  const survey = surveys.at(-1);
  if (!survey) return null;
  const functions = [...survey.versions].reverse().find((v) => v.boundary)?.boundary ?? [];
  const empty = () => functions.map(() => BOUNDARY_BAND_ORDER.map(() => 0));
  const current = survey.log.filter(
    (e): e is Extract<(typeof survey.log)[number], { kind: 'accepted' }> =>
      e.kind === 'accepted' && e.replaced_by === null,
  );
  const group = groupAttribute(project);
  const members = new Map(project.members.map((m) => [m.id, m]));
  const overall = empty();
  const rows = new Map<string | null, BoundaryRow>();
  let answered = 0;
  for (const e of current) {
    if (!e.boundary) continue;
    answered++;
    const value = group ? (members.get(e.member_id)?.attributes[group.key] ?? null) : null;
    let row = rows.get(value);
    if (!row) {
      row = { value, respondents: 0, counts: empty() };
      rows.set(value, row);
    }
    row.respondents++;
    e.boundary.functions.forEach((f, i) => {
      const fi = functions.indexOf(f);
      const bi = BOUNDARY_BAND_ORDER.indexOf(e.boundary?.bands[i] ?? 'none');
      if (fi < 0 || bi < 0) return;
      (overall[fi] as number[])[bi] = ((overall[fi] as number[])[bi] ?? 0) + 1;
      (row.counts[fi] as number[])[bi] = ((row.counts[fi] as number[])[bi] ?? 0) + 1;
    });
  }
  const order = group?.categories ?? [];
  const sorted = [...rows.values()].sort((a, b) => {
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    const ia = order.indexOf(a.value);
    const ib = order.indexOf(b.value);
    return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib) || a.value.localeCompare(b.value);
  });
  const asked = new Set(survey.versions.filter((v) => v.boundary).map((v) => v.version));
  return {
    surveyId: survey.id,
    title: survey.title,
    functions,
    responded: current.length,
    answered,
    notAsked: current.filter((e) => !asked.has(e.version)).length,
    overall,
    groups: group ? { attribute: group.key, label: group.label, rows: sorted } : null,
  };
}
