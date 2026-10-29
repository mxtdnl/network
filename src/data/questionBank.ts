// The question bank (build plan session 11, method notes §20): relations an
// analyst can add and adapt to the client's issue. Each item gives its
// wording, scale and role; `{topic}` is replaced by the analyst's topic when
// the item is added. Purposes, sensitivity notes and the dialog's wording are
// in ui/copy/questionBank.ts. The bank does not repeat the built-in layers.

import type { LayerRole } from './schema';
import type { RelationScale, RelationSpec } from './relations';

export const BANK_PURPOSES = [
  'information',
  'advice',
  'dependency',
  'ideas',
  'decisions',
  'collaboration',
  'merger',
  'onboarding',
  'inclusion',
  'energy',
] as const;
export type BankPurpose = (typeof BANK_PURPOSES)[number];

export type Sensitivity = 'low' | 'medium' | 'high';

export interface BankItem {
  id: string;
  purpose: BankPurpose;
  label: string;
  wording: string;
  scale: RelationScale;
  role: LayerRole;
  sensitivity: Sensitivity;
  /** Signed items: the labels of the scale's ends. */
  ends?: { low: string; high: string };
  /** Worded from the giver's side, so the colleague rated is the one who receives. */
  reversed?: boolean;
}

export const TOPIC = '{topic}';

