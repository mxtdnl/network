// Prints what the engine finds in each committed scenario project
// (src/demo/scenario-*.ona.json) under the app's default weights: coverage,
// the composite's density, reciprocity and communities, and every insight
// rule's outcome, in the directed view and symmetrised by mean and by min.
// The figures in docs/reports/initial-assessment.md come from this script.
//
// Run with `npm run scenarios:measure`, optionally naming slugs to measure.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeCoverage } from '../src/data/coverage';
import { parseProject } from '../src/data/projectFile';
import { analyse } from '../src/engine/analyse';
import { buildAnalysisInput } from '../src/engine/input';
import type { SymmetriseRule, ViewKind } from '../src/engine/types';
import { effectiveWeights, initialWeightState } from '../src/ui/state/presets';
import { MERGED_SCENARIOS } from './generate-merged-scenarios';
import { SCENARIOS } from './generate-scenarios';
import { scenarioFile } from './scenario-kit';

const VIEWS: readonly [ViewKind, SymmetriseRule][] = [
  ['directed', 'mean'],
  ['symmetrised', 'mean'],
  ['symmetrised', 'min'],
];
const f = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
const list = (ids: readonly string[]) =>
  ids.length > 8 ? `${String(ids.length)} members` : ids.join(', ');

const only = process.argv.slice(2);
for (const { slug } of [...SCENARIOS, ...MERGED_SCENARIOS]) {
  if (only.length > 0 && !only.includes(slug)) continue;
  const text = readFileSync(
    join(import.meta.dirname, '..', 'src', 'demo', scenarioFile(slug)),
    'utf8',
  );
  const project = parseProject(text);
  const coverage = computeCoverage(project);
  const silent = coverage.raters.filter((r) => r.rated === 0).map((r) => r.id);
  const low = coverage.raters.filter((r) => r.rated > 0 && r.rate < coverage.threshold);
  console.log(`\n# ${slug} (${String(project.members.length)} members)`);
  console.log(
    `coverage ${f(coverage.rate, 3)} (threshold ${f(coverage.threshold)}, warning ${String(coverage.belowThreshold)}); ` +
      `gave no ratings: ${list(silent) || 'none'}; below threshold: ` +
      `${low.map((r) => `${r.id} ${f(r.rate)}`).join(', ') || 'none'}; ` +
      `declined ${String(coverage.declined)}, does not apply ${String(coverage.notApplicable)}`,
  );
  const weights = effectiveWeights(project, initialWeightState());
  for (const [view, symmetrise] of VIEWS) {
    const r = await analyse(buildAnalysisInput(project, { view, symmetrise, ...weights }, slug));
    const composite = r.refs.composite;
    if (!composite) continue;
    const net = composite.network;
    const c = composite.communities;
    console.log(
      `## ${view}${view === 'symmetrised' ? ` (${symmetrise})` : ''}: density ${f(net.density)}, ` +
        `tie reciprocity ${f(net.reciprocity.overall)}, communities ${String(c?.count ?? 0)} ` +
        `(modularity ${f(c?.modularity ?? NaN, 3)})${r.warnings.length > 0 ? `, warnings ${JSON.stringify(r.warnings)}` : ''}`,
    );
    for (const o of r.insights) {
      const detail =
        o.status === 'unavailable'
          ? o.reason
          : o.observations
              .map((ob) => {
                const group = ob.group
                  ? ` ${ob.group.value}${ob.group.other ? `/${ob.group.other}` : ''}`
                  : '';
                const evidence = Object.entries(ob.evidence)
                  .map(([k, v]) => `${k} ${f(v)}`)
                  .join(', ');
                return `[${ob.ref}${group}: ${list(ob.members)}; ${evidence}]`;
              })
              .join(' ');
      console.log(`- ${o.rule}: ${o.status} ${detail ?? ''}`);
    }
  }
}
