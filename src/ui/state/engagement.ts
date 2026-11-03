// The engagement guide in the workspace (build plan session 16): which step is shown, which tabs
// each step needs, the checklists and what the project already shows done, actions from
// observations, and the input of the assessment against intent. Changes go through
// `updateProjectViews` (no recalculation).

import { useMemo } from 'react';
import {
  addAction,
  expectedLevel,
  currentStep,
  emptyEngagement,
  engagementOf,
  updateEngagement,
} from '../../data/engagement';
import { groupShares, pairCounts, verdictFor, type IntentInput } from '../../data/intent';
import { relationForRole } from '../../data/relations';
import {
  ENGAGEMENT_STEPS,
  type Engagement,
  type EngagementStep,
  type ExpectationLink,
  type Project,
} from '../../data/schema';
import { engagementCopy as E } from '../copy/engagement';
import { mapCopy } from '../copy/map';
import { readoutSentence } from '../copy/readouts';
import { QUESTION_IDS, questionLayer, type QuestionId } from './questions';
import { MEMBER_READOUTS, questionReadouts } from './readouts';
import { waveNumbers } from '../../data/waves';
import type { AnalysisResult, Observation } from '../engineClient';
import { useAppStore, type CentreView, type RightPanel } from './store';

export type Step = EngagementStep | 'all';

/** The tabs each step needs, in the order shown; the rest wait under "Advanced". */
export const STEP_TABS: Record<EngagementStep, { centre: CentreView[]; right: RightPanel[] }> = {
  plan: { centre: ['engagement', 'members'], right: ['coverage'] },
  collect: { centre: ['survey', 'members', 'engagement'], right: ['coverage'] },
  check: { centre: ['map', 'table', 'engagement'], right: ['coverage', 'member'] },
  understand: {
    centre: ['map', 'matrix', 'table', 'groups', 'compare', 'engagement'],
    right: ['member', 'explore', 'insights', 'views'],
  },
  discuss: { centre: ['map', 'engagement'], right: ['views', 'insights'] },
  act: { centre: ['engagement', 'map'], right: ['insights', 'views'] },
  remeasure: {
    centre: ['compare', 'survey', 'engagement', 'map'],
    right: ['insights', 'coverage'],
  },
};

/** The step shown: the session's choice, else the project's record ('all' without one). */
export function selectStep(s: {
  ui: { step: Step | null };
  data: { project: Project | null };
}): Step {
  return s.ui.step ?? currentStep(s.data.project);
}

export const useStep = () => useAppStore(selectStep);

/** Whether a centre tab is shown at this step (all of them on "All tools" or under Advanced). */
export function centreShown(step: Step, advanced: boolean, key: CentreView): boolean {
  return step === 'all' || advanced || STEP_TABS[step].centre.includes(key);
}

export function rightShown(step: Step, advanced: boolean, key: RightPanel): boolean {
  return step === 'all' || advanced || STEP_TABS[step].right.includes(key);
}

/** Moves to a step, saving it in the project unless the layout is read-only. */
export function chooseStep(step: Step, readOnly: boolean) {
  const s = useAppStore.getState();
  const project = s.data.project;
  s.setStepUi({ step, stepAdvanced: false });
  if (!readOnly && project && (project.engagement || step !== 'all')) {
    s.updateProjectViews((p) => updateEngagement(p, (e) => ({ ...e, step })));
  }
  if (step === 'all') return;
  const tabs = STEP_TABS[step];
  const centre = tabs.centre[0];
  if (centre && !tabs.centre.includes(s.ui.centreView)) s.setCentreView(centre);
  const right = tabs.right[0];
  if (right && !tabs.right.includes(s.ui.rightPanel)) {
    // Choosing the panel opens the compact drawer; keep it as it was.
    const open = useAppStore.getState().ui.rightOpen;
    s.setRightPanel(right);
    s.setRightOpen(open);
  }
}

/** Starts an engagement record on the project, at Plan. */
export function startEngagement() {
  const s = useAppStore.getState();
  s.updateProjectViews((p) => ({ ...p, engagement: p.engagement ?? emptyEngagement('plan') }));
  chooseStep('plan', false);
}