export const QUESTION_BANK: readonly BankItem[] = [
  // Information flow
  {
    id: 'info_get',
    purpose: 'information',
    label: 'Gets information about {topic}',
    wording: 'How often do you get information about {topic} from this person?',
    scale: 'frequency',
    role: 'information',
    sensitivity: 'low',
  },
  {
    id: 'info_give',
    purpose: 'information',
    label: 'Gives information about {topic}',
    wording: 'How often do you give information about {topic} to this person?',
    scale: 'frequency',
    role: 'information',
    sensitivity: 'low',
    reversed: true,
  },
  {
    id: 'info_first',
    purpose: 'information',
    label: 'Hears first about changes',
    wording: 'How often do you hear about changes affecting {topic} first from this person?',
    scale: 'frequency',
    role: 'information',
    sensitivity: 'low',
  },
  {
    id: 'info_kept',
    purpose: 'information',
    label: 'Kept informed about {topic}',
    wording: 'This person keeps me informed about {topic}.',
    scale: 'agreement',
    role: 'information',
    sensitivity: 'low',
  },
  // Advice and problem-solving
  {
    id: 'advice_topic',
    purpose: 'advice',
    label: 'Advice about {topic}',
    wording: 'How often do you go to this person for advice about {topic}?',
    scale: 'frequency',
    role: 'advice',
    sensitivity: 'low',
  },
  {
    id: 'advice_stuck',
    purpose: 'advice',
    label: 'Help when stuck',
    wording: 'How often do you go to this person when you are stuck on a problem?',
    scale: 'frequency',
    role: 'advice',
    sensitivity: 'low',
  },
  {
    id: 'advice_think',
    purpose: 'advice',
    label: 'Thinking through {topic}',
    wording: 'This person helps me think through {topic} when I am unsure.',
    scale: 'agreement',
    role: 'advice',
    sensitivity: 'low',
  },
  {
    id: 'advice_check',
    purpose: 'advice',
    label: 'Checks work on {topic}',
    wording: 'I would ask this person to check my work on {topic}.',
    scale: 'agreement',
    role: 'advice',
    sensitivity: 'medium',
  },
  // Work and dependency
  {
    id: 'dep_need',
    purpose: 'dependency',
    label: 'Needs something to finish {topic}',
    wording: 'How often do you need something from this person to finish your work on {topic}?',
    scale: 'frequency',
    role: 'dependency',
    sensitivity: 'low',
  },
  {
    id: 'dep_delay',
    purpose: 'dependency',
    label: 'Delayed when unavailable',
    wording: 'My work on {topic} is delayed when this person is unavailable.',
    scale: 'agreement',
    role: 'dependency',
    sensitivity: 'medium',
  },
  {
    id: 'dep_handover',
    purpose: 'dependency',
    label: 'Hands over work',
    wording: 'How often do you hand over work to this person?',
    scale: 'frequency',
    role: 'dependency',
    sensitivity: 'low',
    reversed: true,
  },
  // Innovation and ideas
  {
    id: 'ideas_discuss',
    purpose: 'ideas',
    label: 'Discusses new ideas about {topic}',
    wording: 'How often do you discuss new ideas about {topic} with this person?',
    scale: 'frequency',
    role: 'ideas',
    sensitivity: 'low',
  },
  {
    id: 'ideas_test',
    purpose: 'ideas',
    label: 'Tests early ideas about {topic}',
    wording: 'I would test an early idea about {topic} with this person.',
    scale: 'agreement',
    role: 'ideas',
    sensitivity: 'low',
  },
  {
    id: 'ideas_action',
    purpose: 'ideas',
    label: 'Turns ideas into action',
    wording: 'This person helps me turn ideas about {topic} into action.',
    scale: 'agreement',
    role: 'ideas',
    sensitivity: 'low',
  },
  // Decisions
  {
    id: 'dec_consult',
    purpose: 'decisions',
    label: 'Consulted before deciding',
    wording: 'How often do you consult this person before deciding about {topic}?',
    scale: 'frequency',
    role: 'influence',
    sensitivity: 'low',
  },
  {
    id: 'dec_changes',
    purpose: 'decisions',
    label: 'View changes decisions',
    wording: 'This person’s view changes what I decide about {topic}.',
    scale: 'agreement',
    role: 'influence',
    sensitivity: 'medium',
  },
  {
    id: 'dec_agree',
    purpose: 'decisions',
    label: 'Agreement needed to act',
    wording: 'I need this person’s agreement before I act on {topic}.',
    scale: 'agreement',
    role: 'dependency',
    sensitivity: 'low',
  },
  // Collaboration
  {
    id: 'collab_work',
    purpose: 'collaboration',
    label: 'Works together on {topic}',
    wording: 'How often do you work with this person on {topic}?',
    scale: 'frequency',
    role: 'connection',
    sensitivity: 'low',
  },
  {
    id: 'collab_required',
    purpose: 'collaboration',
    label: 'Required to work together on {topic}',
    wording: 'How often does a process or plan require you to work with this person on {topic}?',
    scale: 'frequency',
    role: 'formal',
    sensitivity: 'low',
  },
  {
    id: 'collab_unasked',
    purpose: 'collaboration',
    label: 'Works together on {topic} unasked',
    wording: 'How often do you work with this person on {topic} without being asked to?',
    scale: 'frequency',
    role: 'informal',
    sensitivity: 'low',
  },
  // Across a merger or matrix
  {
    id: 'merger_across',
    purpose: 'merger',
    label: 'Works across the former organisations',
    wording: 'How often do you work with this person across the former organisations?',
    scale: 'frequency',
    role: 'connection',
    sensitivity: 'medium',
  },
  {
    id: 'matrix_priorities',
    purpose: 'merger',
    label: 'Agrees priorities across reporting lines',
    wording:
      'How often do you need to agree priorities with this person because you report to different managers?',
    scale: 'frequency',
    role: 'formal',
    sensitivity: 'low',
  },
  {
    id: 'merger_who',
    purpose: 'merger',
    label: 'Knows who to go to in their area',
    wording: 'I know who to go to in this person’s part of the organisation.',
    scale: 'agreement',
    role: 'awareness',
    sensitivity: 'low',
  },
  // Awareness and onboarding
  {
    id: 'aware_work',
    purpose: 'onboarding',
    label: 'Knows what they work on',
    wording: 'I know what this person works on.',
    scale: 'agreement',
    role: 'awareness',
    sensitivity: 'low',
  },
  {
    id: 'onboard_help',
    purpose: 'onboarding',
    label: 'Helped on joining',
    wording: 'This person helped me find my way when I joined or changed role.',
    scale: 'agreement',
    role: 'advice',
    sensitivity: 'low',
  },
  {
    id: 'onboard_intro',
    purpose: 'onboarding',
    label: 'Introduces new contacts',
    wording: 'How often does this person introduce you to people you did not know?',
    scale: 'frequency',
    role: 'information',
    sensitivity: 'low',
  },
  // Inclusion and trust
  {
    id: 'incl_included',
    purpose: 'inclusion',
    label: 'Included in discussions about {topic}',
    wording: 'This person includes me in discussions about {topic}.',
    scale: 'agreement',
    role: 'information',
    sensitivity: 'high',
  },
  {
    id: 'incl_disagree',
    purpose: 'inclusion',
    label: 'Can disagree safely about {topic}',
    wording: 'I can disagree with this person about {topic} without it harming our relationship.',
    scale: 'agreement',
    role: 'trust',
    sensitivity: 'high',
  },
  {
    id: 'trust_commit',
    purpose: 'inclusion',
    label: 'Keeps commitments',
    wording: 'I can count on this person to keep a commitment.',
    scale: 'agreement',
    role: 'trust',
    sensitivity: 'high',
  },
  // Energy and friction
  {
    id: 'energy_topic',
    purpose: 'energy',
    label: 'Energy working on {topic}',
    wording: 'How does working with this person on {topic} usually leave you?',
    scale: 'signed',
    role: 'affect',
    sensitivity: 'high',
    ends: { low: 'Very drained', high: 'Very energised' },
  },
  {
    id: 'friction_priorities',
    purpose: 'energy',
    label: 'Disagrees about priorities for {topic}',
    wording: 'How often do you disagree with this person about priorities for {topic}?',
    scale: 'frequency',
    role: 'friction',
    sensitivity: 'high',
  },
  {
    id: 'friction_tension',
    purpose: 'energy',
    label: 'Slowed by tension',
    wording: 'How often is work with this person slowed by tension between you?',
    scale: 'frequency',
    role: 'friction',
    sensitivity: 'high',
  },
];

export function hasTopic(item: Pick<BankItem, 'label' | 'wording'>): boolean {
  return item.wording.includes(TOPIC) || item.label.includes(TOPIC);
}

/** The text with the topic put in place of `{topic}`. */
export function withTopic(text: string, topic: string): string {
  return text.split(TOPIC).join(topic.trim());
}

/** The relation an item adds, with the topic in its label and wording. */
export function bankRelation(item: BankItem, topic: string): RelationSpec {
  const t = topic.trim();
  const label = withTopic(item.label, t);
  return {
    label: label.charAt(0).toUpperCase() + label.slice(1),
    question_wording: withTopic(item.wording, t),
    role: item.role,
    scale: item.scale,
    ...(item.ends
      ? { scale_labels: { '-3': item.ends.low, '0': 'Neutral', '3': item.ends.high } }
      : {}),
  };
}
