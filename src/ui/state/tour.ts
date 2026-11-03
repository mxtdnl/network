// The guided first run on the demo (build plan session 16): three tasks, each done when the
// workspace shows its answer, with "Show me" doing it for the analyst. The tasks read the
// insight rules' observations, so they follow the demo as the analysis finds it.

import { engagementCopy as E } from '../copy/engagement';
import { loadDemo } from './projectActions';
import { saveInsightAsView, showInsight } from './insights';
import { useAppStore } from './store';
import { observations, siloMembers, TOUR_TASKS } from './tourTasks';

export { taskDone, TOUR_TASKS } from './tourTasks';
import { readTour, writeTour } from './tourStorage';
import { mapCopy } from '../copy/map';
import { refLabel } from '../map/model';

/** Starts the first run: loads the demo and opens the panel on the first task. */
export async function startTour(): Promise<void> {
  // Resumes at the task reached, when the first run was left part way.
  const record = readTour();
  const task = record?.status === 'active' ? Math.min(record.task, TOUR_TASKS - 1) : 0;
  await loadDemo();
  const s = useAppStore.getState();
  if (!s.data.project) return;
  // The demo is viewed at Understand without changing it (the step is not saved).
  s.setStepUi({
    step: 'understand',
    stepAdvanced: false,
    tour: { task, views: s.data.project.saved_views.length },
  });
  s.setCentreView('map');
  s.setStatus({ text: E.tour.started, tone: 'info' });
  writeTour({ status: 'active', task });
}

export function goToTask(task: number) {
  const s = useAppStore.getState();
  s.setStepUi({ tour: { task, views: s.data.project?.saved_views.length ?? 0 } });
  writeTour({ status: 'active', task });
}

export function endTour(how: 'done' | 'skipped') {
  const s = useAppStore.getState();
  s.setStepUi({ tour: null });
  s.setStatus({ text: how === 'done' ? E.tour.finished : E.tour.skipped, tone: 'info' });
  writeTour({ status: how });
}

/** Does the task for the analyst, so they can see where its answer is. */
export function showTask(task: number) {
  const s = useAppStore.getState();
  if (task === 0) {
    const o = observations(s, 'silo')[0];
    if (!o) return;
    s.setCentreView('groups');
    s.setGroup(siloMembers(s, o));
    return;
  }
  if (task === 1) {
    const o = observations(s, 'onlyRoutes')[0];
    if (!o) return;
    showInsight(o);
    const first = o.members[0];
    if (first) s.selectMember(first);
    return;
  }
  const o =
    observations(s, 'silo')[0] ?? s.results.current?.insights.flatMap((x) => x.observations)[0];
  const project = s.data.project;
  if (!o || !project) return;
  s.setRightPanel('insights');
  saveInsightAsView(o, {
    layerLabel: (ref) =>
      ref === 'composite' ? mapCopy.controls.composite : refLabel(project, ref),
    attributeLabel: (key) => project.attribute_definitions.find((a) => a.key === key)?.label ?? key,
  });
}
