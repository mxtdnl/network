// Audience levels (build plan session 9): the policy layer, pooling of small
// groups, insights and roles an audience may see, the personal network card,
// and the audience sweep of every export: at board level no member's name,
// code or id appears in any export, under every combination of the two export
// settings, and groups below the minimum size are pooled or left out.

import { describe, expect, it } from 'vitest';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { memberCodes } from '../../src/data/anonymise';
import { parseProject, serialiseProject } from '../../src/data/projectFile';
import type { Project } from '../../src/data/schema';
import { analyse } from '../../src/engine/analyse';
import { buildAnalysisInput } from '../../src/engine/input';
import { paintDocument, pngScale, type PaintContext } from '../../src/ui/export/canvas';
import type { ExportContext } from '../../src/ui/export/context';
import { documentText, roughMeasure } from '../../src/ui/export/document';
import {
  cardExport,
  mapExport,
  pdfExport,
  pictureExport,
  svgExport,
  type ExportDeps,
} from '../../src/ui/export/files';
import type { MapState } from '../../src/ui/export/mapScene';
import {
  formalInformalCsv,
  memberMetricsCsv,
  metricsTableCsv,
  networkMetricsCsv,
} from '../../src/ui/export/tables';
import { buildReport, reportText } from '../../src/ui/export/report';
import { readExportTheme } from '../../src/ui/export/theme';
import { DIRECTED_METRICS } from '../../src/ui/copy/metrics';
import { audienceCopy } from '../../src/ui/copy/audience';
import { groupMixing } from '../../src/ui/map/groupModel';
import {
  MEMBER_RULES,
  allows,
  audienceGroups,
  audienceInsights,
  audiencePolicy,
  leadershipRoles,
  poolMixing,
  roleHolder,
  workshopMap,
} from '../../src/ui/state/audience';
import {
  audienceChoice,
  audienceSettings,
  forcesCodes,
  type AudienceChoice,
} from '../../src/ui/state/audienceSettings';
import { buildCard } from '../../src/ui/state/card';
import { restrictNames } from '../../src/ui/state/names';
import { initialMapSettings } from '../../src/ui/state/store';
import {
  contextFor,
  diskFonts,
  methodNotes,
  nodeInflate,
  sensitiveProject,
  tokensCss,
} from './exportHarness';

const base = sensitiveProject();
const NAMES = base.members.map((m) => m.display_name);
const CODES = memberCodes(base.members).codes;
const IDS = base.members.map((m) => m.id);
const tokens = tokensCss();
const theme = readExportTheme(tokens);
const deps: ExportDeps = {
  tokens,
  measure: roughMeasure,
  loadFont: diskFonts,
  inflate: nodeInflate,
  now: new Date('2026-10-28T12:00:00Z'),
  notes: methodNotes(),
};
const mapState: MapState = {
  positions: null,
  layoutKey: null,
  viewport: null,
  revision: 1,
  group: [],
  path: null,
};
// A caption naming two members, by name and by code.
const CAPTION = `${NAMES[0] ?? ''} and ${CODES[1] ?? ''} link the teams.`;

function withAudience(project: Project, patch: Partial<Project['settings']['audience']>): Project {
  return {
    ...project,
    settings: { ...project.settings, audience: { ...audienceSettings(project), ...patch } },
  };
}

const board: AudienceChoice = { level: 'board', team: null, member: null };

async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const meta = await doc.getMetadata();
  let text = JSON.stringify(meta.info);
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += `\n${content.items.map((x) => ('str' in x ? x.str : '')).join(' ')}`;
  }
  return text;
}

/** Text a canvas would draw for the PNG. */
function pngText(ctx: ExportContext): string {
  const { doc } = pictureExport(ctx, mapState, deps, CAPTION);
  const texts: string[] = [];
  const record = {
    globalAlpha: 1,
    save() {},
    restore() {},
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    arc() {},
    rect() {},
    clip() {},
    fill() {},
    stroke() {},
    fillRect() {},
    setLineDash() {},
    fillText(t: string) {
      texts.push(t);
    },
    strokeText(t: string) {
      texts.push(t);
    },
  } as unknown as PaintContext;
  paintDocument(record, doc, theme, pngScale('x1', doc, theme));
  return texts.join('\n');
}

