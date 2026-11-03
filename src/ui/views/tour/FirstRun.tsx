import { useEffect, useId, useRef } from 'react';
import { engagementCopy as E } from '../../copy/engagement';
import { useAppStore } from '../../state/store';
import { TOUR_TASKS, endTour, goToTask, showTask, taskDone } from '../../state/tour';

// The guided first run's panel (build plan session 16), at the foot of the centre column: not a
// dialog, so the workspace stays usable while the analyst works out each task. The task's state
// is announced politely when it changes.
export function FirstRun() {
  const tour = useAppStore((s) => s.ui.tour);
  const headingId = useId();
  const task = tour?.task ?? 0;
  // Task 3 waits for a view saved after the task started.
  const done = useAppStore((s) => (s.ui.tour ? taskDone(task, s, s.ui.tour.views) : false));
  // "Show me" reads the insight rules' observations, so it waits for the analysis.
  const ready = useAppStore((s) => s.results.status === 'ready' && s.results.current !== null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    // Moving to the next task moves focus to its heading, as a new screen would.
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [task]);
  if (!tour) return null;
  const info = E.tour.tasks[task];
  if (!info) return null;
  const last = task === TOUR_TASKS - 1;
  return (
    <section className="tour" aria-labelledby={headingId}>
      <h2 id={headingId} className="tour__title" ref={headingRef} tabIndex={-1}>
        {E.tour.title}: {E.tour.taskOf(task + 1, TOUR_TASKS)}
      </h2>
      <p className="tour__task">{info.title}</p>
      <p className="tour__hint">{info.hint}</p>
      <p className="tour__status" role="status">
        {done ? E.tour.done : E.tour.notYet}
      </p>
      <div className="tour__buttons">
        <button
          type="button"
          className="button button--secondary"
          disabled={!ready}
          onClick={() => {
            showTask(task);
          }}
        >
          {E.tour.showMe}
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={!done}
          onClick={() => {
            if (last) endTour('done');
            else goToTask(task + 1);
          }}
        >
          {last ? E.tour.finish : E.tour.next}
        </button>
        <button
          type="button"
          className="button button--text"
          onClick={() => {
            endTour('skipped');
          }}
        >
          {E.tour.skip}
        </button>
      </div>
    </section>
  );
}
