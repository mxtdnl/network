// Wording for the question picker and the question a view answers (build plan
// session 8, spec §8). The questions are for inquiry: they pass the banned-word
// list in CLAUDE.md, "Insight wording" (tests/unit/insightsCopy.test.ts).

import type { CompositeFormula } from '../engineClient';
import type { QuestionId } from '../state/questions';
import { percent } from './data';

export const questionsCopy = {
  heading: 'Question',
  label: 'What do you want to know?',
  own: 'Own settings',
  ownHelp:
    'The map shows the settings you chose. Choose a question to set the map, its title and the sentences that describe it.',
  questions: {
    connected: 'Who is connected to whom?',
    information: 'How does information reach people?',
    groups: 'Where do teams connect, and where not?',
    brokers: 'Who links groups that otherwise rarely meet?',
    depend: 'Whose time do others depend on?',
    informal: 'Where does work happen outside the formal structure?',
    singleRoute: 'Where does the network rely on a single route?',
    negative: 'Where are relationships rated negatively, and is that returned?',
  } satisfies Record<QuestionId, string>,
  /** What each question shows, under the picker. */
  help: {
    connected:
      'Ties of connection strength. Larger members are named by more colleagues; colour shows team.',
    information:
      'Advice ties, from the member who asks to the member asked. Larger members are asked by more colleagues.',
    groups:
      'How many ties stay within each group and how many cross between groups. The Groups tab shows every pair of groups.',
    brokers:
      'Informal collaboration, with the clusters found in it outlined. Larger members lie on more of the shortest routes between colleagues.',
    depend:
      'Workflow dependency: whom each member relies on to get their work done. The Table tab ranks members by the ties they receive.',
    informal:
      'Informal collaboration, drawn with formal and informal line styles. Over the formal hierarchy when managers are recorded.',
    singleRoute:
      'Ties of connection strength whose two members have no contact in common are marked, and members whose absence would cut others off are highlighted.',
    negative:
      'Ties of connection strength, with negative ratings coloured and drawn whatever the tie-strength range.',
  } satisfies Record<QuestionId, string>,
  /** The relation a question needs, in a short phrase for the picker's option. */
  needs: (relation: string) => `needs ${relation}`,
  notInProject: (relation: string) =>
    `This question needs ${relation} ratings, which this project does not have. Add the layer under Layers, then import or enter its ratings.`,
  notEnabled: (relation: string) =>
    `This question needs ${relation} ratings. Switch on ${relation} under Layers, then import or enter its ratings.`,
  notRated: (relation: string) =>
    `This question needs ${relation} ratings, and none have been entered yet. Import or enter them first.`,
  noGroups:
    'This question needs an attribute that puts members into at least two groups, such as team.',
  bothLayers: 'formal and informal collaboration',
  signedLayer: 'valence (or another signed layer)',
  /** The title line of the centre column. */
  title: (question: string) => question,
  ownTitle: (layer: string) => `Ties from ${layer}`,
  seeAlso: {
    information: 'Show incoming advice ties',
    informal: 'Compare formal and informal',
    groups: 'Show the map',
    depend: 'Show the map',
  } as Partial<Record<QuestionId, string>>,
  shown: (question: string) => `Showing: ${question}`,
  useComposite: 'Draw ties from the combined layers',
  allTies: 'Every figure counts all ties, including any the map hides.',
  /** The composite's weights, stated on the map whenever it draws ties from it. */
  composite: (terms: string) => `Combined layers: ${terms}.`,
  compositeTerm: (label: string, share: string) => `${label} ${share}`,
  compositeMultiplier: (label: string) => `${label} adjusts each tie`,
  compositeFilter: (label: string) => `a negative ${label} rating removes the tie`,
  advanced: 'Advanced: combine layers',
  advancedHelp:
    'Combine several layers into one set of ties, with your own weights. A combined set is a statement of priorities, not a measurement (method notes §6).',
  aboutNetwork: 'About this network',
};

/**
 * The composite's weights in one sentence, from the engine's formula (D41):
 * "Combined layers: Connection strength 33%, Informal collaboration 33%, Formal
 * collaboration 33%; Valence adjusts each tie." Stated on the map whenever ties
 * come from the composite (build plan session 8).
 */
export function compositeStatement(formula: CompositeFormula): string {
  const terms = formula.terms.map((t) => questionsCopy.compositeTerm(t.label, percent(t.weight)));
  const extra = [
    ...formula.multipliers.map((m) => questionsCopy.compositeMultiplier(m.label)),
    ...formula.filters.map((f) => questionsCopy.compositeFilter(f.label)),
  ];
  return questionsCopy.composite(
    extra.length > 0 ? `${terms.join(', ')}; ${extra.join('; ')}` : terms.join(', '),
  );
}
