// The guided first run's tasks (build plan session 16), checked against the workspace's state.
// Pure, so tests can import it without the demo loader.

import { engagementCopy as E } from '../copy/engagement';
import type { Observation } from '../engineClient';
import type { AppState } from './store';

export const TOUR_TASKS = E.tour.tasks.length;

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length > 0 && a.length === b.length && b.every((x) => a.includes(x));

export function observations(s: AppState, rule: string): Observation[] {
  return s.results.current?.insights.find((o) => o.rule === rule)?.observations ?? [];
}

/** The members of the group a silo observation names. */
export function siloMembers(s: AppState, o: Observation): string[] {
  const g = o.group;
  if (!g || !s.data.project) return [];
  return s.data.project.members
    .filter((m) => m.attributes[g.attribute] === g.value)
    .map((m) => m.id);
}

/** Whether the workspace shows the answer to a task. `views` is the number of saved views when
 *  the task started. */
export function taskDone(task: number, s: AppState, views: number): boolean {
  if (task === 0) {
    return observations(s, 'silo').some(
      (o) =>
        sameSet(s.selection.group, siloMembers(s, o)) || sameSet(s.map.highlight, o.view.highlight),
    );
  }
  if (task === 1) {
    return observations(s, 'onlyRoutes').some(
      (o) =>
        sameSet(s.map.highlight, o.view.highlight) ||
        (s.selection.member !== null && o.members.includes(s.selection.member)),
    );
  }
  const saved = s.data.project?.saved_views ?? [];
  return saved.length > views && saved.slice(views).some((v) => v.caption.trim() !== '');
}
