import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../components/Dialog';
import { Icon } from '../components/Icon';
import { MenuButton } from '../components/MenuButton';
import { Switch } from '../components/Switch';
import { coverageCopy, coveragePercent, percent, persistenceCopy, projectCopy } from '../copy/data';
import { shellCopy } from '../copy/shell';
import { clearAllLocalData, setPersistenceOn } from '../state/persistenceSync';
import { loadDemo, openProjectFile, saveProjectFile } from '../state/projectActions';
import {
  setLayoutPreference,
  useLayoutPreference,
  useReadOnly,
  type LayoutPreference,
} from '../state/layoutMode';
import { useAppStore } from '../state/store';
import { useCoverage } from './DataCheckPanel';
import { savedViewsCopy } from '../copy/savedViews';
import { setNamesHidden, useMemberNames } from '../state/names';
import { canPresent, startPresentation } from '../state/presentation';
import { exportCopy } from '../copy/export';
import { ExportDialog } from './ExportDialog';
import { helpCopy, type HelpDoc } from '../copy/help';
import { startNewProject } from './MembersView';

// The help documents are loaded with the dialog, on first use.
const HelpDialog = lazy(() => import('./HelpDialog').then((m) => ({ default: m.HelpDialog })));

type Pending = 'new' | 'open' | 'demo' | null;

interface TopBarProps {
  /** The compact layout's status line, inline in the bar (D125). */
  status?: ReactNode;
}

