import { useId, useState } from 'react';
import type { MemberId, Project, Survey } from '../../../data/schema';
import { nextWave, waveRosterIds } from '../../../data/waves';
import { repeatSurvey, surveyStatus, surveysByWave } from '../../../survey/model';
import { Dialog } from '../../components/Dialog';
import { surveyCopy } from '../../copy/survey';
import { wavesCopy } from '../../copy/waves';
import { useMemberNames } from '../../state/names';
import { useAppStore } from '../../state/store';

const W = wavesCopy.dashboard;
const R = wavesCopy.repeat;

/**
 * The surveys of every wave (build plan session 14), shown on the dashboard
 * once a survey has been repeated or the project holds more than one survey.
 * Each row opens that wave's dashboard.
 */
export function SurveyWaves({
  project,
  survey,
  onChoose,
}: {
  project: Project;
  survey: Survey;
  onChoose: (id: string) => void;
}) {
  const names = useMemberNames();
  const id = useId();
  const surveys = surveysByWave(project);
  if (surveys.length < 2) return null;
  return (
    <section className="survey-dashboard__section" aria-labelledby={id}>
      <h3 id={id} className="survey-dashboard__subheading">
        {W.heading}
      </h3>
      <p className="field__help">{W.intro}</p>
      <table className="survey-table">
        <caption className="visually-hidden">{W.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{W.waveColumn}</th>
            <th scope="col">{W.survey}</th>
            <th scope="col">{W.status}</th>
            <th scope="col" className="numeric">
              {W.responses}
            </th>
            <th scope="col">
              <span className="visually-hidden">{W.show(0)}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {surveys.map((s) => {
            const st = surveyStatus(s);
            return (
              <tr key={s.id}>
                <th scope="row" className="num">
                  {s.wave}
                </th>
                <td>{names.text(s.title)}</td>
                <td>{surveyCopy.dashboard.status[s.status]}</td>
                <td className="numeric">
                  {st.responded} / {st.issued}
                </td>
                <td>
                  {s.id === survey.id ? (
                    <span className="field__help">{W.current}</span>
                  ) : (
                    <button
                      type="button"
                      className="button button--text"
                      onClick={() => {
                        onChoose(s.id);
                      }}
                    >
                      {W.show(s.wave)}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/**
 * "Repeat this survey": who is on the new wave's roster, then a new survey
 * with new links. Everyone in the project now is ticked; the analyst unticks
 * people who have left.
 */
export function RepeatSurveyDialog({
  project,
  survey,
  open,
  onClose,
  onCreated,
}: {
  project: Project;
  survey: Survey;
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const names = useMemberNames();
  const updateProject = useAppStore((s) => s.updateProject);
  const [chosen, setChosen] = useState<Set<MemberId> | null>(null);
  const helpId = useId();
  const errorId = useId();
  const [error, setError] = useState(false);
  const wave = nextWave(project);
  const everyone = project.members.map((m) => m.id);
  const ticked = chosen ?? new Set(everyone);
  // Members on no earlier survey's roster of this series joined since the last wave.
  const before = new Set(waveRosterIds(project, survey.wave));
  const close = () => {
    setChosen(null);
    setError(false);
    onClose();
  };
  return (
    <Dialog
      open={open}
      wide
      title={R.title(wave)}
      onClose={close}
      describedBy={helpId}
      actions={
        <>
          <button type="button" className="button button--text" onClick={close}>
            {R.cancel}
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              const roster = everyone.filter((m) => ticked.has(m));
              if (roster.length < 2) {
                setError(true);
                return;
              }
              const now = new Date().toISOString();
              let created: Survey | null = null;
              updateProject(
                (p) => {
                  const out = repeatSurvey(survey, p, roster, now);
                  created = out.survey;
                  return out.project;
                },
                { text: R.created(wave, roster.length), tone: 'info' },
              );
              setChosen(null);
              setError(false);
              const made = created as Survey | null;
              if (made) onCreated(made.id);
            }}
          >
            {R.confirm}
          </button>
        </>
      }
    >
      <p id={helpId}>{R.intro(wave)}</p>
      <p>{R.key}</p>
      <p className="field__help">{R.deadline}</p>
      <fieldset
        className="survey-setup__subgroup survey-required"
        aria-describedby={error ? errorId : undefined}
      >
        <legend className="field__label">{R.roster}</legend>
        <p className="field__help">{R.rosterHelp}</p>
        <div className="survey-required__bar">
          <p className="num" role="status">
            {R.count(ticked.size, everyone.length)}
          </p>
          {ticked.size < everyone.length && (
            <button
              type="button"
              className="button button--text"
              onClick={() => {
                setChosen(null);
              }}
            >
              {R.tickAll}
            </button>
          )}
        </div>
        {error && (
          <p id={errorId} className="field__error" role="alert">
            {R.tooFew}
          </p>
        )}
        <ul className="survey-required__list">
          {project.members.map((m) => (
            <li key={m.id}>
              <label className="radio-list__option">
                <input
                  type="checkbox"
                  checked={ticked.has(m.id)}
                  onChange={(e) => {
                    const next = new Set(ticked);
                    if (e.currentTarget.checked) next.add(m.id);
                    else next.delete(m.id);
                    setChosen(next);
                  }}
                />
                {names.of(m.id)}
                {!before.has(m.id) && <span className="field__help"> ({R.joined})</span>}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </Dialog>
  );
}
