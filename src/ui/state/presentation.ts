// Presentation mode (spec §8): full screen, controls hidden, stepping through
// the saved views in their saved order, after an opening step that gives the
// data-quality statement (build plan session 4; index OPENING). Entering remembers the analyst's own
// state as an unsaved view and leaving restores it, so presenting does not
// disturb the workspace.

import type { SavedView } from '../../data/schema';
import { captureView, restoreView } from './savedViews';
import { useAppStore } from './store';

let before: SavedView | null = null;

/** The opening step, before the first view: "About the data". */
export const OPENING = -1;

function views(): SavedView[] {
  return useAppStore.getState().data.project?.saved_views ?? [];
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
  if (!(current && Math.max(current.index, 0) === 0 && i <= 0)) restoreView(view);
  useAppStore.getState().setPresentation({ index: i });
  return true;
}

export function startPresentation(index = OPENING): void {
  const s = useAppStore.getState();
  if (s.ui.presentation || views().length === 0) return;
  before = captureView('');
  showStep(index);
  // Full screen needs a user gesture, which the Present button provides. If
  // the browser refuses, presentation mode still fills the window.
  const root = document.documentElement;
  if (!document.fullscreenElement && typeof root.requestFullscreen === 'function') {
    root.requestFullscreen().catch(() => undefined);
  }
}

export function step(delta: number): void {
  const current = useAppStore.getState().ui.presentation;
  if (!current) return;
  const target = current.index + delta;
  if (target < OPENING || target >= views().length) return;
  showStep(target);
}

export function goTo(index: number): void {
  if (useAppStore.getState().ui.presentation) showStep(index);
}

export function stopPresentation(): void {
  const s = useAppStore.getState();
  if (!s.ui.presentation) return;
  s.setPresentation(null);
  if (before) restoreView(before);
  before = null;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
}
