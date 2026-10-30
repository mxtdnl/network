import { useWaveProject } from '../state/waves';
import { useEffect, useId, useRef, useState } from 'react';
import { EngineClient, type Observation } from '../engineClient';
import { Switch } from '../components/Switch';
import { insightsCopy } from '../copy/insights';
import { mapCopy } from '../copy/map';
import { remediesCopy as R } from '../copy/remedies';
import { refLabel } from '../map/model';
import { useMemberNames, type MemberNames } from '../state/names';
import {
  previewRemedy,
  REMEDY_ORDER,
  remedyAvailability,
  remedyOn,
  toggleRemedy,
  type RemedyPreview,
  type RuleChange,
} from '../state/remedies';
import { useAppStore } from '../state/store';
import { isMutualLayer, isCategorical, type Project } from '../../data/schema';

const MAX_NAMED = 5;

function summary(o: Observation, project: Project, names: MemberNames): string {
  const layer = o.ref === 'composite' ? mapCopy.controls.composite : refLabel(project, o.ref);
  if (o.group) return R.group(o.group.value, o.group.other, layer.toLowerCase());
  const named = o.members.slice(0, MAX_NAMED).map((id) => names.of(id));
  return R.members(named, o.members.length);
}

function outcomeText(outcome: RuleChange['before'], project: Project, names: MemberNames): string {
  if (outcome.status === 'unavailable') return R.notApplied;
  if (outcome.observations.length === 0) return R.none;
  return outcome.observations.map((o) => summary(o, project, names)).join('; ');
}

function Preview({
  preview,
  on,
  project,
  names,
}: {
  preview: RemedyPreview;
  on: boolean;
  project: Project;
  names: MemberNames;
}) {
  return (
    <div className="remedy__preview">
      {preview.changes.length === 0 ? (
        <p>{on ? R.noChangeOff : R.noChangeOn}</p>
      ) : (
        <>
          <p>{on ? R.ifOff : R.ifOn}</p>
          <ul className="remedy__changes">
            {preview.changes.map((c) => (
              <li key={c.rule}>
                <span className="remedy__rule">{insightsCopy.titles[c.rule]}</span>
                <span>
                  {R.was}: {outcomeText(c.before, project, names)}
                </span>
                <span>
                  {R.becomes}: {outcomeText(c.after, project, names)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {preview.ties && preview.ties.before !== preview.ties.after && (
        <p className="num">{R.ties(preview.ties.before, preview.ties.after)}</p>
      )}
      {preview.reconstructed > 0 && <p className="num">{R.reconstructed(preview.reconstructed)}</p>}
    </div>
  );
}

// "Adjust the analysis" (build plan session 5): the four remedies, each a
// switch that changes the analysis on screen, with a preview of what it would
// change in the insights. Previews run on a worker of their own, one option
// at a time, and are dropped when the analysis on screen changes.
export function RemediesSection() {
  const project = useWaveProject();
  const result = useAppStore((s) => s.results.current);
  const map = useAppStore((s) => s.map);
  const weights = useAppStore((s) => s.weights);
  const setMap = useAppStore((s) => s.setMap);
  const names = useMemberNames();
  const headingId = useId();
  const [previews, setPreviews] = useState<{ key: string; items: RemedyPreview[] } | null>(null);
  const [state, setState] = useState<'idle' | 'running' | 'failed'>('idle');
  const run = useRef(0);
  const client = useRef<EngineClient | null>(null);

  useEffect(
    () => () => {
      run.current += 1;
      client.current?.dispose();
      client.current = null;
    },
    [],
  );

  if (!project || !result) return null;
  const mutualLayers = project.layers
    .filter((l) => l.enabled && !isCategorical(l) && isMutualLayer(l))
    .map((l) => l.label.toLowerCase());
  const current = previews?.key === result.inputKey ? previews.items : null;

  const preview = async () => {
    const id = (run.current += 1);
    client.current?.dispose();
    const c = new EngineClient();
    client.current = c;
    setState('running');
    try {
      const items: RemedyPreview[] = [];
      for (const r of REMEDY_ORDER) {
        if (remedyAvailability(r, project, result) !== 'available' && !remedyOn(r, map)) continue;
        items.push(
          // A worker of its own, so the analysis on screen is untouched (as D105).
          await previewRemedy(
            r,
            project,
            map,
            weights,
            result,
            (input) => c.analyse(input).promise,
          ),
        );
        if (run.current !== id) return;
      }
      setPreviews({ key: result.inputKey, items });
      setState('idle');
    } catch {
      if (run.current === id) setState('failed');
    } finally {
      if (run.current === id) {
        c.dispose();
        client.current = null;
      }
    }
  };

  return (
    <section className="quality__section remedies" aria-labelledby={headingId}>
      <h3 id={headingId} className="coverage__subheading">
        {R.heading}
      </h3>
      <p className="coverage__explain">{R.intro}</p>
      {REMEDY_ORDER.map((r) => {
        const on = remedyOn(r, map);
        const availability = remedyAvailability(r, project, result);
        const item = current?.find((p) => p.id === r);
        return (
          <div key={r} className="remedy field">
            {availability === 'available' || on ? (
              <Switch
                label={R.titles[r]}
                checked={on}
                onChange={() => {
                  setMap(toggleRemedy(r, map));
                }}
              />
            ) : (
              <p className="remedy__title">{R.titles[r]}</p>
            )}
            <p className="field__help">
              {r === 'reconstruct' ? R.help.reconstruct(mutualLayers) : R.help[r]}
            </p>
            {availability !== 'available' && (
              <p className="field__help">{R.unavailable[availability]}</p>
            )}
            {item && <Preview preview={item} on={on} project={project} names={names} />}
          </div>
        );
      })}
      <div className="remedies__actions">
        <button
          type="button"
          className="button button--secondary"
          disabled={state === 'running'}
          onClick={() => {
            void preview();
          }}
        >
          {current ? R.previewAgain : R.preview}
        </button>
        <p className="field__help" role="status">
          {state === 'running'
            ? R.previewing
            : state === 'failed'
              ? R.previewFailed
              : previews && !current
                ? R.stale
                : ''}
        </p>
      </div>
    </section>
  );
}
