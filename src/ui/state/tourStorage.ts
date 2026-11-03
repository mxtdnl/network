// Remembers the guided first run (build plan session 16): finished or skipped, else the task
// reached. A browser preference like the first-run notice (D20), not project data; "Clear local
// data" (src/data/persistence.ts) removes it with every other `graticule.` key. Storage can be
// unavailable, in which case the first run is offered on every load and restarts at task 1.

export const TOUR_KEY = 'graticule.firstRun';

export type TourRecord =
  { status: 'done' } | { status: 'skipped' } | { status: 'active'; task: number };

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readTour(storage: KeyValueStorage | null = defaultStorage()): TourRecord | null {
  try {
    const raw = storage?.getItem(TOUR_KEY);
    if (raw === 'done' || raw === 'skipped') return { status: raw };
    const task = raw?.startsWith('task:') ? Number(raw.slice(5)) : NaN;
    return Number.isInteger(task) && task >= 0 ? { status: 'active', task } : null;
  } catch {
    return null;
  }
}

export function writeTour(record: TourRecord, storage: KeyValueStorage | null = defaultStorage()) {
  try {
    storage?.setItem(
      TOUR_KEY,
      record.status === 'active' ? `task:${String(record.task)}` : record.status,
    );
  } catch {
    // Not persisted: the first run is offered again on the next load.
  }
}
