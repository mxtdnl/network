import { useCallback, useId, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { createProject } from '../../data/defaults';
import {
  addAttribute,
  addMembers,
  parseNameList,
  removalImpact,
  removeMembers,
  renameAttribute,
  updateMember,
  type AddableAttributeType,
} from '../../data/members';
import type { AttributeDefinition, Member, MemberId, Project } from '../../data/schema';
import { membersCopy } from '../copy/members';
import { memberNames, useMemberNames, type MemberNames } from '../state/names';
import { useAppStore } from '../state/store';

const C = membersCopy;
const ADDABLE: readonly AddableAttributeType[] = ['categorical', 'ordinal', 'email'];

/** Starts an empty project and opens the roster editor (CLAUDE.md D124). */
export function startNewProject(): void {
  const { setProject, setCentreView } = useAppStore.getState();
  // Moving to a view clears the status line, so the view changes first.
  setCentreView('members');
  setProject(createProject(C.defaultTitle, new Date().toISOString()), {
    text: C.created,
    tone: 'info',
  });
}

// The Members tab (CLAUDE.md D124): build and edit the roster in Graticule
// instead of importing a members file. Every field saves when it loses focus,
// so typing does not recalculate the analysis on each key.
export function MembersView() {
  const project = useAppStore((s) => s.data.project);
  if (!project) {
    return (
      <div className="members">
        <h2 className="survey__heading">{C.noProject.heading}</h2>
        <p className="survey__text">{C.noProject.body}</p>
        <button type="button" className="button button--primary" onClick={startNewProject}>
          {C.noProject.create}
        </button>
      </div>
    );
  }
  return <MembersEditor project={project} />;
}

function MembersEditor({ project }: { project: Project }) {
  const names = useMemberNames();
  const updateProjectViews = useAppStore((s) => s.updateProjectViews);
  const setCentreView = useAppStore((s) => s.setCentreView);
  const setMatrixMode = useAppStore((s) => s.setMatrixMode);
  const [removing, setRemoving] = useState<MemberId | null>(null);
  const peopleHeading = useRef<HTMLHeadingElement>(null);
  const ids = {
    title: useId(),
    titleHelp: useId(),
    managers: useId(),
    managerHelp: useId(),
    caption: useId(),
  };

  // Email addresses and ids can identify people, so they are hidden with names (D79, D109).
  const columns = project.attribute_definitions.filter(
    (a) => !(names.anonymised && a.type === 'email'),
  );
  const impact = removing ? removalImpact(project, [removing]) : null;

  return (
    <div className="members">
      <h2 className="survey__heading">{C.heading}</h2>
      <p className="survey__text">{C.intro}</p>

      <div className="field">
        <label htmlFor={ids.title} className="field__label">
          {C.title}
        </label>
        <input
          key={`${String(names.anonymised)}:${project.meta.title}`}
          id={ids.title}
          className="text-input"
          defaultValue={names.text(project.meta.title)}
          readOnly={names.anonymised}
          aria-describedby={ids.titleHelp}
          onBlur={(e) => {
            const title = e.currentTarget.value.trim();
            if (title === '') e.currentTarget.value = project.meta.title;
            else if (title !== project.meta.title) {
              // The title is not analysed, so nothing is recalculated.
              updateProjectViews((p) => ({ ...p, meta: { ...p.meta, title } }));
            }
          }}
        />
        <p id={ids.titleHelp} className="field__help">
          {C.titleHelp}
        </p>
      </div>

      <AddPeople />

      <section className="members__section" aria-labelledby={ids.caption}>
        <h3 id={ids.caption} ref={peopleHeading} tabIndex={-1} className="members__heading">
          {C.list.heading(project.members.length)}
        </h3>
        {names.anonymised && (
          <p className="members__note">
            <Icon name="info" />
            {C.list.hidden}
          </p>
        )}
        {project.members.length === 0 ? (
          <p className="placeholder">{C.list.empty}</p>
        ) : (
          <>
            <p className="field__help">{C.list.caption}</p>
            {!names.anonymised && columns.some((a) => a.type === 'member_ref') && (
              <p id={ids.managerHelp} className="field__help">
                {C.list.managerHelp}
              </p>
            )}
            <datalist id={ids.managers}>
              {names.byIndex.map((name, i) => (
                <option key={project.members[i]?.id ?? i} value={name} />
              ))}
            </datalist>
            {columns
              .filter((a) => a.type === 'categorical' || a.type === 'ordinal')
              .map((a) => (
                <datalist key={a.key} id={`${ids.managers}-${a.key}`}>
                  {/* Values members hold now, so a value no longer used is not suggested. */}
                  {(a.categories ?? [])
                    .filter((c) => project.members.some((m) => m.attributes[a.key] === c))
                    .map((c) => (
                      <option key={c} value={c} />
                    ))}
                </datalist>
              ))}
            <div className="members__scroll">
              <table className="data-table members__table">
                <thead>
                  <tr>
                    {!names.anonymised && <th scope="col">{C.list.id}</th>}
                    <th scope="col">{C.list.name}</th>
                    {columns.map((a) => (
                      <th key={a.key} scope="col">
                        {a.label}
                      </th>
                    ))}
                    <th scope="col">
                      <span className="visually-hidden">{C.list.actions}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {project.members.map((m) => (
                    <MemberRow
                      key={m.id}
                      member={m}
                      columns={columns}
                      name={names.of(m.id)}
                      names={names}
                      listId={ids.managers}
                      helpId={ids.managerHelp}
                      onRemove={setRemoving}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <Columns project={project} />

      {project.members.length >= 2 && (
        <section className="members__section">
          <h3 className="members__heading">{C.next.heading}</h3>
          <p className="survey__text">{C.next.body}</p>
          <div className="members__actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setCentreView('survey');
              }}
            >
              {C.next.survey}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setMatrixMode('enter');
                setCentreView('matrix');
              }}
            >
              {C.next.matrix}
            </button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={C.remove.title(removing ? names.of(removing) : '')}
        body={
          impact
            ? C.remove.body(impact.ratings, impact.reports, impact.surveys.map(names.text))
            : ''
        }
        confirm={C.remove.confirm}
        cancel={C.remove.cancel}
        onCancel={() => {
          setRemoving(null);
        }}
        onConfirm={() => {
          const id = removing;
          setRemoving(null);
          if (!id) return;
          const name = names.of(id);
          useAppStore.getState().updateProject((p) => removeMembers(p, [id]), {
            text: C.remove.removed(name),
            tone: 'info',
          });
          // The row and its button are gone; focus goes to the list's heading.
          requestAnimationFrame(() => {
            peopleHeading.current?.focus();
          });
        }}
      />
    </div>
  );
}

function AddPeople() {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const ids = { field: useId(), help: useId(), error: useId(), heading: useId() };
  return (
    <section className="members__section" aria-labelledby={ids.heading}>
      <h3 id={ids.heading} className="members__heading">
        {C.add.heading}
      </h3>
      <form
        className="members__add"
        onSubmit={(e) => {
          e.preventDefault();
          const list = parseNameList(text);
          if (list.length === 0) {
            setError(true);
            return;
          }
          setError(false);
          useAppStore.getState().updateProject(
            (p) =>
              addMembers(
                p,
                list.map((name) => ({ name })),
              ),
            {
              text: C.add.added(list.length),
              tone: 'info',
            },
          );
          setText('');
        }}
      >
        <div className="field">
          <label htmlFor={ids.field} className="field__label">
            {C.add.label}
          </label>
          <textarea
            id={ids.field}
            className="text-input text-input--area"
            rows={4}
            value={text}
            aria-describedby={error ? `${ids.help} ${ids.error}` : ids.help}
            aria-invalid={error || undefined}
            onChange={(e) => {
              setText(e.currentTarget.value);
            }}
          />
          <p id={ids.help} className="field__help">
            {C.add.help}
          </p>
          {error && (
            <p id={ids.error} className="field__error">
              <Icon name="warning" />
              {C.add.empty}
            </p>
          )}
        </div>
        <button type="submit" className="button button--primary">
          {C.add.action}
        </button>
      </form>
    </section>
  );
}

interface RowProps {
  member: Member;
  columns: AttributeDefinition[];
  /** The member's name, or their code when names are hidden. */
  name: string;
  names: MemberNames;
  listId: string;
  helpId: string;
  onRemove: (id: MemberId) => void;
}

// One row per member. Fields are uncontrolled and keyed by the stored value,
// so a change saved elsewhere replaces what is shown.
function MemberRow({ member, columns, name, names, listId, helpId, onRemove }: RowProps) {
  const hidden = names.anonymised;
  const commit = useCommit(member.id);
  return (
    <tr>
      {!hidden && <td className="members__id num">{member.id}</td>}
      <td>
        <input
          key={name}
          className="text-input members__name"
          aria-label={C.list.nameOf(name)}
          defaultValue={name}
          readOnly={hidden}
          onBlur={(e) => {
            if (hidden) return;
            const value = e.currentTarget.value.trim();
            if (value === name) return;
            if (value === '') {
              e.currentTarget.value = name;
              useAppStore.getState().setStatus({ text: C.list.nameRequired, tone: 'error' });
              return;
            }
            commit({ name: value });
          }}
        />
      </td>
      {columns.map((a) => {
        const stored = member.attributes[a.key] ?? null;
        const label = C.list.attributeOf(a.label, name);
        if (a.type === 'member_ref') {
          const shown = stored === null ? '' : names.of(stored);
          return (
            <td key={a.key}>
              <input
                key={shown}
                className="text-input members__field"
                aria-label={label}
                aria-describedby={hidden ? undefined : helpId}
                list={hidden ? undefined : listId}
                defaultValue={shown}
                readOnly={hidden}
                onBlur={(e) => {
                  if (hidden) return;
                  const value = e.currentTarget.value.trim();
                  if (value === shown) return;
                  const id = value === '' ? null : resolveMember(value, member.id);
                  if (id === undefined) {
                    e.currentTarget.value = shown;
                    useAppStore
                      .getState()
                      .setStatus({ text: C.list.unknownManager(value), tone: 'error' });
                    return;
                  }
                  commit({ attributes: { [a.key]: id } });
                }}
              />
            </td>
          );
        }
        return (
          <td key={a.key}>
            <input
              key={stored ?? ''}
              type={a.type === 'email' ? 'email' : 'text'}
              className="text-input members__field"
              aria-label={label}
              list={a.type === 'email' ? undefined : `${listId}-${a.key}`}
              defaultValue={stored ?? ''}
              onBlur={(e) => {
                const value = e.currentTarget.value.trim();
                if (value === (stored ?? '')) return;
                commit({ attributes: { [a.key]: value === '' ? null : value } });
              }}
            />
          </td>
        );
      })}
      <td>
        <button
          type="button"
          className="button button--text"
          aria-label={C.list.removeLabel(name)}
          onClick={() => {
            onRemove(member.id);
          }}
        >
          {C.list.remove}
        </button>
      </td>
    </tr>
  );
}

function useCommit(id: MemberId) {
  return useCallback(
    (patch: Parameters<typeof updateMember>[2]) => {
      useAppStore.getState().updateProject((p) => updateMember(p, id, patch));
    },
    [id],
  );
}

/** The member a typed manager names: an exact name held by one other member,
 *  else the same ignoring case, else an id. Undefined when none or several match. */
function resolveMember(value: string, self: MemberId): MemberId | undefined {
  const s = useAppStore.getState();
  const project = s.data.project;
  if (!project) return undefined;
  const names = memberNames(project, false);
  const others = project.members.filter((m) => m.id !== self);
  const exact = others.filter((m) => names.of(m.id) === value);
  if (exact.length === 1) return exact[0]?.id;
  if (exact.length > 1) return undefined;
  const lower = value.toLowerCase();
  const loose = others.filter((m) => names.of(m.id).toLowerCase() === lower);
  if (loose.length === 1) return loose[0]?.id;
  if (loose.length > 1) return undefined;
  return others.find((m) => m.id === value)?.id;
}

function Columns({ project }: { project: Project }) {
  const names = useMemberNames();
  const [label, setLabel] = useState('');
  const [type, setType] = useState<AddableAttributeType>('categorical');
  const [error, setError] = useState<string | null>(null);
  const ids = { heading: useId(), label: useId(), type: useId(), error: useId(), help: useId() };
  const hasEmail = project.attribute_definitions.some((a) => a.type === 'email');
  return (
    <section className="members__section" aria-labelledby={ids.heading}>
      <h3 id={ids.heading} className="members__heading">
        {C.attributes.heading}
      </h3>
      <p id={ids.help} className="survey__text">
        {C.attributes.help}
      </p>
      <div className="members__columns">
        {project.attribute_definitions
          .filter((a) => !(names.anonymised && a.type === 'email'))
          .map((a) => (
            <div key={a.key} className="field">
              <label htmlFor={`${ids.label}-${a.key}`} className="field__label">
                {C.attributes.label(a.label)}
              </label>
              <input
                key={a.label}
                id={`${ids.label}-${a.key}`}
                className="text-input"
                defaultValue={a.label}
                aria-describedby={`${ids.label}-${a.key}-key`}
                onBlur={(e) => {
                  const value = e.currentTarget.value.trim();
                  if (value === '') {
                    e.currentTarget.value = a.label;
                    return;
                  }
                  if (value === a.label) return;
                  // A label is not analysed, so nothing is recalculated.
                  useAppStore
                    .getState()
                    .updateProjectViews((p) => renameAttribute(p, a.key, value));
                  useAppStore
                    .getState()
                    .setStatus({ text: C.attributes.renamed(value), tone: 'info' });
                }}
              />
              <p id={`${ids.label}-${a.key}-key`} className="field__help">
                {C.attributes.key(a.key)}
              </p>
            </div>
          ))}
      </div>
      <form
        className="members__add-column"
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim() === '') {
            setError(C.attributes.emptyLabel);
            return;
          }
          if (type === 'email' && hasEmail) {
            setError(C.attributes.emailExists);
            return;
          }
          setError(null);
          const text = label.trim();
          useAppStore.getState().updateProject((p) => addAttribute(p, text, type), {
            text: C.attributes.added(text),
            tone: 'info',
          });
          setLabel('');
        }}
      >
        <div className="field">
          <label htmlFor={ids.label} className="field__label">
            {C.attributes.addLabel}
          </label>
          <input
            id={ids.label}
            className="text-input"
            value={label}
            aria-invalid={error !== null || undefined}
            aria-describedby={error ? ids.error : undefined}
            onChange={(e) => {
              setLabel(e.currentTarget.value);
            }}
          />
          {error && (
            <p id={ids.error} className="field__error">
              <Icon name="warning" />
              {error}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor={ids.type} className="field__label">
            {C.attributes.addType}
          </label>
          <select
            id={ids.type}
            className="select"
            value={type}
            onChange={(e) => {
              setType(e.currentTarget.value as AddableAttributeType);
            }}
          >
            {ADDABLE.map((t) => (
              <option key={t} value={t} disabled={t === 'email' && hasEmail}>
                {C.attributes.types[t]}
              </option>
            ))}
          </select>
          {type === 'email' && <p className="field__help">{C.attributes.emailNote}</p>}
        </div>
        <button type="submit" className="button button--secondary">
          {C.attributes.addAction}
        </button>
      </form>
    </section>
  );
}
