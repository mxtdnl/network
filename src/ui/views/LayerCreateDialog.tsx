import { useId, useRef, useState } from 'react';
import {
  BANK_PURPOSES,
  QUESTION_BANK,
  bankRelation,
  hasTopic,
  withTopic,
  type BankItem,
} from '../../data/questionBank';
import {
  RELATION_SCALES,
  ROLE_SCALES,
  createRelation,
  relationKeyFor,
  relationProblems,
  roleAllows,
  type RelationScale,
} from '../../data/relations';
import { LAYER_ROLES, MUTUAL_ROLES, type LayerDefinition, type LayerRole } from '../../data/schema';
import { Dialog } from '../components/Dialog';
import { Switch } from '../components/Switch';
import { bankCopy, relationCopy, roleCopy, scaleCopy } from '../copy/questionBank';
import { useAppStore } from '../state/store';

// Relations the analyst creates (build plan session 11): "Create a relation"
// and "Add from the question bank", offered in the Layers section and in
// Survey setup. Both add an enabled layer with a key generated once from its
// label (data/relations.ts).

/** `onAdded` is told of each relation added, so Survey setup can ask it at once. */
export function RelationActions({ onAdded }: { onAdded?: (layer: LayerDefinition) => void }) {
  const [open, setOpen] = useState<'create' | 'bank' | null>(null);
  const project = useAppStore((s) => s.data.project);
  if (!project) return null;
  return (
    <div className="relation-actions">
      <button
        type="button"
        className="button button--secondary"
        onClick={() => {
          setOpen('create');
        }}
      >
        {relationCopy.create}
      </button>
      <button
        type="button"
        className="button button--secondary"
        onClick={() => {
          setOpen('bank');
        }}
      >
        {bankCopy.open}
      </button>
      <Dialog
        open={open === 'create'}
        title={relationCopy.createTitle}
        onClose={() => {
          setOpen(null);
        }}
      >
        <RelationForm
          {...(onAdded ? { onAdded } : {})}
          onDone={() => {
            setOpen(null);
          }}
        />
      </Dialog>
      <Dialog
        open={open === 'bank'}
        title={bankCopy.title}
        wide
        onClose={() => {
          setOpen(null);
        }}
      >
        <QuestionBank
          {...(onAdded ? { onAdded } : {})}
          onClose={() => {
            setOpen(null);
          }}
        />
      </Dialog>
    </div>
  );
}

