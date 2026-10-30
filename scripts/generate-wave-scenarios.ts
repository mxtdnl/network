// Generates the two-wave scenario project (build plan session 14): the same
// survey run twice, six months apart, in an organisation that changed between
// the waves. It is test data for repeating a survey and analysing any wave, and
// for session 15's comparison of waves:
//   - wave 1: four teams; Support works mostly within itself and reaches the
//     rest through SUP01 and through BRI01, a coordinator in Build, who is the
//     main route between Support and Sales;
//   - between the waves, BRI01 and one member of Sales leave (they stay in the
//     project, off the wave 2 roster, so their wave 1 ratings are kept), and
//     three people join (two in Support, one in Sales), on the wave 2 roster only;
//   - wave 2: a joint programme between Build and Support has started, so ties
//     between them grow, while Support's route to Sales has thinned with BRI01 gone;
//   - coverage: wave 1 has one member who gave no ratings; in wave 2 one joiner
//     gave none and one member answered about half the survey.
// Who was on each roster is recorded in settings.waves. Deterministic like the
// demo: the same seed always writes the same file.
//
// Run with `npm run scenarios`. Output: src/demo/scenario-two-waves.ona.json (committed).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serialiseProject } from '../src/data/projectFile';
import type { Project, Tie } from '../src/data/schema';
import {
  build,
  clamp,
  CORE,
  fictional,
  LEVELS,
  numbered,
  prefix,
  scale3,
  scale5,
  scenarioFile,
  teams,
  TENURE,
  tools,
  type Person,
  type Ratings,
} from './scenario-kit';

const SCRIPT = 'scripts/generate-wave-scenarios.ts';

export const TWO_WAVES_SEED = 20261113;
const ORCHARD = [
  'Apple',
  'Blossom',
  'Bramley',
  'Cider',
  'Damson',
  'Espalier',
  'Graft',
  'Greengage',
  'Harvest',
  'Hedgerow',
  'Kernel',
  'Ladder',
  'Medlar',
  'Mulch',
  'Nectar',
  'Orchard',
  'Pippin',
  'Pollen',
  'Pruner',
  'Quince',
  'Rootstock',
  'Russet',
  'Sapling',
  'Scion',
  'Seedling',
  'Sloe',
  'Spur',
  'Stone',
  'Thinning',
  'Trellis',
  'Wassail',
  'Windfall',
  'Yield',
  'Zest',
  'Bough',
  'Cordon',
];

const TEAM_SIZES = [
  ['Design', 8],
  ['Build', 9],
  ['Support', 8],
  ['Sales', 7],
] as const;

/** The broker who leaves between the waves. */
export const BROKER = 'BRI01';

