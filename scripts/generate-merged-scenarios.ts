// Generates five fictional scenario projects that each combine two or more of
// the conditions of scripts/generate-scenarios.ts, so that the issues found in
// docs/reports/initial-assessment.md can be studied where they compound
// (CLAUDE.md D139):
//   1. silent-leaders: partial response × asymmetric ratings. The partners and
//      one team lead did not respond, while their juniors rate them highly;
//   2. polite-dense-team: compressed ratings × dense team. A close team in which
//      most avoid the ends of each scale, with a part-timer and one strained
//      pair underneath;
//   3. merger-matrix: matrix organisation × post-merger. Functions from two
//      legacy organisations with different rating habits, work in mixed
//      programmes, conflict layers enabled;
//   4. single-team-shifts: large department × partial response × conflict. One
//      team value, three shifts, most of the night shift silent;
//   5. messy-survey: partial response × asymmetric × compressed, with a new
//      joiner and a negative pocket mostly hidden by response styles, coverage
//      just below the threshold.
// Deterministic like the demo: the same seed always writes the same file.
//
// Run with `npm run scenarios`. Output: src/demo/scenario-<slug>.ona.json (committed).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serialiseProject } from '../src/data/projectFile';
import type { Project } from '../src/data/schema';
import {
  build,
  clamp,
  CORE,
  fictional,
  isLine,
  LEVELS,
  names,
  scale3,
  scale5,
  scenarioFile,
  teams,
  TENURE,
  tools,
  type Person,
  type Ratings,
} from './scenario-kit';

const SCRIPT = 'scripts/generate-merged-scenarios.ts';
const CONFLICT = ['conflict_task', 'conflict_personal'];
const rank = (p: Person) => LEVELS.indexOf(p.level);

// ------------------------------------------------------------ 1. silent leaders

export const SILENT_SEED = 20261108;
const HERALDRY = [
  'Argent',
  'Azure',
  'Bendlet',
  'Chevron',
  'Fess',
  'Gules',
  'Lozenge',
  'Mullet',
  'Pallet',
  'Saltire',
  'Sable',
  'Tincture',
  'Vert',
  'Bordure',
  'Canton',
  'Escutcheon',
  'Gyron',
  'Roundel',
  'Purpure',
  'Tressure',
  'Annulet',
  'Billet',
];

