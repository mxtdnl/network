import { useId, useMemo, useState } from 'react';
import {
  ANNOTATION_MAX,
  ANNOTATION_SIDES,
  type AnnotationSide,
  type MapAnnotation,
} from '../../data/schema';
import { annotationsCopy as A } from '../copy/annotations';
import {
  addNote,
  noteProblem,
  removeAllNotes,
  removeNote,
  startPlacing,
  updateNote,
} from '../state/annotations';
import { useMemberNames } from '../state/names';
import { useAppStore } from '../state/store';
import { useWaveProject } from '../state/waves';

// Notes on the map (build plan session 17), in the Views tab above the saved
// views: write a note, attach it to a member or a point clicked on the map,
// and edit or remove the notes on the map now. A view keeps the notes it was
// saved or updated with. While names are hidden, notes are shown with names
// replaced and cannot be edited, as captions (D77).

const POINT = '';

export function AnnotationTools() {
  const project = useWaveProject();
  const notes = useAppStore((s) => s.map.annotations);
  const filters = useAppStore((s) => s.map.filters);
  const selected = useAppStore((s) => s.selection.member);
  const names = useMemberNames();
  const [text, setText] = useState('');
  const [anchor, setAnchor] = useState<string | null>(null);
  const [side, setSide] = useState<AnnotationSide>('aboveRight');
  const [error, setError] = useState<string | null>(null);
  const textId = useId();
  const anchorId = useId();
  const sideId = useId();
  const errorId = useId();
  const listId = useId();

  // Members in name order (codes while names are hidden), with the map's filters applied.
  const members = useMemo(() => {
    if (!project) return [];
    return project.members
      .filter((m) => filters.every((f) => f.values.includes(m.attributes[f.key] ?? '')))
      .map((m) => ({ id: m.id, name: names.of(m.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [project, filters, names]);
  if (!project || project.members.length === 0) return null;
  const readOnly = names.anonymised;
  // The member selected on the map is the default anchor; else a point.
  const chosen = anchor ?? (selected && members.some((m) => m.id === selected) ? selected : POINT);
  const full = notes.length >= ANNOTATION_MAX;

  const submit = () => {
    const problem = full ? A.full : noteProblem(text);
    setError(problem);
    if (problem) {
      document.getElementById(textId)?.focus();
      return;
    }
    const ok =
      chosen === POINT
        ? startPlacing(text, side)
        : addNote(text, { kind: 'member', member: chosen }, side);
    if (ok) {
      setText('');
      setAnchor(null);
    }
  };

  const describe = (a: MapAnnotation) => {
    if (a.anchor.kind === 'point') return A.atPoint;
    const id = a.anchor.member;
    const name = names.of(id);
    return members.some((m) => m.id === id) ? A.onMember(name) : A.hiddenMember(name);
  };

  return (
    <section className="notes" aria-labelledby={`${listId}-h`}>
      <h3 id={`${listId}-h`} className="views__heading">
        {A.heading}
      </h3>
      <p className="field__help">{A.intro}</p>
      {readOnly ? (
        <p className="field__help">{A.hidden}</p>
      ) : (
        <form
          className="notes__new"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor={textId} className="field__label">
            {A.text}
          </label>
          <input
            id={textId}
            className="text-input"
            value={text}
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setText(e.currentTarget.value);
              if (error) setError(null);
            }}
          />
          {error && (
            <p id={errorId} className="field__error" role="alert">
              {error}
            </p>
          )}
          <div className="notes__row">
            <div className="notes__field">
              <label htmlFor={anchorId} className="field__label">
                {A.anchor}
              </label>
              <select
                id={anchorId}
                className="select"
                value={chosen}
                onChange={(e) => {
                  setAnchor(e.currentTarget.value);
                }}
              >
                <option value={POINT}>{A.point}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="notes__field">
              <label htmlFor={sideId} className="field__label">
                {A.side}
              </label>
              <select
                id={sideId}
                className="select"
                value={side}
                onChange={(e) => {
                  setSide(e.currentTarget.value as AnnotationSide);
                }}
              >
                {ANNOTATION_SIDES.map((s) => (
                  <option key={s} value={s}>
                    {A.sides[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <button type="submit" className="button button--secondary">
              {chosen === POINT ? A.place : A.add}
            </button>
          </div>
        </form>
      )}
      <h4 id={listId} className="notes__list-heading">
        {A.list}
      </h4>
      {notes.length === 0 ? (
        <p className="placeholder">{A.none}</p>
      ) : (
        <>
          <ol className="notes__list" aria-labelledby={listId}>
            {notes.map((a, k) => (
              <NoteItem
                key={a.id}
                note={a}
                index={k}
                where={describe(a)}
                readOnly={readOnly}
                shown={names.text(a.text)}
              />
            ))}
          </ol>
          <p className="field__help">{A.saveHint}</p>
          {!readOnly && (
            <button
              type="button"
              className="button button--text"
              onClick={() => {
                removeAllNotes();
              }}
            >
              {A.removeAll}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function NoteItem({
  note,
  index,
  where,
  readOnly,
  shown,
}: {
  note: MapAnnotation;
  index: number;
  where: string;
  readOnly: boolean;
  shown: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textId = useId();
  const sideId = useId();
  const whereId = useId();
  const errorId = useId();
  return (
    <li className="notes__item">
      <label htmlFor={textId} className="field__label">
        {A.edit(index + 1)}
      </label>
      <p id={whereId} className="field__help notes__where">
        {where}
      </p>
      <input
        id={textId}
        className="text-input"
        value={readOnly ? shown : (draft ?? note.text)}
        readOnly={readOnly}
        aria-invalid={error !== null}
        aria-describedby={error ? `${whereId} ${errorId}` : whereId}
        onChange={(e) => {
          setDraft(e.currentTarget.value);
          if (error) setError(null);
        }}
        onBlur={() => {
          if (draft === null) return;
          const problem = noteProblem(draft);
          setError(problem);
          if (problem) return;
          updateNote(note.id, { text: draft });
          setDraft(null);
        }}
      />
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="notes__row">
        <div className="notes__field">
          <label htmlFor={sideId} className="field__label">
            {A.side}
          </label>
          <select
            id={sideId}
            className="select"
            value={note.side}
            disabled={readOnly}
            onChange={(e) => {
              updateNote(note.id, { side: e.currentTarget.value as AnnotationSide });
            }}
          >
            {ANNOTATION_SIDES.map((s) => (
              <option key={s} value={s}>
                {A.sides[s]}
              </option>
            ))}
          </select>
        </div>
        {!readOnly && (
          <button
            type="button"
            className="button button--text"
            aria-label={A.removeLabel(note.text)}
            onClick={() => {
              removeNote(note.id);
            }}
          >
            {A.remove}
          </button>
        )}
      </div>
    </li>
  );
}
