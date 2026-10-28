// Sentences for the readouts (build plan session 8): every number the centre
// column shows about the network, and every member measure in the member
// panel, read out in words a newcomer can use. Built only from the structured
// readouts of ui/state/readouts.ts (D9). Member names come in through the
// `name` function, from the names layer (D79). These sentences describe; they
// never evaluate anyone (spec §2), and they pass the banned-word list in
// CLAUDE.md, "Insight wording" (tests/unit/insightsCopy.test.ts).

import type { MemberReadout, Readout } from '../state/readouts';
import type { SizeMetric } from '../state/store';
import { percent } from './data';
import { formatValue } from './map';

const n = (x: number) => Math.round(x).toLocaleString('en-GB');
const plural = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`;
const lower = (s: string) => (s === '' ? s : s.charAt(0).toLowerCase() + s.slice(1));
/** A count, or a median of counts, which may fall halfway. */
const count = (x: number) =>
  Number.isInteger(x) ? n(x) : x.toLocaleString('en-GB', { maximumFractionDigits: 1 });
const two = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '–');
const signed = (x: number) =>
  Number.isFinite(x) ? `${x < 0 ? '−' : x > 0 ? '+' : ''}${Math.abs(x).toFixed(2)}` : '–';

/** A list in words: "A", "A and B", "A, B and C". */
export function listWords(items: readonly string[], last: 'and' | 'or' = 'and'): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')}${items.length > 2 && last === 'or' ? ',' : ''} ${last} ${items[items.length - 1] as string}`;
}

const NONE_SHOWN = 3;

export function readoutSentence(r: Readout, name: (id: string) => string): string {
  switch (r.kind) {
    case 'density':
      return r.directed
        ? `On ${lower(r.layer)}, ${n(r.ties)} of the ${n(r.possible)} possible ties are present (${percent(r.share)}), counting each direction separately.`
        : `On ${lower(r.layer)}, ${n(r.ties)} of the ${n(r.possible)} possible pairs have a tie (${percent(r.share)}).`;
    case 'reciprocity':
      return r.directed
        ? `${percent(r.share)} of ties are returned: the colleague named also names the member who named them.`
        : `In the ratings as given, ${percent(r.share)} of ties are returned: the colleague named also names the member who named them.`;
    case 'parts': {
      const groups = r.sizes.filter((s) => s > 1);
      const alone = r.sizes.filter((s) => s === 1).length;
      const how = r.directed
        ? 'directly or through others, in either direction'
        : 'directly or through others';
      if (groups.length === 0) return 'No two members are tied.';
      if (groups.length === 1 && alone === 0) return `Everyone is connected, ${how}.`;
      if (groups.length === 1)
        return `Everyone except ${plural(alone, 'member', 'members')} is connected, ${how}; ${alone === 1 ? 'that member has' : 'those members have'} no tie.`;
      return `The network falls into ${n(groups.length)} separate parts of two or more members; the largest holds ${n(groups[0] as number)} of the ${n(r.members)} members.${alone > 0 ? ` ${plural(alone, 'member has', 'members have')} no tie.` : ''}`;
    }
    case 'communities':
      return r.count <= 1
        ? 'No clusters stand out: the clustering method put everyone in one group.'
        : `${n(r.count)} clusters of members tie mostly among themselves (found automatically). Modularity is ${two(r.modularity)}; networks with clear clusters typically score between 0.3 and 0.7.`;
    case 'centralisation':
      return r.directed
        ? `The most-named member is named by ${plural(r.max, 'colleague', 'colleagues')}; the median member by ${count(r.median)}. Centralisation is ${two(r.value)} (0 when everyone is named equally often, 1 when every tie points to the same member).`
        : `The most connected member has ${plural(r.max, 'connection', 'connections')}; the median member has ${count(r.median)}. Centralisation is ${two(r.value)} (0 when everyone has as many connections, 1 when every tie involves the same member).`;
    case 'mixing': {
      const total = r.internal + r.external;
      return `${percent(r.internal / total)} of ties stay within one ${lower(r.attribute)} and ${percent(r.external / total)} cross between them; of all possible pairs, ${percent(r.possibleBetween)} cross. E-I index ${signed(r.ei)} (−1: every tie within, +1: every tie across).`;
    }
    case 'asked':
      return `${r.asked === r.members ? `All ${n(r.members)} members are` : `${n(r.asked)} of the ${n(r.members)} members are`} asked for advice by at least one colleague. The most-asked member is named by ${plural(r.max, 'colleague', 'colleagues')}; the median member by ${count(r.median)}.`;
    case 'groupPairs': {
      const parts: string[] = [];
      if (r.most)
        parts.push(
          `${r.most.a} and ${r.most.b} share the most ties between groups: ${n(r.most.ties)}.`,
        );
      if (r.none.length > 0) {
        const shown = r.none.slice(0, NONE_SHOWN).map(([a, b]) => `${a} and ${b}`);
        const more = r.none.length - shown.length;
        const items = more > 0 ? [...shown, plural(more, 'other pair', 'other pairs')] : shown;
        parts.push(`No tie joins ${listWords(items, 'or')}.`);
      } else parts.push('Every pair of groups shares at least one tie.');
      return parts.join(' ');
    }
    case 'topBroker':
      return r.members.length === 1
        ? `${name(r.members[0] as string)} lies on more of the shortest routes between colleagues than any of their ${n(r.others)} colleagues.`
        : `${listWords(r.members.map(name))} lie on the most shortest routes between colleagues, equally.`;
    case 'load':
      return `The ${plural(r.top, 'member', 'members')} receiving most ${lower(r.layer)} ties (${percent(r.top / r.members)} of members) receive ${percent(r.share)} of all ${n(r.received)}, against ${percent(r.top / r.members)} if ties were spread evenly.`;
    case 'formalInformal': {
      const first = `Of the ${n(r.tied)} working ties, ${percent(r.formalOnly / r.tied)} are formal only, ${percent(r.informalOnly / r.tied)} informal only and ${percent(r.both / r.tied)} both.`;
      if (!r.pair) return first;
      const where =
        r.pair.a === r.pair.b ? `within ${r.pair.a}` : `between ${r.pair.a} and ${r.pair.b}`;
      return `${first} The largest share of informal-only ties is ${where}: ${n(r.pair.informalOnly)} of ${n(r.pair.tied)}.`;
    }
    case 'bridges':
      return r.count === 0
        ? 'Every tie links two members who share at least one contact.'
        : `${plural(r.count, 'tie links', 'ties link')} two members who have no contact in common.`;
    case 'cutPoints':
      if (r.count === 0 || r.member === null)
        return 'No single member holds the network together: nobody would be cut off from the rest if any one member were away.';
      return `${plural(r.cutOff, 'member', 'members')} would be cut off from the rest if ${name(r.member)} were away.${r.count > 1 ? ` ${plural(r.count - 1, 'other member', 'other members')} would also cut someone off if away.` : ''}`;
    case 'negative': {
      if (r.given === 0) return `No negative ${lower(r.layer)} ratings were given.`;
      const first = `${plural(r.given, `negative ${lower(r.layer)} rating was`, `negative ${lower(r.layer)} ratings were`)} given; ${n(r.returned)} of them ${r.returned === 1 ? 'was' : 'were'} rated negatively in return.`;
      if (!r.balance) return first;
      return `${first} Of the ${plural(r.balance.triads, 'trio', 'trios')} of members all tied to one another, ${percent(r.balance.balanced / r.balance.triads)} are balanced: none or two of their three ties are negative (structural balance).`;
    }
  }
}