export function silentLeaders(seed = SILENT_SEED): Project {
  const t = tools(seed);
  const people = teams(
    [
      ['Partners', 4],
      ['Advisory', 7],
      ['Analysis', 6],
      ['Operations', 5],
    ],
    HERALDRY,
    t,
    () => t.pick(['L1', 'L1', 'L2', 'L2', 'L3']),
  );
  const byId = new Map(people.map((p) => [p.id, p]));
  const get = (id: string) => byId.get(id) as Person;
  get('PAR01').level = 'L5';
  for (const id of ['PAR02', 'PAR03', 'PAR04']) {
    get(id).level = 'L4';
    get(id).manager = 'PAR01';
  }
  get('ADV01').manager = 'PAR02';
  get('ANA01').manager = 'PAR03';
  get('OPE01').manager = 'PAR04';
  for (const p of people) p.attributes = { location: 'Quarry Lane', tenure_band: t.pick(TENURE) };

  const silent = new Set(['PAR01', 'PAR02', 'PAR03', 'PAR04', 'ANA01']);
  const generous = 'ADV04';
  const harsh = 'ANA05';
  const area = new Map([
    ['Advisory', 'PAR02'],
    ['Analysis', 'PAR03'],
    ['Operations', 'PAR04'],
  ]);

  function strength(a: Person, b: Person): number {
    if (a.team === b.team) return 0.55 + (isLine(a, b) ? 0.2 : 0) + t.noise(0.15);
    if (a.team === 'Partners' || b.team === 'Partners') {
      const partner = a.team === 'Partners' ? a : b;
      const other = partner === a ? b : a;
      if (other.level === 'L4') return 0.7 + t.noise(0.1);
      // Operations depend on their partner for every sign-off.
      if (other.team === 'Operations' && partner.id === 'PAR04' && other === a) return 0.85;
      return area.get(other.team ?? '') === partner.id ? 0.3 + t.noise(0.1) : 0.1;
    }
    if (a.level === 'L4' && b.level === 'L4') return 0.5 + t.noise(0.1);
    return t.chance(0.35) ? 0.35 + t.noise(0.1) : Math.max(0, 0.06 + t.noise(0.06));
  }

  return build({
    title: 'Scenario: silent leaders (Quarry Lane Partners)',
    notes:
      fictional('silent-leaders', seed, SCRIPT) +
      'Partial response combined with asymmetric ratings. 22 members in four teams. The four ' +
      'partners (PAR01–PAR04) and the Analysis lead (ANA01) did not respond, so 17 of 22 ' +
      'did; colleagues rated them. Members two or more levels junior rate seniors higher ' +
      'than seniors would rate them; ADV04 rates every colleague generously and ANA05 ' +
      'harshly; Operations members depend on PAR04 for sign-off and rate them strongly, ' +
      'with no rating in return.',
    people,
    attributes: {
      team: ['Partners', 'Advisory', 'Analysis', 'Operations'],
      level: LEVELS,
      location: ['Quarry Lane'],
      tenure_band: TENURE,
    },
    layers: CORE,
    rate(a, b) {
      let s = strength(a, b);
      const gap = rank(b) - rank(a);
      if (gap >= 2) s += 0.25;
      if (gap <= -2) s -= 0.25;
      s = clamp(s, 0, 1);
      let valence = s < 0.15 ? 0 : clamp(Math.round(s * 3 + t.noise(0.6)), -1, 3);
      if (a.id === generous) {
        s = Math.max(s, 0.8 + t.noise(0.1));
        valence = t.chance(0.6) ? 3 : 2;
      }
      if (a.id === harsh) {
        s = Math.min(s * 0.4, 0.3);
        valence = t.chance(0.7) ? 0 : 1;
      }
      const r: Ratings = {
        connection_strength: scale5(s + t.noise(0.06)),
        valence,
        informal_collaboration: scale5(s * 0.8 + t.noise(0.1)),
        formal_collaboration: scale5(isLine(a, b) ? 1 : s * 0.75 + t.noise(0.08)),
      };
      return silent.has(a.id) ? {} : r;
    },
  });
}

// ------------------------------------------------------------ 2. polite dense team

export const POLITE_SEED = 20261109;
const MUSIC = [
  'Adagio',
  'Allegro',
  'Arpeggio',
  'Cadenza',
  'Coda',
  'Crescendo',
  'Fermata',
  'Glissando',
  'Largo',
  'Legato',
  'Ostinato',
  'Pizzicato',
  'Rondo',
  'Scherzo',
  'Sforzando',
  'Staccato',
  'Tremolo',
  'Vibrato',
  'Andante',
  'Presto',
];

