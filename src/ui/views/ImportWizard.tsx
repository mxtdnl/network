// Import wizard for survey tools' wide exports (build plan session 13, spec
// §5): one row per respondent, one column per colleague and question. Four
// steps: how the file is laid out, which relation each question records (and
// what answers written as words mean), who the people are, and a preview of
// the long rows that go to the validation report. The reading and reshaping
// are in data/import/wide.ts and match.ts; this file only presents them.

import { useEffect, useId, useMemo, useRef } from 'react';
import { normaliseLabel, type Person, type PersonMatch } from '../../data/import/match';
import type { RawTable } from '../../data/import/table';
import type { TieContext, TiesResult } from '../../data/import/validate';
import {
  analyseImport,
  columnLetter,
  defaultChoices,
  validateWide,
  wideAnswers,
  wideToLong,
  type AnalyseOptions,
  type WideAnalysis,
  type WideChoices,
} from '../../data/import/wide';
import { isCategorical, type LayerDefinition, type MemberId } from '../../data/schema';
import { NOT_APPLICABLE_TEXT } from '../../data/ratings';
import { wideCopy as C } from '../copy/import';
import type { MemberNames } from '../state/names';

/** What the wizard had reached, so returning from the report keeps the analyst's choices. */
export interface WizardState {
  options: AnalyseOptions;
  analysis: WideAnalysis;
  choices: WideChoices;
  step: number;
}

export function initialWizardState(
  table: RawTable,
  people: readonly Person[],
  layers: readonly LayerDefinition[],
): WizardState {
  const analysis = analyseImport(table, people, layers);
  return {
    options: {},
    analysis,
    choices: defaultChoices(table, analysis, layers),
    step: 0,
  };
}

const PREVIEW_ROWS = 10;

interface Props {
  table: RawTable;
  people: readonly Person[];
  layers: readonly LayerDefinition[];
  context: TieContext;
  names: MemberNames;
  /** Member ids in the order of `names.byIndex` (the roster's order). */
  ids: readonly MemberId[];
  state: WizardState;
  onState: (state: WizardState) => void;
  onBack: () => void;
  onCancel: () => void;
  onChecked: (ties: TiesResult) => void;
}

