// Audience levels (build plan session 9; spec §8, §10 and §11): one policy
// layer that decides how fine-grained an output is, applied as the names
// layer is (names.ts). Presentation mode and every export read the policy for
// the level chosen; the analyst's workspace never does, so it stays
// unrestricted.
//
//   Board        groups and the whole network only: no member, and no group
//                below the minimum size (pooled as "Other groups" or left out)
//   Leadership   as board, plus roles between groups (gateways, cut points,
//                potential brokers), named only where the member agreed
//   Workshop     one team's own network; named if the team agreed, otherwise
//                in codes; members of other teams never shown
//   One-to-one   one member's network card (state/card.ts)

import type {
  AttributeDefinition,
  AttributeKey,
  AudienceLevel,
  MemberId,
  Project,
} from '../../data/schema';
import type { GroupMixing, InsightOutcome, Observation, RefResult } from '../engineClient';
import { audienceCopy } from '../copy/audience';
import { groupsCopy } from '../copy/groups';
import { groupingAttributes } from './insightGroup';
import { effectiveGrouping, groupMixing } from '../map/groupModel';
import {
  audienceSettings,
  forcesCodes,
  teamAttribute,
  teamNamed,
  type AudienceChoice,
} from './audienceSettings';
import { memberNames, restrictNames, type MemberNames } from './names';
import type { Grouping, MapSettings } from './store';

export type { AudienceChoice } from './audienceSettings';

/** An output the Export dialog offers. */
export type ExportKind =
  'map' | 'members' | 'network' | 'formalInformal' | 'table' | 'report' | 'card';

const ALLOWED: Record<AudienceLevel, readonly ExportKind[]> = {
  analyst: ['map', 'members', 'network', 'formalInformal', 'table', 'report'],
  board: ['map', 'network', 'report'],
  leadership: ['map', 'network', 'report'],
  workshop: ['map', 'members', 'network', 'formalInformal', 'table', 'report'],
  oneToOne: ['card'],
};

export interface AudiencePolicy {
  level: AudienceLevel;
  minGroupSize: number;
  /** Board and leadership: groups and the whole network only. */
  groupsOnly: boolean;
  /** The team attribute (the group rules' attribute). */
  attribute: AttributeDefinition | null;
  /** The team of a workshop. */
  team: string | null;
  /** The workshop's team agreed to be named. */
  teamNamed: boolean;
  /** The member of a one-to-one. */
  member: MemberId | null;
  /** Members a member-level output may show: null when every member may be shown. */
  shown: ReadonlySet<MemberId> | null;
  /** Names under the policy: anyone an output may not show is "a colleague". */
  names: MemberNames;
  /** Members appear as codes (Hide names, or a workshop without the team's agreement). */
  codes: boolean;
  /** Members who agreed to be named in leadership outputs. */
  namedMembers: ReadonlySet<MemberId>;
}

/** The policy for a choice of audience; the analyst level restricts nothing. */
export function audiencePolicy(
  project: Project,
  choice: AudienceChoice,
  anonymise: boolean,
): AudiencePolicy {
  const settings = audienceSettings(project);
  const attribute = teamAttribute(project);
  const level = choice.level;
  const codes = anonymise || forcesCodes(project, choice);
  const namedMembers = new Set(settings.named_members);
  const placeholder = audienceCopy.colleague;
  let shown: Set<MemberId> | null = null;
  if (level === 'board') shown = new Set();
  else if (level === 'leadership') shown = namedMembers;
  else if (level === 'workshop')
    shown = new Set(
      project.members
        .filter(
          (m) => attribute && choice.team !== null && m.attributes[attribute.key] === choice.team,
        )
        .map((m) => m.id),
    );
  const allowed = shown;
  const names =
    allowed === null
      ? memberNames(project, codes)
      : restrictNames(project, codes, (id) => allowed.has(id), placeholder);
  return {
    level,
    minGroupSize: settings.min_group_size,
    groupsOnly: level === 'board' || level === 'leadership',
    attribute,
    team: level === 'workshop' ? choice.team : null,
    teamNamed: level === 'workshop' && teamNamed(project, choice.team),
    member: level === 'oneToOne' ? choice.member : null,
    shown,
    names,
    codes,
    namedMembers,
  };
}

