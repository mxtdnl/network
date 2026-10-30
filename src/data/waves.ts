// Waves (spec §2, §4.4; build plan session 14). A project can hold ratings from
// several waves of the same survey. One wave is analysed at a time: by default
// the latest wave with ratings, or the wave the analyst chooses.
//
// Who was on each wave's roster is recorded in `settings.waves`. A wave with no
// record has every member on its roster, so a project with one wave behaves as
// before. Records are written when a survey is repeated (every earlier wave is
// frozen then, so members who join later are not counted in it), when members
// are added to a project that has records (they join the latest recorded wave
// only), and when the analyst changes a member's place on a wave's roster.
//
// `scopeToWave` gives the project the analysis, coverage and every analysis
// view read: the wave's roster as its members and that wave's ratings as its
// ties. Surveys, layers and settings are kept. Pure; data/ imports nothing above it.

import {
  DEFAULT_WAVE,
  type Member,
  type MemberId,
  type Project,
  type Tie,
  type WaveRecord,
} from './schema';

const latestCache = new WeakMap<readonly Tie[], number>();

/** The latest wave with a rating (a value), else the latest wave with any tie, else wave 1. */
export function latestRatedWave(project: Pick<Project, 'ties'>): number {
  const cached = latestCache.get(project.ties);
  if (cached !== undefined) return cached;
  let rated = 0;
  let any = 0;
  for (const t of project.ties) {
    if (t.wave > any) any = t.wave;
    if (typeof t.value === 'number' && t.wave > rated) rated = t.wave;
  }
  const out = rated || any || DEFAULT_WAVE;
  latestCache.set(project.ties, out);
  return out;
}

/** The wave an analysis reads: the one chosen, else the latest with ratings. */
export function resolveWave(project: Pick<Project, 'ties'>, chosen: number | null | undefined) {
  return chosen ?? latestRatedWave(project);
}

/** Every wave the project knows of (ties, surveys, roster records), in order; at least wave 1. */
export function waveNumbers(project: Project): number[] {
  const set = new Set<number>([DEFAULT_WAVE]);
  for (const t of project.ties) set.add(t.wave);
  for (const s of project.surveys) set.add(s.wave);
  for (const r of project.settings.waves ?? []) set.add(r.wave);
  return [...set].sort((a, b) => a - b);
}

/** True when the project has more than one wave, so the wave is named wherever results are shown. */
export const isMultiWave = (project: Project) => waveNumbers(project).length > 1;

/** The next wave a repeated survey collects. */
export const nextWave = (project: Project) => (waveNumbers(project).at(-1) ?? DEFAULT_WAVE) + 1;

const recordOf = (project: Project, wave: number): WaveRecord | undefined =>
  project.settings.waves?.find((r) => r.wave === wave);

/** Whether the wave's roster is recorded (rather than every member by default). */
export const hasWaveRecord = (project: Project, wave: number) =>
  recordOf(project, wave) !== undefined;

/** The members on a wave's roster, in project order. */
export function waveRoster(project: Project, wave: number): Member[] {
  const record = recordOf(project, wave);
  if (!record) return project.members;
  const on = new Set(record.roster);
  return project.members.filter((m) => on.has(m.id));
}

export const waveRosterIds = (project: Project, wave: number): MemberId[] =>
  waveRoster(project, wave).map((m) => m.id);

const scopeCache = new WeakMap<Project, Map<number, Project>>();

/**
 * The project as one wave sees it: members on the wave's roster and that wave's
 * ratings. The project itself when nothing would be left out, so a project with
 * one wave is unchanged. Ratings by or about members off the roster are not read.
 */
export function scopeToWave(project: Project, wave: number): Project {
  let byWave = scopeCache.get(project);
  const cached = byWave?.get(wave);
  if (cached) return cached;
  const members = waveRoster(project, wave);
  const on = new Set(members.map((m) => m.id));
  const keepAllMembers = members.length === project.members.length;
  const ties = project.ties.filter(
    (t) => t.wave === wave && (keepAllMembers || (on.has(t.rater_id) && on.has(t.ratee_id))),
  );
  const out =
    keepAllMembers && ties.length === project.ties.length
      ? project
      : { ...project, members: keepAllMembers ? project.members : members, ties };
  if (!byWave) {
    byWave = new Map();
    scopeCache.set(project, byWave);
  }
  byWave.set(wave, out);
  return out;
}