/** Applies a change to the project's engagement record. */
export function changeEngagement(fn: (e: Engagement) => Engagement) {
  useAppStore.getState().updateProjectViews((p) => updateEngagement(p, fn));
}

export const useEngagement = () => {
  const project = useAppStore((s) => s.data.project);
  return useMemo(() => engagementOf(project), [project]);
};

// Checklists --------------------------------------------------------------------------------

export interface CheckContext {
  project: Project;
  engagement: Engagement;
  result: AnalysisResult | null;
}

type Check = { id: string; auto?: (c: CheckContext) => boolean };

const has = (s: string) => s.trim() !== '';

export const CHECKLISTS: Record<EngagementStep, Check[]> = {
  plan: [
    { id: 'question', auto: (c) => has(c.engagement.question) },
    { id: 'sponsor', auto: (c) => has(c.engagement.sponsor) },
    { id: 'boundary', auto: (c) => has(c.engagement.boundary) },
    {
      id: 'governance',
      auto: (c) =>
        c.engagement.governance.retention_date !== null &&
        Object.values(c.engagement.governance.audiences).some((w) => has(w)),
    },
    { id: 'audience' },
    { id: 'expectations', auto: (c) => c.engagement.expectations.some((e) => has(e.text)) },
    { id: 'intent', auto: (c) => c.engagement.intent.pairs.length > 0 },
    { id: 'relations' },
  ],
  collect: [
    { id: 'survey', auto: (c) => c.project.surveys.length > 0 },
    { id: 'launchKit' },
    {
      id: 'imported',
      auto: (c) =>
        c.project.ties.length > 0 ||
        c.project.surveys.some((sv) => sv.log.some((l) => l.kind === 'accepted')),
    },
    {
      id: 'closed',
      auto: (c) => {
        const last = c.project.surveys.at(-1);
        return last !== undefined && last.status === 'closed';
      },
    },
  ],
  check: [
    {
      id: 'coverage',
      auto: (c) => {
        const cov = c.result?.coverage;
        return cov != null && cov.rate > 0 && !cov.belowThreshold;
      },
    },
    { id: 'statement' },
    { id: 'nonRespondents' },
    { id: 'habits' },
  ],
  understand: [
    {
      id: 'expectationsReviewed',
      auto: (c) =>
        c.engagement.expectations.length > 0 &&
        c.engagement.expectations.every((e) => has(e.notes)),
    },
    { id: 'intentRead' },
    { id: 'insightsRead' },
    { id: 'viewSaved', auto: (c) => c.project.saved_views.some((v) => has(v.caption)) },
  ],
  discuss: [
    { id: 'audiences' },
    {
      id: 'summary',
      auto: (c) => Object.keys(c.project.settings.summaries ?? {}).length > 0,
    },
    { id: 'shared' },
  ],
  act: [
    { id: 'action', auto: (c) => c.engagement.actions.length > 0 },
    {
      id: 'actionsComplete',
      auto: (c) =>
        c.engagement.actions.length > 0 &&
        c.engagement.actions.every((a) => has(a.owner) && a.due !== null && a.link !== null),
    },
  ],
  remeasure: [
    {
      id: 'repeated',
      auto: (c) =>
        c.project.surveys.some((sv) => sv.repeats !== undefined) ||
        waveNumbers(c.project).length > 1,
    },
    { id: 'changeRead' },
    {
      id: 'statuses',
      auto: (c) =>
        c.engagement.actions.length > 0 &&
        c.engagement.actions.every((a) => a.status !== 'proposed' && a.status !== 'agreed'),
    },
    { id: 'outcomes', auto: (c) => c.engagement.outcomes.some((o) => has(o.assessment)) },
  ],
};

export interface CheckState {
  id: string;
  /** Done because the project shows it, so the analyst cannot untick it. */
  auto: boolean;
  done: boolean;
}

/** Checklist ids are unique across steps. */
export function checklist(step: EngagementStep, c: CheckContext): CheckState[] {
  return CHECKLISTS[step].map(({ id, auto }) => {
    const byProject = auto?.(c) ?? false;
    return { id, auto: byProject, done: byProject || c.engagement.checks.includes(id) };
  });
}

export const STEP_ORDER = ENGAGEMENT_STEPS;

// Observations and actions ------------------------------------------------------------------

