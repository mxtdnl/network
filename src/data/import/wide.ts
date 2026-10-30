// Survey tools' wide exports (build plan session 13, spec §5): one row per
// respondent, one column per colleague and question. This module detects the
// format, reads which columns hold the respondent and which hold ratings,
// matches the people named (match.ts), and converts the answers the analyst
// has mapped into the long rows that validateTies checks, as survey responses
// are (CLAUDE.md D97). Problems are reported against the cells of the file:
// its row numbers and column letters.
//
// Header shapes read (general patterns, not tied to one tool):
// - one header row, the colleague in brackets: "How often…? [Ada Example]";
// - one header row, question and colleague joined by " - ", " – ", " — ",
//   " | " or ": ", in either order;
// - a column named only by a colleague (a survey with one question);
// - two header rows: the question in the first, spread over the columns to
//   its right by blank cells, and the colleague in the second;
// - two header rows where the second holds the full "question - colleague"
//   text, under question codes, optionally followed by a row of import ids.
//
// Nothing is guessed silently: a colleague or respondent matched only by a
// suggestion, a question not mapped to a relation and an answer not mapped to
// a scale value are left out or reported until the analyst decides.

import type { LayerDefinition, LayerKey, MemberId } from '../schema';
import { isCategorical } from '../schema';
import { NOT_APPLICABLE_TEXT } from '../ratings';
import { Matcher, normaliseLabel, settled, type Person, type PersonMatch } from './match';
import { normaliseHeader, tableFromCells, type RawRow, type RawTable } from './table';
import {
  TIE_COLUMNS,
  validateTies,
  type Issue,
  type TieContext,
  type TiesResult,
} from './validate';

export type ImportFormat = 'long' | 'wide' | 'unknown';

export interface RatingColumn {
  column: number;
  /** The question as the header gives it; '' when the header names only a colleague. */
  question: string;
  colleague: string;
}

export interface WideLayout {
  /** File rows read as the header. */
  headerRows: 1 | 2;
  /** Spreadsheet rows after the header that hold no answers, such as a row of import ids. */
  skippedRows: number[];
  respondentColumn: number | null;
  ratingColumns: RatingColumn[];
  /** Columns that are neither the respondent nor ratings, such as timestamps. */
  otherColumns: number[];
}

export interface WideQuestion {
  text: string;
  columns: number[];
  /** The relation the question's text names, by key, label or wording; null if none or several. */
  layer: LayerKey | null;
}

export interface WideColleague {
  label: string;
  columns: number[];
  match: PersonMatch;
}

export interface WideRespondent {
  /** Spreadsheet row. */
  row: number;
  label: string;
  match: PersonMatch;
}

export interface WideAnswer {
  question: string;
  /** The answer as written in the file (its first spelling). */
  text: string;
  count: number;
  /** The scale value it reads as without the analyst's choice, if any. */
  value: string | null;
}

export interface WideAnalysis {
  format: ImportFormat;
  layout: WideLayout;
  /** Each column's header as read, for display. */
  headerTexts: string[];
  questions: WideQuestion[];
  colleagues: WideColleague[];
  respondents: WideRespondent[];
}

export interface WideChoices {
  /** Question text → relation key, or null to leave the question out. */
  layers: Record<string, LayerKey | null>;
  /** Colleague label → member, or null when not matched. */
  colleagues: Record<string, MemberId | null>;
  /** Spreadsheet row → member, or null when not matched. */
  respondents: Record<number, MemberId | null>;
  /** Question text → normalised answer text → value text, or null for not mapped. */
  answers: Record<string, Record<string, string | null>>;
  wave: number;
}

export interface AnalyseOptions {
  headerRows?: 1 | 2;
  /** A column index, null for none; absent to detect. */
  respondentColumn?: number | null;
}

