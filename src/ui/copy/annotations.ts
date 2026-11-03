// Wording for notes on the map (build plan session 17). Sentence case, plain.

import { ANNOTATION_MAX, ANNOTATION_MAX_TEXT, type AnnotationSide } from '../../data/schema';

export const annotationsCopy = {
  heading: 'Notes on the map',
  intro: `A note is a short text on the map, beside a member or at a point you click. Notes are saved with a view when you save or update it, and appear wherever the view does: presentation, slides, the report and every map export. At most ${String(ANNOTATION_MAX)} notes of ${String(ANNOTATION_MAX_TEXT)} characters each.`,
  text: 'Text of the note',
  anchor: 'Attach to',
  point: 'A point I click on the map',
  side: 'Text sits',
  sides: {
    aboveRight: 'Above, to the right',
    aboveLeft: 'Above, to the left',
    belowRight: 'Below, to the right',
    belowLeft: 'Below, to the left',
  } satisfies Record<AnnotationSide, string>,
  add: 'Add note',
  place: 'Place note on the map',
  added: 'Note added to the map',
  placing:
    'Click a member or a point on the map to place the note. Escape or "Cancel placing the note" stops.',
  cancelPlacing: 'Cancel placing the note',
  placingCancelled: 'Note not placed',
  textRequired: 'Enter the text of the note.',
  tooLong: (n: number) =>
    `Shorten the note to ${String(ANNOTATION_MAX_TEXT)} characters (now ${String(n)}).`,
  full: `This map has ${String(ANNOTATION_MAX)} notes, the most it can hold. Remove one to add another.`,
  list: 'Notes on this map',
  none: 'No notes on this map.',
  onMember: (name: string) => `Beside ${name}`,
  atPoint: 'At a point on the map',
  hiddenMember: (name: string) => `Beside ${name}, who is not shown on the map now`,
  remove: 'Remove',
  removeLabel: (text: string) => `Remove the note "${text}"`,
  removed: 'Note removed',
  removeAll: 'Remove every note',
  allRemoved: 'Every note removed from the map',
  edit: (k: number) => `Note ${String(k)}`,
  hidden:
    'Names are hidden, so notes are shown with names replaced and cannot be edited. Show names to edit them.',
  saveHint: 'Save or update a view to keep these notes with it.',
  legend: 'Notes are the analyst’s, not figures from the data.',
};
