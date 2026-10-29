// Wording for building the roster in Graticule (CLAUDE.md D124).

const count = (value: number, one: string, many: string) =>
  `${value.toLocaleString('en-GB')} ${value === 1 ? one : many}`;

export const membersCopy = {
  tab: 'Members',
  heading: 'Members',
  intro:
    'Build the list of people the project is about: add them here, then run a survey, enter ratings in the matrix or import a ties file. Changes are saved in the project and recalculated straight away.',
  noProject: {
    heading: 'Start a project',
    body: 'Create an empty project, then add the people it is about. You can also import a members file, or open a project you saved.',
    create: 'Create a project',
  },
  defaultTitle: 'Untitled project',
  created: 'New project created. Add the people it is about.',
  title: 'Project title',
  titleHelp: 'Shown in the top bar, in file names and on the report cover.',

  add: {
    heading: 'Add people',
    label: 'Names, one per line',
    help: 'Paste a column from a spreadsheet or type names. Each person gets an id (m001, m002, …) that stays fixed, because ratings and surveys refer to it.',
    action: 'Add people',
    empty: 'Enter at least one name.',
    added: (n: number) => `${count(n, 'person', 'people')} added.`,
  },

  list: {
    heading: (n: number) => `People (${n.toLocaleString('en-GB')})`,
    empty: 'Nobody has been added yet.',
    caption:
      'Each change is saved when you leave the field. Leave an attribute blank if it is not recorded.',
    id: 'Id',
    name: 'Name',
    nameOf: (name: string) => `Name of ${name}`,
    attributeOf: (attribute: string, name: string) => `${attribute} of ${name}`,
    actions: 'Actions',
    remove: 'Remove',
    removeLabel: (name: string) => `Remove ${name}`,
    managerHelp:
      'Formal manager: type or choose a name from the list. Only people on this list can be chosen.',
    unknownManager: (value: string) =>
      `“${value}” is not a member of the project, or more than one member has that name. Choose a name from the list.`,
    nameRequired: 'A name cannot be empty. The previous name was kept.',
    hidden:
      'Names are hidden, so names, ids and email addresses cannot be seen or edited here. Turn off Hide names to edit them.',
    updated: (name: string) => `Updated ${name}.`,
  },

  remove: {
    title: (name: string) => `Remove ${name}?`,
    body: (ratings: number, reports: number, surveys: string[]) =>
      [
        ratings > 0
          ? `This removes them and the ${count(ratings, 'rating', 'ratings')} they gave or received.`
          : 'This removes them from the project.',
        reports > 0
          ? `${count(reports, 'person', 'people')} will no longer have a formal manager recorded.`
          : '',
        surveys.length > 0
          ? `They are on the roster of ${surveys.map((s) => `“${s}”`).join(', ')}: their responses can no longer be imported, and ratings of them in other responses will be listed as dropped.`
          : '',
        'This cannot be undone, except by opening a saved copy of the project.',
      ]
        .filter((s) => s !== '')
        .join(' '),
    confirm: 'Remove',
    cancel: 'Cancel',
    removed: (name: string) => `Removed ${name}.`,
  },

  attributes: {
    heading: 'Columns',
    help: 'Rename a column, or add one for another attribute. A column’s import key stays the same when it is renamed, so a members file with that column still matches.',
    label: (key: string) => `Label for ${key}`,
    key: (key: string) => `Import key: ${key}`,
    addLabel: 'New column',
    addType: 'Kind',
    types: {
      categorical: 'Category, such as a site or a project',
      ordinal: 'Ordered category, such as a grade',
      email: 'Email address, for survey links only',
    },
    emailNote:
      'Email addresses are used only to send survey links. They are never analysed, shown in analysis views or exported with the analysis.',
    addAction: 'Add column',
    fromSurvey:
      'From survey responses: filled from respondents’ own answers, given with their consent.',
    emptyLabel: 'Enter a label for the column.',
    emailExists: 'The project already has an email column.',
    added: (label: string) => `Column added: ${label}.`,
    renamed: (label: string) => `Column renamed: ${label}.`,
  },

  next: {
    heading: 'Next',
    body: 'With two or more people on the list you can set up a survey, or enter ratings yourself in the matrix.',
    survey: 'Set up a survey',
    matrix: 'Enter ratings',
  },
};
