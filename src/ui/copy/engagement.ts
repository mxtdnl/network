// Wording for the engagement guide, the assessment against intent, the action
// log, outcomes, the guided first run and "Explain this view" (build plan
// session 16). Sentence case and plain (spec §12). Strings the insights copy
// test reads (tests/unit/insightsCopy.test.ts) avoid the banned words.

import type { ActionStatus, EngagementStep, ExpectedLevel } from '../../data/schema';
import type { IntentVerdict } from '../../data/intent';

const pct = (x: number) => `${String(Math.round(100 * x))}%`;
const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

export const engagementCopy = {
  tab: 'Engagement',
  stepsLabel: 'Engagement steps',
  allTools: 'All tools',
  allToolsHelp:
    'Every tab and control, as in earlier versions. Choose a step to see only what that step needs.',
  advanced: 'Advanced: show every tab',
  advancedHelp: 'The tabs this step does not need are hidden until you show them here.',
  start: 'Start an engagement',
  startHelp:
    'An engagement record keeps the business question, who sees what, the client’s expectations, the actions agreed and the outcomes, and guides you through seven steps.',
  steps: {
    plan: 'Plan',
    collect: 'Collect',
    check: 'Check',
    understand: 'Understand',
    discuss: 'Discuss',
    act: 'Act',
    remeasure: 'Re-measure',
  } satisfies Record<EngagementStep, string>,
  stepNumber: (k: number, total: number) => `Step ${String(k)} of ${String(total)}`,
  purpose: {
    plan: 'Agree why the organisation wants to know, whom the survey covers and under what rules.',
    collect: 'Gather the ratings, by survey or from files.',
    check: 'Know what the data can support before reading anything into it.',
    understand: 'Find the patterns that bear on the business question.',
    discuss: 'Put the patterns to the client as questions, at the level each audience may see.',
    act: 'Agree what to do, who does it and by when.',
    remeasure: 'Run the survey again, see what changed and record the outcomes.',
  } satisfies Record<EngagementStep, string>,
  output: {
    plan: 'Engagement brief, printed in the report.',
    collect: 'Imported ratings and response rates.',
    check: 'The data-quality statement.',
    understand: 'Saved views and the assessment against expectations.',
    discuss: 'The report and the presentation.',
    act: 'The action log, in the report and as a CSV file.',
    remeasure: 'The change between waves and the outcomes recorded.',
  } satisfies Record<EngagementStep, string>,
  outputLabel: 'Output:',
  checklist: (done: number, total: number) => `Checklist: ${String(done)} of ${String(total)} done`,
  autoDone: 'done in the project',
  checks: {
    question: 'Write down the business question',
    sponsor: 'Name the sponsor',
    boundary: 'Describe who is on the roster and why',
    governance: 'Say who sees each audience level and set a retention date',
    audience: 'Choose the default audience level',
    expectations: 'Record at least one of the client’s expectations',
    intent: 'Set the collaboration expected between groups',
    relations: 'Choose three to five relations to ask about',
    survey: 'Create the survey and check the key backup',
    launchKit: 'Send the announcement and invitations from the launch kit',
    imported: 'Import the responses or a ratings file',
    closed: 'Close the survey',
    coverage: 'Reach the coverage threshold, or note why not',
    statement: 'Read the data-quality statement',
    nonRespondents: 'Choose how members who gave no ratings are handled',
    habits: 'Review how each person rates',
    expectationsReviewed: 'Note what the data show for each expectation',
    intentRead: 'Read the assessment against expectations',
    insightsRead: 'Read the insights',
    viewSaved: 'Save at least one view with a caption',
    audiences: 'Choose an audience level for each session',
    summary: 'Edit the executive summary',
    shared: 'Export the report or hold the presentation',
    action: 'Record at least one action',
    actionsComplete: 'Give every action an owner, a date and what it answers',
    repeated: 'Repeat the survey for the next wave',
    changeRead: 'Review what changed between the waves',
    statuses: 'Update the status of every action',
    outcomes: 'Record the outcomes against the client’s criteria',
  },

  // The engagement tab
  sections: {
    brief: 'Engagement brief',
    expectations: 'The client’s expectations',
    intent: 'Collaboration expected between groups',
    assessment: 'Against expectations',
    actions: 'Action log',
    outcomes: 'Outcomes',
  },
  noProject: 'Add members or open a project to start an engagement.',
  readOnly: 'The engagement record can be read here but not changed on a phone.',
  brief: {
    question: 'Business question',
    questionHelp: 'What the organisation wants to understand, in its own words.',
    sponsor: 'Sponsor',
    boundary: 'Who is on the roster and why',
    audiences: 'Who sees the outputs at each audience level',
    audienceFor: (level: string) => `Who sees outputs prepared for ${level}`,
    retention: 'Delete the data by',
    retentionHelp:
      'The date agreed for deleting the ratings. Graticule reminds you once it has passed.',
    defaultLevel: 'Default audience level',
  },
  retentionPassed: (date: string) =>
    `The retention date set for this project, ${date}, has passed. Delete the data or agree a new date.`,

  expectation: {
    intro:
      'What the client expects the network to show, recorded before the results are seen, so the data can be read against it.',
    add: 'Add an expectation',
    added: 'Expectation added',
    text: 'Expectation',
    textLabel: (k: number) => `Expectation ${String(k)}`,
    link: 'Check it against',
    linkLabel: (k: number) => `Check expectation ${String(k)} against`,
    none: 'Nothing in the data (notes only)',
    pair: (a: string, b: string) => `Ties between ${a} and ${b}`,
    group: (v: string) => `Ties within ${v} and with everyone else`,
    question: (q: string) => `The question: ${q}`,
    pairs: 'Pairs of groups',
    groups: 'Groups',
    questions: 'Questions',
    notes: 'What the data show, in your words',
    notesLabel: (k: number) => `Notes on expectation ${String(k)}`,
    data: 'What the data show',
    remove: 'Remove',
    removeLabel: (k: number) => `Remove expectation ${String(k)}`,
    removed: 'Expectation removed',
    empty: 'No expectations recorded yet.',
    noResult: 'The figures appear once the analysis has run.',
  },

  intent: {
    intro:
      'For each pair of groups, how much the client expects them to work together. The assessment counts a pair of members as tied when their tie reaches 0.30 on the layer chosen.',
    groupsBy: (attr: string) => `Groups by ${attr}, as the insight rules group members.`,
    layer: 'Count ties on',
    level: (a: string, b: string) => `Expected between ${a} and ${b}`,
    levels: {
      none: 'Little or none (below 5%)',
      occasional: 'Occasional (5% to 15%)',
      regular: 'Regular (15% to 40%)',
      close: 'Close (40% or more)',
    } satisfies Record<ExpectedLevel, string>,
    levelShort: {
      none: 'Little or none',
      occasional: 'Occasional',
      regular: 'Regular',
      close: 'Close',
    } satisfies Record<ExpectedLevel, string>,
    notSet: 'Not set',
    noGroups: 'Members need a team or another category attribute with at least two values.',
    saved: 'Expected collaboration saved',
  },

  assessment: {
    intro:
      'Where ties between groups fall below, within or above what the client expected. A share is of the pairs of members who could be tied between the two groups.',
    layerLine: (layer: string, view: string) => `Ties on ${layer}, ${view}, at 0.30 or more.`,
    directed: 'either direction counted',
    mutual: (rule: string) => `the two directions combined by ${rule}`,
    groups: 'Groups',
    pairRow: (a: string, b: string) => `${a} and ${b}`,
    expected: 'Expected',
    observed: 'Tied pairs',
    result: 'Compared with the expectation',
    verdict: {
      below: 'Below the expected range',
      within: 'Within the expected range',
      above: 'Above the expected range',
    } satisfies Record<IntentVerdict, string>,
    noPairs: 'No pairs possible in this wave',
    observedCell: (tied: number, possible: number, share: number) =>
      `${String(tied)} of ${String(possible)} (${pct(share)})`,
    few: 'Few pairs possible: one tie moves the share a long way.',
    empty: 'No collaboration expected between groups has been set. Set it under Plan.',
    noResult: 'The assessment appears once the analysis has run.',
    sentence: (a: string, b: string, tied: number, possible: number, share: number) =>
      `${String(tied)} of the ${String(possible)} possible pairs between ${a} and ${b} are tied (${pct(share)}).`,
    groupSentence: (
      v: string,
      inside: number,
      insideShare: number,
      outside: number,
      outsideShare: number,
    ) =>
      `Within ${v}, ${pct(insideShare)} of possible pairs are tied (${String(inside)}); between ${v} and everyone else, ${pct(outsideShare)} (${String(outside)}).`,
    verdictSentence: (verdict: IntentVerdict, level: ExpectedLevel) =>
      `${engagementCopy.assessment.verdict[verdict]} for ${engagementCopy.intent.levelShort[level].toLowerCase()} collaboration.`,
  },

  actions: {
    intro:
      'Actions the client agreed in discussion, each linked to the observation, expectation or pair of groups it answers.',
    add: 'Add an action',
    added: 'Action added to the action log',
    addFromInsight: 'Add action',
    addFromInsightLabel: (label: string) => `Add an action for ${label}`,
    text: 'Action',
    textLabel: (k: number) => `Action ${String(k)}`,
    link: 'Answers',
    linkLabel: (k: number) => `What action ${String(k)} answers`,
    noLink: 'Not linked',
    observations: 'Observations',
    observation: (text: string, wave: number, multi: boolean) =>
      multi ? `${text} (wave ${String(wave)})` : text,
    expectation: (text: string) => `Expectation: ${text || 'untitled'}`,
    pair: (a: string, b: string) => `Ties between ${a} and ${b}`,
    owner: 'Owner',
    ownerLabel: (k: number) => `Owner of action ${String(k)}`,
    due: 'Due',
    dueLabel: (k: number) => `Due date of action ${String(k)}`,
    status: 'Status',
    statusLabel: (k: number) => `Status of action ${String(k)}`,
    statuses: {
      proposed: 'Proposed',
      agreed: 'Agreed',
      inProgress: 'In progress',
      done: 'Done',
      dropped: 'Dropped',
    } satisfies Record<ActionStatus, string>,
    notes: 'Notes',
    notesLabel: (k: number) => `Notes on action ${String(k)}`,
    remove: 'Remove',
    removeLabel: (k: number) => `Remove action ${String(k)}`,
    removed: 'Action removed',
    empty: 'No actions recorded yet. Add one here, or from an observation in Insights.',
    count: (n: number) => count(n, 'action', 'actions'),
    exportCsv: 'Export action log',
    exported: 'Action log exported',
  },

  outcomes: {
    intro:
      'How the client judges what the engagement achieved, against criteria agreed with them. The suggested criteria can be changed.',
    criteria: 'Criteria',
    criteriaHelp: 'One criterion per line.',
    add: 'Record an outcome',
    added: 'Outcome added',
    criterion: 'Criterion',
    criterionLabel: (k: number) => `Criterion of outcome ${String(k)}`,
    assessment: 'What was seen',
    assessmentLabel: (k: number) => `What was seen for outcome ${String(k)}`,
    wave: 'Wave',
    waveLabel: (k: number) => `Wave of outcome ${String(k)}`,
    noWave: 'No wave',
    waveN: (w: number) => `Wave ${String(w)}`,
    date: 'Date',
    dateLabel: (k: number) => `Date of outcome ${String(k)}`,
    remove: 'Remove',
    removeLabel: (k: number) => `Remove outcome ${String(k)}`,
    removed: 'Outcome removed',
    empty: 'No outcomes recorded yet.',
  },

  // Exports (the report and the action log CSV)
  export: {
    question: (q: string) => `Business question: ${q}`,
    sponsor: (s: string) => `Sponsor: ${s}`,
    boundary: (b: string) => `Who the survey covered: ${b}`,
    seenBy: (level: string, who: string) => `Outputs prepared for ${level} are seen by: ${who}`,
    retention: (date: string) => `The data is to be deleted by ${date}.`,
    expectationsIntro:
      'What the client expected before seeing the results, and what the data show. The data describe how people say they work together; they do not show whether an expectation was right to hold.',
    expectationLead: (k: number) => `Expectation ${String(k)}.`,
    notesLead: 'Notes:',
    actionsHeading: 'Agreed actions',
    pairHidden: 'A pair of groups not shown at this level',
    leftOut: (n: number) =>
      `${count(n, 'action about negative ratings is', 'actions about negative ratings are')} left out of this export, with the layers they concern.`,
    columns: {
      action: 'Action',
      answers: 'Answers',
      owner: 'Owner',
      due: 'Due',
      status: 'Status',
      notes: 'Notes',
      created: 'Recorded on',
    },
  },

  // The guided first run
  tour: {
    title: 'Guided first run',
    offer: 'Take the guided first run',
    offerHelp:
      'About ten minutes on the demo: three tasks that show how a question leads to a view.',
    menu: 'Guided first run',
    region: 'Guided first run',
    taskOf: (k: number, total: number) => `Task ${String(k)} of ${String(total)}`,
    tasks: [
      {
        title: 'Find the team that keeps to itself',
        hint: 'Open the Groups tab and choose the team whose ties stay mostly within it, or show the Silos observation from Insights on the map.',
      },
      {
        title: 'Who links Finance to the rest?',
        hint: 'Show the “Only routes between groups” observation on the map, or open the member panel of a member it names.',
      },
      {
        title: 'What would you ask that team?',
        hint: 'In Insights, choose “Save as view” on an observation. The view keeps the question as its caption, ready to put to the client.',
      },
    ],
    showMe: 'Show me',
    next: 'Next task',
    done: 'Task done',
    notYet: 'Not done yet',
    skip: 'Skip the first run',
    finish: 'Finish',
    finished: 'First run finished. Help → Guided first run starts it again.',
    skipped: 'First run skipped. Help → Guided first run starts it again.',
    loadsDemo: 'The first run loads the demo, which replaces the open project.',
    started: 'Guided first run started on the demo',
  },

  // "Explain this view"
  explain: {
    button: 'Explain this view',
    heading: 'What this view shows',
    glossary: 'What these terms mean',
    members: (shown: number, total: number) =>
      shown === total
        ? `The map shows all ${String(total)} members.`
        : `The map shows ${String(shown)} of ${String(total)} members.`,
    filters: (text: string) => `Only members with ${text} are shown.`,
    ego: (name: string, depth: number) =>
      `Only ${name} and the members within ${depth === 1 ? 'one step' : 'two steps'} of them are shown.`,
    removed: (n: number) => `${count(n, 'member is', 'members are')} removed in the simulation.`,
    tiesDirected: (layer: string, drawn: number) =>
      `Each line is a tie on ${layer}: ${String(drawn)} drawn. An arrow points from the member who gave the rating to the member rated; a pair rated both ways is one line without arrows.`,
    tiesMutual: (layer: string, drawn: number, rule: string) =>
      `Each line is a tie on ${layer}: ${String(drawn)} drawn, with the two directions of a pair combined by ${rule}.`,
    range: (from: string, to: string) =>
      `Ties below ${from} or above ${to} are hidden; every figure counts all ties.`,
    rangeFrom: (from: string) => `Ties below ${from} are hidden; every figure counts all ties.`,
    rangeTo: (to: string) => `Ties above ${to} are hidden; every figure counts all ties.`,
    hiddenLayers: (labels: string) => `Pairs with a tie on ${labels} are hidden.`,
    negative: 'Negative ratings are drawn whatever their strength.',
    size: (metric: string, rank: boolean) =>
      rank ? `Larger circles rank higher on ${metric}.` : `Larger circles have higher ${metric}.`,
    fillAttribute: (label: string) => `Circle colour shows ${label}.`,
    fillCommunity: 'Circle colour shows the clusters (communities) found in the ties.',
    width: (variable: string) => `Line width shows ${variable}.`,
    widthUniform: 'Every line has the same width.',
    colour: (variable: string) => `Line colour shows ${variable}.`,
    colourNone: 'Line colour is not used.',
    style:
      'Solid lines are formal collaboration, dashed lines informal, and both together a solid line with a dashed one beside it.',
    layout: {
      force: 'Members with stronger ties are drawn closer together; distance means nothing more.',
      grouped: (by: string) => `Members are placed in groups by ${by}.`,
      circular: (by: string) => `Members sit on a circle, in arcs by ${by}.`,
      hierarchy:
        'Managers sit above the people who report to them; the lines between rows are informal collaboration.',
    },
    outlines: 'Grey outlines surround the clusters found in the ties.',
    bridges: (n: number) =>
      `Diamonds mark ${count(n, 'bridge tie', 'bridge ties')}: ties whose two members have no contact in common.`,
    highlight: (n: number) =>
      `${count(n, 'member is', 'members are')} highlighted; everyone else is faded.`,
    wave: (w: number) => `The ratings are those collected in wave ${String(w)}.`,
    composite: (statement: string) => statement,
  },
};

/** The audience-facing level label is in copy/audience.ts; this names it in sentences. */
export function verdictWord(v: IntentVerdict | null): string {
  return v === null ? engagementCopy.assessment.noPairs : engagementCopy.assessment.verdict[v];
}
