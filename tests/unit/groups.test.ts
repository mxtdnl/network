// The Groups view (D154): community mixing in the engine, the group matrix
// figures, the group map model, choosing a group, and the report's mixing
// table by the chosen grouping under both export settings.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseProject } from '../../src/data/projectFile';
import type { Project } from '../../src/data/schema';
import { analyse } from '../../src/engine/analyse';
import { denseGraph } from '../../src/engine/graphs';
import { buildAnalysisInput } from '../../src/engine/input';
import { communityColumn, mixing } from '../../src/engine/metrics/network';
import type { AnalysisResult, GroupMixing } from '../../src/engine/types';
import { groupsCopy, sharePercent } from '../../src/ui/copy/groups';
import { reportCopy } from '../../src/ui/copy/export';
import { buildReport } from '../../src/ui/export/report';
import {
  chosenGroup,
  effectiveGrouping,
  groupAt,
  groupCell,
  groupMapModel,
  groupMembers,
  groupMixing,
  pairCell,
  readGroupMapTheme,
} from '../../src/ui/map/groupModel';
import { contextFor, methodNotes, root, sensitiveProject, tokensCss } from './exportHarness';

const demo = (): Project =>
  parseProject(readFileSync(join(root, 'src/demo/demo.ona.json'), 'utf8'));

async function run(project: Project, view: 'directed' | 'symmetrised'): Promise<AnalysisResult> {
  return analyse(
    buildAnalysisInput(
      project,
      { view, symmetrise: 'mean', weights: {}, signedTreatment: {} },
      view,
    ),
  );
}

const theme = readGroupMapTheme(tokensCss());

describe('community mixing', () => {
  let project: Project;
  const results: Partial<Record<'directed' | 'symmetrised', AnalysisResult>> = {};
  beforeAll(async () => {
    project = demo();
    results.directed = await run(project, 'directed');
    results.symmetrised = await run(project, 'symmetrised');
  }, 60_000);

  it.each(['directed', 'symmetrised'] as const)(
    'is mixing by each member’s community, on every layer (%s)',
    (view) => {
      const result = results[view] as AnalysisResult;
      for (const ref of Object.values(result.refs)) {
        const c = ref.communities;
        if (!c) {
          expect(ref.network.communityMixing).toBeNull();
          continue;
        }
        const mix = ref.network.communityMixing as GroupMixing;
        const g = denseGraph(ref.weights, project.members.length, view === 'directed');
        expect(mix).toEqual(mixing(g, communityColumn(c)));
        expect(mix.groups).toHaveLength(c.count);
        expect(mix.excluded).toBe(0);
        expect(mix.perGroup.reduce((s, x) => s + x.size, 0)).toBe(project.members.length);
        // Every tie is inside a community or between two.
        expect(mix.internal + mix.external).toBe(ref.network.ties);
      }
    },
  );

  it('reports tie counts and possible ties whose ratio is the density', () => {
    for (const view of ['directed', 'symmetrised'] as const) {
      const result = results[view] as AnalysisResult;
      const ref = result.refs.composite;
      for (const mix of [
        ...Object.values(ref?.network.mixing ?? {}),
        ref?.network.communityMixing as GroupMixing,
      ]) {
        const k = mix.groups.length;
        for (let a = 0; a < k; a++) {
          const size = mix.perGroup[a]?.size ?? 0;
          for (let b = 0; b < k; b++) {
            const other = mix.perGroup[b]?.size ?? 0;
            const cell = groupCell(mix, a, b);
            const possible =
              a === b ? (size * (size - 1)) / (view === 'directed' ? 1 : 2) : size * other;
            expect(cell.possible).toBe(possible);
            if (possible > 0) expect(cell.share).toBeCloseTo(mix.density[a * k + b] ?? NaN, 12);
            else expect(cell.share).toBeNaN();
          }
        }
      }
    }
  });

  it('is symmetric when mutual, and pairs add both directions when directed', () => {
    const sym = results.symmetrised?.refs.composite?.network.mixing.team as GroupMixing;
    const k = sym.groups.length;
    for (let a = 0; a < k; a++)
      for (let b = 0; b < k; b++) expect(groupCell(sym, a, b).ties).toBe(groupCell(sym, b, a).ties);
    const dir = results.directed?.refs.composite?.network.mixing.team as GroupMixing;
    const ab = groupCell(dir, 0, 1);
    const ba = groupCell(dir, 1, 0);
    const pair = pairCell(dir, 0, 1, true);
    expect(pair.ties).toBe(ab.ties + ba.ties);
    expect(pair.possible).toBe(ab.possible + ba.possible);
    expect(pairCell(sym, 0, 1, false)).toEqual(groupCell(sym, 0, 1));
  });
});

