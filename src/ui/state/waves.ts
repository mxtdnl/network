// The wave the workspace analyses (build plan session 14). The store holds the
// whole project, which every edit changes; the analysis and every view of its
// results read the project scoped to one wave (data/waves.ts), so their member
// indexes line up with the engine's result.

import type { Project } from '../../data/schema';
import { isMultiWave, resolveWave, scopeToWave, waveNumbers } from '../../data/waves';
import { useAppStore, type AppState } from './store';

/** The wave the current settings analyse. */
export function analysedWave(s: Pick<AppState, 'data' | 'map'>): number {
  return s.data.project ? resolveWave(s.data.project, s.map.wave) : 1;
}

/** The project as the analysed wave sees it; the project itself when it has one wave. */
export function selectWaveProject(s: Pick<AppState, 'data' | 'map'>): Project | null {
  const project = s.data.project;
  return project ? scopeToWave(project, resolveWave(project, s.map.wave)) : null;
}

export const useWaveProject = () => useAppStore(selectWaveProject);

export interface WaveInfo {
  wave: number;
  /** Every wave the project knows of. */
  waves: number[];
  /** The wave is named wherever results are shown only when there is more than one. */
  shown: boolean;
}

export function waveInfo(project: Project | null, chosen: number | null): WaveInfo | null {
  if (!project) return null;
  const waves = waveNumbers(project);
  return { wave: resolveWave(project, chosen), waves, shown: isMultiWave(project) };
}

const infoCache = new WeakMap<Project, Map<string, WaveInfo>>();

/** Cached per project and choice, so a selector returns the same object. */
export function selectWaveInfo(s: Pick<AppState, 'data' | 'map'>): WaveInfo | null {
  const project = s.data.project;
  if (!project) return null;
  let byChoice = infoCache.get(project);
  const key = String(s.map.wave);
  const cached = byChoice?.get(key);
  if (cached) return cached;
  const info = waveInfo(project, s.map.wave) as WaveInfo;
  if (!byChoice) {
    byChoice = new Map();
    infoCache.set(project, byChoice);
  }
  byChoice.set(key, info);
  return info;
}

export const useWaveInfo = () => useAppStore(selectWaveInfo);
