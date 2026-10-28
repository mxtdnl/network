// Method notes for the PDF report, drawn from docs/method-notes.md itself (the
// file is bundled as text), so the report and the documentation cannot drift
// apart. The report quotes each measure's "Meaning" and "Caveats" paragraphs
// for the measures it shows; formulas stay in the full notes, which the report
// points to.

export interface NoteSection {
  /** The heading as written in the notes, e.g. "Density" or "1.1 Not rated is not zero". */
  heading: string;
  /** Plain-text paragraphs and list items, markdown removed. */
  paragraphs: string[];
  meaning: string | null;
  caveats: string | null;
}

/** Markdown inline syntax to plain text: emphasis, code and links. */
export function plainText(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits the notes into their level-3 sections (### headings). */
export function parseMethodNotes(markdown: string): NoteSection[] {
  const sections: NoteSection[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const blocks: string[] = [];
    let block: string[] = [];
    const end = () => {
      if (block.length > 0) blocks.push(block.join(' '));
      block = [];
    };
    for (const line of current.lines) {
      if (line.trim() === '' || line.startsWith('|') || line.startsWith('```')) end();
      else if (/^\s*- /.test(line)) {
        end();
        block.push(line.replace(/^\s*- /, ''));
      } else block.push(line.trim());
    }
    end();
    const paragraphs = blocks.map(plainText).filter((p) => p !== '');
    const labelled = (label: string) => {
      const p = paragraphs.find((x) => x.startsWith(`${label}.`));
      return p ? p.slice(label.length + 1).trim() : null;
    };
    sections.push({
      heading: current.heading,
      paragraphs,
      meaning: labelled('Meaning'),
      caveats: labelled('Caveats'),
    });
  };
  for (const line of markdown.split(/\r?\n/)) {
    const h = /^(#{2,3}) (.+)$/.exec(line);
    if (h) {
      flush();
      current = h[1] === '###' ? { heading: (h[2] ?? '').trim(), lines: [] } : null;
      continue;
    }
    current?.lines.push(line);
  }
  flush();
  return sections;
}

/** Words that mark text about the layers the signed-layer exclusion removes. */
const SIGNED_TERMS = /\b(valence|energy|conflict|signed|negative sub-layers?|w⁺|w⁻|in-valence)\b/i;

/** Drops the sentences and list items that describe signed or conflict layers. */
export function withoutSignedText(paragraph: string): string {
  if (!SIGNED_TERMS.test(paragraph)) return paragraph;
  // An aside in brackets goes first ("0 means neutral (on a signed layer …)").
  const text = paragraph.replace(/\s*\([^()]*\)/g, (aside) =>
    SIGNED_TERMS.test(aside) ? '' : aside,
  );
  const sentences = text.split(/(?<=[.:;])\s+(?=[A-Z(])/);
  // A paragraph that opens on them is about them throughout (a list item on signed layers).
  if (SIGNED_TERMS.test(sentences[0] ?? '')) return '';
  return sentences.filter((sentence) => !SIGNED_TERMS.test(sentence)).join(' ');
}

export interface ReportNote {
  heading: string;
  meaning: string | null;
  caveats: string | null;
  /** For general conventions, the paragraphs themselves. */
  paragraphs: string[];
}

/** The notes the report quotes, in report order, by the headings of docs/method-notes.md. */
export const REPORT_NOTES: readonly {
  heading: string;
  general?: boolean;
  signed?: boolean;
  /** The caveats concern the implementation rather than the reader. */
  noCaveats?: boolean;
}[] = [
  { heading: '1.1 Not rated is not zero', general: true },
  { heading: '1.2 Rescaling', general: true },
  { heading: '1.3 Directed and symmetrised views', general: true },
  { heading: 'Composite' },
  { heading: 'Density' },
  { heading: 'Reciprocity' },
  { heading: 'Average clustering' },
  { heading: 'Components' },
  { heading: 'Communities (Louvain) and modularity' },
  { heading: 'Centralisation' },
  { heading: 'E-I index' },
  { heading: 'Structural balance', signed: true },
  { heading: 'Formal–informal comparison' },
  { heading: 'Data coverage', noCaveats: true },
];

/** The selected notes; with `excludeSigned`, notes on signed layers and every sentence about them are left out. */
export function reportNotes(markdown: string, excludeSigned: boolean): ReportNote[] {
  // The notes for readers (section 19) repeat some headings in plain words; they are read by readerNotes.
  const sections = parseMethodNotes(markdown.split(READERS)[0] ?? markdown);
  const byHeading = new Map(sections.map((s) => [s.heading, s]));
  const clean = (s: string | null) => (s === null || !excludeSigned ? s : withoutSignedText(s));
  const out: ReportNote[] = [];
  for (const want of REPORT_NOTES) {
    if (want.signed && excludeSigned) continue;
    const s = byHeading.get(want.heading);
    if (!s) throw new Error(`docs/method-notes.md has no section "${want.heading}".`);
    out.push({
      heading: want.heading.replace(/^\d+\.\d+ /, ''),
      meaning: want.general ? null : clean(s.meaning),
      caveats: want.general || want.noCaveats ? null : clean(s.caveats),
      paragraphs: want.general
        ? s.paragraphs.map((p) => clean(p) ?? '').filter((p) => p !== '')
        : [],
    });
  }
  return out;
}

/** The insight rules' shared caveats paragraph from section 8 ("Caveats. The thresholds are conventions…"). */
export function insightCaveats(markdown: string, excludeSigned: boolean): string | null {
  const text = markdown.split(/^## 8\. Insight rules$/m)[1]?.split(/^## /m)[0] ?? '';
  const p = text
    .split(/\n\s*\n/)
    .map(plainText)
    .find((x) => x.startsWith('Caveats.'));
  if (!p) return null;
  const body = p.slice('Caveats.'.length).trim();
  return excludeSigned ? withoutSignedText(body) : body;
}

/** Section 19 of the notes, "Notes for readers": the report's method in brief (build plan session 10). */
const READERS = /^## 19\. Notes for readers$/m;

/** Reader notes that apply only when the analysis has these layers. */
const READER_NEEDS: Record<string, 'signed' | 'formalInformal'> = {
  'Negative ratings': 'signed',
  'Formal and informal collaboration': 'formalInformal',
};

export interface ReaderNote {
  heading: string;
  text: string;
}

/**
 * The reader-facing notes, in the order written: one or two sentences per
 * measure. Notes on layers the analysis lacks are left out, and with
 * `excludeSigned` so is every sentence about signed or conflict layers.
 */
export function readerNotes(
  markdown: string,
  has: { signed: boolean; formalInformal: boolean; excludeSigned: boolean },
): { intro: string | null; notes: ReaderNote[] } {
  const body = markdown.split(READERS)[1]?.split(/^## /m)[0];
  if (body === undefined)
    throw new Error('docs/method-notes.md has no section "19. Notes for readers".');
  const intro =
    body
      .split(/^### /m)[0]
      ?.split(/\n\s*\n/)
      .map(plainText)
      .find((p) => p !== '') ?? null;
  const notes: ReaderNote[] = [];
  for (const s of parseMethodNotes(`## 19\n${body}`)) {
    const need = READER_NEEDS[s.heading];
    if (need === 'signed' && (!has.signed || has.excludeSigned)) continue;
    if (need === 'formalInformal' && !has.formalInformal) continue;
    const text = s.paragraphs
      .map((p) => (has.excludeSigned ? withoutSignedText(p) : p))
      .filter((p) => p !== '')
      .join(' ');
    if (text !== '') notes.push({ heading: s.heading, text });
  }
  return { intro, notes };
}
