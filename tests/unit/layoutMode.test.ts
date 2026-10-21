// The compact layout (CLAUDE.md D125): which layout a window size gets, the
// analyst's layout preference and its storage, the drawer state in the store,
// and the condensed legend.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { clearLocalData } from '../../src/data/persistence';
import { condensedSections, type LegendSection } from '../../src/ui/map/legend';
import {
  chooseLayout,
  LAYOUT_KEY,
  readLayoutPreference,
  writeLayoutPreference,
  type LayoutSizes,
} from '../../src/ui/state/layoutMode';
import { useAppStore } from '../../src/ui/state/store';

const tokens = readFileSync(join(__dirname, '../../src/styles/tokens.css'), 'utf8');
const token = (name: string) => {
  const m = new RegExp(`${name}:\\s*([\\d.]+)px;`).exec(tokens);
  if (!m?.[1]) throw new Error(`${name} is not a px token`);
  return Number(m[1]);
};
const sizes: LayoutSizes = {
  desktop: token('--workspace-desktop'),
  tablet: token('--workspace-tablet'),
  wide: token('--workspace-wide'),
  short: token('--workspace-short'),
};

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('layout by window size', () => {
  it('reads the sizes from the tokens', () => {
    expect(sizes).toEqual({ desktop: 1280, tablet: 720, wide: 1600, short: 900 });
  });

  it('is compact at laptop sizes, from the desktop width', () => {
    for (const [w, h] of [
      [1280, 720],
      [1280, 800],
      [1366, 768],
      [1440, 900],
      [1536, 864],
      [1599, 1200],
      [1920, 899],
      [2560, 800],
    ] as const) {
      expect(chooseLayout(w, h, sizes), `${String(w)} × ${String(h)}`).toBe('compact');
    }
  });

  it('is the full desktop layout when the window is both wide and tall enough', () => {
    for (const [w, h] of [
      [1600, 900],
      [1920, 1080],
      [2560, 1440],
    ] as const) {
      expect(chooseLayout(w, h, sizes), `${String(w)} × ${String(h)}`).toBe('desktop');
    }
  });

  it('keeps the tablet and phone layouts below the desktop width, whatever the height', () => {
    expect(chooseLayout(1279, 1400, sizes)).toBe('tablet');
    expect(chooseLayout(1024, 768, sizes)).toBe('tablet');
    expect(chooseLayout(720, 500, sizes)).toBe('tablet');
    expect(chooseLayout(719, 1000, sizes)).toBe('phone');
    expect(chooseLayout(390, 844, sizes)).toBe('phone');
  });

  it('follows the preference at desktop widths only', () => {
    expect(chooseLayout(1920, 1080, sizes, 'compact')).toBe('compact');
    expect(chooseLayout(1280, 720, sizes, 'full')).toBe('desktop');
    expect(chooseLayout(1280, 720, sizes, 'auto')).toBe('compact');
    expect(chooseLayout(1024, 768, sizes, 'full')).toBe('tablet');
    expect(chooseLayout(1024, 768, sizes, 'compact')).toBe('tablet');
    expect(chooseLayout(390, 844, sizes, 'compact')).toBe('phone');
  });
});

