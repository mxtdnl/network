import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  addExpectation,
  addAction,
  addOutcome,
  expectedLevel,
  patchById,
  setExpectedPair,
} from '../../data/engagement';
import { assessIntent, type PairAssessment } from '../../data/intent';
import {
  ACTION_STATUSES,
  AUDIENCE_LEVELS,
  EXPECTED_LEVELS,
  type ActionLink,
  type ActionStatus,
  type Engagement,
  type EngagementAction,
  type ExpectationLink,
  type ExpectedLevel,
  type Project,
} from '../../data/schema';
import { waveNumbers } from '../../data/waves';
import { Icon } from '../components/Icon';
import { audienceLevelName } from '../copy/audience';
import { engagementCopy as E, verdictWord } from '../copy/engagement';
import { mapCopy } from '../copy/map';
import { questionsCopy } from '../copy/questions';
import { drawableLayers } from '../map/useMapModel';
import {
  changeEngagement,
  expectationData,
  intentInput,
  intentLayer,
  presentValues,
  startEngagement,
  useEngagement,
  useStep,
} from '../state/engagement';
import { insightGroup } from '../state/insightGroup';
import { useReadOnly } from '../state/layoutMode';
import { useMemberNames } from '../state/names';
import { QUESTION_IDS } from '../state/questions';
import { useAppStore } from '../state/store';
import { useWaveProject } from '../state/waves';
import { AudienceSelect } from './AudienceSelect';
import { exportActionLog } from '../state/exportActions';

type SectionKey = keyof typeof E.sections;

/** The sections each step opens; on "All tools" every section is open. */
const OPEN_AT: Record<string, SectionKey[]> = {
  plan: ['brief', 'expectations', 'intent'],
  collect: ['brief'],
  check: ['brief'],
  understand: ['assessment', 'expectations'],
  discuss: ['assessment', 'expectations'],
  act: ['actions'],
  remeasure: ['outcomes', 'actions'],
};

/** A text field that saves when it loses focus, so typing does not change the project on each
 *  key. While names are hidden it shows the text with names replaced and cannot be edited. */
function BlurField({
  label,
  value,
  onSave,
  area = false,
  type = 'text',
  help,
  readOnly,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  area?: boolean;
  type?: 'text' | 'date';
  help?: string;
  readOnly: boolean;
}) {
  const id = useId();
  const helpId = useId();
  const names = useMemberNames();
  const [draft, setDraft] = useState<string | null>(null);
  const locked = readOnly || (names.anonymised && type === 'text');
  const shown = locked ? names.text(value) : (draft ?? value);
  const common = {
    id,
    value: shown,
    readOnly: locked,
    'aria-describedby': help ? helpId : undefined,
    onChange: (e: { currentTarget: { value: string } }) => {
      setDraft(e.currentTarget.value);
    },
    onBlur: () => {
      if (draft !== null && draft !== value) onSave(type === 'text' ? draft : draft);
      setDraft(null);
    },
  };
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      {area ? (
        <textarea className="text-input text-input--area" rows={2} {...common} />
      ) : (
        <input className="text-input engagement__input" type={type} {...common} />
      )}
      {help && (
        <p id={helpId} className="field__help">
          {help}
        </p>
      )}
    </div>
  );
}

function Section({ id, open, children }: { id: SectionKey; open: boolean; children: ReactNode }) {
  // Remounted when the step changes what it opens (see the key below), so the analyst's own
  // opening and closing holds until then.
  const [isOpen, setOpen] = useState(open);
  return (
    <details
      className="engagement__section"
      open={isOpen}
      onToggle={(e) => {
        setOpen(e.currentTarget.open);
      }}
    >
      <summary className="engagement__summary">
        <Icon name={isOpen ? 'collapse' : 'expand'} />
        <h3 className="engagement__heading">{E.sections[id]}</h3>
      </summary>
      <div className="engagement__body">{children}</div>
    </details>
  );
}