/** True when the level offers this output. */
export function allows(policy: Pick<AudiencePolicy, 'level'>, kind: ExportKind): boolean {
  return ALLOWED[policy.level].includes(kind);
}

/** Throws when the level does not offer this output, so no export can skip the check. */
export function assertAllowed(policy: Pick<AudiencePolicy, 'level'>, kind: ExportKind): void {
  if (!allows(policy, kind)) throw new Error(audienceCopy.notOffered(policy.level));
}

/** Size of each value of an attribute among members. */
export function groupSizes(project: Project, key: AttributeKey): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of project.members) {
    const v = m.attributes[key];
    if (v) out.set(v, (out.get(v) ?? 0) + 1);
  }
  return out;
}

// ------------------------------------------------------------------ pooling

export interface PooledMixing extends GroupMixing {
  /** Groups below the minimum pooled into the last group, "Other groups (n members)". */
  pooled: { groups: number; members: number } | null;
  /** Groups below the minimum left out, because together they are still below it. */
  leftOut: { groups: number; members: number } | null;
}

/**
 * Mixing with groups below `min` members pooled into one group, when together
 * they reach `min`, or else left out (their rows and columns removed). Ties and
 * possible ties add up, so the pooled group's figures are exact; the groups
 * shown keep their own figures, including ties with members not shown; the
 * totals count every member, with pooled groups as one group. A group left out
 * on its own can still be worked out from the totals; method notes §18 say so.
 */
export function poolMixing(mix: GroupMixing, min: number, directed: boolean): PooledMixing {
  const k = mix.groups.length;
  const size = (g: number) => mix.perGroup[g]?.size ?? 0;
  const small = mix.groups.map((_, g) => g).filter((g) => size(g) < min);
  if (small.length === 0) return { ...mix, pooled: null, leftOut: null };
  const smallMembers = small.reduce((s, g) => s + size(g), 0);
  const pool = smallMembers >= min && small.length > 1;
  const keep = mix.groups.map((_, g) => g).filter((g) => size(g) >= min);
  const target = new Map<number, number>(keep.map((g, x) => [g, x]));
  const K = keep.length + (pool ? 1 : 0);
  if (pool) for (const g of small) target.set(g, keep.length);
  const ties = new Float64Array(K * K);
  const possible = new Float64Array(K * K);
  for (let a = 0; a < k; a++) {
    const x = target.get(a);
    if (x === undefined) continue;
    for (let b = 0; b < k; b++) {
      const y = target.get(b);
      if (y === undefined) continue;
      // When mutual, a pair of small groups within the pool is one set of unordered pairs.
      if (!directed && x === y && a > b) continue;
      ties[x * K + y] = (ties[x * K + y] ?? 0) + (mix.ties[a * k + b] ?? 0);
      possible[x * K + y] = (possible[x * K + y] ?? 0) + (mix.possible[a * k + b] ?? 0);
    }
  }
  const density = new Float64Array(K * K);
  for (let c = 0; c < K * K; c++)
    density[c] = (possible[c] ?? 0) > 0 ? (ties[c] ?? 0) / (possible[c] ?? 1) : NaN;
  const ei = (e: number, i: number) => (e + i > 0 ? (e - i) / (e + i) : NaN);
  const perGroup = keep.map((g) => mix.perGroup[g] as GroupMixing['perGroup'][number]);
  let internal = mix.internal;
  let external = mix.external;
  if (pool) {
    // Ties between two small groups were external; inside the pool they are internal.
    let crossSmall = 0;
    for (const a of small)
      for (const b of small)
        if (a !== b && (directed || a < b)) crossSmall += mix.ties[a * k + b] ?? 0;
    const inside = small.reduce((s, g) => s + (mix.perGroup[g]?.internal ?? 0), 0) + crossSmall;
    const outside =
      small.reduce((s, g) => s + (mix.perGroup[g]?.external ?? 0), 0) - 2 * crossSmall;
    const label = audienceCopy.otherGroups(smallMembers);
    perGroup.push({
      group: label,
      size: smallMembers,
      internal: inside,
      external: outside,
      ei: ei(outside, inside),
    });
    internal += crossSmall;
    external -= crossSmall;
  }
  const groups = perGroup.map((g) => g.group);
  return {
    ...mix,
    groups,
    internal,
    external,
    ei: ei(external, internal),
    perGroup,
    density,
    ties,
    possible,
    pooled: pool ? { groups: small.length, members: smallMembers } : null,
    leftOut: pool ? null : { groups: small.length, members: smallMembers },
  };
}

