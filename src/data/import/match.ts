// Matching the people named in a survey tool's export to the roster (build
// plan session 13). A label is matched by member id, email or name: first
// exactly, then ignoring case and spacing. A label that matches nobody that
// way gets suggestions (the same name in another order, without accents or
// punctuation, with an initial, a close spelling, or an email address whose
// first part is the name), which the analyst must confirm; a suggestion is
// never applied on its own. A label that matches more than one member at the
// first level it matches at is ambiguous, and is never resolved by guessing.

import type { AttributeDefinition, Member, MemberId } from '../schema';

export interface Person {
  id: MemberId;
  name: string;
  email: string | null;
}

/** How a label matched: exact id, email or name, or one of them ignoring case and spacing. */
export type MatchLevel = 'id' | 'email' | 'name' | 'normalised';

export type SuggestionReason = 'order' | 'accents' | 'initial' | 'spelling' | 'email_name';

export interface Suggestion {
  memberId: MemberId;
  reason: SuggestionReason;
}

export type PersonMatch =
  | { status: 'matched'; memberId: MemberId; by: MatchLevel }
  | { status: 'ambiguous'; candidates: MemberId[]; by: MatchLevel }
  | { status: 'suggested'; suggestions: Suggestion[] }
  | { status: 'unmatched' };

/** At most this many suggestions per label. */
export const MAX_SUGGESTIONS = 5;

/** The roster as matching sees it: id, name and the email attribute, if any. */
export function rosterPeople(
  members: readonly Member[],
  attributes: readonly AttributeDefinition[],
): Person[] {
  const emailKey = attributes.find((a) => a.type === 'email')?.key;
  return members.map((m) => ({
    id: m.id,
    name: m.display_name,
    email: emailKey ? (m.attributes[emailKey] ?? null) : null,
  }));
}

/** Ignoring case and spacing: trimmed, runs of spaces as one, lower case. */
export function normaliseLabel(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Without accents, punctuation or case: "Zoë O'Neill-Hart" → "zoe o neill hart". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokens(s: string): string[] {
  const f = fold(s);
  return f === '' ? [] : f.split(' ');
}

/** Levenshtein distance, stopping early once it exceeds `limit`. */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > limit) return limit + 1;
    prev = cur;
  }
  return prev[b.length] ?? limit + 1;
}

/** One name written with an initial for one of the other's words: "A. Example", "Ada E". */
function initialMatch(label: string[], name: string[]): boolean {
  if (label.length !== name.length || label.length < 2) return false;
  let initials = 0;
  for (let i = 0; i < label.length; i++) {
    const a = label[i] ?? '';
    const b = name[i] ?? '';
    if (a === b) continue;
    if (a.length === 1 && b.startsWith(a)) initials++;
    else return false;
  }
  return initials > 0;
}

const sameWords = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');

const REASON_ORDER: readonly SuggestionReason[] = [
  'accents',
  'order',
  'email_name',
  'initial',
  'spelling',
];

export class Matcher {
  private readonly exact = new Map<string, { ids: Set<MemberId>; by: MatchLevel }>();
  private readonly normalised = new Map<string, Set<MemberId>>();

  constructor(private readonly people: readonly Person[]) {
    // Exact: an id first, then an email, then a name. A label that is one
    // member's id and another member's name is ambiguous.
    const add = (text: string | null, id: MemberId, by: MatchLevel) => {
      if (text === null || text.trim() === '') return;
      const key = text.trim();
      const entry = this.exact.get(key);
      if (entry) entry.ids.add(id);
      else this.exact.set(key, { ids: new Set([id]), by });
      const n = normaliseLabel(text);
      this.normalised.set(n, (this.normalised.get(n) ?? new Set()).add(id));
    };
    for (const p of people) add(p.id, p.id, 'id');
    for (const p of people) add(p.email, p.id, 'email');
    for (const p of people) add(p.name, p.id, 'name');
  }

  match(label: string): PersonMatch {
    const text = label.trim();
    if (text === '') return { status: 'unmatched' };
    const exact = this.exact.get(text);
    if (exact) {
      const ids = [...exact.ids];
      return ids.length === 1
        ? { status: 'matched', memberId: ids[0] as MemberId, by: exact.by }
        : { status: 'ambiguous', candidates: ids, by: exact.by };
    }
    const normalised = this.normalised.get(normaliseLabel(text));
    if (normalised) {
      const ids = [...normalised];
      return ids.length === 1
        ? { status: 'matched', memberId: ids[0] as MemberId, by: 'normalised' }
        : { status: 'ambiguous', candidates: ids, by: 'normalised' };
    }
    const suggestions = this.suggest(text);
    return suggestions.length > 0 ? { status: 'suggested', suggestions } : { status: 'unmatched' };
  }

  /** True when the label matches someone exactly or ignoring case and spacing. */
  isPerson(label: string): boolean {
    const m = this.match(label);
    return m.status === 'matched' || m.status === 'ambiguous';
  }

  private suggest(text: string): Suggestion[] {
    const labelWords = tokens(text);
    const labelFolded = labelWords.join(' ');
    const at = text.indexOf('@');
    const emailWords = at > 0 ? tokens(text.slice(0, at)) : null;
    if (labelWords.length === 0) return [];
    const found: (Suggestion & { rank: number })[] = [];
    for (const p of this.people) {
      const nameWords = tokens(p.name);
      const nameFolded = nameWords.join(' ');
      let reason: SuggestionReason | null = null;
      let rank = 0;
      if (emailWords && emailWords.length > 0 && sameWords(emailWords, nameWords)) {
        reason = 'email_name';
      } else if (labelFolded === nameFolded) reason = 'accents';
      else if (sameWords(labelWords, nameWords)) reason = 'order';
      else if (initialMatch(labelWords, nameWords)) reason = 'initial';
      else if (emailWords === null) {
        // A close spelling: one change for short names, two for longer ones.
        const limit = nameFolded.length > 8 ? 2 : 1;
        const d = distance(labelFolded, nameFolded, limit);
        if (d <= limit) {
          reason = 'spelling';
          rank = d;
        }
      }
      if (reason) found.push({ memberId: p.id, reason, rank });
    }
    found.sort(
      (a, b) => REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason) || a.rank - b.rank,
    );
    return found.slice(0, MAX_SUGGESTIONS).map(({ memberId, reason }) => ({ memberId, reason }));
  }
}

/** The member a match settles on without the analyst's confirmation, if any. */
export function settled(match: PersonMatch): MemberId | null {
  return match.status === 'matched' ? match.memberId : null;
}
