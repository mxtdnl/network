// Audience settings saved in the project (build plan session 9): the default
// level, the smallest group shown, and who agreed to be named. Saved through
// updateProjectViews, so nothing is recalculated.

import {
  MIN_GROUP_SIZE_FLOOR,
  type AudienceLevel,
  type AudienceSettings,
  type MemberId,
} from '../../data/schema';
import { audienceSettings, teamAttribute } from './audienceSettings';
import { useAppStore } from './store';

function update(fn: (a: AudienceSettings) => AudienceSettings): void {
  useAppStore.getState().updateProjectViews((p) => ({
    ...p,
    settings: { ...p.settings, audience: fn(audienceSettings(p)) },
  }));
}

export function setAudienceLevel(level: AudienceLevel): void {
  update((a) => ({ ...a, level }));
}

export function setMinGroupSize(size: number): void {
  if (!Number.isFinite(size)) return;
  update((a) => ({ ...a, min_group_size: Math.max(MIN_GROUP_SIZE_FLOOR, Math.round(size)) }));
}

/** Records whether a team agreed to be named in its workshop. */
export function setTeamNamed(team: string, named: boolean): void {
  const project = useAppStore.getState().data.project;
  const attr = project ? teamAttribute(project) : null;
  if (!attr) return;
  update((a) => {
    const current = a.named_teams[attr.key] ?? [];
    const next = named ? [...new Set([...current, team])] : current.filter((t) => t !== team);
    return { ...a, named_teams: { ...a.named_teams, [attr.key]: next } };
  });
}

/** Records whether a member agreed to be named in leadership outputs. */
export function setMemberNamed(id: MemberId, named: boolean): void {
  update((a) => ({
    ...a,
    named_members: named
      ? [...new Set([...a.named_members, id])]
      : a.named_members.filter((m) => m !== id),
  }));
}
