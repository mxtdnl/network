// Wording for relations the analyst creates, their roles and scales, and the
// question bank (build plan session 11). The items' own wording is project
// data, in data/questionBank.ts, as the built-in layers' wording is in
// data/defaults.ts.

import type { BankPurpose, Sensitivity } from '../../data/questionBank';
import type { RelationProblem, RelationScale } from '../../data/relations';
import type { LayerRole } from '../../data/schema';

const count = (value: number, one: string, many: string) =>
  `${value.toLocaleString('en-GB')} ${value === 1 ? one : many}`;

export const roleCopy: Record<LayerRole, { name: string; help: string }> = {
  connection: {
    name: 'Working connection',
    help: 'A working relationship in general. The map opens on it, and it is mutual by nature.',
  },
  formal: {
    name: 'Formal collaboration',
    help: 'Work a role, process or reporting line requires. Compared with informal collaboration, and used by the Formal structure preset.',
  },
  informal: {
    name: 'Informal collaboration',
    help: 'Work outside formal roles and processes. Compared with formal collaboration, and used by the Informal network preset.',
  },
  information: {
    name: 'Information flow',
    help: 'Information given or received. A working tie for the rules; either direction may be asked.',
  },
  advice: {
    name: 'Advice',
    help: 'The person answering goes to the colleague for advice. Possible overload and concentrated demand read it.',
  },
  dependency: {
    name: 'Dependency',
    help: 'The person answering relies on the colleague’s work. Possible overload and concentrated demand read it.',
  },
  ideas: {
    name: 'Ideas',
    help: 'Ideas shared or tested. Used by the Informal network preset.',
  },
  trust: {
    name: 'Trust',
    help: 'Trust or safety in the relationship. Used by the Relationship health preset.',
  },
  influence: {
    name: 'Influence',
    help: 'A colleague’s effect on decisions. A working tie for the rules.',
  },
  awareness: {
    name: 'Awareness',
    help: 'Knowing what a colleague knows or does. A working tie for the rules.',
  },
  affect: {
    name: 'How people feel about each other',
    help: 'Feelings about a relationship, such as energy. A signed one adjusts ties in the composite and can colour them; every one is left out when exports leave out these layers.',
  },
  friction: {
    name: 'Friction',
    help: 'Disagreement or tension. Not a working tie, weight 0 in the composite, and left out when exports leave out these layers.',
  },
  other: {
    name: 'Other',
    help: 'Anything else. Treated as a working tie when it is rated on a scale; categories are recorded but not analysed.',
  },
};

export const scaleCopy: Record<RelationScale, { name: string; help: string }> = {
  frequency: { name: 'Frequency, 0 to 5', help: 'From never to daily.' },
  agreement: { name: 'Agreement, 0 to 5', help: 'From not at all to completely.' },
  signed: {
    name: 'Signed, −3 to +3',
    help: 'From very negative through neutral to very positive.',
  },
  categories: {
    name: 'Categories',
    help: 'Two to eight named answers, recorded but not analysed.',
  },
};

export const relationCopy = {
  create: 'Create a relation',
  createTitle: 'Create a relation',
  intro:
    'Ask about the issue you are exploring. The role decides how the rules, presets and exports treat the relation.',
  labelField: 'Label',
  wordingField: 'Question wording',
  wordingHelp: 'Shown to participants. Word it from the view of the person answering.',
  roleField: 'Role',
  scaleField: 'Scale',
  scaleNotAllowed: 'This role does not use that scale. Choose another.',
  categoriesField: 'Answers, one per line',
  mutualField: 'Mutual by nature',
  keyPreview: (key: string) => `Import key: ${key}. It does not change if you rename the relation.`,
  createButton: 'Create relation',
  cancel: 'Cancel',
  created: (label: string) => `Relation created: ${label}.`,
  problem: {
    emptyLabel: 'Enter a label.',
    emptyWording: 'Enter the question.',
    scaleNotAllowed: 'This role does not use that scale. Choose another.',
    tooFewCategories: 'Enter at least two answers.',
    tooManyCategories: 'Enter at most eight answers.',
    repeatedCategory: 'Each answer must be different.',
  } satisfies Record<RelationProblem, string>,
  customHeading: 'Relations you added',
  deleteBody: (impact: { ratings: number; views: number; surveys: number }) => {
    const parts = [
      impact.ratings > 0
        ? `This deletes the relation and its ${count(impact.ratings, 'rating', 'ratings')}, which cannot be recovered.`
        : 'This deletes the relation. It has no ratings.',
    ];
    if (impact.views > 0) {
      parts.push(
        `${count(impact.views, 'saved view uses', 'saved views use')} it and will draw another layer instead.`,
      );
    }
    if (impact.surveys > 0) {
      parts.push(
        `${count(impact.surveys, 'survey asked', 'surveys asked')} about it: those questions stay in the survey, and responses to them will be listed as dropped when imported.`,
      );
    }
    return parts.join(' ');
  },
};

export const bankCopy = {
  open: 'Add from the question bank',
  title: 'Question bank',
  intro:
    'Questions grouped by purpose. Adding one creates a relation you can edit. Adapt the wording to your client’s issue.',
  topicField: 'Topic',
  topicHelp:
    'Replaces {topic} in the questions, for example “the improvement programme”. Leave it empty to see where it goes.',
  topicMissing: 'Enter a topic first: this question names one.',
  purpose: {
    information: 'Information flow',
    advice: 'Advice and problem-solving',
    dependency: 'Work and dependency',
    ideas: 'Innovation and ideas',
    decisions: 'Decisions',
    collaboration: 'Collaboration',
    merger: 'Across a merger or matrix',
    onboarding: 'Awareness and onboarding',
    inclusion: 'Inclusion and trust',
    energy: 'Energy and friction',
  } satisfies Record<BankPurpose, string>,
  sensitivity: {
    low: 'Sensitivity: low.',
    medium: 'Sensitivity: medium. Answers say something about a colleague’s work.',
    high: 'Sensitivity: high. Answers judge a colleague or a relationship: give a clear purpose, a confidentiality statement and a chance to consult first, and report by group.',
  } satisfies Record<Sensitivity, string>,
  reversed:
    'Worded from the giver’s side: the colleague rated is the one who receives, so their incoming ties count what they are given.',
  meta: (role: LayerRole, scale: RelationScale) =>
    `${scaleCopy[scale].name}. Role: ${roleCopy[role].name}.`,
  add: 'Add',
  addLabel: (label: string) => `Add ${label}`,
  added: (label: string) => `Relation added from the question bank: ${label}.`,
  close: 'Close',
};
