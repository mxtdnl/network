// Wording for the Groups view (D154): ties within and between groups of
// members, by an attribute or by community. Sentence case, plain (spec §12).

/** A share of possible ties as a whole percentage; "<1%" when there are ties but rounding gives 0. */
export function sharePercent(ties: number, possible: number): string {
  if (!(possible > 0)) return 'No tie possible';
  const share = ties / possible;
  const whole = Math.round(share * 100);
  if (ties > 0 && whole === 0) return '<1%';
  if (ties < possible && whole === 100) return '>99%';
  return `${String(whole)}%`;
}

const count = (n: number) => n.toLocaleString('en-GB');
const ties = (n: number) => (n === 1 ? '1 tie' : `${count(n)} ties`);

export const groupsCopy = {
  layer: 'Ties from',
  groupBy: 'Group by',
  attributes: 'Attribute',
  community: 'Community',
  communityName: (n: string) => `Community ${n}`,
  intro: (layer: string, directed: boolean) =>
    `How many of the ties possible within and between groups exist on ${layer}. ` +
    (directed
      ? 'Directed: each direction counts as a tie of its own.'
      : 'Mutual: each pair counts once, both directions combined.') +
    ' Every member and every tie counts, whatever the map’s range and filters.',
  communityNote: (layer: string) =>
    `Communities are detected on ${layer} (method notes §5), so they change with its ties.`,
  excluded: (n: number, attribute: string) =>
    n === 1
      ? `1 member has no ${attribute} recorded and is left out, with their ties.`
      : `${count(n)} members have no ${attribute} recorded and are left out, with their ties.`,
  noGroups: 'No attribute or community to group members by.',
  noCommunities: 'No communities: the layer has no ties.',
  oneGroup:
    'Every member is in the same group, so there are no ties between groups to show. Choose another grouping.',

  matrix: {
    heading: 'Share of possible ties',
    key: 'Matrix key',
    none: 'No ties (0%)',
    impossible: 'No tie possible',
    ramp: 'Fewer to more of the possible ties, 0% to 100%',
    directed: 'Rows give, columns receive',
    symmetrised: 'Each pair once, both directions combined',
    help: 'Arrow keys move between cells. Enter makes the row’s group the subgroup in every view; Shift and Enter makes the subgroup both groups of the cell.',
    gridLabel: (layer: string) => `Share of possible ties within and between groups, on ${layer}`,
    corner: (directed: boolean) => (directed ? 'From, to' : 'Group'),
    readout: (a: string, b: string, t: number, possible: number, directed: boolean) => {
      if (!(possible > 0)) return `Within ${a}: no tie possible, with one member.`;
      const what = `${count(t)} of ${count(possible)} possible ties, ${sharePercent(t, possible)}`;
      if (a === b) return `Within ${a}: ${what}`;
      return directed ? `${a} to ${b}: ${what}` : `${a} and ${b}: ${what}`;
    },
  },

  map: {
    heading: 'Group map',
    label: (layer: string) =>
      `Group map of ${layer}: one circle per group, joined where the groups have ties. The table below lists the same figures.`,
    legend: 'Group map key',
    size: 'Circle area: members',
    width: (low: string, high: string) =>
      low === high
        ? `Line width: share of possible ties between the two groups, ${high}`
        : `Line width: share of possible ties between the two groups, from ${low} (thinnest) to ${high} (thickest)`,
    noLine: 'No line: the two groups have no ties',
    chosen: 'Shaded and ringed: the group chosen as the subgroup',
    pointer: 'Click a circle to make its group the subgroup.',
    caption: 'Ties between each pair of groups, both directions together',
    pair: 'Groups',
    ties: 'Ties',
    possible: 'Possible',
    share: 'Share',
    noLinks: 'No ties between groups.',
  },

  table: {
    heading: 'Groups',
    caption: (attribute: string) => `Ties inside and leaving each group, by ${attribute}`,
    group: 'Group',
    members: 'Members',
    inside: 'Ties inside',
    leaving: 'Ties leaving',
    density: 'Share inside',
    ei: 'E-I index',
    all: 'All groups',
    choose: (group: string) => `Make ${group} the subgroup`,
    chosen: (group: string) => `${group} is the subgroup; press to clear it`,
    note: 'Ties leaving count every tie between the group and another, in either direction. E-I runs from −1 (every tie stays inside the group) to +1 (every tie leaves it); larger groups have more chances of ties inside.',
  },

  status: {
    chosen: (group: string, n: number) =>
      `${group} is the subgroup: ${n === 1 ? '1 member' : `${count(n)} members`}.`,
    pair: (a: string, b: string, n: number) =>
      `${a} and ${b} are the subgroup: ${n === 1 ? '1 member' : `${count(n)} members`}.`,
    cleared: 'Subgroup cleared.',
  },
  ties,
};
