import { useId, useMemo } from 'react';
import { Icon } from '../components/Icon';
import { mapCopy } from '../copy/map';
import { compositeStatement, questionsCopy } from '../copy/questions';
import { readoutSentence } from '../copy/readouts';
import { effectiveSettings } from '../map/useMapModel';
import { useMemberNames } from '../state/names';
import { activeQuestion, type QuestionId } from '../state/questions';
import { networkReadouts, questionReadouts } from '../state/readouts';
import { useAppStore, type CentreView } from '../state/store';

const Q = questionsCopy;

/** The other view a question offers beside its own (build plan session 8). */
const SEE_ALSO: Partial<Record<QuestionId, { view: CentreView; on: CentreView[] }>> = {
  information: { view: 'table', on: ['map'] },
  informal: { view: 'compare', on: ['map'] },
  groups: { view: 'map', on: ['groups'] },
  depend: { view: 'map', on: ['table'] },
};

// The title of the centre column (build plan session 8, spec §8): the question
// the view answers, or the layer ties come from, and a sentence for each
// number about the network. Every figure is the analysis's, counted over all
// ties, whatever the map's range hides.
export function QuestionHeader() {
  const project = useAppStore((s) => s.data.project);
  const result = useAppStore((s) => s.results.current);
  const raw = useAppStore((s) => s.map);
  const centreView = useAppStore((s) => s.ui.centreView);
  const setCentreView = useAppStore((s) => s.setCentreView);
  const setTableMode = useAppStore((s) => s.setTableMode);
  const setIncomingLayer = useAppStore((s) => s.setIncomingLayer);
  const setCompareMode = useAppStore((s) => s.setCompareMode);
  const names = useMemberNames();
  const headingId = useId();
  const aboutId = useId();
  const aboutOpen = useAppStore((s) => s.ui.aboutOpen);
  const setAboutOpen = useAppStore((s) => s.setAboutOpen);

  const content = useMemo(() => {
    if (!project || !result || result.memberIds.length !== project.members.length) return null;
    const settings = effectiveSettings(project, result, raw);
    const layer = settings.layer;
    const label =
      layer === 'composite'
        ? mapCopy.controls.composite
        : (project.layers.find((l) => l.key === layer)?.label ?? layer);
    const question = activeQuestion(project, settings);
    const sentences = question
      ? questionReadouts(question, project, result, layer, label).map((r) =>
          readoutSentence(r, names.of),
        )
      : [];
    // The measures the question already reads out are not repeated below it.
    const shown = new Set(sentences);
    const network = networkReadouts(project, result, layer, label)
      .map((r) => readoutSentence(r, names.of))
      .filter((s) => !shown.has(s));
    const composite =
      layer === 'composite' && result.composite ? compositeStatement(result.composite) : null;
    const hidden = settings.threshold > 0 || settings.thresholdTo < 1;
    return { question, label, sentences, network, composite, hidden, layer };
  }, [project, result, raw, names]);

  if (!content) return null;
  const { question, label, sentences, network, composite, hidden, layer } = content;
  const also = question ? SEE_ALSO[question] : undefined;
  const alsoLabel = question ? Q.seeAlso[question] : undefined;

  return (
    <section className="question-header">
      <h2 id={headingId} className="question-header__title">
        {question ? Q.title(Q.questions[question]) : Q.ownTitle(label)}
      </h2>
      {composite && <p className="question-header__composite">{composite}</p>}
      {sentences.length > 0 && <p className="question-header__readouts">{sentences.join(' ')}</p>}
      <div className="question-header__actions">
        <button
          type="button"
          className="button button--text question-header__toggle"
          aria-expanded={aboutOpen}
          aria-controls={aboutId}
          onClick={() => {
            setAboutOpen(!aboutOpen);
          }}
        >
          <Icon name={aboutOpen ? 'collapse' : 'expand'} />
          {Q.aboutNetwork}
        </button>
        {also && alsoLabel && also.on.includes(centreView) && (
          <button
            type="button"
            className="button button--text"
            onClick={() => {
              if (also.view === 'table') {
                setTableMode('incoming');
                setIncomingLayer(layer);
              }
              if (also.view === 'compare') setCompareMode('formalInformal');
              setCentreView(also.view);
            }}
          >
            {alsoLabel}
          </button>
        )}
      </div>
      <div id={aboutId} hidden={!aboutOpen}>
        <ul className="question-header__list">
          {network.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {hidden && <p className="question-header__note">{Q.allTies}</p>}
      </div>
    </section>
  );
}
