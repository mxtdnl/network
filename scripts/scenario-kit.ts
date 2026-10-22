// Shared building blocks of the scenario generators (scripts/generate-scenarios.ts,
// scripts/generate-merged-scenarios.ts; CLAUDE.md D138, D139): fictional names,
// seeded noise, rating scales, teams with line managers, and `build`, which
// writes a project with one tie per rater, colleague and layer the scenario
// rates.

import { createProject } from '../src/data/defaults';
import type { AttributeDefinition, Member, Project, Tie } from '../src/data/schema';
import { mulberry32, type Rng } from '../src/engine/rng';

export const CREATED_AT = '2026-10-22T09:00:00.000Z';

export const FIRST = [
  'Ada',
  'Bram',
  'Chiara',
  'Dev',
  'Elif',
  'Farah',
  'Gideon',
  'Hana',
  'Ivo',
  'Jonah',
  'Kemi',
  'Lior',
  'Maren',
  'Nikhil',
  'Odile',
  'Pavel',
  'Quinn',
  'Rosa',
  'Sami',
  'Tove',
  'Uma',
  'Viktor',
  'Wren',
  'Xiomara',
  'Yusuf',
  'Zara',
  'Anouk',
  'Bastian',
  'Cleo',
  'Dario',
  'Esme',
  'Femi',
  'Greta',
  'Hugo',
  'Imani',
  'Joss',
  'Kai',
  'Leona',
  'Milo',
  'Nia',
  'Aino',
  'Benedikt',
  'Calla',
  'Dagny',
  'Emeka',
  'Fen',
  'Gaia',
  'Hollis',
  'Ines',
  'Jarrah',
  'Kalani',
  'Linnea',
  'Matteo',
  'Noor',
  'Orla',
  'Priya',
  'Rafe',
  'Saoirse',
  'Tariq',
  'Ulla',
  'Vesna',
  'Wim',
  'Xander',
  'Yara',
  'Zeno',
  'Abi',
  'Bodhi',
  'Cyrus',
  'Dilys',
  'Eero',
];

export const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];
export const TENURE = ['Under 1 year', '1 to 3 years', '3 to 5 years', 'Over 5 years'];

/** A rating as a scenario returns it: a value, `null` (declined), `'na'` (does not
 *  apply) or `undefined` (never entered). */
export type Rating = number | null | 'na' | undefined;
export type Ratings = Record<string, Rating>;

export interface Person {
  id: string;
  name: string;
  team: string | null;
  level: string;
  manager: string | null;
  attributes: Record<string, string | null>;
}

export interface Tools {
  rand: Rng;
  pick: <T>(list: readonly T[]) => T;
  /** Uniform in [−spread, spread]. */
  noise: (spread: number) => number;
  chance: (p: number) => boolean;
}

export function tools(seed: number): Tools {
  const rand = mulberry32(seed);
  return {
    rand,
    pick: <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T,
    noise: (spread) => (rand() - 0.5) * 2 * spread,
    chance: (p) => rand() < p,
  };
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** 0..1 to the 0–5 scale. */
export const scale5 = (v: number) => clamp(Math.round(v * 5), 0, 5);
/** −1..1 to the −3..+3 scale. */
export const scale3 = (v: number) => clamp(Math.round(v * 3), -3, 3);

/** Names for `n` members: first names in a seeded order, each with the next term. */
export function names(n: number, terms: readonly string[], t: Tools): string[] {
  if (terms.length < n) throw new Error(`Need ${String(n)} terms, have ${String(terms.length)}.`);
  const first = [...FIRST];
  for (let i = first.length - 1; i > 0; i -= 1) {
    const j = Math.floor(t.rand() * (i + 1));
    [first[i], first[j]] = [first[j] as string, first[i] as string];
  }
  return terms.slice(0, n).map((term, i) => `${first[i % first.length] ?? ''} ${term}`);
}

export const prefix = (team: string) =>
  team
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 3)
    .toUpperCase();
export const numbered = (p: string, k: number) => `${p}${String(k).padStart(2, '0')}`;

export interface BuildSpec {
  title: string;
  notes: string;
  people: Person[];
  /** Category order per attribute key; attributes not built in are added. */
  attributes: Record<string, string[]>;
  extraAttributes?: AttributeDefinition[];
  /** Optional layers to enable, by key. */
  enable?: string[];
  /** Layer keys in the order their ties are written. */
  layers: string[];
  rate: (a: Person, b: Person) => Ratings;
}

export function build(spec: BuildSpec): Project {
  const project = createProject(spec.title, CREATED_AT);
  project.attribute_definitions.push(...(spec.extraAttributes ?? []));
  for (const def of project.attribute_definitions) {
    const categories = spec.attributes[def.key];
    if (categories) def.categories = categories;
  }
  for (const layer of project.layers) {
    if (spec.enable?.includes(layer.key)) layer.enabled = true;
  }
  project.members = spec.people.map((p): Member => ({
    id: p.id,
    display_name: p.name,
    attributes: { team: p.team, level: p.level, ...p.attributes, manager_id: p.manager },
  }));
  const ties: Tie[] = [];
  for (const a of spec.people) {
    for (const b of spec.people) {
      if (a.id === b.id) continue;
      const r = spec.rate(a, b);
      for (const variable of spec.layers) {
        const value = r[variable];
        if (value === undefined) continue;
        const tie: Tie = {
          rater_id: a.id,
          ratee_id: b.id,
          variable,
          value: value === 'na' ? null : value,
          wave: 1,
          source: 'imported',
        };
        if (value === 'na') tie.not_applicable = true;
        ties.push(tie);
      }
    }
  }
  project.ties = ties;
  project.meta.notes = spec.notes;
  return project;
}

export const CORE = [
  'connection_strength',
  'valence',
  'informal_collaboration',
  'formal_collaboration',
];
export const fictional = (slug: string, seed: number, script = 'scripts/generate-scenarios.ts') =>
  `Fictional data, generated by ${script} (${slug}) with seed ${String(seed)}. `;

/** Teams of the given sizes; the first member of each is its lead (L4). */
export function teams(
  sizes: readonly (readonly [string, number])[],
  terms: readonly string[],
  t: Tools,
  level: () => string,
): Person[] {
  const total = sizes.reduce((s, [, n]) => s + n, 0);
  const pool = names(total, terms, t);
  const people: Person[] = [];
  for (const [team, size] of sizes) {
    for (let k = 1; k <= size; k += 1) {
      people.push({
        id: numbered(prefix(team), k),
        name: pool[people.length] ?? '',
        team,
        level: k === 1 ? 'L4' : level(),
        manager: null,
        attributes: {},
      });
    }
  }
  for (const p of people) {
    const lead = people.find((q) => q.team === p.team) as Person;
    if (p !== lead) p.manager = lead.id;
  }
  return people;
}

export const isLine = (a: Person, b: Person) => a.manager === b.id || b.manager === a.id;

export const scenarioFile = (slug: string) => `scenario-${slug}.ona.json`;