/** Spreadsheet column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const BRACKET = /^(.*?)\s*\[([^[\]]+)\]\s*$/;
const SEPARATORS = [' - ', ' – ', ' — ', ' | ', ': '];
const IMPORT_ID = /^\{\s*"?importid/i;
const RESPONDENT_HEADER =
  /^(respondent|respondent_id|respondent_name|respondent_email|email|e_mail|email_address|name|full_name|your_name|employee_id|staff_id|id|participant|participant_id)$/;

const cellOf = (row: RawRow | undefined, c: number) => (row?.cells[c] ?? '').trim();

interface Split {
  question: string;
  colleague: string;
}

/** Reads one header text as a question and a colleague, if it is one. */
function splitText(
  text: string,
  matcher: Matcher,
  knownQuestions: ReadonlySet<string>,
): Split | null {
  const t = text.trim();
  if (t === '') return null;
  const bracket = BRACKET.exec(t);
  if (bracket) return { question: (bracket[1] ?? '').trim(), colleague: (bracket[2] ?? '').trim() };
  const isQuestion = (s: string) => knownQuestions.has(normaliseLabel(s));
  for (const sep of SEPARATORS) {
    let at = t.lastIndexOf(sep);
    while (at > 0) {
      const left = t.slice(0, at).trim();
      const right = t.slice(at + sep.length).trim();
      if (left !== '' && right !== '') {
        if (matcher.isPerson(right) || isQuestion(left))
          return { question: left, colleague: right };
        if (matcher.isPerson(left) || isQuestion(right))
          return { question: right, colleague: left };
      }
      at = t.lastIndexOf(sep, at - 1);
    }
  }
  if (matcher.isPerson(t)) return { question: '', colleague: t };
  return null;
}

function forwardFill(headers: readonly string[]): string[] {
  let last = '';
  return headers.map((h) => {
    if (h.trim() !== '') last = h.trim();
    return last;
  });
}

interface HeaderRead {
  splits: (Split | null)[];
  texts: string[];
}

function readHeader(table: RawTable, depth: 1 | 2, matcher: Matcher): HeaderRead {
  const width = Math.max(table.headers.length, ...table.rows.map((r) => r.cells.length), 0);
  const first = Array.from({ length: width }, (_, c) => (table.headers[c] ?? '').trim());
  const second = table.rows[0];
  const filled = forwardFill(first);
  const pass = (known: ReadonlySet<string>): HeaderRead => {
    const splits: (Split | null)[] = [];
    const texts: string[] = [];
    for (let c = 0; c < width; c++) {
      if (depth === 1) {
        texts.push(first[c] ?? '');
        splits.push(splitText(first[c] ?? '', matcher, known));
        continue;
      }
      const below = cellOf(second, c);
      // The second row holds the whole "question - colleague" text, under codes.
      const own = splitText(below, matcher, known);
      if (own && own.question !== '') {
        texts.push(below);
        splits.push(own);
        continue;
      }
      const question = filled[c] ?? '';
      texts.push(below === '' ? question : question === '' ? below : `${question} – ${below}`);
      // The question is spread over blank cells to its right, so a members
      // file, whose second row also names people, is not read this way.
      const spread = (first[c] ?? '') === '' || (c + 1 < width && first[c + 1] === '');
      if (
        below !== '' &&
        question !== '' &&
        spread &&
        (matcher.isPerson(below) || known.has(normaliseLabel(question)))
      )
        splits.push({ question, colleague: below });
      else splits.push(null);
    }
    return { splits, texts };
  };
  // A second pass reads a header whose colleague is misspelt when its question
  // is one the first pass found with a colleague who matched.
  const firstPass = pass(new Set());
  const known = new Set(
    firstPass.splits.flatMap((s) => (s && s.question !== '' ? [normaliseLabel(s.question)] : [])),
  );
  return known.size > 0 ? pass(known) : firstPass;
}

