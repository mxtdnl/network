// The attribute the group insight rules use (silos, formal–informal gaps,
// negative ratings not returned): the project's choice
// (settings.insight_group) when it is still a category attribute, otherwise
// team. Mirrors groupAttribute in src/engine/insights.ts, so the copy names
// the attribute the rules ran on.

import type { AttributeDefinition, Project } from '../../data/schema';

/** Attributes members can be grouped by: categories and ordered categories. */
export function groupingAttributes(project: Project): AttributeDefinition[] {
  return project.attribute_definitions.filter(
    (a) => a.type === 'categorical' || a.type === 'ordinal',
  );
}

/** The attribute the rules group by, or null when members have none. */
export function insightGroup(project: Project): AttributeDefinition | null {
  const options = groupingAttributes(project);
  const chosen = project.settings.insight_group;
  return options.find((a) => a.key === chosen) ?? options.find((a) => a.key === 'team') ?? null;
}
