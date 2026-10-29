import { useId, useMemo, useState } from 'react';
import { computeCoverage } from '../../data/coverage';
import {
  computeBoundary,
  computeQuality,
  type BoundaryResult,
  type BoundaryRow,
  type GroupBreakdown,
  type QualityResult,
} from '../../data/quality';
import { BOUNDARY_BAND_ORDER } from '../../data/schema';
import { Icon } from '../components/Icon';
import { coverageCopy, coveragePercent } from '../copy/data';
import { qualityCopy, qualityStatement } from '../copy/quality';
import { useReadOnly } from '../state/layoutMode';
import { useMemberNames, type MemberNames } from '../state/names';
import { useAppStore } from '../state/store';
import { RemediesSection } from './RemediesSection';

const Q = qualityCopy;

export function useCoverage() {
  const project = useAppStore((s) => s.data.project);
  return useMemo(() => (project ? computeCoverage(project) : null), [project]);
}

/** The data-quality checks of the open project (src/data/quality.ts). */
export function useQuality(): QualityResult | null {
  const project = useAppStore((s) => s.data.project);
  return useMemo(() => (project ? computeQuality(project) : null), [project]);
}

/** The data-quality statement as paragraphs, for the panel, the Export dialog and the presentation. */
export function QualityStatement({
  quality,
  className,
}: {
  quality: QualityResult;
  className?: string;
}) {
  return (
    <div className={className ?? 'quality-statement'}>
      {qualityStatement(quality).map((sentence) => (
        <p key={sentence}>{sentence}</p>
      ))}
    </div>
  );
}

