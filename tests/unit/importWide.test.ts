// Import from survey tools (build plan session 13): detecting a wide export,
// matching people, ambiguous names, and the validation report of the result.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultLayers } from '../../src/data/defaults';
import { parseCsv } from '../../src/data/import/csv';
import { parseXlsx } from '../../src/data/import/xlsx';
import { Matcher, rosterPeople } from '../../src/data/import/match';
import { findVariants, reconcileMembers } from '../../src/data/import/reconcile';
import { validateMembers, validateTies } from '../../src/data/import/validate';
import { tieKey } from '../../src/data/schema';
import {
  analyseImport,
  autoAnswer,
  columnLetter,
  defaultChoices,
  validateWide,
  wideAnswers,
  wideToLong,
} from '../../src/data/import/wide';
import {
  bracketExportCsv,
  codedExportCsv,
  duplicateRespondentCsv,
  twoRowExportCsv,
  wideRosterCsv,
} from '../fixtures/import/wide-exports';

const templates = join(import.meta.dirname, '..', '..', 'public', 'templates');
const layers = defaultLayers();
const roster = validateMembers(parseCsv('roster.csv', wideRosterCsv));
const people = rosterPeople(roster.members, roster.attributes);
const context = { memberIds: new Set(roster.members.map((m) => m.id)), layers };

function wide(csv: string, name = 'export.csv') {
  const table = parseCsv(name, csv);
  const analysis = analyseImport(table, people, layers);
  return { table, analysis, choices: defaultChoices(table, analysis, layers) };
}

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('matching people', () => {
  const m = new Matcher(people);

  it('matches by id, email and name exactly', () => {
    expect(m.match('W01')).toEqual({ status: 'matched', memberId: 'W01', by: 'id' });
    expect(m.match('zoe@example.org')).toEqual({ status: 'matched', memberId: 'W03', by: 'email' });
    expect(m.match(' Zoë Hart ')).toEqual({ status: 'matched', memberId: 'W03', by: 'name' });
  });

  it('then ignoring case and spacing', () => {
    expect(m.match('w01')).toEqual({ status: 'matched', memberId: 'W01', by: 'normalised' });
    expect(m.match('ada   EXAMPLE')).toEqual({
      status: 'matched',
      memberId: 'W01',
      by: 'normalised',
    });
    expect(m.match('BRAM@example.org')).toMatchObject({ memberId: 'W02', by: 'normalised' });
  });

  it('never settles an ambiguous name', () => {
    expect(m.match('Sam Lee')).toEqual({
      status: 'ambiguous',
      candidates: ['W04', 'W05'],
      by: 'name',
    });
    expect(m.match('sam  lee')).toEqual({
      status: 'ambiguous',
      candidates: ['W04', 'W05'],
      by: 'normalised',
    });
  });

  it('offers suggestions that need confirmation', () => {
    const first = (label: string) => {
      const r = m.match(label);
      return r.status === 'suggested' ? r.suggestions[0] : r;
    };
    expect(first('Zoe Hart')).toEqual({ memberId: 'W03', reason: 'accents' });
    expect(first('Example, Ada')).toEqual({ memberId: 'W01', reason: 'order' });
    expect(first('A. Example')).toEqual({ memberId: 'W01', reason: 'initial' });
    expect(first('Ada Exmple')).toEqual({ memberId: 'W01', reason: 'spelling' });
    expect(first('chiara.conti@other.org')).toEqual({ memberId: 'W06', reason: 'email_name' });
    // Two Sam Lees: both suggested, neither chosen.
    const sams = m.match('Lee, Sam');
    expect(sams.status === 'suggested' && sams.suggestions.map((s) => s.memberId)).toEqual([
      'W04',
      'W05',
    ]);
    expect(m.match('Nobody Here')).toEqual({ status: 'unmatched' });
    expect(m.match('')).toEqual({ status: 'unmatched' });
  });
});

