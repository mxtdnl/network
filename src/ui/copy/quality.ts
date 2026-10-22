// Wording for the "Check the data" tab, the rating flags and the data-quality
// statement (build plan session 4, D9). src/data/quality.ts returns structure;
// this module writes it. The statement names no member, so it can travel into
// every export whatever the Hide names setting; group values (teams, levels)
// are not names.

import { QUALITY_RULES, type GroupBreakdown, type QualityResult } from '../../data/quality';
import { coveragePercent, percent } from './data';

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** "Three", "12": counts up to ten in words, as in running text. */
const word = (n: number) => WORDS[n] ?? n.toLocaleString('en-GB');
const lowerWord = (n: number) => (n <= 10 ? word(n).toLowerCase() : word(n));
const people = (n: number) => (n === 1 ? 'person' : 'people');

/** "Admin, Clinic and Labs". */
export function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

const groupValue = (v: string | null) => v ?? 'Not recorded';
const pct = (share: number) => percent(share);
/** A share in words where it reads better: "half". */
const shareWords = (x: number) => (x === 0.5 ? 'half' : pct(x));
const fewShare = shareWords(QUALITY_RULES.fewRatings);

/** Where the members who gave no ratings sit: "one each in Admin, Clinic and Labs". */
function whereSilent(b: GroupBreakdown | null, label: string | null): string | null {
  if (!b || b.rows.length < 2) return null;
  const rows = b.rows.filter((r) => r.noRatings > 0);
  if (rows.length === 0) return null;
  const by = label ? ` by ${label.toLowerCase()}` : '';
  if (rows.length > 1 && rows.every((r) => r.noRatings === 1))
    return `one each in ${listOf(rows.map((r) => groupValue(r.value)))}${by}`;
  if (rows.length === 1 && rows[0])
    return `all in ${groupValue(rows[0].value)}${by}, ${lowerWord(rows[0].noRatings)} of its ${rows[0].members.toLocaleString('en-GB')} members`;
  return `${listOf(rows.map((r) => `${lowerWord(r.noRatings)} in ${groupValue(r.value)}`))}${by}`;
}

/**
 * The data-quality statement: a few sentences, written from the structured
 * results, for the report cover, the start of a presentation, the Export
 * dialog and the "Check the data" tab.
 */