function chooseLayer(text: string, layers: readonly LayerDefinition[]): LayerKey | null {
  if (text.trim() === '') return null;
  const n = normaliseLabel(text);
  const key = normaliseHeader(text);
  const strip = (s: string) => normaliseLabel(s).replace(/[?.!:]+$/, '');
  const exact = layers.filter(
    (l) =>
      l.key === key ||
      normaliseLabel(l.label) === n ||
      (l.question_wording !== '' && strip(l.question_wording) === strip(text)),
  );
  if (exact.length === 1) return exact[0]?.key ?? null;
  if (exact.length > 1) return null;
  // The tool's text contains the relation's wording, or the other way round.
  const within = layers.filter((l) => {
    const w = strip(l.question_wording);
    return w.length >= 12 && (strip(text).includes(w) || w.includes(strip(text)));
  });
  return within.length === 1 ? (within[0]?.key ?? null) : null;
}

/** Reads a table as long, wide or neither, and a wide one's columns, questions and people. */
export function analyseImport(
  table: RawTable,
  people: readonly Person[],
  layers: readonly LayerDefinition[],
  options: AnalyseOptions = {},
): WideAnalysis {
  const headers = new Set(table.headers.map(normaliseHeader));
  const empty: WideAnalysis = {
    format: 'unknown',
    layout: {
      headerRows: 1,
      skippedRows: [],
      respondentColumn: null,
      ratingColumns: [],
      otherColumns: [],
    },
    headerTexts: table.headers,
    questions: [],
    colleagues: [],
    respondents: [],
  };
  if (TIE_COLUMNS.every((c) => headers.has(c))) return { ...empty, format: 'long' };

  const matcher = new Matcher(people);
  const count = (r: HeaderRead) => r.splits.filter((s) => s !== null).length;
  const one = readHeader(table, 1, matcher);
  const two = table.rows.length > 1 ? readHeader(table, 2, matcher) : null;
  const depth: 1 | 2 = options.headerRows ?? (two && count(two) > count(one) ? 2 : 1);
  const read = depth === 2 && two ? two : one;
  if (count(read) === 0) return { ...empty, layout: { ...empty.layout, headerRows: depth } };

  // Rows after the header that hold import ids rather than answers.
  const body = table.rows.slice(depth - 1);
  const skippedRows: number[] = [];
  const next = body[0];
  if (next) {
    const filled = next.cells.filter((c) => c.trim() !== '');
    const ids = filled.filter((c) => IMPORT_ID.test(c.trim())).length;
    if (filled.length > 0 && ids * 2 >= filled.length) skippedRows.push(next.row);
  }
  const data = body.filter((r) => !skippedRows.includes(r.row));

  const ratingColumns: RatingColumn[] = [];
  read.splits.forEach((s, column) => {
    if (s) ratingColumns.push({ column, question: s.question, colleague: s.colleague });
  });
  const ratingSet = new Set(ratingColumns.map((r) => r.column));
  const others = read.texts.map((_, c) => c).filter((c) => !ratingSet.has(c));

  let respondentColumn: number | null;
  if (options.respondentColumn !== undefined) respondentColumn = options.respondentColumn;
  else {
    let best: { column: number; score: number } | null = null;
    for (const c of others) {
      const score = data.filter((r) => matcher.isPerson(cellOf(r, c))).length;
      if (score > 0 && (!best || score > best.score)) best = { column: c, score };
    }
    respondentColumn =
      best?.column ??
      others.find((c) => RESPONDENT_HEADER.test(normaliseHeader(read.texts[c] ?? ''))) ??
      null;
  }

  const questions = new Map<string, WideQuestion>();
  const colleagues = new Map<string, WideColleague>();
  for (const r of ratingColumns) {
    const q = questions.get(r.question);
    if (q) q.columns.push(r.column);
    else
      questions.set(r.question, {
        text: r.question,
        columns: [r.column],
        layer: chooseLayer(r.question, layers),
      });
    const p = colleagues.get(r.colleague);
    if (p) p.columns.push(r.column);
    else
      colleagues.set(r.colleague, {
        label: r.colleague,
        columns: [r.column],
        match: matcher.match(r.colleague),
      });
  }
  const respondents: WideRespondent[] =
    respondentColumn === null
      ? []
      : data.map((r) => {
          const label = cellOf(r, respondentColumn);
          return { row: r.row, label, match: matcher.match(label) };
        });

  return {
    format: 'wide',
    layout: {
      headerRows: depth,
      skippedRows,
      respondentColumn,
      ratingColumns,
      otherColumns: others.filter((c) => c !== respondentColumn),
    },
    headerTexts: read.texts,
    questions: [...questions.values()],
    colleagues: [...colleagues.values()],
    respondents,
  };
}

