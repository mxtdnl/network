import { useId } from 'react';
import type { Block } from '../export/report';
import type { CardModel } from '../state/card';

// The personal network card (build plan session 9), from the same blocks the
// PDF lays out (state/card.ts): one section per part, tables with a header row,
// so it reads the same on screen, in presentation mode and on paper.
export function PersonalCard({
  card,
  headingLevel = 2,
}: {
  card: CardModel;
  headingLevel?: 2 | 3;
}) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const base = useId();
  return (
    <div className="card" data-testid="network-card">
      <p className="card__subtitle">{card.subtitle}</p>
      {card.sections.map((section, k) => {
        const id = `${base}-${String(k)}`;
        return (
          <section key={section.title} className="card__section" aria-labelledby={id}>
            <H id={id} className="card__heading">
              {section.title}
            </H>
            {section.blocks.map((b, j) => (
              <CardBlock key={j} block={b} caption={section.title} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function CardBlock({ block, caption }: { block: Block; caption: string }) {
  switch (block.kind) {
    case 'heading':
      return <p className="card__subheading">{block.text}</p>;
    case 'warning':
      return (
        <p className="card__warning" role="note">
          {block.text}
        </p>
      );
    case 'paragraph':
      return (
        <p className={block.tone === 'graphite' ? 'card__note' : 'card__text'}>
          {block.lead && <span className="card__lead">{block.lead}: </span>}
          {block.text}
        </p>
      );
    case 'table':
      return (
        <div className="card__table-wrap">
          <table className="card__table">
            <caption className="visually-hidden">{caption}</caption>
            <thead>
              <tr>
                {block.columns.map((c) => (
                  <th key={c.label} scope="col" className={c.numeric ? 'numeric' : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) =>
                    c === 0 ? (
                      <th key={c} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={c} className={block.columns[c]?.numeric ? 'numeric num' : undefined}>
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
