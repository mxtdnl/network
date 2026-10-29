import { useId, useMemo, useState } from 'react';
import { defaultLayers } from '../../data/defaults';
import { addImportedTies, existingTieKeys, projectFromImport } from '../../data/import/apply';
import { rosterPeople, type Person } from '../../data/import/match';
import { findVariants, reconcileMembers, type AttributeVariant } from '../../data/import/reconcile';
import type { RawTable } from '../../data/import/table';
import {
  validateMembers,
  validateTies,
  type MembersResult,
  type TieContext,
  type TiesResult,
} from '../../data/import/validate';
import { analyseImport } from '../../data/import/wide';
import type { LayerDefinition, Project } from '../../data/schema';
import { Dialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { importCopy } from '../copy/import';
import { memberNames } from '../state/names';
import { readImportFile } from '../state/projectActions';
import { useAppStore } from '../state/store';
import { ImportWizard, initialWizardState, type WizardState } from './ImportWizard';
import { FileReportSection } from './ValidationReport';

interface CheckResult {
  members: MembersResult | null;
  ties: TiesResult | null;
  /** The ties file waits for a members file that can be imported. */
  tiesDeferred: boolean;
  readErrors: string[];
}

/** A survey tool's wide export being read by the wizard (build plan session 13). */
interface WideImport {
  table: RawTable;
  /** The roster it is matched against: the members file's, or the open project's. */
  roster: Project;
  people: Person[];
  layers: LayerDefinition[];
  context: TieContext;
  state: WizardState;
}

const ACCEPT =
  '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const templateUrl = (name: string) => `${import.meta.env.BASE_URL}templates/${name}`;

function FileField({
  label,
  help,
  file,
  onChange,
}: {
  label: string;
  help: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <span id={id} className="field__label">
        {label}
      </span>
      <p id={`${id}-help`} className="field__help">
        {help}
      </p>
      {/* The native button reads "Choose File" in title case, so the input is
          hidden visually and a sentence-case label acts as its button. */}
      <div className="file-field">
        <input
          id={`${id}-input`}
          type="file"
          accept={ACCEPT}
          className="visually-hidden file-field__input"
          aria-labelledby={`${id} ${id}-name`}
          aria-describedby={`${id}-help`}
          onChange={(e) => {
            onChange(e.currentTarget.files?.[0] ?? null);
          }}
        />
        <label htmlFor={`${id}-input`} className="button button--secondary file-field__button">
          {importCopy.chooseFile}
        </label>
        <span id={`${id}-name`} className="file-field__name">
          {file ? file.name : importCopy.noFile}
        </span>
      </div>
    </div>
  );
}

export function ImportDialog() {
  const open = useAppStore((s) => s.ui.importOpen);
  const setImportOpen = useAppStore((s) => s.setImportOpen);
  const project = useAppStore((s) => s.data.project);

  return (
    <Dialog
      open={open}
      title={importCopy.title}
      wide
      onClose={() => {
        setImportOpen(false);
      }}
    >
      <ImportFlow
        hasProject={project !== null && project.members.length > 0}
        onDone={() => {
          setImportOpen(false);
        }}
      />
    </Dialog>
  );
}

function ImportFlow({ hasProject, onDone }: { hasProject: boolean; onDone: () => void }) {
  const [membersFile, setMembersFile] = useState<File | null>(null);
  const [tiesFile, setTiesFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [wide, setWide] = useState<WideImport | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reconcile, setReconcile] = useState<ReadonlySet<number>>(new Set());
  const setProject = useAppStore((s) => s.setProject);
  const anonymise = useAppStore((s) => s.ui.anonymise);

  const canCheck = !checking && (membersFile !== null || (hasProject && tiesFile !== null));
  const variants = useMemo(
    () => (result?.members && !result.members.report.blocked ? findVariants(result.members) : []),
    [result],
  );

  async function check() {
    setChecking(true);
    const readErrors: string[] = [];
    const read = async (file: File | null) => {
      if (!file) return null;
      try {
        return await readImportFile(file);
      } catch (e) {
        readErrors.push(
          importCopy.unreadable(file.name, e instanceof Error ? e.message : String(e)),
        );
        return null;
      }
    };
    const [membersTable, tiesTable] = await Promise.all([read(membersFile), read(tiesFile)]);
    const current = useAppStore.getState().data.project;
    const members = membersTable ? validateMembers(membersTable) : null;
    setReconcile(new Set());
    setWide(null);

    let ties: TiesResult | null = null;
    let tiesDeferred = false;
    let roster: Project | null = null;
    let context: TieContext | null = null;
    if (tiesTable) {
      if (members && !members.report.blocked) {
        roster = projectFromImport('', new Date().toISOString(), members, null);
        context = {
          memberIds: new Set(members.members.map((m) => m.id)),
          skippedMemberIds: members.skippedIds,
          layers: current?.layers ?? defaultLayers(),
        };
      } else if (!membersFile && current) {
        roster = current;
        context = {
          memberIds: new Set(current.members.map((m) => m.id)),
          layers: current.layers,
          existingKeys: existingTieKeys(current),
        };
      } else tiesDeferred = true;
    }
    if (tiesTable && roster && context) {
      const layers = [...context.layers];
      const people = rosterPeople(roster.members, roster.attribute_definitions);
      // A survey tool's export (one row per respondent) goes to the wizard first.
      if (analyseImport(tiesTable, people, layers).format === 'wide') {
        setWide({
          table: tiesTable,
          roster,
          people,
          layers,
          context,
          state: initialWizardState(tiesTable, people, layers),
        });
        setWizardOpen(true);
      } else ties = validateTies(tiesTable, context);
    }
    setResult({ members, ties, tiesDeferred, readErrors });
    setChecking(false);
  }

  function importValid() {
    if (!result) return;
    const now = new Date().toISOString();
    const current = useAppStore.getState().data.project;
    const chosen: AttributeVariant[] = variants.filter((_, i) => reconcile.has(i));
    const members = result.members ? reconcileMembers(result.members, chosen) : null;
    const { ties } = result;
    const rows = members?.report.validRows ?? 0;
    const ratings = ties?.report.validRows ?? 0;
    const skipped = (members?.report.skippedRows ?? 0) + (ties?.report.skippedRows ?? 0);
    const text = !wide
      ? importCopy.imported(rows + ratings, skipped)
      : members
        ? importCopy.importedBoth(rows, ratings, skipped)
        : importCopy.importedRatings(ratings, skipped);
    const status = { text, tone: 'info' as const };
    if (members && !members.report.blocked) {
      const title = membersFile?.name.replace(/\.(csv|xlsx)$/i, '') ?? importCopy.untitled;
      const next = projectFromImport(title, now, members, ties);
      // Imported layer settings follow the project that was open, if any.
      if (current) next.layers = current.layers;
      setProject(next, status);
    } else if (ties && current) {
      setProject(addImportedTies(current, ties, now), status);
    }
    onDone();
  }

  if (wide && wizardOpen) {
    const names = memberNames(wide.roster, anonymise);
    return (
      <ImportWizard
        table={wide.table}
        people={wide.people}
        layers={wide.layers}
        context={wide.context}
        names={names}
        ids={wide.roster.members.map((m) => m.id)}
        state={wide.state}
        onState={(state) => {
          setWide({ ...wide, state });
        }}
        onBack={() => {
          setWide(null);
          setWizardOpen(false);
          setResult(null);
        }}
        onCancel={onDone}
        onChecked={(ties) => {
          if (result) setResult({ ...result, ties });
          setWizardOpen(false);
        }}
      />
    );
  }

  if (result) {
    const importable =
      (result.members !== null &&
        !result.members.report.blocked &&
        result.members.report.validRows > 0) ||
      (result.members === null && result.ties !== null && result.ties.report.validRows > 0);
    const memberRows = result.members?.report.blocked ? 0 : (result.members?.report.validRows ?? 0);
    const ratingRows = result.ties?.report.validRows ?? 0;
    const label = !wide
      ? importCopy.importValid(memberRows + ratingRows)
      : result.members
        ? importCopy.importBoth(memberRows, ratingRows)
        : importCopy.importRatings(ratingRows);
    return (
      <div className="report">
        <h3 className="report__title">{importCopy.reportTitle}</h3>
        <p className="report__intro">{importCopy.rowNumbers}</p>
        {result.readErrors.map((message) => (
          <p key={message} className="report__line" role="alert">
            <Icon name="warning" />
            {message}
          </p>
        ))}
        {result.members && <FileReportSection report={result.members.report} />}
        {result.members && variants.length > 0 && (
          <ReconcileSection
            members={result.members}
            variants={variants}
            chosen={reconcile}
            onChange={setReconcile}
          />
        )}
        {result.ties && <FileReportSection report={result.ties.report} />}
        {result.tiesDeferred && (
          <p className="report__line">
            <Icon name="info" />
            {importCopy.tiesDeferred}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="button button--text" onClick={onDone}>
            {importCopy.cancel}
          </button>
          <button
            type="button"
            className="button button--text"
            onClick={() => {
              if (wide) setWizardOpen(true);
              else setResult(null);
            }}
          >
            {wide ? importCopy.backToWizard : importCopy.back}
          </button>
          {importable ? (
            <button type="button" className="button button--primary" onClick={importValid}>
              {label}
            </button>
          ) : (
            <p className="report__line">{importCopy.nothingToImport}</p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="import">
      <p className="import__intro">{importCopy.intro}</p>
      {hasProject && <p className="import__intro">{importCopy.replaceWarning}</p>}
      <FileField
        label={importCopy.membersLabel}
        help={importCopy.membersHelp}
        file={membersFile}
        onChange={setMembersFile}
      />
      <FileField
        label={importCopy.tiesLabel}
        help={
          hasProject ? `${importCopy.tiesHelp} ${importCopy.tiesOnlyHelp}` : importCopy.tiesHelp
        }
        file={tiesFile}
        onChange={setTiesFile}
      />
      <div className="import__templates">
        <h3 className="import__templates-heading">{importCopy.templates}</h3>
        <ul className="import__template-list">
          <li>
            <a href={templateUrl('members.csv')} download>
              {importCopy.templateMembers}
            </a>
          </li>
          <li>
            <a href={templateUrl('ties.csv')} download>
              {importCopy.templateTies}
            </a>
          </li>
          <li>
            <a href={templateUrl('members.xlsx')} download>
              {importCopy.templateMembersXlsx}
            </a>
          </li>
          <li>
            <a href={templateUrl('ties.xlsx')} download>
              {importCopy.templateTiesXlsx}
            </a>
          </li>
          <li>
            <a href={templateUrl('ratings-wide.csv')} download>
              {importCopy.templateWide}
            </a>
          </li>
          <li>
            <a href={templateUrl('ratings-wide.xlsx')} download>
              {importCopy.templateWideXlsx}
            </a>
          </li>
        </ul>
      </div>
      {!membersFile && !hasProject && <p className="field__help">{importCopy.needMembers}</p>}
      <div className="dialog__actions">
        <button type="button" className="button button--text" onClick={onDone}>
          {importCopy.cancel}
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={!canCheck}
          onClick={() => {
            void check();
          }}
        >
          {checking ? importCopy.checking : importCopy.check}
        </button>
      </div>
    </div>
  );
}

/** Offers to write attribute values that differ only in case or spacing one way. */
function ReconcileSection({
  members,
  variants,
  chosen,
  onChange,
}: {
  members: MembersResult;
  variants: AttributeVariant[];
  chosen: ReadonlySet<number>;
  onChange: (chosen: ReadonlySet<number>) => void;
}) {
  const id = useId();
  const label = (key: string) => members.attributes.find((a) => a.key === key)?.label ?? key;
  return (
    <fieldset className="report__file reconcile" aria-describedby={`${id}-intro`}>
      <legend className="report__file-heading">{importCopy.reconcileHeading}</legend>
      <p id={`${id}-intro`} className="report__intro">
        {importCopy.reconcileIntro}
      </p>
      <ul className="reconcile__list">
        {variants.map((v, i) => (
          <li key={`${v.attribute}-${v.preferred}`}>
            <label className="radio-list__option">
              <input
                type="checkbox"
                checked={chosen.has(i)}
                onChange={(e) => {
                  const next = new Set(chosen);
                  if (e.currentTarget.checked) next.add(i);
                  else next.delete(i);
                  onChange(next);
                }}
              />
              <span>{importCopy.reconcileOption(label(v.attribute), v.forms, v.preferred)}</span>
            </label>
          </li>
        ))}
      </ul>
      {variants.length > 1 && (
        <button
          type="button"
          className="button button--text"
          onClick={() => {
            onChange(new Set(variants.map((_, i) => i)));
          }}
        >
          {importCopy.reconcileAll}
        </button>
      )}
    </fieldset>
  );
}
