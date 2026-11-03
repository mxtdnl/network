// Wording for the slide deck and the workshop pack (build plan session 17).
// Sentence case and plain (spec §12); questions pass the banned-word list (D74).

export const slidesCopy = {
  documentTitle: (project: string) => `${project}: slides`,
  subject: 'Organisational network analysis slides',
  subtitle: 'Slides for discussion',
  date: (d: string) => `Prepared on ${d}`,
  aboutData: 'About the data',
  more: 'Further figures are in the report.',
  question: 'Question',
  mapOnScreen: 'Network map',
  descriptive:
    'These slides describe patterns of working relationships. They do not assess anyone.',
  file: (date: string) => `graticule-slides-${date}.pdf`,
  dialog: {
    heading: 'Slides and workshop pack',
    slidesHelp:
      'A 16:9 PDF deck: an opening slide about the data, then one slide per saved view chosen for the report above, each with its caption as the title, the map and legend, and the sentences that describe it.',
    slides: 'Export slides',
    slidesExported: (file: string) => `Slides exported as ${file}.`,
    slidesFailed: (reason: string) => `The slides could not be exported. ${reason}`,
    packHelp:
      'A PDF for team workshops: for each group, its own network as a team workshop sees it, its ties with other groups, questions for discussion and a page of notes for the facilitator. Prepared for a team workshop, the pack holds that team only.',
    pack: 'Export workshop pack',
    packExported: (file: string) => `Workshop pack exported as ${file}.`,
    packFailed: (reason: string) => `The workshop pack could not be exported. ${reason}`,
  },
};

export const packCopy = {
  documentTitle: (project: string) => `${project}: workshop pack`,
  subject: 'Organisational network analysis workshop pack',
  title: 'Workshop pack',
  subtitle: (n: number, attribute: string) =>
    n === 1
      ? `Materials for one workshop, by ${attribute.toLowerCase()}`
      : `Materials for ${String(n)} workshops, one per ${attribute.toLowerCase()}`,
  date: (d: string) => `Prepared on ${d}`,
  intro:
    'Each workshop has its own section: the group’s own network, its row of the group connection matrix, questions for discussion, and a page of notes for the facilitator. Each section shows the group’s members only, as a team workshop does, so it can be handed to that group.',
  contents: 'Contents',
  groupHeading: (group: string) => group,
  networkHeading: 'The group’s own network',
  named: 'Members are named: the group agreed to be named.',
  codes: 'Members appear as codes: the group has not agreed to be named.',
  rowHeading: 'Ties with other groups',
  rowIntro: (layer: string, directed: boolean) =>
    directed
      ? `From the group connection matrix, on ${layer.toLowerCase()}: ties the group’s members gave to each other group and received from it, and the share of possible pairs between the two groups that are tied either way. Groups below the minimum size are counted together, or left out.`
      : `From the group connection matrix, on ${layer.toLowerCase()}: ties between the group’s members and each other group, and the share of possible pairs between the two groups that are tied. Groups below the minimum size are counted together, or left out.`,
  columns: {
    group: 'Group',
    within: 'Within the group',
    given: 'Ties given',
    received: 'Ties received',
    ties: 'Ties',
    share: 'Share of possible pairs',
  },
  noRow: 'The group connection matrix has no row for this group.',
  promptsHeading: 'Questions for discussion',
  promptsIntro:
    'Questions to open the conversation. They describe patterns, not people, and none has a right answer.',
  prompts: {
    within: (share: string) =>
      `About ${share} of possible pairs within the group are tied. How does work move between people here, and who would a newcomer go to first?`,
    outside: (group: string) =>
      `The group has most ties with ${group}. What is that connection used for, and is it the one the work needs?`,
    none: (groups: string) =>
      `The group has no ties with ${groups} on this layer. Is that what the work calls for?`,
    general: [
      'Where does information reach the group late, or not at all?',
      'Which connections would you like more of, and which take more time than they return?',
      'What would you change about how the group works with others, and what would you keep?',
    ],
  },
  observation: 'From the insight rules',
  notesHeading: 'Notes for the facilitator',
  notesTitle: (group: string) => `${group}: notes for the facilitator`,
  discussTitle: (group: string) => `${group}: ties and questions`,
  notes: {
    purpose:
      'The purpose is a conversation about how work happens, not a review of anyone. The map shows patterns in what people reported; it is not a measure of performance.',
    before: (members: number, coverage: string) =>
      `The group has ${String(members)} members on the roster. ${coverage}`,
    coverageFine: (rate: string) =>
      `Coverage across the project is ${rate}, at or above the threshold.`,
    coverageLow: (rate: string, threshold: string) =>
      `Coverage across the project is ${rate}, below the ${threshold} threshold: read every pattern with caution, and say so in the room.`,
    noRatings: (n: number) =>
      n === 1
        ? 'One member of the group gave no ratings: their own ties rest on what colleagues reported.'
        : `${String(n)} members of the group gave no ratings: their own ties rest on what colleagues reported.`,
    names:
      'Members appear by name, because the group agreed. Agree before the session how the map will be shown and to whom.',
    codes:
      'Members appear as codes. Do not decode them in the room; anyone may say which code is theirs if they wish.',
    signed:
      'The pack draws no ratings of how people feel about each other, and no friction, whatever the export settings: they are for the analyst only.',
    running: [
      'Open with the question the engagement asks, and what will happen to the results.',
      'Show the map for a minute before speaking; ask what people notice first.',
      'Keep the conversation on patterns and on work. If someone is singled out, bring it back to the group.',
      'Close by agreeing one or two things to try, with an owner and a date, for the action log.',
    ],
    runningHeading: 'Running the session',
  },
  file: (date: string) => `graticule-workshop-pack-${date}.pdf`,
  coverCodes: 'Members appear as codes throughout: names were hidden when the pack was prepared.',
  coverExcluded:
    'Ratings of how people feel about each other and friction were left out of the analysis.',
  noGroups: 'No group has members to show: the pack needs a grouping attribute with values.',
  pageOf: (page: number, pages: number) => `${String(page)} of ${String(pages)}`,
};
