// Wording for the executive summary (build plan session 10, D9). The
// templates turn the headlines drafted in export/summary.ts into a short
// statement, "What we saw", "Why it may matter" and "Questions for
// discussion". They describe patterns between groups and never evaluate
// anyone (spec §2): tests/unit/insightsCopy.test.ts checks every template on
// the demo and the scenario projects against the banned list in CLAUDE.md.
// No template names a member; groups are attribute values, not names.

import { percent } from './data';
import { formatValue } from './map';
import { listWords } from './readouts';
import { signed2, type InsightContext } from './insights';
import type { HeadlineFacts } from '../export/summary';
import type { AudienceLevel } from '../../data/schema';

export interface HeadlineText {
  /** One sentence stating the pattern. */
  title: string;
  saw: string;
  matters: string;
  questions: string[];
}

const lower = (s: string) => (s === '' ? s : s.charAt(0).toLowerCase() + s.slice(1));
const num = (x: number) => formatValue(x);
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const word = (x: number) => WORDS[x] ?? num(x);
const Word = (x: number) => {
  const w = word(x);
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const pair = (a: string, b: string) => (a === b ? `within ${a}` : `between ${a} and ${b}`);
const Pair = (a: string, b: string) => (a === b ? `Within ${a}` : `Between ${a} and ${b}`);

export const summaryCopy = {
  heading: 'Executive summary',
  saw: 'What we saw',
  matters: 'Why it may matter',
  questions: 'Questions for discussion',
  intro: (members: number, groups: number | null, groupLabel: string, layers: number) =>
    `This summary covers ${num(members)} people${groups !== null && groups > 1 ? ` in ${num(groups)} groups by ${lower(groupLabel)}` : ''} and ${num(layers)} kinds of working relationship. It describes patterns in how people say they work together, between groups rather than individuals. It is not an assessment of anyone. Each headline comes from a fixed rule applied to every group alike, and its questions are for discussion with the people involved.`,
  fewer: (k: number) =>
    k === 0
      ? 'None of the rules found a pattern between groups that this summary can report, so it has no headlines. The figures and the method follow.'
      : `The rules found ${word(k)} ${k === 1 ? 'pattern' : 'patterns'} between groups that this summary can report.`,
  flags: {
    heading: 'Not drafted as a headline',
    negativeCluster: (layer: string, size: number, pairs: number) =>
      `On ${layer}, the rules found a group of ${num(size)} members in which ${num(pairs)} pairs rate each other negatively in both directions. It is not drafted as a headline, because it concerns a few people. Add a headline yourself if it belongs in this summary, worded for the audience.`,
  },
  closing:
    'These patterns describe the network as the people in it reported it at one time. They are starting points for conversation with the groups involved, who will know what lies behind them.',
  audience: {
    analyst: 'Prepared for the analyst.',
    board: 'Prepared for a board: groups and the whole network only.',
    leadership: 'Prepared for a leadership team: groups and the whole network only.',
    workshop: (team: string) => `Prepared for a workshop with ${team}: the team’s own network.`,
  },
} as const;

/** The summary's opening line about who it was prepared for. */
export function audienceLine(level: AudienceLevel, team: string | null): string | null {
  if (level === 'workshop') return summaryCopy.audience.workshop(team ?? '');
  if (level === 'board' || level === 'leadership') return summaryCopy.audience[level];
  return null;
}

/** A headline's text, drafted from its facts. */
export function headlineText(f: HeadlineFacts, ctx: InsightContext): HeadlineText {
  const layer = (ref: string) => lower(ctx.layerLabel(ref));
  switch (f.kind) {
    case 'group': {
      const G = f.group;
      const saw: string[] = [];
      const questions: string[] = [];
      const why: string[] = [];
      let title = '';
      if (f.inward) {
        const i = f.inward;
        title = `Most of ${G}’s ties stay within ${G}`;
        saw.push(
          `On ${layer(i.ref)}, ${num(i.internal)} of the ${num(i.internal + i.external)} ties involving ${G}’s ${num(f.size)} members are between members of ${G}, and ${num(i.external)} reach other groups (E-I index ${signed2(i.ei)}, where −1 means every tie stays inside).`,
        );
        if (i.alsoPeripheral > 0)
          saw.push(
            `${Word(i.alsoPeripheral)} of its members receive fewer ties than most colleagues on most kinds of relationship.`,
          );
        why.push(
          'A group whose ties stay inside it can coordinate closely. Information, requests and ideas may also pass slowly between it and the rest of the organisation.',
        );
        questions.push(
          `How does work reach ${G} from the rest of the organisation, and how does it leave?`,
          `Is this the pattern ${G} and the groups it works with would expect, given the work they share?`,
        );
      }
      if (f.gateways) {
        const g = f.gateways;
        const others = listWords(
          g.others.slice(0, 3).map((o) => `${num(o.count)} with ${o.group}`),
        );
        if (!title)
          title = `${G}’s links with other groups run through ${word(g.members)} of its members`;
        saw.push(
          `On ${layer(g.ref)}, ${word(g.members)} of ${G}’s ${num(f.size)} members hold ${g.ties === 2 ? 'both' : `all ${num(g.ties)}`} of its ties with other groups${others ? ` (${others})` : ''}.`,
        );
        why.push(
          `When a group’s links with others run through ${word(g.members)} ${g.members === 1 ? 'person' : 'people'}, those links depend on their time and availability.`,
        );
        questions.push(
          `What would happen to ${G}’s links with other groups if ${g.members === 1 ? 'that person' : 'one of those people'} were away?`,
        );
      }
      if (f.demand) {
        const d = f.demand;
        if (!title) title = `Within ${G}, ${layer(d.ref)} is concentrated on a few members`;
        saw.push(
          `On ${layer(d.ref)}, ${word(d.top)} of ${G}’s ${num(f.size)} members receive ${percent(d.share)} of the ${num(d.received)} ties ${G} receives, against ${percent(d.even)} if they were spread evenly.`,
        );
        why.push(
          'Demand that falls on a few people draws on their time, and others may wait for them.',
        );
        questions.push(`How is this demand shared within ${G}, and what supports it?`);
      }
      return { title: `${title}.`, saw: saw.join(' '), matters: why.join(' '), questions };
    }
    case 'formalOnly':
    case 'informalOnly': {
      const formal = f.kind === 'formalOnly';
      const what = formal ? 'formal collaboration' : 'informal collaboration';
      const other = formal ? 'informal collaboration' : 'formal collaboration';
      const more = f.more.slice(0, 3).map((p) => `${pair(p.a, p.b)} (${percent(p.share)})`);
      const extra = f.more.length - more.length;
      const items =
        extra > 0 ? [...more, `${word(extra)} more ${extra === 1 ? 'pair' : 'pairs'}`] : more;
      const also = items.length > 0 ? ` The rule finds the same pattern ${listWords(items)}.` : '';
      const where = f.a === f.b ? f.a : `${f.a} and ${f.b}`;
      return formal
        ? {
            title: `${Pair(f.a, f.b)}, most formal collaboration has no informal counterpart.`,
            saw: `${Pair(f.a, f.b)}, ${num(f.pairs)} of ${num(f.total)} ${what} ties (${percent(f.share)}) come with no ${other} tie${f.directed ? ', counting each direction' : ''}.${also}`,
            matters:
              'Formal ties carry the work as it is assigned. Without informal ties beside them, questions and exceptions may travel through formal channels, which can take longer.',
            questions: [
              `How do people in ${where} settle questions that fall outside formal processes?`,
              `Does this match how people in ${where} describe working together?`,
            ],
          }
        : {
            title: `${Pair(f.a, f.b)}, much collaboration happens outside the formal structure.`,
            saw: `${Pair(f.a, f.b)}, ${num(f.pairs)} of ${num(f.total)} ${what} ties (${percent(f.share)}) come with no ${other} tie${f.directed ? ', counting each direction' : ''}.${also}`,
            matters:
              'Informal ties often carry advice, coordination and favours that the formal structure does not show. Work that depends on them can be hard to see, and may change when people move.',
            questions: [
              `What work do the informal ties ${pair(f.a, f.b)} carry?`,
              `Is that work recognised in how ${where} ${f.a === f.b ? 'is' : 'are'} organised?`,
            ],
          };
    }
    case 'oneWayNegative': {
      const shown = f.pairs
        .slice(0, 3)
        .map((p) =>
          p.from === p.to
            ? `${num(p.count)} within ${p.from}`
            : `${num(p.count)} from ${p.from} to ${p.to}`,
        );
      return {
        title: `Some negative ratings on ${layer(f.ref)} are not returned.`,
        saw: `${num(f.count)} of ${num(f.negative)} negative ${layer(f.ref)} ratings are not returned negatively${shown.length > 0 ? ` (${listWords(shown)})` : ''}.${f.notRated > 0 ? ` For ${num(f.notRated)} of them, the colleague rated gave no rating in return.` : ''}`,
        matters:
          'When two sides rate a relationship differently, they may experience it differently. Understanding how each side sees it can come before any response.',
        questions: [
          'What might lie behind ratings that differ by direction?',
          'How could the groups involved talk about how they experience working together?',
        ],
      };
    }
    case 'load':
      return {
        title: `Much of the ${layer(f.ref)} across the network falls on a few people.`,
        saw: `On ${layer(f.ref)}, ${word(f.top)} members receive ${percent(f.share)} of all ${num(f.received)} ties, against ${percent(f.even)} if ties were spread evenly.`,
        matters:
          'Demand that falls on a few people draws on their time, and others may wait for them.',
        questions: [
          'How is this demand shared, and what supports the people who receive most of it?',
          'Which of these requests could others answer?',
        ],
      };
    case 'routes': {
      const saw: string[] = [];
      if (f.brokers > 0) {
        const shared = f.shared
          ? f.shared.count === f.brokers
            ? ` ${f.brokers === 2 ? 'Both' : `All ${word(f.brokers)}`} share ${lower(ctx.attributeLabel(f.shared.attribute))} ${f.shared.value}.`
            : ` ${Word(f.shared.count)} of them share ${lower(ctx.attributeLabel(f.shared.attribute))} ${f.shared.value}.`
          : '';
        saw.push(
          `${Word(f.brokers)} ${f.brokers === 1 ? 'member lies' : 'members lie'} on many of the shortest routes between colleagues, while their own contacts are not closely tied to one another.${shared}`,
        );
      }
      if (f.cutOff > 0)
        saw.push(
          `${Word(f.cutOff)} members${f.cutOffGroup ? `, all in ${f.cutOffGroup},` : ''} are linked to the rest of the network only through one colleague.`,
        );
      return {
        title: 'Routes across the network run through a few people.',
        saw: saw.join(' '),
        matters:
          'People on many routes can join up parts of the organisation that would otherwise rarely meet. The routes also depend on their time and availability.',
        questions: [
          'What would happen to these routes if one of these people were away?',
          'Who else could connect these parts of the organisation?',
        ],
      };
    }
    case 'noTies': {
      const label = lower(ctx.attributeLabel(f.attribute));
      const shown = f.none.slice(0, 3).map(([a, b]) => `${a} and ${b}`);
      const extra = f.none.length - shown.length;
      const items =
        extra > 0 ? [...shown, `${word(extra)} other ${extra === 1 ? 'pair' : 'pairs'}`] : shown;
      return {
        title:
          f.none.length === 1
            ? `No tie joins ${shown[0] ?? ''}.`
            : `${Word(f.none.length)} pairs of groups have no tie between them.`,
        saw: `On ${layer(f.ref)}, ${num(f.none.length)} of the ${num(f.pairs)} pairs of groups by ${label} have no tie between them: ${listWords(items)}.`,
        matters:
          'Groups with no tie between them may have no shared work. Where their work does meet, information may pass through other groups or not at all.',
        questions: [
          `Does the work of ${listWords(
            f.none.slice(0, 2).map(([a, b]) => `${a} and ${b}`),
            'or',
          )} meet anywhere?`,
          'If it does, how do these groups find out what the other is doing?',
        ],
      };
    }
    case 'balance': {
      const share = (x: number) => percent(x / f.tied);
      const most =
        f.both >= f.formalOnly && f.both >= f.informalOnly
          ? 'Most working ties are both formal and informal.'
          : f.informalOnly > f.formalOnly
            ? 'Many working ties are informal only.'
            : 'Many working ties are formal only.';
      return {
        title: most,
        saw: `Of the ${num(f.tied)} pairs who work together${f.directed ? ', counting each direction' : ''}, ${share(f.formalOnly)} do so formally only, ${share(f.informalOnly)} informally only and ${share(f.both)} both.`,
        matters:
          'Formal ties show the work as it is assigned; informal ties show how people actually reach one another. Where the two differ, the formal structure may not show how work gets done.',
        questions: [
          'Where does work rely on informal ties that the formal structure does not show?',
          'Where do formal arrangements exist without the informal ties that usually come with them?',
        ],
      };
    }
    case 'teamTies': {
      const total = f.internal + f.external;
      const others = [
        ...f.others.slice(0, 3).map((o) => `${num(o.ties)} with ${o.group}`),
        ...(f.pooled ? [`${num(f.pooled.ties)} with other groups`] : []),
      ];
      return {
        title:
          f.external === 0
            ? `${f.team}’s ties all stay within the team.`
            : `${f.team} has ${num(f.external)} ${f.external === 1 ? 'tie' : 'ties'} with other groups.`,
        saw: `On ${layer(f.ref)}, ${f.team}’s ${num(f.size)} members have ${num(f.internal)} ties with one another and ${num(f.external)} with people in other groups${others.length > 0 ? ` (${listWords(others)})` : ''}${total > 0 ? `; ${percent(f.external / total)} of the team’s ties reach outside it` : ''}.`,
        matters:
          'Ties inside a team help it coordinate; ties outside it bring in information and carry the team’s work to others.',
        questions: [
          `Which groups does ${f.team} most need to work with, and do these ties reflect that?`,
          'What would the team want this picture to look like in a year?',
        ],
      };
    }
    case 'mixing': {
      const total = f.internal + f.external;
      const label = lower(ctx.attributeLabel(f.attribute));
      const inward = f.ei < 0;
      return {
        title: inward
          ? `Most ties are between people in the same ${label}.`
          : `Many ties cross between groups by ${label}.`,
        saw: `On ${layer(f.ref)}, ${percent(f.internal / total)} of ${num(total)} ties join people in the same ${label} and ${percent(f.external / total)} cross between groups; of all possible pairs of people, ${percent(f.possibleBetween)} are in different groups (E-I index ${signed2(f.ei)}).`,
        matters: inward
          ? 'Groups whose ties stay mostly inside them can coordinate closely; work that needs several groups may depend on the few ties between them.'
          : 'Ties across groups can carry information and ideas between parts of the organisation; they also take time to keep up.',
        questions: [
          `Is this the balance between work within and across groups by ${label} that people would expect?`,
          'Where would more contact between groups make a difference to the work?',
        ],
      };
    }
  }
}
