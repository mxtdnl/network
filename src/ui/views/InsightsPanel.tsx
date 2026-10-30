import { useWaveProject } from '../state/waves';
import { useId, useMemo } from 'react';
import type { InsightOutcome, Observation } from '../engineClient';
import { Icon } from '../components/Icon';
import { coveragePercent } from '../copy/data';
import {
  insightsCopy as I,
  membersText,
  noRatingsMark,
  questionText,
  ruleText,
  viewText,
  type InsightContext,
} from '../copy/insights';
import { mapCopy } from '../copy/map';
import { focusMapMember } from '../map/focus';
import { refLabel } from '../map/model';
import { groupingAttributes, insightGroup } from '../state/insightGroup';
import { saveInsightAsView, showInsight } from '../state/insights';
import { useReadOnly } from '../state/layoutMode';
import { useMemberNames } from '../state/names';
import { useAppStore } from '../state/store';

// The insights panel (spec §9): every rule, in a fixed order, with the rule
// as applied, its observations as questions, the members concerned, and a
// button that shows the observation on the map. Rules that found nothing or
// could not be applied say so, so the panel never implies more than it
// checked. Member names come from the names layer, so anonymisation applies.
export function InsightsPanel() {
  const project = useWaveProject();
  const result = useAppStore((s) => s.results.current);
  const highlight = useAppStore((s) => s.map.highlight);
  const setMap = useAppStore((s) => s.setMap);
  const setInsightGroup = useAppStore((s) => s.setInsightGroup);
  const readOnly = useReadOnly();
  const groupId = useId();
  const groupHelpId = useId();

  const ctx = useMemo<InsightContext | null>(
    () =>
      project
        ? {
            layerLabel: (ref) =>
              ref === 'composite' ? mapCopy.controls.composite : refLabel(project, ref),
            attributeLabel: (key) =>
              project.attribute_definitions.find((a) => a.key === key)?.label ?? key,
          }
        : null,
    [project],
  );

  if (!project || !result || !ctx || project.members.length === 0) {
    return <p className="placeholder">{I.noResult}</p>;
  }
  const directed = result.view === 'directed';
  const coverage = result.coverage;
  const group = insightGroup(project);
  const options = groupingAttributes(project);
  const groupLabel = group?.label ?? 'team';

  return (
    <div className="insights">
      <p className="insights__intro">{I.intro}</p>
      {coverage?.belowThreshold && (
        <p className="insights__coverage" role="note">
          <Icon name="warning" />
          {I.coverage(coveragePercent(coverage.rate, coverage.threshold))}
        </p>
      )}
      {group && (
        <div className="field insights__group">
          {readOnly ? (
            <p className="field__help">
              {I.groupBy}: {group.label}
            </p>
          ) : (
            <>
              <label htmlFor={groupId} className="field__label">
                {I.groupBy}
              </label>
              <select
                id={groupId}
                className="select"
                aria-describedby={groupHelpId}
                value={group.key}
                onChange={(e) => {
                  setInsightGroup(e.target.value);
                }}
              >
                {options.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </>
          )}
          <p id={groupHelpId} className="field__help">
            {I.groupByHelp}
          </p>
        </div>
      )}
      {highlight.length > 0 && (
        <button
          type="button"
          className="button button--text insights__clear"
          onClick={() => {
            setMap({ highlight: [] });
          }}
        >
          {I.clearHighlight}
        </button>
      )}
      {result.insights.map((o) => (
        <Rule key={o.rule} outcome={o} directed={directed} ctx={ctx} group={groupLabel} />
      ))}
    </div>
  );
}

function Rule({
  outcome,
  directed,
  ctx,
  group,
}: {
  outcome: InsightOutcome;
  directed: boolean;
  ctx: InsightContext;
  /** Label of the attribute the group rules use. */
  group: string;
}) {
  const headingId = useId();
  const title = I.titles[outcome.rule];
  return (
    <section className="insight" aria-labelledby={headingId}>
      <h3 id={headingId} className="insight__title">
        {title}
      </h3>
      <p className="insight__rule">
        <span className="insight__rule-label">{I.ruleLabel}</span>{' '}
        {ruleText(outcome.rule, directed, group)}
      </p>
      {outcome.status === 'unavailable' && outcome.reason && (
        <p className="insight__status">{I.unavailable[outcome.reason]}</p>
      )}
      {outcome.status === 'none' && (
        <p className="insight__status">
          {outcome.inSilo ? I.peripheralInSilo(outcome.inSilo) : I.none}
        </p>
      )}
      {outcome.observations.map((o, k, all) => (
        <ObservationItem
          key={k}
          o={o}
          // Buttons of several observations under one rule need distinct names.
          label={all.length > 1 ? I.nth(title, k + 1, all.length) : title}
          ctx={ctx}
        />
      ))}
    </section>
  );
}

function ObservationItem({
  o,
  label,
  ctx,
}: {
  o: Observation;
  /** The rule's title, numbered when the rule has several observations. */
  label: string;
  ctx: InsightContext;
}) {
  const names = useMemberNames();
  const readOnly = useReadOnly();
  const selectMember = useAppStore((s) => s.selectMember);
  const setRightPanel = useAppStore((s) => s.setRightPanel);
  const listId = useId();
  const silent = new Set(o.noRatings ?? []);
  const members = o.members.map((id) => ({ id, name: names.of(id), silent: silent.has(id) }));
  const about = membersText(o, ctx);
  return (
    <div className="insight__observation">
      <p className="insight__question">{questionText(o, ctx)}</p>
      <p id={listId} className="insight__members-label">
        {I.membersLabel(members.length, o.rule)}
      </p>
      <ul className="insight__members" aria-labelledby={listId}>
        {members.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              className="insight__member"
              onClick={() => {
                selectMember(m.id);
                setRightPanel('member');
                focusMapMember(m.id);
              }}
            >
              {m.name}
              {m.silent && <span className="insight__member-flag"> ({noRatingsMark})</span>}
            </button>
          </li>
        ))}
      </ul>
      {about && <p className="insight__shared">{about}</p>}
      <p className="insight__view">
        <span className="insight__rule-label">{I.viewLabel}</span> {viewText(o.view, ctx)}
      </p>
      <div className="insight__actions">
        <button
          type="button"
          className="button button--secondary"
          aria-label={I.showLabel(label)}
          onClick={() => {
            showInsight(o);
          }}
        >
          {I.show}
        </button>
        {!readOnly && (
          <button
            type="button"
            className="button button--text"
            aria-label={I.saveViewLabel(label)}
            onClick={() => {
              saveInsightAsView(o, ctx);
            }}
          >
            {I.saveView}
          </button>
        )}
      </div>
    </div>
  );
}