export function politeDenseTeam(seed = POLITE_SEED): Project {
  const t = tools(seed);
  const people = teams(
    [
      ['Product', 3],
      ['Engineering', 9],
      ['Design', 4],
      ['Research', 4],
    ],
    MUSIC,
    t,
    () => t.pick(['L2', 'L2', 'L3']),
  );
  const byId = new Map(people.map((p) => [p.id, p]));
  const head = byId.get('PRO01') as Person;
  for (const p of people) {
    p.attributes = { location: 'Cadence House', tenure_band: t.pick(TENURE) };
    if (p.team !== 'Engineering' && p !== head) p.manager = head.id;
  }
  (byId.get('ENG01') as Person).manager = head.id;

  const partTimer = 'RES04';
  const strained = new Set(['ENG03', 'DES02']);
  const sameAnswer = new Set(['PRO03', 'ENG05', 'ENG08', 'DES03']);
  const fullScale = new Set(['PRO01', 'ENG01', 'DES02', 'RES01']);
  const compress = (v: number) => clamp(Math.round(2 + v * 2 + t.noise(0.35)), 2, 4);

  return build({
    title: 'Scenario: polite dense team (Cadence Product Team)',
    notes:
      fictional('polite-dense-team', seed, SCRIPT) +
      'Compressed ratings combined with a dense team. 20 members of one product team who ' +
      'all work closely together. Twelve respondents avoid both ends of every scale (2 to 4, ' +
      `and 0 to +2 on valence); ${[...sameAnswer].join(', ')} give everyone 4 and +2; only ` +
      `${[...fullScale].join(', ')} use the whole scale. Underneath: ${partTimer} works part ` +
      'time and is much less connected than the rest, and ENG03 and DES02 have a strained ' +
      'relationship that only DES02, a full-scale rater, reports as negative.',
    people,
    attributes: {
      team: ['Product', 'Engineering', 'Design', 'Research'],
      level: LEVELS,
      location: ['Cadence House'],
      tenure_band: TENURE,
    },
    layers: CORE,
    rate(a, b) {
      let s = 0.72 + t.noise(0.1) + (a.team === b.team ? 0.08 : 0) + (isLine(a, b) ? 0.12 : 0);
      if (a.id === partTimer || b.id === partTimer) s = 0.3 + t.noise(0.1);
      s = clamp(s, 0, 1);
      const affect =
        strained.has(a.id) && strained.has(b.id) ? -0.7 : clamp(s + t.noise(0.2), 0, 1);
      if (sameAnswer.has(a.id)) {
        return {
          connection_strength: 4,
          valence: 2,
          informal_collaboration: 4,
          formal_collaboration: 4,
        };
      }
      if (fullScale.has(a.id)) {
        return {
          connection_strength: scale5(s + t.noise(0.05)),
          valence: scale3(affect),
          informal_collaboration: scale5(s * 0.85 + t.noise(0.1)),
          formal_collaboration: scale5(s * 0.9 + t.noise(0.08)),
        };
      }
      return {
        connection_strength: compress(s),
        valence: clamp(Math.round(affect * 2 + 0.3), 0, 2),
        informal_collaboration: compress(s * 0.85),
        formal_collaboration: compress(s * 0.9),
      };
    },
  });
}

// ------------------------------------------------------------ 3. merger matrix

export const MERGER_MATRIX_SEED = 20261110;
const CLOTH = [
  'Bobbin',
  'Calico',
  'Damask',
  'Selvedge',
  'Warpthread',
  'Weft',
  'Shuttle',
  'Heddle',
  'Loomwork',
  'Tweed',
  'Twill',
  'Chintz',
  'Gingham',
  'Muslin',
  'Organza',
  'Percale',
  'Poplin',
  'Sateen',
  'Seersucker',
  'Taffeta',
  'Velour',
  'Worsted',
  'Brocade',
  'Chambray',
  'Corduroy',
  'Flannel',
  'Gabardine',
  'Jacquard',
  'Madras',
  'Merino',
  'Nankeen',
  'Tartan',
  'Voile',
  'Crewel',
];
const PROGRAMMES = ['Harbour', 'Lighthouse', 'Pier'];
const LEGACY = ['Eastgate', 'Westmoor'];