describe('the group map', () => {
  const mix: GroupMixing = {
    groups: ['A', 'B', 'C', 'D'],
    excluded: 0,
    internal: 9,
    external: 3,
    ei: -0.5,
    perGroup: [
      { group: 'A', size: 16, internal: 6, external: 2, ei: -0.5 },
      { group: 'B', size: 4, internal: 2, external: 2, ei: 0 },
      { group: 'C', size: 1, internal: 0, external: 2, ei: 1 },
      { group: 'D', size: 3, internal: 1, external: 0, ei: -1 },
    ],
    density: new Float64Array(16),
    // A–B 2 ties of 64, A–C 1 of 16, B–C 1 of 4 (mutual); D has no ties out.
    ties: new Float64Array([6, 2, 1, 0, 2, 2, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1]),
    possible: new Float64Array([120, 64, 16, 48, 64, 6, 4, 12, 16, 4, 0, 3, 48, 12, 3, 3]),
  };
  const box = { width: 600, height: 400 };
  const model = groupMapModel(mix, false, box, theme);

  it('has one node per group, area proportional to members', () => {
    expect(model.nodes.map((n) => n.group)).toEqual(['A', 'B', 'C', 'D']);
    expect(model.nodes[0]?.r).toBe(theme.nodeMax);
    // Area ∝ members: B has a quarter of A's members, so half its radius.
    expect(model.nodes[1]?.r).toBeCloseTo(theme.nodeMax / 2, 12);
    // The smallest group keeps the minimum radius.
    expect(model.nodes[2]?.r).toBe(Math.max(theme.nodeMin, theme.nodeMax / 4));
    for (const n of model.nodes) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(0);
      expect(n.x + n.r).toBeLessThanOrEqual(box.width);
      expect(n.y - n.r).toBeGreaterThanOrEqual(0);
      expect(n.y + n.r).toBeLessThanOrEqual(box.height);
    }
  });

  it('draws a line only between groups with ties, width linear in the share', () => {
    expect(model.links.map((l) => [l.a, l.b])).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
    expect(model.maxShare).toBe(0.25);
    expect(model.minShare).toBeCloseTo(2 / 64, 12);
    const width = (share: number) =>
      theme.edgeMin + ((theme.edgeMax - theme.edgeMin) * share) / 0.25;
    for (const l of model.links) expect(l.width).toBeCloseTo(width(l.share), 12);
    expect(model.links.find((l) => l.a === 1 && l.b === 2)?.width).toBe(theme.edgeMax);
  });

  it('finds the group under a point', () => {
    const b = model.nodes[1];
    if (!b) throw new Error('no node');
    expect(groupAt(model, b.x, b.y, 2)).toBe(1);
    expect(groupAt(model, b.x + b.r + 1, b.y, 2)).toBe(1);
    expect(groupAt(model, b.x + b.r + 10, b.y, 2)).toBe(-1);
  });

  it('places two groups side by side and one in the centre', () => {
    const two = { ...mix, groups: ['A', 'B'], perGroup: mix.perGroup.slice(0, 2) };
    const m2 = groupMapModel(two, false, box, theme);
    expect(m2.nodes[0]?.y).toBeCloseTo(m2.nodes[1]?.y ?? NaN, 9);
    expect(m2.nodes[0]?.x ?? 0).toBeLessThan(m2.nodes[1]?.x ?? 0);
    const one = { ...mix, groups: ['A'], perGroup: mix.perGroup.slice(0, 1) };
    expect(groupMapModel(one, false, box, theme).nodes[0]?.x).toBe(box.width / 2);
  });
});

describe('choosing a group', () => {
  it('makes the members of an attribute group or a community the subgroup', async () => {
    const project = demo();
    const result = await run(project, 'directed');
    const ref = result.refs.composite;
    const team = effectiveGrouping(project, null);
    expect(team).toEqual({ kind: 'attribute', key: 'team' });
    const mix = groupMixing(ref, team) as GroupMixing;
    const finance = groupMembers(project, ref, team, 'Finance');
    expect(finance.length).toBe(mix.perGroup.find((g) => g.group === 'Finance')?.size);
    expect(chosenGroup(project, ref, team, mix, finance)).toBe(mix.groups.indexOf('Finance'));
    expect(chosenGroup(project, ref, team, mix, finance.slice(1))).toBe(-1);
    expect(chosenGroup(project, ref, team, mix, [])).toBe(-1);

    const community = { kind: 'community' } as const;
    const cmix = groupMixing(ref, community) as GroupMixing;
    const first = groupMembers(project, ref, community, '1');
    expect(first.length).toBe(cmix.perGroup[0]?.size);
    expect(first[0]).toBe(project.members[0]?.id);
    expect(chosenGroup(project, ref, community, cmix, first)).toBe(0);
  }, 30_000);

  it('falls back from an attribute that is gone, and follows the insight grouping', () => {
    const project = demo();
    expect(effectiveGrouping(project, { kind: 'attribute', key: 'gone' })).toEqual({
      kind: 'attribute',
      key: 'team',
    });
    expect(
      effectiveGrouping(
        { ...project, settings: { ...project.settings, insight_group: 'level' } },
        null,
      ),
    ).toEqual({ kind: 'attribute', key: 'level' });
    // Member references and email are not groupings.
    expect(effectiveGrouping(project, { kind: 'attribute', key: 'manager_id' }).kind).toBe(
      'attribute',
    );
    expect(effectiveGrouping(project, { kind: 'attribute', key: 'manager_id' })).not.toEqual({
      kind: 'attribute',
      key: 'manager_id',
    });
    const none = { ...project, attribute_definitions: [] };
    expect(effectiveGrouping(none, null)).toEqual({ kind: 'community' });
  });
});