function withRecords(project: Project, records: WaveRecord[]): Project {
  const sorted = [...records].sort((a, b) => a.wave - b.wave);
  return { ...project, settings: { ...project.settings, waves: sorted } };
}

/** Puts a member on a wave's roster or takes them off; the wave is recorded first if it was not. */
export function setOnWaveRoster(
  project: Project,
  wave: number,
  member: MemberId,
  on: boolean,
): Project {
  const current = new Set(waveRosterIds(project, wave));
  if (current.has(member) === on) return project;
  if (on) current.add(member);
  else current.delete(member);
  const roster = project.members.map((m) => m.id).filter((id) => current.has(id));
  const others = (project.settings.waves ?? []).filter((r) => r.wave !== wave);
  return withRecords(project, [...others, { wave, roster }]);
}

/**
 * Who was on an earlier wave's roster when it is frozen: everyone a survey of
 * that wave asked (every version), or, for a wave with no survey, every member now.
 */
function frozenRoster(project: Project, wave: number): MemberId[] {
  const surveys = project.surveys.filter((s) => s.wave === wave);
  if (surveys.length === 0) return project.members.map((m) => m.id);
  const asked = new Set(surveys.flatMap((s) => s.versions.flatMap((v) => v.roster)));
  return project.members.map((m) => m.id).filter((id) => asked.has(id));
}

/**
 * Records every wave that has no record yet, and the new wave with `roster`.
 * Used when a survey is repeated: from then on, a member who joins is on the
 * new wave's roster only.
 */
export function recordNewWave(
  project: Project,
  wave: number,
  roster: readonly MemberId[],
): Project {
  const records = [...(project.settings.waves ?? [])].filter((r) => r.wave !== wave);
  for (const w of waveNumbers(project)) {
    if (w === wave || records.some((r) => r.wave === w)) continue;
    records.push({ wave: w, roster: frozenRoster(project, w) });
  }
  const chosen = new Set(roster);
  records.push({ wave, roster: project.members.map((m) => m.id).filter((id) => chosen.has(id)) });
  return withRecords(project, records);
}

/** The latest recorded wave, which members added to the project join; null without records. */
export function latestRecordedWave(project: Project): number | null {
  const records = project.settings.waves ?? [];
  return records.length === 0 ? null : Math.max(...records.map((r) => r.wave));
}

/** Adds new members to the latest recorded wave's roster (not to earlier waves). */
export function addToLatestWave(project: Project, ids: readonly MemberId[]): Project {
  const wave = latestRecordedWave(project);
  if (wave === null || ids.length === 0) return project;
  return withRecords(
    project,
    (project.settings.waves ?? []).map((r) =>
      r.wave === wave
        ? { ...r, roster: [...r.roster, ...ids.filter((id) => !r.roster.includes(id))] }
        : r,
    ),
  );
}

/** Takes a member out of every record (the member is being removed from the project). */
export function removeFromWaves(project: Project, id: MemberId): Project {
  if (!project.settings.waves) return project;
  return withRecords(
    project,
    project.settings.waves.map((r) => ({ ...r, roster: r.roster.filter((m) => m !== id) })),
  );
}

export interface WaveSummary {
  wave: number;
  /** Members on the wave's roster. */
  roster: number;
  /** Whether the roster is recorded. */
  recorded: boolean;
  /** Ratings with a value in the wave, from and about members on its roster. */
  ratings: number;
  /** Members on the roster who were not on the previous wave's roster. */
  joined: number;
  /** Members on the previous wave's roster who are not on this one. */
  left: number;
}

/** One line per wave, for the dashboard, Check the data and the Members tab. */
export function waveSummaries(project: Project): WaveSummary[] {
  let previous: Set<MemberId> | null = null;
  return waveNumbers(project).map((wave) => {
    const ids = waveRosterIds(project, wave);
    const scoped = scopeToWave(project, wave);
    const set = new Set(ids);
    const prev: Set<MemberId> | null = previous;
    const summary: WaveSummary = {
      wave,
      roster: ids.length,
      recorded: hasWaveRecord(project, wave),
      ratings: scoped.ties.filter((t) => typeof t.value === 'number').length,
      joined: prev ? ids.filter((id) => !prev.has(id)).length : 0,
      left: prev ? [...prev].filter((id) => !set.has(id)).length : 0,
    };
    previous = set;
    return summary;
  });
}