describe('detecting the format', () => {
  it('reads a long ties file as long and a members file as neither', () => {
    const long = parseCsv('ties.csv', readFileSync(join(templates, 'ties.csv'), 'utf8'));
    expect(analyseImport(long, people, layers).format).toBe('long');
    expect(analyseImport(parseCsv('r.csv', wideRosterCsv), people, layers).format).toBe('unknown');
  });

  it('reads colleagues in brackets, the respondent column and the relations', () => {
    const { analysis } = wide(bracketExportCsv);
    expect(analysis.format).toBe('wide');
    expect(analysis.layout.headerRows).toBe(1);
    expect(analysis.layout.respondentColumn).toBe(1);
    expect(analysis.layout.otherColumns).toEqual([0]);
    expect(analysis.questions.map((q) => [q.columns.length, q.layer])).toEqual([
      [5, 'connection_strength'],
      [2, 'valence'],
    ]);
    expect(analysis.colleagues.map((c) => [c.label, c.match.status])).toEqual([
      ['Ada Example', 'matched'],
      ['Bram Example', 'matched'],
      ['Zoe Hart', 'suggested'],
      ['Sam Lee', 'ambiguous'],
      ['Chiara Conti', 'matched'],
    ]);
    expect(
      analysis.respondents.map((r) =>
        r.match.status === 'matched' ? `${r.match.memberId}:${r.match.by}` : r.match.status,
      ),
    ).toEqual(['W02:email', 'W01:normalised', 'W06:name', 'unmatched']);
  });

  it('reads two header rows: the question spread over blank cells', () => {
    const { analysis } = wide(twoRowExportCsv);
    expect(analysis.layout.headerRows).toBe(2);
    expect(analysis.layout.respondentColumn).toBe(1);
    expect(analysis.questions).toHaveLength(1);
    expect(analysis.questions[0]?.layer).toBe('informal_collaboration');
    expect(analysis.colleagues.map((c) => c.label)).toEqual([
      'Ada Example',
      'Bram Example',
      'Zoë Hart',
    ]);
    expect(analysis.respondents.map((r) => r.row)).toEqual([3, 4]);
  });

  it('reads question codes over full texts and skips a row of import ids', () => {
    const { analysis } = wide(codedExportCsv);
    expect(analysis.layout.headerRows).toBe(2);
    expect(analysis.layout.skippedRows).toEqual([3]);
    expect(analysis.questions[0]?.layer).toBe('connection_strength');
    expect(analysis.respondents.map((r) => r.row)).toEqual([4]);
  });

  it('reads a misspelt colleague when the question is one already found', () => {
    const csv = [
      `Email,How strong is your working connection with this person? - Ada Example,How strong is your working connection with this person? - Ada Exmple`,
      'bram@example.org,3,4',
    ].join('\n');
    const { analysis } = wide(csv);
    expect(analysis.colleagues.map((c) => [c.label, c.match.status])).toEqual([
      ['Ada Example', 'matched'],
      ['Ada Exmple', 'suggested'],
    ]);
  });

  it('maps answer labels to scale values', () => {
    const byKey = new Map(layers.map((l) => [l.key, l]));
    expect(autoAnswer(byKey.get('valence'), 'very positive')).toBe('3');
    expect(autoAnswer(byKey.get('informal_collaboration'), 'Weekly')).toBe('3');
    expect(autoAnswer(byKey.get('connection_strength'), '4 - Strong')).toBe('4');
    expect(autoAnswer(byKey.get('connection_strength'), '9 - Off the scale')).toBeNull();
    expect(autoAnswer(byKey.get('valence'), 'Not applicable')).toBe('n/a');
    expect(autoAnswer(byKey.get('valence'), 'Fine')).toBeNull();
    const { table, analysis, choices } = wide(bracketExportCsv);
    expect(wideAnswers(table, analysis, layers, choices)).toEqual([
      {
        question: expect.stringContaining('positive') as string,
        text: 'Very positive',
        count: 1,
        value: '3',
      },
      {
        question: expect.stringContaining('positive') as string,
        text: 'Neutral',
        count: 1,
        value: '0',
      },
    ]);
  });

  it('names columns by spreadsheet letter', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnLetter)).toEqual([
      'A',
      'Z',
      'AA',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });
});