export function mergerMatrix(seed = MERGER_MATRIX_SEED): Project {
  const t = tools(seed);
  const people = teams(
    [
      ['People', 3],
      ['Engineering', 10],
      ['Product', 7],
      ['Sales', 8],
      ['Finance', 6],
    ],
    CLOTH,
    t,
    () => t.pick(['L1', 'L2', 'L2', 'L3']),
  );
  const head = people[0] as Person;
  head.level = 'L5';
  for (const p of people) if (p.level === 'L4') p.manager = head.id;
  // Engineering and Product came mostly from Eastgate, Sales and Finance mostly
  // from Westmoor; People from both. Programmes mix functions and legacies.
  const eastShare: Record<string, number> = {
    People: 0.5,
    Engineering: 0.8,
    Product: 0.75,
    Sales: 0.25,
    Finance: 0.2,
  };
  const within = new Map<string, number>();
  people.forEach((p, i) => {
    const k = within.get(p.team ?? '') ?? 0;
    within.set(p.team ?? '', k + 1);
    const size = people.filter((q) => q.team === p.team).length;
    p.attributes = {
      legacy_org: k < Math.round((eastShare[p.team ?? ''] ?? 0.5) * size) ? 'Eastgate' : 'Westmoor',
      programme: p.level === 'L4' || p.level === 'L5' ? null : (PROGRAMMES[i % 3] as string),
      location: t.pick(['Eastgate site', 'Westmoor site']),
      tenure_band: t.pick(TENURE.slice(1)),
    };
  });
  const legacy = (p: Person) => p.attributes.legacy_org;
  const programme = (p: Person) => p.attributes.programme;

  function strength(a: Person, b: Person): number {
    const sameLegacy = legacy(a) === legacy(b);
    if (programme(a) && programme(a) === programme(b)) {
      return 0.55 + (sameLegacy ? 0.1 : -0.05) + t.noise(0.12);
    }
    if (a.team === b.team) return (isLine(a, b) ? 0.55 : 0.25) + t.noise(0.08);
    if (a.level !== 'L1' && b.level !== 'L1' && (a.level === 'L4' || b.level === 'L4')) {
      return 0.35 + t.noise(0.1);
    }
    return sameLegacy && t.chance(0.25) ? 0.3 : Math.max(0, 0.04 + t.noise(0.04));
  }

  return build({
    title: 'Scenario: merger matrix (Loomwell Group)',
    notes:
      fictional('merger-matrix', seed, SCRIPT) +
      'A matrix organisation combined with a post-merger company. 34 members. The team ' +
      'attribute holds the function; Engineering and Product came mostly from Eastgate, Sales ' +
      'and Finance mostly from Westmoor (legacy_org). Members below lead level work in three ' +
      'programmes (Harbour, Lighthouse, Pier) that mix functions and legacies; ties within a ' +
      'programme are stronger between people from the same legacy organisation. Eastgate ' +
      'respondents rate generously and Westmoor respondents harshly, by about one scale ' +
      'point. Task disagreement arises inside programmes across the legacy line; personal ' +
      'friction arises inside functions across the legacy line (the conflict layers are ' +
      'enabled). Every rating was given.',
    people,
    attributes: {
      team: ['People', 'Engineering', 'Product', 'Sales', 'Finance'],
      level: LEVELS,
      location: ['Eastgate site', 'Westmoor site'],
      tenure_band: TENURE,
      legacy_org: LEGACY,
      programme: PROGRAMMES,
    },
    extraAttributes: [
      { key: 'legacy_org', label: 'Legacy organisation', type: 'categorical', builtin: false },
      { key: 'programme', label: 'Programme', type: 'categorical', builtin: false },
    ],
    enable: CONFLICT,
    layers: [...CORE, ...CONFLICT],
    rate(a, b) {
      const s = clamp(strength(a, b), 0, 1);
      const bias = legacy(a) === 'Eastgate' ? 0.15 : -0.15;
      const rated = (v: number) => scale5(v > 0.02 ? v + bias : v);
      const crossLegacy = legacy(a) !== legacy(b);
      const sameProgramme = !!programme(a) && programme(a) === programme(b);
      return {
        connection_strength: rated(s + t.noise(0.06)),
        valence: s < 0.1 ? 0 : scale3(clamp(s + bias + t.noise(0.3), -0.3, 1)),
        informal_collaboration: rated(s * (crossLegacy ? 0.55 : 0.9) + t.noise(0.08)),
        formal_collaboration: rated(
          isLine(a, b) ? 0.8 : sameProgramme ? 0.75 : a.team === b.team ? 0.45 : s * 0.5,
        ),
        conflict_task: scale5(sameProgramme && crossLegacy ? 0.5 + t.noise(0.15) : s * 0.1),
        conflict_personal: scale5(
          a.team === b.team && crossLegacy && !isLine(a, b) ? 0.45 + t.noise(0.15) : 0,
        ),
      };
    },
  });
}

// ------------------------------------------------------------ 4. single team, shifts

export const SHIFTS_SEED = 20261111;
const PLANTS = [
  'Acanthus',
  'Agrimony',
  'Betony',
  'Bindweed',
  'Bracken',
  'Bugloss',
  'Burdock',
  'Campion',
  'Celandine',
  'Chickweed',
  'Clubmoss',
  'Comfrey',
  'Cowslip',
  'Dropwort',
  'Eyebright',
  'Fescue',
  'Feverfew',
  'Figwort',
  'Fleabane',
  'Foxglove',
  'Fumitory',
  'Goldenrod',
  'Gorse',
  'Groundsel',
  'Hellebore',
  'Henbane',
  'Hogweed',
  'Horsetail',
  'Knapweed',
  'Lungwort',
  'Madder',
  'Mallow',
  'Meadowsweet',
  'Milkwort',
  'Mugwort',
  'Oxlip',
  'Ragwort',
  'Sainfoin',
  'Samphire',
  'Sanicle',
  'Speedwell',
  'Spurge',
  'Stitchwort',
  'Tansy',
  'Teasel',
  'Toadflax',
  'Tormentil',
  'Woodruff',
];
const SHIFTS = ['Day', 'Evening', 'Night'];