describe('wording', () => {
  it('gives shares as whole percentages, never 0% with ties or 100% without all', () => {
    expect(sharePercent(4, 64)).toBe('6%');
    expect(sharePercent(1, 300)).toBe('<1%');
    expect(sharePercent(0, 64)).toBe('0%');
    expect(sharePercent(299, 300)).toBe('>99%');
    expect(sharePercent(300, 300)).toBe('100%');
    expect(sharePercent(0, 0)).toBe('No tie possible');
  });

  it('reads a cell as a sentence', () => {
    const r = groupsCopy.matrix.readout;
    expect(r('Finance', 'Sales', 4, 64, false)).toBe(
      'Finance and Sales: 4 of 64 possible ties, 6%',
    );
    expect(r('Finance', 'Sales', 4, 64, true)).toBe('Finance to Sales: 4 of 64 possible ties, 6%');
    expect(r('Finance', 'Finance', 12, 30, true)).toBe(
      'Within Finance: 12 of 30 possible ties, 40%',
    );
  });
});

describe('the report’s mixing table', () => {
  const project = sensitiveProject();
  const NAMES = project.members.map((m) => m.display_name);
  const mixingTable = async (
    grouping: Parameters<typeof contextFor>[1]['grouping'],
    anonymise: boolean,
    excludeSigned: boolean,
  ) => {
    const ctx = await contextFor(project, { anonymise, excludeSigned, grouping });
    const report = buildReport(ctx, {
      notes: methodNotes(),
      now: new Date('2026-10-23T12:00:00Z'),
      layerName: 'x',
    });
    const blocks = report.sections.find((s) => s.title === reportCopy.sections.metrics)?.blocks;
    const at = (blocks ?? []).findIndex(
      (b) => b.kind === 'heading' && b.text.startsWith('Ties within and between groups'),
    );
    const heading = blocks?.[at];
    const table = blocks?.[at + 1];
    if (heading?.kind !== 'heading' || table?.kind !== 'table') throw new Error('no mixing table');
    return { heading: heading.text, rows: table.rows, ctx };
  };

  const settings = [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const;

  it.each(settings)(
    'uses team by default (hide names %s, leave out signed %s)',
    async (anonymise, excludeSigned) => {
      const { heading, rows } = await mixingTable(null, anonymise, excludeSigned);
      expect(heading).toContain('by team or function');
      expect(rows.map((r) => r[0])).toContain('Finance');
    },
    30_000,
  );

  it.each(settings)(
    'follows the chosen attribute (hide names %s, leave out signed %s)',
    async (anonymise, excludeSigned) => {
      const { heading, rows, ctx } = await mixingTable(
        { kind: 'attribute', key: 'location' },
        anonymise,
        excludeSigned,
      );
      expect(heading).toContain('by location');
      const mix = groupMixing(ctx.result.refs.composite, { kind: 'attribute', key: 'location' });
      expect(rows.map((r) => r[0])).toEqual([...(mix?.groups ?? []), reportCopy.metrics.allGroups]);
    },
    30_000,
  );

  it.each(settings)(
    'follows communities of the analysis it reports (hide names %s, leave out signed %s)',
    async (anonymise, excludeSigned) => {
      const { heading, rows, ctx } = await mixingTable(
        { kind: 'community' },
        anonymise,
        excludeSigned,
      );
      expect(heading).toContain('by community');
      const c = ctx.result.refs.composite?.communities;
      expect(rows).toHaveLength((c?.count ?? 0) + 1);
      expect(rows[0]?.[0]).toBe(groupsCopy.communityName('1'));
      // Group names never carry a member's name.
      const text = rows.flat().join(' ');
      for (const name of NAMES) expect(text).not.toContain(name);
    },
    30_000,
  );

  it('reports the communities of the export’s own analysis when layers are left out', async () => {
    const left = await mixingTable({ kind: 'community' }, true, true);
    expect(left.ctx.reanalysed).toBe(true);
    const mix = left.ctx.result.refs.composite?.network.communityMixing;
    expect(left.rows.slice(0, -1).map((r) => [r[1], r[2], r[3]])).toEqual(
      (mix?.perGroup ?? []).map((g) => [String(g.size), String(g.internal), String(g.external)]),
    );
  }, 60_000);
});
