import { useMemo } from 'react';
import { engagementOf, retentionPassed, toggleCheck, todayIso } from '../../data/engagement';
import { Icon } from '../components/Icon';
import { engagementCopy as E } from '../copy/engagement';
import { STEP_ORDER, changeEngagement, checklist, chooseStep, useStep } from '../state/engagement';
import { useReadOnly } from '../state/layoutMode';
import { useAppStore } from '../state/store';

type CheckId = keyof typeof E.checks;

// The engagement guide (build plan session 16): seven steps from Plan to Re-measure, and "All
// tools". The step buttons sit in the row of the centre tabs, so the guide costs the map no
// height until a step is chosen; a chosen step then shows a row above with its purpose, its
// checklist (items the project already shows done are ticked and cannot be unticked), its
// output, and "Advanced: show every tab".

/** The steps and "All tools", beside the centre tabs. */
export function EngagementSteps() {
  const step = useStep();
  const readOnly = useReadOnly();
  return (
    <nav aria-label={E.stepsLabel} className="stepper__nav">
      <ol className="stepper__steps">
        {STEP_ORDER.map((s) => (
          <li key={s}>
            <button
              type="button"
              className="stepper__step"
              aria-current={step === s ? 'step' : undefined}
              onClick={() => {
                chooseStep(s, readOnly);
              }}
            >
              {E.steps[s]}
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="stepper__step stepper__all"
        aria-current={step === 'all' ? 'step' : undefined}
        title={E.allToolsHelp}
        onClick={() => {
          chooseStep('all', readOnly);
        }}
      >
        {E.allTools}
      </button>
    </nav>
  );
}

/** The chosen step's purpose, checklist and output, and the retention note when it has passed. */
export function EngagementStepper() {
  const project = useAppStore((s) => s.data.project);
  const result = useAppStore((s) => s.results.current);
  const advanced = useAppStore((s) => s.ui.stepAdvanced);
  const setStepUi = useAppStore((s) => s.setStepUi);
  const step = useStep();
  const readOnly = useReadOnly();
  const engagement = useMemo(() => engagementOf(project), [project]);
  const items = useMemo(
    () => (project && step !== 'all' ? checklist(step, { project, engagement, result }) : []),
    [project, engagement, result, step],
  );
  if (!project) return null;
  const date = engagement.governance.retention_date;
  const passed = date !== null && retentionPassed(project, todayIso()) ? date : null;
  if (step === 'all' && passed === null) return null;
  const done = items.filter((i) => i.done).length;
  const k = step === 'all' ? 0 : STEP_ORDER.indexOf(step) + 1;
  return (
    <div className="stepper">
      {passed !== null && (
        <p className="stepper__retention" role="note">
          <Icon name="warning" />
          {E.retentionPassed(passed)}
        </p>
      )}
      {step !== 'all' && (
        <div className="stepper__detail">
          <details className="stepper__checklist">
            <summary className="stepper__summary">{E.checklist(done, items.length)}</summary>
            <ul className="stepper__items">
              {items.map((item) => (
                <li key={item.id} className="stepper__item">
                  <label className="radio-list__option">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={item.auto || readOnly}
                      onChange={(e) => {
                        const on = e.currentTarget.checked;
                        changeEngagement((x) => toggleCheck(x, item.id, on));
                      }}
                    />
                    <span>
                      {E.checks[item.id as CheckId]}
                      {/* The disabled, ticked box shows it; text that appeared would move the page under the pointer. */}
                      {item.auto && <span className="visually-hidden"> ({E.autoDone})</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="stepper__output">
              <span className="stepper__output-label">{E.outputLabel}</span> {E.output[step]}
            </p>
          </details>
          <button
            type="button"
            className="button button--text stepper__advanced"
            aria-pressed={advanced}
            title={E.advancedHelp}
            onClick={() => {
              setStepUi({ stepAdvanced: !advanced });
            }}
          >
            {E.advanced}
          </button>
          <p className="stepper__purpose">
            <span className="visually-hidden">{E.stepNumber(k, STEP_ORDER.length)}: </span>
            {E.purpose[step]}
          </p>
        </div>
      )}
    </div>
  );
}