// The Engagement tab (build plan session 16): the brief, the client's expectations, the
// collaboration expected between groups, the assessment against them, the action log and the
// outcomes. The step chosen opens the sections it needs.
export function EngagementView() {
  const project = useAppStore((s) => s.data.project);
  const engagement = useEngagement();
  const step = useStep();
  const readOnly = useReadOnly();
  if (!project || project.members.length === 0) {
    return <p className="placeholder">{E.noProject}</p>;
  }
  if (!project.engagement) {
    return (
      <div className="engagement">
        <p className="engagement__intro">{E.startHelp}</p>
        {readOnly && <p className="field__help">{E.readOnly}</p>}
        {!readOnly && (
          <button type="button" className="button button--primary" onClick={startEngagement}>
            {E.start}
          </button>
        )}
      </div>
    );
  }
  const open = (k: SectionKey) => step === 'all' || (OPEN_AT[step] ?? []).includes(k);
  return (
    <div className="engagement">
      {readOnly && <p className="field__help">{E.readOnly}</p>}
      <Section key={`brief-${String(open('brief'))}`} id="brief" open={open('brief')}>
        <Brief engagement={engagement} readOnly={readOnly} />
      </Section>
      <Section
        key={`expectations-${String(open('expectations'))}`}
        id="expectations"
        open={open('expectations')}
      >
        <Expectations project={project} engagement={engagement} readOnly={readOnly} />
      </Section>
      <Section key={`intent-${String(open('intent'))}`} id="intent" open={open('intent')}>
        <IntentEditor project={project} engagement={engagement} readOnly={readOnly} />
      </Section>
      <Section
        key={`assessment-${String(open('assessment'))}`}
        id="assessment"
        open={open('assessment')}
      >
        <Assessment engagement={engagement} />
      </Section>
      <Section key={`actions-${String(open('actions'))}`} id="actions" open={open('actions')}>
        <ActionsPanel project={project} engagement={engagement} readOnly={readOnly} />
      </Section>
      <Section key={`outcomes-${String(open('outcomes'))}`} id="outcomes" open={open('outcomes')}>
        <Outcomes project={project} engagement={engagement} readOnly={readOnly} />
      </Section>
    </div>
  );
}

function Brief({ engagement, readOnly }: { engagement: Engagement; readOnly: boolean }) {
  const set = (patch: Partial<Engagement>) => {
    changeEngagement((e) => ({ ...e, ...patch }));
  };
  const g = engagement.governance;
  return (
    <>
      <BlurField
        label={E.brief.question}
        help={E.brief.questionHelp}
        value={engagement.question}
        area
        readOnly={readOnly}
        onSave={(question) => {
          set({ question });
        }}
      />
      <BlurField
        label={E.brief.sponsor}
        value={engagement.sponsor}
        readOnly={readOnly}
        onSave={(sponsor) => {
          set({ sponsor });
        }}
      />
      <BlurField
        label={E.brief.boundary}
        value={engagement.boundary}
        area
        readOnly={readOnly}
        onSave={(boundary) => {
          set({ boundary });
        }}
      />
      <fieldset className="engagement__fieldset">
        <legend className="field__label">{E.brief.audiences}</legend>
        {AUDIENCE_LEVELS.map((level) => (
          <BlurField
            key={level}
            label={E.brief.audienceFor(audienceLevelName(level))}
            value={g.audiences[level] ?? ''}
            readOnly={readOnly}
            onSave={(who) => {
              changeEngagement((e) => ({
                ...e,
                governance: {
                  ...e.governance,
                  audiences: { ...e.governance.audiences, [level]: who },
                },
              }));
            }}
          />
        ))}
      </fieldset>
      <BlurField
        label={E.brief.retention}
        help={E.brief.retentionHelp}
        type="date"
        value={g.retention_date ?? ''}
        readOnly={readOnly}
        onSave={(date) => {
          changeEngagement((e) => ({
            ...e,
            governance: { ...e.governance, retention_date: date === '' ? null : date },
          }));
        }}
      />
      <div className="engagement__audience">
        <p className="field__label">{E.brief.defaultLevel}</p>
        <AudienceSelect />
      </div>
    </>
  );
}

