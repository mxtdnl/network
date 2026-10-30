// Prints what changes between the waves of the two-wave scenario (build plan
// session 15) under candidate thresholds for "strengthened" and "weakened",
// on connection strength and on the composite, directed and mutual: ties
// gained, lost, strengthened, weakened and steady among members on both
// rosters, how many of the strengthened and weakened pairs lie where the
// scenario built a real change (Build–Support) and how many elsewhere (where
// only each rating's own noise moved them), and coverage by wave and team.
//
// Run with `npm run scenarios:change`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject } from '../src/data/projectFile';
import { computeQuality } from '../src/data/quality';
import { analyse } from '../src/engine/analyse';
import { buildAnalysisInput } from '../src/engine/input';
import { compareWaves } from '../src/engine/metrics/change';
import type { SymmetriseRule, ViewKind } from '../src/engine/types';
import { effectiveWeights, initialWeightState } from '../src/ui/state/presets';
import { scenarioFile } from './scenario-kit';

const project = parseProject(
  readFileSync(join(import.meta.dirname, '..', 'src', 'demo', scenarioFile('two-waves')), 'utf8'),
);
const w = effectiveWeights(project, initialWeightState(project));
const teamOf = new Map(project.members.map((m) => [m.id, m.attributes.team ?? null]));
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

for (const wave of [1, 2]) {
  const q = computeQuality(project, wave);
  const rows = (q.byGroup?.rows ?? []).map(
    (r) => `${r.value ?? '–'} ${pct(r.rate)} (${String(r.respondents)}/${String(r.members)})`,
  );
  console.log(
    `Wave ${String(wave)}: coverage ${pct(q.coverage.rate)}; by team: ${rows.join(', ')}`,
  );
}

const VIEWS: readonly [ViewKind, SymmetriseRule][] = [
  ['directed', 'mean'],
  ['symmetrised', 'mean'],
  ['symmetrised', 'min'],
];
const THRESHOLDS = [0.2, 0.4, 0.6];
for (const [view, symmetrise] of VIEWS) {
  const run = (wave: number) =>
    analyse(
      buildAnalysisInput(
        project,
        { view, symmetrise, weights: w.weights, signedTreatment: w.signedTreatment, wave },
        `w${String(wave)}`,
      ),
    );
  const [r1, r2] = [await run(1), await run(2)];
  for (const ref of ['connection_strength', 'composite']) {
    console.log(`\n${view}${view === 'directed' ? '' : ` (${symmetrise})`}, ${ref}`);
    for (const t of THRESHOLDS) {
      const c = compareWaves(r1, r2, ref, { group: 'team', strengthen: t });
      const buildSupport = (from: string, to: string) => {
        const s = new Set([teamOf.get(from), teamOf.get(to)]);
        return s.has('Build') && s.has('Support');
      };
      const moved = c.ties.filter((x) => x.kind === 'strengthened' || x.kind === 'weakened');
      const real = moved.filter((x) => buildSupport(x.from, x.to)).length;
      const k = c.counts;
      console.log(
        `  ±${t.toFixed(1)}: gained ${String(k.gained)}, lost ${String(k.lost)}, ` +
          `strengthened ${String(k.strengthened)}, weakened ${String(k.weakened)}, ` +
          `steady ${String(k.steady)}, not comparable ${String(k.notComparable)}; ` +
          `moved Build–Support ${String(real)}, elsewhere ${String(moved.length - real)}`,
      );
    }
    const c = compareWaves(r1, r2, ref, { group: 'team' });
    for (const kind of ['gained', 'lost'] as const) {
      const all = c.ties.filter((x) => x.kind === kind);
      const real = all.filter((x) => {
        const s = new Set([teamOf.get(x.from), teamOf.get(x.to)]);
        return s.has('Build') && s.has('Support');
      }).length;
      console.log(
        `  ${kind}: Build–Support ${String(real)}, elsewhere ${String(all.length - real)}`,
      );
    }
    console.log(
      `  members both ${String(c.members.both.length)}, left ${c.members.left.join(' ')}, ` +
        `joined ${c.members.joined.join(' ')}; ties of leavers ${String(c.leftTies)}, of joiners ${String(c.joinedTies)}`,
    );
    console.log(
      `  density ${c.before.density.toFixed(3)} → ${c.after.density.toFixed(3)}, ` +
        `E-I ${c.before.ei.toFixed(2)} → ${c.after.ei.toFixed(2)}, ` +
        `load ${c.before.load.toFixed(2)} → ${c.after.load.toFixed(2)}, ` +
        `bridges ${String(c.before.localBridges)} → ${String(c.after.localBridges)}, ` +
        `cut points ${c.before.cutPoints.join(' ') || '–'} → ${c.after.cutPoints.join(' ') || '–'}`,
    );
    for (const p of c.groupPairs) {
      if (p.from === p.to && view === 'directed') continue;
      const b = p.before;
      const a = p.after;
      const d = (a?.density ?? NaN) - (b?.density ?? NaN);
      if (Math.abs(d) >= 0.05)
        console.log(
          `    ${p.from}→${p.to}: ${String(b?.ties)} (${pct(b?.density ?? NaN)}) → ${String(a?.ties)} (${pct(a?.density ?? NaN)})`,
        );
    }
  }
}