/** How each member measure reads, more and less of what it describes. */
export const memberPhrases: Record<SizeMetric, { more: string; less: string }> = {
  inStrength: {
    more: 'Receives more tie weight in total',
    less: 'Receives less tie weight in total',
  },
  outStrength: { more: 'Gives more tie weight in total', less: 'Gives less tie weight in total' },
  strength: { more: 'Has more tie weight in total', less: 'Has less tie weight in total' },
  inDegree: { more: 'Is named by more colleagues', less: 'Is named by fewer colleagues' },
  outDegree: { more: 'Names more colleagues', less: 'Names fewer colleagues' },
  degree: { more: 'Has more connections', less: 'Has fewer connections' },
  betweenness: {
    more: 'Lies on more of the shortest routes between colleagues',
    less: 'Lies on fewer of the shortest routes between colleagues',
  },
  harmonicIn: {
    more: 'Is reached in fewer steps by others',
    less: 'Is reached in more steps by others',
  },
  harmonicOut: { more: 'Reaches others in fewer steps', less: 'Reaches others in more steps' },
  harmonic: { more: 'Is fewer steps from others', less: 'Is more steps from others' },
  eigenvector: {
    more: 'Is more tied to well-connected colleagues',
    less: 'Is less tied to well-connected colleagues',
  },
  constraint: {
    more: 'Has a more open network (contacts who are not tied to one another)',
    less: 'Has a more closed network (contacts who are tied to one another)',
  },
  effectiveSize: {
    more: 'Has more contacts who are not tied to one another',
    less: 'Has fewer contacts who are not tied to one another',
  },
  clustering: {
    more: 'Has contacts more tied to one another',
    less: 'Has contacts less tied to one another',
  },
};

/** The sentence beside a member's rank: how their value compares with their colleagues'. */
export function memberSentence(r: MemberReadout): string {
  const phrase = memberPhrases[r.metric];
  const d = r.beyond + r.behind + r.equal;
  const of = (k: number) =>
    r.undefinedOthers > 0
      ? `${n(k)} of the ${n(d)} colleagues it is defined for`
      : `${n(k)} of their ${n(d)} colleagues`;
  const any =
    r.undefinedOthers > 0
      ? `any of the ${n(d)} colleagues it is defined for`
      : `any of their ${n(d)} colleagues`;
  let first: string;
  if (d === 0) first = 'No colleague has a value to compare with.';
  else if (r.beyond === 0 && r.behind === 0)
    first = `The same as all ${n(d)} colleagues with a value.`;
  else if (r.behind === 0 && r.equal === 0) first = `${phrase.more} than ${any}.`;
  else if (r.beyond === 0 && r.equal === 0) first = `${phrase.less} than ${any}.`;
  else if (r.beyond >= r.behind) first = `${phrase.more} than ${of(r.beyond)}.`;
  else first = `${phrase.less} than ${of(r.behind)}.`;
  const equal =
    r.equal > 0 && !(r.beyond === 0 && r.behind === 0)
      ? ` ${plural(r.equal, 'colleague has', 'colleagues have')} the same value.`
      : '';
  const group = r.group
    ? ` Median in ${r.group.value} (${lower(r.group.attribute)}, ${plural(r.group.size, 'member', 'members')}): ${formatValue(r.group.median)}.`
    : '';
  return `${first}${equal}${group}`;
}
