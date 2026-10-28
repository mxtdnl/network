// Wording for audience levels and the personal network card (build plan
// session 9). Sentence case, plain (spec §12); descriptions never evaluate
// anyone (spec §2).

import type { AudienceLevel } from '../../data/schema';

const count = (n: number) => n.toLocaleString('en-GB');
const plural = (n: number, one: string, many: string) =>
  n === 1 ? `1 ${one}` : `${count(n)} ${many}`;

export const audienceCopy = {
  label: 'Prepared for',
  levels: {
    analyst: 'Analyst (no restriction)',
    board: 'Board',
    leadership: 'Leadership team',
    workshop: 'Team workshop',
    oneToOne: 'One-to-one',
  } satisfies Record<AudienceLevel, string>,
  help: {
    analyst: 'Everything the workspace shows, under Hide names and the signed-layer setting.',
    board: (min: number) =>
      `Groups and the whole network only. No member is shown, and groups of fewer than ${count(min)} members are pooled or left out.`,
    leadership: (min: number) =>
      `As for a board, plus roles between groups. A member is named in a role only if they agreed; otherwise “A member of” their group (groups of ${count(min)} or more).`,
    workshop:
      'One team’s own network. Names only if the team agreed in advance, otherwise codes. Members of other teams are never shown, and signed layers are not drawn.',
    oneToOne:
      'One member’s own network card: their ties by group, given against received, the colleagues they rated, and where they sit in the network. No one else’s ratings.',
  },
  team: 'Team',
  member: 'Member',
  teamNamed: (team: string) => `${team} agreed to be named`,
  teamNamedHelp: 'Without this, the workshop shows members as codes.',
  minGroupSize: 'Smallest group shown',
  minGroupSizeHelp: (floor: number) =>
    `Board and leadership outputs pool or leave out smaller groups. At least ${count(floor)}.`,
  rolesHeading: 'Members in roles between groups',
  rolesHelp: 'Tick the members who agreed to be named in leadership outputs.',
  noRoles: 'No member holds a role between groups in this analysis.',
  roleNamed: (who: string) => `${who} agreed to be named`,
  /** Stands for a member an output may not show, in names and free text. */
  colleague: 'a colleague',
  aMember: 'A member',
  memberOf: (group: string) => `A member of ${group}`,
  /** Several members in one role: "Two members of Operations", from "A member of Operations". */
  membersOf: (n: number, one: string) =>
    `${n <= 10 ? (['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][n - 2] ?? count(n)) : count(n)} members${one.replace(/^A member/, '')}`,
  otherGroups: (members: number) => `Other groups (${plural(members, 'member', 'members')})`,
  pooled: (groups: number, members: number, min: number) =>
    `${plural(groups, 'group', 'groups')} of fewer than ${count(min)} members ${groups === 1 ? 'is' : 'are'} pooled as Other groups (${plural(members, 'member', 'members')}).`,
  leftOut: (groups: number, members: number, min: number) =>
    `${plural(groups, 'group', 'groups')} of fewer than ${count(min)} members ${groups === 1 ? 'is' : 'are'} not shown (${plural(members, 'member', 'members')}); together they are still fewer than ${count(min)}.`,
  notOffered: (level: AudienceLevel) =>
    `Not offered for ${audienceLevelName(level)}: this output shows members.`,
  suppressed: (n: number, min: number) =>
    `${plural(n, 'observation is', 'observations are')} not shown: ${n === 1 ? 'it concerns' : 'they concern'} a group of fewer than ${count(min)} members, or individual members.`,
  memberRulesLeftOut:
    'Rules about individual members (potential brokers, peripheral members, possible overload, negative clusters) are not part of outputs for this audience.',
  roles: {
    gateway: (who: string, group: string, layer: string, n = 1) =>
      `${who} ${n === 1 ? 'holds' : 'hold'} ties between ${group} and other groups, on ${layer}.`,
    cutPoint: (who: string, n: number, layer: string) =>
      `${who} is the only link to the rest of the network for ${plural(n, 'colleague', 'colleagues')}, on ${layer}.`,
    broker: (who: string, layer: string, n = 1) =>
      `${who} ${n === 1 ? 'lies' : 'lie'} on many of the shortest routes between colleagues, on ${layer}.`,
  },
  workshop: {
    title: (team: string) => `${team}: the team’s own network`,
    outside: 'Ties with other groups',
    outsideHelp: 'Counted both ways, by group; members of other groups are not shown.',
    outsideRow: (group: string, n: number) => `${group}: ${plural(n, 'tie', 'ties')}`,
    noOutside: 'No ties with other groups.',
    codes: 'Members are shown as codes: the team has not agreed to be named.',
    named: 'Members are named: the team agreed in advance.',
    signed: 'Signed layers (valence, energy) are not drawn in a team workshop.',
    teamTies: 'The team’s ties',
    teamTiesRows: {
      size: 'Members',
      internal: 'Ties within the team',
      internalDensity: 'Share of possible ties within the team',
      external: 'Ties with other members',
      externalDensity: 'Share of possible ties with other members',
      ei: 'E-I index',
    },
  },
  board: {
    title: (attribute: string) => `Ties within and between groups, by ${attribute.toLowerCase()}`,
    key: {
      area: 'Circle area: members in the group',
      width: (max: string) => `Line width: share of possible ties between two groups, up to ${max}`,
      layer: (layer: string) => `Ties from ${layer}`,
      noLines: 'No ties between groups.',
    },
    pairs: 'Ties between groups',
    pairsTable: {
      from: 'Group',
      to: 'Other group',
      ties: 'Ties',
      possible: 'Possible',
      share: 'Share',
    },
    groupsTable: {
      group: 'Group',
      members: 'Members',
      inside: 'Ties inside',
      leaving: 'Ties leaving',
      ei: 'E-I index',
    },
  },
  presentation: {
    level: 'Prepared for',
    noViews: 'Save a view first; a one-to-one needs none.',
  },
  card: {
    title: 'Personal network card',
    subtitle: (layer: string) => `Ties from ${layer}`,
    noRatings:
      'This member gave no ratings, so ties they gave are not known and their position rests on colleagues’ ratings.',
    byGroup: 'Ties by group',
    byGroupHelp: (layer: string, min: number) =>
      `On ${layer}. Ties received are counted by group only; groups of fewer than ${count(min)} members are pooled, or left out of the rows when still fewer.`,
    byGroupColumns: {
      group: 'Group',
      colleagues: 'Colleagues',
      gave: 'Ties given',
      received: 'Ties received',
    },
    ownGroup: (group: string) => `${group} (own group)`,
    allColleagues: 'All colleagues',
    layers: 'Given and received, by layer',
    layersHelp:
      'A tie is a rating above the lowest point of the scale. Returned: ties given that the colleague also gave back.',
    layersColumns: {
      layer: 'Layer',
      gave: 'Given',
      received: 'Received',
      returned: 'Returned',
    },
    rated: 'Colleagues this member rated',
    ratedHelp: 'Their own ratings, as given. Ratings others gave this member are not shown.',
    ratedNone: 'This member rated no one.',
    colleague: 'Colleague',
    notRated: '–',
    notApplicable: 'n/a',
    position: 'Position in the network',
    positionHelp: (layer: string) =>
      `On ${layer}, compared with colleagues. These describe where the member sits; they do not assess anyone.`,
    noPosition: 'No measure is defined for this member on this layer.',
  },
  exports: {
    card: 'Export network card',
    cardHelp: 'A PDF of the member’s card, for a one-to-one conversation.',
    cardExported: (file: string) => `Network card exported: ${file}`,
    cardFailed: (reason: string) => `The network card could not be exported. ${reason}`,
    levelNote: (level: AudienceLevel, min: number) => audienceLevelNote(level, min),
  },
  cover: (level: AudienceLevel, min: number) =>
    `Prepared for: ${audienceLevelName(level)}. ${audienceLevelNote(level, min)}`,
};

export function audienceLevelName(level: AudienceLevel): string {
  return {
    analyst: 'the analyst',
    board: 'a board',
    leadership: 'a leadership team',
    workshop: 'a team workshop',
    oneToOne: 'a one-to-one',
  }[level];
}

function audienceLevelNote(level: AudienceLevel, min: number): string {
  switch (level) {
    case 'analyst':
      return 'No audience restriction.';
    case 'board':
      return `Groups and the whole network only; no member is shown, and groups of fewer than ${count(min)} members are pooled or left out.`;
    case 'leadership':
      return `Groups and the whole network, and roles between groups; members are named only where they agreed. Groups of fewer than ${count(min)} members are pooled or left out.`;
    case 'workshop':
      return 'One team’s own network; members of other teams are not shown.';
    case 'oneToOne':
      return 'One member’s own network card.';
  }
}