// ----------------------------------------------------------------- insights

/** Rules about individual members, which board and leadership outputs leave out. */
export const MEMBER_RULES = ['brokers', 'peripheral', 'overload', 'negativeCluster'] as const;

export interface AudienceOutcome extends InsightOutcome {
  /** Observations left out because they concern a group below the minimum size, or another team. */
  suppressed: number;
}

/**
 * Insights an audience may see. Board and leadership: group-level observations
 * only (silos, formal–informal gaps, a group's only routes and concentrated
 * demand within a group, negative ratings not returned as counts by pair of
 * groups), each about groups of at least the minimum size, with no member
 * listed. Workshop: observations about the team itself. One-to-one: none.
 */
export function audienceInsights(
  project: Project,
  outcomes: readonly InsightOutcome[],
  policy: AudiencePolicy,
): AudienceOutcome[] {
  if (policy.level === 'analyst') return outcomes.map((o) => ({ ...o, suppressed: 0 }));
  if (policy.level === 'oneToOne') return [];
  const sizes = new Map<AttributeKey, Map<string, number>>();
  const sizeOf = (key: AttributeKey, value: string) => {
    let m = sizes.get(key);
    if (!m) {
      m = groupSizes(project, key);
      sizes.set(key, m);
    }
    return m.get(value) ?? 0;
  };
  const big = (key: AttributeKey, value: string | undefined) =>
    value === undefined || sizeOf(key, value) >= policy.minGroupSize;
  const out: AudienceOutcome[] = [];
  for (const outcome of outcomes) {
    if (policy.groupsOnly && (MEMBER_RULES as readonly string[]).includes(outcome.rule)) continue;
    // A workshop draws no signed layer, so the rules on signed layers are left out.
    if (
      policy.level === 'workshop' &&
      (outcome.rule === 'negativeCluster' || outcome.rule === 'oneWayNegative')
    )
      continue;
    const kept: Observation[] = [];
    for (const o of outcome.observations) {
      const v = groupLevel(o, policy, big);
      if (v) kept.push(v);
    }
    const suppressed = outcome.observations.length - kept.length;
    if (policy.level === 'workshop' && kept.length === 0 && outcome.status === 'observed') continue;
    out.push({ ...outcome, observations: kept, suppressed });
  }
  return out;
}

/** The observation with only the members and pairs of groups an audience may see. */
function narrowed(
  o: Observation,
  members: MemberId[],
  keepPair: (x: NonNullable<Observation['groups']>[number]) => boolean,
): Observation {
  const out: Observation = {
    ...o,
    members,
    view: { ...o.view, highlight: o.view.highlight.filter((id) => members.includes(id)) },
  };
  if (o.groups) out.groups = o.groups.filter(keepPair);
  // Who among the members named gave no ratings, and what they share, are about members.
  delete out.shared;
  delete out.noRatings;
  return out;
}