export function ImportWizard(props: Props) {
  const { table, people, layers, context, names, ids, state, onState } = props;
  const { analysis, choices, step } = state;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    // Focus follows the step, but not on opening: the dialog places it then.
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const set = (patch: Partial<WizardState>) => {
    onState({ ...state, ...patch });
  };
  const reread = (options: AnalyseOptions) => {
    const next = analyseImport(table, people, layers, options);
    onState({ options, analysis: next, choices: defaultChoices(table, next, layers), step });
  };
  const setChoices = (patch: Partial<WideChoices>) => {
    set({ choices: { ...choices, ...patch } });
  };

  const usable = analysis.format === 'wide' && analysis.layout.respondentColumn !== null;
  const last = C.steps.length - 1;

  return (
    <div className="wizard">
      <h3 ref={headingRef} tabIndex={-1} className="wizard__heading">
        {C.stepOf(step + 1, C.steps.length, C.steps[step] ?? '')}
      </h3>
      <ol className="wizard__steps" aria-label={C.heading}>
        {C.steps.map((name, i) => (
          <li key={name} className="wizard__step" aria-current={i === step ? 'step' : undefined}>
            {name}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <LayoutStep
          table={table}
          analysis={analysis}
          names={names}
          onHeaderRows={(headerRows) => {
            reread({ headerRows });
          }}
          onRespondent={(respondentColumn) => {
            reread({ ...state.options, respondentColumn });
          }}
        />
      )}
      {step === 1 && (
        <QuestionsStep
          table={table}
          analysis={analysis}
          layers={layers}
          choices={choices}
          names={names}
          onChoices={setChoices}
        />
      )}
      {step === 2 && (
        <PeopleStep
          analysis={analysis}
          choices={choices}
          names={names}
          ids={ids}
          onChoices={setChoices}
        />
      )}
      {step === 3 && (
        <PreviewStep
          table={table}
          analysis={analysis}
          choices={choices}
          layers={layers}
          names={names}
        />
      )}

      <div className="dialog__actions wizard__actions">
        <button type="button" className="button button--text" onClick={props.onCancel}>
          {C.cancel}
        </button>
        {step === 0 ? (
          <button type="button" className="button button--text" onClick={props.onBack}>
            {C.chooseOther}
          </button>
        ) : (
          <button
            type="button"
            className="button button--text"
            onClick={() => {
              set({ step: step - 1 });
            }}
          >
            {C.previous}
          </button>
        )}
        {step < last ? (
          <button
            type="button"
            className="button button--primary"
            disabled={!usable}
            onClick={() => {
              set({ step: step + 1 });
            }}
          >
            {C.next}
          </button>
        ) : (
          <button
            type="button"
            className="button button--primary"
            disabled={!usable}
            onClick={() => {
              props.onChecked(validateWide(table, analysis, choices, context));
            }}
          >
            {C.check}
          </button>
        )}
      </div>
    </div>
  );
}

function LayoutStep({
  table,
  analysis,
  names,
  onHeaderRows,
  onRespondent,
}: {
  table: RawTable;
  analysis: WideAnalysis;
  names: MemberNames;
  onHeaderRows: (rows: 1 | 2) => void;
  onRespondent: (column: number | null) => void;
}) {
  const id = useId();
  const rating = new Set(analysis.layout.ratingColumns.map((r) => r.column));
  const width = Math.max(table.headers.length, analysis.headerTexts.length);
  const candidates = Array.from({ length: width }, (_, c) => c).filter((c) => !rating.has(c));
  return (
    <>
      <p className="wizard__intro" role="status">
        {analysis.format === 'wide'
          ? C.detected(
              analysis.respondents.length,
              analysis.colleagues.length,
              analysis.questions.length,
              analysis.layout.ratingColumns.length,
            )
          : C.notDetected}
      </p>
      <fieldset className="wizard__group" aria-describedby={`${id}-rows-help`}>
        <legend className="field__label">{C.headerRows}</legend>
        <div className="radio-list">
          {([1, 2] as const).map((rows) => (
            <label key={rows} className="radio-list__option">
              <input
                type="radio"
                name={`${id}-rows`}
                checked={analysis.layout.headerRows === rows}
                onChange={() => {
                  onHeaderRows(rows);
                }}
              />
              <span>{rows === 1 ? C.headerOne : C.headerTwo}</span>
            </label>
          ))}
        </div>
        <p id={`${id}-rows-help`} className="field__help">
          {C.headerHelp}
        </p>
      </fieldset>
      {analysis.format === 'wide' && (
        <div className="field">
          <label htmlFor={`${id}-respondent`} className="field__label">
            {C.respondentColumn}
          </label>
          <p id={`${id}-respondent-help`} className="field__help">
            {C.respondentHelp}
          </p>
          <select
            id={`${id}-respondent`}
            className="select"
            aria-describedby={`${id}-respondent-help`}
            value={analysis.layout.respondentColumn ?? ''}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onRespondent(v === '' ? null : Number(v));
            }}
          >
            <option value="">{C.noColumn}</option>
            {candidates.map((c) => (
              <option key={c} value={c}>
                {C.columnOption(columnLetter(c), names.text(analysis.headerTexts[c] ?? ''))}
              </option>
            ))}
          </select>
          <p className="field__help">{C.otherColumns(analysis.layout.otherColumns.length)}</p>
        </div>
      )}
    </>
  );
}

function valueOptions(layer: LayerDefinition): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  if (isCategorical(layer)) {
    for (const c of layer.categories ?? [])
      out.push({ value: c, label: C.scaleValue(c, layer.category_labels?.[c]) });
  } else {
    for (let v = layer.min; v <= layer.max; v++)
      out.push({
        value: String(v),
        label: C.scaleValue(String(v), layer.scale_labels?.[String(v)]),
      });
  }
  out.push({ value: NOT_APPLICABLE_TEXT, label: C.notApplicable });
  return out;
}

