import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { durationToken } from '../durations';

// The analyst workspace by screen size (spec §12, CLAUDE.md D112 and D125):
// desktop from --workspace-desktop (three columns), compact at desktop widths
// narrower than --workspace-wide or shorter than --workspace-short (collapsible
// controls, the detail column as a drawer over the map), tablet from
// --workspace-tablet (controls beside the view, the detail column below), and
// phone below that, where the workspace is read-only. CSS custom properties
// cannot be used inside @media, so the sizes are read from the tokens (as
// respond/useWide.ts).
//
// The analyst can override the choice between compact and desktop (Help →
// Layout); it is a UI preference in localStorage, like the first-run notice
// (D20), and Clear local data removes it. It never applies below
// --workspace-desktop: tablet and phone follow the width alone.

export type LayoutMode = 'desktop' | 'compact' | 'tablet' | 'phone';
export type LayoutPreference = 'auto' | 'compact' | 'full';

export const LAYOUT_KEY = 'graticule.layout';
const PREFERENCES: readonly LayoutPreference[] = ['auto', 'compact', 'full'];

/** The size tokens, in CSS pixels. */
export interface LayoutSizes {
  desktop: number;
  tablet: number;
  wide: number;
  short: number;
}

export function chooseLayout(
  width: number,
  height: number,
  sizes: LayoutSizes,
  preference: LayoutPreference = 'auto',
): LayoutMode {
  if (width < sizes.tablet) return 'phone';
  if (width < sizes.desktop) return 'tablet';
  if (preference === 'compact') return 'compact';
  if (preference === 'full') return 'desktop';
  return width < sizes.wide || height < sizes.short ? 'compact' : 'desktop';
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLayoutPreference(
  storage: KeyValueStorage | null = defaultStorage(),
): LayoutPreference {
  try {
    const value = storage?.getItem(LAYOUT_KEY);
    return PREFERENCES.find((p) => p === value) ?? 'auto';
  } catch {
    return 'auto';
  }
}

/** Stores the preference; Automatic is the default, so it is stored as no value. */
export function writeLayoutPreference(
  preference: LayoutPreference,
  storage: KeyValueStorage | null = defaultStorage(),
): void {
  try {
    if (preference === 'auto') storage?.removeItem(LAYOUT_KEY);
    else storage?.setItem(LAYOUT_KEY, preference);
  } catch {
    // Not persisted: the preference holds until the page is reloaded.
  }
}

// The preference as an external store, so the Help menu and the workspace agree.
let preference: LayoutPreference = readLayoutPreference();
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

export function setLayoutPreference(next: LayoutPreference): void {
  writeLayoutPreference(next);
  preference = next;
  emit();
}

/** Re-reads the stored preference, after Clear local data has removed it. */
export function refreshLayoutPreference(): void {
  preference = readLayoutPreference();
  emit();
}

export function useLayoutPreference(): LayoutPreference {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => preference,
    () => 'auto' as const,
  );
}

function px(token: string): number {
  return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(token));
}

function readSizes(): LayoutSizes | null {
  if (typeof window === 'undefined') return null;
  const sizes = {
    desktop: px('--workspace-desktop'),
    tablet: px('--workspace-tablet'),
    wide: px('--workspace-wide'),
    short: px('--workspace-short'),
  };
  return Object.values(sizes).every(Number.isFinite) ? sizes : null;
}

function windowSize(): { width: number; height: number } {
  return typeof window === 'undefined'
    ? { width: 0, height: 0 }
    : { width: window.innerWidth, height: window.innerHeight };
}

export function useLayoutMode(): LayoutMode {
  const pref = useLayoutPreference();
  const [size, setSize] = useState(windowSize);
  useEffect(() => {
    // A new size applies once it has held for --workspace-settle, so a passing
    // size (a window being dragged, or a browser briefly reporting a 1 px
    // viewport while it saves a download) does not rebuild the workspace and
    // lose state such as a survey being set up.
    let timer = 0;
    const update = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        setSize(windowSize());
      }, durationToken('--workspace-settle'));
    };
    window.addEventListener('resize', update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', update);
    };
  }, []);
  // The preference applies at once, a new size once it has settled.
  const sizes = readSizes();
  return sizes ? chooseLayout(size.width, size.height, sizes, pref) : 'desktop';
}

/** True on the phone layout: the project can be viewed and explored, not changed. */
export const ReadOnlyContext = createContext(false);

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

/** The workspace layout, for views that arrange themselves differently in it. */
export const LayoutContext = createContext<LayoutMode>('desktop');

export function useLayout(): LayoutMode {
  return useContext(LayoutContext);
}

/** The compact layout's drawer, which the map keeps members clear of when fitting. */
export const DRAWER_ID = 'workspace-drawer';
