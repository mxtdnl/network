// Prints the executive summary's draft (build plan session 10) for the demo
// and each scenario project, at each audience level that has a report, in the
// directed view and symmetrised by mean and by min, under the app's default
// weights and map settings.
//
// Run with `npm run scenarios:summary`, optionally naming slugs to print.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject } from '../src/data/projectFile';
import type { AudienceLevel } from '../src/data/schema';
import { analyse } from '../src/engine/analyse';
import { buildAnalysisInput } from '../src/engine/input';
import type { SymmetriseRule, ViewKind } from '../src/engine/types';
import { exportContext } from '../src/ui/export/context';
import { draftSummary } from '../src/ui/export/summary';
import { effectiveWeights, initialWeightState } from '../src/ui/state/presets';
import { analysisOptions } from '../src/ui/state/remedies';
import { openingMapSettings } from '../src/ui/state/store';
import { teamAttribute } from '../src/ui/state/audienceSettings';
import { MERGED_SCENARIOS } from './generate-merged-scenarios';
import { SCENARIOS } from './generate-scenarios';
import { scenarioFile } from './scenario-kit';

const VIEWS: readonly [ViewKind, SymmetriseRule][] = [
  ['directed', 'mean'],
  ['symmetrised', 'mean'],
  ['symmetrised', 'min'],
];
const LEVELS: readonly AudienceLevel[] = ['analyst', 'board', 'leadership', 'workshop'];

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('--'));
const directedOnly = args.includes('--directed');
for (const slug of ['demo', ...[...SCENARIOS, ...MERGED_SCENARIOS].map((s) => s.slug)]) {
  if (only.length > 0 && !only.includes(slug)) continue;
  const file = slug === 'demo' ? 'demo.ona.json' : scenarioFile(slug);
  const project = parseProject(
    readFileSync(join(import.meta.dirname, '..', 'src', 'demo', file), 'utf8'),
  );
  console.log(`\n# ${slug} (${String(project.members.length)} members)`);
  const weights = initialWeightState();
  const w = effectiveWeights(project, weights);
  const team = teamAttribute(project);
  const firstTeam = team
    ? (project.members.map((m) => m.attributes[team.key]).find((v) => typeof v === 'string') ??
      null)
    : null;
  for (const [view, symmetrise] of directedOnly ? VIEWS.slice(0, 1) : VIEWS) {
    const map = { ...openingMapSettings(project), view, symmetrise };
    const result = await analyse(
      buildAnalysisInput(
        project,
        {
          view,
          symmetrise,
          ...analysisOptions(map),
          weights: w.weights,
          signedTreatment: w.signedTreatment,
        },
        slug,
      ),
    );
    for (const level of LEVELS) {
      const ctx = await exportContext(
        {
          project,
          result,
          map,
          weights,
          anonymise: true,
          excludeSigned: false,
          audience: {
            level,
            team: level === 'workshop' ? firstTeam : null,
            member: null,
          },
        },
        (input) => analyse(input),
      );
      const s = draftSummary(ctx);
      console.log(
        `\n## ${view}${view === 'symmetrised' ? ` (${symmetrise})` : ''}, ${level}${level === 'workshop' ? ` (${String(firstTeam)})` : ''}: ${String(s.headlines.length)} headlines`,
      );
      console.log(s.intro.join(' '));
      for (const h of s.headlines) {
        console.log(`\n### ${h.title}  [${h.id}]`);
        console.log(`What we saw: ${h.saw}`);
        console.log(`Why it may matter: ${h.matters}`);
        console.log(`Questions for discussion:\n${h.questions.map((q) => `- ${q}`).join('\n')}`);
      }
      console.log(`\n${s.closing}`);
    }
  }
}
