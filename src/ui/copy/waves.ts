// Wording for waves (build plan session 14): the wave setting, its labels in
// the top bar, legends, presentation and exports, repeating a survey, and the
// rosters of each wave.

const n = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

export const wavesCopy = {
  label: 'Wave',
  option: (wave: number, latest: boolean) =>
    latest ? `Wave ${String(wave)} (latest with ratings)` : `Wave ${String(wave)}`,
  help: 'Every result shows one wave: its ratings, for the members on its roster.',
  /** The top bar and presentation. */
  short: (wave: number, count: number) => `Wave ${String(wave)} of ${String(count)}`,
  /** Presentation mode: the step counter, then the wave. */
  counter: (counter: string, wave: number, count: number) =>
    `${counter}, wave ${String(wave)} of ${String(count)}`,
  /** The legend's first note, carried into PNG, SVG and PDF. */
  legend: (wave: number, roster: number) =>
    `Wave ${String(wave)}: ratings collected in this wave, ${n(roster, 'member', 'members')} on its roster`,
  /** The report's cover and the network CSV. */
  cover: (wave: number, count: number, roster: number) =>
    `Wave ${String(wave)} of ${String(count)}, ${n(roster, 'member', 'members')} on its roster.`,
  measure: 'Wave',
  fileSuffix: (wave: number) => `-wave-${String(wave)}`,

  // "Check the data": coverage per wave.
  byWave: {
    heading: 'Coverage by wave',
    intro: 'Each wave is counted on its own roster. The wave analysed is marked.',
    wave: 'Wave',
    waveName: (wave: number) => `Wave ${String(wave)}`,
    roster: 'On the roster',
    changes: 'Since the wave before',
    changeText: (joined: number, left: number, first: boolean) =>
      first
        ? 'First wave'
        : joined === 0 && left === 0
          ? 'Same roster'
          : [joined > 0 ? `${String(joined)} joined` : '', left > 0 ? `${String(left)} left` : '']
              .filter((x) => x !== '')
              .join(', '),
    coverage: 'Coverage',
    noRatings: 'No ratings yet',
    analysed: '(analysed)',
    caption: 'Coverage by wave',
  },

  // The Members tab: who is on each wave's roster.
  members: {
    heading: 'Rosters by wave',
    help: 'Tick who was on each wave’s roster. Coverage and the analysis of a wave count only its roster, so someone who joined after a wave, or left before it, is not counted as not answering. Taking someone off a roster keeps their ratings in the file; it only leaves them out of that wave. Removing a member from the project deletes their ratings in every wave.',
    column: (wave: number) => `Wave ${String(wave)}`,
    onRoster: (name: string, wave: number) => `${name} on the wave ${String(wave)} roster`,
    count: (wave: number, roster: number) =>
      `Wave ${String(wave)}: ${n(roster, 'member', 'members')}`,
    added: (count: number, wave: number) =>
      `${n(count, 'person added', 'people added')} to the project and to the wave ${String(wave)} roster.`,
    changed: (name: string, wave: number, on: boolean) =>
      on
        ? `${name} added to the wave ${String(wave)} roster.`
        : `${name} taken off the wave ${String(wave)} roster.`,
  },

  // The survey dashboard.
  dashboard: {
    heading: 'Waves',
    wave: (wave: number) => `Wave ${String(wave)}`,
    intro: 'Each wave is a survey of its own, with its own links. Choose one to see its responses.',
    caption: 'Surveys by wave',
    waveColumn: 'Wave',
    survey: 'Survey',
    status: 'Status',
    responses: 'Responses',
    show: (wave: number) => `Show wave ${String(wave)}`,
    current: 'Shown',
    chooser: (wave: number, title: string) => `Wave ${String(wave)}: ${title}`,
    repeat: 'Repeat this survey',
    repeatHelp:
      'Runs the same questions again as a new wave, with new links. Use it to see how the network changes over time.',
  },

  // The "Repeat this survey" dialog.
  repeat: {
    title: (wave: number) => `Repeat this survey as wave ${String(wave)}`,
    intro: (wave: number) =>
      `A new survey for wave ${String(wave)}, with the same questions, texts and settings, and a new link for each person. Earlier links stay valid and answer their own wave.`,
    key: 'It uses the same key and passphrase as the survey it repeats, so you need no new key backup.',
    roster: 'Who is on the new wave’s roster',
    rosterHelp:
      'Everyone in the project now is ticked. Untick anyone who has left: they keep their place, and their ratings, in earlier waves. People who joined since are on the new wave only.',
    count: (chosen: number, all: number) => `${String(chosen)} of ${String(all)} people ticked`,
    tickAll: 'Tick all',
    joined: 'Joined since the last wave',
    deadline: 'Set a deadline for the new wave in its settings, under Edit survey.',
    confirm: 'Create wave',
    cancel: 'Cancel',
    tooFew: 'Tick at least two people.',
    created: (wave: number, count: number) =>
      `Wave ${String(wave)} created, with ${n(count, 'link', 'links')} to send. The analysis shows it once its first responses are imported.`,
  },
} as const;