// Expectations ----------------------------------------------------------------------------

function linkValue(link: ExpectationLink | null): string {
  if (!link) return '';
  if (link.kind === 'pair') return `pair\u0000${link.attribute}\u0000${link.a}\u0000${link.b}`;
  if (link.kind === 'group') return `group\u0000${link.attribute}\u0000${link.value}`;
  return `question\u0000${link.id}`;
}

function parseLink(v: string): ExpectationLink | null {
  const [kind, x, y, z] = v.split('\u0000');
  if (kind === 'pair' && x && y !== undefined && z !== undefined)
    return { kind: 'pair', attribute: x, a: y, b: z };
  if (kind === 'group' && x && y !== undefined) return { kind: 'group', attribute: x, value: y };
  if (kind === 'question' && x) return { kind: 'question', id: x };
  return null;
}

/** Pairs of values (a ≤ b) of the grouping attribute present in the project. */
function valuePairs(values: readonly string[]): [string, string][] {
  const out: [string, string][] = [];
  const sorted = [...values].sort();
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++) out.push([sorted[i] ?? '', sorted[j] ?? '']);
  return out;
}

function Expectations({
  project,
  engagement,
  readOnly,
}: {
  project: Project;
  engagement: Engagement;
  readOnly: boolean;
}) {
  const scoped = useWaveProject();
  const result = useAppStore((s) => s.results.current);
  const setStatus = useAppStore((s) => s.setStatus);
  const names = useMemberNames();
  const group = insightGroup(project);
  const values = group ? presentValues(project, group.key) : [];
  return (
    <>
      <p className="engagement__intro">{E.expectation.intro}</p>
      {engagement.expectations.length === 0 && <p className="field__help">{E.expectation.empty}</p>}
      <ol className="engagement__list">
        {engagement.expectations.map((x, i) => {
          const k = i + 1;
          const data = scoped && result ? expectationData(scoped, result, x.link, names.of) : null;
          return (
            <li key={x.id} className="engagement__item">
              <BlurField
                label={E.expectation.textLabel(k)}
                value={x.text}
                area
                readOnly={readOnly}
                onSave={(text) => {
                  changeEngagement((e) => ({
                    ...e,
                    expectations: patchById(e.expectations, x.id, { text }),
                  }));
                }}
              />
              <LinkSelect
                label={E.expectation.linkLabel(k)}
                value={linkValue(x.link)}
                disabled={readOnly}
                onChange={(v) => {
                  changeEngagement((e) => ({
                    ...e,
                    expectations: patchById(e.expectations, x.id, { link: parseLink(v) }),
                  }));
                }}
              >
                <option value="">{E.expectation.none}</option>
                {group && values.length > 1 && (
                  <optgroup label={E.expectation.pairs}>
                    {valuePairs(values).map(([a, b]) => (
                      <option
                        key={`${a}|${b}`}
                        value={`pair\u0000${group.key}\u0000${a}\u0000${b}`}
                      >
                        {E.expectation.pair(a, b)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {group && values.length > 1 && (
                  <optgroup label={E.expectation.groups}>
                    {values.map((v) => (
                      <option key={v} value={`group\u0000${group.key}\u0000${v}`}>
                        {E.expectation.group(v)}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label={E.expectation.questions}>
                  {QUESTION_IDS.map((q) => (
                    <option key={q} value={`question\u0000${q}`}>
                      {E.expectation.question(questionsCopy.questions[q])}
                    </option>
                  ))}
                </optgroup>
              </LinkSelect>
              {x.link && (
                <div className="engagement__data">
                  <p className="field__label">{E.expectation.data}</p>
                  {data === null ? (
                    <p className="field__help">{E.expectation.noResult}</p>
                  ) : (
                    data.map((s) => (
                      <p key={s} className="engagement__sentence">
                        {s}
                      </p>
                    ))
                  )}
                </div>
              )}
              <BlurField
                label={E.expectation.notesLabel(k)}
                value={x.notes}
                area
                readOnly={readOnly}
                onSave={(notes) => {
                  changeEngagement((e) => ({
                    ...e,
                    expectations: patchById(e.expectations, x.id, { notes }),
                  }));
                }}
              />
              {!readOnly && (
                <button
                  type="button"
                  className="button button--text"
                  aria-label={E.expectation.removeLabel(k)}
                  onClick={() => {
                    changeEngagement((e) => ({
                      ...e,
                      expectations: e.expectations.filter((y) => y.id !== x.id),
                    }));
                    setStatus({ text: E.expectation.removed, tone: 'info' });
                  }}
                >
                  {E.expectation.remove}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {!readOnly && (
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            changeEngagement((e) => addExpectation(e, ''));
            setStatus({ text: E.expectation.added, tone: 'info' });
          }}
        >
          {E.expectation.add}
        </button>
      )}
    </>
  );
}

function LinkSelect({
  label,
  value,
  disabled,
  onChange,
  children,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <select
        id={id}
        className="select engagement__select"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {children}
      </select>
    </div>
  );
}

// Collaboration expected between groups -----------------------------------------------------

function IntentEditor({
  project,
  engagement,
  readOnly,
}: {
  project: Project;
  engagement: Engagement;
  readOnly: boolean;
}) {
  const result = useAppStore((s) => s.results.current);
  const setStatus = useAppStore((s) => s.setStatus);
  const layerId = useId();
  const group = insightGroup(project);
  const values = group ? presentValues(project, group.key) : [];
  if (!group || values.length < 2) return <p className="field__help">{E.intent.noGroups}</p>;
  const layers = result ? drawableLayers(project, result) : [];
  const chosen = result ? intentLayer(project, result) : (engagement.intent.layer ?? '');
  const layerName = (ref: string) =>
    ref === 'composite'
      ? mapCopy.controls.composite
      : (project.layers.find((l) => l.key === ref)?.label ?? ref);
  return (
    <>
      <p className="engagement__intro">{E.intent.intro}</p>
      <p className="field__help">{E.intent.groupsBy(group.label)}</p>
      {layers.length > 0 && (
        <div className="field">
          <label htmlFor={layerId} className="field__label">
            {E.intent.layer}
          </label>
          <select
            id={layerId}
            className="select engagement__select"
            value={chosen}
            disabled={readOnly}
            onChange={(e) => {
              const layer = e.target.value;
              changeEngagement((x) => ({ ...x, intent: { ...x.intent, layer } }));
            }}
          >
            {layers.map((ref) => (
              <option key={ref} value={ref}>
                {layerName(ref)}
              </option>
            ))}
          </select>
        </div>
      )}
      <ul className="engagement__pairs">
        {valuePairs(values).map(([a, b]) => (
          <PairLevel
            key={`${a}|${b}`}
            a={a}
            b={b}
            level={expectedLevel(engagement, group.key, a, b)}
            readOnly={readOnly}
            onChange={(level) => {
              changeEngagement((e) => setExpectedPair(e, group.key, a, b, level));
              setStatus({ text: E.intent.saved, tone: 'info' });
            }}
          />
        ))}
      </ul>
    </>
  );
}

function PairLevel({
  a,
  b,
  level,
  readOnly,
  onChange,
}: {
  a: string;
  b: string;
  level: ExpectedLevel | null;
  readOnly: boolean;
  onChange: (level: ExpectedLevel | null) => void;
}) {
  const id = useId();
  return (
    <li className="engagement__pair">
      <label htmlFor={id} className="engagement__pair-label">
        {E.intent.level(a, b)}
      </label>
      <select
        id={id}
        className="select engagement__select"
        value={level ?? ''}
        disabled={readOnly}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? null : (v as ExpectedLevel));
        }}
      >
        <option value="">{E.intent.notSet}</option>
        {EXPECTED_LEVELS.map((l) => (
          <option key={l} value={l}>
            {E.intent.levels[l]}
          </option>
        ))}
      </select>
    </li>
  );
}

// Assessment ----------------------------------------------------------------------------------

export function useAssessment(): { rows: PairAssessment[]; layer: string } | null {
  const project = useWaveProject();
  const result = useAppStore((s) => s.results.current);
  return useMemo(() => {
    if (!project?.engagement || !result || result.memberIds.length !== project.members.length)
      return null;
    const group = insightGroup(project);
    if (!group) return { rows: [], layer: '' };
    const layer = intentLayer(project, result);
    const input = intentInput(project, result, layer, group.key);
    if (!input) return null;
    return { rows: assessIntent(project.engagement, group.key, input), layer };
  }, [project, result]);
}

function Assessment({ engagement }: { engagement: Engagement }) {
  const project = useWaveProject();
  const result = useAppStore((s) => s.results.current);
  const assessed = useAssessment();
  const captionId = useId();
  if (engagement.intent.pairs.length === 0)
    return <p className="field__help">{E.assessment.empty}</p>;
  if (!assessed || !project || !result)
    return <p className="field__help">{E.assessment.noResult}</p>;
  const label =
    assessed.layer === 'composite'
      ? mapCopy.controls.composite
      : (project.layers.find((l) => l.key === assessed.layer)?.label ?? assessed.layer);
  const view =
    result.view === 'directed'
      ? E.assessment.directed
      : E.assessment.mutual(mapCopy.controls[result.symmetrise].toLowerCase());
  if (assessed.rows.length === 0) return <p className="field__help">{E.assessment.empty}</p>;
  return (
    <>
      <p className="engagement__intro">{E.assessment.intro}</p>
      {/* The table scrolls sideways in a narrow column, so its region takes focus. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="engagement__scroll" role="region" aria-labelledby={captionId} tabIndex={0}>
        <table className="data-table engagement__table">
          <caption id={captionId} className="data-table__caption">
            {E.assessment.layerLine(label.toLowerCase(), view)}
          </caption>
          <thead>
            <tr>
              <th scope="col">{E.assessment.groups}</th>
              <th scope="col">{E.assessment.expected}</th>
              <th scope="col" className="num">
                {E.assessment.observed}
              </th>
              <th scope="col">{E.assessment.result}</th>
            </tr>
          </thead>
          <tbody>
            {assessed.rows.map((r) => (
              <tr key={`${r.a}|${r.b}`} data-verdict={r.verdict ?? 'none'}>
                <th scope="row">{E.assessment.pairRow(r.a, r.b)}</th>
                <td>{E.intent.levelShort[r.expected]}</td>
                <td className="num">
                  {r.possible > 0 ? E.assessment.observedCell(r.tied, r.possible, r.share) : '–'}
                </td>
                <td>
                  {verdictWord(r.verdict)}
                  {r.few && <span className="engagement__few"> {E.assessment.few}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Actions ---------------------------------------------------------------------------------------

function actionLinkValue(link: ActionLink | null): string {
  if (!link) return '';
  if (link.kind === 'observation') return `observation\u0000${link.key}`;
  if (link.kind === 'expectation') return `expectation\u0000${link.id}`;
  return `pair\u0000${link.attribute}\u0000${link.a}\u0000${link.b}`;
}

export function ActionsPanel({
  project,
  engagement,
  readOnly,
}: {
  project: Project;
  engagement: Engagement;
  readOnly: boolean;
}) {
  const setStatus = useAppStore((s) => s.setStatus);
  const names = useMemberNames();
  const multi = waveNumbers(project).length > 1;
  const group = insightGroup(project);
  const pairs = group ? valuePairs(presentValues(project, group.key)) : [];
  // Observations already linked keep their option, whatever this wave shows.
  const linked = engagement.actions.flatMap((a) =>
    a.link?.kind === 'observation' ? [a.link] : [],
  );
  const observations = [...new Map(linked.map((l) => [l.key, l])).values()];
  const update = (a: EngagementAction, patch: Partial<EngagementAction>) => {
    changeEngagement((e) => ({ ...e, actions: patchById(e.actions, a.id, patch) }));
  };
  return (
    <>
      <p className="engagement__intro">{E.actions.intro}</p>
      {engagement.actions.length === 0 && <p className="field__help">{E.actions.empty}</p>}
      <ol className="engagement__list">
        {engagement.actions.map((a, i) => {
          const k = i + 1;
          return (
            <li key={a.id} className="engagement__item">
              <BlurField
                label={E.actions.textLabel(k)}
                value={a.text}
                area
                readOnly={readOnly}
                onSave={(text) => {
                  update(a, { text });
                }}
              />
              <LinkSelect
                label={E.actions.linkLabel(k)}
                value={actionLinkValue(a.link)}
                disabled={readOnly}
                onChange={(v) => {
                  const [kind, x, y, z] = v.split('\u0000');
                  let link: ActionLink | null = null;
                  if (kind === 'observation') link = observations.find((o) => o.key === x) ?? null;
                  else if (kind === 'expectation' && x) link = { kind: 'expectation', id: x };
                  else if (kind === 'pair' && x && y !== undefined && z !== undefined)
                    link = { kind: 'pair', attribute: x, a: y, b: z };
                  update(a, { link });
                }}
              >
                <option value="">{E.actions.noLink}</option>
                {observations.length > 0 && (
                  <optgroup label={E.actions.observations}>
                    {observations.map((o) => (
                      <option key={o.key} value={`observation\u0000${o.key}`}>
                        {names.text(E.actions.observation(o.text, o.wave, multi))}
                      </option>
                    ))}
                  </optgroup>
                )}
                {engagement.expectations.length > 0 && (
                  <optgroup label={E.sections.expectations}>
                    {engagement.expectations.map((x) => (
                      <option key={x.id} value={`expectation\u0000${x.id}`}>
                        {names.text(E.actions.expectation(x.text))}
                      </option>
                    ))}
                  </optgroup>
                )}
                {group && pairs.length > 0 && (
                  <optgroup label={E.expectation.pairs}>
                    {pairs.map(([x, y]) => (
                      <option
                        key={`${x}|${y}`}
                        value={`pair\u0000${group.key}\u0000${x}\u0000${y}`}
                      >
                        {E.actions.pair(x, y)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </LinkSelect>
              <div className="engagement__row">
                <BlurField
                  label={E.actions.ownerLabel(k)}
                  value={a.owner}
                  readOnly={readOnly}
                  onSave={(owner) => {
                    update(a, { owner });
                  }}
                />
                <BlurField
                  label={E.actions.dueLabel(k)}
                  type="date"
                  value={a.due ?? ''}
                  readOnly={readOnly}
                  onSave={(due) => {
                    update(a, { due: due === '' ? null : due });
                  }}
                />
                <StatusSelect
                  label={E.actions.statusLabel(k)}
                  value={a.status}
                  disabled={readOnly}
                  onChange={(status) => {
                    update(a, { status });
                  }}
                />
              </div>
              <BlurField
                label={E.actions.notesLabel(k)}
                value={a.notes}
                area
                readOnly={readOnly}
                onSave={(notes) => {
                  update(a, { notes });
                }}
              />
              {!readOnly && (
                <button
                  type="button"
                  className="button button--text"
                  aria-label={E.actions.removeLabel(k)}
                  onClick={() => {
                    changeEngagement((e) => ({
                      ...e,
                      actions: e.actions.filter((y) => y.id !== a.id),
                    }));
                    setStatus({ text: E.actions.removed, tone: 'info' });
                  }}
                >
                  {E.actions.remove}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <div className="engagement__buttons">
        {!readOnly && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              changeEngagement((e) => addAction(e, {}, new Date().toISOString()));
              setStatus({ text: E.actions.added, tone: 'info' });
            }}
          >
            {E.actions.add}
          </button>
        )}
        {engagement.actions.length > 0 && (
          <button
            type="button"
            className="button button--text"
            onClick={() => {
              void exportActionLog();
            }}
          >
            {E.actions.exportCsv}
          </button>
        )}
      </div>
    </>
  );
}

function StatusSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: ActionStatus;
  disabled: boolean;
  onChange: (s: ActionStatus) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <select
        id={id}
        className="select"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value as ActionStatus);
        }}
      >
        {ACTION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {E.actions.statuses[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

// Outcomes -------------------------------------------------------------------------------------

function Outcomes({
  project,
  engagement,
  readOnly,
}: {
  project: Project;
  engagement: Engagement;
  readOnly: boolean;
}) {
  const setStatus = useAppStore((s) => s.setStatus);
  const waves = waveNumbers(project);
  return (
    <>
      <p className="engagement__intro">{E.outcomes.intro}</p>
      <BlurField
        label={E.outcomes.criteria}
        help={E.outcomes.criteriaHelp}
        area
        value={engagement.criteria.join('\n')}
        readOnly={readOnly}
        onSave={(text) => {
          const criteria = text
            .split('\n')
            .map((c) => c.trim())
            .filter((c) => c !== '');
          changeEngagement((e) => ({ ...e, criteria }));
        }}
      />
      {engagement.outcomes.length === 0 && <p className="field__help">{E.outcomes.empty}</p>}
      <ol className="engagement__list">
        {engagement.outcomes.map((o, i) => {
          const k = i + 1;
          const update = (patch: Partial<typeof o>) => {
            changeEngagement((e) => ({ ...e, outcomes: patchById(e.outcomes, o.id, patch) }));
          };
          const criteria = engagement.criteria.includes(o.criterion)
            ? engagement.criteria
            : [o.criterion, ...engagement.criteria];
          return (
            <li key={o.id} className="engagement__item">
              <LinkSelect
                label={E.outcomes.criterionLabel(k)}
                value={o.criterion}
                disabled={readOnly}
                onChange={(criterion) => {
                  update({ criterion });
                }}
              >
                {criteria.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </LinkSelect>
              <BlurField
                label={E.outcomes.assessmentLabel(k)}
                value={o.assessment}
                area
                readOnly={readOnly}
                onSave={(assessment) => {
                  update({ assessment });
                }}
              />
              <div className="engagement__row">
                <LinkSelect
                  label={E.outcomes.waveLabel(k)}
                  value={o.wave === null ? '' : String(o.wave)}
                  disabled={readOnly}
                  onChange={(v) => {
                    update({ wave: v === '' ? null : Number(v) });
                  }}
                >
                  <option value="">{E.outcomes.noWave}</option>
                  {waves.map((w) => (
                    <option key={w} value={String(w)}>
                      {E.outcomes.waveN(w)}
                    </option>
                  ))}
                </LinkSelect>
                <BlurField
                  label={E.outcomes.dateLabel(k)}
                  type="date"
                  value={o.date ?? ''}
                  readOnly={readOnly}
                  onSave={(date) => {
                    update({ date: date === '' ? null : date });
                  }}
                />
              </div>
              {!readOnly && (
                <button
                  type="button"
                  className="button button--text"
                  aria-label={E.outcomes.removeLabel(k)}
                  onClick={() => {
                    changeEngagement((e) => ({
                      ...e,
                      outcomes: e.outcomes.filter((y) => y.id !== o.id),
                    }));
                    setStatus({ text: E.outcomes.removed, tone: 'info' });
                  }}
                >
                  {E.outcomes.remove}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {!readOnly && (
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            changeEngagement((e) => addOutcome(e, e.criteria[0] ?? '', waves.at(-1) ?? null));
            setStatus({ text: E.outcomes.added, tone: 'info' });
          }}
        >
          {E.outcomes.add}
        </button>
      )}
    </>
  );
}