function groupLevel(
  o: Observation,
  policy: AudiencePolicy,
  big: (key: AttributeKey, value: string | undefined) => boolean,
): Observation | null {
  const g = o.group;
  if (policy.level === 'workshop') {
    if (!g || g.attribute !== policy.attribute?.key) return null;
    if (g.value !== policy.team && g.other !== policy.team) return null;
    const team = policy.shown ?? new Set<MemberId>();
    return narrowed(
      o,
      o.members.filter((id) => team.has(id)),
      (x) => x.value === policy.team || x.other === policy.team,
    );
  }
  const bigPair = (x: { attribute: AttributeKey; value: string; other: string }) =>
    big(x.attribute, x.value) && big(x.attribute, x.other);
  switch (o.rule) {
    case 'silo':
    case 'formalOnly':
    case 'informalOnly':
    case 'onlyRoutes':
    case 'concentratedDemand':
      // Only the group forms: a cut point, or the network-wide share of demand, is about members.
      if (!g || !big(g.attribute, g.value) || !big(g.attribute, g.other)) return null;
      return narrowed(o, [], bigPair);
    case 'oneWayNegative':
      return narrowed(o, [], bigPair);
    default:
      return null;
  }
}

// -------------------------------------------------------------------- roles

export type RoleKind = 'gateway' | 'cutPoint' | 'broker';

export interface Role {
  member: MemberId;
  kind: RoleKind;
  ref: string;
  /** The group a gateway holds ties for. */
  group?: string;
  /** Colleagues linked to the rest of the network only through a cut point. */
  cutOff?: number;
}

/**
 * Roles between groups for a leadership team: members who hold a group's ties
 * with other groups, cut points, and potential brokers, from the insight rules
 * as they ran. One role of each kind per member, the first found.
 */
