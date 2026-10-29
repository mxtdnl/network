// Attribute values that differ only in case or spacing (build plan session
// 13): "Finance", "finance" and "Finance  " in one members file would be read
// as three teams. They are found and offered to the analyst, who chooses which
// to reconcile; nothing is changed unless chosen. The spelling kept is the
// most common one, the first in the file on a tie.

import { normaliseLabel } from './match';
import type { MembersResult } from './validate';

export interface AttributeVariant {
  attribute: string;
  /** Every spelling found, most common first, with how many members have it. */
  forms: { value: string; count: number }[];
  /** The spelling the others become. */
  preferred: string;
}

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** Spellings of one value that differ only in case or spacing, per category attribute. */
export function findVariants(members: MembersResult): AttributeVariant[] {
  const out: AttributeVariant[] = [];
  for (const def of members.attributes) {
    if (def.type !== 'categorical' && def.type !== 'ordinal') continue;
    const groups = new Map<string, Map<string, number>>();
    for (const m of members.members) {
      const v = m.attributes[def.key];
      if (v == null) continue;
      const key = normaliseLabel(v);
      const forms = groups.get(key) ?? new Map<string, number>();
      forms.set(v, (forms.get(v) ?? 0) + 1);
      groups.set(key, forms);
    }
    for (const forms of groups.values()) {
      if (forms.size < 2) continue;
      // Map keeps file order, so a stable sort leaves the first spelling first on a tie.
      const list = [...forms].map(([value, count]) => ({ value, count }));
      list.sort((a, b) => b.count - a.count);
      out.push({ attribute: def.key, forms: list, preferred: list[0]?.value ?? '' });
    }
  }
  return out;
}

/** Applies the chosen reconciliations: each variant's spellings become its preferred one. */
export function reconcileMembers(
  members: MembersResult,
  chosen: readonly AttributeVariant[],
): MembersResult {
  if (chosen.length === 0) return members;
  const replace = new Map<string, Map<string, string>>();
  for (const v of chosen) {
    const map = replace.get(v.attribute) ?? new Map<string, string>();
    for (const f of v.forms) if (f.value !== v.preferred) map.set(f.value, v.preferred);
    replace.set(v.attribute, map);
  }
  const next = members.members.map((m) => {
    const attributes = { ...m.attributes };
    for (const [key, map] of replace) {
      const v = attributes[key];
      if (v != null && map.has(v)) attributes[key] = map.get(v) ?? v;
    }
    return { ...m, attributes };
  });
  const attributes = members.attributes.map((def) => {
    if (!replace.has(def.key) || !def.categories) return def;
    const values = new Set<string>();
    for (const m of next) {
      const v = m.attributes[def.key];
      if (v != null) values.add(v);
    }
    return { ...def, categories: [...values].sort(naturalCompare) };
  });
  return { ...members, members: next, attributes };
}