/** Members' names, codes and ids found in a text, as whole words. */
function membersIn(text: string): string[] {
  const word = (w: string) =>
    new RegExp(
      `(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`,
      'u',
    );
  return [...NAMES, ...CODES, ...IDS].filter((w) => w !== '' && word(w).test(text));
}

// ------------------------------------------------------------------- policy

describe('audience settings', () => {
  it('defaults to the analyst level and a minimum group of 5', () => {
    const a = audienceSettings(base);
    expect(a).toEqual({ level: 'analyst', min_group_size: 5, named_teams: {}, named_members: [] });
  });

  it('round-trips through the project file and refuses a minimum below 3', () => {
    const p = withAudience(base, {
      level: 'board',
      min_group_size: 6,
      named_teams: { team: ['Finance'] },
      named_members: [IDS[0] ?? ''],
    });
    expect(parseProject(serialiseProject(p)).settings.audience).toEqual(p.settings.audience);
    const bad = withAudience(base, { min_group_size: 2 });
    expect(() => parseProject(serialiseProject(bad))).toThrow(/minimum group size/);
  });

  it('chooses the first team and member when none is chosen', () => {
    const c = audienceChoice(withAudience(base, { level: 'workshop' }), {
      team: null,
      member: null,
    });
    expect(c.team).toBe('Finance');
    expect(c.member).toBe(IDS[0]);
  });

  it('forces codes in a workshop whose team has not agreed', () => {
    const p = withAudience(base, { level: 'workshop' });
    const c = { level: 'workshop' as const, team: 'Finance', member: null };
    expect(forcesCodes(p, c)).toBe(true);
    expect(forcesCodes(withAudience(p, { named_teams: { team: ['Finance'] } }), c)).toBe(false);
  });

  it('offers each output only at the levels it suits', () => {
    expect(allows({ level: 'board' }, 'members')).toBe(false);
    expect(allows({ level: 'board' }, 'network')).toBe(true);
    expect(allows({ level: 'workshop' }, 'members')).toBe(true);
    expect(allows({ level: 'oneToOne' }, 'report')).toBe(false);
    expect(allows({ level: 'oneToOne' }, 'card')).toBe(true);
    expect(allows({ level: 'analyst' }, 'card')).toBe(false);
  });
});

describe('restricted names', () => {
  it('replaces members outside the audience, by name and by code, in free text', () => {
    const allowed = new Set([IDS[0]]);
    const names = restrictNames(base, false, (id) => allowed.has(id), 'a colleague');
    expect(names.of(IDS[0] ?? '')).toBe(NAMES[0]);
    expect(names.of(IDS[1] ?? '')).toBe('a colleague');
    expect(names.text(`${NAMES[1] ?? ''} met ${CODES[2] ?? ''} and ${NAMES[0] ?? ''}.`)).toBe(
      `a colleague met a colleague and ${NAMES[0] ?? ''}.`,
    );
  });
});

// ------------------------------------------------------------------ pooling

async function analysed(project: Project, view: 'directed' | 'symmetrised') {
  return analyse(
    buildAnalysisInput(
      project,
      { view, symmetrise: 'mean', weights: {}, signedTreatment: {} },
      'audience',
    ),
  );
}

