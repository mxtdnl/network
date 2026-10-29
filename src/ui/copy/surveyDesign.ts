// Design guidance in Survey setup (build plan session 12, CLAUDE.md D182;
// method notes §21). Figures come from the draft and the project; the wording
// is here.

import { percent } from './data';

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
const minutes = (m: number) => plural(m, 'minute', 'minutes');

export const designCopy = {
  heading: 'Designing the survey',
  intro:
    'A whole-network survey asks everyone about everyone they work with. These notes help you keep it short, clear and complete.',

  purposeHeading: 'Start from your question',
  purposeHelp:
    'Choose what you want to find out. The question bank suggests relations for it; adapt their wording to your client’s issue.',
  purposeField: 'What do you want to find out?',
  purposeNone: 'Choose a purpose',
  suggested: 'Suggested questions',
  addFromPurpose: 'Add questions for this purpose',
  count: (n: number) =>
    n > 5
      ? `This survey asks ${plural(n, 'question', 'questions')} about each colleague, more than five. Three to five keep a survey short enough to answer with care: consider leaving some out.`
      : `This survey asks ${plural(n, 'question', 'questions')} about each colleague. Three to five keep a survey short enough to answer with care.`,
  anchors:
    'Use answer labels that mean the same to everyone, such as “Weekly” rather than “Often”.',

  entryHeading: 'Rate everyone, or select first?',
  fullName: 'Rate every colleague',
  fullRecords:
    'Records an answer about every pair, including “never” for colleagues a respondent does not work with. Simplest to interpret, and nobody is forgotten.',
  nominateName: 'Select colleagues, then rate them',
  nominateRecords:
    'Records answers about the colleagues each respondent selects. A colleague not selected is recorded as each question says (the lowest point, or does not apply). Shorter for large rosters, but colleagues met rarely may be forgotten.',
  cost: (m: number) => `About ${minutes(m)} for each respondent here.`,
  costNominate: (m: number, k: number) =>
    `About ${minutes(m)} for each respondent here, with ${plural(k, 'colleague', 'colleagues')} selected.`,
  current: 'Chosen',

  rateHeading: 'The response rate you need',
  rateBody: (threshold: number, members: number, needed: number) =>
    `Each person who does not respond leaves out every rating they would have given, so the map shows only one side of their ties. The project’s coverage threshold is ${percent(threshold)}: with ${plural(members, 'person', 'people')}, at least ${plural(needed, 'person needs', 'people need')} to respond.`,
  bothWays: (threshold: number, both: number) =>
    `When a share r of people respond, about r × r of pairs are reported from both sides: at ${percent(threshold)}, about ${percent(both)}.`,
  practice:
    'What helps: an announcement from a sponsor before the links go out, time set aside in working hours to answer, a deadline about two weeks away, and two reminders to those who have not responded. Once the survey is created, its page offers a launch kit with drafts of each message.',
} as const;
