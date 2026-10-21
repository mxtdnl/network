# Group by formal manager: design and build prompts

Status: **proposal, not approved**. It needs the owner's approval of an amendment to spec §8 ("Grouped by attribute" becomes "Grouped by attribute or by formal reporting line") before anything is built, because `CLAUDE.md` makes `spec.md` the source of truth. Decision numbers D137–D138 and question Q37 are reserved here; the build session records them in `CLAUDE.md`.

## 1. What exists today

- "Group by" (`MapSettings.groupBy`, an `AttributeKey`) drives the grouped and circular layouts (`layoutRequest`, `memberGroups` in `src/ui/map/useMapModel.ts`). Its options are `groupAttributes(project)` (`src/ui/map/model.ts`), which excludes `member_ref` and `email` attributes, so the manager attribute can never be chosen.
- The formal hierarchy layout (D62) already reads the manager attribute (`managerAttribute`: `manager_id`, else the first `member_ref`), breaks cycles (`hierarchyParents` in `src/ui/map/layout.ts`) and is offered only when `hierarchyAvailable(project)`.
- Groups also feed node fill, map filters, edge colour "Within or between groups" (D126), the adjacency matrix's order (D65), the metrics table's fill column (D66), and the engine's mixing measures (E-I, cross-group density) through `AnalysisInput.attributes` (`src/engine/input.ts`, which skips `member_ref`).
- On the demo, the groups a manager rule produces are identical to `team` (5 managers, each with the 7 other members of their team). The demo therefore cannot show the feature; tests need their own fixture.

## 2. Proposed behaviour

### D137 Line groups (derived from the formal manager attribute)

Two derived groupings, offered wherever an attribute can group members, listed after the attributes under a separator "Reporting line":

| Grouping | Rule | Label |
|---|---|---|
| **Line manager's team** (`@line`) | A member who manages anyone forms a group with their direct reports; a member who manages no one belongs to their manager's group; a member with neither manager nor reports has no value ("No reporting line recorded"). A manager who also has a manager sits in the team they lead, so every member is in exactly one group | "Team of <manager>" |
| **Branch** (`@branch:<d>`) | Everyone at or below the same manager at depth d of the hierarchy (depth 0 = a member with no manager); members above depth d form "Above level d". Offered for d = 1 … (deepest level − 1) | "Branch of <manager>" |

Reasons for these rules:
- Manager-with-reports keeps each manager's ties to their own reports inside the group, so E-I and cross-group density measure contact between teams rather than counting every line relationship as crossing. The alternative, grouping by shared manager ("Reports to X", manager placed with their peers), makes every manager–report tie a between-group tie; it is recorded as Q37 for the owner rather than offered as a third option.
- Branch is needed at 100–250 members, where line teams number 20–50: past 8 groups node fill collapses into "Other (n groups)" (D53), while a branch at depth 1 or 2 gives a handful of groups. It is built second and can be dropped without affecting the first.

