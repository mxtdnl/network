// Building and editing the roster inside Graticule (CLAUDE.md D124), as an
// alternative to importing a members file. Pure functions from a project to a
// new project: no React, no DOM.
//
// Rules:
// - Ids are generated (m001, m002, …) and never change once given, because
//   ratings, surveys and saved views refer to members by id.
// - Names are trimmed and must not be empty; attribute values are trimmed and
//   an empty value is `null` (not recorded), as on import.
// - A categorical or ordinal attribute keeps its categories in their order and
//   gains new values at the end, so an ordinal order is never lost. Categories
//   no member holds any more are kept: every view lists only values present.
// - Removing a member removes every rating they gave or received and clears
//   any manager reference to them. Surveys keep their rosters as issued; the
//   import reports a removed colleague as dropped (survey/collect.ts).

import { addToLatestWave, removeFromWaves } from './waves';
import type {
  AttributeDefinition,
  AttributeKey,
  AttributeType,
  Member,
  MemberId,
  Project,
} from './schema';
import { normaliseHeader } from './import/table';

export interface NewMember {
  name: string;
  attributes?: Record<AttributeKey, string | null>;
}

export interface MemberPatch {
  name?: string;
  attributes?: Record<AttributeKey, string | null>;
}

/** Attribute types an analyst can add by hand. */
export type AddableAttributeType = Exclude<AttributeType, 'member_ref'>;

const ID_PATTERN = /^m(\d+)$/;

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** `count` unused ids after the highest generated id in the project. */
export function nextMemberIds(project: Project, count: number): MemberId[] {
  const used = new Set(project.members.map((m) => m.id));
  let n = 0;
  for (const id of used) {
    const match = ID_PATTERN.exec(id);
    if (match) n = Math.max(n, Number(match[1]));
  }
  const ids: MemberId[] = [];
  while (ids.length < count) {
    n += 1;
    const id = `m${String(n).padStart(3, '0')}`;
    if (!used.has(id)) ids.push(id);
  }
  return ids;
}

/** Names from pasted text: one per line, trimmed, blank lines left out. A
 *  pasted spreadsheet column may carry tabs; only the first cell is read. */
export function parseNameList(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => (line.split('\t')[0] ?? '').trim())
    .filter((name) => name !== '');
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim() ?? '';
  return v === '' ? null : v;
}

/** Categories of each categorical and ordinal attribute, extended with the
 *  values members now hold. Definitions that do not change keep their identity. */
export function refreshCategories(
  definitions: AttributeDefinition[],
  members: Member[],
): AttributeDefinition[] {
  return definitions.map((def) => {
    if (def.type !== 'categorical' && def.type !== 'ordinal') return def;
    const known = def.categories ?? [];
    const seen = new Set(known);
    const added = new Set<string>();
    for (const m of members) {
      const v = m.attributes[def.key];
      if (v != null && !seen.has(v)) added.add(v);
    }
    if (added.size === 0) return def;
    return { ...def, categories: [...known, ...[...added].sort(naturalCompare)] };
  });
}

function withMembers(project: Project, members: Member[]): Project {
  return {
    ...project,
    members,
    attribute_definitions: refreshCategories(project.attribute_definitions, members),
  };
}

function cleanAttributes(
  project: Project,
  attributes: Record<AttributeKey, string | null> | undefined,
  self: MemberId,
): Record<AttributeKey, string | null> {
  const ids = new Set(project.members.map((m) => m.id));
  const out: Record<AttributeKey, string | null> = {};
  for (const def of project.attribute_definitions) {
    if (!attributes || !(def.key in attributes)) continue;
    let v = clean(attributes[def.key]);
    // A manager must be another member of the project.
    if (def.type === 'member_ref' && v !== null && (v === self || !ids.has(v))) v = null;
    out[def.key] = v;
  }
  return out;
}

/** Adds members at the end of the roster, with generated ids. Entries without
 *  a name are left out. */
export function addMembers(project: Project, entries: NewMember[]): Project {
  const named = entries.filter((e) => e.name.trim() !== '');
  if (named.length === 0) return project;
  const ids = nextMemberIds(project, named.length);
  const added = named.map((e, i): Member => {
    const id = ids[i] ?? '';
    const attributes: Record<AttributeKey, string | null> = {};
    for (const def of project.attribute_definitions) attributes[def.key] = null;
    return {
      id,
      display_name: e.name.trim(),
      attributes: { ...attributes, ...cleanAttributes(project, e.attributes, id) },
    };
  });
  // Members who join a project with recorded waves join the latest recorded wave
  // only, not the waves before it (build plan session 14).
  return addToLatestWave(
    withMembers(project, [...project.members, ...added]),
    added.map((m) => m.id),
  );
}