export function twoWaves(seed = TWO_WAVES_SEED): Project {
  const t = tools(seed);
  const people = teams(TEAM_SIZES, ORCHARD, t, () => t.pick(LEVELS.slice(0, 3)));
  for (const p of people) {
    p.attributes = { location: t.pick(['North', 'South']), tenure_band: t.pick(TENURE) };
  }
  // The coordinator in Build who links Support and Sales in wave 1.
  const broker: Person = {
    id: BROKER,
    name: '',
    team: 'Build',
    level: 'L3',
    manager: 'BUI01',
    attributes: { location: 'North', tenure_band: '3 to 5 years' },
  };
  // Three joiners, numbered after their teams' members.
  const joiners: Person[] = [
    ['Support', 9],
    ['Support', 10],
    ['Sales', 8],
  ].map(([team, k]) => ({
    id: numbered(prefix(team as string), k as number),
    name: '',
    team: team as string,
    level: 'L1',
    manager: `${prefix(team as string)}01`,
    attributes: { location: 'South', tenure_band: 'Under 1 year' },
  }));
  const pool = ORCHARD.slice(people.length);
  broker.name = `Rowan ${pool[0] ?? ''}`;
  joiners.forEach((j, i) => {
    j.name = `${['Indra', 'Lucia', 'Tomasz'][i] ?? ''} ${pool[i + 1] ?? ''}`;
  });
  const all = [...people, broker, ...joiners];
  const leaver = people.find((p) => p.id === 'SAL07') as Person;
  const wave1 = new Set([...people, broker].map((p) => p.id));
  const wave2 = new Set(all.filter((p) => p !== broker && p !== leaver).map((p) => p.id));

  const silent1 = new Set(['DES06']);
  const silent2 = new Set([joiners[0]?.id ?? '']);
  const partial2 = new Set(['BUI05']);

  /** Base tie strength in a wave, before each rater's own noise. */
  const strength = (a: Person, b: Person, wave: 1 | 2): number => {
    const pair = new Set([a.team, b.team]);
    if (a.id === BROKER || b.id === BROKER) {
      const other = a.id === BROKER ? b : a;
      return other.team === 'Support' || other.team === 'Sales' ? 0.75 : 0.55;
    }
    if (a.team === b.team) return a.team === 'Support' ? 0.8 : 0.6;
    if (pair.has('Support')) {
      // Support's gateway, SUP01, is tied to the rest in both waves.
      if (a.id === 'SUP01' || b.id === 'SUP01') return 0.45;
      // The joint programme between Build and Support (wave 2).
      if (pair.has('Build')) return wave === 2 ? 0.5 : 0.08;
      return 0.04;
    }
    if (pair.has('Design') && pair.has('Build')) return 0.45;
    if (pair.has('Sales')) return 0.2;
    return 0.15;
  };

  const rate =
    (wave: 1 | 2) =>
    (a: Person, b: Person): Ratings => {
      const roster = wave === 1 ? wave1 : wave2;
      if (!roster.has(a.id) || !roster.has(b.id)) return {};
      if ((wave === 1 ? silent1 : silent2).has(a.id)) return {};
      if (wave === 2 && partial2.has(a.id) && t.chance(0.5)) return {};
      const s = clamp(strength(a, b, wave) + t.noise(0.18), 0, 1);
      // Weak pairs report no tie, so the network is not uniformly dense.
      const tie = (v: number) => (v < 0.3 ? 0 : scale5(v));
      const formal = a.manager === b.id || b.manager === a.id ? 1 : a.team === b.team ? 0.55 : 0.1;
      return {
        connection_strength: tie(s),
        valence: s < 0.3 ? 0 : scale3(clamp(s + t.noise(0.3), -0.2, 1)),
        informal_collaboration: tie(s * 0.9 + t.noise(0.1)),
        formal_collaboration: tie(formal + t.noise(0.08)),
      };
    };

  const project = build({
    title: 'Two waves (fictional scenario)',
    notes:
      fictional('two-waves', seed, SCRIPT) +
      'The same survey run twice, six months apart. In wave 1, Support works mostly within ' +
      'itself and reaches the rest through SUP01 and through BRI01, a coordinator in Build who ' +
      'is the main route between Support and Sales. Between the waves BRI01 and SAL07 left ' +
      '(off the wave 2 roster, their wave 1 ratings kept) and SUP09, SUP10 and SAL08 joined ' +
      '(on the wave 2 roster only). In wave 2 a joint programme ties Build and Support more ' +
      'closely. DES06 gave no ratings in wave 1; in wave 2 SUP09 gave none and BUI05 answered ' +
      'about half the survey. The rosters of both waves are recorded.',
    people: all,
    attributes: {
      team: TEAM_SIZES.map(([team]) => team),
      level: LEVELS,
      location: ['North', 'South'],
      tenure_band: TENURE,
    },
    layers: CORE,
    rate: rate(1),
  });

  // Wave 2: the same questions, on the wave 2 roster.
  const second: Tie[] = [];
  const rate2 = rate(2);
  for (const a of all) {
    for (const b of all) {
      if (a.id === b.id) continue;
      const r = rate2(a, b);
      for (const variable of CORE) {
        const value = r[variable];
        if (value === undefined) continue;
        second.push({
          rater_id: a.id,
          ratee_id: b.id,
          variable,
          value: value === 'na' ? null : value,
          wave: 2,
          source: 'imported',
        });
      }
    }
  }
  project.ties = [...project.ties, ...second];
  const order = project.members.map((m) => m.id);
  project.settings.waves = [
    { wave: 1, roster: order.filter((id) => wave1.has(id)) },
    { wave: 2, roster: order.filter((id) => wave2.has(id)) },
  ];
  return project;
}

export const WAVE_SCENARIOS: readonly { slug: string; generate: () => Project }[] = [
  { slug: 'two-waves', generate: () => twoWaves() },
];

const isMain = process.argv[1]?.endsWith('generate-wave-scenarios.ts') ?? false;
if (isMain) {
  for (const { slug, generate } of WAVE_SCENARIOS) {
    const out = join(import.meta.dirname, '..', 'src', 'demo', scenarioFile(slug));
    writeFileSync(out, serialiseProject(generate()));
    console.log(`Wrote ${out}`);
  }
}
