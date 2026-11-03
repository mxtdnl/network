import { useId, useState } from 'react';
import { engagementCopy } from '../copy/engagement';
import { startTour } from '../state/tour';
import { readTour } from '../state/tourStorage';
import { shellCopy } from '../copy/shell';
import { loadDemo } from '../state/projectActions';
import { useReadOnly } from '../state/layoutMode';
import { useAppStore } from '../state/store';
import { startNewProject } from './MembersView';

// Shown in the map view until a project has data (spec §12: empty states tell
// the user the next action).
export function EmptyState() {
  const headingId = useId();
  const tourHelpId = useId();
  // Offered until the first run has been finished or skipped; Help starts it again (session 16).
  const [offerTour] = useState(() => {
    const record = readTour();
    return record?.status !== 'done' && record?.status !== 'skipped';
  });
  const setImportOpen = useAppStore((s) => s.setImportOpen);
  const setCentreView = useAppStore((s) => s.setCentreView);
  const hasProject = useAppStore((s) => s.data.project !== null);
  const copy = shellCopy.empty;
  // On a phone the project can be viewed, not built: only the demo and Project → Open remain.
  const readOnly = useReadOnly();
  return (
    <section className="empty-state" aria-labelledby={headingId}>
      <h2 id={headingId} className="empty-state__heading">
        {copy.heading}
      </h2>
      <p className="empty-state__body">{readOnly ? copy.phoneBody : copy.body}</p>
      <div className="empty-state__actions">
        {!readOnly && (
          <>
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                setCentreView('survey');
              }}
            >
              {copy.runSurvey}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                // Without a project, one is started first (CLAUDE.md D124).
                if (hasProject) setCentreView('members');
                else startNewProject();
              }}
            >
              {copy.addMembers}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setImportOpen(true);
              }}
            >
              {copy.importData}
            </button>
          </>
        )}
        <button
          type="button"
          className={readOnly ? 'button button--primary' : 'button button--secondary'}
          onClick={() => {
            void loadDemo();
          }}
        >
          {copy.loadDemo}
        </button>
      </div>
      {!readOnly && offerTour && (
        <div className="empty-state__tour">
          <button
            type="button"
            className="button button--text"
            aria-describedby={tourHelpId}
            onClick={() => {
              void startTour();
            }}
          >
            {engagementCopy.tour.offer}
          </button>
          <p id={tourHelpId} className="field__help">
            {engagementCopy.tour.offerHelp}
          </p>
        </div>
      )}
      <p className="empty-state__note">{copy.privacy}</p>
    </section>
  );
}
