// The one rendering layer for member names (spec §8 "Anonymisation"). Every
// view, the map, the insights and the presentation get a member's name from
// here, never from `display_name`: ESLint forbids reading `display_name`
// anywhere else under src/ui (eslint.config.js), so anonymisation cannot be
// bypassed by a component that forgets to apply it. When anonymisation is on,
// names become role/team codes (data/anonymise.ts) and free text such as
// captions has names replaced before it is shown.

import { useMemo } from 'react';
import { memberCodes, replaceNames, type MemberCodes } from '../../data/anonymise';
import type { MemberId, Project } from '../../data/schema';
import { namesCopy } from '../copy/names';
import { audienceChoice, forcesCodes } from './audienceSettings';
import { useAppStore, type AppState } from './store';

export interface MemberNames {
  anonymised: boolean;
  /** Names (or codes) in project order. */
  byIndex: readonly string[];
  /** The name (or code) of a member; the id itself for an unknown id. */
  of: (id: MemberId) => string;
  /** Free text with every member's name replaced when anonymised; unchanged otherwise. */
  text: (s: string) => string;
  /** Team–level groups whose codes may identify someone (empty when not anonymised). */
  smallGroups: MemberCodes['smallGroups'];
}

const cache = new WeakMap<Project, { named?: MemberNames; coded?: MemberNames }>();

const EMPTY: MemberNames = {
  anonymised: false,
  byIndex: [],
  of: (id) => id,
  text: (s) => s,
  smallGroups: [],
};

function build(project: Project, anonymise: boolean): MemberNames {
  const real = project.members.map((m) => m.display_name);
  const coded = anonymise ? memberCodes(project.members) : null;
  const byIndex = coded ? coded.codes : real;
  const byId = new Map(project.members.map((m, i) => [m.id, byIndex[i] ?? m.id]));
  const textCache = new Map<string, string>();
  return {
    anonymised: anonymise,
    byIndex,
    of: (id) => byId.get(id) ?? id,
    text: coded
      ? (s) => {
          let out = textCache.get(s);
          if (out === undefined) {
            out = replaceNames(s, real, coded.codes, namesCopy.sharedName);
            textCache.set(s, out);
          }
          return out;
        }
      : (s) => s,
    smallGroups: coded ? coded.smallGroups : [],
  };
}

/** Names for a project, memoised per project object and setting. */
export function memberNames(project: Project | null, anonymise: boolean): MemberNames {
  if (!project) return EMPTY;
  let entry = cache.get(project);
  if (!entry) {
    entry = {};
    cache.set(project, entry);
  }
  const key = anonymise ? 'coded' : 'named';
  entry[key] ??= build(project, anonymise);
  return entry[key];
}

/**
 * Names stand for members whom an audience may see (build plan session 9):
 * `allowed` members keep their name or code; everyone else becomes
 * `placeholder` ("a colleague"), in `of`, `byIndex` and in free text, so a
 * caption that names someone outside the audience's view does not reveal them.
 */
export function restrictNames(
  project: Project,
  anonymise: boolean,
  allowed: (id: MemberId) => boolean,
  placeholder: string,
): MemberNames {
  const base = memberNames(project, anonymise);
  const real = project.members.map((m) => m.display_name);
  const byIndex = project.members.map((m, i) =>
    allowed(m.id) ? (base.byIndex[i] ?? m.id) : placeholder,
  );
  const byId = new Map(project.members.map((m, i) => [m.id, byIndex[i] ?? placeholder]));
  // A code typed into a caption is replaced too, when its member is not allowed.
  const codes = memberCodes(project.members).codes;
  const codeOrPlaceholder = project.members.map((m, i) =>
    allowed(m.id) ? (codes[i] ?? placeholder) : placeholder,
  );
  const textCache = new Map<string, string>();
  return {
    anonymised: base.anonymised,
    byIndex,
    of: (id) => byId.get(id) ?? placeholder,
    text: (s) => {
      let out = textCache.get(s);
      if (out === undefined) {
        out = replaceNames(
          replaceNames(s, real, byIndex, namesCopy.sharedName),
          codes,
          codeOrPlaceholder,
          placeholder,
        );
        textCache.set(s, out);
      }
      return out;
    },
    smallGroups: base.smallGroups,
  };
}

/**
 * Presentation mode for a team workshop whose team has not agreed to be named
 * shows codes, whatever Hide names says (build plan session 9).
 */
function codesForced(s: AppState): boolean {
  const project = s.data.project;
  if (!project || s.ui.presentation === null) return false;
  return forcesCodes(project, audienceChoice(project, s.ui.audience));
}

/** Names for the open project under the current anonymisation setting. */
export function useMemberNames(): MemberNames {
  const project = useAppStore((s) => s.data.project);
  const anonymise = useAppStore((s) => s.ui.anonymise || codesForced(s));
  return useMemo(() => memberNames(project, anonymise), [project, anonymise]);
}

/** The same, outside React (actions and status messages). */
export function currentNames(): MemberNames {
  const s = useAppStore.getState();
  return memberNames(s.data.project, s.ui.anonymise || codesForced(s));
}

/**
 * Hides or shows names everywhere, and says so in the status line. When codes
 * belong to a team and level of fewer than three members, the message warns
 * that they may still identify someone (plan Q13).
 */
export function setNamesHidden(on: boolean): void {
  const s = useAppStore.getState();
  s.setAnonymise(on);
  if (!on) {
    s.setStatus({ text: namesCopy.off, tone: 'info' });
    return;
  }
  const { smallGroups } = currentNames();
  const examples = smallGroups
    .slice(0, 3)
    .map((g) => g.prefix)
    .join(', ');
  s.setStatus({
    text:
      smallGroups.length > 0
        ? `${namesCopy.on} ${namesCopy.smallGroups(
            smallGroups.reduce((sum, g) => sum + g.size, 0),
            examples,
          )}`
        : namesCopy.on,
    tone: 'info',
  });
}
