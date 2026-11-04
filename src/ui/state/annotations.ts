// Notes on the map (build plan session 17): short texts anchored to a member
// or to a point in layout coordinates. They are map settings, so the map, the
// presentation and every export draw them through the scene (map/scene.ts),
// and saved views keep them (state/savedViews.ts).

import {
  ANNOTATION_MAX,
  ANNOTATION_MAX_TEXT,
  type AnnotationSide,
  type MapAnnotation,
  type MemberId,
} from '../../data/schema';
import { annotationsCopy as A } from '../copy/annotations';
import { useAppStore } from './store';

/** Why a note's text cannot be used, or null. */
export function noteProblem(text: string): string | null {
  const t = text.trim();
  if (t === '') return A.textRequired;
  const n = Array.from(t).length;
  if (n > ANNOTATION_MAX_TEXT) return A.tooLong(n);
  return null;
}

/** The next note id: `n1`, `n2`, … after the highest, never reused within a map. */
export function nextNoteId(notes: readonly MapAnnotation[]): string {
  let max = 0;
  for (const a of notes) {
    const m = /^n(\d+)$/.exec(a.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `n${String(max + 1)}`;
}

/** The notes with one added; unchanged when the text is not usable or the map is full. */
export function withNote(
  notes: readonly MapAnnotation[],
  text: string,
  anchor: MapAnnotation['anchor'],
  side: AnnotationSide,
): MapAnnotation[] | null {
  if (noteProblem(text) !== null || notes.length >= ANNOTATION_MAX) return null;
  return [...notes, { id: nextNoteId(notes), text: text.trim(), anchor, side }];
}

export function addNote(
  text: string,
  anchor: MapAnnotation['anchor'],
  side: AnnotationSide,
): boolean {
  const s = useAppStore.getState();
  const next = withNote(s.map.annotations, text, anchor, side);
  if (!next) return false;
  s.setMap({ annotations: next });
  s.setStatus({ text: A.added, tone: 'info' });
  return true;
}

export function updateNote(id: string, patch: Partial<Pick<MapAnnotation, 'text' | 'side'>>): void {
  const s = useAppStore.getState();
  if (patch.text !== undefined && noteProblem(patch.text) !== null) return;
  s.setMap({
    annotations: s.map.annotations.map((a) =>
      a.id === id
        ? { ...a, ...patch, ...(patch.text !== undefined ? { text: patch.text.trim() } : {}) }
        : a,
    ),
  });
}

export function removeNote(id: string): void {
  const s = useAppStore.getState();
  s.setMap({ annotations: s.map.annotations.filter((a) => a.id !== id) });
  s.setStatus({ text: A.removed, tone: 'info' });
}

export function removeAllNotes(): void {
  const s = useAppStore.getState();
  s.setMap({ annotations: [] });
  s.setStatus({ text: A.allRemoved, tone: 'info' });
}

// A note waiting to be placed with the note tool: its text and side.
let pending: { text: string; side: AnnotationSide } | null = null;

/** Starts the note tool: the next click on the map places this note. */
export function startPlacing(text: string, side: AnnotationSide): boolean {
  const s = useAppStore.getState();
  if (noteProblem(text) !== null || s.map.annotations.length >= ANNOTATION_MAX) return false;
  pending = { text, side };
  s.setMap({ tool: 'note' });
  s.setStatus({ text: A.placing, tone: 'info' });
  return true;
}

export function cancelPlacing(): void {
  const s = useAppStore.getState();
  pending = null;
  if (s.map.tool === 'note') {
    s.setMap({ tool: 'pan' });
    s.setStatus({ text: A.placingCancelled, tone: 'info' });
  }
}

/** Places the waiting note on a member (by id) or at a point; the tool returns to pan. */
export function placePending(at: { member: MemberId } | { x: number; y: number }): void {
  const s = useAppStore.getState();
  const note = pending;
  pending = null;
  s.setMap({ tool: 'pan' });
  if (!note) return;
  addNote(
    note.text,
    'member' in at ? { kind: 'member', member: at.member } : { kind: 'point', x: at.x, y: at.y },
    note.side,
  );
}

/** A note is waiting to be placed (for tests). */
export function isPlacing(): boolean {
  return pending !== null;
}