/** The data rows of a wide table, after its header and skipped rows. */
export function dataRows(table: RawTable, analysis: WideAnalysis): RawRow[] {
  return table.rows
    .slice(analysis.layout.headerRows - 1)
    .filter((r) => !analysis.layout.skippedRows.includes(r.row));
}

const LEADING_NUMBER = /^([+-]?\d+(?:\.\d+)?)\s*(?:[-–—:.)=]|\()\s*\S/;
const NOT_APPLICABLE_WORDS = new Set(['n/a', 'na', 'not applicable', 'does not apply']);

/** The scale value an answer label reads as without the analyst's choice: a
 *  scale label, a category or its label, "Not applicable", or a label that
 *  starts with a value of the scale ("4 - Weekly"). Null otherwise. */
export function autoAnswer(layer: LayerDefinition | undefined, text: string): string | null {
  const n = normaliseLabel(text);
  if (NOT_APPLICABLE_WORDS.has(n)) return NOT_APPLICABLE_TEXT;
  if (!layer) return null;
  if (isCategorical(layer)) {
    for (const c of layer.categories ?? []) {
      if (normaliseLabel(c) === n) return c;
      const label = layer.category_labels?.[c];
      if (label && normaliseLabel(label) === n) return c;
    }
    return null;
  }
  for (const [value, label] of Object.entries(layer.scale_labels ?? {}))
    if (normaliseLabel(label) === n) return value;
  const lead = LEADING_NUMBER.exec(text.trim());
  if (lead) {
    const v = Number(lead[1]);
    if (v >= layer.min && v <= layer.max) return String(v);
  }
  return null;
}

const needsMapping = (text: string) =>
  text !== '' && !NUMBER.test(text) && text.toLowerCase() !== NOT_APPLICABLE_TEXT;

/** The answers to each question that are not plain numbers, with how often each is given. */
export function wideAnswers(
  table: RawTable,
  analysis: WideAnalysis,
  layers: readonly LayerDefinition[],
  choices: Pick<WideChoices, 'layers'>,
): WideAnswer[] {
  const rows = dataRows(table, analysis);
  const out = new Map<string, WideAnswer>();
  const byKey = new Map(layers.map((l) => [l.key, l]));
  for (const q of analysis.questions) {
    const layerKey = choices.layers[q.text] ?? null;
    if (layerKey === null) continue;
    for (const c of q.columns)
      for (const r of rows) {
        const text = cellOf(r, c);
        if (!needsMapping(text)) continue;
        const k = `${q.text}\u0000${normaliseLabel(text)}`;
        const a = out.get(k);
        if (a) a.count++;
        else
          out.set(k, {
            question: q.text,
            text,
            count: 1,
            value: autoAnswer(byKey.get(layerKey), text),
          });
      }
  }
  return [...out.values()];
}

/** Choices that follow the file: settled matches, relations named by the
 *  question, and answers that read as scale values. */
