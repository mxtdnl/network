// Measures the data remedies of build plan session 5 on the demo and the
// twelve scenario projects: for each option, which insight observations it
// changes against the same view without it, under the app's default weights.
//
// Run with `npm run scenarios:remedies`, optionally naming slugs to measure.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject } from '../src/data/projectFile';
import type { Project } from '../src/data/schema';
import { analyse } from '../src/engine/analyse';
import { buildAnalysisInput, type AnalysisOptions } from '../src/engine/input';
import type { AnalysisResult, InsightOutcome } from '../src/engine/types';
import { effectiveWeights, initialWeightState } from '../src/ui/state/presets';
import { MERGED_SCENARIOS } from './generate-merged-scenarios';
import { SCENARIOS } from './generate-scenarios';
import { scenarioFile } from './scenario-kit';

type Options = Omit<AnalysisOptions, 'weights' | 'signedTreatment'>;

interface Case {
  name: string;
  base: Options;
  option: Options;
}

const CASES: Case[] = [
  {
    name: 'both report a tie (vs weaker)',
    base: { view: 'symmetrised', symmetrise: 'min' },
    option: { view: 'symmetrised', symmetrise: 'both' },
  },
  {
    name: 'both report a tie (vs average)',
    base: { view: 'symmetrised', symmetrise: 'mean' },
    option: { view: 'symmetrised', symmetrise: 'both' },
  },
  ...(['directed', 'mean'] as const).flatMap((v): Case[] => {
    const view: Options =
      v === 'directed'
        ? { view: 'directed', symmetrise: 'mean' }
        : { view: 'symmetrised', symmetrise: 'mean' };
    return [
      {
        name: `leave out non-respondents, ${v}`,
        base: view,
        option: { ...view, nonRespondents: 'leaveOut' },
      },
      { name: `reconstruct, ${v}`, base: view, option: { ...view, reconstruct: true } },
      { name: `standardise by rank, ${v}`, base: view, option: { ...view, standardise: 'rank' } },
      { name: `standardise by z-score, ${v}`, base: view, option: { ...view, standardise: 'z' } },
    ];
  }),
  {
    name: 'reconstruct, both report a tie',
    base: { view: 'symmetrised', symmetrise: 'both' },
    option: { view: 'symmetrised', symmetrise: 'both', reconstruct: true },
  },
];

const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));

function describe(o: InsightOutcome): string[] {
  if (o.status === 'unavailable') return [`${o.rule}: not applied (${String(o.reason)})`];
  if (o.observations.length === 0) return [`${o.rule}: none`];
  return o.observations.map((ob) => {
    const group = ob.group ? ` ${ob.group.value}${ob.group.other ? `/${ob.group.other}` : ''}` : '';
    const members =
      ob.members.length > 6 ? `${String(ob.members.length)} members` : ob.members.join(', ');
    const found = ob.evidence.found !== undefined ? ` (found ${String(ob.evidence.found)})` : '';
    return `${o.rule} [${ob.ref}${group}]: ${members}${found}`;
  });
}

const lines = (r: AnalysisResult) => r.insights.flatMap(describe);

/** Spearman correlation of two columns over members defined in both. */
function spearman(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const idx = [...Array(a.length).keys()].filter(
    (i) => Number.isFinite(a[i]) && Number.isFinite(b[i]),
  );
  const rank = (col: ArrayLike<number>) => {
    const sorted = [...idx].sort((x, y) => (col[x] as number) - (col[y] as number));
    const r = new Map<number, number>();
    for (let s = 0; s < sorted.length;) {
      let e = s;
      while (e + 1 < sorted.length && col[sorted[e + 1] as number] === col[sorted[s] as number])
        e++;
      for (let k = s; k <= e; k++) r.set(sorted[k] as number, (s + e) / 2);
      s = e + 1;
    }
    return idx.map((i) => r.get(i) as number);
  };
  const x = rank(a);
  const y = rank(b);
  const mean = (v: number[]) => v.reduce((s, t) => s + t, 0) / v.length;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  x.forEach((xi, k) => {
    const yi = y[k] as number;
    num += (xi - mx) * (yi - my);
    dx += (xi - mx) ** 2;
    dy += (yi - my) ** 2;
  });
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : NaN;
}

async function run(project: Project, options: Options, key: string) {
  const weights = effectiveWeights(project, initialWeightState());
  return analyse(buildAnalysisInput(project, { ...options, ...weights }, key));
}

const only = process.argv.slice(2);
for (const slug of ['demo', ...[...SCENARIOS, ...MERGED_SCENARIOS].map((s) => s.slug)]) {
  if (only.length > 0 && !only.includes(slug)) continue;
  const file = slug === 'demo' ? 'demo.ona.json' : scenarioFile(slug);
  const project = parseProject(
    readFileSync(join(import.meta.dirname, '..', 'src', 'demo', file), 'utf8'),
  );
  console.log(`\n# ${slug} (${String(project.members.length)} members)`);
  for (const c of CASES) {
    const base = await run(project, c.base, `${slug}:base`);
    const option = await run(project, c.option, `${slug}:option`);
    const before = lines(base);
    const after = lines(option);
    const removed = before.filter((l) => !after.includes(l));
    const added = after.filter((l) => !before.includes(l));
    const bc = base.refs.composite;
    const oc = option.refs.composite;
    const metric = c.base.view === 'directed' ? 'inStrength' : 'strength';
    const rho = spearman(bc?.node.columns[metric] ?? [], oc?.node.columns[metric] ?? []);
    const summary =
      `composite ties ${String(bc?.network.ties ?? 0)} → ${String(oc?.network.ties ?? 0)}, ` +
      `communities ${String(bc?.communities?.count ?? 0)} → ${String(oc?.communities?.count ?? 0)}, ` +
      `rank correlation of ${metric} ${f(rho)}`;
    if (removed.length === 0 && added.length === 0) {
      console.log(`## ${c.name}: no observation changed; ${summary}`);
      continue;
    }
    console.log(`## ${c.name}: ${summary}`);
    for (const l of removed) console.log(`  - ${l}`);
    for (const l of added) console.log(`  + ${l}`);
  }
}