describe('pooling small groups', () => {
  it.each(['directed', 'symmetrised'] as const)(
    'pools groups below the minimum exactly as if they were one group (%s)',
    async (view) => {
      const result = await analysed(base, view);
      const ref = result.refs.connection_strength;
      const mix = groupMixing(ref, { kind: 'attribute', key: 'level' });
      if (!mix) throw new Error('no mixing');
      const pooled = poolMixing(mix, 5, view === 'directed');
      // L1 (3), L4 (4) and L5 (1) are below 5: pooled, 8 members.
      expect(pooled.pooled).toEqual({ groups: 3, members: 8 });
      expect(pooled.groups).toEqual(['L2', 'L3', audienceCopy.otherGroups(8)]);

      // The same analysis with the three levels merged into one value.
      const merged: Project = {
        ...base,
        attribute_definitions: base.attribute_definitions.map((a) =>
          a.key === 'level' ? { ...a, categories: ['L2', 'L3', 'Other'] } : a,
        ),
        members: base.members.map((m) => ({
          ...m,
          attributes: {
            ...m.attributes,
            level: ['L2', 'L3'].includes(m.attributes.level ?? '')
              ? (m.attributes.level ?? null)
              : 'Other',
          },
        })),
      };
      const ref2 = (await analysed(merged, view)).refs.connection_strength;
      const want = groupMixing(ref2, { kind: 'attribute', key: 'level' });
      if (!want) throw new Error('no mixing');
      expect(Array.from(pooled.ties)).toEqual(Array.from(want.ties));
      expect(Array.from(pooled.possible)).toEqual(Array.from(want.possible));
      expect(pooled.perGroup.map((g) => [g.size, g.internal, g.external])).toEqual(
        want.perGroup.map((g) => [g.size, g.internal, g.external]),
      );
      expect([pooled.internal, pooled.external]).toEqual([want.internal, want.external]);
    },
  );

  it('leaves out a small group that cannot be pooled', async () => {
    const result = await analysed(base, 'directed');
    const mix = groupMixing(result.refs.connection_strength, { kind: 'attribute', key: 'level' });
    if (!mix) throw new Error('no mixing');
    const out = poolMixing(mix, 3, true);
    expect(out.leftOut).toEqual({ groups: 1, members: 1 });
    expect(out.groups).not.toContain('L5');
    expect(out.groups).toEqual(['L1', 'L2', 'L3', 'L4']);
  });
});

// ---------------------------------------------------------- insights, roles

describe('insights and roles for an audience', () => {
  it('a board sees group-level observations of groups of 5 or more, naming no member', async () => {
    const result = await analysed(base, 'directed');
    const policy = audiencePolicy(base, board, false);
    const outcomes = audienceInsights(base, result.insights, policy);
    expect(outcomes.map((o) => o.rule)).not.toEqual(expect.arrayContaining([...MEMBER_RULES]));
    for (const o of outcomes)
      for (const obs of o.observations) {
        expect(obs.members).toEqual([]);
        expect(obs.view.highlight).toEqual([]);
        expect(obs.shared).toBeUndefined();
        if (obs.group) expect(obs.group.attribute).toBeTruthy();
      }
    // The demo's Finance silo is a group of 8, so it is kept.
    expect(outcomes.find((o) => o.rule === 'silo')?.observations.length).toBeGreaterThan(0);
  });

  it('names a role holder only if they agreed', async () => {
    const result = await analysed(base, 'directed');
    const roles = leadershipRoles(result.insights);
    expect(roles.length).toBeGreaterThan(0);
    const id = roles[0]?.member ?? '';
    const team = base.members.find((m) => m.id === id)?.attributes.team ?? '';
    const leadership = { level: 'leadership' as const, team: null, member: null };
    expect(roleHolder(base, audiencePolicy(base, leadership, false), id)).toBe(
      audienceCopy.memberOf(team),
    );
    const agreed = withAudience(base, { named_members: [id] });
    const name = NAMES[IDS.indexOf(id)];
    expect(roleHolder(agreed, audiencePolicy(agreed, leadership, false), id)).toBe(name);
  });

  it('a workshop keeps observations about its team only, with its members', async () => {
    const result = await analysed(base, 'directed');
    const p = withAudience(base, { level: 'workshop' });
    const policy = audiencePolicy(p, { level: 'workshop', team: 'Finance', member: null }, false);
    for (const o of audienceInsights(p, result.insights, policy))
      for (const obs of o.observations) {
        expect([obs.group?.value, obs.group?.other]).toContain('Finance');
        for (const id of obs.members) expect(id.startsWith('FIN')).toBe(true);
      }
  });

  it('a workshop map shows the team only and no signed layer', () => {
    const policy = audiencePolicy(base, { level: 'workshop', team: 'Sales', member: null }, false);
    const map = workshopMap(
      { ...initialMapSettings(), highlight: [IDS[0] ?? ''], negativeOutsideRange: true },
      policy,
    );
    expect(map.filters).toEqual([{ key: 'team', values: ['Sales'] }]);
    expect(map.highlight).toEqual([]);
    expect(map.edgeColour.kind).toBe('none');
    expect(map.negativeOutsideRange).toBe(false);
  });
});

// --------------------------------------------------------------------- card