export function leadershipRoles(outcomes: readonly InsightOutcome[]): Role[] {
  const out: Role[] = [];
  const seen = new Set<string>();
  const add = (r: Role) => {
    const key = `${r.member}|${r.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(r);
  };
  for (const outcome of outcomes) {
    for (const o of outcome.observations) {
      if (o.rule === 'onlyRoutes' && o.evidence.cutPoint === 1) {
        for (const m of o.members.slice(0, 1))
          add({ member: m, kind: 'cutPoint', ref: o.ref, cutOff: o.evidence.cutOff ?? 0 });
      } else if (o.rule === 'onlyRoutes' && o.group) {
        for (const m of o.members.slice(0, o.evidence.gateways ?? o.members.length))
          add({ member: m, kind: 'gateway', ref: o.ref, group: o.group.value });
      } else if (o.rule === 'brokers') {
        for (const m of o.members) add({ member: m, kind: 'broker', ref: o.ref });
      }
    }
  }
  return out;
}

/**
 * Who holds a role, as an audience may read it: the member's name or code when
 * they agreed to be named; otherwise "A member of Finance", or "A member" when
 * their group is below the minimum size.
 */
export function roleHolder(project: Project, policy: AudiencePolicy, id: MemberId): string {
  if (policy.namedMembers.has(id)) return policy.names.of(id);
  const attr = policy.attribute;
  const value = attr ? project.members.find((m) => m.id === id)?.attributes[attr.key] : null;
  if (attr && value && (groupSizes(project, attr.key).get(value) ?? 0) >= policy.minGroupSize)
    return audienceCopy.memberOf(value);
  return audienceCopy.aMember;
}

// ------------------------------------------------------------------ workshop

/**
 * The map settings of a team workshop: only the team's members (a filter on the
 * team attribute), no signed layer drawn, and nothing that points outside the
 * team (an ego view, a highlight). Everything else is the view's own.
 */
export function workshopMap(map: MapSettings, policy: AudiencePolicy): MapSettings {
  const attr = policy.attribute;
  if (policy.level !== 'workshop' || !attr || policy.team === null) return map;
  const team = policy.shown ?? new Set<MemberId>();
  return {
    ...map,
    filters: [{ key: attr.key, values: [policy.team] }],
    ego: map.ego && team.has(map.ego.member) ? map.ego : null,
    highlight: map.highlight.filter((id) => team.has(id)),
    edgeColour: map.edgeColour.kind === 'signed' ? { kind: 'none' } : map.edgeColour,
    negativeOutsideRange: false,
  };
}

/** Indices of the members an output may show, in project order (everyone when unrestricted). */
export function shownIndices(project: Project, policy: AudiencePolicy): number[] {
  const shown = policy.shown;
  if (!shown) return project.members.map((_, i) => i);
  return project.members.flatMap((m, i) => (shown.has(m.id) ? [i] : []));
}

// -------------------------------------------------------------------- groups

export interface AudienceGroups {
  /** The grouping's name: an attribute's label, or "Community". */
  attribute: string;
  directed: boolean;
  /** Mixing with groups below the minimum size pooled or left out. */
  mix: PooledMixing;
  /** Display name of each group, in mixing order. */
  names: string[];
}

/**
 * The groups a board or leadership output shows for one layer: the engine's
 * mixing by the grouping, with small groups pooled or left out. Null when the
 * layer or grouping has no mixing.
 */
export function audienceGroups(
  project: Project,
  ref: RefResult | undefined,
  directed: boolean,
  grouping: Grouping,
  policy: Pick<AudiencePolicy, 'minGroupSize'>,
): AudienceGroups | null {
  const raw = groupMixing(ref, grouping);
  if (!raw || raw.groups.length === 0) return null;
  const mix = poolMixing(raw, policy.minGroupSize, directed);
  const attribute =
    grouping.kind === 'community'
      ? groupsCopy.community
      : (project.attribute_definitions.find((a) => a.key === grouping.key)?.label ?? grouping.key);
  const pooledAt = mix.pooled ? mix.groups.length - 1 : -1;
  const names = mix.groups.map((g, i) =>
    grouping.kind === 'community' && i !== pooledAt ? groupsCopy.communityName(g) : g,
  );
  return { attribute, directed, mix, names };
}

/** The grouping a saved view's group picture uses: its fill attribute, else the default grouping. */
export function viewGrouping(project: Project, map: MapSettings): Grouping {
  const fill = map.fill;
  if (fill.kind === 'attribute' && groupingAttributes(project).some((a) => a.key === fill.key))
    return { kind: 'attribute', key: fill.key };
  return effectiveGrouping(project, null);
}

/**
 * The leadership roles as sentences. A member who agreed is named; members
 * who did not are described by their group, and members of one group in the
 * same role on the same layer are counted in one sentence ("Two members of
 * Operations lie on …"), so the list does not hint at how many people it hides.
 */
export function roleSentences(
  project: Project,
  outcomes: readonly InsightOutcome[],
  policy: AudiencePolicy,
  layerLabel: (ref: string) => string,
): string[] {
  const R = audienceCopy.roles;
  const lines = new Map<string, { role: Role; who: string; count: number }>();
  for (const r of leadershipRoles(outcomes)) {
    const named = policy.namedMembers.has(r.member);
    const who = roleHolder(project, policy, r.member);
    // Cut points differ in whom they cut off, so each is a sentence of its own.
    const key =
      named || r.kind === 'cutPoint'
        ? `${r.member}|${r.kind}`
        : `${r.kind}|${r.ref}|${r.group ?? ''}|${who}`;
    const line = lines.get(key);
    if (line) line.count += 1;
    else lines.set(key, { role: r, who, count: 1 });
  }
  return [...lines.values()].map(({ role: r, who, count }) => {
    const holder = count === 1 ? who : audienceCopy.membersOf(count, who);
    const layer = layerLabel(r.ref).toLowerCase();
    if (r.kind === 'gateway') return R.gateway(holder, r.group ?? '', layer, count);
    if (r.kind === 'cutPoint') return R.cutPoint(holder, r.cutOff ?? 0, layer);
    return R.broker(holder, layer, count);
  });
}
