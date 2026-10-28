// Audience levels (build plan session 9, spec §8 and §11): the project's saved
// settings and the choice of team or member, read without the rest of the
// policy, so the names layer (names.ts) can force codes in a team workshop
// without importing the policy that itself builds on names.

import {
  DEFAULT_MIN_GROUP_SIZE,
  MIN_GROUP_SIZE_FLOOR,
  type AttributeDefinition,
  type AudienceLevel,
  type AudienceSettings,
  type MemberId,
  type Project,
} from '../../data/schema';
import { insightGroup } from './insightGroup';

/** What an output is prepared for: the level, and the team or member it concerns. */
export interface AudienceChoice {
  level: AudienceLevel;
  /** The team of a team workshop: a value of the team attribute. */
  team: string | null;
  /** The member of a one-to-one. */
  member: MemberId | null;
}

/** The project's audience settings, with the defaults when it has none. */
export function audienceSettings(project: Project): AudienceSettings {
  const a = project.settings.audience;
  return {
    level: a?.level ?? 'analyst',
    min_group_size: Math.max(MIN_GROUP_SIZE_FLOOR, a?.min_group_size ?? DEFAULT_MIN_GROUP_SIZE),
    named_teams: a?.named_teams ?? {},
    named_members: a?.named_members ?? [],
  };
}

/** The attribute a team workshop chooses its team by: the group rules' attribute (team by default). */
export function teamAttribute(project: Project): AttributeDefinition | null {
  return insightGroup(project);
}

/** Teams a workshop can be held for: values of the team attribute present among members, in category order. */
export function workshopTeams(project: Project): string[] {
  const attr = teamAttribute(project);
  if (!attr) return [];
  const present = new Set(
    project.members.map((m) => m.attributes[attr.key]).filter((v): v is string => !!v),
  );
  const ordered = (attr.categories ?? []).filter((c) => present.has(c));
  for (const v of present) if (!ordered.includes(v)) ordered.push(v);
  return ordered;
}

/** True when the team agreed in advance to be named in its workshop. */
export function teamNamed(project: Project, team: string | null): boolean {
  const attr = teamAttribute(project);
  if (!attr || team === null) return false;
  return audienceSettings(project).named_teams[attr.key]?.includes(team) ?? false;
}

/** The choice under the project's saved level, with the team and member chosen on screen. */
export function audienceChoice(
  project: Project,
  chosen: { team: string | null; member: MemberId | null },
): AudienceChoice {
  const level = audienceSettings(project).level;
  const teams = workshopTeams(project);
  const team =
    chosen.team !== null && teams.includes(chosen.team) ? chosen.team : (teams[0] ?? null);
  const ids = project.members.map((m) => m.id);
  const member =
    chosen.member !== null && ids.includes(chosen.member) ? chosen.member : (ids[0] ?? null);
  return { level, team, member };
}

/** A team workshop for a team that has not agreed to be named shows codes, whatever Hide names says. */
export function forcesCodes(project: Project, choice: AudienceChoice): boolean {
  return choice.level === 'workshop' && !teamNamed(project, choice.team);
}
