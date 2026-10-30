import { useWaveInfo, useWaveProject } from '../state/waves';
import { useId, useMemo, useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';
import { Switch } from '../components/Switch';
import { exportCopy as E } from '../copy/export';
import { computeQuality } from '../../data/quality';
import { qualityCopy } from '../copy/quality';
import { excludedLayers, exclusionApplies, exportProject } from '../export/scope';
import { QualityStatement } from './DataCheckPanel';
import {
  exportMapFile,
  exportReportFile,
  exportTableFile,
  setExcludeSigned,
  type MapFormat,
  type Resolution,
  type TableKind,
} from '../state/exportActions';
import { setNamesHidden, useMemberNames } from '../state/names';
import { useAppStore } from '../state/store';
import { allows, type ExportKind } from '../state/audience';
import { audienceChoice } from '../state/audienceSettings';
import { audienceCopy } from '../copy/audience';
import { exportCardFile } from '../state/exportActions';
import { AudienceSelect } from './AudienceSelect';
import { SummaryEditor } from './SummaryEditor';
import { summaryCopy } from '../copy/summary';
import { useReadOnly } from '../state/layoutMode';

// The export dialog (spec §11): the two settings every export follows at the
// top (hide names, leave out signed and conflict layers), then the map, the
// tables and the report. One export runs at a time; its result is announced
// in the status line with the button's verb ("Export map" → "Map exported").
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useAppStore((s) => s.data.project);
  // The exports show the wave analysed (build plan session 14).
  const scoped = useWaveProject();
  const wave = useWaveInfo();
  const ready = useAppStore(
    (s) =>
      s.results.current !== null &&
      scoped !== null &&
      s.results.current.memberIds.length === scoped.members.length,
  );
  const anonymise = useAppStore((s) => s.ui.anonymise);
  const hasFormalInformal = useAppStore(
    (s) => s.results.current?.multiplex?.formalInformal != null,
  );
  const [format, setFormat] = useState<MapFormat>('png');
  const [resolution, setResolution] = useState<Resolution>('x2');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const id = useId();
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const readOnly = useReadOnly();
  const report = useAppStore((s) => s.ui.report);
  const setReportChoice = useAppStore((s) => s.setReportChoice);
  const views = project?.saved_views ?? [];
  const chosen = report.views ?? views.map((v) => v.id);
  const names = useMemberNames();

  const excludeSigned = project?.settings.exclude_signed_from_exports ?? false;
  // Outputs the audience level offers (build plan session 9); the others are disabled with a reason.
  const audience = useAppStore((s) =>
    s.data.project ? audienceChoice(s.data.project, s.ui.audience).level : 'analyst',
  );
  const offered = (kind: ExportKind) => allows({ level: audience }, kind);
  const notOffered = audienceCopy.notOffered(audience);
  const anyExcludable = project ? exclusionApplies(project, true) : false;
  // The statement as the exports carry it: from the project they show (D105).
  const quality = useMemo(
    () => (scoped ? computeQuality(exportProject(scoped, excludeSigned), wave?.wave) : null),
    [scoped, excludeSigned, wave?.wave],
  );

  const run = async (key: string, action: () => Promise<string | null>) => {
    setBusy(key);
    setMessage(excludeSigned && anyExcludable ? E.reanalysing : E.busy);
    const file = await action();
    setBusy(null);
    setMessage(file ? '' : (useAppStore.getState().data.status?.text ?? ''));
  };

  const tableButton = (kind: TableKind, label: string, help: string, disabled = false) => (
    <div className="export__item">
      <button
        type="button"
        className="button button--secondary"
        disabled={!ready || busy !== null || disabled || !offered(kind)}
        aria-describedby={`${id}-${kind}-help`}
        onClick={() => {
          void run(kind, () => exportTableFile(kind));
        }}
      >
        {label}
      </button>
      <p id={`${id}-${kind}-help`} className="field__help">
        {offered(kind) ? help : notOffered}
      </p>
    </div>
  );

  return (
    <Dialog
      open={open}
      title={E.dialogTitle}
      onClose={onClose}
      wide
      describedBy={`${id}-intro`}
      actions={
        <button type="button" className="button button--text" onClick={onClose}>
          {E.close}
        </button>
      }
    >
      <p id={`${id}-intro`} className="export__intro">
        {ready ? E.intro : E.noAnalysis}
      </p>

      <section className="export__section" aria-labelledby={`${id}-settings`}>
        <h3 id={`${id}-settings`} className="export__heading">
          {E.settings.heading}
        </h3>
        <AudienceSelect />
        <div className="export__setting">
          <Switch label={E.settings.hideNames} checked={anonymise} onChange={setNamesHidden} />
          <p className="field__help">{E.settings.hideNamesHelp}</p>
        </div>
        <div className="export__setting">
          <Switch
            label={E.settings.excludeSigned}
            checked={excludeSigned}
            onChange={setExcludeSigned}
          />
          <p className="field__help">
            {anyExcludable && project
              ? E.settings.excludeSignedHelp(
                  excludedLayers(project)
                    .filter((l) => l.enabled)
                    .map((l) => l.label),
                )
              : E.settings.excludeSignedNone}
          </p>
        </div>
      </section>

      {quality && (
        <section className="export__section" aria-labelledby={`${id}-quality`}>
          <h3 id={`${id}-quality`} className="export__heading">
            {qualityCopy.exportHeading}
          </h3>
          <QualityStatement quality={quality} className="export-dialog__statement" />
          <p className="field__help">{qualityCopy.exportHelp}</p>
        </section>
      )}

      <section className="export__section" aria-labelledby={`${id}-map`}>
        <h3 id={`${id}-map`} className="export__heading">
          {E.map.heading}
        </h3>
        <p className="field__help">{E.map.help}</p>
        <div className="export__choices">
          <fieldset className="export__fieldset">
            <legend className="field__label">{E.map.format}</legend>
            <div className="radio-list">
              {(['png', 'svg'] as const).map((f) => (
                <label key={f} className="radio-list__option">
                  <input
                    type="radio"
                    name={`${id}-format`}
                    checked={format === f}
                    onChange={() => {
                      setFormat(f);
                    }}
                  />
                  <span>{f === 'png' ? E.map.png : E.map.svg}</span>
                </label>
              ))}
            </div>
            {format === 'svg' && <p className="field__help">{E.map.svgHelp}</p>}
          </fieldset>
          <fieldset className="export__fieldset" disabled={format !== 'png'}>
            <legend className="field__label">{E.map.resolution}</legend>
            <div className="radio-list">
              {(['x1', 'x2', 'print'] as const).map((r) => (
                <label key={r} className="radio-list__option">
                  <input
                    type="radio"
                    name={`${id}-resolution`}
                    checked={resolution === r}
                    onChange={() => {
                      setResolution(r);
                    }}
                  />
                  <span>{E.map[r]}</span>
                </label>
              ))}
            </div>
            {resolution === 'print' && format === 'png' && (
              <p className="field__help">{E.map.printHelp}</p>
            )}
          </fieldset>
        </div>
        <div className="field">
          <label htmlFor={`${id}-caption`} className="field__label">
            {E.map.caption}
          </label>
          <textarea
            id={`${id}-caption`}
            className="text-input text-input--area export__caption"
            rows={2}
            value={caption}
            aria-describedby={`${id}-caption-help`}
            onChange={(e) => {
              setCaption(e.currentTarget.value);
            }}
          />
          <p id={`${id}-caption-help`} className="field__help">
            {E.map.captionHelp}
          </p>
        </div>
        <button
          type="button"
          className="button button--primary"
          disabled={!ready || busy !== null || !offered('map')}
          aria-describedby={offered('map') ? undefined : `${id}-map-level`}
          onClick={() => {
            void run('map', () => exportMapFile(format, resolution, caption));
          }}
        >
          {E.map.export}
        </button>
        {!offered('map') && (
          <p id={`${id}-map-level`} className="field__help">
            {notOffered}
          </p>
        )}
        {(audience === 'board' || audience === 'leadership') && (
          <p className="field__help">{E.groupsOnly}</p>
        )}
      </section>

      <section className="export__section" aria-labelledby={`${id}-tables`}>
        <h3 id={`${id}-tables`} className="export__heading">
          {E.tables.heading}
        </h3>
        <p className="field__help">{E.tables.help}</p>
        {tableButton('members', E.tables.members, E.tables.membersHelp)}
        {tableButton('network', E.tables.network, E.tables.networkHelp)}
        {tableButton(
          'formalInformal',
          E.tables.formalInformal,
          hasFormalInformal ? E.tables.formalInformalHelp : E.tables.formalInformalUnavailable,
          !hasFormalInformal,
        )}
      </section>

      <section className="export__section" aria-labelledby={`${id}-report`}>
        <h3 id={`${id}-report`} className="export__heading">
          {E.report.heading}
        </h3>
        <p className="field__help">{E.report.help}</p>
        {offered('report') && (
          <>
            <fieldset className="export__fieldset">
              <legend className="field__label">{E.report.views}</legend>
              {views.length === 0 ? (
                <p className="field__help">{E.report.noViews}</p>
              ) : (
                <>
                  <div className="radio-list">
                    {views.map((v) => (
                      <label key={v.id} className="radio-list__option">
                        <input
                          type="checkbox"
                          checked={chosen.includes(v.id)}
                          onChange={(e) => {
                            const on = e.currentTarget.checked;
                            const next = views
                              .map((x) => x.id)
                              .filter((x) => (x === v.id ? on : chosen.includes(x)));
                            setReportChoice({
                              views: next.length === views.length ? null : next,
                            });
                          }}
                        />
                        <span>{names.text(v.name)}</span>
                      </label>
                    ))}
                  </div>
                  <p className="field__help">
                    {chosen.length === 0 ? E.report.noneChosen : E.report.viewsHelp}
                  </p>
                </>
              )}
            </fieldset>
            <label className="radio-list__option">
              <input
                type="checkbox"
                checked={report.appendices}
                onChange={(e) => {
                  setReportChoice({ appendices: e.currentTarget.checked });
                }}
              />
              <span>{E.report.appendices}</span>
            </label>
            <p className="field__help">{E.report.appendicesHelp}</p>
            {!readOnly && (
              <div className="export__item">
                <button
                  ref={editButton}
                  type="button"
                  className="button button--secondary"
                  disabled={!ready || busy !== null}
                  aria-describedby={`${id}-summary-help`}
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  {summaryCopy.editor.open}
                </button>
                <p id={`${id}-summary-help`} className="field__help">
                  {summaryCopy.editor.openHelp}
                </p>
              </div>
            )}
          </>
        )}
        <button
          type="button"
          className="button button--primary"
          disabled={!ready || busy !== null || !offered('report')}
          aria-describedby={offered('report') ? undefined : `${id}-report-level`}
          onClick={() => {
            void run('report', () => exportReportFile(caption));
          }}
        >
          {E.report.export}
        </button>
        {!offered('report') && (
          <p id={`${id}-report-level`} className="field__help">
            {notOffered}
          </p>
        )}
      </section>

      {offered('card') && (
        <section className="export__section" aria-labelledby={`${id}-card`}>
          <h3 id={`${id}-card`} className="export__heading">
            {audienceCopy.card.title}
          </h3>
          <p className="field__help">{audienceCopy.exports.cardHelp}</p>
          <button
            type="button"
            className="button button--primary"
            disabled={!ready || busy !== null}
            onClick={() => {
              void run('card', exportCardFile);
            }}
          >
            {audienceCopy.exports.card}
          </button>
        </section>
      )}

      <p className="export__status" role="status">
        {message}
      </p>
      {editing && (
        <SummaryEditor
          open
          onClose={() => {
            setEditing(false);
            // The editor is removed once closed, so focus returns to the button that opened it.
            setTimeout(() => {
              editButton.current?.focus();
            });
          }}
        />
      )}
    </Dialog>
  );
}