// "Check the data" (build plan session 4; spec §6, data coverage and data
// quality): the data-quality statement, coverage overall, by group and by
// level, who gave no ratings or few, how each person rates, and ties reported
// by one side only. Members are named here for the analyst only, through the
// names layer; the statement gives counts.
export function DataCheckPanel() {
  const project = useAppStore((s) => s.data.project);
  const quality = useQuality();
  const setThreshold = useAppStore((s) => s.setCoverageThreshold);
  const thresholdId = useId();
  const tableId = useId();
  const statementId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const names = useMemberNames();
  const phone = useReadOnly();

  const coverage = quality?.coverage;
  if (!project || !quality || !coverage || !Number.isFinite(coverage.rate)) {
    return <p className="placeholder">{coverageCopy.noData}</p>;
  }

  const raters = [...coverage.raters].sort(
    (a, b) => a.rate - b.rate || names.of(a.id).localeCompare(names.of(b.id)),
  );
  const shown = draft ?? String(Math.round(coverage.threshold * 100));
  const draftValid = /^\d{1,3}$/.test(shown) && Number(shown) <= 100;
  const rated = coverage.rated > 0;

  return (
    <div className="coverage">
      <section className="quality__section" aria-labelledby={statementId}>
        <h3 id={statementId} className="coverage__subheading">
          {Q.statementHeading}
        </h3>
        <QualityStatement quality={quality} />
        <p className="coverage__explain">{Q.statementIntro}</p>
      </section>

      <h3 className="coverage__subheading">{Q.coverageHeading}</h3>
      <dl className="definition-list definition-list--wide">
        <dt>{coverageCopy.overall}</dt>
        <dd className="num">
          {coveragePercent(coverage.rate, coverage.threshold)}
          {coverage.belowThreshold && (
            <span className="coverage__flag">
              <Icon name="warning" />
              {coverageCopy.below}
            </span>
          )}
        </dd>
      </dl>
      {/* Until the first rating, a neutral note instead of a warning (D140). */}
      {!rated && (
        <p className="coverage__none" role="note">
          {coverageCopy.noRatingsNote}
        </p>
      )}
      <p className="coverage__counts num">
        {coverageCopy.counts(coverage.rated, coverage.possible)}
      </p>
      <p className="coverage__explain">{coverageCopy.explain}</p>
      <h3 className="coverage__subheading">{coverageCopy.sourcesHeading}</h3>
      <dl className="definition-list definition-list--wide">
        {(['self_report', 'imported', 'entered', 'none'] as const).map((k) => {
          const n = project.ties.filter((t) => (t.source ?? 'none') === k).length;
          return n === 0 ? null : (
            <div key={k} className="coverage__source">
              <dt>{coverageCopy.sources[k]}</dt>
              <dd className="num">{n}</dd>
            </div>
          );
        })}
      </dl>

      <div className="field field--inline">
        <label htmlFor={thresholdId} className="field__label">
          {coverageCopy.threshold}
        </label>
        <span className="percent-input">
          <input
            id={thresholdId}
            className="text-input text-input--number num"
            inputMode="numeric"
            value={shown}
            aria-describedby={`${thresholdId}-help`}
            aria-invalid={!draftValid}
            // The threshold is saved with the project: on a phone it is shown, not changed.
            readOnly={phone}
            onChange={(e) => {
              const text = e.currentTarget.value;
              setDraft(text);
              if (/^\d{1,3}$/.test(text) && Number(text) <= 100) setThreshold(Number(text) / 100);
            }}
            onBlur={() => {
              if (draftValid) setDraft(null);
            }}
          />
          <span aria-hidden="true">%</span>
        </span>
      </div>
      <p id={`${thresholdId}-help`} className="field__help">
        {draftValid ? coverageCopy.thresholdHelp : coverageCopy.thresholdInvalid}
      </p>

      {rated && <GroupTable breakdown={quality.byGroup} threshold={coverage.threshold} />}
      {rated && <GroupTable breakdown={quality.byLevel} threshold={coverage.threshold} />}

      {rated && <Silent quality={quality} names={names} />}
      {rated && <Styles quality={quality} names={names} />}
      {rated && <OneWay quality={quality} />}
      <Boundary />
      {rated && <RemediesSection />}

      <table className="coverage__table">
        <caption id={tableId} className="coverage__caption">
          {coverageCopy.tableCaption}
        </caption>
        <thead>
          <tr>
            <th scope="col">{coverageCopy.columns.member}</th>
            <th scope="col" className="numeric">
              {coverageCopy.columns.rate}
            </th>
            <th scope="col" className="numeric">
              {coverageCopy.columns.declined}
            </th>
            <th scope="col" className="numeric">
              {coverageCopy.columns.notApplicable}
            </th>
            <th scope="col" className="numeric">
              {coverageCopy.columns.notEntered}
            </th>
          </tr>
        </thead>
        <tbody>
          {raters.map((r) => {
            const below = rated && Number.isFinite(r.rate) && r.rate < coverage.threshold;
            return (
              <tr key={r.id}>
                <th scope="row" className="coverage__name">
                  {names.of(r.id)}
                </th>
                <td className="numeric">
                  {below && (
                    <span className="coverage__row-flag">
                      <Icon name="warning" />
                      <span className="visually-hidden">{coverageCopy.below}</span>
                    </span>
                  )}
                  {coveragePercent(r.rate, coverage.threshold)}
                </td>
                <td className="numeric">{r.declined}</td>
                <td className="numeric">{r.notApplicable}</td>
                <td className="numeric">{r.notEntered}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">{coverageCopy.totals}</th>
            <td className="numeric">{coveragePercent(coverage.rate, coverage.threshold)}</td>
            <td className="numeric">{coverage.declined}</td>
            <td className="numeric">{coverage.notApplicable}</td>
            <td className="numeric">{coverage.notEntered}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function GroupTable({
  breakdown,
  threshold,
}: {
  breakdown: GroupBreakdown | null;
  threshold: number;
}) {
  if (!breakdown || breakdown.rows.length === 0) return null;
  const C = Q.groupColumns;
  return (
    <table className="coverage__table quality__table">
      <caption className="coverage__caption">{Q.byGroupHeading(breakdown.label)}</caption>
      <thead>
        <tr>
          <th scope="col">{C.group(breakdown.label)}</th>
          <th scope="col" className="numeric">
            {C.respondents}
          </th>
          <th scope="col" className="numeric">
            {C.rate}
          </th>
          <th scope="col" className="numeric">
            {C.oneWay}
          </th>
        </tr>
      </thead>
      <tbody>
        {breakdown.rows.map((row) => {
          const below = Number.isFinite(row.rate) && row.rate < threshold;
          return (
            <tr key={row.value ?? ''}>
              <th scope="row">{row.value ?? Q.notRecorded}</th>
              <td className="numeric">
                {row.respondents} / {row.members}
              </td>
              <td className="numeric">
                {below && (
                  <span className="coverage__row-flag">
                    <Icon name="warning" />
                    <span className="visually-hidden">{coverageCopy.below}</span>
                  </span>
                )}
                {Q.rate(row.rate, threshold)}
              </td>
              <td className="numeric">{Q.share(row.oneWayShare)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Silent({ quality, names }: { quality: QualityResult; names: MemberNames }) {
  const id = useId();
  const none = quality.noRatings;
  const few = quality.fewRatings;
  return (
    <section className="quality__section" aria-labelledby={id}>
      <h3 id={id} className="coverage__subheading">
        {Q.silentHeading}
      </h3>
      {none.length === 0 && few.length === 0 ? (
        <p className="coverage__explain">{Q.noneSilent}</p>
      ) : (
        <>
          <p className="coverage__explain">{Q.silentIntro}</p>
          {none.length > 0 && (
            <>
              <p className="quality__count">{Q.noRatings(none.length)}</p>
              <ul className="quality__names">
                {none.map((m) => (
                  <li key={m}>{names.of(m)}</li>
                ))}
              </ul>
            </>
          )}
          {few.length > 0 && (
            <>
              <p className="quality__count">{Q.fewRatings(few.length)}</p>
              <ul className="quality__names">
                {few.map((m) => (
                  <li key={m}>{names.of(m)}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Styles({ quality, names }: { quality: QualityResult; names: MemberNames }) {
  const id = useId();
  const C = Q.styleColumns;
  const rows = quality.raters
    .filter((s) => s.ratings > 0)
    .sort((a, b) => b.mean - a.mean || names.of(a.id).localeCompare(names.of(b.id)));
  return (
    <section className="quality__section" aria-labelledby={id}>
      <h3 id={id} className="coverage__subheading">
        {Q.styleHeading}
      </h3>
      <p className="coverage__explain">{Q.styleIntro}</p>
      <p className="coverage__explain num">
        {Q.medians(Q.mean(quality.medianMean), Q.share(quality.medianTiedShare))}
      </p>
      <table className="coverage__table quality__table">
        <caption className="coverage__caption">{Q.styleCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{C.member}</th>
            <th scope="col" className="numeric">
              {C.mean}
            </th>
            <th scope="col" className="numeric">
              {C.spread}
            </th>
            <th scope="col" className="numeric">
              {C.scaleUsed}
            </th>
            <th scope="col" className="numeric">
              {C.tiedShare}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const notes = [
              s.style === 'higher' ? Q.styleNotes.higher : null,
              s.style === 'lower' ? Q.styleNotes.lower : null,
              s.sameAnswer ? Q.styleNotes.sameAnswer : null,
              s.manyTies ? Q.styleNotes.manyTies : null,
            ].filter((x): x is string => x !== null);
            return (
              <tr key={s.id}>
                <th scope="row" className="coverage__name">
                  {names.of(s.id)}
                  {notes.map((n) => (
                    <span key={n} className="quality__note">
                      {n}
                    </span>
                  ))}
                </th>
                <td className="numeric">{Q.mean(s.mean)}</td>
                <td className="numeric">{Q.mean(s.spread)}</td>
                <td className="numeric">{Q.share(s.scaleUsed)}</td>
                <td className="numeric">{Q.share(s.tiedShare)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function OneWay({ quality }: { quality: QualityResult }) {
  const id = useId();
  return (
    <section className="quality__section" aria-labelledby={id}>
      <h3 id={id} className="coverage__subheading">
        {Q.tiesHeading}
      </h3>
      {quality.tieLayers === 0 ? (
        <p className="coverage__explain">{Q.noTieLayers}</p>
      ) : (
        <>
          <p className="coverage__explain">{Q.tiesIntro}</p>
          <p className="coverage__explain num">
            {Q.tiesOverall(quality.oneWay, quality.reportedTies, Q.share(quality.oneWayShare))}
          </p>
        </>
      )}
    </section>
  );
}

// People outside the roster (build plan session 12): counts of the boundary
// question's answers, overall and by the rules' grouping attribute. Counts only.
function Boundary() {
  const project = useAppStore((s) => s.data.project);
  const result = useMemo(() => (project ? computeBoundary(project) : null), [project]);
  const id = useId();
  if (!result) return null;
  return (
    <section className="quality__section" aria-labelledby={id}>
      <h3 id={id} className="coverage__subheading">
        {Q.boundaryHeading}
      </h3>
      {result.answered === 0 ? (
        <p className="coverage__explain">{Q.boundaryNone}</p>
      ) : (
        <>
          <p className="coverage__explain num">
            {Q.boundaryIntro(result.title, result.answered, result.responded)}
          </p>
          {result.functions.map((f, fi) => (
            <BoundaryTable key={f} result={result} name={f} index={fi} />
          ))}
        </>
      )}
      {result.notAsked > 0 && (
        <p className="coverage__explain num">{Q.boundaryNotAsked(result.notAsked)}</p>
      )}
    </section>
  );
}

function BoundaryTable({
  result,
  name,
  index,
}: {
  result: BoundaryResult;
  name: string;
  index: number;
}) {
  const row = (label: string, counts: number[][], respondents: number, key: string) => (
    <tr key={key}>
      <th scope="row">{label}</th>
      <td className="numeric">{respondents}</td>
      {BOUNDARY_BAND_ORDER.map((b, bi) => (
        <td key={b} className="numeric">
          {counts[index]?.[bi] ?? 0}
        </td>
      ))}
    </tr>
  );
  const groups: BoundaryRow[] = result.groups?.rows ?? [];
  return (
    <div
      className="boundary__table"
      role="region"
      aria-label={Q.boundaryRegion(name)}
      // Scrolls sideways in the narrow column, so it must take focus.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <table className="coverage__table quality__table">
        <caption className="coverage__caption">{Q.boundaryCaption(name)}</caption>
        <thead>
          <tr>
            <th scope="col">{result.groups ? result.groups.label : Q.boundaryAll}</th>
            <th scope="col" className="numeric">
              {Q.boundaryRespondents}
            </th>
            {BOUNDARY_BAND_ORDER.map((b) => (
              <th key={b} scope="col" className="numeric">
                <span aria-hidden="true">{Q.boundaryBands[b].short}</span>
                <span className="visually-hidden">{Q.boundaryBands[b].full}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row(Q.boundaryAll, result.overall, result.answered, '\u0000all')}
          {groups.map((g) =>
            row(g.value ?? Q.notRecorded, g.counts, g.respondents, g.value ?? '\u0000none'),
          )}
        </tbody>
      </table>
    </div>
  );
}