function QuestionsStep({
  table,
  analysis,
  layers,
  choices,
  names,
  onChoices,
}: {
  table: RawTable;
  analysis: WideAnalysis;
  layers: readonly LayerDefinition[];
  choices: WideChoices;
  names: MemberNames;
  onChoices: (patch: Partial<WideChoices>) => void;
}) {
  const id = useId();
  const answers = useMemo(
    () => wideAnswers(table, analysis, layers, choices),
    [table, analysis, layers, choices],
  );
  const byKey = new Map(layers.map((l) => [l.key, l]));
  return (
    <>
      <p className="wizard__intro">{C.questionsIntro}</p>
      {analysis.questions.map((q, i) => {
        const layerKey = choices.layers[q.text] ?? null;
        const layer = layerKey === null ? undefined : byKey.get(layerKey);
        const own = answers.filter((a) => a.question === q.text);
        const qid = `${id}-${String(i)}`;
        return (
          <section key={q.text} className="wizard__question" aria-labelledby={`${qid}-label`}>
            <h4 id={`${qid}-label`} className="wizard__subheading">
              {C.questionLabel(i + 1)}
            </h4>
            <p className="wizard__question-text">
              {q.text === '' ? C.unlabelled : names.text(q.text)}
              <span className="wizard__meta num">
                {' '}
                ({C.questionColumns(q.columns.length)}:{' '}
                {q.columns.map(columnLetter).slice(0, 6).join(', ')}
                {q.columns.length > 6 ? ', …' : ''})
              </span>
            </p>
            <div className="field">
              <label htmlFor={`${qid}-layer`} className="field__label">
                {C.relation}
              </label>
              <select
                id={`${qid}-layer`}
                className="select"
                aria-describedby={`${qid}-label`}
                value={layerKey ?? ''}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  const next = { ...choices.layers, [q.text]: v === '' ? null : v };
                  // Answers are read afresh for the new relation's scale.
                  const fresh = wideAnswers(table, analysis, layers, { layers: next });
                  const map: Record<string, string | null> = {};
                  for (const a of fresh.filter((x) => x.question === q.text))
                    map[normaliseLabel(a.text)] = a.value;
                  onChoices({ layers: next, answers: { ...choices.answers, [q.text]: map } });
                }}
              >
                <option value="">{C.doNotImport}</option>
                {layers.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            {layer && own.length > 0 && (
              <div className="wizard__answers">
                <h5 className="wizard__minor">{C.answersHeading}</h5>
                <p className="field__help">{C.answersHelp}</p>
                <table className="report__table wizard__table">
                  <thead>
                    <tr>
                      <th scope="col">{C.answerColumns.answer}</th>
                      <th scope="col" className="report__col-row">
                        {C.answerColumns.count}
                      </th>
                      <th scope="col">{C.answerColumns.value}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {own.map((a) => {
                      const key = normaliseLabel(a.text);
                      const current = choices.answers[q.text]?.[key] ?? null;
                      return (
                        <tr key={key}>
                          <th scope="row" className="wizard__cell-text">
                            {names.text(a.text)}
                          </th>
                          <td className="report__col-row">{a.count}</td>
                          <td>
                            <select
                              className="select"
                              aria-label={C.answerSelect(names.text(a.text))}
                              value={current ?? ''}
                              onChange={(e) => {
                                const v = e.currentTarget.value;
                                onChoices({
                                  answers: {
                                    ...choices.answers,
                                    [q.text]: {
                                      ...(choices.answers[q.text] ?? {}),
                                      [key]: v === '' ? null : v,
                                    },
                                  },
                                });
                              }}
                            >
                              <option value="">{C.notMapped}</option>
                              {valueOptions(layer).map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

interface PersonRow {
  key: string;
  label: string;
  match: PersonMatch;
  value: MemberId | null;
  onChange: (member: MemberId | null) => void;
}

const needsChoice = (m: PersonMatch) => m.status !== 'matched';

function PeopleStep({
  analysis,
  choices,
  names,
  ids,
  onChoices,
}: {
  analysis: WideAnalysis;
  choices: WideChoices;
  names: MemberNames;
  ids: readonly MemberId[];
  onChoices: (patch: Partial<WideChoices>) => void;
}) {
  const imported = new Set(
    analysis.questions.filter((q) => (choices.layers[q.text] ?? null) !== null).map((q) => q.text),
  );
  const colleagueLabels = new Set(
    analysis.layout.ratingColumns.filter((r) => imported.has(r.question)).map((r) => r.colleague),
  );
  const colleagues: PersonRow[] = analysis.colleagues
    .filter((c) => colleagueLabels.has(c.label))
    .map((c) => ({
      key: c.label,
      label: c.label,
      match: c.match,
      value: choices.colleagues[c.label] ?? null,
      onChange: (member) => {
        onChoices({ colleagues: { ...choices.colleagues, [c.label]: member } });
      },
    }));
  const respondents: PersonRow[] = analysis.respondents
    .filter((r) => r.label !== '')
    .map((r) => ({
      key: String(r.row),
      label: C.rowLabel(r.row, r.label),
      match: r.match,
      value: choices.respondents[r.row] ?? null,
      onChange: (member) => {
        onChoices({ respondents: { ...choices.respondents, [r.row]: member } });
      },
    }));
  return (
    <>
      <p className="wizard__intro">{C.peopleIntro}</p>
      <PeopleSection heading={C.colleaguesHeading} rows={colleagues} names={names} ids={ids} />
      <PeopleSection heading={C.respondentsHeading} rows={respondents} names={names} ids={ids} />
    </>
  );
}

function PeopleSection({
  heading,
  rows,
  names,
  ids,
}: {
  heading: string;
  rows: PersonRow[];
  names: MemberNames;
  ids: readonly MemberId[];
}) {
  const id = useId();
  const levels = new Map<string, number>();
  for (const r of rows)
    if (r.match.status === 'matched') levels.set(r.match.by, (levels.get(r.match.by) ?? 0) + 1);
  const matched = rows.filter((r) => r.value !== null).length;
  const open = rows.filter((r) => needsChoice(r.match));
  const settled = rows.filter((r) => !needsChoice(r.match));
  return (
    <section className="wizard__people" aria-labelledby={id}>
      <h4 id={id} className="wizard__subheading">
        {heading}
      </h4>
      <p className="num">
        {C.summary(
          matched,
          rows.length,
          (['id', 'email', 'name', 'normalised'] as const).flatMap((l) => {
            const c = levels.get(l) ?? 0;
            return c > 0 ? [[l, c] as [typeof l, number]] : [];
          }),
        )}{' '}
        {C.toDecide(open.length)}
      </p>
      {open.length > 0 && <PeopleTable rows={open} names={names} ids={ids} />}
      {settled.length > 0 && (
        <details className="wizard__matched">
          <summary>{C.showMatched(settled.length)}</summary>
          <PeopleTable rows={settled} names={names} ids={ids} />
        </details>
      )}
    </section>
  );
}

function statusText(m: PersonMatch): string {
  switch (m.status) {
    case 'matched':
      return C.status.matched(m.by);
    case 'ambiguous':
      return C.status.ambiguous(m.candidates.length);
    case 'suggested':
      return C.status.suggested;
    case 'unmatched':
      return C.status.unmatched;
  }
}

function PeopleTable({
  rows,
  names,
  ids,
}: {
  rows: PersonRow[];
  names: MemberNames;
  ids: readonly MemberId[];
}) {
  const everyone = useMemo(
    () =>
      ids
        .map((id) => ({ id, name: names.of(id) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'en-GB')),
    [names, ids],
  );
  return (
    <table className="report__table wizard__table">
      <thead>
        <tr>
          <th scope="col">{C.peopleColumns.label}</th>
          <th scope="col">{C.peopleColumns.status}</th>
          <th scope="col">{C.peopleColumns.member}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const shown = names.text(r.label);
          const offered =
            r.match.status === 'suggested'
              ? r.match.suggestions.map((s) => ({ id: s.memberId, reason: s.reason }))
              : r.match.status === 'ambiguous'
                ? r.match.candidates.map((c) => ({ id: c, reason: null }))
                : [];
          return (
            <tr key={r.key}>
              <th scope="row" className="wizard__cell-text">
                {shown}
              </th>
              <td>{statusText(r.match)}</td>
              <td>
                <select
                  className="select"
                  aria-label={C.memberSelect(shown)}
                  value={r.value ?? ''}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    r.onChange(v === '' ? null : v);
                  }}
                >
                  <option value="">{C.notMatched}</option>
                  {offered.length > 0 && (
                    <optgroup label={C.suggested}>
                      {offered.map((o) => (
                        <option key={`s-${o.id}`} value={o.id}>
                          {C.candidate(names.of(o.id), o.reason)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={C.everyone}>
                    {everyone.map(({ id, name }) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PreviewStep({
  table,
  analysis,
  choices,
  layers,
  names,
}: {
  table: RawTable;
  analysis: WideAnalysis;
  choices: WideChoices;
  layers: readonly LayerDefinition[];
  names: MemberNames;
}) {
  const conversion = useMemo(
    () => wideToLong(table, analysis, choices),
    [table, analysis, choices],
  );
  const labels = new Map(layers.map((l) => [l.key, l.label]));
  const rows = conversion.table.rows.slice(0, PREVIEW_ROWS);
  const total = conversion.table.rows.length;
  return (
    <>
      <p className="wizard__intro num">{C.previewIntro(total, conversion.answers)}</p>
      {total === 0 ? (
        <p className="report__line">{C.previewEmpty}</p>
      ) : (
        <table className="report__table wizard__table">
          <caption className="wizard__caption">{C.previewCaption(rows.length, total)}</caption>
          <thead>
            <tr>
              <th scope="col">{C.previewColumns.cell}</th>
              <th scope="col">{C.previewColumns.rater}</th>
              <th scope="col">{C.previewColumns.ratee}</th>
              <th scope="col">{C.previewColumns.relation}</th>
              <th scope="col" className="report__col-row">
                {C.previewColumns.value}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const at = conversion.origin[i];
              const [rater = '', ratee = '', variable = '', value = ''] = r.cells;
              return (
                <tr key={r.row}>
                  <td className="num">{at ? `${columnLetter(at.column)}${String(at.row)}` : ''}</td>
                  <td>{names.of(rater)}</td>
                  <td>{names.of(ratee)}</td>
                  <td>{labels.get(variable) ?? variable}</td>
                  <td className="report__col-row">{names.text(value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
