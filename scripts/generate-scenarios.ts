// Generates seven fictional scenario projects that model the constraints of
// real survey data, for testing and for trying the tool on something other
// than the demo (CLAUDE.md D138). Each is built to contain one condition:
//   1. partial-response: 15 of 18 members responded, one of the three missing
//      being the hub of their team, and one respondent stopped halfway;
//   2. asymmetric-ratings: colleagues rate each other differently (seniority,
//      one generous and one harsh rater, unreciprocated warmth, one-way reliance);
//   3. compressed-ratings: most respondents avoid the ends of each scale and
//      three give every colleague the same answer;
//   4. matrix-organisation: functions (the team attribute) and programmes cut
//      across each other, and work follows the programme;
//   5. large-department: 64 people with one team value and no distinct teams,
//      ties following seating, shifts and supervisors;
//   6. dense-team: 18 people who all work closely with one another;
//   7. post-merger: two legacy organisations with different rating habits, an
//      integration lead much sought for advice, a new joiner, energy and
//      conflict layers, and lower response from one legacy organisation.
// Like the demo (scripts/generate-demo.ts) each is deterministic: the same
// seed always writes the same file. Names pair first names with terms from a
// different field per scenario, so none can be taken for a real person.
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

// ------------------------------------------------------------ 1. partial response

export const PARTIAL_SEED = 20261101;
const NAUTICAL = [
  'Ballast',
  'Bowline',
  'Capstan',
  'Davit',
  'Gunwale',
  'Halyard',
  'Jetty',
  'Keelson',
  'Lanyard',
  'Mooring',
  'Pilotage',
  'Quayside',
  'Rigging',
  'Slipway',
  'Tiller',
  'Wharfage',
  'Anchorage',
  'Buoyage',
];

export function partialResponse(seed = PARTIAL_SEED): Project {
  const t = tools(seed);
  const people = teams(
    [
      ['Hydrography', 6],
      ['Charting', 6],
      ['Field Operations', 6],
    ],
    NAUTICAL,
    t,
    () => t.pick(['L1', 'L2', 'L2', 'L3']),
  );
  const head = people[0] as Person;
  head.level = 'L5';
  for (const p of people) {
    if (p.level === 'L4') p.manager = head.id;
    p.attributes = {
      location: t.pick(['Harbour office', 'Survey vessel']),
      tenure_band: t.pick(TENURE),
    };
  }
  // The Field Operations lead is the hub of the unit and did not respond.
  const hub = 'FIE01';
  const nonResponders = new Set([hub, 'FIE04', 'CHA05']);
  const stoppedHalfway = 'HYD06';
  const declined = new Set(['HYD03>CHA02', 'CHA04>FIE05', 'FIE02>HYD05', 'CHA06>HYD02']);

  function strength(a: Person, b: Person): number {
    if (b.id === hub) return a.team === 'Field Operations' ? 0.95 : 0.7 + t.noise(0.1);
    if (a.team === b.team) return clamp(0.6 + (isLine(a, b) ? 0.2 : 0) + t.noise(0.2), 0, 1);
    if (a.level === 'L4' && b.level === 'L4') return 0.5 + t.noise(0.1);
    const pair = new Set([a.team, b.team]);
    if (pair.has('Hydrography') && pair.has('Field Operations')) return t.chance(0.4) ? 0.4 : 0.1;
    return Math.max(0, 0.08 + t.noise(0.08));
  }

  return build({
    title: 'Scenario: partial response (Harbour Survey Unit)',
    notes:
      fictional('partial-response', seed) +
      `18 members in three teams; 15 responded in full. ${[...nonResponders].join(', ')} did not ` +
      `respond, so they rated nobody, although colleagues rated them; ${hub}, the Field ` +
      `Operations lead, is the most connected member of the unit. ${stoppedHalfway} stopped ` +
      `after rating the first eight colleagues in the roster. Four valence ratings were declined.`,
    people,
    attributes: {
      team: ['Hydrography', 'Charting', 'Field Operations'],
      level: LEVELS,
      location: ['Harbour office', 'Survey vessel'],
      tenure_band: TENURE,
    },
    layers: CORE,
    rate(a, b) {
      const s = strength(a, b);
      const r: Ratings = {
        connection_strength: scale5(s + t.noise(0.08)),
        valence: declined.has(`${a.id}>${b.id}`)
          ? null
          : s < 0.15
            ? 0
            : clamp(Math.round(s * 3.2 + t.noise(0.7)), -1, 3),
        informal_collaboration: scale5(s * 0.85 + t.noise(0.1)),
        formal_collaboration: scale5(isLine(a, b) ? 1 : a.team === b.team ? 0.6 : s * 0.7),
      };
      if (nonResponders.has(a.id)) return {};
      if (a.id === stoppedHalfway) {
        const rated = people.filter((q) => q.id !== a.id).slice(0, 8);
        if (!rated.some((q) => q.id === b.id)) return {};
      }
      return r;
    },
  });
}

