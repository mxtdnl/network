import { useEffect, useId, useState } from 'react';
import respondentHelp from '../../../../docs/respondent-help.md?raw';
import type { Project, Survey } from '../../../data/schema';
import { contextItem } from '../../../survey/context';
import {
  buildLinks,
  currentVersion,
  estimateMinutes,
  estimateSeconds,
  extraSeconds,
} from '../../../survey/model';
import { pageBase } from '../../../survey/payload';
import { kitFileName, launchKit, launchKitCopy as L } from '../../copy/launchKit';
import { useAppStore } from '../../state/store';
import { downloadText } from './download';
import { respondentsNeeded } from './SurveyGuidance';

// The launch kit on the survey's dashboard (build plan session 12): a draft of
// each message, built from the current version's settings, each saved as a
// text file. The drafts name no member, so neither export setting applies.
export function LaunchKit({ project, survey }: { project: Project; survey: Survey }) {
  const setStatus = useAppStore((s) => s.setStatus);
  const headingId = useId();
  const [packageFile, setPackageFile] = useState<string | null>(null);
  const version = currentVersion(survey);

  useEffect(() => {
    const run = { live: true };
    void buildLinks(survey, project, pageBase(window.location.href)).then((l) => {
      if (run.live) setPackageFile(l.packages.get(version.version)?.fileName ?? null);
    });
    return () => {
      run.live = false;
    };
  }, [survey, project, version.version]);

  const threshold = project.settings.coverage_threshold;
  const members = version.roster.length;
  const docs = launchKit({
    title: survey.title,
    introduction: survey.texts.introduction,
    confidentiality: survey.texts.confidentiality,
    returnInstructions: survey.texts.return_instructions,
    deadline: survey.deadline,
    minutes: estimateMinutes(
      estimateSeconds(
        members,
        version.layers.length,
        version.entry,
        survey.settings.expected_nominations,
        version.required.length,
        extraSeconds(version.context?.length ?? 0, version.boundary?.length ?? 0),
      ),
    ),
    members,
    needed: respondentsNeeded(members, threshold),
    threshold,
    entry: version.entry,
    questions: version.layers.map((l) => l.label),
    context: (version.context ?? []).map((q) => contextItem(q.id).question),
    boundary: version.boundary ?? [],
    packageFile,
    respondentHelp,
  });

  return (
    <section className="survey-dashboard__section" aria-labelledby={headingId}>
      <h3 id={headingId} className="survey-dashboard__subheading">
        {L.heading}
      </h3>
      <p className="survey-dashboard__text">{L.intro}</p>
      <p className="survey-dashboard__text">{L.noNames}</p>
      <ol className="launch-kit__list">
        {docs.map((d) => {
          const file = kitFileName(survey.id, d.id);
          return (
            <li key={d.id} className="launch-kit__item">
              <div className="launch-kit__row">
                <div>
                  <p className="launch-kit__name">{d.title}</p>
                  <p className="field__help">{d.description}</p>
                </div>
                <button
                  type="button"
                  className="button button--secondary"
                  aria-label={L.downloadLabel(d.title)}
                  onClick={() => {
                    downloadText(d.text, file);
                    setStatus({ text: L.downloaded(file), tone: 'info' });
                  }}
                >
                  {L.download}
                </button>
              </div>
              <details className="launch-kit__preview">
                <summary>{L.preview}</summary>
                <pre className="launch-kit__text">{d.text}</pre>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