describe('converting and validating', () => {
  it('leaves out unconfirmed colleagues and unmatched respondents, and reports each at its cell', () => {
    const { table, analysis, choices } = wide(bracketExportCsv);
    const result = validateWide(table, analysis, choices, context);
    expect(result.report).toMatchObject({
      file: 'export',
      unit: 'ratings',
      totalRows: 17,
      validRows: 8,
      skippedRows: 9,
      blocked: false,
    });
    const errors = result.report.issues.filter((i) => i.severity === 'error');
    expect(errors.map((i) => [i.code, i.row, i.column, i.value])).toEqual([
      ['unmatched_colleague', null, 'E', 'Zoe Hart'],
      ['unmatched_colleague', null, 'F', 'Sam Lee'],
      ['out_of_range', 4, 'D', '9'],
      ['unmatched_respondent', 5, 'B', 'unknown@example.org'],
    ]);
    expect(errors[0]?.detail?.count).toBe(2);
    expect(errors[3]?.detail?.count).toBe(5);
    const notes = result.report.issues.filter((i) => i.severity === 'note');
    expect(codes(notes)).toEqual(['empty_cells', 'ignored_columns']);
    expect(notes[0]?.detail?.count).toBe(1);
    expect(result.ties).toContainEqual({
      rater_id: 'W02',
      ratee_id: 'W01',
      variable: 'valence',
      value: 3,
      wave: 1,
    });
  });

  it('imports more once the analyst confirms a suggestion and resolves an ambiguous name', () => {
    const { table, analysis, choices } = wide(bracketExportCsv);
    choices.colleagues['Zoe Hart'] = 'W03';
    choices.colleagues['Sam Lee'] = 'W04';
    const result = validateWide(table, analysis, choices, context);
    expect(result.report.validRows).toBe(11);
    expect(codes(result.report.issues.filter((i) => i.severity === 'error'))).toEqual([
      'out_of_range',
      'unmatched_respondent',
    ]);
  });

  it('leaves out a question with no relation, with a note', () => {
    const { table, analysis, choices } = wide(bracketExportCsv);
    const valenceText = analysis.questions[1]?.text ?? '';
    choices.layers[valenceText] = null;
    const result = validateWide(table, analysis, choices, context);
    expect(result.report.totalRows).toBe(14);
    const note = result.report.issues.find((i) => i.code === 'question_not_imported');
    expect(note).toMatchObject({ column: 'H, I', detail: { count: 3 } });
  });

  it('reports an answer not mapped to a value, as the ties validation does', () => {
    const { table, analysis, choices } = wide(bracketExportCsv);
    const valenceText = analysis.questions[1]?.text ?? '';
    choices.answers[valenceText] = { 'very positive': null, neutral: '0' };
    const result = validateWide(table, analysis, choices, context);
    const issue = result.report.issues.find((i) => i.code === 'non_numeric');
    expect(issue).toMatchObject({ row: 2, column: 'H', value: 'Very positive' });
  });

  it('reports a self-rating at its cell', () => {
    const { table, analysis, choices } = wide(twoRowExportCsv);
    const result = validateWide(table, analysis, choices, context);
    expect(result.report.validRows).toBe(3);
    expect(result.report.issues.map((i) => [i.code, i.row, i.column])).toContainEqual([
      'self_rating',
      3,
      'D',
    ]);
    expect(result.ties.map((t) => [t.rater_id, t.ratee_id, t.value])).toEqual([
      ['W02', 'W01', 3],
      ['W02', 'W03', 0],
      ['W03', 'W01', 2],
    ]);
  });

  it('skips the import ids row and states it', () => {
    const { table, analysis, choices } = wide(codedExportCsv);
    const result = validateWide(table, analysis, choices, context);
    expect(result.ties.map((t) => [t.rater_id, t.ratee_id, t.value])).toEqual([
      ['W01', 'W02', 2],
      ['W01', 'W06', 4],
    ]);
    expect(
      result.report.issues.find((i) => i.code === 'skipped_header_rows')?.detail?.rows,
    ).toEqual([3]);
  });

  it('leaves out every row of a respondent who answered twice', () => {
    const { table, analysis, choices } = wide(duplicateRespondentCsv);
    const result = validateWide(table, analysis, choices, context);
    expect(result.ties.map((t) => t.rater_id)).toEqual(['W03', 'W03']);
    expect(
      result.report.issues
        .filter((i) => i.code === 'duplicate_respondent')
        .map((i) => [i.row, i.detail?.rows]),
    ).toEqual([
      [2, [4]],
      [4, [2]],
    ]);
  });

  it('reports a rating the project already has, at the cell of the file', () => {
    const { table, analysis, choices } = wide(codedExportCsv);
    const result = validateWide(table, analysis, choices, {
      ...context,
      existingKeys: new Set([tieKey('W01', 'W02', 'connection_strength', 1)]),
    });
    expect(result.report.validRows).toBe(1);
    expect(result.report.issues.find((i) => i.code === 'duplicate')).toMatchObject({
      row: 4,
      column: 'D',
      detail: { existing: true },
    });
  });

  it('is blocked without a respondent column', () => {
    const table = parseCsv(
      'e.csv',
      `When,How strong is your working connection with this person? [Ada Example]\nMonday,3`,
    );
    const analysis = analyseImport(table, people, layers, { respondentColumn: null });
    const result = validateWide(table, analysis, defaultChoices(table, analysis, layers), context);
    expect(result.report.blocked).toBe(true);
    expect(codes(result.report.issues)).toContain('no_respondent_column');
  });

  it('converts the wide template into the same ratings as long rows', () => {
    const members = validateMembers(
      parseCsv('members.csv', readFileSync(join(templates, 'members.csv'), 'utf8')),
    );
    const table = parseCsv(
      'ratings-wide.csv',
      readFileSync(join(templates, 'ratings-wide.csv'), 'utf8'),
    );
    const own = rosterPeople(members.members, members.attributes);
    const analysis = analyseImport(table, own, layers);
    const choices = defaultChoices(table, analysis, layers);
    const conversion = wideToLong(table, analysis, choices);
    const direct = validateTies(conversion.table, {
      memberIds: new Set(members.members.map((m) => m.id)),
      layers,
    });
    const result = validateWide(table, analysis, choices, {
      memberIds: new Set(members.members.map((m) => m.id)),
      layers,
    });
    expect(result.report).toMatchObject({ totalRows: 12, validRows: 12, skippedRows: 0 });
    expect(result.ties).toEqual(direct.ties);
    expect(result.ties).toContainEqual({
      rater_id: 'M03',
      ratee_id: 'M01',
      variable: 'valence',
      value: -1,
      wave: 1,
    });
  });
});