// ------------------------------------------------------------ 2. asymmetric ratings

export const ASYMMETRIC_SEED = 20261102;
const TYPE_TERMS = [
  'Ascender',
  'Baseline',
  'Colophon',
  'Dingbat',
  'Emspace',
  'Folio',
  'Glyph',
  'Hairline',
  'Italic',
  'Kerning',
  'Ligature',
  'Majuscule',
  'Octavo',
  'Pica',
  'Quire',
  'Recto',
  'Serif',
  'Tittle',
  'Verso',
  'Woodtype',
];

export function asymmetricRatings(seed = ASYMMETRIC_SEED): Project {
  const t = tools(seed);
  const people = teams(
    [
      ['Leadership', 3],
      ['Design', 7],
      ['Engineering', 6],
      ['Client Services', 4],
    ],
    TYPE_TERMS,
    t,
    () => t.pick(['L1', 'L1', 'L2', 'L2', 'L3']),
  );
  const byId = new Map(people.map((p) => [p.id, p]));
  const director = byId.get('LEA01') as Person;
  director.level = 'L5';
  (byId.get('LEA02') as Person).manager = director.id;
  (byId.get('LEA03') as Person).manager = director.id;
  (byId.get('DES01') as Person).manager = 'LEA02';
  (byId.get('CLI01') as Person).manager = 'LEA02';
  (byId.get('ENG01') as Person).manager = 'LEA03';
  for (const p of people) {
    p.attributes = { location: 'Studio', tenure_band: t.pick(TENURE) };
  }
  const rank = (p: Person) => LEVELS.indexOf(p.level);

  const generous = 'DES04';
  const harsh = 'ENG05';
  // Warmth one way and coolness the other.
  const unrequited: Record<string, number> = {
    'DES06>CLI02': 3,
    'CLI02>DES06': -2,
    'ENG03>LEA03': 2,
    'LEA03>ENG03': -1,
    'CLI04>DES02': 3,
    'DES02>CLI04': -1,
  };
  // Reliance one way only: Client Services depend on Engineering.
  const oneWay = new Set(['CLI03>ENG02', 'CLI02>ENG04', 'CLI04>ENG02']);

  function strength(a: Person, b: Person): number {
    if (a.team === b.team) return 0.55 + (isLine(a, b) ? 0.2 : 0) + t.noise(0.15);
    if (a.team === 'Leadership' || b.team === 'Leadership') {
      return a.level === 'L4' || b.level === 'L4' ? 0.6 + t.noise(0.1) : 0.15 + t.noise(0.1);
    }
    if (a.team === 'Client Services' && b.team === 'Engineering') return 0.65 + t.noise(0.1);
    if (a.team === 'Engineering' && b.team === 'Client Services') return 0.12 + t.noise(0.08);
    if (new Set([a.team, b.team]).size === 2 && [a.team, b.team].includes('Design')) {
      return t.chance(0.5) ? 0.4 + t.noise(0.1) : 0.1;
    }
    return Math.max(0, 0.08 + t.noise(0.08));
  }

  return build({
    title: 'Scenario: asymmetric ratings (Lantern Studio)',
    notes:
      fictional('asymmetric-ratings', seed) +
      '20 members in four teams, every rating given. Members two or more levels junior rate ' +
      'seniors higher than seniors rate them; DES04 rates every colleague generously and ' +
      'ENG05 harshly; three pairs rate each other warmly one way and coolly the other ' +
      '(DES06–CLI02, ENG03–LEA03, CLI04–DES02); Client Services rely on Engineering, which ' +
      'rarely works with them in return (CLI03, CLI02, CLI04 to ENG02 and ENG04 most of all).',
    people,
    attributes: {
      team: ['Leadership', 'Design', 'Engineering', 'Client Services'],
      level: LEVELS,
      location: ['Studio'],
      tenure_band: TENURE,
    },
    layers: CORE,
    rate(a, b) {
      let s = strength(a, b);
      const gap = rank(b) - rank(a);
      if (gap >= 2) s += 0.25;
      if (gap <= -2) s -= 0.25;
      if (oneWay.has(`${a.id}>${b.id}`)) s = 0.9;
      if (oneWay.has(`${b.id}>${a.id}`)) s = 0.05;
      s = clamp(s, 0, 1);
      let valence = s < 0.15 ? 0 : clamp(Math.round(s * 3 + t.noise(0.6)), 0, 3);
      if (a.id === generous) {
        s = Math.max(s, 0.8 + t.noise(0.1));
        valence = t.chance(0.6) ? 3 : 2;
      }
      if (a.id === harsh) {
        s = Math.min(s * 0.4, 0.3);
        valence = t.chance(0.7) ? 0 : 1;
      }
      const u = unrequited[`${a.id}>${b.id}`];
      if (u !== undefined) valence = u;
      return {
        connection_strength: scale5(s + t.noise(0.06)),
        valence,
        informal_collaboration: scale5(s * 0.8 + t.noise(0.1)),
        formal_collaboration: scale5(isLine(a, b) ? 1 : s * 0.75 + t.noise(0.08)),
      };
    },
  });
}

