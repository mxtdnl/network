import { useId, useState } from 'react';
import { defaultLayers } from '../../data/defaults';
import { deletionImpact } from '../../data/relations';
import { isCategorical, isMutualLayer, layerRole, type LayerDefinition } from '../../data/schema';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Switch } from '../components/Switch';
import { layerCopy } from '../copy/data';
import { relationCopy, roleCopy } from '../copy/questionBank';
import { remediesCopy } from '../copy/remedies';
import { useAppStore } from '../state/store';
import { RelationActions } from './LayerCreateDialog';

export function scaleDescription(layer: LayerDefinition): string {
  if (layer.scale_type === 'categorical') {
    return layerCopy.categorical(
      (layer.categories ?? []).map((c) => layer.category_labels?.[c] ?? c),
    );
  }
  return layerCopy.scaleText(layer.min, layer.max, layer.signed);
}

// Layer manager (left column): turn layers on and off, edit their label and
// question wording, delete optional layers and add them back, and create
// relations of the analyst's own (build plan session 11). Core layers can be
// turned off but not deleted (spec §4.2).
export function LayerPanel() {
  const project = useAppStore((s) => s.data.project);
  const setLayerEnabled = useAppStore((s) => s.setLayerEnabled);
  const restoreLayer = useAppStore((s) => s.restoreLayer);
  const setStatus = useAppStore((s) => s.setStatus);
  const [editing, setEditing] = useState<string | null>(null);
  const coreId = useId();
  const optionalId = useId();
  const customId = useId();
  const addId = useId();

  if (!project) return <p className="placeholder">{layerCopy.noProject}</p>;

  const core = project.layers.filter((l) => l.core);
  const optional = project.layers.filter((l) => !l.core && l.builtin);
  const custom = project.layers.filter((l) => !l.builtin);
  const present = new Set(project.layers.map((l) => l.key));
  const missing = defaultLayers().filter((l) => !present.has(l.key));
  const editingLayer = project.layers.find((l) => l.key === editing) ?? null;

  const list = (layers: LayerDefinition[]) => (
    <ul className="layer-list">
      {layers.map((layer) => (
        <li key={layer.key} className="layer-list__item">
          <Switch
            label={layer.label}
            checked={layer.enabled}
            onChange={(on) => {
              setLayerEnabled(layer.key, on);
            }}
          />
          <button
            type="button"
            className="button button--text layer-list__edit"
            aria-label={layerCopy.editLabel(layer.label)}
            onClick={() => {
              setEditing(layer.key);
            }}
          >
            {layerCopy.edit}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="layers">
      <p className="layers__intro">{layerCopy.intro}</p>
      <section aria-labelledby={coreId}>
        <h3 id={coreId} className="layers__group">
          {layerCopy.core}
        </h3>
        {list(core)}
      </section>
      <section aria-labelledby={optionalId}>
        <h3 id={optionalId} className="layers__group">
          {layerCopy.optional}
        </h3>
        {list(optional)}
      </section>
      {custom.length > 0 && (
        <section aria-labelledby={customId}>
          <h3 id={customId} className="layers__group">
            {relationCopy.customHeading}
          </h3>
          {list(custom)}
        </section>
      )}
      <RelationActions />
      {missing.length > 0 && (
        <section aria-labelledby={addId}>
          <h3 id={addId} className="layers__group">
            {layerCopy.addHeading}
          </h3>
          <ul className="layer-list">
            {missing.map((layer) => (
              <li key={layer.key} className="layer-list__item">
                <span>{layer.label}</span>
                <button
                  type="button"
                  className="button button--text layer-list__edit"
                  aria-label={layerCopy.add(layer.label)}
                  onClick={() => {
                    restoreLayer(layer.key);
                    setStatus({ text: layerCopy.added(layer.label), tone: 'info' });
                  }}
                >
                  {layerCopy.addShort}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <LayerEditDialog
        layer={editingLayer}
        impact={editingLayer ? deletionImpact(project, editingLayer.key) : null}
        onClose={() => {
          setEditing(null);
        }}
      />
    </div>
  );
}

type Impact = ReturnType<typeof deletionImpact>;

function LayerEditDialog({
  layer,
  impact,
  onClose,
}: {
  layer: LayerDefinition | null;
  impact: Impact | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={layer !== null} title={layerCopy.dialogTitle} onClose={onClose}>
      {layer && impact && <LayerForm layer={layer} impact={impact} onClose={onClose} />}
    </Dialog>
  );
}

function LayerForm({
  layer,
  impact,
  onClose,
}: {
  layer: LayerDefinition;
  impact: Impact;
  onClose: () => void;
}) {
  const updateLayer = useAppStore((s) => s.updateLayer);
  const deleteLayer = useAppStore((s) => s.deleteLayer);
  const setStatus = useAppStore((s) => s.setStatus);
  const [label, setLabel] = useState(layer.label);
  const [wording, setWording] = useState(layer.question_wording);
  const [mutual, setMutual] = useState(isMutualLayer(layer));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touched, setTouched] = useState(false);
  const labelId = useId();
  const wordingId = useId();
  const labelEmpty = label.trim() === '';

  return (
    <form
      className="layer-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (labelEmpty) return;
        updateLayer(layer.key, {
          label: label.trim(),
          question_wording: wording.trim(),
          // Stored only when it differs from the default for the layer (isMutualLayer).
          ...(mutual === isMutualLayer(layer) ? {} : { mutual }),
        });
        setStatus({ text: layerCopy.saved(label.trim()), tone: 'info' });
        onClose();
      }}
    >
      <div className="field">
        <label htmlFor={labelId} className="field__label">
          {layerCopy.labelField}
        </label>
        <input
          id={labelId}
          className="text-input"
          value={label}
          aria-invalid={touched && labelEmpty}
          aria-describedby={touched && labelEmpty ? `${labelId}-error` : undefined}
          onChange={(e) => {
            setLabel(e.currentTarget.value);
          }}
        />
        {touched && labelEmpty && (
          <p id={`${labelId}-error`} className="field__error">
            {layerCopy.emptyLabel}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={wordingId} className="field__label">
          {layerCopy.wordingField}
        </label>
        <p id={`${wordingId}-help`} className="field__help">
          {layerCopy.wordingHelp}
        </p>
        <textarea
          id={wordingId}
          className="text-input text-input--area"
          rows={3}
          value={wording}
          aria-describedby={`${wordingId}-help`}
          onChange={(e) => {
            setWording(e.currentTarget.value);
          }}
        />
      </div>
      {!isCategorical(layer) && (
        <div className="field">
          <Switch label={remediesCopy.mutual} checked={mutual} onChange={setMutual} />
          <p className="field__help">{remediesCopy.mutualHelp}</p>
        </div>
      )}
      <dl className="definition-list">
        <dt>{layerCopy.scale}</dt>
        <dd className="num">{scaleDescription(layer)}</dd>
        <dt>{relationCopy.roleField}</dt>
        <dd>{roleCopy[layerRole(layer)].name}</dd>
        <dt>{layerCopy.key}</dt>
        <dd>{layer.key}</dd>
      </dl>
      {layer.core && <p className="field__help">{layerCopy.coreNote}</p>}
      <div className="dialog__actions dialog__actions--split">
        {!layer.core && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            {layerCopy.deleteLayer}
          </button>
        )}
        <span className="dialog__actions-end">
          <button type="button" className="button button--text" onClick={onClose}>
            {layerCopy.cancel}
          </button>
          <button type="submit" className="button button--primary">
            {layerCopy.save}
          </button>
        </span>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={layerCopy.deleteTitle(layer.label)}
        body={
          layer.builtin ? layerCopy.deleteBody(impact.ratings) : relationCopy.deleteBody(impact)
        }
        confirm={layerCopy.deleteLayer}
        cancel={layerCopy.cancel}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          setConfirmDelete(false);
          deleteLayer(layer.key);
          setStatus({ text: layerCopy.deleted(layer.label), tone: 'info' });
          onClose();
        }}
      />
    </form>
  );
}
