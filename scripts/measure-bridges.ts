// Prints the figures behind the rule thresholds of build plan session 7 for
// the demo and each scenario project, under the app's default weights, in the
// directed view and symmetrised by mean and by min: per group of the rules'
// grouping attribute, the members holding every tie with other groups
// (gateways) on the composite and the fewest on any working layer; ties
// between each pair of groups; cut points and the members they cut off; local
// bridges; and the share of incoming ties held by the top 10 % on advice and
// workflow dependency, overall and by group.
//
// Run with `npm run scenarios:bridges`, optionally naming slugs to measure.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject } from '../src/data/projectFile';
import { analyse } from '../src/engine/analyse';
import { buildAnalysisInput } from '../src/engine/input';
import { groupAttribute, groupRoutes } from '../src/engine/insights';
import type { RefResult, SymmetriseRule, ViewKind } from '../src/engine/types';
import { effectiveWeights, initialWeightState } from '../src/ui/state/presets';
import { MERGED_SCENARIOS } from './generate-merged-scenarios';
import { SCENARIOS } from './generate-scenarios';
import { scenarioFile } from './scenario-kit';

const VIEWS: readonly [ViewKind, SymmetriseRule][] = [
  ['directed', 'mean'],
  ['symmetrised', 'mean'],
  ['symmetrised', 'min'],
];
const pct = (x: number) => (Number.isFinite(x) ? `${(100 * x).toFixed(0)}%` : '–');

const only = process.argv.slice(2);
for (const slug of ['demo', ...[...SCENARIOS, ...MERGED_SCENARIOS].map((s) => s.slug)]) {
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
  const weights = effectiveWeights(project, initialWeightState());
  console.log(`\n# ${slug} (${String(project.members.length)} members)`);
  for (const [view, symmetrise] of VIEWS) {
    const input = buildAnalysisInput(project, { view, symmetrise, ...weights }, slug);
    const r = await analyse(input);
    const ids = r.memberIds;
    const attr = groupAttribute(input.attributes, input.settings.insightGroup);
    console.log(
      `## ${view}${view === 'symmetrised' ? ` (${symmetrise})` : ''}, groups by ${String(attr)}`,
    );
    const composite = r.refs.composite;
    const working = r.refOrder
      .map((ref) => r.refs[ref])
      .filter(
        (x): x is RefResult =>
          x !== undefined &&
          x.kind === 'unsigned' &&
          !input.layers.some((l) => l.key === x.layer && l.group === 'conflict'),
      );
    if (composite && attr) {
      const column = input.attributes[attr];
      if (column) {
        const routes = groupRoutes(composite.weights, ids.length, column);
        const perLayer = working.map((w) => ({
          ref: w.ref,
          routes: groupRoutes(w.weights, ids.length, column),
        }));
        console.log(
          '- gateways (composite; fewest on a working layer): ' +
            routes.groups
              .map((g) => {
                const fewest = perLayer
                  .map((l) => ({
                    ref: l.ref,
                    g: l.routes.groups.find((x) => x.group === g.group),
                  }))
                  .filter((x) => x.g && x.g.externalTies > 0)
                  .sort((a, b) => (a.g?.gateways.length ?? 0) - (b.g?.gateways.length ?? 0))[0];
                return (
                  `${g.group} ${String(g.size)}: ${String(g.gateways.length)} of ${String(g.size)} hold ${String(g.externalTies)} ties` +
                  (fewest?.g
                    ? ` (${fewest.ref} ${String(fewest.g.gateways.length)}/${String(fewest.g.externalTies)})`
                    : '')
                );
              })
              .join('; '),
        );
        const pairs = routes.pairs.filter((p) => p.sizeA >= 3 && p.sizeB >= 3);
        const hist = [0, 1, 2, 3].map((k) => pairs.filter((p) => p.ties === k).length);
        console.log(
          `- pairs of groups (both ≥ 3): ${String(pairs.length)}; with 0/1/2/3 ties ${hist.join('/')}; ` +
            pairs
              .filter((p) => p.ties > 0 && p.ties <= 3)
              .map((p) => `${p.a}–${p.b} ${String(p.ties)} (${String(p.members.length)} members)`)
              .join(', '),
        );
      }
    }
    // Other attributes: groups whose ties with other groups are held by at most 3 members.
    if (composite) {
      for (const [key, column] of Object.entries(input.attributes)) {
        if (key === attr) continue;
        const found: string[] = [];
        for (const w of [composite, ...working]) {
          for (const g of groupRoutes(w.weights, ids.length, column).groups)
            if (g.size >= 3 && g.externalTies > 0 && g.gateways.length <= 3)
              found.push(
                `${w.ref} ${g.group} ${String(g.gateways.length)}/${String(g.size)} (${String(g.externalTies)} ties)`,
              );
        }
        if (found.length > 0) console.log(`  by ${key}: ${found.join('; ')}`);
      }
    }
    if (composite?.ties) {
      const cp = composite.ties.cutPoints;
      const lb = composite.ties.localBridges;
      const spans = Array.from(lb.span);
      console.log(
        `- composite: cut points ${Array.from(cp.members, (i, k) => `${String(ids[i])} (${String(cp.cutOff[k])})`).join(', ') || 'none'}; ` +
          `local bridges ${String(spans.length)} (no other route ${String(spans.filter((s) => s === Infinity).length)}, span ≥ 4 ${String(spans.filter((s) => s >= 4 && s < Infinity).length)})`,
      );
      for (const w of working) {
        const c = w.ties?.cutPoints;
        if (c && c.members.length > 0)
          console.log(
            `  ${w.ref}: cut points ${Array.from(c.members, (i, k) => `${String(ids[i])} (${String(c.cutOff[k])})`).join(', ')}`,
          );
      }
    }
    console.log(
      `- top 10 % share on every working layer: ${working.map((w) => `${w.ref} ${pct(w.load?.overall.share ?? NaN)}`).join(', ')}`,
    );
    for (const key of ['advice', 'workflow_dependency']) {
      const ref = r.refs[key];
      const load = ref?.load;
      if (!load || !attr) continue;
      const o = load.overall;
      console.log(
        `- ${key}: top ${String(o.top.length)} hold ${pct(o.share)} of ${String(o.received)} incoming (${Array.from(o.top, (i) => `${String(ids[i])} ${String(load.incoming[i])}`).join(', ')}); by group: ` +
          (load.byGroup[attr] ?? [])
            .map((g) => `${g.group} ${String(g.members)}: ${pct(g.share)} of ${String(g.received)}`)
            .join(', '),
      );
    }
  }
}