// ------------------------------------------------------------ 3. compressed ratings

export const COMPRESSED_SEED = 20261103;
const GRAIN = [
  'Barleycorn',
  'Chaff',
  'Darnel',
  'Emmer',
  'Fallow',
  'Furrow',
  'Gleaner',
  'Harrow',
  'Husk',
  'Kernel',
  'Loam',
  'Millstone',
  'Oatfield',
  'Plough',
  'Quern',
  'Ryegrass',
  'Sheaf',
  'Spelt',
  'Stook',
  'Thresher',
  'Tilth',
  'Winnow',
  'Yarrow',
  'Haystack',
];

export function compressedRatings(seed = COMPRESSED_SEED): Project {
  const t = tools(seed);
  const people = teams(
    [
      ['Milling', 8],
      ['Bakery', 8],
      ['Distribution', 8],
    ],
    GRAIN,
    t,
    () => t.pick(['L1', 'L2', 'L2', 'L3']),
  );
  for (const p of people) {
    p.attributes = { location: t.pick(['Mill', 'Bakehouse']), tenure_band: t.pick(TENURE) };
  }
  // Response styles. Most avoid both ends of every scale; three give every
  // colleague the same answer; four use the whole scale.
  const sameAnswer = new Set(['MIL05', 'BAK06', 'DIS03']);
  const fullScale = new Set(['MIL02', 'BAK03', 'DIS01', 'DIS07']);
  // Real friction in the Bakery, visible in full only where a full-scale rater reports it.
  const friction = new Set(['BAK02', 'BAK03', 'BAK05', 'BAK07']);

  function strength(a: Person, b: Person): number {
    if (a.team === b.team) return clamp(0.65 + (isLine(a, b) ? 0.15 : 0) + t.noise(0.15), 0, 1);
    const pair = new Set([a.team, b.team]);
    if (pair.has('Milling') && pair.has('Bakery')) return 0.3 + t.noise(0.15);
    if (pair.has('Bakery') && pair.has('Distribution')) return 0.35 + t.noise(0.15);
    return Math.max(0, 0.08 + t.noise(0.08));
  }

  /** Avoids 0, 1 and 5: answers in 2–4. */
  const compress = (v: number) => clamp(Math.round(2 + v * 2 + t.noise(0.35)), 2, 4);

  return build({
    title: 'Scenario: compressed ratings (Granary Cooperative)',
    notes:
      fictional('compressed-ratings', seed) +
      '24 members in three teams, every rating given. Seventeen respondents avoided both ends ' +
      'of every scale (2 to 4 on the 0–5 scales, 0 to +2 on valence, never negative); ' +
      `${[...sameAnswer].join(', ')} gave every colleague the same answer (3, and +1 on ` +
      `valence); only ${[...fullScale].join(', ')} used the whole scale. The underlying ` +
      'teams are distinct (Milling and Distribution barely work together), and four Bakery ' +
      `members (${[...friction].join(', ')}) have strained relationships that only BAK03 ` +
      'reports as negative.',
    people,
    attributes: {
      team: ['Milling', 'Bakery', 'Distribution'],
      level: LEVELS,
      location: ['Bakehouse', 'Mill'],
      tenure_band: TENURE,
    },
    layers: CORE,
    rate(a, b) {
      const s = strength(a, b);
      const strained = friction.has(a.id) && friction.has(b.id);
      const affect = strained ? -0.7 : s < 0.15 ? 0 : clamp(s + t.noise(0.25), 0, 1);
      if (sameAnswer.has(a.id)) {
        return {
          connection_strength: 3,
          valence: 1,
          informal_collaboration: 3,
          formal_collaboration: 3,
        };
      }
      const formal = isLine(a, b) ? 1 : a.team === b.team ? 0.6 + t.noise(0.15) : s * 0.6;
      if (fullScale.has(a.id)) {
        return {
          connection_strength: scale5(s + t.noise(0.08)),
          valence: scale3(affect + t.noise(0.15)),
          informal_collaboration: scale5(s * 0.85 + t.noise(0.1)),
          formal_collaboration: scale5(formal),
        };
      }
      return {
        connection_strength: compress(s),
        valence: clamp(Math.round(affect * 2 + 0.3), 0, 2),
        informal_collaboration: compress(s * 0.85),
        formal_collaboration: compress(formal),
      };
    },
  });
}

// ------------------------------------------------------------ 4. matrix organisation

export const MATRIX_SEED = 20261104;
const SKY = [
  'Aphelion',
  'Bolide',
  'Corona',
  'Ecliptic',
  'Equinox',
  'Nebula',
  'Parsec',
  'Perigee',
  'Quasar',
  'Solstice',
  'Umbra',
  'Penumbra',
  'Zodiac',
  'Apogee',
  'Syzygy',
  'Transit',
  'Libration',
  'Occultation',
  'Albedo',
  'Asterism',
  'Cometary',
  'Declination',
  'Lumen',
  'Meteor',
  'Nova',
  'Orbital',
  'Pulsar',
  'Sidereal',
  'Azimuthal',
  'Ephemeris',
];
const PROGRAMMES = ['Atlas', 'Beacon', 'Cobalt'];

