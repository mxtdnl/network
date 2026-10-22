import { useId, useState } from 'react';
import { Icon } from '../components/Icon';
import { Switch } from '../components/Switch';
import { formatWeight, mapCopy } from '../copy/map';
import { DIRECTED_METRICS, SYMMETRISED_METRICS, metricCopy } from '../copy/metrics';
import { focusMapMember } from '../map/focus';
import {
  NOT_RECORDED,
  attributeValues,
  groupAttributes,
  roleLayer,
  signedColourLayers,
  toggleLayers,
  isToggledOn,
} from '../map/model';
import {
  DIVERGING_PALETTES,
  paletteChoice,
  pinnedHues,
  withPalette,
  withPin,
  type DivergingPalette,
} from '../map/palettes';
import { drawableLayers, hierarchyAvailable, useMapData, type MapData } from '../map/useMapModel';
import { useLayout, useReadOnly } from '../state/layoutMode';
import {
  useAppStore,
  type EdgeColourChoice,
  type EdgeWidthChoice,
  type LayoutKind,
  type LegendMode,
  type MapSettings,
  type SizeMetric,
} from '../state/store';

/** The edge colour choice as a select value, and back. */
function colourValue(c: EdgeColourChoice): string {
  return c.kind === 'signed' || c.kind === 'unsigned' ? `${c.kind}:${c.layer}` : c.kind;
}
function colourChoice(value: string): EdgeColourChoice {
  const [kind, ...rest] = value.split(':');
  const layer = rest.join(':');
  if (kind === 'signed' || kind === 'unsigned') return { kind, layer };
  return kind === 'groups' ? { kind: 'groups' } : { kind: 'none' };
}
function widthValue(w: EdgeWidthChoice): string {
  return w.kind === 'layer' ? `layer:${w.layer}` : w.kind;
}
function widthChoice(value: string): EdgeWidthChoice {
  if (value.startsWith('layer:')) return { kind: 'layer', layer: value.slice('layer:'.length) };
  return value === 'uniform' ? { kind: 'uniform' } : { kind: 'tiesFrom' };
}

const LAYOUTS: readonly LayoutKind[] = ['force', 'grouped', 'circular', 'hierarchy'];
const LY = mapCopy.layouts;

const C = mapCopy.controls;
const MAX_MATCHES = 8;