The parents come from `managerAttribute` and `hierarchyParents`, so cycles are broken exactly as in the hierarchy layout. Availability follows `hierarchyAvailable(project)`: when it is false neither grouping is listed and the "Group by" help line says how to add manager ids (the hierarchy radio's existing text).

### D138 How derived groups flow through the app

**Representation.** Derived groups are *virtual attributes*: reserved keys beginning with `@` that are never stored on members. A single accessor replaces direct reads of `member.attributes[key]` wherever a key may be a grouping key:

```ts
// src/data/lineGroups.ts (pure, no UI imports)
export type LineGroupingKey = '@line' | `@branch:${number}`;
export function isLineGrouping(key: string): key is LineGroupingKey;
export function lineGroupings(project: Project): LineGroupingKey[];          // [] when unavailable
export function lineGroupValues(project: Project, key: LineGroupingKey): (MemberId | null)[]; // group = leading manager's id
export function groupColumn(project: Project, key: string): (string | null)[]; // attribute or derived, per member
```

Values are the leading manager's **member id**, never a name, so nothing in `data/` or the engine handles names. They are memoised per project object (as `memberNames` is).

**Labels.** Every place that shows a group value goes through one function in the names layer, `names.groupLabel(key, value)` (`src/ui/state/names.ts`): for an ordinary attribute it returns the value; for a line grouping "Team of " / "Branch of " plus `names.of(managerId)`, so hidden names give codes (D79) and the ESLint rule on `display_name` keeps holding. Raw manager ids must never reach the screen, a CSV, the SVG, the PDF or a saved view's caption.

**Where it applies.**

| Place | Behaviour |
|---|---|
| Group by (grouped and circular layouts) | Listed; group order is the hierarchy's order (managers by depth, then by name or code), "No reporting line recorded" last |
| Node fill | Listed; at most 8 hues as now, then "Other (n groups)" |
| Map filters | Listed; filter chips show labels |
| Edge colour "Within or between groups" | Follows the fill grouping, as now |
| Adjacency matrix order, metrics table fill column | Listed |
| Engine mixing (E-I, cross-group density) | `buildAnalysisInput` adds each available line grouping as an `AttributeColumn` (values are member ids, categories in hierarchy order); the engine is unchanged. `inputKey` already changes with the project revision, so a manager edit re-runs it |
| Insights | Unchanged: the silo rule stays on `INSIGHT_RULES.silo.attributes` (`team`), so no observation changes (Q26) |
| Exports | Member metrics CSV adds a "Line manager's team" column (labels); network metrics CSV includes the line grouping's E-I rows with labels; the PDF report's "mixing by team" table is unchanged |
| Saved views | `groupBy`, `fill.key` and filter keys may hold a line grouping key. No schema change: the fields are already strings and are checked on load; a view whose grouping is no longer available falls back as for a removed attribute (D76) |

**Reserved keys.** Attribute keys beginning with `@` are refused: `attributeKeyFor` already strips them in the Members tab; the import validator and `parseProject` must also refuse or rename them, so a user attribute cannot shadow a derived one.

**Legend and copy.** The legend reads "Grouped by line manager's team" / "Grouped by branch at level d"; copy in `src/ui/copy/map.ts`. Under anonymisation the small-group warning (D79) is extended: a line team of fewer than 3 members is named in the status line count, because reporting lines can identify people even under codes.

**Method notes.** §11 "Layouts" and the E-I and cross-group density sections gain the two rules, the cycle rule, and the caveat that line groups are only as current as the imported manager ids.

## 3. Out of scope

- Grouping by shared manager ("Reports to X"): Q37.
- Running the silo insight on line groups: it would change observations, which needs the owner (Q26).
- Matrix-organisation support (dotted-line managers): the schema holds one formal manager per member.
- Changing the demo to have line teams that differ from `team`: it would change insights and the fixture hash; tests use their own fixture instead.

## 4. Questions for the owner

- **Spec amendment.** Approve changing spec §8 "Grouped by attribute" to "Grouped by attribute or by formal reporting line (line manager's team, or branch at a chosen level)", and §6's "E-I index and cross-group density, by any attribute" to include reporting-line groups.
- **Q37.** Line manager's team (manager with reports, proposed) or shared manager (peers without their manager) as the definition?
- **Branch.** Build the branch grouping (prompt 3) or only line teams?

## 5. Build prompts

Each prompt is one Claude Code session on the configured branch. Run them in order; each ends with the repo's checks green and a commit. Prompt 0 only after the owner has answered section 4.

### Prompt 0: record the decision

```text
Read CLAUDE.md, spec.md §6 and §8, and docs/group-by-manager.md. The owner has approved the
spec amendment in section 4 of that document and answered Q37 with: <answer>, and the branch
grouping with: <build / do not build>.
1. Amend spec.md §6 and §8 with the approved wording.
2. Add a new section "Group by formal manager" to CLAUDE.md after "Compact layout and map
   readability", with rows D137 and D138 from docs/group-by-manager.md (status Approved, date
   today), adjusted to the owner's answers, and resolve Q37 under "Resolved questions".
3. Do not write code. Commit as "Record group-by-manager decisions (D137, D138)" and push.
```

### Prompt 1: derived line groups in the data layer

```text
Implement D137's data core as specified in docs/group-by-manager.md §2 (read it, CLAUDE.md
D37, D62, D79 and D138 first).
- Create src/data/lineGroups.ts with isLineGrouping, lineGroupings, lineGroupValues and
  groupColumn. Move hierarchyParents from src/ui/map/layout.ts and managerAttribute /
  hierarchyAvailable from src/ui/map/useMapModel.ts into src/data/ (re-export or update every
  import; data/ must not import from ui/). Values are member ids; memoise per project object.
- Line manager's team: a member with reports leads a group of themselves plus direct reports;
  a member without reports joins their manager's group; neither → null. Cycles broken as
  hierarchyParents does. Group order: by depth, then project order (names are applied in ui/).
- If the owner approved the branch grouping, leave it to prompt 3; lineGroupings returns
  only '@line' for now.
- Reserve keys starting with '@': parseProject refuses an attribute key starting with '@'
  with a load error worded like its neighbours; the import validator reports such a header as
  an error (wording in ui/copy/import.ts). Check attributeKeyFor already strips '@'.
- Unit tests in tests/unit/lineGroups.test.ts with a constructed fixture whose line teams
  differ from team (a cross-team manager, a two-level tree, a member with no line, a cycle,
  a self-manager): every rule, ordering, availability, and that the demo's line teams equal
  its team groups. Also test the '@' refusals.
Run npm run lint, typecheck and the unit tests; all must pass. Commit and push.
```

### Prompt 2: the grouping in the map, linked views and engine

```text
Implement D138 (docs/group-by-manager.md §2) on top of src/data/lineGroups.ts.
1. Names layer: add groupLabel(key, value) to MemberNames in src/ui/state/names.ts; for a line
   grouping it returns copy "Team of {name}" via names.of(managerId), else the value. Add the
   copy to src/ui/copy/map.ts. Never show a raw manager id.
2. Replace every direct read of member.attributes[key] where key can be a grouping key with
   groupColumn: memberGroups and groupingAttribute (useMapModel.ts), memberMatchesFilters and
   fill grouping and the "Within or between groups" edge colour (model.ts), attributeValues
   callers, AdjacencyView ordering, TableView fill column. Grep for `attributes[` and
   `attributeValues(` under src/ui to find them all; list what you changed in the commit body.
3. effectiveSettings: a groupBy, fill key or filter key that is a line grouping stays valid
   while lineGroupings(project) includes it, else falls back as for a removed attribute.
4. MapControls: in Group by, Node fill and filters, list line groupings after the attributes
   in an <optgroup> labelled "Reporting line"; when hierarchyAvailable is false show the
   existing help text for adding manager ids. Legend: "Grouped by line manager's team" and the
   circle variant; group names via groupLabel.
5. Engine input: buildAnalysisInput adds each available line grouping as an AttributeColumn
   (values are member ids). Confirm the engine's mixing measures pick it up, the silo insight
   does not (INSIGHT_RULES unchanged), and that no observation on the demo changes (compare
   insights before and after in a unit test).
6. Layout keys: the grouped/circular layout key must change when manager ids change and when
   names are hidden (labels and in-group order). Check the layout worker (D111) still gives
   the same result as the main thread.
Tests: extend tests/unit/map.test.ts and phase5.test.ts for groups, fill, filters, edge
colour and labels with names hidden; add a case to tests/e2e/map.spec.ts that opens a project
with the prompt-1 fixture (saved as a TypeScript string per D34), chooses "Line manager's
team" in Group by, and checks the legend and an axe scan. Run lint, typecheck, unit and the
map e2e tests; all must pass. Commit and push.
```

### Prompt 3 (only if approved): branch grouping

```text
Add the branch grouping from docs/group-by-manager.md §2 (`@branch:<d>`).
- lineGroupValues for '@branch:d': the ancestor at depth d (depth 0 = no manager) of each
  member at depth ≥ d; members above depth d share the value "@above"; members with no line
  are null. lineGroupings lists '@branch:1' … deepest − 1 only when that depth exists.
- UI: in Group by and Node fill, one option "Branch" with a second select "Level" (1 … n)
  shown only when Branch is chosen; groupLabel gives "Branch of {name}" and "Above level {d}".
- Saved views: a branch level deeper than the current hierarchy falls back to '@line'.
- Unit tests on the prompt-1 fixture plus a 250-member tree generated in tests/fixtures
  (seeded, depth 4); e2e: choose Branch level 1 and check the group count in the legend.
Run lint, typecheck, unit and map e2e tests. Commit and push.
```

### Prompt 4: exports and anonymisation

```text
Carry line groups into exports and the anonymisation checks (D79, D107–D110, D138).
- Member metrics CSV: a "Line manager's team" column (labels via groupLabel) when available;
  network metrics CSV: E-I and cross-group density rows for the line grouping, groups by
  label. PNG/SVG/PDF legends use groupLabel. The PDF report's mixing table stays by team.
- tests/unit/exports.test.ts: with the prompt-1 fixture and names hidden, assert no display
  name and no member id appears in any export because of line-group labels; with names shown,
  assert the labels are present (counter-check). Extend the anonymisation sweep in
  tests/e2e/present.spec.ts to render the grouped layout and fill by line team with names
  hidden.
- Small groups: when names are hidden and a line team has fewer than 3 members, include it in
  the status line's small-group count (copy in ui/copy/names.ts).
Run lint, typecheck, unit tests, export.spec.ts and present.spec.ts. Commit and push.
```

### Prompt 5: documentation

```text
Document line groups. Update docs/method-notes.md (§11 Layouts; the E-I and cross-group
density sections: the rule, cycle breaking, the caveat that groups are as current as the
manager ids) without renumbering sections (D117). Update docs/user-guide.md's map section
with a short paragraph and one screenshot taken by tests/e2e/guide.spec.ts with names hidden,
using the prompt-1 fixture. Add the D137/D138 "Built" notes to CLAUDE.md in the style of
D125–D136, with anything that deviated from the design. Run the guide spec and unit tests.
Commit and push.
```