export function matrixOrganisation(seed = MATRIX_SEED): Project {
  const t = tools(seed);
  const pool = names(30, SKY, t);
  // [id, team (function), programme, second programme, level, line manager]
  const roster: [string, string | null, string, string | null, string, string | null][] = [
    ['SHA01', 'Shared Services', 'Atlas', 'Beacon', 'L5', null],
    ['SHA02', 'Shared Services', 'Cobalt', 'Atlas', 'L2', 'SHA01'],
    ['ENG01', 'Engineering', 'Atlas', null, 'L4', 'SHA01'],
    ['ENG02', 'Engineering', 'Atlas', null, 'L3', 'ENG01'],
    ['ENG03', 'Engineering', 'Atlas', null, 'L2', 'ENG01'],
    ['ENG04', 'Engineering', 'Beacon', null, 'L3', 'ENG01'],
    ['ENG05', 'Engineering', 'Beacon', 'Cobalt', 'L2', 'ENG01'],
    ['ENG06', 'Engineering', 'Beacon', null, 'L1', 'ENG01'],
    ['ENG07', 'Engineering', 'Cobalt', null, 'L3', 'ENG01'],
    ['ENG08', 'Engineering', 'Cobalt', null, 'L2', 'ENG01'],
    ['ENG09', 'Engineering', 'Cobalt', null, 'L1', 'ENG01'],
    ['DES01', 'Design', 'Beacon', null, 'L4', 'SHA01'],
    ['DES02', 'Design', 'Atlas', null, 'L2', 'DES01'],
    ['DES03', 'Design', 'Atlas', 'Cobalt', 'L2', 'DES01'],
    ['DES04', 'Design', 'Beacon', null, 'L1', 'DES01'],
    ['DES05', 'Design', 'Cobalt', null, 'L3', 'DES01'],
    ['DES06', 'Design', 'Cobalt', null, 'L1', 'DES01'],
    ['DAT01', 'Data', 'Cobalt', null, 'L4', 'SHA01'],
    ['DAT02', 'Data', 'Atlas', null, 'L2', 'DAT01'],
    ['DAT03', 'Data', 'Atlas', null, 'L3', 'DAT01'],
    ['DAT04', 'Data', 'Beacon', null, 'L2', 'DAT01'],
    ['DAT05', 'Data', 'Beacon', 'Atlas', 'L3', 'DAT01'],
    ['DAT06', 'Data', 'Cobalt', null, 'L1', 'DAT01'],
    ['DEL01', 'Delivery', 'Beacon', null, 'L4', 'SHA01'],
    ['DEL02', 'Delivery', 'Atlas', null, 'L3', 'DEL01'],
    ['DEL03', 'Delivery', 'Beacon', null, 'L3', 'DEL01'],
    ['DEL04', 'Delivery', 'Cobalt', null, 'L3', 'DEL01'],
    ['DEL05', 'Delivery', 'Atlas', 'Beacon', 'L2', 'DEL01'],
    // Contractors: function not recorded, no line manager in the organisation.
    ['CON01', null, 'Atlas', null, 'L2', null],
    ['CON02', null, 'Cobalt', null, 'L2', null],
  ];
  const people: Person[] = roster.map(([id, team, programme, second, level, manager], i) => ({
    id,
    name: pool[i] ?? '',
    team,
    level,
    manager,
    attributes: {
      programme,
      second_programme: second,
      location: t.pick(['London', 'Remote']),
      tenure_band: t.pick(TENURE),
    },
  }));
  const programmeLead = new Map([
    ['Atlas', 'DEL02'],
    ['Beacon', 'DEL03'],
    ['Cobalt', 'DEL04'],
  ]);
  const programmes = (p: Person) =>
    [p.attributes.programme, p.attributes.second_programme].filter((x): x is string => !!x);
  const shared = (a: Person, b: Person) => programmes(a).filter((x) => programmes(b).includes(x));
  const chapterLead = (a: Person, b: Person) =>
    a.team !== null && a.team === b.team && (a.level === 'L4' || b.level === 'L4');

  return build({
    title: 'Scenario: matrix organisation (Compass Partners)',
    notes:
      fictional('matrix-organisation', seed) +
      '30 members. The team attribute holds each member’s function (line management: ' +
      'Engineering, Design, Data, Delivery, Shared Services; two contractors have none ' +
      'recorded), while day-to-day work happens in three cross-functional programmes ' +
      '(the programme attribute; six members also work on a second programme). Programme ' +
      'members collaborate formally and informally every day; function colleagues on ' +
      'other programmes meet only for required chapter meetings and line management, so ' +
      'their ties are formal without informal collaboration. Programme leads: DEL02 (Atlas), ' +
      'DEL03 (Beacon), DEL04 (Cobalt).',
    people,
    attributes: {
      team: ['Engineering', 'Design', 'Data', 'Delivery', 'Shared Services'],
      level: LEVELS,
      location: ['London', 'Remote'],
      tenure_band: TENURE,
      programme: PROGRAMMES,
      second_programme: PROGRAMMES,
    },
    extraAttributes: [
      { key: 'programme', label: 'Programme', type: 'categorical', builtin: false },
      { key: 'second_programme', label: 'Second programme', type: 'categorical', builtin: false },
    ],
    layers: CORE,
    rate(a, b) {
      const both = shared(a, b);
      const sameFunction = a.team !== null && a.team === b.team;
      const leadsProgramme = both.some(
        (p) => programmeLead.get(p) === a.id || programmeLead.get(p) === b.id,
      );
      let s: number;
      let formal: number;
      let informal: number;
      if (both.length > 0) {
        s = (leadsProgramme ? 0.8 : 0.6) + t.noise(0.15);
        formal = 0.8 + t.noise(0.15);
        informal = s * 0.9 + t.noise(0.1);
      } else if (sameFunction) {
        s = (chapterLead(a, b) ? 0.45 : 0.25) + t.noise(0.1);
        formal = isLine(a, b) ? 0.8 : 0.5 + t.noise(0.08);
        informal = t.chance(0.25) ? 0.2 : 0;
      } else if (a.id === 'SHA01' || b.id === 'SHA01' || a.id === 'SHA02' || b.id === 'SHA02') {
        s = 0.3 + t.noise(0.1);
        formal = 0.35 + t.noise(0.1);
        informal = s * 0.5;
      } else {
        s = Math.max(0, 0.06 + t.noise(0.08));
        formal = 0;
        informal = t.chance(0.08) ? 0.4 : s * 0.5;
      }
      if (isLine(a, b)) formal = Math.max(formal, 0.8);
      s = clamp(s, 0, 1);
      return {
        connection_strength: scale5(s + t.noise(0.06)),
        valence: s < 0.15 ? 0 : clamp(Math.round(s * 3 + t.noise(0.7)), -1, 3),
        informal_collaboration: scale5(informal),
        formal_collaboration: scale5(formal),
      };
    },
  });
}