// Map controls (left column, design-system §5.1 "Show" group): the layer the
// map draws, layer toggles, direction and symmetrisation, the tie-strength
// range, node encodings, attribute filters and search.
export function MapControls() {
  const data = useMapData();
  const setMap = useAppStore((s) => s.setMap);
  const selectMember = useAppStore((s) => s.selectMember);
  const setRightPanel = useAppStore((s) => s.setRightPanel);
  const raw = useAppStore((s) => s.map);
  const legendChoice = useAppStore((s) => s.ui.legend);
  const setLegend = useAppStore((s) => s.setLegend);
  const compact = useLayout() === 'compact';
  // Palettes and pins change the project, so the phone's read-only layout leaves them out (D112).
  const readOnly = useReadOnly();
  const ids = {
    layer: useId(),
    layerHelp: useId(),
    show: useId(),
    combine: useId(),
    threshold: useId(),
    thresholdTo: useId(),
    size: useId(),
    fill: useId(),
    filter: useId(),
    filterAttr: useId(),
    filterValue: useId(),
    search: useId(),
    searchHelp: useId(),
    layout: useId(),
    layoutHelp: useId(),
    groupBy: useId(),
    legend: useId(),
    legendHelp: useId(),
    colour: useId(),
    colourHelp: useId(),
    width: useId(),
    widthHelp: useId(),
    style: useId(),
    styleHelp: useId(),
    outlinesHelp: useId(),
  };
  const [filterAttr, setFilterAttr] = useState<string>('');
  const [filterValue, setFilterValue] = useState<string>('');

  if (!data) return <p className="placeholder">{mapCopy.calculating}</p>;
  const { project, result, settings, model } = data;
  const layers = drawableLayers(project, result);
  const layerLabel = (key: string) =>
    key === 'composite' ? C.composite : (project.layers.find((l) => l.key === key)?.label ?? key);
  const toggles = toggleLayers(project);
  const signedLayers = signedColourLayers(project);
  const styleAvailable =
    roleLayer(project, 'formal') !== undefined && roleLayer(project, 'informal') !== undefined;
  // The colour the map draws: a choice whose layer is not enabled draws none (model.colour).
  const colourShown: EdgeColourChoice =
    model.colour.kind === 'none'
      ? settings.edgeColour.kind === 'none'
        ? settings.edgeColour
        : { kind: 'none' }
      : settings.edgeColour;
  const widthShown: EdgeWidthChoice =
    model.width.kind === 'tiesFrom' ? { kind: 'tiesFrom' } : settings.edgeWidth;
  const colourHelp =
    colourShown.kind === 'signed'
      ? settings.signedScale === 'full'
        ? C.colourHelp.signedFull
        : C.colourHelp.signed
      : C.colourHelp[colourShown.kind];
  const columns = result.refs[settings.layer]?.node.columns ?? {};
  const metrics = (settings.view === 'directed' ? DIRECTED_METRICS : SYMMETRISED_METRICS).filter(
    (m) => m in columns,
  );
  const attrs = groupAttributes(project);
  const attrLabel = (key: string) => attrs.find((a) => a.key === key)?.label ?? key;
  const valueLabel = (v: string) => (v === NOT_RECORDED ? C.notRecorded : v);
  const activeAttr = filterAttr || attrs[0]?.key || '';
  const valueOptions = activeAttr
    ? [
        ...attributeValues(project, activeAttr),
        ...(project.members.some((m) => (m.attributes[activeAttr] ?? null) === null)
          ? [NOT_RECORDED]
          : []),
      ]
    : [];
  const activeValue = valueOptions.includes(filterValue) ? filterValue : (valueOptions[0] ?? '');
  const chips = settings.filters.flatMap((f) => f.values.map((v) => ({ key: f.key, value: v })));

  const addFilter = () => {
    if (!activeAttr || !activeValue) return;
    const existing = raw.filters.find((f) => f.key === activeAttr);
    const filters: MapSettings['filters'] = existing
      ? raw.filters.map((f) =>
          f.key === activeAttr && !f.values.includes(activeValue)
            ? { ...f, values: [...f.values, activeValue] }
            : f,
        )
      : [...raw.filters, { key: activeAttr, values: [activeValue] }];
    setMap({ filters });
  };
  const removeFilter = (key: string, value: string) => {
    setMap({
      filters: raw.filters
        .map((f) => (f.key === key ? { ...f, values: f.values.filter((v) => v !== value) } : f))
        .filter((f) => f.values.length > 0),
    });
  };

  const matches = model.searchMatches ? [...model.searchMatches] : [];
  const fillValue = settings.fill.kind === 'community' ? '__community' : settings.fill.key;

  return (
    <div className="map-controls">
      <div className="field">
        <label htmlFor={ids.layer} className="field__label">
          {C.layer}
        </label>
        <select
          id={ids.layer}
          className="select"
          value={settings.layer}
          aria-describedby={ids.layerHelp}
          onChange={(e) => {
            setMap({ layer: e.currentTarget.value });
          }}
        >
          {layers.map((key) => (
            <option key={key} value={key}>
              {layerLabel(key)}
            </option>
          ))}
        </select>
        <p id={ids.layerHelp} className="field__help">
          {C.layerHelp}
        </p>
      </div>

      <fieldset className="map-controls__group" aria-describedby={ids.layoutHelp}>
        <legend className="field__label">{LY.label}</legend>
        <div className="radio-list">
          {LAYOUTS.map((kind) => {
            const disabled = kind === 'hierarchy' && !hierarchyAvailable(project);
            return (
              <label key={kind} className="radio-list__option">
                <input
                  type="radio"
                  name={`${ids.layout}-kind`}
                  checked={settings.layout === kind}
                  disabled={disabled}
                  aria-describedby={disabled ? `${ids.layout}-unavailable` : undefined}
                  onChange={() => {
                    setMap({ layout: kind });
                  }}
                />
                <span>{LY[kind]}</span>
              </label>
            );
          })}
        </div>
        <p id={ids.layoutHelp} className="field__help">
          {LY[`${settings.layout}Help`]}
        </p>
        {!hierarchyAvailable(project) && (
          <p id={`${ids.layout}-unavailable`} className="field__help">
            {LY.hierarchyUnavailable}
          </p>
        )}
        {(settings.layout === 'grouped' || settings.layout === 'circular') && (
          <div className="field">
            <label htmlFor={ids.groupBy} className="field__label">
              {LY.groupBy}
            </label>
            <select
              id={ids.groupBy}
              className="select"
              value={settings.groupBy ?? ''}
              onChange={(e) => {
                setMap({ groupBy: e.currentTarget.value });
              }}
            >
              {groupAttributes(project).map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </fieldset>

      {toggles.length > 0 && (
        <fieldset className="map-controls__group">
          <legend className="field__label">{C.show}</legend>
          <fieldset className="map-controls__subgroup">
            <legend className="field__help">{C.whenOff}</legend>
            <div className="segmented">
              {([false, true] as const).map((hide) => (
                <label key={String(hide)} className="segmented__option">
                  <input
                    type="radio"
                    className="segmented__input"
                    name={`${ids.show}-off`}
                    checked={settings.hideOffLayers === hide}
                    onChange={() => {
                      setMap({ hideOffLayers: hide });
                    }}
                  />
                  <span className="segmented__label">{hide ? C.hideTies : C.keepTies}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {settings.hideOffLayers ? (
            <ul className="layer-list">
              {toggles.map((layer) => (
                <li key={layer.key} className="layer-list__item">
                  <Switch
                    label={layer.label}
                    hiddenSuffix={C.onMap}
                    checked={isToggledOn(settings, layer)}
                    onChange={(on) => {
                      setMap({ layerToggles: { ...raw.layerToggles, [layer.key]: on } });
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="field__help">{C.keepHelp}</p>
          )}
        </fieldset>
      )}

      {/* Edge encodings (D126): each channel shows one variable, chosen here. */}
      <fieldset className="map-controls__group">
        <legend className="field__label">{C.edges}</legend>
        <div className="field">
          <label htmlFor={ids.colour} className="field__label">
            {C.colour}
          </label>
          <select
            id={ids.colour}
            className="select"
            value={colourValue(colourShown)}
            aria-describedby={ids.colourHelp}
            onChange={(e) => {
              setMap({ edgeColour: colourChoice(e.currentTarget.value) });
            }}
          >
            {signedLayers.length > 0 && (
              <optgroup label={C.colourSigned}>
                {signedLayers.map((l) => (
                  <option key={l.key} value={`signed:${l.key}`}>
                    {l.label}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={C.colourUnsigned}>
              {layers.map((key) => (
                <option key={key} value={`unsigned:${key}`}>
                  {layerLabel(key)}
                </option>
              ))}
            </optgroup>
            <option value="groups">{C.colourGroups}</option>
            <option value="none">{C.colourNone}</option>
          </select>
          <p id={ids.colourHelp} className="field__help">
            {colourHelp}
          </p>
          {colourShown.kind === 'signed' && (
            <Switch
              label={C.fullScale}
              checked={settings.signedScale === 'full'}
              onChange={(on) => {
                setMap({ signedScale: on ? 'full' : 'negative' });
              }}
            />
          )}
        </div>
        <div className="field">
          <label htmlFor={ids.width} className="field__label">
            {C.width}
          </label>
          <select
            id={ids.width}
            className="select"
            value={widthValue(widthShown)}
            aria-describedby={widthShown.kind === 'layer' ? ids.widthHelp : undefined}
            onChange={(e) => {
              setMap({ edgeWidth: widthChoice(e.currentTarget.value) });
            }}
          >
            <option value="tiesFrom">{C.widthTiesFrom(layerLabel(settings.layer))}</option>
            {layers
              .filter((key) => key !== settings.layer)
              .map((key) => (
                <option key={key} value={`layer:${key}`}>
                  {layerLabel(key)}
                </option>
              ))}
            <option value="uniform">{C.widthUniform}</option>
          </select>
          {widthShown.kind === 'layer' && (
            <p id={ids.widthHelp} className="field__help">
              {C.widthHelp}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor={ids.style} className="field__label">
            {C.style}
          </label>
          <select
            id={ids.style}
            className="select"
            value={styleAvailable ? settings.edgeStyle : 'none'}
            disabled={!styleAvailable}
            aria-describedby={styleAvailable ? undefined : ids.styleHelp}
            onChange={(e) => {
              setMap({ edgeStyle: e.currentTarget.value as MapSettings['edgeStyle'] });
            }}
          >
            <option value="none">{C.styleNone}</option>
            <option value="formalInformal">{C.styleFormalInformal}</option>
          </select>
          {!styleAvailable && (
            <p id={ids.styleHelp} className="field__help">
              {C.styleUnavailable}
            </p>
          )}
        </div>
      </fieldset>

      <fieldset className="map-controls__group">
        <legend className="field__label">{C.direction}</legend>
        <div className="segmented">
          {(['directed', 'symmetrised'] as const).map((view) => (
            <label key={view} className="segmented__option">
              <input
                type="radio"
                className="segmented__input"
                name={`${ids.show}-view`}
                checked={settings.view === view}
                onChange={() => {
                  setMap({ view });
                }}
              />
              <span className="segmented__label">
                {view === 'directed' ? C.directed : C.symmetrised}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {settings.view === 'symmetrised' && (
        <div className="field">
          <label htmlFor={ids.combine} className="field__label">
            {C.combine}
          </label>
          <select
            id={ids.combine}
            className="select"
            value={settings.symmetrise}
            onChange={(e) => {
              setMap({ symmetrise: e.currentTarget.value as MapSettings['symmetrise'] });
            }}
          >
            <option value="mean">{C.mean}</option>
            <option value="min">{C.min}</option>
            <option value="max">{C.max}</option>
            <option value="both">{C.both}</option>
          </select>
          {settings.symmetrise === 'both' && <p className="field__help">{C.bothHelp}</p>}
        </div>
      )}

      {/* The tie-strength range (D141): two ordered sliders; moving one past the other moves both. */}
      <div className="field">
        <div className="field__row">
          <label htmlFor={ids.threshold} className="field__label">
            {C.threshold}
          </label>
          <output htmlFor={ids.threshold} className="field__value">
            {formatWeight(settings.threshold)}
          </output>
        </div>
        <input
          id={ids.threshold}
          type="range"
          className="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.threshold}
          aria-valuetext={formatWeight(settings.threshold)}
          onChange={(e) => {
            const from = Number(e.currentTarget.value);
            setMap({ threshold: from, thresholdTo: Math.max(from, settings.thresholdTo) });
          }}
        />
        <div className="field__row">
          <label htmlFor={ids.thresholdTo} className="field__label">
            <span className="visually-hidden">{C.tieRange} </span>
            {C.thresholdTo}
          </label>
          <output htmlFor={ids.thresholdTo} className="field__value">
            {formatWeight(settings.thresholdTo)}
          </output>
        </div>
        <input
          id={ids.thresholdTo}
          type="range"
          className="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.thresholdTo}
          aria-valuetext={formatWeight(settings.thresholdTo)}
          onChange={(e) => {
            const to = Number(e.currentTarget.value);
            setMap({ thresholdTo: to, threshold: Math.min(to, settings.threshold) });
          }}
        />
      </div>

      {/* Negative ratings whatever the range (D145), offered when a signed layer is enabled. */}
      {signedLayers.length > 0 && (
        <div className="field">
          <Switch
            label={C.negativeOutside}
            checked={settings.negativeOutsideRange}
            onChange={(on) => {
              setMap({ negativeOutsideRange: on });
            }}
          />
          <p className="field__help">{C.negativeOutsideHelp}</p>
        </div>
      )}

      <div className="field">
        <label htmlFor={ids.size} className="field__label">
          {C.size}
        </label>
        <select
          id={ids.size}
          className="select"
          value={settings.sizeMetric}
          onChange={(e) => {
            setMap({ sizeMetric: e.currentTarget.value as SizeMetric });
          }}
        >
          {metrics.map((m) => (
            <option key={m} value={m}>
              {metricCopy[m].label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="map-controls__group">
        <legend className="field__label">{C.sizeScale}</legend>
        <div className="segmented">
          {(['value', 'rank'] as const).map((scale) => (
            <label key={scale} className="segmented__option">
              <input
                type="radio"
                className="segmented__input"
                name={`${ids.size}-scale`}
                checked={settings.sizeScale === scale}
                onChange={() => {
                  setMap({ sizeScale: scale });
                }}
              />
              <span className="segmented__label">{scale === 'value' ? C.byValue : C.byRank}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={ids.fill} className="field__label">
          {C.fill}
        </label>
        <select
          id={ids.fill}
          className="select"
          value={fillValue}
          onChange={(e) => {
            const v = e.currentTarget.value;
            setMap({
              fill: v === '__community' ? { kind: 'community' } : { kind: 'attribute', key: v },
            });
          }}
        >
          {attrs.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
          <option value="__community">{C.community}</option>
        </select>
      </div>

      {/* Community outlines (D136): communities across the groups the fill shows. */}
      <div className="field">
        {settings.fill.kind === 'attribute' ? (
          <>
            <Switch
              label={C.outlines}
              checked={settings.communityOutlines}
              onChange={(on) => {
                setMap({ communityOutlines: on });
              }}
            />
            <p id={ids.outlinesHelp} className="field__help">
              {C.outlinesHelp(layerLabel(settings.layer))}
            </p>
          </>
        ) : (
          <p className="field__help">{C.outlinesUnavailable}</p>
        )}
      </div>

      {!readOnly && <ColourControls data={data} />}

      {attrs.length > 0 && (
        <fieldset className="map-controls__group">
          <legend className="field__label">{C.filter}</legend>
          {chips.length > 0 && (
            <ul className="chips">
              {chips.map((chip) => {
                const label = C.filterChip(attrLabel(chip.key), valueLabel(chip.value));
                return (
                  <li key={`${chip.key}\u0000${chip.value}`} className="chip">
                    <span>{label}</span>
                    <button
                      type="button"
                      className="chip__remove"
                      aria-label={C.removeFilter(label)}
                      onClick={() => {
                        removeFilter(chip.key, chip.value);
                      }}
                    >
                      <Icon name="close" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="filter-add">
            <label htmlFor={ids.filterAttr} className="visually-hidden">
              {C.filterAttribute}
            </label>
            <select
              id={ids.filterAttr}
              className="select"
              value={activeAttr}
              onChange={(e) => {
                setFilterAttr(e.currentTarget.value);
                setFilterValue('');
              }}
            >
              {attrs.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
            <label htmlFor={ids.filterValue} className="visually-hidden">
              {C.filterValue}
            </label>
            <select
              id={ids.filterValue}
              className="select"
              value={activeValue}
              onChange={(e) => {
                setFilterValue(e.currentTarget.value);
              }}
            >
              {valueOptions.map((v) => (
                <option key={v} value={v}>
                  {valueLabel(v)}
                </option>
              ))}
            </select>
            <button type="button" className="button button--secondary" onClick={addFilter}>
              {C.addFilter}
            </button>
          </div>
        </fieldset>
      )}

      <div className="field">
        <label htmlFor={ids.search} className="field__label">
          {C.search}
        </label>
        <input
          id={ids.search}
          type="search"
          className="text-input"
          value={settings.search}
          aria-describedby={ids.searchHelp}
          autoComplete="off"
          onChange={(e) => {
            setMap({ search: e.currentTarget.value });
          }}
        />
        <p id={ids.searchHelp} className="field__help" aria-live="polite">
          {model.searchMatches ? C.matches(matches.length) : C.searchHelp}
        </p>
        {matches.length > 0 && (
          <ul className="search-results">
            {matches.slice(0, MAX_MATCHES).map((i) => {
              const node = model.nodes[i];
              if (!node) return null;
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    className="button button--text search-results__item"
                    onClick={() => {
                      selectMember(node.id);
                      setRightPanel('member');
                      focusMapMember(node.id);
                    }}
                  >
                    {node.name}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* The legend's form (D125): view state, not saved with the project. */}
      <div className="field">
        <label htmlFor={ids.legend} className="field__label">
          {C.legend}
        </label>
        <select
          id={ids.legend}
          className="select"
          aria-describedby={ids.legendHelp}
          value={legendChoice ?? (compact ? 'condensed' : 'full')}
          onChange={(e) => {
            setLegend(e.currentTarget.value as LegendMode);
          }}
        >
          {(['condensed', 'full', 'beside'] as const).map((m) => (
            <option key={m} value={m}>
              {C.legendModes[m]}
            </option>
          ))}
        </select>
        <p id={ids.legendHelp} className="field__help">
          {C.legendHelp}
        </p>
      </div>
    </div>
  );
}

/**
 * Palettes and pinned group colours (D127): project settings, saved with
 * updateProjectViews, so nothing is recalculated or laid out again. Only one
 * categorical palette passes the checks (docs/design-system.md §2.1), so there
 * is no choice of categorical palette to offer.
 */
function ColourControls({ data }: { data: MapData }) {
  const updateProjectViews = useAppStore((s) => s.updateProjectViews);
  const ids = { help: useId(), diverging: useId(), pinsHelp: useId() };
  const { project, settings, model } = data;
  const choice = paletteChoice(project);
  const hueNames = C.hueNames[choice.categorical];
  const fillKey = settings.fill.kind === 'attribute' ? settings.fill.key : null;
  const fillLabel = groupAttributes(project).find((a) => a.key === fillKey)?.label ?? '';
  const values = fillKey ? attributeValues(project, fillKey) : [];
  const pins = fillKey ? pinnedHues(project, fillKey, hueNames.length) : new Map<string, number>();
  const hueOf = new Map(
    model.fill.groups.filter((g) => g.kind === 'value').map((g) => [g.key, g.hue]),
  );
  return (
    <fieldset className="map-controls__group" aria-describedby={ids.help}>
      <legend className="field__label">{C.colours}</legend>
      <p id={ids.help} className="field__help">
        {C.coloursHelp}
      </p>
      <div className="field">
        <label htmlFor={ids.diverging} className="field__label">
          {C.divergingPalette}
        </label>
        <select
          id={ids.diverging}
          className="select"
          value={choice.diverging}
          onChange={(e) => {
            const diverging = e.currentTarget.value as DivergingPalette;
            updateProjectViews((p) => withPalette(p, { ...paletteChoice(p), diverging }));
          }}
        >
          {DIVERGING_PALETTES.map((id) => (
            <option key={id} value={id}>
              {C.paletteNames[id]}
            </option>
          ))}
        </select>
      </div>
      {fillKey && values.length > 0 && (
        <fieldset className="map-controls__subgroup" aria-describedby={ids.pinsHelp}>
          <legend className="field__label">{C.pins(fillLabel)}</legend>
          <p id={ids.pinsHelp} className="field__help">
            {C.pinsHelp}
          </p>
          <ul className="pin-list">
            {values.map((value) => (
              <PinRow
                key={value}
                value={value}
                pinned={pins.get(value) ?? null}
                shown={hueOf.get(value) ?? -1}
                hueNames={hueNames}
                onChange={(hue) => {
                  updateProjectViews((p) => withPin(p, fillKey, value, hue));
                }}
              />
            ))}
          </ul>
        </fieldset>
      )}
    </fieldset>
  );
}

function PinRow({
  value,
  pinned,
  shown,
  hueNames,
  onChange,
}: {
  value: string;
  pinned: number | null;
  /** The hue the map draws the value in, or -1 for "Other". */
  shown: number;
  hueNames: readonly string[];
  onChange: (hue: number | null) => void;
}) {
  const id = useId();
  return (
    <li className="pin-list__row">
      <span
        className={`legend__dot ${shown >= 0 ? `legend__dot--cat-${String(shown + 1)}` : 'legend__dot--other'}`}
        aria-hidden="true"
      />
      <label htmlFor={id} className="pin-list__label">
        {value}
      </label>
      <select
        id={id}
        className="select pin-list__select"
        value={pinned === null ? '' : String(pinned)}
        onChange={(e) => {
          const v = e.currentTarget.value;
          onChange(v === '' ? null : Number(v));
        }}
      >
        <option value="">
          {C.pinAutomatic}
          {pinned === null ? ` (${shown >= 0 ? (hueNames[shown] ?? '') : C.pinnedOther})` : ''}
        </option>
        {hueNames.map((name, k) => (
          <option key={name} value={String(k)}>
            {name}
          </option>
        ))}
      </select>
    </li>
  );
}
