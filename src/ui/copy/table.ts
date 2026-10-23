// Wording for the metrics table and the rank-stability bootstrap (spec §6, §8).

const num = (value: number) => value.toLocaleString('en-GB');
const count = (value: number, one: string, many: string) =>
  `${num(value)} ${value === 1 ? one : many}`;

export const tableCopy = {
  modeLabel: 'Show',
  modes: { metrics: 'Metrics', incoming: 'Incoming ties' },
  caption: (layer: string, n: number) =>
    `Network position of ${count(n, 'member', 'members')}, from ${layer}`,
  layer: 'Ties from',
  member: 'Member',
  community: 'Community',
  inGroup: 'Subgroup',
  addToGroup: (name: string) => `${name} in the subgroup`,
  select: (name: string) => `Show ${name}`,
  selected: 'selected',
  sortBy: (label: string) => `Sort by ${label}`,
  notDefined: 'Not defined',
  export: 'Export table',
  exported: (file: string) => `Table exported as ${file}.`,
  exportHelp: 'A CSV file of the rows and columns shown, in this order, with values unrounded.',
  rankRange: 'Rank range',
  rankRangeLong: (metric: string) => `${metric}: rank range, 95 %`,
  noRows: 'No members match the filters. Remove a filter to show members again.',

  stability: {
    heading: 'Rank stability',
    help: (replicates: number, share: string) =>
      `Recalculates a metric ${num(replicates)} times, each time leaving out a random ${share} of members, and shows the range each member’s rank falls in (95 %). Wide ranges mean a ranking should not be read precisely.`,
    metric: 'Metric',
    run: 'Run resampling',
    cancel: 'Cancel',
    progress: 'Resampling progress',
    running: (done: string) => `Resampling… ${done} done.`,
    ready: (metric: string, replicates: number) =>
      `Rank ranges for ${metric} from ${count(replicates, 'resample', 'resamples')}.`,
    cancelled: 'Resampling cancelled. Run it again to see rank ranges.',
    failed: (reason: string) => `Resampling could not run. ${reason}`,
  },

  incoming: {
    layer: 'Layer',
    caption: (layer: string, n: number) =>
      `Ties received on ${layer} by ${count(n, 'member', 'members')}, most first`,
    rank: 'Rank',
    member: 'Member',
    ties: 'Ties received',
    share: 'Share of all ties received',
    bar: 'Bar',
    top: 'top 10 %',
    summary: (top: number, share: string, received: number, even: string) =>
      `Across all members, the ${count(top, 'member', 'members')} who receive the most ties (10 % of members) receive ${share} of the ${num(received)} ties, against ${even} if ties were spread evenly.`,
    none: 'No member receives a tie on this layer.',
    help: 'Counted from the directed ratings in either view: how many colleagues name each member. A long bar shows where requests or reliance gather, not how well anyone works. Filters and the ego view choose the members listed; shares are of every tie received.',
  },
};
