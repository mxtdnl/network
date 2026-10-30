// Prints what the engine finds in the demo and each committed scenario project
// (src/demo/scenario-*.ona.json) under the app's default weights: coverage,
// the composite's density, reciprocity and communities, and every insight
// rule's outcome (with the attribute values most of the members named share,
// and who among them gave no ratings), and the data-quality checks and
// statement (build plan session 4), in the directed view and symmetrised by mean and by min.
// The figures in docs/reports/initial-assessment.md come from this script.
//
// Run with `npm run scenarios:measure`, optionally naming slugs to measure.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeCoverage } from '../src/data/coverage';
import { parseProject } from '../src/data/projectFile';
import { computeQuality } from '../src/data/quality';
import { qualityStatement } from '../src/ui/copy/quality';
import { analyse } from '../src/engine/analyse';
import { buildAnalysisInput } from '../src/engine/input';
import type { SymmetriseRule, ViewKind } from '../src/engine/types';
import { effectiveWeights, initialWeightState } from '../src/ui/state/presets';
import { MERGED_SCENARIOS } from './generate-merged-scenarios';
import { SCENARIOS } from './generate-scenarios';
import { WAVE_SCENARIOS } from './generate-wave-scenarios';
import { isMultiWave, scopeToWave, waveNumbers } from '../src/data/waves';
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
const slugs = [
  'demo',
  ...[...SCENARIOS, ...MERGED_SCENARIOS, ...WAVE_SCENARIOS].map((s) => s.slug),
];
for (const slug of slugs) {
  if (only.length > 0 && !only.includes(slug)) continue;
  const text = readFileSync(
    join(
      import.meta.dirname,
      '..',
      'src',
      'demo',
      slug === 'demo' ? 'demo.ona.json' : scenarioFile(slug),
    ),
    'utf8',
  );
  const project = parseProject(text);
  // A project with several waves is measured wave by wave, each on its roster (build plan session 14).
  for (const wave of isMultiWave(project) ? waveNumbers(project) : [null]) {
    const coverage = computeCoverage(project, wave);
    const silent = coverage.raters.filter((r) => r.rated === 0).map((r) => r.id);
    const low = coverage.raters.filter((r) => r.rated > 0 && r.rate < coverage.threshold);
    const members =
      wave === null ? project.members.length : scopeToWave(project, wave).members.length;
    console.log(
      `\n# ${slug}${wave === null ? '' : `, wave ${String(wave)}`} (${String(members)} members)`,
    );
    console.log(
      `coverage ${f(coverage.rate, 3)} (threshold ${f(coverage.threshold)}, warning ${String(coverage.belowThreshold)}); ` +
        `gave no ratings: ${list(silent) || 'none'}; below threshold: ` +
        `${low.map((r) => `${r.id} ${f(r.rate)}`).join(', ') || 'none'}; ` +
        `declined ${String(coverage.declined)}, does not apply ${String(coverage.notApplicable)}`,
    );
    const q = computeQuality(project, wave);
    console.log(
      `quality: few ratings ${list(q.fewRatings) || 'none'}; same answer ${list(q.sameAnswer) || 'none'}; ` +
        `rates higher ${list(q.higher) || 'none'}; lower ${list(q.lower) || 'none'}; ` +
        `many ties ${list(q.manyTies) || 'none'}; median tied ${f(q.medianTiedShare)}${q.denseReporting ? ' (dense reporting)' : ''}; ` +
        `one-way ${String(q.oneWay)} of ${String(q.reportedTies)} (${f(q.oneWayShare)})`,
    );
    console.log(`statement: ${qualityStatement(q).join(' ')}`);
    const weights = effectiveWeights(project, initialWeightState());
    for (const [view, symmetrise] of VIEWS) {
      const r = await analyse(
        buildAnalysisInput(project, { view, symmetrise, ...weights, wave }, slug),
      );
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
                  const groups = ob.groups
                    ? ` by group ${ob.groups.map((g) => `${g.value}→${g.other} ${String(g.count)}`).join(', ')};`
                    : '';
                  const shared = ob.shared
                    ? ` shared ${ob.shared.map((x) => `${x.attribute}=${x.value} ${String(x.count)}/${String(ob.members.length)}`).join(', ')};`
                    : '';
                  const silent = ob.noRatings ? ` no ratings ${ob.noRatings.join(', ')};` : '';
                  return `[${ob.ref}${group}: ${list(ob.members)};${groups}${shared}${silent} ${evidence}]`;
                })
                .join(' ');
        const inSilo = o.inSilo ? ` (${String(o.inSilo)} named under silos)` : '';
        console.log(`- ${o.rule}: ${o.status}${inSilo} ${detail ?? ''}`);
      }
    }
  }
}