// ------------------------------------------------------------ 5. large department

export const LARGE_SEED = 20261105;
const ROCKS = [
  'Agate',
  'Alabaster',
  'Andesite',
  'Basalt',
  'Beryl',
  'Breccia',
  'Calcite',
  'Chert',
  'Cinnabar',
  'Corundum',
  'Diorite',
  'Dolomite',
  'Feldspar',
  'Fluorite',
  'Gabbro',
  'Galena',
  'Gneiss',
  'Granite',
  'Gypsum',
  'Hematite',
  'Kaolin',
  'Kyanite',
  'Lignite',
  'Limestone',
  'Magnetite',
  'Malachite',
  'Marlstone',
  'Mica',
  'Obsidian',
  'Olivine',
  'Onyx',
  'Peridot',
  'Porphyry',
  'Pumice',
  'Pyrite',
  'Quartz',
  'Rhyolite',
  'Rutile',
  'Sandstone',
  'Schist',
  'Scoria',
  'Shale',
  'Siltstone',
  'Spinel',
  'Talcum',
  'Topaz',
  'Tourmaline',
  'Travertine',
  'Tuff',
  'Zircon',
  'Basanite',
  'Gritstone',
  'Ironstone',
  'Moraine',
  'Scree',
  'Tufa',
  'Bauxite',
  'Cobble',
  'Dacite',
  'Eclogite',
  'Flagstone',
  'Greywacke',
  'Hornfels',
  'Jadeite',
];

