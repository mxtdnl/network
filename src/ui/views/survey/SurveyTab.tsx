import { useId, useState } from 'react';
import { surveyCopy } from '../../copy/survey';
import { useAppStore } from '../../state/store';
import { SurveyDashboard } from './SurveyDashboard';
import { SurveySetup } from './SurveySetup';
import { isMultiWave } from '../../../data/waves';
import { surveysByWave } from '../../../survey/model';
import { wavesCopy } from '../../copy/waves';
import { useMemberNames } from '../../state/names';

type Mode = { kind: 'dashboard' } | { kind: 'create' } | { kind: 'edit' };

// The Survey tab (spec §15.1, §15.5): set up a survey, then collect responses.
export function SurveyTab() {
  const project = useAppStore((s) => s.data.project);
  const setImportOpen = useAppStore((s) => s.setImportOpen);
  const setCentreView = useAppStore((s) => s.setCentreView);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'dashboard' });
  const chooseId = useId();
  const names = useMemberNames();

  if (!project || project.members.length < 2) {
    return (
      <div className="survey">
        <h2 className="survey__heading">{surveyCopy.needMembers.heading}</h2>
        <p className="survey__text">{surveyCopy.needMembers.body}</p>
        <div className="members__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              setCentreView('members');
            }}
          >
            {surveyCopy.needMembers.add}
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              setImportOpen(true);
            }}
          >
            {surveyCopy.needMembers.action}
          </button>
        </div>
      </div>
    );
  }

  const surveys = project.surveys;
  const multiWave = isMultiWave(project);
  const survey = surveys.find((s) => s.id === selected) ?? surveys.at(-1) ?? null;

  if (mode.kind === 'create' || !survey) {
    if (!survey && mode.kind !== 'create') {
      return (
        <div className="survey">
          <h2 className="survey__heading">{surveyCopy.intro.heading}</h2>
          <p className="survey__text">{surveyCopy.intro.body}</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              setMode({ kind: 'create' });
            }}
          >
            {surveyCopy.intro.start}
          </button>
        </div>
      );
    }
    return (
      <div className="survey">
        <SurveySetup
          project={project}
          onDone={(id) => {
            setSelected(id);
            setMode({ kind: 'dashboard' });
          }}
          onCancel={
            survey
              ? () => {
                  setMode({ kind: 'dashboard' });
                }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="survey">
      {surveys.length > 1 && (
        <div className="field field--inline survey__choose">
          <label htmlFor={chooseId} className="field__label">
            {surveyCopy.choose}
          </label>
          <select
            id={chooseId}
            className="select"
            value={survey.id}
            onChange={(e) => {
              setSelected(e.currentTarget.value);
              setMode({ kind: 'dashboard' });
            }}
          >
            {surveysByWave(project).map((s) => (
              <option key={s.id} value={s.id}>
                {multiWave
                  ? wavesCopy.dashboard.chooser(s.wave, names.text(s.title))
                  : names.text(s.title)}
              </option>
            ))}
          </select>
        </div>
      )}
      {mode.kind === 'edit' ? (
        <SurveySetup
          key={survey.id}
          project={project}
          survey={survey}
          onDone={() => {
            setMode({ kind: 'dashboard' });
          }}
          onCancel={() => {
            setMode({ kind: 'dashboard' });
          }}
        />
      ) : (
        <>
          <SurveyDashboard
            project={project}
            survey={survey}
            onEdit={() => {
              setMode({ kind: 'edit' });
            }}
            onChoose={(id) => {
              setSelected(id);
              setMode({ kind: 'dashboard' });
            }}
          />
          <button
            type="button"
            className="button button--text survey__another"
            onClick={() => {
              setMode({ kind: 'create' });
            }}
          >
            {surveyCopy.another}
          </button>
        </>
      )}
    </div>
  );
}
