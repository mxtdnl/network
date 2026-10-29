import { useId } from 'react';
import { percent } from '../copy/data';
import { mapCopy } from '../copy/map';
import { tableCopy } from '../copy/table';
import { refLabel } from '../map/model';
import type { MapData } from '../map/useMapModel';
import { useMemberNames } from '../state/names';
import { useAppStore } from '../state/store';
import { demandLayerKeys, incomingLayer, incomingLayers, incomingRows } from './incoming';

const T = tableCopy.incoming;

/** Bar length in thousandths, set as a custom property and scaled in CSS (as the matrix, D31). */
function bar(el: HTMLElement | null, value: number) {
  el?.style.setProperty('--bar', String(Math.round(value * 1000)));
}

// Ranked bars of incoming ties (build plan session 7): one row per member
// shown, most ties received first, on a chosen layer. The chart is a table, so
// its rows are read in order by screen readers; the bars are hidden from them.
export function RankedBars({ data }: { data: MapData }) {
  const { project, result, settings, model } = data;
  const chosen = useAppStore((s) => s.ui.incomingLayer);
  const setLayer = useAppStore((s) => s.setIncomingLayer);
  const selected = useAppStore((s) => s.selection.member);
  const group = useAppStore((s) => s.selection.group);
  const selectMember = useAppStore((s) => s.selectMember);
  const setRightPanel = useAppStore((s) => s.setRightPanel);
  const names = useMemberNames();
  const layerId = useId();
  const captionId = useId();
  const helpId = useId();

  const layers = incomingLayers(project, result);
  const layer = incomingLayer(layers, chosen, settings.layer, demandLayerKeys(project));
  const rows = layer ? incomingRows(project, result, layer, model) : [];
  const load = layer ? result.refs[layer]?.load : undefined;
  const label = (key: string) =>
    key === 'composite'
      ? mapCopy.controls.composite
      : key.endsWith('+')
        ? T.positive(refLabel(project, key))
        : refLabel(project, key);
  const fillKey = settings.fill.kind === 'attribute' ? settings.fill.key : settings.groupBy;
  const fillAttr = project.attribute_definitions.find((a) => a.key === fillKey);
  const inGroup = new Set(group);

  return (
    <div className="ranked">
      <div className="view-toolbar">
        <div className="field field--inline">
          <label htmlFor={layerId} className="field__label">
            {T.layer}
          </label>
          <select
            id={layerId}
            className="select"
            value={layer ?? ''}
            aria-describedby={helpId}
            onChange={(e) => {
              setLayer(e.currentTarget.value);
            }}
          >
            {layers.map((key) => (
              <option key={key} value={key}>
                {label(key)}
              </option>
            ))}
          </select>
        </div>
        <p id={helpId} className="field__help view-toolbar__help">
          {T.help}
        </p>
      </div>
      {load && load.overall.received > 0 && (
        <p className="ranked__summary">
          {T.summary(
            load.overall.top.length,
            percent(load.overall.share),
            load.overall.received,
            percent(load.overall.top.length / load.overall.members),
          )}
        </p>
      )}
      {!load || load.overall.received === 0 ? (
        <p className="placeholder">{T.none}</p>
      ) : rows.length === 0 ? (
        <p className="placeholder">{tableCopy.noRows}</p>
      ) : (
        <div className="table-view__scroll">
          <table className="data-table ranked__table" aria-labelledby={captionId}>
            <caption id={captionId} className="data-table__caption">
              {T.caption(label(layer ?? ''), rows.length)}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="numeric">
                  {T.rank}
                </th>
                <th scope="col">{T.member}</th>
                {fillAttr && <th scope="col">{fillAttr.label}</th>}
                <th scope="col" className="numeric">
                  {T.ties}
                </th>
                <th scope="col" className="numeric">
                  {T.share}
                </th>
                <th scope="col" className="ranked__bar-cell">
                  <span className="visually-hidden">{T.bar}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, k) => {
                const m = project.members[r.index];
                const name = names.of(r.id);
                // Rows with the same count share the rank of the first of them.
                const rank = rows.findIndex((x) => x.incoming === r.incoming) + 1;
                const lastTop = r.top && !rows[k + 1]?.top;
                return (
                  <tr
                    key={r.id}
                    className={[
                      r.id === selected ? 'is-selected' : inGroup.has(r.id) ? 'is-grouped' : '',
                      lastTop ? 'ranked__last-top' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-member={r.id}
                  >
                    <td className="numeric">{rank}</td>
                    <th scope="row">
                      <button
                        type="button"
                        className="link-button data-table__member"
                        aria-current={r.id === selected ? 'true' : undefined}
                        onClick={() => {
                          selectMember(r.id);
                          setRightPanel('member');
                        }}
                      >
                        {name}
                      </button>
                      {r.top && <span className="data-table__flag">{T.top}</span>}
                    </th>
                    {fillAttr && (
                      <td>{(m && m.attributes[fillAttr.key]) || mapCopy.legend.notRecorded}</td>
                    )}
                    <td className="numeric">{r.incoming}</td>
                    <td className="numeric">{percent(r.share)}</td>
                    <td className="ranked__bar-cell" aria-hidden="true">
                      <span
                        className="ranked__bar"
                        ref={(el) => {
                          bar(el, r.bar);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
