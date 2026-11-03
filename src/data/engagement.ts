// The engagement record (build plan session 16, spec §4.5): the business question, sponsor,
// roster boundary, governance, the client's expectations, the collaboration expected between
// groups, the actions agreed and the outcomes recorded. Pure functions on the project; the
// workspace changes the record through `updateProjectViews`, so nothing is recalculated.

import {
  ACTION_STATUSES,
  AUDIENCE_LEVELS,
  ENGAGEMENT_STEPS,
  EXPECTED_LEVELS,
  type ActionLink,
  type Engagement,
  type EngagementAction,
  type EngagementOutcome,
  type EngagementStep,
  type Expectation,
  type ExpectedLevel,
  type Project,
} from './schema';

/** Suggested criteria for judging outcomes; the analyst edits them with the client. */
export const DEFAULT_CRITERIA: readonly string[] = [
  'Value to managers',
  'Changes to how work is organised',
  'Resources moved to where they are needed',
  'Changes to roles or functions',
  'Support across groups',
];

export function emptyEngagement(step: EngagementStep | 'all' = 'plan'): Engagement {
  return {
    step,
    question: '',
    sponsor: '',
    boundary: '',
    governance: { audiences: {}, retention_date: null },
    expectations: [],
    intent: { layer: null, pairs: [] },
    actions: [],
    criteria: [...DEFAULT_CRITERIA],
    outcomes: [],
    checks: [],
  };
}

/** The project's record, or an empty one on "All tools" when it has none. */
export function engagementOf(project: Project | null): Engagement {
  return project?.engagement ?? emptyEngagement('all');
}

/** The step the workspace shows: 'all' unless the project's record names one. */
export function currentStep(project: Project | null): EngagementStep | 'all' {
  return project?.engagement?.step ?? 'all';
}

/** Applies `fn` to the project's record, creating it (at its current step) if absent. */
export function updateEngagement(project: Project, fn: (e: Engagement) => Engagement): Project {
  const before = project.engagement ?? emptyEngagement('all');
  const after = fn(before);
  if (after === before && project.engagement) return project;
  return { ...project, engagement: after };
}

/** Next id with a prefix (`x1`, `x2`, …), after the highest in use; ids are never reused. */
export function nextId(prefix: string, used: readonly { id: string }[]): string {
  let high = 0;
  for (const { id } of used) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > high) high = n;
  }
  return `${prefix}${String(high + 1)}`;
}

export function addExpectation(e: Engagement, text: string): Engagement {
  const item: Expectation = { id: nextId('e', e.expectations), text, link: null, notes: '' };
  return { ...e, expectations: [...e.expectations, item] };
}

export function patchById<T extends { id: string }>(
  list: readonly T[],
  id: string,
  patch: Partial<T>,
) {
  return list.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

export function addAction(
  e: Engagement,
  action: Partial<Omit<EngagementAction, 'id' | 'created_at'>>,
  now: string,
): Engagement {
  const item: EngagementAction = {
    id: nextId('a', e.actions),
    text: action.text ?? '',
    link: action.link ?? null,
    owner: action.owner ?? '',
    due: action.due ?? null,
    status: action.status ?? 'proposed',
    notes: action.notes ?? '',
    created_at: now,
  };
  return { ...e, actions: [...e.actions, item] };
}

export function addOutcome(e: Engagement, criterion: string, wave: number | null): Engagement {
  const item: EngagementOutcome = {
    id: nextId('o', e.outcomes),
    criterion,
    assessment: '',
    wave,
    date: null,
  };
  return { ...e, outcomes: [...e.outcomes, item] };
}

/** Sets (or, with null, removes) the collaboration expected between two groups. */
export function setExpectedPair(
  e: Engagement,
  attribute: string,
  x: string,
  y: string,
  level: ExpectedLevel | null,
): Engagement {
  const [a, b] = x <= y ? [x, y] : [y, x];
  const rest = e.intent.pairs.filter((p) => !(p.attribute === attribute && p.a === a && p.b === b));
  const pairs = level === null ? rest : [...rest, { attribute, a, b, level }];
  return { ...e, intent: { ...e.intent, pairs } };
}

export function expectedLevel(
  e: Engagement,
  attribute: string,
  x: string,
  y: string,
): ExpectedLevel | null {
  const [a, b] = x <= y ? [x, y] : [y, x];
  return (
    e.intent.pairs.find((p) => p.attribute === attribute && p.a === a && p.b === b)?.level ?? null
  );
}

export function toggleCheck(e: Engagement, id: string, on: boolean): Engagement {
  const has = e.checks.includes(id);
  if (has === on) return e;
  return { ...e, checks: on ? [...e.checks, id] : e.checks.filter((c) => c !== id) };
}

/** Whether the retention date has passed on `today` (YYYY-MM-DD). */
export function retentionPassed(project: Project | null, today: string): boolean {
  const date = project?.engagement?.governance.retention_date;
  return date !== null && date !== undefined && date < today;
}

export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);

// Load checks ------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isDate = (v: unknown) => v === null || (isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonEmpty = (v: unknown) => isStr(v) && v !== '';
const uniqueIds = (list: Obj[]) => new Set(list.map((x) => x.id)).size === list.length;