export function largeDepartment(seed = LARGE_SEED): Project {
  const t = tools(seed);
  const n = 64;
  const pool = names(n, ROCKS, t);
  // Seats 0–31 on Floor 2, 32–55 on Floor 3, 56–63 remote. Two managers,
  // eight supervisors whose reports are spread across the floor (supervisor k
  // supervises every seat whose index leaves remainder k when divided by 8).
  const managers = [0, 32];
  const supervisorSeat = [1, 9, 17, 25, 33, 41, 49, 57];
  const people: Person[] = Array.from({ length: n }, (_, i) => ({
    id: `OPS${String(i + 1).padStart(2, '0')}`,
    name: pool[i] ?? '',
    team: 'Operations',
    level: 'L1',
    manager: null,
    attributes: {
      location: i < 32 ? 'Floor 2' : i < 56 ? 'Floor 3' : 'Remote',
      tenure_band: t.pick(TENURE),
      shift: t.chance(0.5) ? 'Early' : 'Late',
    },
  }));
  const seat = new Map(people.map((p, i) => [p.id, i]));
  const idAt = (i: number) => (people[i] as Person).id;
  (people[0] as Person).level = 'L4';
  (people[32] as Person).level = 'L3';
  (people[32] as Person).manager = idAt(0);
  supervisorSeat.forEach((s, k) => {
    const sup = people[s] as Person;
    sup.level = 'L2';
    sup.manager = idAt(k < 4 ? 0 : 32);
  });
  people.forEach((p, i) => {
    if (managers.includes(i) || supervisorSeat.includes(i)) return;
    p.manager = idAt(supervisorSeat[i % 8] as number);
  });
  // Long-range acquaintances, symmetric.
  const longRange = new Set<string>();
  for (let k = 0; k < 90; k += 1) {
    const a = Math.floor(t.rand() * n);
    const b = Math.floor(t.rand() * n);
    if (a !== b) longRange.add(`${String(Math.min(a, b))}-${String(Math.max(a, b))}`);
  }
  const lowResponse = new Set(['OPS59', 'OPS62', 'OPS20']);

  function strength(a: Person, b: Person): number {
    const i = seat.get(a.id) as number;
    const j = seat.get(b.id) as number;
    const remote = a.attributes.location === 'Remote' || b.attributes.location === 'Remote';
    const d = Math.min(Math.abs(i - j), n - Math.abs(i - j));
    let s = remote ? 0 : 0.8 * Math.exp(-(d - 1) / 2.5);
    if (a.attributes.shift !== b.attributes.shift) s *= 0.7;
    if (isLine(a, b)) s = Math.max(s, 0.65);
    if (a.level !== 'L1' && b.level !== 'L1') s = Math.max(s, 0.55);
    if (longRange.has(`${String(Math.min(i, j))}-${String(Math.max(i, j))}`)) s = Math.max(s, 0.35);
    return clamp(s + (s > 0.1 ? t.noise(0.12) : 0), 0, 1);
  }

  return build({
    title: 'Scenario: large department (Ledger Operations Centre)',
    notes:
      fictional('large-department', seed) +
      '64 members, all with the team value Operations: the HR record holds no team below ' +
      'the department. Ties follow seating on two floors (neighbours know each other, ' +
      'ties fade with distance), shifts (Early and Late overlap less), eight supervisors ' +
      'whose reports are spread across the floor rather than seated together, and about ' +
      '90 scattered acquaintances. Eight remote members are tied mostly to their ' +
      'supervisor. Colleagues a respondent did not know were recorded as 0 on the scaled ' +
      'layers and as “does not apply” on valence, as a survey with selection records ' +
      'them. OPS20, OPS59 and OPS62 answered about two thirds of the survey; about 3 % of ' +
      'other ratings are missing.',
    people,
    attributes: {
      team: ['Operations'],
      level: LEVELS,
      location: ['Floor 2', 'Floor 3', 'Remote'],
      tenure_band: TENURE,
      shift: ['Early', 'Late'],
    },
    extraAttributes: [{ key: 'shift', label: 'Shift', type: 'categorical', builtin: false }],
    layers: CORE,
    rate(a, b) {
      if (t.chance(lowResponse.has(a.id) ? 0.33 : 0.03)) return {};
      const s = strength(a, b);
      const connection = scale5(s + t.noise(0.05));
      if (connection === 0) {
        return {
          connection_strength: 0,
          valence: 'na',
          informal_collaboration: 0,
          formal_collaboration: 0,
        };
      }
      return {
        connection_strength: connection,
        valence: clamp(Math.round(s * 3 + t.noise(0.8)), -1, 3),
        informal_collaboration: scale5(s * 0.9 + t.noise(0.1)),
        formal_collaboration: scale5(isLine(a, b) ? 0.8 : s * 0.5 + t.noise(0.05)),
      };
    },
  });
}

// ------------------------------------------------------------ 6. dense team

export const DENSE_SEED = 20261106;
const WEATHER = [
  'Anticyclone',
  'Cirrus',
  'Cumulus',
  'Doldrums',
  'Drizzle',
  'Fogbank',
  'Gale',
  'Hailstone',
  'Isotherm',
  'Jetstream',
  'Monsoon',
  'Nimbus',
  'Squall',
  'Stratus',
  'Sleet',
  'Thermal',
  'Updraft',
  'Zephyr',
];