describe('the personal network card', () => {
  it('counts ties received by group only and lists the member’s own ratings', async () => {
    const result = await analysed(base, 'directed');
    const policy = audiencePolicy(base, { level: 'oneToOne', team: null, member: 'FIN01' }, false);
    const card = buildCard(base, result, { ...initialMapSettings() }, policy);
    if (!card) throw new Error('no card');
    expect(card.title).toBe(NAMES[0]);
    const titles = card.sections.map((s) => s.title);
    expect(titles).toEqual([
      audienceCopy.card.byGroup,
      audienceCopy.card.layers,
      audienceCopy.card.rated,
      audienceCopy.card.position,
    ]);
    // Colleagues named are only those FIN01 rated.
    const rated = new Set(
      base.ties.filter((t) => t.rater_id === 'FIN01' && t.wave === 1).map((t) => t.ratee_id),
    );
    const text = card.sections
      .flatMap((s) => s.blocks)
      .flatMap((b) =>
        b.kind === 'table' ? [...b.rows.flat(), ...b.columns.map((c) => c.label)] : [b.text],
      )
      .join('\n');
    base.members.forEach((m, i) => {
      if (m.id === 'FIN01') return;
      const named = text.includes(NAMES[i] ?? '');
      expect(named).toBe(rated.has(m.id));
    });
    // Ties received are a count per group, and add up to the total row.
    const table = card.sections[0]?.blocks.find((b) => b.kind === 'table');
    if (table?.kind !== 'table') throw new Error('no table');
    const rows = table.rows;
    const total = rows[rows.length - 1];
    const sum = rows.slice(0, -1).reduce((s, r) => s + Number(r[3]), 0);
    expect(sum).toBe(Number(total?.[3]));
  });

  it('exports as a PDF at one-to-one level only', async () => {
    const one = { level: 'oneToOne' as const, team: null, member: 'SAL03' };
    const ctx = await contextFor(base, { anonymise: false, excludeSigned: false, audience: one });
    const out = await cardExport(ctx, deps);
    expect(new TextDecoder().decode(out.bytes.slice(0, 5))).toBe('%PDF-');
    expect(out.fileName).toContain('-one-to-one');
    const text = await pdfText(out.bytes);
    expect(text).toContain(audienceCopy.card.position);
    expect(out.substituted).toEqual([]);
    await expect(pdfExport(ctx, mapState, deps, '')).rejects.toThrow();
    const boardCtx = await contextFor(base, {
      anonymise: false,
      excludeSigned: false,
      audience: board,
    });
    await expect(cardExport(boardCtx, deps)).rejects.toThrow();
  });
});

// -------------------------------------------------------------------- sweep

type Kind = 'png' | 'svg' | 'members' | 'network' | 'formalInformal' | 'table' | 'pdf' | 'card';
const KINDS: Kind[] = [
  'png',
  'svg',
  'members',
  'network',
  'formalInformal',
  'table',
  'pdf',
  'card',
];
/** Outputs a board may have. */
const BOARD: Kind[] = ['png', 'svg', 'network', 'pdf'];

async function produce(kind: Kind, ctx: ExportContext): Promise<string> {
  switch (kind) {
    case 'png':
      return pngText(ctx);
    case 'svg':
      return (await svgExport(ctx, mapState, deps, CAPTION)).text.replace(
        /<style>[\s\S]*?<\/style>/,
        '',
      );
    case 'members':
      return memberMetricsCsv(ctx).text;
    case 'network':
      return networkMetricsCsv(ctx).text;
    case 'formalInformal':
      return formalInformalCsv(ctx)?.text ?? '';
    case 'table':
      return metricsTableCsv(ctx, {
        order: IDS,
        metrics: DIRECTED_METRICS,
        fillKey: 'team',
        rank: null,
      }).text;
    case 'pdf': {
      const out = await pdfExport(ctx, mapState, deps, CAPTION);
      return `${out.fileName}\n${await pdfText(out.bytes)}\n${reportText(out.report).join('\n')}`;
    }
    case 'card':
      return (await cardExport(ctx, deps)).fileName;
  }
}

