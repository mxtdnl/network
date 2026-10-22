// Wording for the data remedies in "Check the data" (build plan session 5,
// CLAUDE.md D150–D153). Sentence case and plain words (spec §12); the method
// is in docs/method-notes.md §14.

import type { RemedyAvailability, RemedyId } from '../state/remedies';
import { listOf } from './quality';

const num = (n: number) => n.toLocaleString('en-GB');

export const remediesCopy = {
  heading: 'Adjust the analysis',
  intro:
    'Options for the gaps the checks above show. Each one changes the whole analysis (map, tables, insights and exports) and is saved with views. Preview them to see which insight observations each would change before you switch it.',
  titles: {
    bothReport: 'Count a tie only when both report it',
    leaveOut: 'Leave out people who gave no ratings',
    reconstruct: 'Reconstruct their ties from colleagues’ ratings',
    standardise: 'Compare each person’s ratings with their own',
  } satisfies Record<RemedyId, string>,
  help: {
    bothReport:
      'Shows each pair once and keeps a tie only when each has rated the other above 0, at the weaker of the two ratings. A missing rating gives no tie, so ties to people who gave no ratings disappear. This is the Direction setting “Both report a tie” on the Map tab.',
    leaveOut:
      'Their values that depend on their own ratings show as not defined, and the rules on brokers, peripheral members and possible overload neither name nor count them. When this is off, those values are shown and marked *.',
    reconstruct: (layers: string[]) =>
      `On relations both people share (${listOf(layers)}), a person who gave no ratings is given each colleague’s rating of them as their own rating of that colleague. Reconstructed ties are labelled: they are colleagues’ reports, not the person’s own.`,
    standardise:
      'On unsigned layers, each person’s ratings are replaced by their rank among that person’s own ties, spread evenly between 0 and 1, so someone who rates everyone high and someone who rates everyone low count alike. Which ties exist does not change; signed layers are unchanged.',
  } as const,
  unavailable: {
    available: '',
    everyoneAnswered: 'Not needed: everyone gave ratings.',
    noMutualLayer:
      'Not available: no enabled layer is marked as mutual by nature (Layers, on the left).',
    noUnsignedLayer: 'Not available: no unsigned layer is enabled.',
    noLayers: 'Not available: no rated layer is enabled.',
  } satisfies Record<RemedyAvailability, string>,
  preview: 'Preview the effect on the insights',
  previewAgain: 'Preview again',
  previewing: 'Calculating the previews…',
  previewFailed: 'The previews could not be calculated.',
  stale: 'The analysis has changed since this preview.',
  ifOn: 'Switching it on would change:',
  ifOff: 'Switching it off would change:',
  noChangeOn: 'Switching it on would change no insight observation.',
  noChangeOff: 'Switching it off would change no insight observation.',
  was: 'now',
  becomes: 'would be',
  none: 'none',
  notApplied: 'not applied',
  ties: (before: number, after: number) =>
    `Composite ties: ${num(before)} now, ${num(after)} with the change.`,
  reconstructed: (n: number) =>
    n === 1 ? 'One direction reconstructed.' : `${num(n)} directions reconstructed.`,
  /** A member-level observation: the members, at most five named. */
  members: (names: string[], total: number) =>
    total > names.length ? `${listOf(names)} and ${num(total - names.length)} more` : listOf(names),
  group: (value: string, other: string | undefined, layer: string) =>
    other && other !== value ? `${value} and ${other} on ${layer}` : `${value} on ${layer}`,
  /** Shown in the map legend, the member panel and the report when reconstruction applies. */
  reconstructedNote: (n: number) =>
    n === 1
      ? 'One tie direction reconstructed from a colleague’s rating'
      : `${num(n)} tie directions reconstructed from colleagues’ ratings`,
  reconstructedRating: 'reconstructed',
  reconstructedHelp:
    'Reconstructed: this person gave no ratings, so their rating is taken from the colleague’s rating of them.',
  /** One line per remedy applied, for the report cover and the network metrics CSV. */
  applied: {
    bothReport: 'Ties counted only where both report one',
    leaveOut: 'People who gave no ratings left out of values that depend on their own ratings',
    reconstruct: 'Ties of people who gave no ratings reconstructed on mutual layers',
    standardise: 'Each person’s ratings ranked within that person on unsigned layers',
  } satisfies Record<RemedyId, string>,
  mutual: 'Mutual by nature',
  mutualHelp:
    'Both people share this relation, so the ties of someone who gave no ratings can be reconstructed from colleagues’ ratings (Check the data).',
} as const;