export function singleTeamShifts(seed = SHIFTS_SEED): Project {
  const t = tools(seed);
  const n = 48;
  const pool = names(n, PLANTS, t);
  // Seats 0–17 Day, 18–35 Evening, 36–47 Night; pods of six seats. The manager
  // sits at seat 0; two supervisors per shift at the start of their first two pods.
  const shiftOf = (i: number) => (i < 18 ? 'Day' : i < 36 ? 'Evening' : 'Night');
  const supervisors = [1, 7, 18, 24, 36, 42];
  const people: Person[] = Array.from({ length: n }, (_, i) => ({
    id: `CC${String(i + 1).padStart(2, '0')}`,
    name: pool[i] ?? '',
    team: 'Contact Centre',
    level: i === 0 ? 'L4' : supervisors.includes(i) ? 'L2' : 'L1',
    manager: null,
    attributes: { location: 'Lantern Street', tenure_band: t.pick(TENURE), shift: shiftOf(i) },
  }));
  const seat = new Map(people.map((p, i) => [p.id, i]));
  const id = (i: number) => (people[i] as Person).id;
  people.forEach((p, i) => {
    if (i === 0) return;
    if (supervisors.includes(i)) p.manager = id(0);
    else {
      const own = supervisors.filter((s) => shiftOf(s) === shiftOf(i));
      p.manager = id((i % 2 === 0 ? own[0] : own[1]) as number);
    }
  });
  const nightSilent = new Set(
    people
      .filter((p, i) => shiftOf(i) === 'Night' && p.level === 'L1')
      .slice(0, 8)
      .map((p) => p.id),
  );
  const partial = 'CC12';
  const adjacent = (x: string, y: string) =>
    (x === 'Day' && y === 'Evening') ||
    (x === 'Evening' && y === 'Day') ||
    (x === 'Evening' && y === 'Night') ||
    (x === 'Night' && y === 'Evening');

  function strength(a: Person, b: Person): number {
    const i = seat.get(a.id) as number;
    const j = seat.get(b.id) as number;
    const sa = a.attributes.shift as string;
    const sb = b.attributes.shift as string;
    if (isLine(a, b)) return 0.7 + t.noise(0.1);
    if (a.level !== 'L1' && b.level !== 'L1') return 0.6 + t.noise(0.1);
    if (sa === sb) {
      if (Math.floor(i / 6) === Math.floor(j / 6)) return 0.7 + t.noise(0.15);
      return t.chance(0.4) ? 0.3 + t.noise(0.1) : 0;
    }
    // Handover: the ends of adjacent shifts meet briefly.
    if (adjacent(sa, sb)) return t.chance(0.12) ? 0.3 : 0;
    return 0;
  }

  return build({
    title: 'Scenario: single team on shifts (Lantern Street Contact Centre)',
    notes:
      fictional('single-team-shifts', seed, SCRIPT) +
      'A large department without teams combined with partial response and conflict layers. ' +
      '48 members, all with the team value Contact Centre; the shift attribute holds Day ' +
      '(18), Evening (18) and Night (12). Ties follow pods of six seats within a shift, two ' +
      'supervisors per shift and brief handovers between adjacent shifts. Eight of the ten ' +
      `Night agents (${[...nightSilent].join(', ')}) did not respond, and ${partial} ` +
      'answered about half. Colleagues a respondent did not know were recorded as 0 on the ' +
      'scaled layers and as “does not apply” on valence. Task disagreement arises at ' +
      'handover between shifts; personal friction within pods (the conflict layers are ' +
      'enabled).',
    people,
    attributes: {
      team: ['Contact Centre'],
      level: LEVELS,
      location: ['Lantern Street'],
      tenure_band: TENURE,
      shift: SHIFTS,
    },
    extraAttributes: [{ key: 'shift', label: 'Shift', type: 'categorical', builtin: false }],
    enable: CONFLICT,
    layers: [...CORE, ...CONFLICT],
    rate(a, b) {
      if (nightSilent.has(a.id)) return {};
      if (a.id === partial && t.chance(0.5)) return {};
      const s = clamp(strength(a, b), 0, 1);
      const handover = a.attributes.shift !== b.attributes.shift && s > 0;
      const connection = scale5(s + t.noise(0.05));
      if (connection === 0) {
        return {
          connection_strength: 0,
          valence: 'na',
          informal_collaboration: 0,
          formal_collaboration: 0,
          conflict_task: 0,
          conflict_personal: 0,
        };
      }
      return {
        connection_strength: connection,
        valence: clamp(Math.round(s * 3 + t.noise(0.8)), -1, 3),
        informal_collaboration: scale5(s * 0.85 + t.noise(0.1)),
        formal_collaboration: scale5(isLine(a, b) ? 0.8 : s * 0.6 + t.noise(0.05)),
        conflict_task: scale5(handover ? 0.5 + t.noise(0.1) : s * 0.15),
        conflict_personal: scale5(s > 0.6 && t.chance(0.15) ? 0.5 : 0),
      };
    },
  });
}

