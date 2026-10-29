// Questions about the respondent's own situation and the boundary question
// (build plan session 12, CLAUDE.md D179–D181). The wording here is survey
// data, read by respondents and stored as attribute values, so it lives with
// the survey core rather than in ui/copy (as the question bank's does in
// data/questionBank.ts). Pure.

import type {
  AttributeDefinition,
  AttributeKey,
  BoundaryBand,
  ContextItemId,
  Project,
  Survey,
  SurveyContextQuestion,
} from '../data/schema';

export interface ContextOption {
  /** Sent in the response; for the analyst's own answers, the answer itself. */
  key: string;
  /** Read by the respondent and stored as the attribute's value. */
  label: string;
}

export interface ContextItem {
  id: ContextItemId;
  /** The attribute's label. */
  label: string;
  question: string;
  type: 'ordinal' | 'categorical';
  /** Fixed answers; absent where the analyst gives them (main site). */
  options?: ContextOption[];
}

export const CONTEXT_ITEMS: readonly ContextItem[] = [
  {
    id: 'time_in_role',
    label: 'Time in role',
    question: 'How long have you been in your current role?',
    type: 'ordinal',
    options: [
      { key: 'under_1', label: 'Less than 1 year' },
      { key: '1_3', label: '1 to 3 years' },
      { key: '3_5', label: '3 to 5 years' },
      { key: 'over_5', label: 'More than 5 years' },
    ],
  },
  {
    id: 'working_pattern',
    label: 'Working pattern',
    question: 'Where do you usually work?',
    type: 'categorical',
    options: [
      { key: 'on_site', label: 'Mostly on site' },
      { key: 'hybrid', label: 'Partly on site, partly remote' },
      { key: 'remote', label: 'Mostly remote' },
    ],
  },
  {
    id: 'working_hours',
    label: 'Working hours',
    question: 'What are your usual working hours?',
    type: 'categorical',
    options: [
      { key: 'full_time', label: 'Full time' },
      { key: 'part_time', label: 'Part time' },
    ],
  },
  {
    id: 'main_site',
    label: 'Main site',
    question: 'Which site do you mainly work at?',
    type: 'categorical',
  },
];

export const ELSEWHERE: ContextOption = { key: 'elsewhere', label: 'Somewhere else' };
export const SITE_OPTIONS = { min: 2, max: 8 } as const;

export const contextItem = (id: ContextItemId): ContextItem => {
  const item = CONTEXT_ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`Unknown context question ${id}.`);
  return item;
};

/** Every answer a question offers, in order (without "Prefer not to say"). */
export function contextOptions(q: { id: ContextItemId; options?: string[] }): ContextOption[] {
  const item = contextItem(q.id);
  if (item.options) return item.options;
  return [...(q.options ?? []).map((o) => ({ key: o, label: o })), ELSEWHERE];
}

/** The attribute value an answer stores; null for "Prefer not to say" or an unknown key. */
export function contextValue(
  q: { id: ContextItemId; options?: string[] },
  key: string | null,
): string | null {
  if (key === null) return null;
  return contextOptions(q).find((o) => o.key === key)?.label ?? null;
}

/** The lines of a list the analyst types (sites, boundary groups): trimmed,
 *  blanks and repeats (ignoring case) dropped. */
export function textLines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const v = line.trim();
    if (v !== '' && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

/** Default site answers: the project's recorded locations, when there are enough. */
export function defaultSites(project: Project): string[] {
  const location = project.attribute_definitions.find((a) => a.key === 'location');
  const recorded = location?.categories?.length
    ? location.categories
    : [...new Set(project.members.map((m) => m.attributes.location).filter((v) => v))];
  return (recorded as string[]).slice(0, SITE_OPTIONS.max);
}

// Boundary question

export const BOUNDARY_QUESTION =
  'Roughly how many people outside this list do you rely on to get your work done?';
export const BOUNDARY_BANDS: readonly { key: BoundaryBand; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: '1_2', label: '1 or 2' },
  { key: '3_5', label: '3 to 5' },
  { key: '6_10', label: '6 to 10' },
  { key: 'over_10', label: 'More than 10' },
];
export const BOUNDARY_KEYS = new Set<string>(BOUNDARY_BANDS.map((b) => b.key));
export const DEFAULT_BOUNDARY_FUNCTIONS = [
  'Other parts of the organisation',
  'Customers or clients',
  'Suppliers or partners',
];
export const BOUNDARY_FUNCTIONS = { min: 1, max: 6 } as const;

export const bandLabel = (b: BoundaryBand) => BOUNDARY_BANDS.find((x) => x.key === b)?.label ?? b;

// Attributes

/** A key for a context question's attribute: the item id, made unique in the project. */
function freeKey(project: Project, wanted: string, taken: Set<string>): string {
  const used = new Set([...project.attribute_definitions.map((a) => a.key), ...taken]);
  if (!used.has(wanted)) return wanted;
  for (let n = 2; ; n++) if (!used.has(`${wanted}_${String(n)}`)) return `${wanted}_${String(n)}`;
}

/**
 * The context questions of a draft with their attribute keys: a question an
 * earlier version of the survey asked keeps its attribute; a new one gets the
 * item's id, with `_2`, `_3` added when the project already uses it.
 */
export function assignAttributes(
  project: Project,
  draft: { id: ContextItemId; options?: string[] }[],
  earlier: readonly SurveyContextQuestion[],
): SurveyContextQuestion[] {
  const taken = new Set<string>();
  return draft.map((d) => {
    const before = earlier.find((e) => e.id === d.id);
    const attribute = before?.attribute ?? freeKey(project, d.id, taken);
    taken.add(attribute);
    return { id: d.id, attribute, ...(d.options ? { options: [...d.options] } : {}) };
  });
}

/** Adds, or completes, the attribute definition of every context question a
 *  survey asks in any version; categories are the answers, in order. */
export function withContextAttributes(project: Project, survey: Survey): Project {
  let defs = project.attribute_definitions;
  let changed = false;
  for (const version of survey.versions)
    for (const q of version.context ?? []) {
      const item = contextItem(q.id);
      const answers = contextOptions(q).map((o) => o.label);
      const existing = defs.find((a) => a.key === q.attribute);
      if (!existing) {
        const def: AttributeDefinition = {
          key: q.attribute,
          label: item.label,
          type: item.type,
          categories: answers,
          builtin: false,
          from_survey: survey.id,
        };
        defs = [...defs, def];
        changed = true;
      } else {
        const categories = [...(existing.categories ?? [])];
        for (const a of answers) if (!categories.includes(a)) categories.push(a);
        if (categories.length !== (existing.categories ?? []).length) {
          defs = defs.map((a) => (a.key === q.attribute ? { ...a, categories } : a));
          changed = true;
        }
      }
    }
  if (!changed) return project;
  const keys = new Set(defs.map((a) => a.key));
  return {
    ...project,
    attribute_definitions: defs,
    // Every member carries every attribute; a new one is not recorded yet.
    members: project.members.map((m) => {
      const missing = [...keys].filter((k) => !(k in m.attributes));
      if (missing.length === 0) return m;
      return {
        ...m,
        attributes: { ...m.attributes, ...Object.fromEntries(missing.map((k) => [k, null])) },
      };
    }),
  };
}

/** The attribute keys context questions fill, from any survey in the project. */
export function contextAttributeKeys(project: Project): Set<AttributeKey> {
  return new Set(
    project.attribute_definitions.filter((a) => a.from_survey !== undefined).map((a) => a.key),
  );
}
