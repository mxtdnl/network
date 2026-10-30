// Wording for import and the validation report (spec §5, §12: errors say what
// went wrong and how to fix it). The validator emits structured issues; this
// file turns them into sentences.

import type { MatchLevel, SuggestionReason } from '../../data/import/match';
import type { Issue } from '../../data/import/validate';

const n = (count: number, one: string, many: string) =>
  `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`;

const rowList = (rows: number[] | undefined) =>
  rows && rows.length > 0
    ? `${rows.length === 1 ? 'row' : 'rows'} ${rows.map(String).join(', ')}`
    : '';

const quote = (v: string | null) => `“${v ?? ''}”`;

export const importCopy = {
  title: 'Import survey data',
  intro:
    'Choose a members file and, if you have one, a ties file. Both can be CSV or XLSX. The files are checked before anything is imported.',
  membersLabel: 'Members file',
  membersHelp: 'One row per member. Required columns: id, display_name.',
  tiesLabel: 'Ties file',
  tiesHelp:
    'One row per rating, with the columns rater_id, ratee_id, variable and value (optional: wave). Or a survey tool’s export, with one row per respondent and a column for each colleague and question: Graticule recognises it and asks how to read it.',
  tiesOnlyHelp: 'Ties are added to the open project, whose members they must name.',
  replaceWarning:
    'Importing a members file replaces the open project. Save it first if you need it.',
  templates: 'Download a template',
  templateMembers: 'Members template (CSV)',
  templateTies: 'Ties template (CSV)',
  templateMembersXlsx: 'Members template (XLSX)',
  templateTiesXlsx: 'Ties template (XLSX)',
  templateWide: 'Survey export template, one row per respondent (CSV)',
  templateWideXlsx: 'Survey export template, one row per respondent (XLSX)',
  chooseFile: 'Choose file',
  noFile: 'No file chosen',
  check: 'Check files',
  checking: 'Checking files…',
  cancel: 'Cancel',
  back: 'Choose other files',
  needMembers: 'Choose a members file to start a new project.',
  unreadable: (name: string, reason: string) =>
    `${name} could not be read: ${reason} Save it as CSV (UTF-8) or XLSX and try again.`,
  unsupportedType:
    'Graticule reads .csv and .xlsx files. Save the sheet in one of these formats and try again.',

  reportTitle: 'Validation report',
  rowNumbers:
    'Row numbers match your spreadsheet, where row 1 is the header. Fix the rows in your file and check it again, or import the valid rows now and skip the rest.',
  fileSummary: (valid: number, total: number, unit: 'rows' | 'ratings' = 'rows') =>
    unit === 'ratings'
      ? `${n(valid, 'rating', 'ratings')} of ${total.toLocaleString('en-GB')} can be imported.`
      : `${n(valid, 'row', 'rows')} of ${total.toLocaleString('en-GB')} can be imported.`,
  skipped: (count: number, unit: 'rows' | 'ratings' = 'rows') => {
    const [one, many] = unit === 'ratings' ? ['rating', 'ratings'] : ['row', 'rows'];
    return count === 0 ? `No ${many} will be skipped.` : `${n(count, one, many)} will be skipped.`;
  },
  blocked: 'This file cannot be imported until the problems below are fixed.',
  noProblems: 'No problems found.',
  tiesDeferred: 'The ties file is checked once the members file can be imported.',
  problemsHeading: (count: number) => n(count, 'problem', 'problems'),
  notesHeading: 'Also read from the file',
  columns: { row: 'Row', column: 'Column', value: 'Value', problem: 'Problem' },
  showAll: (count: number) => `Show all ${count.toLocaleString('en-GB')} problems`,
  importValid: (count: number) => `Import ${n(count, 'valid row', 'valid rows')}`,
  nothingToImport: 'There are no valid rows to import.',
  imported: (rows: number, skipped: number) =>
    `Imported ${n(rows, 'row', 'rows')}.` +
    (skipped > 0 ? ` ${n(skipped, 'row was', 'rows were')} skipped.` : ''),
  untitled: 'Imported project',
  file: { members: 'Members file', ties: 'Ties file', export: 'Survey export' },
  importRatings: (count: number) => `Import ${n(count, 'valid rating', 'valid ratings')}`,
  importBoth: (rows: number, ratings: number) =>
    `Import ${n(rows, 'valid row', 'valid rows')} and ${n(ratings, 'rating', 'ratings')}`,
  importedBoth: (rows: number, ratings: number, skipped: number) =>
    `Imported ${n(rows, 'row', 'rows')} and ${n(ratings, 'rating', 'ratings')}.` +
    (skipped > 0 ? ` ${n(skipped, 'row or rating was', 'rows or ratings were')} skipped.` : ''),
  importedRatings: (ratings: number, skipped: number) =>
    `Imported ${n(ratings, 'rating', 'ratings')}.` +
    (skipped > 0 ? ` ${n(skipped, 'rating was', 'ratings were')} skipped.` : ''),
  backToWizard: 'Back to the survey export',

  // Reconciling attribute values (build plan session 13).
  reconcileHeading: 'Spellings to reconcile',
  reconcileIntro:
    'These values differ only in case or spacing, so they would be read as different groups. Tick the ones to write one way.',
  reconcileOption: (
    attribute: string,
    forms: { value: string; count: number }[],
    preferred: string,
  ) =>
    `${attribute}: ${forms.map((f) => `“${f.value}” (${f.count.toLocaleString('en-GB')})`).join(', ')}. Use “${preferred}” for all.`,
  reconcileAll: 'Tick all',

  problem(issue: Issue): string {
    const d = issue.detail ?? {};
    switch (issue.code) {
      case 'empty_file':
        return 'The file is empty. Add a header row and at least one data row.';
      case 'missing_column':
        return `There is no ${issue.column ?? ''} column. Add it to the header row (row 1).`;
      case 'duplicate_column':
        return `The header has more than one ${issue.column ?? ''} column. Keep one.`;
      case 'malformed_row':
        return 'This row could not be read cleanly, often because of an unclosed quotation mark. Check the row in a text editor.';
      case 'missing_field':
        return `${issue.column ?? ''} is empty. Every row needs one.`;
      case 'duplicate_id':
        return `The id ${quote(issue.value)} is also used on ${rowList(d.rows)}. Each member needs a unique id; all rows that share it are skipped.`;
      case 'unknown_id':
        return d.skippedMember
          ? `${quote(issue.value)} is in the members file, but its row has a problem and will be skipped. Fix that row first.`
          : `${quote(issue.value)} is not an id in the members file. Check the spelling, or add the member.`;
      case 'self_rating':
        return 'The rater and the person rated are the same member. Self-ratings are not recorded; remove the row.';
      case 'self_manager':
        return 'A member cannot be their own manager. Leave manager_id empty or name another member.';
      case 'unknown_variable':
        return d.suggestion
          ? `${quote(issue.value)} is not a layer key. Did you mean ${d.suggestion}? Variables use the layer key, not its label.`
          : `${quote(issue.value)} is not a layer in this project. Use a layer key such as connection_strength.`;
      case 'non_numeric':
        return `${quote(issue.value)} is not a number. Enter a plain number such as 3 or -2, or leave the cell empty if no rating was given.`;
      case 'out_of_range':
        return `${quote(issue.value)} is outside the ${d.variable ?? ''} scale, which runs from ${String(d.min)} to ${String(d.max)}.`;
      case 'unknown_category':
        return `${quote(issue.value)} is not a category of ${d.variable ?? 'this layer'}. Use one of: ${(d.categories ?? []).join(', ')}.`;
      case 'invalid_wave':
        return `${quote(issue.value)} is not a wave number. Use a whole number from 1, or leave the cell empty for wave 1.`;
      case 'duplicate':
        return d.existing
          ? 'The open project already has this rating. It is not overwritten; remove the row or edit the rating in the matrix.'
          : `The same rater, person rated, variable and wave also appear on ${rowList(d.rows)}. All of these rows are skipped; keep one.`;
      case 'not_rated':
        return `${n(d.count ?? 0, 'row has', 'rows have')} an empty value. ${(d.count ?? 0) === 1 ? 'It is' : 'They are'} stored as not rated, not as 0.`;
      case 'not_applicable':
        return `${n(d.count ?? 0, 'row says', 'rows say')} n/a. ${(d.count ?? 0) === 1 ? 'It is' : 'They are'} stored as “does not apply”: not 0, and left out of coverage.`;
      case 'disabled_layer':
        return `${n(d.count ?? 0, 'rating is', 'ratings are')} for ${d.variable ?? ''}, a layer that is turned off. They are imported and used when you turn the layer on.`;
      case 'later_wave':
        return `${n(d.count ?? 0, 'rating is', 'ratings are')} for wave 2 or later. They are stored; this version shows wave 1 only.`;
      case 'other_sheets':
        return `Only the first sheet was read. ${n(d.sheets?.length ?? 0, 'other sheet was', 'other sheets were')} not read: ${(d.sheets ?? []).join(', ')}.`;
      case 'new_attribute':
        return `The column ${issue.column ?? ''} becomes a new member attribute.`;
      case 'no_respondent_column':
        return 'No column is chosen as the respondent. Go back to the survey export and choose the column that holds their id, email or name.';
      case 'missing_respondent':
        return `This row has ${n(d.count ?? 0, 'answer', 'answers')} but no respondent, so ${(d.count ?? 0) === 1 ? 'it is' : 'they are'} skipped.`;
      case 'unmatched_respondent':
        return `${quote(issue.value)} is not matched to anyone in the roster, so the ${n(d.count ?? 0, 'answer', 'answers')} on this row ${(d.count ?? 0) === 1 ? 'is' : 'are'} skipped. Choose the member under People, or add them to the roster.`;
      case 'duplicate_respondent':
        return `This respondent also answered on ${rowList(d.rows)}. All of their rows are skipped; keep one in the file.`;
      case 'unmatched_colleague':
        return `${quote(issue.value)} is not matched to anyone in the roster, so ${n(d.count ?? 0, 'answer', 'answers')} about them ${(d.count ?? 0) === 1 ? 'is' : 'are'} skipped. Choose the member under People.`;
      case 'question_not_imported':
        return `${issue.value ? quote(issue.value) : 'The unlabelled question'} is not imported, because no relation is chosen for it: ${n(d.count ?? 0, 'answer is', 'answers are')} left out.`;
      case 'empty_cells':
        return `${n(d.count ?? 0, 'answer was', 'answers were')} left empty. Nothing is recorded for them, so they count as not rated.`;
      case 'ignored_columns':
        return `${n(d.count ?? 0, 'other column is', 'other columns are')} not read, such as timestamps or other questions.`;
      case 'skipped_header_rows':
        return `${rowList(d.rows).replace(/^r/, 'R')} ${(d.rows?.length ?? 0) === 1 ? 'holds' : 'hold'} import codes rather than answers and ${(d.rows?.length ?? 0) === 1 ? 'is' : 'are'} not read.`;
    }
  },
} as const;