describe.each([
  [true, true],
  [true, false],
  [false, true],
  [false, false],
])(
  'audience sweep at board level: names hidden %s, signed layers left out %s',
  (anonymise, excludeSigned) => {
    it.each(KINDS)(
      '%s: offered exports name no member; the others are refused',
      async (kind) => {
        const ctx = await contextFor(base, {
          anonymise,
          excludeSigned,
          audience: board,
          grouping: { kind: 'attribute', key: 'level' },
        });
        if (!BOARD.includes(kind)) {
          await expect(produce(kind, ctx)).rejects.toThrow(audienceCopy.notOffered('board'));
          return;
        }
        const text = await produce(kind, ctx);
        expect(text.length).toBeGreaterThan(0);
        expect(membersIn(text)).toEqual([]);
        // Grouped by level: L1, L4 and L5 are below 5 members, so they are pooled, never shown.
        if (kind === 'network') {
          const rows = text.split('\r\n').map((r) => r.split(','));
          const groups = new Set(rows.flatMap((r) => [r[3], r[4]]));
          for (const small of ['L1', 'L4', 'L5']) expect(groups.has(small)).toBe(false);
          expect([...groups].some((g) => g?.includes('Other groups'))).toBe(true);
        } else {
          for (const small of ['L1', 'L4', 'L5'])
            expect(text).not.toMatch(new RegExp(`\\b${small}\\b`));
          expect(text).toContain('Other groups (8 members)');
        }
      },
      30_000,
    );
  },
);

describe('audience sweep counter-checks', () => {
  it('the analyst level names members, so the sweep can fail', async () => {
    const ctx = await contextFor(base, { anonymise: false, excludeSigned: false });
    expect(membersIn(pngText(ctx)).length).toBeGreaterThan(0);
    const report = buildReport(ctx, { notes: methodNotes(), now: deps.now, layerName: 'x' });
    expect(membersIn(reportText(report).join('\n')).length).toBeGreaterThan(0);
  });

  it('the member map itself is refused at board level', async () => {
    const ctx = await contextFor(base, { anonymise: false, excludeSigned: false, audience: board });
    expect(() => mapExport(ctx, mapState, deps, '')).toThrow();
    expect(documentText(pictureExport(ctx, mapState, deps, '').doc)).toContain(
      audienceCopy.board.key.area,
    );
  });

  it('a leadership report lists roles, naming only members who agreed', async () => {
    const result = await analysed(base, 'directed');
    const holder = leadershipRoles(result.insights)[0]?.member ?? '';
    const agreed = withAudience(base, { named_members: [holder] });
    const ctx = await contextFor(agreed, {
      anonymise: false,
      excludeSigned: false,
      audience: { level: 'leadership', team: null, member: null },
    });
    const text = reportText(
      buildReport(ctx, { notes: methodNotes(), now: deps.now, layerName: 'x' }),
    ).join('\n');
    expect(text).toContain(audienceCopy.rolesHeading);
    expect(membersIn(text)).toEqual([NAMES[IDS.indexOf(holder)]]);
  });

  it('a workshop export shows its team only, in codes unless the team agreed', async () => {
    const workshop = { level: 'workshop' as const, team: 'Finance', member: null };
    const ctx = await contextFor(withAudience(base, { level: 'workshop' }), {
      anonymise: false,
      excludeSigned: false,
      audience: workshop,
    });
    const csv = memberMetricsCsv(ctx).text;
    const finance = base.members.flatMap((m, i) => (m.attributes.team === 'Finance' ? [i] : []));
    for (const name of NAMES) expect(csv.includes(name)).toBe(false);
    for (const [i, code] of CODES.entries()) expect(csv.includes(code)).toBe(finance.includes(i));
    const named = await contextFor(
      withAudience(base, { level: 'workshop', named_teams: { team: ['Finance'] } }),
      { anonymise: false, excludeSigned: false, audience: workshop },
    );
    const png = pngText(named);
    for (const [i, name] of NAMES.entries()) {
      if (!finance.includes(i)) expect(png.includes(name)).toBe(false);
    }
    expect(finance.some((i) => png.includes(NAMES[i] ?? ''))).toBe(true);
  });

  it('pools the report’s groups for the Groups view’s grouping', async () => {
    const ctx = await contextFor(base, {
      anonymise: false,
      excludeSigned: false,
      audience: board,
      grouping: { kind: 'attribute', key: 'level' },
    });
    const groups = audienceGroups(
      ctx.project,
      ctx.result.refs[ctx.settings.layer],
      true,
      { kind: 'attribute', key: 'level' },
      ctx.policy,
    );
    expect(groups?.names).toEqual(['L2', 'L3', 'Other groups (8 members)']);
  });
});