export function denseTeam(seed = DENSE_SEED): Project {
  const t = tools(seed);
  const people = teams(
    [
      ['Product', 3],
      ['Engineering', 8],
      ['Design', 4],
      ['Research', 3],
    ],
    WEATHER,
    t,
    () => t.pick(['L2', 'L2', 'L3']),
  );
  const byId = new Map(people.map((p) => [p.id, p]));
  const head = byId.get('PRO01') as Person;
  for (const p of people) {
    p.attributes = { location: 'Tideway', tenure_band: t.pick(TENURE) };
    if (p.team !== 'Engineering' && p !== head) p.manager = head.id;
  }
  (byId.get('ENG01') as Person).manager = head.id;
  const pairs = new Set(['ENG02-ENG03', 'ENG04-ENG05', 'ENG06-ENG07', 'DES02-ENG08']);
  const paired = (a: Person, b: Person) =>
    pairs.has(`${a.id}-${b.id}`) || pairs.has(`${b.id}-${a.id}`);

  return build({
    title: 'Scenario: dense team (Tideway Product Team)',
    notes:
      fictional('dense-team', seed) +
      '18 members of one product team, grouped by discipline in the team attribute. Everyone ' +
      'works with everyone: connection strength 3 to 5, formal collaboration at least ' +
      'weekly, informal collaboration at least monthly, valence positive. Small differences ' +
      'remain (same discipline slightly stronger; four working pairs strongest). Every ' +
      'rating was given except one declined valence rating.',
    people,
    attributes: {
      team: ['Product', 'Engineering', 'Design', 'Research'],
      level: LEVELS,
      location: ['Tideway'],
      tenure_band: TENURE,
    },
    layers: CORE,
    rate(a, b) {
      let s = 0.72 + t.noise(0.1);
      if (a.team === b.team) s += 0.08;
      if (paired(a, b) || isLine(a, b)) s += 0.15;
      s = clamp(s, 0.6, 1);
      return {
        connection_strength: clamp(scale5(s + t.noise(0.05)), 3, 5),
        valence:
          a.id === 'RES02' && b.id === 'ENG06'
            ? null
            : clamp(Math.round(s * 3 + t.noise(0.5)), 1, 3),
        informal_collaboration: clamp(scale5(s * 0.85 + t.noise(0.1)), 2, 5),
        formal_collaboration: clamp(scale5(s * 0.9 + t.noise(0.08)), 3, 5),
      };
    },
  });
}

// ------------------------------------------------------------ 7. post-merger

export const MERGER_SEED = 20261107;
const RIVER = [
  'Aquifer',
  'Backwater',
  'Braidplain',
  'Catchment',
  'Deltaic',
  'Distributary',
  'Eddyline',
  'Estuary',
  'Floodplain',
  'Fording',
  'Gorgewall',
  'Headwater',
  'Levee',
  'Meander',
  'Millrace',
  'Oxbow',
  'Rapids',
  'Riffle',
  'Runnel',
  'Sandbar',
  'Shoal',
  'Sluice',
  'Spillway',
  'Tributary',
  'Wellspring',
  'Weir',
  'Watershed',
  'Torrent',
  'Cascade',
  'Rill',
  'Culvert',
  'Lagoon',
  'Mudflat',
  'Outfall',
  'Thalweg',
  'Floodgate',
];
const LEGACY = ['Northbank', 'Southbank', 'Joined after the merger'];