describe('the wide template', () => {
  it('reads the same from its CSV and XLSX versions', () => {
    const members = validateMembers(
      parseCsv('members.csv', readFileSync(join(templates, 'members.csv'), 'utf8')),
    );
    const own = rosterPeople(members.members, members.attributes);
    const ctx = { memberIds: new Set(members.members.map((m) => m.id)), layers };
    const read = (table: ReturnType<typeof parseCsv>) => {
      const analysis = analyseImport(table, own, layers);
      return validateWide(table, analysis, defaultChoices(table, analysis, layers), ctx).ties;
    };
    const bytes = readFileSync(join(templates, 'ratings-wide.xlsx'));
    const fromXlsx = read(
      parseXlsx(
        'ratings-wide.xlsx',
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      ),
    );
    const fromCsv = read(
      parseCsv('ratings-wide.csv', readFileSync(join(templates, 'ratings-wide.csv'), 'utf8')),
    );
    expect(fromXlsx).toEqual(fromCsv);
    expect(fromCsv).toHaveLength(12);
  });
});

describe('reconciling attribute values', () => {
  it('finds spellings that differ only in case or spacing and keeps the most common', () => {
    const variants = findVariants(roster);
    expect(variants).toEqual([
      {
        attribute: 'team',
        forms: [
          { value: 'Finance', count: 2 },
          { value: 'finance', count: 1 },
        ],
        preferred: 'Finance',
      },
    ]);
    expect(roster.attributes.find((a) => a.key === 'team')?.categories).toHaveLength(4);
    const next = reconcileMembers(roster, variants);
    expect(next.members.find((m) => m.id === 'W06')?.attributes.team).toBe('Finance');
    expect(next.attributes.find((a) => a.key === 'team')?.categories).toEqual([
      'Finance',
      'People',
      'Sales',
    ]);
    // Nothing changes unless chosen.
    expect(reconcileMembers(roster, [])).toBe(roster);
  });
});