describe('layout preference storage', () => {
  it('is Automatic until another choice is stored', () => {
    const storage = memoryStorage();
    expect(readLayoutPreference(storage)).toBe('auto');
    writeLayoutPreference('compact', storage);
    expect(storage.getItem(LAYOUT_KEY)).toBe('compact');
    expect(readLayoutPreference(storage)).toBe('compact');
    writeLayoutPreference('full', storage);
    expect(readLayoutPreference(storage)).toBe('full');
  });

  it('stores Automatic as no value, so the default leaves nothing behind', () => {
    const storage = memoryStorage();
    writeLayoutPreference('full', storage);
    writeLayoutPreference('auto', storage);
    expect(storage.map.has(LAYOUT_KEY)).toBe(false);
    expect(readLayoutPreference(storage)).toBe('auto');
  });

  it('reads an unknown value as Automatic', () => {
    const storage = memoryStorage();
    storage.setItem(LAYOUT_KEY, 'wide');
    expect(readLayoutPreference(storage)).toBe('auto');
  });

  it('treats unavailable storage as Automatic and never throws', () => {
    expect(readLayoutPreference(null)).toBe('auto');
    expect(readLayoutPreference(throwing)).toBe('auto');
    expect(() => {
      writeLayoutPreference('compact', throwing);
    }).not.toThrow();
    expect(() => {
      writeLayoutPreference('compact', null);
    }).not.toThrow();
  });

  it('is removed by Clear local data with the other Graticule keys', async () => {
    const storage = memoryStorage();
    writeLayoutPreference('compact', storage);
    storage.setItem('other.key', 'kept');
    await clearLocalData(null, storage);
    expect(readLayoutPreference(storage)).toBe('auto');
    expect(storage.getItem('other.key')).toBe('kept');
  });
});

describe('the compact layout drawer in the store', () => {
  it('opens when a panel is chosen or a member is selected, not when the selection clears', () => {
    const s = useAppStore.getState();
    s.setRightOpen(false);
    s.setRightPanel('insights');
    expect(useAppStore.getState().ui.rightOpen).toBe(true);
    s.setRightOpen(false);
    s.selectMember(null);
    expect(useAppStore.getState().ui.rightOpen).toBe(false);
    s.selectMember('m01');
    expect(useAppStore.getState().ui.rightOpen).toBe(true);
    s.selectMember(null);
    expect(useAppStore.getState().ui.rightOpen).toBe(true);
    expect(useAppStore.getState().ui.leftOpen).toBe(true);
    expect(useAppStore.getState().ui.legend).toBeNull();
  });
});

describe('condensed legend', () => {
  const sections: LegendSection[] = [
    {
      kind: 'size',
      title: 'Node size',
      variable: 'Bridging',
      samples: [
        { radius: 4, label: '0.000' },
        { radius: 11, label: '0.218' },
        { radius: 16, label: '0.437' },
      ],
      notDefined: { radius: 2, label: 'Not defined' },
    },
    {
      kind: 'fill',
      title: 'Node fill',
      variable: 'Team',
      items: [
        { hue: 0, label: 'Finance' },
        { hue: 1, label: 'Operations' },
        { hue: 2, label: 'Product' },
      ],
    },
    {
      kind: 'width',
      title: 'Edge width',
      variable: 'Composite',
      samples: [
        { width: 1.4, label: '0.20' },
        { width: 2.2, label: '0.60' },
        { width: 3, label: '1.00' },
      ],
      notRated: null,
      notes: ['Ties below 0.20 are hidden.'],
    },
    {
      kind: 'arrows',
      title: 'Direction',
      variable: '',
      items: [
        { arrow: true, label: 'One way' },
        { arrow: false, label: 'Both ways' },
      ],
    },
  ];

  it('keeps every encoding and note, and only the end points of a scale', () => {
    const condensed = condensedSections(sections);
    expect(condensed.map((s) => s.kind)).toEqual(['size', 'fill', 'width', 'arrows']);
    const size = condensed[0];
    const width = condensed[2];
    if (size?.kind !== 'size' || width?.kind !== 'width') throw new Error('order');
    expect(size.samples.map((s) => s.label)).toEqual(['0.000', '0.437']);
    expect(size.notDefined).not.toBeNull();
    expect(width.samples.map((s) => s.label)).toEqual(['0.20', '1.00']);
    expect(width.notes).toEqual(['Ties below 0.20 are hidden.']);
    // Categories have no end points: every group stays.
    expect(condensed[1]).toEqual(sections[1]);
  });

  it('leaves a scale of one or two samples as it is', () => {
    const one: LegendSection[] = [
      {
        kind: 'size',
        title: 'Node size',
        variable: 'Bridging',
        samples: [{ radius: 10, label: '0.5' }],
        notDefined: null,
      },
    ];
    expect(condensedSections(one)).toEqual(one);
  });
});