export function postMerger(seed = MERGER_SEED): Project {
  const t = tools(seed);
  const people = teams(
    [
      ['Integration Office', 6],
      ['Finance', 8],
      ['Technology', 10],
      ['Customer', 12],
    ],
    RIVER,
    t,
    () => t.pick(['L1', 'L2', 'L2', 'L3']),
  );
  const byId = new Map(people.map((p) => [p.id, p]));
  const lead = byId.get('INT01') as Person;
  lead.level = 'L5';
  for (const p of people) {
    if (p.level === 'L4') p.manager = lead.id;
  }
  // Legacy organisation: alternating, so every team mixes both.
  people.forEach((p, i) => {
    p.attributes = {
      legacy_org: i % 9 === 4 || i % 2 === 1 ? 'Southbank' : 'Northbank',
      location: t.pick(['Northbank site', 'Southbank site']),
      tenure_band: t.pick(TENURE.slice(1)),
    };
  });
  const newJoiner = byId.get('CUS12') as Person;
  newJoiner.attributes = {
    legacy_org: 'Joined after the merger',
    location: 'Northbank site',
    tenure_band: 'Under 1 year',
  };
  const legacy = (p: Person) => p.attributes.legacy_org;
  // Draining relationships across the legacy line in Technology.
  const draining = new Set(['TEC03', 'TEC05', 'TEC06', 'TEC08']);
  for (const id of ['TEC03', 'TEC05']) (byId.get(id) as Person).attributes.legacy_org = 'Northbank';
  for (const id of ['TEC06', 'TEC08']) (byId.get(id) as Person).attributes.legacy_org = 'Southbank';
  // Every third Southbank member outside the Integration Office answered about half.
  const partial = new Set(
    people
      .filter((p) => legacy(p) === 'Southbank' && p.team !== 'Integration Office')
      .filter((_, k) => k % 3 === 1)
      .slice(0, 4)
      .map((p) => p.id),
  );

  function strength(a: Person, b: Person): number {
    if (a === newJoiner || b === newJoiner) return isLine(a, b) ? 0.45 : 0;
    const sameLegacy = legacy(a) === legacy(b);
    if (a.team === b.team) {
      return clamp(
        0.55 + (sameLegacy ? 0.12 : -0.12) + (isLine(a, b) ? 0.2 : 0) + t.noise(0.15),
        0,
        1,
      );
    }
    if (a.team === 'Integration Office' || b.team === 'Integration Office')
      return 0.35 + t.noise(0.1);
    if (a.level === 'L4' && b.level === 'L4') return 0.5 + t.noise(0.1);
    if (sameLegacy) return t.chance(0.35) ? 0.35 + t.noise(0.1) : 0.05;
    return Math.max(0, 0.04 + t.noise(0.04));
  }

  return build({
    title: 'Scenario: post-merger integration (Confluence Group)',
    notes:
      fictional('post-merger', seed) +
      '36 members of a company formed from two legacy organisations, recorded in the ' +
      'legacy_org attribute; every team mixes both. Within teams and across them, ties are ' +
      'stronger among people from the same legacy organisation. Northbank respondents rate ' +
      'generously and Southbank respondents harshly, by about one scale point. INT01, the ' +
      'integration lead, is sought for advice by most of the company and many depend on ' +
      'their output (the advice and workflow dependency layers are enabled). Four ' +
      'Technology members across the legacy line (TEC03, TEC05, TEC06, TEC08) find ' +
      'each other draining (energy) and report personal friction (the conflict layers are ' +
      'enabled). CUS12 joined last week: they know only their manager, and marked valence ' +
      'and energy “does not apply” for everyone else, as everyone else did for them. ' +
      `Four Southbank members (${[...partial].join(', ')}) answered about half the survey.`,
    people,
    attributes: {
      team: ['Integration Office', 'Finance', 'Technology', 'Customer'],
      level: LEVELS,
      location: ['Northbank site', 'Southbank site'],
      tenure_band: TENURE,
      legacy_org: LEGACY,
    },
    extraAttributes: [
      { key: 'legacy_org', label: 'Legacy organisation', type: 'categorical', builtin: false },
    ],
    enable: ['advice', 'workflow_dependency', 'energy', 'conflict_task', 'conflict_personal'],
    layers: [
      ...CORE,
      'advice',
      'workflow_dependency',
      'energy',
      'conflict_task',
      'conflict_personal',
    ],
    rate(a, b) {
      if (partial.has(a.id) && t.chance(0.5)) return {};
      const s = strength(a, b);
      const bias = legacy(a) === 'Northbank' ? 0.15 : legacy(a) === 'Southbank' ? -0.15 : 0;
      const rated = (v: number) => scale5(v > 0.02 ? v + bias : v);
      const unknown = a === newJoiner || b === newJoiner ? !isLine(a, b) : false;
      const drained = draining.has(a.id) && draining.has(b.id) && legacy(a) !== legacy(b);
      const affect = s < 0.1 ? 0 : clamp(s + bias + t.noise(0.3), -0.3, 1);
      const advice =
        b === lead && a !== newJoiner ? (t.chance(0.85) ? 0.75 + t.noise(0.2) : 0.3) : s * 0.6;
      const dependency =
        b === lead && a !== newJoiner
          ? t.chance(0.6)
            ? 0.7
            : 0.2
          : a.team === b.team
            ? s * 0.5
            : 0;
      const crossLegacyTech =
        a.team === 'Technology' && b.team === 'Technology' && legacy(a) !== legacy(b);
      return {
        connection_strength: rated(s + t.noise(0.06)),
        valence: unknown ? 'na' : drained ? -2 : scale3(affect),
        informal_collaboration: rated(s * (legacy(a) === legacy(b) ? 0.9 : 0.6) + t.noise(0.08)),
        formal_collaboration: rated(isLine(a, b) ? 0.8 : a.team === b.team ? 0.55 : s * 0.6),
        advice: rated(advice),
        workflow_dependency: rated(dependency),
        energy: unknown
          ? 'na'
          : drained
            ? t.chance(0.5)
              ? -3
              : -2
            : Math.max(0, scale3(affect * 0.8 + t.noise(0.2))),
        conflict_task: scale5(crossLegacyTech ? 0.5 + t.noise(0.15) : s * 0.2),
        conflict_personal: scale5(drained ? 0.6 : s * 0.05),
      };
    },
  });
}

// ------------------------------------------------------------ output

export const SCENARIOS: readonly { slug: string; generate: () => Project }[] = [
  { slug: 'partial-response', generate: () => partialResponse() },
  { slug: 'asymmetric-ratings', generate: () => asymmetricRatings() },
  { slug: 'compressed-ratings', generate: () => compressedRatings() },
  { slug: 'matrix-organisation', generate: () => matrixOrganisation() },
  { slug: 'large-department', generate: () => largeDepartment() },
  { slug: 'dense-team', generate: () => denseTeam() },
  { slug: 'post-merger', generate: () => postMerger() },
];

export { scenarioFile };

const isMain = process.argv[1]?.endsWith('generate-scenarios.ts') ?? false;
if (isMain) {
  for (const { slug, generate } of SCENARIOS) {
    const out = join(import.meta.dirname, '..', 'src', 'demo', scenarioFile(slug));
    writeFileSync(out, serialiseProject(generate()));
    console.log(`Wrote ${out}`);
  }
}
