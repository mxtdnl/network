import { useId, useState } from 'react';
import { questionsCopy } from '../copy/questions';
import {
  QUESTION_IDS,
  activeQuestion,
  applyQuestion,
  availabilityNote,
  isQuestionId,
  questionAvailability,
  type QuestionId,
} from '../state/questions';
import { useAppStore } from '../state/store';

const Q = questionsCopy;
const OWN = '__own';

// The question picker (build plan session 8): the first control of the left
// column. A question sets the view and its title; one the project cannot
// answer says why and changes nothing.
export function QuestionPicker() {
  const project = useAppStore((s) => s.data.project);
  const map = useAppStore((s) => s.map);
  const setMap = useAppStore((s) => s.setMap);
  const [pending, setPending] = useState<QuestionId | null>(null);
  const selectId = useId();
  const helpId = useId();
  if (!project) return null;
  const active = activeQuestion(project, map);
  // A question the project cannot answer stays selected here, with its note, until another is chosen.
  const shown = pending !== null && pending !== active ? pending : null;
  const note = shown ? availabilityNote(questionAvailability(shown, project)) : null;
  const value = shown ?? active ?? OWN;

  return (
    <div className="field question-picker">
      <label htmlFor={selectId} className="field__label">
        {Q.label}
      </label>
      <select
        id={selectId}
        className="select"
        value={value}
        aria-describedby={helpId}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (!isQuestionId(v)) {
            setPending(null);
            setMap({ question: null });
            return;
          }
          if (applyQuestion(v)) setPending(null);
          else setPending(v);
        }}
      >
        {QUESTION_IDS.map((id) => {
          const a = questionAvailability(id, project);
          return (
            <option key={id} value={id}>
              {a.ok || a.reason === 'noGroups'
                ? Q.questions[id]
                : `${Q.questions[id]} (${Q.needs(a.relation)})`}
            </option>
          );
        })}
        <option value={OWN}>{Q.own}</option>
      </select>
      <p
        id={helpId}
        className={note ? 'field__help question-picker__note' : 'field__help'}
        aria-live="polite"
      >
        {note ?? (active ? Q.help[active] : Q.ownHelp)}
      </p>
    </div>
  );
}