const LEVEL: Record<MatchLevel, string> = {
  id: 'by id',
  email: 'by email',
  name: 'by name',
  normalised: 'ignoring case and spacing',
};

const REASON: Record<SuggestionReason, string> = {
  accents: 'the same name without accents or punctuation',
  order: 'the same name in another order',
  initial: 'the same name with an initial',
  spelling: 'a close spelling',
  email_name: 'an email address made from the name',
};

/** The import wizard for survey tools' wide exports (build plan session 13). */
export const wideCopy = {
  heading: 'Survey export',
  steps: ['Layout', 'Questions', 'People', 'Preview'] as const,
  stepOf: (step: number, total: number, name: string) =>
    `Step ${String(step)} of ${String(total)}: ${name}`,
  next: 'Next',
  previous: 'Previous',
  check: 'Check ratings',
  chooseOther: 'Choose other files',
  cancel: 'Cancel',

  detected: (respondents: number, colleagues: number, questions: number, columns: number) =>
    `This reads as a survey tool’s export: ${n(respondents, 'respondent', 'respondents')}, with ${n(columns, 'column', 'columns')} of answers about ${n(colleagues, 'colleague', 'colleagues')} and ${n(questions, 'question', 'questions')}.`,
  notDetected:
    'No column of this file names a colleague in the roster. Try two header rows, or check that the file is the export you expected.',
  headerRows: 'Header rows',
  headerOne: 'One header row: each column names its question and colleague',
  headerTwo: 'Two header rows: questions in the first, colleagues in the second',
  headerHelp:
    'Graticule chose the reading that finds the most colleagues. A row of import codes under the header is not read.',
  respondentColumn: 'Column that names the respondent',
  respondentHelp:
    'Respondents are matched to the roster by id, email or name. Choose the column with the fewest people to confirm.',
  noColumn: 'None',
  columnOption: (letter: string, header: string) =>
    header === '' ? `Column ${letter}` : `${letter}: ${header}`,
  otherColumns: (count: number) =>
    count === 0
      ? 'Every other column holds answers.'
      : `${n(count, 'other column is', 'other columns are')} not read, such as timestamps or other questions.`,

  questionsIntro:
    'Choose the relation each question records. A question is matched to a relation by its key, label or wording; one you leave out is not imported.',
  questionLabel: (i: number) => `Question ${String(i)}`,
  unlabelled: 'Unlabelled question (the columns name only colleagues)',
  questionColumns: (count: number) => n(count, 'column', 'columns'),
  relation: 'Relation',
  doNotImport: 'Do not import',
  answersHeading: 'Answers written as words',
  answersHelp:
    'Each answer is recorded as the value you choose. One left as “Not mapped” is reported in the validation report and skipped.',
  answerColumns: { answer: 'Answer', count: 'Given', value: 'Recorded as' },
  answerSelect: (answer: string) => `Recorded value for “${answer}”`,
  notMapped: 'Not mapped',
  notApplicable: 'n/a: does not apply',
  scaleValue: (value: string, label: string | undefined) => (label ? `${value}: ${label}` : value),

  peopleIntro:
    'Exact matches by id, email or name, then matches ignoring case and spacing, are made for you. A suggestion or a name shared by several members needs your choice; until then, their answers are left out.',
  colleaguesHeading: 'Colleagues in the column headers',
  respondentsHeading: 'Respondents',
  summary: (matched: number, total: number, levels: [MatchLevel, number][]) =>
    `${matched.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} matched` +
    (levels.length > 0
      ? `: ${levels.map(([l, c]) => `${c.toLocaleString('en-GB')} ${LEVEL[l]}`).join(', ')}.`
      : '.'),
  toDecide: (count: number) =>
    count === 0
      ? 'Nothing to confirm.'
      : `${count.toLocaleString('en-GB')} ${count === 1 ? 'needs' : 'need'} your choice.`,
  showMatched: (count: number) => `Show the ${n(count, 'match', 'matches')} made`,
  peopleColumns: { label: 'In the file', status: 'Match', member: 'Member' },
  rowLabel: (row: number, label: string) =>
    label === '' ? `Row ${String(row)}: no name` : `Row ${String(row)}: ${label}`,
  memberSelect: (label: string) => `Member for “${label}”`,
  notMatched: 'Not matched',
  suggested: 'Suggested',
  everyone: 'Everyone in the roster',
  status: {
    matched: (by: MatchLevel) => `Matched ${LEVEL[by]}`,
    ambiguous: (count: number) => `${n(count, 'member has', 'members have')} this name`,
    suggested: 'Suggestions to confirm',
    unmatched: 'No match',
  },
  reason: (reason: SuggestionReason) => REASON[reason],
  candidate: (name: string, reason: SuggestionReason | null) =>
    reason ? `${name} (${REASON[reason]})` : name,

  previewIntro: (ratings: number, answers: number) =>
    `${n(ratings, 'rating', 'ratings')} of ${n(answers, 'answer', 'answers')} will be checked. The validation report then lists every problem at its row and column in your file.`,
  previewCaption: (shown: number, total: number) =>
    shown < total
      ? `The first ${shown.toLocaleString('en-GB')} ratings, as long rows`
      : 'The ratings, as long rows',
  previewColumns: {
    cell: 'Cell',
    rater: 'Respondent',
    ratee: 'Colleague',
    relation: 'Relation',
    value: 'Value',
  },
  previewEmpty: 'No ratings would be imported. Go back and choose relations and people.',
} as const;