/** A stable key for an observation, so an action can name it across waves. */
export function observationKey(o: Observation): string {
  const group = o.group
    ? `${o.group.attribute}=${o.group.value}${o.group.other !== undefined ? `|${o.group.other}` : ''}`
    : '';
  return [o.rule, o.ref, group, [...o.members].sort().join(',')].join(':');
}

/** Adds an action answering an observation; `text` is the observation's question. */
export function addActionForObservation(o: Observation, text: string, wave: number) {
  const now = new Date().toISOString();
  changeEngagement((e) =>
    addAction(
      e,
      { link: { kind: 'observation', key: observationKey(o), text, wave, rule: o.rule } },
      now,
    ),
  );
}

// The assessment against intent ---------------------------------------------------------------

/** The layer ties are counted on: the record's choice when the analysis has it, else the layer
 *  whose role is connection, else the composite. */
export function intentLayer(project: Project, result: AnalysisResult): string {
  const usable = (ref: string | null | undefined): ref is string => {
    if (!ref) return false;
    const r = result.refs[ref];
    return r !== undefined && (r.kind === 'unsigned' || r.kind === 'composite');
  };
  const chosen = project.engagement?.intent.layer;
  if (usable(chosen)) return chosen;
  const connection = relationForRole(project, 'connection')?.key;
  if (usable(connection)) return connection;
  return 'composite';
}

/** The assessment's input: one layer's weights in the view analysed, and each member's value. */
export function intentInput(
  project: Project,
  result: AnalysisResult,
  layer: string,
  attribute: string,
): IntentInput | null {
  const weights = result.refs[layer]?.weights;
  if (!weights) return null;
  const byId = new Map(project.members.map((m) => [m.id, m]));
  return {
    weights,
    memberIds: result.memberIds,
    values: result.memberIds.map((id) => byId.get(id)?.attributes[attribute] ?? null),
    directed: result.view === 'directed',
  };
}

/** Values of a category attribute present among members, in category order. */
export function presentValues(project: Project, attribute: string): string[] {
  const def = project.attribute_definitions.find((a) => a.key === attribute);
  const present = new Set(
    project.members.map((m) => m.attributes[attribute]).filter((v): v is string => !!v),
  );
  const ordered = (def?.categories ?? []).filter((v) => present.has(v));
  const rest = [...present].filter((v) => !ordered.includes(v)).sort();
  return [...ordered, ...rest];
}

/** What the data show for an expectation's link, as sentences; null without a result. */
export function expectationData(
  project: Project,
  result: AnalysisResult,
  link: ExpectationLink | null,
  name: (id: string) => string,
  /** Readouts about one member are left out (every audience but the analyst's). */
  groupsOnly = false,
): string[] | null {
  if (!link) return [];
  if (link.kind === 'question') {
    const id = link.id as QuestionId;
    if (!QUESTION_IDS.includes(id)) return [];
    const layer = questionLayer(id, project);
    if (!result.refs[layer]) return [];
    const label =
      layer === 'composite'
        ? mapCopy.controls.composite
        : (project.layers.find((l) => l.key === layer)?.label ?? layer);
    return questionReadouts(id, project, result, layer, label)
      .filter((r) => !groupsOnly || !MEMBER_READOUTS.has(r.kind))
      .map((r) => readoutSentence(r, name));
  }
  const layer = intentLayer(project, result);
  const input = intentInput(project, result, layer, link.attribute);
  if (!input) return null;
  if (link.kind === 'pair') {
    const { tied, possible } = pairCounts(input, link.a, link.b);
    if (possible === 0) return [E.assessment.noPairs];
    const share = tied / possible;
    const out = [E.assessment.sentence(link.a, link.b, tied, possible, share)];
    const level = project.engagement
      ? expectedLevel(project.engagement, link.attribute, link.a, link.b)
      : null;
    if (level) out.push(E.assessment.verdictSentence(verdictFor(level, share), level));
    return out;
  }
  const g = groupShares(input, link.value);
  if (g.insidePossible + g.outsidePossible === 0) return [E.assessment.noPairs];
  return [
    E.assessment.groupSentence(link.value, g.inside, g.insideShare, g.outside, g.outsideShare),
  ];
}
