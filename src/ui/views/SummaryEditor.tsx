import { useEffect, useId, useState } from 'react';
import type { AudienceLevel, SavedSummary, SavedSummaryHeadline } from '../../data/schema';
import { Dialog } from '../components/Dialog';
import { audienceLevelName } from '../copy/audience';
import { summaryCopy } from '../copy/summary';
import {
  isCustomHeadline,
  reconcileSummary,
  type EditorHeadline,
  type SummaryText,
} from '../export/summary';
import { draftReportSummary, saveReportSummary } from '../state/exportActions';
import { useAppStore } from '../state/store';

const C = summaryCopy.editor;

interface EditorState {
  level: AudienceLevel;
  draft: SummaryText;
  flags: string[];
  intro: string;
  closing: string;
  items: EditorHeadline[];
  edited: boolean;
}

/** The text as saved: the editor's state without the marks it shows beside each headline. */
function toSaved(s: EditorState): SavedSummary {
  return { intro: s.intro, closing: s.closing, headlines: s.items.map((i) => i.headline) };
}

// The executive summary editor (build plan session 10): the draft from the
// insight rules for the audience chosen in the Export dialog, edited in place
// and saved with the project, one summary per audience level. Fields save
// when they lose focus, and every structural change (include, move, add,
// remove, restore) saves at once, as the Members tab does (D124). The Export
// dialog mounts it each time it opens, so every opening drafts afresh.
export function SummaryEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<EditorState | null>(null);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const id = useId();

  useEffect(() => {
    if (!open) return;
    let live = true;
    void draftReportSummary().then((d) => {
      if (!live) return;
      if (!d) {
        setFailed(true);
        return;
      }
      const saved = useAppStore.getState().data.project?.settings.summaries?.[d.level];
      const r = reconcileSummary(d.draft, saved);
      setState({ ...d, ...r, items: r.headlines, edited: saved !== undefined });
    });
    return () => {
      live = false;
    };
  }, [open]);

  const commit = (next: EditorState) => {
    setState({ ...next, edited: true });
    saveReportSummary(next.level, toSaved(next));
  };
  const setHeadline = (k: number, patch: Partial<SavedSummaryHeadline>, save = false) => {
    if (!state) return;
    const items = state.items.map((item, i) =>
      i === k ? { ...item, headline: { ...item.headline, ...patch } } : item,
    );
    const next = { ...state, items };
    if (save) commit(next);
    else setState(next);
  };
  const move = (k: number, delta: -1 | 1) => {
    if (!state) return;
    const items = [...state.items];
    const [item] = items.splice(k, 1);
    if (!item) return;
    items.splice(k + delta, 0, item);
    commit({ ...state, items });
  };
  const restore = (k: number) => {
    if (!state) return;
    const item = state.items[k];
    const fromDraft = state.draft.headlines.find((h) => h.id === item?.headline.id);
    if (!item || !fromDraft) return;
    setHeadline(k, { ...fromDraft, questions: [...fromDraft.questions] }, true);
  };
  const remove = (k: number) => {
    if (!state) return;
    commit({ ...state, items: state.items.filter((_, i) => i !== k) });
  };
  const add = () => {
    if (!state) return;
    const used = state.items.map((i) => Number(i.headline.id.replace(/^custom:/, '')) || 0);
    const n = Math.max(0, ...used) + 1;
    const headline: SavedSummaryHeadline = {
      id: `custom:${String(n)}`,
      title: '',
      saw: '',
      matters: '',
      questions: [],
      include: true,
    };
    commit({ ...state, items: [...state.items, { headline, stale: false, fresh: false }] });
  };
  const restoreAll = () => {
    if (!state) return;
    saveReportSummary(state.level, null);
    const r = reconcileSummary(state.draft, undefined);
    setState({ ...state, intro: r.intro, closing: r.closing, items: r.headlines, edited: false });
    setMessage(C.restoredAll);
  };
  const save = () => {
    if (state) commit(state);
  };

  const included = state?.items.filter((i) => i.headline.include).length ?? 0;

  return (
    <Dialog
      open={open}
      title={C.title}
      onClose={onClose}
      wide
      describedBy={`${id}-for`}
      actions={
        <>
          <button
            type="button"
            className="button button--text"
            disabled={!state?.edited}
            onClick={restoreAll}
          >
            {C.restoreAll}
          </button>
          <button type="button" className="button button--primary" onClick={onClose}>
            {C.done}
          </button>
        </>
      }
    >
      {state === null ? (
        <p id={`${id}-for`} role="status">
          {failed ? C.failed : C.drafting}
        </p>
      ) : (
        <div className="summary-editor">
          <div id={`${id}-for`} className="summary-editor__about">
            <p>
              {C.for(audienceLevelName(state.level))} {state.edited ? C.edited : C.draft}
            </p>
            {state.level === 'workshop' && <p>{C.workshopNote}</p>}
            <p className="field__help">{C.names}</p>
          </div>

          {state.flags.length > 0 && (
            <section className="summary-editor__flags" aria-labelledby={`${id}-flags`}>
              <h3 id={`${id}-flags`} className="export__heading">
                {summaryCopy.flags.heading}
              </h3>
              {state.flags.map((f) => (
                <p key={f}>{f}</p>
              ))}
            </section>
          )}

          <div className="field">
            <label htmlFor={`${id}-intro`} className="field__label">
              {C.intro}
            </label>
            <textarea
              id={`${id}-intro`}
              className="text-input text-input--area"
              rows={4}
              value={state.intro}
              onChange={(e) => {
                setState({ ...state, intro: e.currentTarget.value });
              }}
              onBlur={save}
            />
          </div>

          <p className="summary-editor__count" role="status">
            {C.included(included, state.items.length)} {C.aim}
          </p>

          {state.items.map((item, k) => {
            const h = item.headline;
            const n = k + 1;
            const f = (part: string) => `${id}-${String(k)}-${part}`;
            const inDraft = state.draft.headlines.some((d) => d.id === h.id);
            return (
              <fieldset key={h.id} className="summary-editor__headline">
                <legend className="summary-editor__legend">{C.headline(n)}</legend>
                {item.stale && <p className="summary-editor__note">{C.stale}</p>}
                {item.fresh && <p className="summary-editor__note">{C.fresh}</p>}
                {isCustomHeadline(h.id) && <p className="field__help">{C.custom}</p>}
                <label className="radio-list__option">
                  <input
                    type="checkbox"
                    checked={h.include}
                    onChange={(e) => {
                      setHeadline(k, { include: e.currentTarget.checked }, true);
                    }}
                  />
                  <span>{C.include}</span>
                </label>
                <div className="field">
                  <label htmlFor={f('title')} className="field__label">
                    {C.headlineTitle}
                  </label>
                  <input
                    id={f('title')}
                    className="text-input"
                    value={h.title}
                    onChange={(e) => {
                      setHeadline(k, { title: e.currentTarget.value });
                    }}
                    onBlur={save}
                  />
                </div>
                {(['saw', 'matters'] as const).map((part) => (
                  <div className="field" key={part}>
                    <label htmlFor={f(part)} className="field__label">
                      {C[part]}
                    </label>
                    <textarea
                      id={f(part)}
                      className="text-input text-input--area"
                      rows={3}
                      value={h[part]}
                      onChange={(e) => {
                        setHeadline(k, { [part]: e.currentTarget.value });
                      }}
                      onBlur={save}
                    />
                  </div>
                ))}
                <div className="field">
                  <label htmlFor={f('questions')} className="field__label">
                    {C.questions}
                  </label>
                  <textarea
                    id={f('questions')}
                    className="text-input text-input--area"
                    rows={3}
                    aria-describedby={f('questions-help')}
                    value={h.questions.join('\n')}
                    onChange={(e) => {
                      setHeadline(k, { questions: e.currentTarget.value.split('\n') });
                    }}
                    onBlur={save}
                  />
                  <p id={f('questions-help')} className="field__help">
                    {C.questionsHelp}
                  </p>
                </div>
                <div className="summary-editor__actions">
                  <button
                    type="button"
                    className="button button--secondary"
                    aria-label={C.moveUp(n)}
                    disabled={k === 0}
                    onClick={() => {
                      move(k, -1);
                    }}
                  >
                    {C.up}
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    aria-label={C.moveDown(n)}
                    disabled={k === state.items.length - 1}
                    onClick={() => {
                      move(k, 1);
                    }}
                  >
                    {C.down}
                  </button>
                  {inDraft && (
                    <button
                      type="button"
                      className="button button--text"
                      aria-label={C.restoreLabel(n)}
                      onClick={() => {
                        restore(k);
                      }}
                    >
                      {C.restore}
                    </button>
                  )}
                  {(isCustomHeadline(h.id) || item.stale) && (
                    <button
                      type="button"
                      className="button button--text"
                      aria-label={C.removeLabel(n)}
                      onClick={() => {
                        remove(k);
                      }}
                    >
                      {C.remove}
                    </button>
                  )}
                </div>
              </fieldset>
            );
          })}

          <button type="button" className="button button--secondary" onClick={add}>
            {C.add}
          </button>

          <div className="field">
            <label htmlFor={`${id}-closing`} className="field__label">
              {C.closing}
            </label>
            <textarea
              id={`${id}-closing`}
              className="text-input text-input--area"
              rows={3}
              value={state.closing}
              onChange={(e) => {
                setState({ ...state, closing: e.currentTarget.value });
              }}
              onBlur={save}
            />
          </div>
          <p className="export__status" role="status">
            {message}
          </p>
        </div>
      )}
    </Dialog>
  );
}