export function defaultChoices(
  table: RawTable,
  analysis: WideAnalysis,
  layers: readonly LayerDefinition[],
): WideChoices {
  const choices: WideChoices = {
    layers: {},
    colleagues: {},
    respondents: {},
    answers: {},
    wave: 1,
  };
  for (const q of analysis.questions) choices.layers[q.text] = q.layer;
  for (const p of analysis.colleagues) choices.colleagues[p.label] = settled(p.match);
  for (const r of analysis.respondents) choices.respondents[r.row] = settled(r.match);
  for (const a of wideAnswers(table, analysis, layers, choices)) {
    choices.answers[a.question] ??= {};
    (choices.answers[a.question] as Record<string, string | null>)[normaliseLabel(a.text)] =
      a.value;
  }
  return choices;
}

export interface CellRef {
  row: number;
  column: number;
}

export interface WideConversion {
  /** The long table validateTies reads. */
  table: RawTable;
  /** For each long row (in order), the cell of the wide file it came from. */
  origin: CellRef[];
  /** Problems and notes of the reshaping itself, against the wide file's cells. */
  issues: Issue[];
  /** Answers in the columns of questions being imported. */
  answers: number;
}

const columnList = (columns: number[]) => columns.map(columnLetter).join(', ');

/** Converts mapped answers into long rows: rater, ratee, variable, value, wave. */
export function wideToLong(
  table: RawTable,
  analysis: WideAnalysis,
  choices: WideChoices,
): WideConversion {
  const file = 'export' as const;
  const issues: Issue[] = [];
  const rows = dataRows(table, analysis);
  const imported = analysis.questions.filter((q) => (choices.layers[q.text] ?? null) !== null);
  const columns = imported.flatMap((q) =>
    q.columns.map((c) => ({ column: c, layer: choices.layers[q.text] as LayerKey, question: q })),
  );
  columns.sort((a, b) => a.column - b.column);
  const colleagueOf = new Map<number, string>(
    analysis.layout.ratingColumns.map((r) => [r.column, r.colleague]),
  );
  const answered = (r: RawRow) => columns.filter((c) => cellOf(r, c.column) !== '').length;
  const respondentColumn = analysis.layout.respondentColumn;
  const respondentLetter = respondentColumn === null ? null : columnLetter(respondentColumn);

  if (respondentColumn === null) {
    issues.push({
      file,
      severity: 'error',
      code: 'no_respondent_column',
      row: null,
      column: null,
      value: null,
    });
  }

  // Respondents: unmatched rows and rows that name the same member are left out.
  const rowsByMember = new Map<MemberId, number[]>();
  for (const r of rows) {
    const member = respondentColumn === null ? null : (choices.respondents[r.row] ?? null);
    if (member !== null) rowsByMember.set(member, [...(rowsByMember.get(member) ?? []), r.row]);
  }
  const usable: { row: RawRow; member: MemberId }[] = [];
  for (const r of rows) {
    if (respondentColumn === null) break;
    const label = cellOf(r, respondentColumn);
    const member = choices.respondents[r.row] ?? null;
    const count = answered(r);
    if (member === null) {
      if (count === 0 && label === '') continue;
      issues.push({
        file,
        severity: 'error',
        code: label === '' ? 'missing_respondent' : 'unmatched_respondent',
        row: r.row,
        column: respondentLetter,
        value: label === '' ? null : label,
        detail: { count },
      });
      continue;
    }
    const same = rowsByMember.get(member) ?? [];
    if (same.length > 1) {
      issues.push({
        file,
        severity: 'error',
        code: 'duplicate_respondent',
        row: r.row,
        column: respondentLetter,
        value: label,
        detail: { rows: same.filter((x) => x !== r.row), count },
      });
      continue;
    }
    usable.push({ row: r, member });
  }

  // Colleagues not matched: their columns are left out.
  for (const p of analysis.colleagues) {
    if ((choices.colleagues[p.label] ?? null) !== null) continue;
    const own = columns.filter((c) => colleagueOf.get(c.column) === p.label).map((c) => c.column);
    if (own.length === 0) continue;
    const count = usable.reduce((s, u) => s + own.filter((c) => cellOf(u.row, c) !== '').length, 0);
    issues.push({
      file,
      severity: 'error',
      code: 'unmatched_colleague',
      row: null,
      column: columnList(own),
      value: p.label,
      detail: { count },
    });
  }

  const out: string[][] = [['rater_id', 'ratee_id', 'variable', 'value', 'wave']];
  const origin: CellRef[] = [];
  let empty = 0;
  for (const { row, member } of usable) {
    for (const c of columns) {
      const ratee = choices.colleagues[colleagueOf.get(c.column) ?? ''] ?? null;
      if (ratee === null) continue;
      const text = cellOf(row, c.column);
      if (text === '') {
        if (ratee !== member) empty++;
        continue;
      }
      const mapped = needsMapping(text)
        ? (choices.answers[c.question.text]?.[normaliseLabel(text)] ?? null)
        : null;
      out.push([member, ratee, c.layer, mapped ?? text, String(choices.wave)]);
      origin.push({ row: row.row, column: c.column });
    }
  }

  const answers = rows.reduce((s, r) => s + answered(r), 0);
  for (const q of analysis.questions) {
    if ((choices.layers[q.text] ?? null) !== null) continue;
    const count = rows.reduce((s, r) => s + q.columns.filter((c) => cellOf(r, c) !== '').length, 0);
    issues.push({
      file,
      severity: 'note',
      code: 'question_not_imported',
      row: null,
      column: columnList(q.columns),
      value: q.text,
      detail: { count },
    });
  }
  if (empty > 0) {
    issues.push({
      file,
      severity: 'note',
      code: 'empty_cells',
      row: null,
      column: null,
      value: null,
      detail: { count: empty },
    });
  }
  const other = analysis.layout.otherColumns.length;
  if (other > 0) {
    issues.push({
      file,
      severity: 'note',
      code: 'ignored_columns',
      row: null,
      column: columnList(analysis.layout.otherColumns),
      value: null,
      detail: { count: other },
    });
  }
  if (analysis.layout.skippedRows.length > 0) {
    issues.push({
      file,
      severity: 'note',
      code: 'skipped_header_rows',
      row: null,
      column: null,
      value: null,
      detail: { rows: analysis.layout.skippedRows },
    });
  }

  const long = tableFromCells(table.fileName, out);
  if (table.ignoredSheets) long.ignoredSheets = table.ignoredSheets;
  return { table: long, origin, issues, answers };
}

