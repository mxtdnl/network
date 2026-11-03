// Wording for what changed between two waves (build plan session 15): the
// Compare tab's "Two waves" mode, the change sections of the report and of
// presentation, the personal network card and the change CSV. Observations are
// questions about what lies behind a change, never verdicts on anyone (spec §9;
// the banned list in CLAUDE.md applies, tests/unit/insightsCopy.test.ts).

import {
  CHANGE_RULES,
  type ChangeObservation,
  type GroupCell,
  type TieChangeKind,
  type WaveChange,
} from '../engineClient';
import { coveragePercent, percent } from './data';

const num = (v: number) => v.toLocaleString('en-GB');
const signed = (v: number) =>
  Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}` : '–';
const wave = (n: number) => `wave ${String(n)}`;
const Wave = (n: number) => `Wave ${String(n)}`;
const list = (items: readonly string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
const count = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;

/** Names a member (through the names layer) for the sentences. */
export type NameOf = (id: string) => string;

const moved = (b: number, a: number) => (a > b ? 'rose' : a < b ? 'fell' : 'stayed');

/** "Ties from Build to Support", "Ties between …", "Ties within …". */
function pairPhrase(from: string, to: string, directed: boolean): string {
  if (from === to) return `Ties within ${from}`;
  return directed ? `Ties from ${from} to ${to}` : `Ties between ${from} and ${to}`;
}

function sizeClause(change: WaveChange, group: string): string | null {
  const b = change.before.groupSizes[group];
  const a = change.after.groupSizes[group];
  if (b === undefined || a === undefined || a === b) return null;
  return `${group} ${a > b ? 'grew' : 'shrank'} from ${num(b)} to ${num(a)} members`;
}

/** "Ties between Product and Sales rose from 31 to 47 (from 20% to 35% of those possible)." */
export function groupPairSentence(
  change: WaveChange,
  from: string,
  to: string,
  before: GroupCell,
  after: GroupCell,
): string {
  const directed = change.view === 'directed';
  const verb = moved(before.ties, after.ties);
  const ties =
    verb === 'stayed'
      ? `${pairPhrase(from, to, directed)} stayed at ${num(after.ties)}`
      : `${pairPhrase(from, to, directed)} ${verb} from ${num(before.ties)} to ${num(after.ties)}`;
  const shareVerb = moved(before.density, after.density);
  const share =
    shareVerb === verb || shareVerb === 'stayed'
      ? ` (from ${percent(before.density)} to ${percent(after.density)} of those possible)`
      : `, while the share of those possible ${shareVerb} from ${percent(before.density)} to ${percent(after.density)}`;
  const sizes = [...new Set([from, to])]
    .map((g) => sizeClause(change, g))
    .filter((s): s is string => s !== null);
  return `${ties}${share}.${sizes.length > 0 ? ` ${list(sizes)}.` : ''}`;
}

const RULES = {
  mean: 'the average',
  min: 'the weaker of the two',
  max: 'the stronger of the two',
  both: 'both report a tie',
} as const;

export const changeCopy = {
  mode: 'Two waves',
  /** "directed", or "mutual, combined by the average". */
  view: (view: WaveChange['view'], rule: WaveChange['symmetrise']) =>
    view === 'directed' ? 'directed' : `mutual, combined by ${RULES[rule]}`,
  earlier: 'Earlier wave',
  later: 'Later wave',
  waveOption: (n: number) => Wave(n),
  needsTwoWaves:
    'Two waves with ratings are needed to compare. Repeat the survey from the Survey tab to collect a second wave.',
  calculating: 'Analysing both waves…',
  failed: 'The comparison could not be calculated. Change a setting to try again.',
  intro: (layer: string, view: string) =>
    `${layer}, ${view}. Members sit in the same place on both maps, so the waves can be compared position for position. Every figure counts all ties of each wave, whatever the map’s range.`,
  mapBefore: (n: number) => `${Wave(n)}: ties lost since then are marked`,
  mapAfter: (n: number) => `${Wave(n)}: ties gained since the earlier wave are marked`,
  key: {
    title: 'Key',
    gained: 'Gained: no tie in the earlier wave',
    strengthened: 'Strengthened by two points or more (dashed)',
    lost: 'Lost: no tie in the later wave',
    weakened: 'Weakened by two points or more (dashed)',
    unchanged: 'Other ties',
    notOnRoster: 'Members on one roster only are drawn on that wave’s map only.',
  },
  whatChanged: 'What changed',
  questions: 'Questions for discussion',
  noObservations:
    'No pair of groups, mixing, concentration or route changed past the thresholds used here.',
  thresholds: `A pair of groups is described as changed when the share of possible ties between them moved by ${String(Math.round(CHANGE_RULES.groupDensity * 100))} percentage points or more and it had at least ${num(CHANGE_RULES.groupMinTies)} ties in one wave. A tie is strengthened or weakened when it moved by two points or more on a 0 to 5 scale (${CHANGE_RULES.strengthen.toFixed(2)} on the 0 to 1 scale every layer is read on).`,
  groupsWithheld: (n: number, threshold: number) =>
    `${count(n, 'other pair of groups', 'other pairs of groups')} changed past the thresholds but ${n === 1 ? 'is' : 'are'} not described, because a group’s coverage is below ${percent(threshold)} in a wave.`,
  withheld: (change: WaveChange) => {
    const low = [change.before, change.after]
      .filter((s) => s.coverage < change.minCoverage)
      .map((s) => `${coveragePercent(s.coverage, change.minCoverage)} in ${wave(s.wave)}`);
    return `Coverage is ${list(low)}, below the ${percent(change.minCoverage)} threshold, so no change is described: a difference between the waves could come from who answered. The figures are shown for reference.`;
  },
  regression:
    'Each rating varies a little from one survey to the next, so ties rated far from the usual in one wave tend to be rated closer to it in the next. A change in one tie means little; look for changes shared by many ties.',
  matrix: {
    title: 'Change in ties between groups',
    caption: (directed: boolean) =>
      directed
        ? 'Rows give, columns receive. Each cell shows the change in the share of possible ties, in percentage points.'
        : 'Each cell shows the change in the share of possible ties, in percentage points.',
    readout: (
      from: string,
      to: string,
      directed: boolean,
      b: GroupCell | null,
      a: GroupCell | null,
    ) => {
      const pair = pairPhrase(from, to, directed);
      if (!b || !a) return `${pair}: not possible in both waves.`;
      return `${pair}: ${num(b.ties)} of ${num(b.possible)} (${percent(b.density)}) before, ${num(a.ties)} of ${num(a.possible)} (${percent(a.density)}) after.`;
    },
    points: (d: number) =>
      Number.isFinite(d)
        ? `${d > 0 ? '+' : d < 0 ? '−' : ''}${String(Math.abs(Math.round(d * 100)))}`
        : '–',
    notPossible: 'Not possible in both waves',
    noGroups:
      'Choose an attribute to group members by in the Insights tab to see change between groups.',
  },
  table: {
    caption: 'The two waves',
    measure: 'Measure',
    members: 'Members on the roster',
    coverage: 'Coverage',
    ties: 'Ties',
    density: 'Density',
    ei: 'Ties within and between groups (E-I)',
    load: 'Incoming ties held by the top 10 %',
    bridges: 'Bridge ties',
    cutPoints: 'Cut points',
  },
  tieTable: {
    caption: 'Ties between members on both rosters',
    kind: 'Change',
    count: 'Pairs',
  },
  kinds: {
    gained: 'Gained',
    lost: 'Lost',
    strengthened: 'Strengthened',
    weakened: 'Weakened',
    steady: 'Little or no change',
    notComparable: 'Not comparable (not rated in one wave)',
  } satisfies Record<TieChangeKind, string>,
  perMember: {
    show: 'Show change per member',
    hide: 'Hide change per member',
    member: 'Member',
    received: 'Ties received',
    given: 'Ties given',
  },
  arrow: (b: number, a: number) =>
    `${Number.isFinite(b) ? num(b) : '–'} → ${Number.isFinite(a) ? num(a) : '–'}`,

  /** Sentences describing the change as a whole. */
  summary(change: WaveChange, name: NameOf | null): string[] {
    const { before: b, after: a } = change;
    const out: string[] = [];
    out.push(
      `Coverage was ${coveragePercent(b.coverage, change.minCoverage)} in ${wave(b.wave)} and ${coveragePercent(a.coverage, change.minCoverage)} in ${wave(a.wave)}.`,
    );
    const { both, left, joined } = change.members;
    const roster = [
      `${count(both.length, 'member was', 'members were')} on both rosters`,
      // Without names (audiences that see no member), counts only.
      ...(left.length > 0
        ? [`${num(left.length)} left${name ? ` (${list(left.map(name))})` : ''}`]
        : []),
      ...(joined.length > 0
        ? [`${num(joined.length)} joined${name ? ` (${list(joined.map(name))})` : ''}`]
        : []),
    ];
    out.push(`${list(roster)}.`);
    const k = change.counts;
    out.push(
      `Among members on both rosters, ${count(k.gained, 'tie was', 'ties were')} gained and ${num(k.lost)} lost; ${num(k.strengthened)} strengthened and ${num(k.weakened)} weakened by two points or more.` +
        (k.notComparable > 0
          ? ` ${count(k.notComparable, 'tie', 'ties')} could not be compared, because one wave has no rating for ${k.notComparable === 1 ? 'it' : 'them'}.`
          : ''),
    );
    if (left.length + joined.length > 0)
      out.push(
        `Ties of members who left (${num(change.leftTies)} in ${wave(b.wave)}) and of members who joined (${num(change.joinedTies)} in ${wave(a.wave)}) are not counted as lost or gained.`,
      );
    out.push(
      `Density ${moved(b.density, a.density)} ${a.density === b.density ? `at ${percent(a.density)}` : `from ${percent(b.density)} to ${percent(a.density)}`}.`,
    );
    return out;
  },

  /** What was seen, for one observation. */
  saw(o: ChangeObservation, change: WaveChange, name: NameOf): string {
    const b = Wave(change.before.wave);
    switch (o.kind) {
      case 'groupPair':
        return groupPairSentence(change, o.from, o.to, o.before, o.after);
      case 'ei':
        return `The E-I index of ties within and between groups moved from ${signed(o.before)} in ${wave(change.before.wave)} to ${signed(o.after)} in ${wave(change.after.wave)}: ties between groups make up ${o.after > o.before ? 'a larger' : 'a smaller'} share of all ties.`;
      case 'load':
        return `The 10 % of members who receive most ties held ${percent(o.before)} of incoming ties in ${wave(change.before.wave)} and ${percent(o.after)} in ${wave(change.after.wave)}.`;
      case 'bridges':
        return `${count(o.gained, 'bridge tie is', 'bridge ties are')} new and ${num(o.lost)} ${o.lost === 1 ? 'is' : 'are'} gone, among members on both rosters.`;
      case 'cutPoint':
        if (o.wave === 'before')
          return o.onRoster
            ? `In ${b.toLowerCase()}, ${name(o.member)} was the only link between some members and the rest of the network; in ${wave(change.after.wave)} they are not.`
            : `In ${b.toLowerCase()}, ${name(o.member)} was the only link between some members and the rest of the network, and is not on the ${wave(change.after.wave)} roster.`;
        return `In ${wave(change.after.wave)}, ${name(o.member)} is the only link between some members and the rest of the network.`;
    }
  },

  /** The question an observation raises. */
  question(o: ChangeObservation, change: WaveChange, name: NameOf): string {
    switch (o.kind) {
      case 'groupPair': {
        const directed = change.view === 'directed';
        const up = o.after.density > o.before.density;
        if (o.from === o.to)
          return `What lies behind the change in how members of ${o.from} work with each other?`;
        if (directed)
          return up
            ? `What brought ${o.from} closer to ${o.to} between the waves?`
            : `What lies behind fewer ties from ${o.from} to ${o.to}?`;
        return up
          ? `What brought ${o.from} and ${o.to} closer between the waves?`
          : `What lies behind fewer ties between ${o.from} and ${o.to}?`;
      }
      case 'ei':
        return o.after > o.before
          ? 'What has led groups to work more with each other?'
          : 'What has led groups to work more within themselves?';
      case 'load':
        return o.after > o.before
          ? 'Incoming ties now rest on fewer members. How is the demand on them shared?'
          : 'Incoming ties are now spread over more members. What changed in where people go?';
      case 'bridges':
        return 'Which routes between parts of the network have formed or closed, and what changed around them?';
      case 'cutPoint':
        if (o.wave === 'before')
          return o.onRoster
            ? 'What other routes have formed around this member?'
            : `How do the members ${name(o.member)} linked reach the rest of the network now?`;
        return 'How did this route form, and what would happen if it were not there?';
    }
  },

  /** The personal network card's section (build plan session 9). */
  card: {
    heading: (b: number) => `Since ${wave(b)}`,
    noChange: (b: number) =>
      `This member was not on the ${wave(b)} roster, so there is nothing to compare.`,
    received: (b: number, a: number, wb: number, wa: number) =>
      `Ties received: ${num(b)} in ${wave(wb)}, ${num(a)} in ${wave(wa)}.`,
    given: (b: number, a: number, wb: number, wa: number) =>
      `Ties given: ${num(b)} in ${wave(wb)}, ${num(a)} in ${wave(wa)}.`,
    ties: (k: Record<TieChangeKind, number>) =>
      `With colleagues on both rosters: ${num(k.gained)} ${k.gained === 1 ? 'tie' : 'ties'} gained, ${num(k.lost)} lost, ${num(k.strengthened)} strengthened and ${num(k.weakened)} weakened.`,
    note: 'Counts of ratings only; who gave which rating is not shown.',
  },

  /** The report's and presentation's change section. */
  report: {
    heading: (b: number, a: number) => `What changed between ${wave(b)} and ${wave(a)}`,
    layer: (layer: string, view: string) => `On ${layer}, ${view}.`,
    points: 'Change in share of possible ties, points',
  },

  csv: {
    columns: [
      'Section',
      'Measure',
      'Group',
      'Other group',
      'Member',
      'Other member',
      'Before',
      'After',
      'Change',
    ],
    network: 'Network',
    groups: 'Groups',
    tie: 'Tie',
    member: 'Member',
    measures: {
      members: 'Members on the roster',
      coverage: 'Coverage',
      ties: 'Ties',
      density: 'Density',
      ei: 'E-I index',
      load: 'Top 10 % share of incoming ties',
      bridges: 'Bridge ties',
      cutPoints: 'Cut points',
      left: 'Members who left',
      joined: 'Members who joined',
      leftTies: 'Ties of members who left',
      joinedTies: 'Ties of members who joined',
      groupTies: 'Ties',
      groupDensity: 'Share of possible ties',
      tieWeight: 'Tie weight',
      received: 'Ties received',
      given: 'Ties given',
      reportable: 'Change described (coverage at or above the threshold in both waves)',
      waves: 'Waves compared',
      layer: 'Layer',
      view: 'Direction',
    },
    yes: 'Yes',
    no: 'No',
  },
};
