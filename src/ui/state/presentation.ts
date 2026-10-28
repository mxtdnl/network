// Presentation mode (spec §8): full screen, controls hidden, stepping through
// the saved views in their saved order, after an opening step that gives the
// data-quality statement (build plan session 4; index OPENING). Entering remembers the analyst's own
// state as an unsaved view and leaving restores it, so presenting does not
// disturb the workspace.

import type { Project, SavedView } from '../../data/schema';
import { audiencePolicy, workshopMap } from './audience';
import { audienceChoice, audienceSettings } from './audienceSettings';
import { captureView, restoreView } from './savedViews';
import { useAppStore } from './store';

let before: SavedView | null = null;

/** The opening step, before the first view: "About the data". */
export const OPENING = -1;

function views(): SavedView[] {
  return useAppStore.getState().data.project?.saved_views ?? [];
}

/** A presentation needs a saved view, except a one-to-one, which shows the member's card. */
export function canPresent(project: Project | null): boolean {
  if (!project) return false;
  return project.saved_views.length > 0 || audienceSettings(project).level === 'oneToOne';
}

/**
 * A team workshop shows the view for the team only (build plan session 9):
 * the team filter, no signed layer, and no selection outside the team.
 */
function applyAudience(): void {
  const s = useAppStore.getState();
  const project = s.data.project;
  if (!project) return;
  const policy = audiencePolicy(project, audienceChoice(project, s.ui.audience), s.ui.anonymise);
  if (policy.level !== 'workshop') return;
  const team = policy.shown ?? new Set();
  s.applyViewState({
    map: workshopMap(s.map, policy),
    weights: s.weights,
    selection: {
      member:
        s.selection.member !== null && team.has(s.selection.member) ? s.selection.member : null,
      group: s.selection.group.filter((id) => team.has(id)),
    },
  });
}

/**
 * Shows the step at `index` (clamped): the opening, or a view. The opening
 * shows the first view behind it, so the map is ready when the next step comes.
 */
export function showStep(index: number): boolean {
  const list = views();
  if (list.length === 0) return false;
  const i = Math.max(OPENING, Math.min(list.length - 1, index));
  const view = list[Math.max(i, 0)];
  if (!view) return false;
  const current = useAppStore.getState().ui.presentation;
  // Moving between the opening and the first view keeps the view as it is.
  if (!(current && Math.max(current.index, 0) === 0 && i <= 0)) {
    restoreView(view);
    applyAudience();
  }
  useAppStore.getState().setPresentation({ index: i });
  return true;
}

/** Shows the current step again, after the audience level, team or member changed. */
export function refreshStep(): void {
  const s = useAppStore.getState();
  const current = s.ui.presentation;
  if (!current) return;
  const view = views()[Math.max(current.index, 0)];
  if (view) {
    restoreView(view);
    applyAudience();
  }
}

export function startPresentation(index = OPENING): void {
  const s = useAppStore.getState();
  if (s.ui.presentation || !canPresent(s.data.project)) return;
  before = captureView('');
  // A one-to-one shows the card alone; with no saved view it keeps the analyst's map settings.
  if (views().length === 0) s.setPresentation({ index: 0 });
  else showStep(index);
  // Full screen needs a user gesture, which the Present button provides. If
  // the browser refuses, presentation mode still fills the window.
  const root = document.documentElement;
  if (!document.fullscreenElement && typeof root.requestFullscreen === 'function') {
    root.requestFullscreen().catch(() => undefined);
  }
}

/** A one-to-one shows the member's card alone: there are no steps. */
function oneToOne(): boolean {
  const project = useAppStore.getState().data.project;
  return project !== null && audienceSettings(project).level === 'oneToOne';
}

export function step(delta: number): void {
  const current = useAppStore.getState().ui.presentation;
  if (!current || oneToOne()) return;
  const target = current.index + delta;
  if (target < OPENING || target >= views().length) return;
  showStep(target);
}

export function goTo(index: number): void {
  if (useAppStore.getState().ui.presentation && !oneToOne()) showStep(index);
}

export function stopPresentation(): void {
  const s = useAppStore.getState();
  if (!s.ui.presentation) return;
  s.setPresentation(null);
  if (before) restoreView(before);
  before = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
}