export function TopBar({ status }: TopBarProps) {
  const anonymise = useAppStore((s) => s.ui.anonymise);
  const presentable = useAppStore((s) => canPresent(s.data.project));
  const openNotice = useAppStore((s) => s.openNotice);
  const setImportOpen = useAppStore((s) => s.setImportOpen);
  const project = useAppStore((s) => s.data.project);
  const persistence = useAppStore((s) => s.data.persistence);
  const coverage = useCoverage();
  const names = useMemberNames();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [help, setHelp] = useState<HelpDoc | null>(null);
  const [helpDoc, setHelpDoc] = useState<HelpDoc>('guide');
  // The help opens from a menu item that is gone once the menu closes, so
  // closing the help returns focus to the Help button itself.
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const openHelp = (doc: HelpDoc) => {
    setHelpDoc(doc);
    setHelp(doc);
  };

  const hasData = project !== null && project.members.length > 0;
  // Importing changes the project, so the read-only phone layout leaves it out.
  const phone = useReadOnly();
  const layout = useLayoutPreference();
  function chooseProjectFile() {
    fileRef.current?.click();
  }
  function onOpen() {
    if (hasData) setPending('open');
    else chooseProjectFile();
  }
  function onNew() {
    if (hasData) setPending('new');
    else startNewProject();
  }
  function onDemo() {
    if (hasData) setPending('demo');
    else void loadDemo();
  }

  const indicator =
    persistence === 'off'
      ? null
      : persistence === 'saving'
        ? persistenceCopy.indicatorSaving
        : persistence === 'error'
          ? persistenceCopy.indicatorError
          : persistenceCopy.indicator;

  return (
    <header className="top-bar">
      <h1 className="top-bar__name">{shellCopy.appName}</h1>
      {/* A title may name a member, so it goes through the names layer (D79). */}
      <p className="top-bar__project">
        {project ? names.text(project.meta.title) : shellCopy.noProject}
      </p>
      {status}
      {indicator && (
        <p className="top-bar__indicator">
          <Icon name={persistence === 'error' ? 'warning' : 'check'} />
          {indicator}
        </p>
      )}
      <div className="top-bar__actions">
        {/* In the compact layout the coverage warning is here, in its short form (D125).
            Until the first rating, a neutral note takes its place (D140). */}
        {coverage && Number.isFinite(coverage.rate) && coverage.rated === 0 && (
          <p className="top-bar__coverage top-bar__coverage--none" role="note">
            {coverageCopy.noRatings}
          </p>
        )}
        {coverage && Number.isFinite(coverage.rate) && coverage.rated > 0 && (
          <p
            className="top-bar__coverage num"
            role={status && coverage.belowThreshold ? 'note' : undefined}
          >
            {coverage.belowThreshold && <Icon name="warning" />}
            {status && coverage.belowThreshold
              ? coverageCopy.warningShort(
                  coveragePercent(coverage.rate, coverage.threshold),
                  percent(coverage.threshold),
                )
              : coverageCopy.topBar(coveragePercent(coverage.rate, coverage.threshold))}
          </p>
        )}
        <Switch label={shellCopy.hideNames} checked={anonymise} onChange={setNamesHidden} />
        <button
          type="button"
          className="button button--text"
          disabled={!presentable}
          title={presentable ? undefined : savedViewsCopy.presentHelp}
          onClick={() => {
            startPresentation();
          }}
        >
          {shellCopy.present}
        </button>
        <button
          type="button"
          className="button button--text"
          disabled={!hasData}
          onClick={() => {
            setExporting(true);
          }}
        >
          {exportCopy.menu}
        </button>
        <MenuButton
          label={projectCopy.menu}
          items={[
            // Building a project changes it, so the read-only phone layout leaves it out.
            ...(phone ? [] : [{ key: 'new', label: projectCopy.newProject, onSelect: onNew }]),
            { key: 'open', label: projectCopy.open, onSelect: onOpen },
            { key: 'save', label: projectCopy.save, onSelect: saveProjectFile, disabled: !project },
            ...(phone
              ? []
              : [
                  {
                    key: 'import',
                    label: projectCopy.importData,
                    onSelect: () => {
                      setImportOpen(true);
                    },
                  },
                ]),
            { key: 'demo', label: projectCopy.loadDemo, onSelect: onDemo },
            {
              key: 'keep',
              label: projectCopy.keepLocal,
              checked: persistence !== 'off',
              onSelect: () => {
                void setPersistenceOn(persistence === 'off');
              },
            },
            {
              key: 'clear',
              label: projectCopy.clearLocal,
              onSelect: () => {
                setConfirmClear(true);
              },
            },
          ]}
        />
        <div ref={helpMenuRef} className="top-bar__help">
          <MenuButton
            label={shellCopy.help}
            items={[
              ...(['guide', 'method', 'respondent', 'licence'] as const).map((doc) => ({
                key: doc,
                label: helpCopy.menu[doc],
                onSelect: () => {
                  openHelp(doc);
                },
              })),
              { key: 'notice', label: shellCopy.helpMenu.notice, onSelect: openNotice },
              // Applies at desktop widths; tablet and phone follow the width (D125).
              ...(['auto', 'compact', 'full'] as const satisfies readonly LayoutPreference[]).map(
                (pref) => ({
                  key: `layout-${pref}`,
                  label: shellCopy.helpMenu.layout[pref],
                  radio: true,
                  checked: layout === pref,
                  onSelect: () => {
                    setLayoutPreference(pref);
                  },
                }),
              ),
            ]}
          />
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) void openProjectFile(file);
        }}
      />
      <ConfirmDialog
        open={pending !== null}
        title={projectCopy.replaceTitle}
        body={projectCopy.replaceBody}
        confirm={projectCopy.replaceConfirm[pending ?? 'open']}
        cancel={projectCopy.cancel}
        onCancel={() => {
          setPending(null);
        }}
        onConfirm={() => {
          const action = pending;
          setPending(null);
          if (action === 'new') startNewProject();
          else if (action === 'open') chooseProjectFile();
          else if (action === 'demo') void loadDemo();
        }}
      />
      {help !== null && (
        <Suspense fallback={null}>
          <HelpDialog
            open
            doc={helpDoc}
            onDoc={setHelpDoc}
            onClose={() => {
              setHelp(null);
              // After the dialog has gone: until then the rest of the page is inert.
              requestAnimationFrame(() => {
                helpMenuRef.current?.querySelector('button')?.focus();
              });
            }}
          />
        </Suspense>
      )}
      <ExportDialog
        open={exporting}
        onClose={() => {
          setExporting(false);
        }}
      />
      <ConfirmDialog
        open={confirmClear}
        title={persistenceCopy.clearTitle}
        body={persistenceCopy.clearBody}
        confirm={persistenceCopy.clearConfirm}
        cancel={projectCopy.cancel}
        onCancel={() => {
          setConfirmClear(false);
        }}
        onConfirm={() => {
          setConfirmClear(false);
          void clearAllLocalData();
        }}
      />
    </header>
  );
}