function isExpectationLink(v: unknown): boolean {
  if (v === null) return true;
  if (!isObj(v)) return false;
  if (v.kind === 'pair') return nonEmpty(v.attribute) && isStr(v.a) && isStr(v.b);
  if (v.kind === 'group') return nonEmpty(v.attribute) && isStr(v.value);
  if (v.kind === 'question') return nonEmpty(v.id);
  return false;
}

function isActionLink(v: unknown): v is ActionLink | null {
  if (v === null) return true;
  if (!isObj(v)) return false;
  if (v.kind === 'observation')
    return (
      nonEmpty(v.key) &&
      isStr(v.text) &&
      isStr(v.rule) &&
      isNum(v.wave) &&
      Number.isInteger(v.wave) &&
      v.wave >= 1
    );
  if (v.kind === 'expectation') return nonEmpty(v.id);
  if (v.kind === 'pair') return nonEmpty(v.attribute) && isStr(v.a) && isStr(v.b);
  return false;
}

/** Problems with the engagement record, each a sentence. Empty when valid. Member ids, groups
 *  and layers no longer in the project are allowed: they simply match nothing. */
export function checkEngagement(v: unknown): string[] {
  const problems: string[] = [];
  const need = (ok: boolean, message: string) => {
    if (!ok) problems.push(message);
  };
  if (!isObj(v)) return ['engagement must be an object.'];
  need(
    v.step === 'all' || (ENGAGEMENT_STEPS as readonly unknown[]).includes(v.step),
    `engagement.step must be all or one of ${ENGAGEMENT_STEPS.join(', ')}.`,
  );
  need(
    isStr(v.question) && isStr(v.sponsor) && isStr(v.boundary),
    'engagement must give a question, a sponsor and a boundary as text.',
  );
  const g = v.governance;
  need(
    isObj(g) &&
      isObj(g.audiences) &&
      Object.entries(g.audiences).every(
        ([level, who]) => (AUDIENCE_LEVELS as readonly string[]).includes(level) && isStr(who),
      ) &&
      isDate(g.retention_date),
    'engagement.governance must give who sees each audience level and a retention date (YYYY-MM-DD or null).',
  );
  const ex = v.expectations;
  need(
    Array.isArray(ex) &&
      ex.every(
        (x: unknown) =>
          isObj(x) &&
          nonEmpty(x.id) &&
          isStr(x.text) &&
          isStr(x.notes) &&
          isExpectationLink(x.link),
      ) &&
      uniqueIds(ex as Obj[]),
    'engagement.expectations must each have a unique id, text, notes and a link to a pair of groups, a group or a question (or none).',
  );
  const intent = v.intent;
  need(
    isObj(intent) &&
      (intent.layer === null || nonEmpty(intent.layer)) &&
      Array.isArray(intent.pairs) &&
      intent.pairs.every(
        (p: unknown) =>
          isObj(p) &&
          nonEmpty(p.attribute) &&
          isStr(p.a) &&
          isStr(p.b) &&
          p.a <= p.b &&
          (EXPECTED_LEVELS as readonly unknown[]).includes(p.level),
      ) &&
      new Set(
        (intent.pairs as Obj[]).map(
          (p) => `${String(p.attribute)}\u0000${String(p.a)}\u0000${String(p.b)}`,
        ),
      ).size === intent.pairs.length,
    `engagement.intent must give a layer (or null) and each pair of groups once, in order, with a level (${EXPECTED_LEVELS.join(', ')}).`,
  );
  const actions = v.actions;
  need(
    Array.isArray(actions) &&
      actions.every(
        (a: unknown) =>
          isObj(a) &&
          nonEmpty(a.id) &&
          isStr(a.text) &&
          isActionLink(a.link) &&
          isStr(a.owner) &&
          isDate(a.due) &&
          (ACTION_STATUSES as readonly unknown[]).includes(a.status) &&
          isStr(a.notes) &&
          isStr(a.created_at),
      ) &&
      uniqueIds(actions as Obj[]),
    `engagement.actions must each have a unique id, text, link, owner, due date, status (${ACTION_STATUSES.join(', ')}), notes and creation time.`,
  );
  need(
    Array.isArray(v.criteria) && v.criteria.every(isStr),
    'engagement.criteria must be a list of text.',
  );
  const outcomes = v.outcomes;
  need(
    Array.isArray(outcomes) &&
      outcomes.every(
        (o: unknown) =>
          isObj(o) &&
          nonEmpty(o.id) &&
          isStr(o.criterion) &&
          isStr(o.assessment) &&
          (o.wave === null || (isNum(o.wave) && Number.isInteger(o.wave) && o.wave >= 1)) &&
          isDate(o.date),
      ) &&
      uniqueIds(outcomes as Obj[]),
    'engagement.outcomes must each have a unique id, criterion, assessment, wave (or null) and date (or null).',
  );
  need(
    Array.isArray(v.checks) && v.checks.every(isStr),
    'engagement.checks must be a list of ids.',
  );
  return problems;
}
