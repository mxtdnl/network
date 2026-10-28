import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Switch } from '../components/Switch';
import { coveragePercent, percent } from '../copy/data';
import { mapCopy } from '../copy/map';
import { presentationCopy as P } from '../copy/savedViews';
import { shellCopy } from '../copy/shell';
import { durationToken } from '../durations';
import { readMapTheme, type MapTheme } from '../map/theme';
import { useMapData } from '../map/useMapModel';
import { setNamesHidden } from '../state/names';
import { OPENING, goTo, refreshStep, step, stopPresentation } from '../state/presentation';
import { audiencePolicy } from '../state/audience';
import { audienceChoice } from '../state/audienceSettings';
import { buildCard } from '../state/card';
import { audienceCopy } from '../copy/audience';
import { AudienceSelect } from './AudienceSelect';
import { GroupStep, WorkshopNotes } from './AudienceSteps';
import { PersonalCard } from './PersonalCard';
import { useAppStore } from '../state/store';
import { qualityCopy } from '../copy/quality';
import { QualityStatement, useQuality } from './DataCheckPanel';
import { MapLegend } from './MapLegend';
import { MapCanvas, legendExtras } from './MapView';

const NEXT = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ']);
const PREVIOUS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);

// Presentation mode (spec §8; docs/design-system.md §5.3): full screen, the
// saved view's name as the title, the map with its legend in a column beside
// it, the caption beneath and "3 of 7" at the bottom right. Controls are
// hidden; moving the pointer or tabbing shows a small bar (previous, next,
// hide names, leave) until the pointer rests for --presentation-idle, when the
// bar and the cursor hide again. Names, captions and legends pass through the
// names layer, so anonymisation applies here as everywhere.
export function PresentationView() {
  const project = useAppStore((s) => s.data.project);
  const index = useAppStore((s) => s.ui.presentation?.index ?? 0);
  const anonymise = useAppStore((s) => s.ui.anonymise);
  const running = useAppStore((s) => s.results.status === 'running');
  const data = useMapData();
  const quality = useQuality();
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<MapTheme | null>(null);
  const [active, setActive] = useState(false);
  const timer = useRef(0);
  const instructionsId = useId();
  const titleId = useId();

  const views = project?.saved_views ?? [];
  // Who the presentation is for (build plan session 9): the policy decides what each step shows.
  const chosen = useAppStore((s) => s.ui.audience);
  const choice = project ? audienceChoice(project, chosen) : null;
  const policy = useMemo(
    () => (project && choice ? audiencePolicy(project, choice, anonymise) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, choice?.level, choice?.team, choice?.member, anonymise],
  );
  const level = policy?.level ?? 'analyst';
  // A change of level, team or member shows the current view again under the new policy.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    refreshStep();
  }, [level, choice?.team]);
  // The opening step (OPENING) shows the first view behind its statement.
  const view = views[Math.max(index, 0)];

  // The canvas reads its label sizes from the presentation's tokens.
  useLayoutEffect(() => {
    if (rootRef.current) setTheme(readMapTheme(rootRef.current));
  }, []);

  useLayoutEffect(() => {
    rootRef.current?.focus();
  }, []);

  const wake = useCallback(() => {
    setActive(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setActive(false);
    }, durationToken('--presentation-idle'));
  }, []);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  // Keys work wherever focus is. Escape usually leaves full screen before the
  // page sees it, so leaving full screen also ends the presentation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      const onControl = target?.closest('button, input, textarea, select, dialog') !== null;
      if (e.key === 'Escape') {
        if (target?.closest('dialog')) return;
        e.preventDefault();
        stopPresentation();
      } else if (target?.closest('.presentation__card')) {
        // A one-to-one's card has no steps: the keys scroll it.
        return;
      } else if (NEXT.has(e.key) && !(e.key === ' ' && onControl)) {
        e.preventDefault();
        step(1);
      } else if (PREVIOUS.has(e.key)) {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(OPENING);
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo(Number.MAX_SAFE_INTEGER);
      }
    };
    let wasFullscreen = document.fullscreenElement !== null;
    const onFullscreen = () => {
      const now = document.fullscreenElement !== null;
      if (wasFullscreen && !now) stopPresentation();
      wasFullscreen = now;
    };
    // A click on the map steps forward, as the right arrow does.
    const onClick = (e: MouseEvent) => {
      if (mapRef.current?.contains(e.target as Node)) step(1);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', wake);
    window.addEventListener('focusin', wake);
    window.addEventListener('click', onClick);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('focusin', wake);
      window.removeEventListener('click', onClick);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [wake]);

  const oneToOne = level === 'oneToOne';
  if (!project || !policy || (!view && !oneToOne)) {
    return (
      <div ref={rootRef} className="presentation" tabIndex={-1}>
        <p className="presentation__caption">{P.noViews}</p>
      </div>
    );
  }

  const coverage = data?.result.coverage;
  // A one-to-one shows the member's card alone, without the opening statement or the views.
  const opening = index === OPENING && !oneToOne;
  const card = oneToOne && data ? buildCard(project, data.result, data.settings, policy) : null;
  const text = policy.names.text;
  const title = oneToOne
    ? (card?.title ?? audienceCopy.card.title)
    : opening
      ? qualityCopy.presentationHeading
      : text(view?.name ?? '');
  const controls = (
    <div className="presentation__controls" role="group" aria-label={P.controls}>
      <AudienceSelect variant="presentation" />
      <button
        type="button"
        className="button button--text"
        disabled={opening || oneToOne}
        onClick={() => {
          step(-1);
        }}
      >
        {P.previous}
      </button>
      <button
        type="button"
        className="button button--text"
        disabled={oneToOne || index === views.length - 1}
        onClick={() => {
          step(1);
        }}
      >
        {P.next}
      </button>
      <Switch label={shellCopy.hideNames} checked={anonymise} onChange={setNamesHidden} />
      <button type="button" className="button button--text" onClick={stopPresentation}>
        {P.exit}
      </button>
    </div>
  );

  return (
    // The region takes focus on entry so screen readers announce it; keys are
    // handled on the window (above).
    <div
      ref={rootRef}
      className={[
        'presentation',
        opening ? 'presentation--opening' : '',
        active ? '' : 'presentation--idle',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-labelledby={titleId}
      aria-describedby={instructionsId}
      tabIndex={-1}
    >
      <p id={instructionsId} className="visually-hidden">
        {P.instructions}
      </p>
      <h1 id={titleId} className="presentation__title">
        {title}
      </h1>
      {oneToOne && (
        <div
          className="presentation__card"
          role="region"
          aria-label={audienceCopy.card.title}
          // The card scrolls, so it takes focus and the arrow keys scroll it.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
        >
          {card ? <PersonalCard card={card} /> : <p role="status">{mapCopy.calculating}</p>}
        </div>
      )}
      {/* The opening step: the data-quality statement before the first view (session 4). */}
      {opening && quality && (
        <QualityStatement quality={quality} className="presentation__statement" />
      )}
      {opening && (
        <p className="presentation__counter num" aria-live="polite">
          {P.opening(views.length)}
        </p>
      )}
      {!opening && !oneToOne && view && policy.groupsOnly && (
        <>
          {data ? (
            <GroupStep data={data} policy={policy} />
          ) : (
            <p className="map__message" role="status">
              {mapCopy.calculating}
            </p>
          )}
          <p className="presentation__caption">{text(view.caption)}</p>
          <p className="presentation__counter num" aria-live="polite">
            {P.counter(index + 1, views.length)}
          </p>
        </>
      )}
      {!opening && !oneToOne && view && !policy.groupsOnly && (
        <>
          <div className="presentation__body">
            <div ref={mapRef} className="presentation__map">
              {data && theme ? (
                <MapCanvas data={data} presentation={{ theme }} />
              ) : (
                <p className="map__message" role="status">
                  {mapCopy.calculating}
                </p>
              )}
              {running && data && (
                <p className="presentation__status" role="status">
                  {mapCopy.calculating}
                </p>
              )}
            </div>
            <aside
              className="presentation__legend"
              aria-label={mapCopy.legend.heading}
              // With a workshop's notes the column can scroll, so it can take focus (as D114).
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              tabIndex={0}
            >
              {data && theme && (
                <MapLegend
                  model={data.mapModel}
                  theme={theme}
                  extras={legendExtras(data, 0, false)}
                />
              )}
              {level === 'workshop' && data && <WorkshopNotes data={data} policy={policy} />}
              {coverage?.belowThreshold && (
                <p className="presentation__coverage" role="note">
                  <Icon name="warning" />
                  {mapCopy.coverage(
                    coveragePercent(coverage.rate, coverage.threshold),
                    percent(coverage.threshold),
                  )}
                </p>
              )}
            </aside>
          </div>
          <p className="presentation__caption">{text(view.caption)}</p>
          <p className="presentation__counter num" aria-live="polite">
            {P.counter(index + 1, views.length)}
          </p>
        </>
      )}
      {controls}
    </div>
  );
}
