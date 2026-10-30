import { useId } from 'react';
import { latestRatedWave } from '../../data/waves';
import { wavesCopy } from '../copy/waves';
import { useAppStore } from '../state/store';
import { useWaveInfo } from '../state/waves';

const W = wavesCopy;
const LATEST = 'latest';

// The wave analysed (build plan session 14): offered only when the project has
// more than one wave. "Latest" follows the newest wave with ratings, so a view
// opened later shows new responses; a wave chosen by number stays put.
export function WaveSelect() {
  const info = useWaveInfo();
  const project = useAppStore((s) => s.data.project);
  const chosen = useAppStore((s) => s.map.wave);
  const setMap = useAppStore((s) => s.setMap);
  const selectId = useId();
  const helpId = useId();
  if (!info?.shown || !project) return null;
  const latest = latestRatedWave(project);
  return (
    <div className="field wave-select">
      <label htmlFor={selectId} className="field__label">
        {W.label}
      </label>
      <select
        id={selectId}
        className="select"
        value={chosen === null ? LATEST : String(chosen)}
        aria-describedby={helpId}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setMap({ wave: v === LATEST ? null : Number(v) });
        }}
      >
        <option value={LATEST}>{W.option(latest, true)}</option>
        {info.waves.map((w) => (
          <option key={w} value={String(w)}>
            {W.option(w, false)}
          </option>
        ))}
      </select>
      <p id={helpId} className="field__help">
        {W.help}
      </p>
    </div>
  );
}