/** Changes a member's name or attributes. An empty name, an unknown member or
 *  a change to nothing returns the project unchanged. */
export function updateMember(project: Project, id: MemberId, patch: MemberPatch): Project {
  const member = project.members.find((m) => m.id === id);
  if (!member) return project;
  const name = patch.name === undefined ? member.display_name : patch.name.trim();
  if (name === '') return project;
  const attributes = { ...member.attributes, ...cleanAttributes(project, patch.attributes, id) };
  const same =
    name === member.display_name &&
    Object.keys(attributes).every((k) => attributes[k] === member.attributes[k]);
  if (same) return project;
  const next: Member = { ...member, display_name: name, attributes };
  return withMembers(
    project,
    project.members.map((m) => (m.id === id ? next : m)),
  );
}

export interface RemovalImpact {
  /** Ratings the members gave or received. */
  ratings: number;
  /** Other members whose manager would be cleared. */
  reports: number;
  /** Titles of surveys whose roster includes any of the members. */
  surveys: string[];
}

export function removalImpact(project: Project, ids: readonly MemberId[]): RemovalImpact {
  const gone = new Set(ids);
  const refs = project.attribute_definitions
    .filter((d) => d.type === 'member_ref')
    .map((d) => d.key);
  return {
    ratings: project.ties.filter((t) => gone.has(t.rater_id) || gone.has(t.ratee_id)).length,
    reports: project.members.filter(
      (m) => !gone.has(m.id) && refs.some((k) => gone.has(m.attributes[k] ?? '')),
    ).length,
    surveys: project.surveys
      .filter((s) => s.versions.some((v) => v.roster.some((r) => gone.has(r))))
      .map((s) => s.title),
  };
}

/** Removes members, their ratings and any manager reference to them. */
export function removeMembers(project: Project, ids: readonly MemberId[]): Project {
  const gone = new Set(ids);
  if (!project.members.some((m) => gone.has(m.id))) return project;
  const refs = project.attribute_definitions
    .filter((d) => d.type === 'member_ref')
    .map((d) => d.key);
  const members = project.members
    .filter((m) => !gone.has(m.id))
    .map((m) => {
      const cleared = refs.filter((k) => gone.has(m.attributes[k] ?? ''));
      if (cleared.length === 0) return m;
      const attributes = { ...m.attributes };
      for (const k of cleared) attributes[k] = null;
      return { ...m, attributes };
    });
  let out: Project = {
    ...withMembers(project, members),
    ties: project.ties.filter((t) => !gone.has(t.rater_id) && !gone.has(t.ratee_id)),
  };
  for (const id of ids) out = removeFromWaves(out, id);
  return out;
}

/** The key a new attribute would get: its label as an import header reads it
 *  (so a members file with that column matches), made unique. */
export function attributeKeyFor(project: Project, label: string): AttributeKey {
  const base = normaliseHeader(label).replace(/[^\p{L}\p{N}_]/gu, '') || 'attribute';
  const used = new Set(project.attribute_definitions.map((a) => a.key));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${String(n)}`)) n += 1;
  return `${base}_${String(n)}`;
}

/** Adds an attribute that every member holds as not recorded. A project has at
 *  most one email attribute, keyed `email` (spec §4.1). */
export function addAttribute(project: Project, label: string, type: AddableAttributeType): Project {
  const text = label.trim();
  if (text === '') return project;
  if (type === 'email' && project.attribute_definitions.some((a) => a.type === 'email')) {
    return project;
  }
  const key =
    type === 'email' && !project.attribute_definitions.some((a) => a.key === 'email')
      ? 'email'
      : attributeKeyFor(project, text);
  const definition: AttributeDefinition = { key, label: text, type, builtin: false };
  return {
    ...project,
    attribute_definitions: [...project.attribute_definitions, definition],
    members: project.members.map((m) => ({ ...m, attributes: { ...m.attributes, [key]: null } })),
  };
}

/** Renames an attribute's label; its key, and so the matching import column, stays. */
export function renameAttribute(project: Project, key: AttributeKey, label: string): Project {
  const text = label.trim();
  const def = project.attribute_definitions.find((a) => a.key === key);
  if (!def || text === '' || def.label === text) return project;
  return {
    ...project,
    attribute_definitions: project.attribute_definitions.map((a) =>
      a.key === key ? { ...a, label: text } : a,
    ),
  };
}
