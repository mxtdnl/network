import { useId, useState } from 'react';
import {
  BANK_PURPOSES,
  QUESTION_BANK,
  withTopic,
  type BankPurpose,
} from '../../../data/questionBank';
import type { LayerDefinition, Project } from '../../../data/schema';
import {
  estimateMinutes,
  estimateSeconds,
  extraSeconds,
  type SurveyDraft,
} from '../../../survey/model';
import { bankCopy } from '../../copy/questionBank';
import { designCopy as G } from '../../copy/surveyDesign';
import { RelationActions } from '../LayerCreateDialog';

/** People who need to respond to reach a coverage threshold. */
export const respondentsNeeded = (members: number, threshold: number) =>
  Math.min(members, Math.ceil(members * threshold - 1e-9));

// Design guidance at the head of Survey setup (build plan session 12): the
// relations the question bank suggests for a purpose, what the two entry
// methods record and cost for this roster, and the response rate a
// whole-network design needs.
export function SurveyGuidance({
  project,
  draft,
  onAdded,
}: {
  project: Project;
  draft: SurveyDraft;
  onAdded: (layer: LayerDefinition) => void;
}) {
  const [purpose, setPurpose] = useState<BankPurpose | ''>('');
  const ids = { purpose: useId(), heading: useId() };
  const members = project.members.length;
  const extra = extraSeconds(draft.context.length, draft.boundary?.length ?? 0);
  const time = (entry: 'full' | 'nominate') =>
    estimateMinutes(
      estimateSeconds(
        members,
        draft.layers.length,
        entry,
        draft.settings.expected_nominations,
        draft.required.length,
        extra,
      ),
    );
  const threshold = project.settings.coverage_threshold;
  const selected = Math.min(
    Math.max(0, members - 1),
    Math.max(draft.settings.expected_nominations, draft.required.length),
  );
  return (
    <details className="survey-guidance" open>
      <summary className="survey-guidance__summary">{G.heading}</summary>
      <p className="field__help">{G.intro}</p>

      <section className="survey-guidance__part" aria-labelledby={`${ids.heading}-p`}>
        <h3 id={`${ids.heading}-p`} className="survey-guidance__heading">
          {G.purposeHeading}
        </h3>
        <p className="survey-guidance__text">{G.purposeHelp}</p>
        <div className="field">
          <label htmlFor={ids.purpose} className="field__label">
            {G.purposeField}
          </label>
          <select
            id={ids.purpose}
            className="select"
            value={purpose}
            onChange={(e) => {
              setPurpose(e.currentTarget.value as BankPurpose | '');
            }}
          >
            <option value="">{G.purposeNone}</option>
            {BANK_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {bankCopy.purpose[p]}
              </option>
            ))}
          </select>
        </div>
        {purpose && (
          <>
            <h4 className="survey-guidance__subheading">{G.suggested}</h4>
            <ul className="survey-guidance__list">
              {QUESTION_BANK.filter((i) => i.purpose === purpose).map((i) => (
                <li key={i.id}>
                  {withTopic(i.wording, '…')}{' '}
                  <span className="field__help">{bankCopy.sensitivity[i.sensitivity]}</span>
                </li>
              ))}
            </ul>
            <RelationActions purpose={purpose} bankLabel={G.addFromPurpose} onAdded={onAdded} />
          </>
        )}
        <p className="survey-guidance__text num">{G.count(draft.layers.length)}</p>
        <p className="survey-guidance__text">{G.anchors}</p>
      </section>

      <section className="survey-guidance__part" aria-labelledby={`${ids.heading}-e`}>
        <h3 id={`${ids.heading}-e`} className="survey-guidance__heading">
          {G.entryHeading}
        </h3>
        <dl className="survey-guidance__compare">
          <div>
            <dt>
              {G.fullName}
              {draft.entry === 'full' ? ` (${G.current.toLowerCase()})` : ''}
            </dt>
            <dd>{G.fullRecords}</dd>
            <dd className="num">{G.cost(time('full'))}</dd>
          </div>
          <div>
            <dt>
              {G.nominateName}
              {draft.entry === 'nominate' ? ` (${G.current.toLowerCase()})` : ''}
            </dt>
            <dd>{G.nominateRecords}</dd>
            <dd className="num">{G.costNominate(time('nominate'), selected)}</dd>
          </div>
        </dl>
      </section>

      <section className="survey-guidance__part" aria-labelledby={`${ids.heading}-r`}>
        <h3 id={`${ids.heading}-r`} className="survey-guidance__heading">
          {G.rateHeading}
        </h3>
        <p className="survey-guidance__text num">
          {G.rateBody(threshold, members, respondentsNeeded(members, threshold))}
        </p>
        <p className="survey-guidance__text num">{G.bothWays(threshold, threshold * threshold)}</p>
        <p className="survey-guidance__text">{G.practice}</p>
      </section>
    </details>
  );
}