// ------------------------------------------------------------ 5. messy survey

export const MESSY_SEED = 20261112;
const BUILDING = [
  'Abacus',
  'Architrave',
  'Baluster',
  'Buttress',
  'Capital',
  'Corbel',
  'Cornice',
  'Cupola',
  'Dentil',
  'Entablature',
  'Finial',
  'Frieze',
  'Gable',
  'Keystone',
  'Lintel',
  'Mullion',
  'Narthex',
  'Oculus',
  'Parapet',
  'Pediment',
  'Pilaster',
  'Plinth',
  'Quoin',
  'Spandrel',
  'Transom',
  'Voussoir',
];

export function messySurvey(seed = MESSY_SEED): Project {
  const t = tools(seed);
  const people = teams(
    [
      ['Clinic', 9],
      ['Labs', 8],
      ['Admin', 9],
    ],
    BUILDING,
    t,
    () => t.pick(['L1', 'L1', 'L2', 'L2', 'L3']),
  );
  const head = people[0] as Person;
  head.level = 'L5';
  for (const p of people) {
    if (p.level === 'L4') p.manager = head.id;
    p.attributes = {
      location: t.pick(['Main site', 'Annexe']),
      tenure_band: t.pick(TENURE.slice(1)),
    };
  }
  const newJoiner = people.find((p) => p.id === 'ADM09') as Person;
  newJoiner.attributes = { location: 'Main site', tenure_band: 'Under 1 year' };

  const silent = new Set(['CLI08', 'LAB06', 'ADM04']);
  const partial = new Set(['CLI02', 'LAB03', 'ADM07']);
  const compressed = new Set([
    'CLI04',
    'CLI06',
    'CLI09',
    'LAB02',
    'LAB05',
    'LAB08',
    'ADM02',
    'ADM05',
  ]);
  const sameAnswer = new Set(['LAB07', 'ADM06']);
  const generous = 'ADM03';
  const harsh = 'LAB04';
  // Four Clinic members in strained relationships with one another.
  const pocket = new Set(['CLI03', 'CLI05', 'CLI06', 'CLI08']);
  const declined = new Set([
    'CLI07>LAB01',
    'LAB02>ADM08',
    'ADM01>CLI05',
    'CLI09>ADM02',
    'LAB08>CLI01',
  ]);
  const compress = (v: number) => clamp(Math.round(2 + v * 2 + t.noise(0.35)), 2, 4);

  function strength(a: Person, b: Person): number {
    if (a === newJoiner || b === newJoiner) return isLine(a, b) ? 0.45 : 0;
    if (a.team === b.team) return 0.6 + (isLine(a, b) ? 0.2 : 0) + t.noise(0.15);
    if (a.level === 'L4' || b.level === 'L4' || a.level === 'L5' || b.level === 'L5') {
      return 0.4 + t.noise(0.1);
    }
    const pair = new Set([a.team, b.team]);
    if (pair.has('Clinic') && pair.has('Labs')) return t.chance(0.5) ? 0.4 : 0.1;
    return t.chance(0.25) ? 0.3 : Math.max(0, 0.05 + t.noise(0.05));
  }

  return build({
    title: 'Scenario: messy survey (Lindenfield Practice)',
    notes:
      fictional('messy-survey', seed, SCRIPT) +
      'Partial response, asymmetric ratings and compressed ratings together, with a new ' +
      `joiner. 26 members in three teams. ${[...silent].join(', ')} did not respond and ` +
      `${[...partial].join(', ')} answered about a third, so coverage sits just below the 80 % ` +
      `threshold. Response styles: ${[...compressed].join(', ')} avoid both ends of every ` +
      `scale; ${[...sameAnswer].join(', ')} give everyone 3 and +1; ${generous} rates ` +
      `generously and ${harsh} harshly; the rest use the whole scale. Members two or more ` +
      'levels junior rate seniors higher than seniors rate them. CLI03, CLI05, CLI06 and ' +
      'CLI08 have strained relationships with one another, but CLI06 never gives a negative ' +
      'rating and CLI08 did not respond. ADM09 joined last week, knows only their manager and ' +
      'marked valence “does not apply” for everyone else, as everyone else did for them. ' +
      'Five valence ratings were declined, and about 8 % of informal collaboration ratings ' +
      'are missing.',
    people,
    attributes: {
      team: ['Clinic', 'Labs', 'Admin'],
      level: LEVELS,
      location: ['Annexe', 'Main site'],
      tenure_band: TENURE,
    },
    layers: CORE,
    rate(a, b) {
      let s = strength(a, b);
      const gap = rank(b) - rank(a);
      if (gap >= 2) s += 0.2;
      if (gap <= -2) s -= 0.2;
      s = clamp(s, 0, 1);
      const unknown = (a === newJoiner || b === newJoiner) && !isLine(a, b);
      const strained = pocket.has(a.id) && pocket.has(b.id);
      const affect = strained ? -0.7 : s < 0.15 ? 0 : clamp(s + t.noise(0.25), 0, 1);
      const formal = isLine(a, b) ? 1 : a.team === b.team ? 0.6 + t.noise(0.12) : s * 0.6;
      let r: Ratings;
      if (sameAnswer.has(a.id)) {
        r = {
          connection_strength: 3,
          valence: 1,
          informal_collaboration: 3,
          formal_collaboration: 3,
        };
      } else if (compressed.has(a.id)) {
        r = {
          connection_strength: compress(s),
          valence: clamp(Math.round(affect * 2 + 0.3), 0, 2),
          informal_collaboration: compress(s * 0.85),
          formal_collaboration: compress(formal),
        };
      } else {
        if (a.id === generous) s = Math.max(s, 0.8 + t.noise(0.1));
        if (a.id === harsh) s = Math.min(s * 0.4, 0.3);
        r = {
          connection_strength: scale5(s + t.noise(0.06)),
          valence: a.id === generous ? 3 : a.id === harsh ? 0 : scale3(affect + t.noise(0.1)),
          informal_collaboration: scale5(s * 0.85 + t.noise(0.1)),
          formal_collaboration: scale5(formal),
        };
      }
      if (unknown) r.valence = 'na';
      if (declined.has(`${a.id}>${b.id}`)) r.valence = null;
      if (silent.has(a.id)) return {};
      if (partial.has(a.id) && t.chance(0.65)) return {};
      if (t.chance(0.08)) delete r.informal_collaboration;
      return r;
    },
  });
}

// ------------------------------------------------------------ output

export const MERGED_SCENARIOS: readonly { slug: string; generate: () => Project }[] = [
  { slug: 'silent-leaders', generate: () => silentLeaders() },
  { slug: 'polite-dense-team', generate: () => politeDenseTeam() },
  { slug: 'merger-matrix', generate: () => mergerMatrix() },
  { slug: 'single-team-shifts', generate: () => singleTeamShifts() },
  { slug: 'messy-survey', generate: () => messySurvey() },
];

const isMain = process.argv[1]?.endsWith('generate-merged-scenarios.ts') ?? false;
if (isMain) {
  for (const { slug, generate } of MERGED_SCENARIOS) {
    const out = join(import.meta.dirname, '..', 'src', 'demo', scenarioFile(slug));
    writeFileSync(out, serialiseProject(generate()));
    console.log(`Wrote ${out}`);
  }
}