/** Converts a wide export and checks the result with the validation report,
 *  every problem placed at the cell of the file it came from. */
export function validateWide(
  table: RawTable,
  analysis: WideAnalysis,
  choices: WideChoices,
  context: TieContext,
): TiesResult {
  const conversion = wideToLong(table, analysis, choices);
  const result = validateTies(conversion.table, context);
  const at = (longRow: number) => conversion.origin[longRow - 2];
  const remapped = result.report.issues.map((issue): Issue => {
    if (issue.row === null) return { ...issue, file: 'export' };
    const cell = at(issue.row);
    const rows = issue.detail?.rows?.map((r) => at(r)?.row ?? r);
    return {
      ...issue,
      file: 'export',
      row: cell?.row ?? issue.row,
      column: cell ? columnLetter(cell.column) : issue.column,
      ...(issue.detail ? { detail: { ...issue.detail, ...(rows ? { rows } : {}) } } : {}),
    };
  });
  const errors = [
    ...conversion.issues.filter((i) => i.severity === 'error'),
    ...remapped.filter((i) => i.severity === 'error'),
  ].sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  const notes = [
    ...conversion.issues.filter((i) => i.severity === 'note'),
    ...remapped.filter((i) => i.severity === 'note'),
  ];
  const total = conversion.answers;
  return {
    ties: result.ties,
    report: {
      file: 'export',
      fileName: table.fileName,
      unit: 'ratings',
      totalRows: total,
      validRows: result.ties.length,
      skippedRows: Math.max(0, total - result.ties.length),
      blocked: analysis.layout.respondentColumn === null,
      issues: [...errors, ...notes],
    },
  };
}
