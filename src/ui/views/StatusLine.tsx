import { Icon } from '../components/Icon';
import { coverageCopy, percent } from '../copy/data';
import { useAppStore } from '../state/store';
import { useCoverage } from './CoveragePanel';

// The line under the top bar: the persistent coverage warning (design-system
// §5.1: it cannot be dismissed while the condition holds) and the result of the
// last action, announced politely.
// In the compact layout (D125) the message sits inline in the top bar, and the
// warning, in a short form, takes the place of the bar's coverage figure.
export function StatusLine({ inline = false }: { inline?: boolean }) {
  const status = useAppStore((s) => s.data.status);
  const coverage = useCoverage();
  const warn = coverage?.belowThreshold === true;

  return (
    <div className={inline ? 'status-line status-line--inline' : 'status-line'}>
      {warn && !inline && (
        <p className="status-line__warning" role="note">
          <Icon name="warning" />
          {coverageCopy.warning(percent(coverage.rate), percent(coverage.threshold))}
        </p>
      )}
      <p className="status-line__message" role="status">
        {status && (
          <>
            {status.tone === 'error' && <Icon name="warning" />}
            {status.text}
          </>
        )}
      </p>
    </div>
  );
}
