// User-facing strings for the app shell. Sentence case, plain language (spec §12).

export const shellCopy = {
  appName: 'Graticule',
  noProject: 'No project open',
  hideNames: 'Hide names',
  present: 'Present',
  help: 'Help',
  loadingSurvey: 'Loading the survey tools…',
  helpMenu: {
    notice: 'Data and consent notice',
    layout: {
      auto: 'Layout: automatic',
      compact: 'Layout: compact',
      full: 'Layout: full',
    },
  },
  // Compact layout (D125): collapsible columns and the detail drawer.
  compact: {
    left: 'Weights and map settings',
    right: 'Member, insights and coverage',
    close: 'Close member, insights and coverage',
  },
  regions: {
    left: 'Layers and filters',
    centre: 'Views',
    right: 'Member, insights and coverage',
  },
  left: {
    heading: 'Layers',
    map: 'Map',
    /** While the Members or Survey tab is open, the left column holds the layers only. */
    elsewhere: 'Weights and map settings are on the Map tab.',
  },
  centreTabs: {
    map: 'Map',
    matrix: 'Matrix',
    table: 'Table',
    groups: 'Groups',
    compare: 'Compare',
    members: 'Members',
    survey: 'Survey',
  },
  rightTabs: {
    member: 'Member',
    insights: 'Insights',
    coverage: 'Coverage',
  },
  empty: {
    heading: 'Run a survey, add members, import data or load the demo',
    body: 'Run a survey: each person answers through their own link and returns an encrypted response to you. Add the people the project is about by hand, then survey them or enter ratings yourself. Or import survey data you already hold, as a members file and a ties file in CSV or XLSX format, or explore Graticule with a fictional team of 40 people.',
    phoneBody:
      'On a phone, open a project saved on this device from the Project menu, or explore Graticule with a fictional team of 40 people. Surveys and imports need a tablet or computer.',
    privacy: 'Files are processed in this browser and are not uploaded anywhere.',
    runSurvey: 'Run a survey',
    addMembers: 'Add members',
    importData: 'Import survey data',
    loadDemo: 'Load demo',
  },
  centreEmpty: {
    matrix: 'The adjacency matrix appears here once you add data.',
    table: 'The metrics table appears here once you add data.',
    compare: 'The side-by-side layer comparison appears here once you add data.',
  },
  phone: {
    readOnly:
      'On a phone the project can be viewed and explored, not changed. Add members, import data, enter ratings, edit layers and views, and run surveys on a tablet or computer.',
    controls: 'Weights and map settings',
  },
  rightEmpty: {
    member: 'Add data, then select a member on the map to see their position in the network.',
    insights:
      'Insights appear here once you add data. Each one is a question for inquiry, shown with the rule that produced it.',
  },
} as const;
