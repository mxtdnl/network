import { forwardRef, useId } from 'react';
import { mapCopy } from '../copy/map';
import {
  condensedSections,
  legendSections,
  type LegendExtras,
  type LegendSection,
} from '../map/legend';
import type { MapModel } from '../map/model';
import { hollowRadius } from '../map/scene';
import type { MapTheme } from '../map/theme';

const VAL_CLASS: Record<number, string> = {
  [-3]: 'n3',
  [-2]: 'n2',
  [-1]: 'n1',
  0: '0',
  1: 'p1',
  2: 'p2',
  3: 'p3',
};

function Sample({
  section,
  theme,
  condensed,
}: {
  section: LegendSection;
  theme: MapTheme;
  condensed: boolean;
}) {
  const box = theme.nodeMax * 2 + theme.line * 2;
  const hollowSample = (theme.nodeMin + theme.nodeMax) / 2;
  // Line samples are one text line tall; condensed, they are a swatch wide.
  const lineH = theme.labelSize + theme.labelGap;
  const lineW = condensed ? theme.swatch : box * 1.5;
  switch (section.kind) {
    case 'size':
      return (
        <ul className="legend__samples">
          {section.samples.map((s) => (
            <li key={s.label} className="legend__sample">
              <svg
                className="legend__svg"
                width={s.radius * 2 + theme.line * 2}
                height={box}
                aria-hidden="true"
              >
                <circle
                  className="legend__node"
                  cx={s.radius + theme.line}
                  cy={box / 2}
                  r={s.radius}
                />
              </svg>
              <span className="num">{s.label}</span>
            </li>
          ))}
          {section.notDefined && (
            <li className="legend__sample">
              <svg className="legend__svg" width={box} height={box} aria-hidden="true">
                <circle
                  className="legend__node"
                  cx={box / 2}
                  cy={box / 2}
                  r={section.notDefined.radius}
                />
              </svg>
              <span>{section.notDefined.label}</span>
            </li>
          )}
        </ul>
      );
    case 'fill':
      return (
        <ul className="legend__samples legend__samples--list">
          {section.items.map((item) => (
            <li key={item.label} className="legend__sample">
              <span
                className={`legend__dot ${item.hue >= 0 ? `legend__dot--cat-${String(item.hue + 1)}` : 'legend__dot--other'}`}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      );
    case 'width':
      return (
        <ul className="legend__samples">
          {[...section.samples, ...(section.notRated ? [section.notRated] : [])].map((s) => (
            <li key={s.label} className="legend__sample">
              <svg className="legend__svg" width={theme.swatch} height={lineH} aria-hidden="true">
                <line
                  className="legend__edge"
                  x1={0}
                  y1={lineH / 2}
                  x2={theme.swatch}
                  y2={lineH / 2}
                  strokeWidth={s.width}
                />
              </svg>
              <span className="num">{s.label}</span>
            </li>
          ))}
        </ul>
      );
    case 'colour': {
      const ramp = section.ramp;
      if (!ramp && section.items.length === 0) return null;
      return (
        <ul className="legend__samples">
          {ramp && (
            <li className="legend__sample legend__sample--ramp">
              <span className="legend__ramp" aria-hidden="true">
                {ramp.swatches.map((sw) => (
                  <span
                    key={`${sw.scale}${String(sw.step)}`}
                    className={`legend__step legend__step--${sw.scale === 'valence' ? (VAL_CLASS[sw.step] ?? '0') : `ramp-${String(sw.step)}`}`}
                  />
                ))}
              </span>
              <span className="legend__ramp-labels num" aria-hidden="true">
                <span>{ramp.labels[0]}</span>
                <span>{ramp.labels[1] ?? ''}</span>
                <span>{ramp.labels[2]}</span>
              </span>
            </li>
          )}
          {section.items.map((item) => (
            <li key={item.label} className="legend__sample">
              <svg className="legend__svg" width={box} height={lineH} aria-hidden="true">
                <line
                  className={`legend__edge legend__edge--${item.colour}`}
                  x1={0}
                  y1={lineH / 2}
                  x2={box}
                  y2={lineH / 2}
                  strokeWidth={theme.edgeMax / 2}
                />
              </svg>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      );
    }
    case 'style':
      return (
        <ul className="legend__samples legend__samples--list">
          {section.items.map((item) => {
            const w = theme.edgeMax / 2;
            const y = lineH / 2;
            const dash =
              item.style === 'informal'
                ? `${String(theme.dash)} ${String(theme.gap)}`
                : item.style === 'neither'
                  ? `${String(theme.dot)} ${String(theme.gap)}`
                  : undefined;
            const o = (w + theme.gap / 2) / 2;
            return (
              <li key={item.style} className="legend__sample">
                <svg
                  className="legend__svg legend__svg--wide"
                  width={lineW}
                  height={lineH}
                  aria-hidden="true"
                >
                  {item.style === 'both' ? (
                    <>
                      <line
                        className="legend__edge"
                        x1={0}
                        y1={y - o}
                        x2={lineW}
                        y2={y - o}
                        strokeWidth={w}
                      />
                      <line
                        className="legend__edge"
                        x1={0}
                        y1={y + o}
                        x2={lineW}
                        y2={y + o}
                        strokeWidth={w}
                        strokeDasharray={`${String(theme.dash)} ${String(theme.gap)}`}
                      />
                    </>
                  ) : (
                    <line
                      className="legend__edge"
                      x1={0}
                      y1={y}
                      x2={lineW}
                      y2={y}
                      strokeWidth={w}
                      strokeDasharray={dash}
                    />
                  )}
                </svg>
                <span>{item.label}</span>
              </li>
            );
          })}
        </ul>
      );
    case 'position':
      if (!section.reportingLines) return null;
      return (
        <ul className="legend__samples">
          <li className="legend__sample">
            <svg className="legend__svg" width={lineW} height={box} aria-hidden="true">
              <polyline
                className="legend__reporting"
                points={`${String(theme.line)},${String(theme.line)} ${String(theme.line)},${String(box / 2)} ${String(lineW)},${String(box / 2)}`}
                strokeWidth={theme.line}
              />
            </svg>
            <span>{section.reportingLines}</span>
          </li>
        </ul>
      );
    case 'marks':
      return (
        <ul className="legend__samples legend__samples--list">
          {section.items.map((item) => (
            <li key={item.mark} className="legend__sample">
              <svg className="legend__svg" width={box} height={box} aria-hidden="true">
                {item.mark === 'highlight' ? (
                  <>
                    <circle
                      className="legend__node"
                      cx={box / 2 - theme.nodeMin - theme.line}
                      cy={box / 2}
                      r={theme.nodeMin}
                    />
                    <circle
                      className="legend__node legend__node--faded"
                      cx={box / 2 + theme.nodeMin + theme.line}
                      cy={box / 2}
                      r={theme.nodeMin}
                    />
                  </>
                ) : item.mark === 'hollow' ? (
                  <>
                    <circle
                      className="legend__node legend__node--ring"
                      cx={box / 2}
                      cy={box / 2}
                      r={hollowSample}
                    />
                    <circle
                      className="legend__node legend__node--hole"
                      cx={box / 2}
                      cy={box / 2}
                      r={hollowRadius(hollowSample, theme.line)}
                    />
                  </>
                ) : item.mark === 'outline' ? (
                  <>
                    <circle className="legend__node" cx={box / 2} cy={box / 2} r={theme.nodeMin} />
                    <circle
                      className="legend__outline"
                      cx={box / 2}
                      cy={box / 2}
                      r={Math.min(theme.nodeMin + theme.line + theme.labelGap * 2, box / 2)}
                      strokeWidth={theme.line}
                    />
                  </>
                ) : item.mark === 'path' ? (
                  <line
                    className="legend__path"
                    x1={0}
                    y1={box / 2}
                    x2={box}
                    y2={box / 2}
                    strokeWidth={theme.focusWidth}
                  />
                ) : (
                  <>
                    <circle className="legend__node" cx={box / 2} cy={box / 2} r={theme.nodeMin} />
                    <circle
                      className="legend__ring"
                      cx={box / 2}
                      cy={box / 2}
                      r={theme.nodeMin + theme.line + theme.focusWidth}
                      strokeWidth={theme.line}
                    />
                  </>
                )}
              </svg>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      );
    case 'arrows': {
      const w = lineW;
      const y = lineH / 2;
      const head = theme.arrow + theme.edgeMax / 2;
      return (
        <ul className="legend__samples legend__samples--list">
          {section.items.map((item) => (
            <li key={String(item.arrow)} className="legend__sample">
              <svg
                className="legend__svg legend__svg--wide"
                width={w}
                height={lineH}
                aria-hidden="true"
              >
                <line
                  className="legend__edge"
                  x1={0}
                  y1={y}
                  x2={item.arrow ? w - head : w}
                  y2={y}
                  strokeWidth={theme.edgeMax / 2}
                />
                {item.arrow && (
                  <polygon
                    className="legend__arrow"
                    points={`${String(w)},${String(y)} ${String(w - head)},${String(y - head / 2)} ${String(w - head)},${String(y + head / 2)}`}
                  />
                )}
              </svg>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      );
    }
  }
}

// Persistent legend, overlaid at the lower left of the map (design-system
// §5.1): one entry per encoding in use, rebuilt from the same model as the map.
// Three forms (D125): full; condensed, one line per encoding; and beside the
// map, in a column of its own. It is never removed (spec §8).
export const MapLegend = forwardRef<
  HTMLElement,
  {
    model: MapModel;
    theme: MapTheme;
    extras?: LegendExtras | null;
    variant?: 'full' | 'condensed' | 'beside';
  }
>(function MapLegend({ model, theme, extras = null, variant = 'full' }, ref) {
  const headingId = useId();
  const full = legendSections(model, theme, extras);
  const sections = variant === 'condensed' ? condensedSections(full) : full;
  return (
    <section
      ref={ref}
      className={variant === 'full' ? 'legend' : `legend legend--${variant}`}
      aria-labelledby={headingId}
      // The legend scrolls when the map is short, so it can take focus and be scrolled by keyboard.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <h2 id={headingId} className="visually-hidden">
        {mapCopy.legend.heading}
      </h2>
      {sections.map((section) => (
        <div key={section.kind} className="legend__section">
          <p className="legend__heading">
            <span className="legend__title">{section.title}</span>{' '}
            <span className="legend__variable">{section.variable}</span>
          </p>
          <Sample section={section} theme={theme} condensed={variant === 'condensed'} />
          {section.kind === 'width' &&
            section.notes.map((note) => (
              <p key={note} className="legend__note num">
                {note}
              </p>
            ))}
        </div>
      ))}
    </section>
  );
});