function RelationForm({
  onDone,
  onAdded,
}: {
  onDone: () => void;
  onAdded?: (layer: LayerDefinition) => void;
}) {
  const project = useAppStore((s) => s.data.project);
  const addLayer = useAppStore((s) => s.addLayer);
  const setStatus = useAppStore((s) => s.setStatus);
  const [label, setLabel] = useState('');
  const [wording, setWording] = useState('');
  const [role, setRole] = useState<LayerRole>('information');
  const [scale, setScale] = useState<RelationScale>('frequency');
  const [categories, setCategories] = useState('');
  const [mutual, setMutual] = useState(MUTUAL_ROLES.includes('information'));
  const [touched, setTouched] = useState(false);
  const ids = {
    label: useId(),
    wording: useId(),
    role: useId(),
    scale: useId(),
    categories: useId(),
    errors: useId(),
  };
  if (!project) return null;

  const spec = {
    label,
    question_wording: wording,
    role,
    scale,
    categories: categories.split('\n'),
    mutual,
  };
  const problems = relationProblems(spec);
  const show = touched ? problems : [];
  const error = (p: (typeof problems)[number]) =>
    show.includes(p) ? relationCopy.problem[p] : null;
  const labelError = error('emptyLabel');
  const wordingError = error('emptyWording');
  const categoryError =
    error('tooFewCategories') ?? error('tooManyCategories') ?? error('repeatedCategory');

  return (
    <form
      className="layer-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (problems.length > 0) return;
        const layer = createRelation(project, spec);
        addLayer(layer);
        onAdded?.(layer);
        setStatus({ text: relationCopy.created(layer.label), tone: 'info' });
        onDone();
      }}
    >
      <p className="field__help">{relationCopy.intro}</p>
      <div className="field">
        <label htmlFor={ids.label} className="field__label">
          {relationCopy.labelField}
        </label>
        <input
          id={ids.label}
          className="text-input"
          value={label}
          aria-invalid={labelError !== null}
          aria-describedby={`${ids.label}-key${labelError ? ` ${ids.label}-error` : ''}`}
          onChange={(e) => {
            setLabel(e.currentTarget.value);
          }}
        />
        {labelError && (
          <p id={`${ids.label}-error`} className="field__error">
            {labelError}
          </p>
        )}
        <p id={`${ids.label}-key`} className="field__help">
          {label.trim() === '' ? '' : relationCopy.keyPreview(relationKeyFor(project, label))}
        </p>
      </div>
      <div className="field">
        <label htmlFor={ids.wording} className="field__label">
          {relationCopy.wordingField}
        </label>
        <p id={`${ids.wording}-help`} className="field__help">
          {relationCopy.wordingHelp}
        </p>
        <textarea
          id={ids.wording}
          className="text-input text-input--area"
          rows={3}
          value={wording}
          aria-invalid={wordingError !== null}
          aria-describedby={`${ids.wording}-help${wordingError ? ` ${ids.wording}-error` : ''}`}
          onChange={(e) => {
            setWording(e.currentTarget.value);
          }}
        />
        {wordingError && (
          <p id={`${ids.wording}-error`} className="field__error">
            {wordingError}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={ids.role} className="field__label">
          {relationCopy.roleField}
        </label>
        <select
          id={ids.role}
          className="select"
          value={role}
          aria-describedby={`${ids.role}-help`}
          onChange={(e) => {
            const next = e.currentTarget.value as LayerRole;
            setRole(next);
            if (!roleAllows(next, scale)) setScale(ROLE_SCALES[next][0] ?? 'frequency');
            setMutual(MUTUAL_ROLES.includes(next));
          }}
        >
          {LAYER_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleCopy[r].name}
            </option>
          ))}
        </select>
        <p id={`${ids.role}-help`} className="field__help">
          {roleCopy[role].help}
        </p>
      </div>
      <fieldset className="field relation-form__scale">
        <legend className="field__label">{relationCopy.scaleField}</legend>
        <div className="radio-list">
          {RELATION_SCALES.map((s) => (
            <label key={s} className="radio-list__option">
              <input
                type="radio"
                name={ids.scale}
                value={s}
                checked={scale === s}
                disabled={!roleAllows(role, s)}
                onChange={() => {
                  setScale(s);
                }}
              />
              <span>
                {scaleCopy[s].name}
                <span className="field__help"> {scaleCopy[s].help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {scale === 'categories' ? (
        <div className="field">
          <label htmlFor={ids.categories} className="field__label">
            {relationCopy.categoriesField}
          </label>
          <textarea
            id={ids.categories}
            className="text-input text-input--area"
            rows={4}
            value={categories}
            aria-invalid={categoryError !== null}
            aria-describedby={categoryError ? `${ids.categories}-error` : undefined}
            onChange={(e) => {
              setCategories(e.currentTarget.value);
            }}
          />
          {categoryError && (
            <p id={`${ids.categories}-error`} className="field__error">
              {categoryError}
            </p>
          )}
        </div>
      ) : (
        <div className="field">
          <Switch label={relationCopy.mutualField} checked={mutual} onChange={setMutual} />
        </div>
      )}
      <div className="dialog__actions">
        <button type="button" className="button button--text" onClick={onDone}>
          {relationCopy.cancel}
        </button>
        <button type="submit" className="button button--primary">
          {relationCopy.createButton}
        </button>
      </div>
    </form>
  );
}

function QuestionBank({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded?: (layer: LayerDefinition) => void;
}) {
  const project = useAppStore((s) => s.data.project);
  const addLayer = useAppStore((s) => s.addLayer);
  const setStatus = useAppStore((s) => s.setStatus);
  const [topic, setTopic] = useState('');
  const [topicError, setTopicError] = useState(false);
  const [message, setMessage] = useState('');
  const topicRef = useRef<HTMLInputElement>(null);
  const ids = { topic: useId(), intro: useId() };
  if (!project) return null;

  const add = (item: BankItem) => {
    if (hasTopic(item) && topic.trim() === '') {
      setTopicError(true);
      topicRef.current?.focus();
      return;
    }
    const layer = createRelation(project, bankRelation(item, topic));
    addLayer(layer);
    onAdded?.(layer);
    const text = bankCopy.added(layer.label);
    setStatus({ text, tone: 'info' });
    setMessage(text);
  };
  const shown = (text: string) => (topic.trim() === '' ? text : withTopic(text, topic));

  return (
    <div className="bank">
      <p id={ids.intro} className="field__help">
        {bankCopy.intro}
      </p>
      <div className="field">
        <label htmlFor={ids.topic} className="field__label">
          {bankCopy.topicField}
        </label>
        <p id={`${ids.topic}-help`} className="field__help">
          {bankCopy.topicHelp}
        </p>
        <input
          ref={topicRef}
          id={ids.topic}
          className="text-input"
          value={topic}
          aria-invalid={topicError}
          aria-describedby={`${ids.topic}-help${topicError ? ` ${ids.topic}-error` : ''}`}
          onChange={(e) => {
            setTopic(e.currentTarget.value);
            setTopicError(false);
          }}
        />
        {topicError && (
          <p id={`${ids.topic}-error`} className="field__error">
            {bankCopy.topicMissing}
          </p>
        )}
      </div>
      <p className="bank__status" role="status">
        {message}
      </p>
      {BANK_PURPOSES.map((purpose) => (
        <section
          key={purpose}
          className="bank__purpose"
          aria-labelledby={`${ids.intro}-${purpose}`}
        >
          <h3 id={`${ids.intro}-${purpose}`} className="bank__heading">
            {bankCopy.purpose[purpose]}
          </h3>
          <ul className="bank__list">
            {QUESTION_BANK.filter((i) => i.purpose === purpose).map((item) => {
              const label = shown(item.label);
              return (
                <li key={item.id} className="bank__item">
                  <div className="bank__text">
                    <p className="bank__wording">{shown(item.wording)}</p>
                    <p className="field__help">
                      {bankCopy.meta(item.role, item.scale)}{' '}
                      {bankCopy.sensitivity[item.sensitivity]}
                      {item.reversed ? ` ${bankCopy.reversed}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button button--secondary"
                    aria-label={bankCopy.addLabel(label.charAt(0).toUpperCase() + label.slice(1))}
                    onClick={() => {
                      add(item);
                    }}
                  >
                    {bankCopy.add}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="dialog__actions">
        <button type="button" className="button button--primary" onClick={onClose}>
          {bankCopy.close}
        </button>
      </div>
    </div>
  );
}