export function qualityStatement(q: QualityResult): string[] {
  const c = q.coverage;
  const out: string[] = [];
  if (!(c.rated > 0) || !Number.isFinite(c.rate))
    return ['No ratings yet, so the data cannot be checked.'];
  const rate = coveragePercent(c.rate, c.threshold);
  const threshold = percent(c.threshold);
  out.push(
    c.belowThreshold
      ? `Coverage ${rate}, below the ${threshold} threshold.`
      : `Coverage ${rate}, at or above the ${threshold} threshold.`,
  );
  const none = q.noRatings.length;
  const few = q.fewRatings.length;
  if (none > 0 || few > 0) {
    // By the rules' grouping attribute; with one group only, by the attribute
    // that holds most of them in one group (the night shift, say).
    const most = (b: GroupBreakdown) => Math.max(...b.rows.map((r) => r.noRatings));
    const share = (b: GroupBreakdown) =>
      Math.max(...b.rows.map((r) => (r.members > 0 ? r.noRatings / r.members : 0)));
    const alternative = q.breakdowns
      .filter((b) => b.rows.length >= 2)
      .sort((a, b) => most(b) - most(a) || share(b) - share(a))[0];
    const where = whereSilent(
      q.byGroup && q.byGroup.rows.length >= 2 ? q.byGroup : (alternative ?? null),
      q.byGroup && q.byGroup.rows.length >= 2 ? null : (alternative?.label ?? null),
    );
    const noneText =
      none > 0
        ? `${word(none)} of ${q.members.toLocaleString('en-GB')} ${people(q.members)} gave no ratings${where ? ` (${where})` : ''}`
        : '';
    const fewText =
      few > 0
        ? `${none > 0 ? `${lowerWord(few)} more` : `${word(few)} of ${q.members.toLocaleString('en-GB')} ${people(q.members)}`} gave fewer than ${fewShare} of the ratings possible`
        : '';
    out.push(`${[noneText, fewText].filter(Boolean).join(', and ')}.`);
    const all = none + few;
    out.push(
      `What ${all === 1 ? "this person's" : `these ${lowerWord(all)} people's`} own ratings would show is missing; their results rest largely on other people's reports.`,
    );
  }
  const low = q.lowestGroup;
  if (low && low.row.rate < c.threshold)
    out.push(
      `Coverage is lowest in ${groupValue(low.row.value)} (${low.label.toLowerCase()}, ${low.row.members.toLocaleString('en-GB')} members), at ${coveragePercent(low.row.rate, c.threshold)}.`,
    );
  if (q.sameAnswer.length > 0)
    out.push(
      `${word(q.sameAnswer.length)} ${people(q.sameAnswer.length)} gave everyone the same answer, so their ratings do not tell colleagues apart.`,
    );
  const hi = q.higher.length;
  const lo = q.lower.length;
  if (hi > 0 || lo > 0) {
    const parts = [
      hi > 0
        ? `${lowerWord(hi)} ${people(hi)} ${hi === 1 ? 'rates' : 'rate'} colleagues higher than most`
        : '',
      lo > 0
        ? `${lowerWord(lo)} ${hi > 0 ? '' : `${people(lo)} `}${lo === 1 ? 'rates' : 'rate'} ${hi > 0 ? 'them' : 'colleagues'} lower than most`
        : '',
    ].filter(Boolean);
    const sentence = parts.join(' and ');
    out.push(
      `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}, by ${QUALITY_RULES.styleFromMedian.toFixed(2)} or more on a 0 to 1 scale; their habits carry into out-strength and into averaged ties.`,
    );
  }
  if (q.denseReporting)
    out.push(
      `Most people report a tie with nearly every colleague (median ${pct(q.medianTiedShare)}), so a reported tie may mean little more than knowing someone.`,
    );
  if (q.manyTies.length > 0)
    out.push(
      `${word(q.manyTies.length)} ${people(q.manyTies.length)} ${q.manyTies.length === 1 ? 'reports' : 'report'} ties with many more colleagues than most.`,
    );
  if (q.reportedTies > 0)
    out.push(
      q.oneWay === 0
        ? `Every one of the ${q.reportedTies.toLocaleString('en-GB')} ties reported where the other person also answered was reported back.`
        : `Of the ${q.reportedTies.toLocaleString('en-GB')} ties reported where the other person also answered, ${pct(q.oneWayShare)} were not reported back.`,
    );
  if (out.length === 2 && none === 0 && few === 0)
    out.splice(1, 0, 'Everyone gave ratings, and no rating habit stands out.');
  return out;
}

export const qualityCopy = {
  tab: 'Check the data',
  statementHeading: 'Data-quality statement',
  statementIntro:
    'Written from the checks below. It appears on the report cover, at the start of a presentation and in the Export dialog. It names no one.',
  coverageHeading: 'Coverage',
  byGroupHeading: (label: string) => `Coverage by ${label.toLowerCase()}`,
  groupColumns: {
    group: (label: string) => label,
    members: 'Members',
    respondents: 'Gave ratings',
    rate: 'Response rate',
    oneWay: 'Not reported back',
    meanGiven: 'Mean rating given',
  },
  silentHeading: 'People who gave no ratings or few',
  silentIntro: `Their own view of their ties is missing, so their outgoing and path-based values rest on other people's reports. Named here for the analyst only; the statement and exports give counts.`,
  noRatings: (n: number) => `Gave no ratings: ${n.toLocaleString('en-GB')}`,
  fewRatings: (n: number) =>
    `Gave fewer than ${fewShare} of the ratings possible: ${n.toLocaleString('en-GB')}`,
  noneSilent: 'Everyone gave ratings.',
  styleHeading: 'How each person rates',
  styleIntro: `Each rating rescaled to 0–1 on its layer's scale. A person is marked when their mean is ${QUALITY_RULES.styleFromMedian.toFixed(2)} or more from the median of everyone who answered, when they gave one value to everyone on every layer (at least ${String(QUALITY_RULES.sameAnswerMinRatings)} ratings on a layer), or when the share of colleagues they report a tie with is ${pct(QUALITY_RULES.manyTiesAboveMedian)} or more above the median. These describe rating habits, not the person.`,
  styleColumns: {
    member: 'Rater',
    mean: 'Mean',
    spread: 'Spread',
    scaleUsed: 'Scale used',
    tiedShare: 'Colleagues tied',
    note: 'Note',
  },
  styleCaption: 'Raters, highest mean rating first',
  styleNotes: {
    higher: 'Rates higher than most',
    lower: 'Rates lower than most',
    sameAnswer: 'Same answer for everyone',
    manyTies: 'Reports many more ties than most',
  },
  medians: (mean: string, tied: string) =>
    `Median of everyone who answered: mean rating ${mean}, colleagues tied ${tied}.`,
  tiesHeading: 'Ties reported by one side only',
  tiesIntro:
    'A tie is a rating above the lowest point on a layer that is not signed and not conflict. Counted where the other person answered about the rater on one of those layers: how many of the ties reported were not reported back.',
  tiesOverall: (one: number, reported: number, share: string) =>
    `${one.toLocaleString('en-GB')} of ${reported.toLocaleString('en-GB')} reported ties (${share}) were not reported back.`,
  noTieLayers:
    'No layer that is neither signed nor conflict is enabled, so ties cannot be counted.',
  rate: (rate: number, threshold: number) => coveragePercent(rate, threshold),
  share: (v: number) => (Number.isFinite(v) ? pct(v) : '–'),
  mean: (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '–'),
  notRecorded: 'Not recorded',
  /** Export dialog and presentation. */
  exportHeading: 'About the data',
  exportHelp:
    'The data-quality statement, from the project as these settings export it. The report prints it on its cover; it names no one.',
  presentationHeading: 'About the data',
};

/** Rating flags on values that depend on the member's own ratings (member panel, table, CSV). */
export const ratingFlagCopy = {
  gaveNoRatings: 'Gave no ratings: this value rests only on other members’ ratings of them.',
  gaveFewRatings: `Gave fewer than ${fewShare} of the ratings possible: this value rests partly on other members’ ratings of them.`,
  /** Short forms for the table and the member panel heading. */
  short: { gaveNoRatings: 'Gave no ratings', gaveFewRatings: 'Gave few ratings' },
  /** Marks a value in the member panel and the table. */
  marker: '*',
  markerNote: (flag: string) => `* ${flag}: values marked rest on other members’ reports.`,
  tableNote:
    '* The member gave no ratings or few: the value rests on other members’ reports of them.',
  legend: 'Gave no ratings',
};
