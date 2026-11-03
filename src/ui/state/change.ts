// What changed between two waves (build plan session 15): which waves can be
// compared, the pair compared by default, and the comparison itself. Each wave
// is analysed with the same weights, view, rule and options, on a worker of
// its own (as the export exclusion, D105), and the engine's compareWaves reads
// the two results. Used by the Compare tab's "Two waves" mode, presentation,
// the personal network card and the exports. Wording is in ui/copy/change.ts.

import type { Project } from '../../data/schema';
import {
  changeObservations,
  compareWaves,
  type ChangeObservation,
  type ChangeObservations,
  type WaveChange,
} from '../engineClient';
import type { AnalysisInput, AnalysisResult } from '../engineClient';
import type { AudiencePolicy } from './audience';
import { insightGroup } from './insightGroup';
import type { WeightState } from './presets';
import { previewInput } from './remedies';
import type { MapSettings } from './store';

export type { ChangeObservation, WaveChange };

export interface WavePair {
  before: number;
  after: number;
}

/** Waves with at least one rating, in order. */
export function ratedWaves(project: Project): number[] {
  const set = new Set<number>();
  for (const t of project.ties) if (typeof t.value === 'number') set.add(t.wave);
  return [...set].sort((a, b) => a - b);
}

/** Two waves with ratings are needed to compare. */
export const canCompareWaves = (project: Project | null) =>
  project !== null && ratedWaves(project).length >= 2;

/**
 * The pair compared: the waves chosen when both have ratings and the first is
 * earlier; otherwise the wave analysed (when an earlier wave has ratings, else
 * the latest with ratings) and the wave with ratings just before it.
 */
export function wavePair(
  project: Project,
  analysed: number,
  chosen: Partial<WavePair> | null = null,
): WavePair | null {
  const waves = ratedWaves(project);
  if (waves.length < 2) return null;
  const b = chosen?.before;
  const a = chosen?.after;
  if (b !== undefined && a !== undefined && waves.includes(b) && waves.includes(a) && b < a)
    return { before: b, after: a };
  const after = waves.indexOf(analysed) > 0 ? analysed : (waves.at(-1) as number);
  const before = waves.filter((w) => w < after).at(-1) as number;
  return { before, after };
}

export interface ChangeRun {
  pair: WavePair;
  ref: string;
  before: AnalysisResult;
  after: AnalysisResult;
  change: WaveChange;
  observations: ChangeObservations;
}

export type Analyse = (input: AnalysisInput) => Promise<AnalysisResult>;

/**
 * Analyses both waves of `project` (every wave; the exclusion, when it applies,
 * already made) under the map's settings and weights, and compares `ref`.
 */
export async function runChange(
  project: Project,
  map: MapSettings,
  weights: WeightState,
  pair: WavePair,
  ref: string,
  analyse: Analyse,
  key = 'change',
): Promise<ChangeRun> {
  const input = (wave: number) =>
    previewInput(project, { ...map, wave }, weights, `${key}:${String(wave)}`);
  const inBefore = input(pair.before);
  const inAfter = input(pair.after);
  const before = await analyse(inBefore);
  const after = await analyse(inAfter);
  const group = insightGroup(project)?.key ?? null;
  const usedRef = before.refs[ref] && after.refs[ref] ? ref : 'composite';
  const change = compareWaves(before, after, usedRef, {
    group,
    columns: group
      ? { before: inBefore.attributes[group], after: inAfter.attributes[group] }
      : undefined,
    minCoverage: project.settings.coverage_threshold,
  });
  return { pair, ref: usedRef, before, after, change, observations: changeObservations(change) };
}

/**
 * The observations an audience may see (build plan session 9): board and
 * leadership see pairs of groups that reach the minimum group size in both
 * waves, and no member; a workshop sees pairs involving its team and cut points
 * in it; a one-to-one sees none (the card carries the member's own change).
 */
export function audienceChange(run: ChangeRun, policy: AudiencePolicy): ChangeObservation[] {
  const all = run.observations.observations;
  switch (policy.level) {
    case 'analyst':
      return all;
    case 'oneToOne':
      return [];
    case 'workshop':
      return all.filter((o) => {
        if (o.kind === 'groupPair') return o.from === policy.team || o.to === policy.team;
        if (o.kind === 'cutPoint') return policy.shown?.has(o.member) ?? true;
        return false;
      });
    default: {
      if (!run.change.group)
        return all.filter((o) => o.kind !== 'groupPair' && o.kind !== 'cutPoint');
      // Group sizes in each wave, as each wave's analysis counted them.
      const sizes = [run.change.before.groupSizes, run.change.after.groupSizes];
      const big = (g: string) => sizes.every((s) => (s[g] ?? 0) >= policy.minGroupSize);
      return all.filter((o) =>
        o.kind === 'groupPair' ? big(o.from) && big(o.to) : o.kind !== 'cutPoint',
      );
    }
  }
}
