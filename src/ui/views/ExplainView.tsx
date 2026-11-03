import { useEffect, useId, useMemo, useState } from 'react';
import { engagementCopy as E } from '../copy/engagement';
import type { ReaderNote } from '../export/methodNotes';
import { useMapData } from '../map/useMapModel';
import { explainView } from '../state/explain';
import { alignNames, useMemberNames } from '../state/names';

// "Explain this view" (build plan session 16): the map on screen in plain sentences, and the
// notes for readers (method notes §19) on the terms it uses, loaded when first opened.
export function ExplainView({ id }: { id: string }) {
  const data = useMapData();
  const names = useMemberNames();
  const headingId = useId();
  const termsId = useId();
  const [notes, setNotes] = useState<ReaderNote[] | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([
      import('../../../docs/method-notes.md?raw'),
      import('../export/methodNotes'),
    ]).then(([{ default: md }, { readerNotes }]) => {
      if (live)
        setNotes(
          readerNotes(md, { signed: true, formalInformal: true, excludeSigned: false }).notes,
        );
    });
    return () => {
      live = false;
    };
  }, []);
  const explanation = useMemo(() => {
    if (!data) return null;
    const aligned = alignNames(names, data.project);
    return explainView(data, data.theme, (i) => aligned.byIndex[i] ?? '');
  }, [data, names]);
  if (!explanation) return <div id={id} />;
  const glossary = (notes ?? []).filter((n) => explanation.terms.includes(n.heading));
  return (
    <div id={id} className="explain">
      <h3 id={headingId} className="explain__heading">
        {E.explain.heading}
      </h3>
      <ul className="explain__list" aria-labelledby={headingId}>
        {explanation.sentences.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      {glossary.length > 0 && (
        <>
          <h3 id={termsId} className="explain__heading">
            {E.explain.glossary}
          </h3>
          <ul className="explain__list" aria-labelledby={termsId}>
            {glossary.map((n) => (
              <li key={n.heading}>
                <span className="explain__term">{n.heading}.</span> {n.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
