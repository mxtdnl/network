// Relations an analyst created (build plan session 11), added to the demo with
// seeded ratings, for tests that carry them through files, surveys, insights
// and exports. Advice about the rollout concentrates on one member, so the
// overload and demand rules have something to find on it; tension over the
// rollout (friction) and enjoying working together (affect, unsigned) are what
// the export exclusion must remove.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProject } from '../../src/data/projectFile';
import { addRelation, createRelation } from '../../src/data/relations';
import type { Project, Tie } from '../../src/data/schema';
import { mulberry32 } from '../../src/engine/rng';

export const HUB = 'OPE04';

export function demo(): Project {
  return parseProject(
    readFileSync(join(import.meta.dirname, '../../src/demo/demo.ona.json'), 'utf8'),
  );
}

export function withCustomRelations(project: Project = demo()): Project {
  let p = project;
  const advice = createRelation(p, {
    label: 'Advice about the rollout',
    question_wording: 'How often do you go to this person for advice about the rollout?',
    role: 'advice',
    scale: 'frequency',
  });
  p = addRelation(p, advice);
  const tension = createRelation(p, {
    label: 'Tension over the rollout',
    question_wording: 'How often is work with this person on the rollout slowed by tension?',
    role: 'friction',
    scale: 'frequency',
  });
  p = addRelation(p, tension);
  const enjoy = createRelation(p, {
    label: 'Enjoys working together',
    question_wording: 'I enjoy working with this person.',
    role: 'affect',
    scale: 'agreement',
  });
  p = addRelation(p, enjoy);

  const rnd = mulberry32(11);
  const ties: Tie[] = [...p.ties];
  for (const a of p.members) {
    for (const b of p.members) {
      if (a.id === b.id) continue;
      // Almost everyone asks the hub for advice; a few other pairs too.
      if (b.id === HUB || rnd() < 0.05) {
        ties.push({
          rater_id: a.id,
          ratee_id: b.id,
          variable: advice.key,
          value: b.id === HUB ? 5 : 2,
          wave: 1,
          source: 'imported',
        });
      }
      if (rnd() < 0.2) {
        ties.push({
          rater_id: a.id,
          ratee_id: b.id,
          variable: tension.key,
          value: 1 + Math.floor(rnd() * 5),
          wave: 1,
          source: 'imported',
        });
      }
      if (rnd() < 0.3) {
        ties.push({
          rater_id: a.id,
          ratee_id: b.id,
          variable: enjoy.key,
          value: Math.floor(rnd() * 6),
          wave: 1,
          source: 'imported',
        });
      }
    }
  }
  return { ...p, ties };
}

export const CUSTOM_KEYS = {
  advice: 'advice_about_the_rollout',
  tension: 'tension_over_the_rollout',
  enjoy: 'enjoys_working_together',
};
