# Build plan

Date: 2026-10-22. Basis: the consultant review (`docs/reports/consultant-review.md`, Q38), the initial assessment (`docs/reports/initial-assessment.md`, Q37), and the owner's request of 2026-10-22 to replace the tie-strength threshold with a range. Status: a plan. Nothing in it is built, and each session changes the specification or a recorded decision only within the scope its prompt states.

## 1. How to use this plan

- **One session, one conversation.** Each session is a Claude Code conversation on its own branch that ends in one pull request. Start each in a new chat and paste its prompt from section 4; the prompt points back to this file for detail.
- **A pasted prompt is the go-ahead** for the scope it states, including the specification changes it names. Anything outside that scope, and any other change to `spec.md`, needs a question first (`CLAUDE.md`, "Source of truth").
- **Checkpoints.** A session with a checkpoint measures the options, presents them and waits for the owner's choice before building that part.
- **Order.** Run the sessions in the order of section 3, respecting "After". Sizes follow the review: **S** is a change to existing code and copy, **M** a new view, rule set or screen, **L** a new capability that changes the data model, the architecture or the specification's scope. An L session may split into two pull requests.
- **Before session 1,** the owner's open release steps stand: tag v1.0.0 and run the live check (Q35).

## 2. Standing rules for every session

Every prompt says "Follow the standing rules in `docs/build-plan.md` §2". They restate the project's conventions, so no prompt needs to repeat them.

1. Read `CLAUDE.md`, the `spec.md` sections the session names, and the session's part of section 4 before changing anything.
2. Record each decision as the next D-number in `CLAUDE.md`, with its date, status ("Approved (owner, build plan session n)" for scope the prompt approves) and files. Amend `spec.md` wherever the session changes scope.
3. Keep wording in `src/ui/copy/` (D9). Insight and question strings pass the banned-word list (D74); all copy is sentence case and plain (spec §12).
4. Take design values only from tokens (D16). Add new tokens to `src/styles/tokens.css` and the tables in `docs/design-system.md`; new data colours must pass `tests/unit/contrast.test.ts`.
5. Take names only through `src/ui/state/names.ts` (D79), and add every new view to the anonymisation sweep in `tests/e2e/present.spec.ts`.
6. Make every new output follow both export settings, Hide names and "Leave out valence, energy and conflict" (D105), with cases in `tests/unit/exports.test.ts`.
7. Make every screen work in the full, compact (D125), tablet and read-only phone layouts (D112), by keyboard, with reduced motion, and with no serious or critical axe violation.
8. Keep the engine pure TypeScript in the worker (`src/engine/`). Give each new metric a method-note section, appended and never renumbered (D117). Where NetworkX has an equivalent, add reference values to `scripts/generate_fixtures.py`, run under Python 3.11 (D128).
9. Allow one schema version per release. While the current version is unreleased, extend it in place with optional fields (D102, D127). After a release, raise the version with a migration, a fixture in `tests/fixtures/migrations/` and a round-trip test (D75, D128). Check `git tag` and `CLAUDE.md` for the release state first.
10. Measure rule changes before and after on the demo and the twelve scenario projects (`npm run scenarios:measure`), add outcome tests, and report changed observations to the owner (Q26).
11. Before each push, run `npm run lint`, `npm run typecheck`, `npm test` and the end-to-end specs the session touches. Regenerate the screenshots a change affects (the user guide with `GUIDE_DIR=docs/user-guide`, D116).
12. Update `docs/user-guide.md` and `docs/method-notes.md` for every visible or method change; Help bundles both (D115).
13. Make no runtime request to another origin. Justify any new dependency in `CLAUDE.md` with its licence, its size and a check that it runs under the Content Security Policy (D106).
14. Finish with a pull request whose description lists the decisions recorded.

## 3. Sessions at a glance

| # | Session | Review | Size | After | Specification and decisions touched | Checkpoint |
|---|---|---|---|---|---|---|
| 1 | Defects found in the review | App. A | S | – | D116, D125 | – |
| 2 | Tie-strength range (owner request) | §5 | S | – | Spec §8; D54, D73, D129 | Named bands |
| 3 | Insight rules on realistic data | §7; Q37 | M | 1 | D26, D72, D130, Q26 | Thresholds, conflict treatment |
| 4 | Data-quality checks and statement | §7 | M | 3 | Spec §6; D29 | Flag thresholds |
| 5 | Data remedies | §7 | M | 4 | Method notes §1.3; plan Q3 | Methods and defaults |
| 6 | Groups view by any attribute | §5, §6 | M | 3 | Spec §8 | – |
| 7 | Bridges, single points of failure, load | §5, §6 | M | 6 | Spec §6, §9 | Rule thresholds |
| 8 | Questions first; readouts; composite under Advanced | §4 | M | 6, 7 | Spec §7, §8; D60, D130 | Question catalogue |
| 9 | Audience levels and the personal network card | §8 | M | 6 | Spec §8, §10, §11 | Group size, level content |
| 10 | Executive narrative and storyline report | §8 | M | 4, 9 | Spec §11; D108 | Summary template |
| 11 | Custom relations and a question bank | §10 | M | 3 | Spec §4.2; D26 | Roles, bank content |
| 12 | Survey design support | §10 | M | 11 | Spec §15.1, §15.4 | Context questions |
| 13 | Import from survey tools | §7 | M | 1 | Spec §5 | – |
| 14 | Waves 1: repeat a survey, analyse any wave | §6, §10 | M | 12 | Spec §2, §4.4, §6; D29 | – |
| 15 | Waves 2: what changed | §5, §6 | L | 6, 14 | Spec §6, §8, §11 | Change thresholds |
| 16 | Engagement guide and action log | §9 | M | 10, 14 | Spec §2, §12 | Steps, intent scale |
| 17 | Workshop pack, slides and annotations | §5, §8 | M | 9, 10 | Spec §11 | PPTX |
| 18 | Chance baselines and core–periphery | §6 | M | 6 | Spec §6, §9 | Use in rules |
| 19 | Inclusion analysis with safeguards | §6 | M | 9, 18 | Spec §10 | Data protection, group size |
| 20 | Options to consider | §9 | M | 16 | Spec §2; insight wording | Descriptive stance |
| 21 | Ciphertext relay | §10 | L | 14 | Spec §2, §10, §15.6 | Provider and hosting |
| 22 | Aggregated interaction data | §10 | L | 11 | Spec §2, §5 | Legal advice |

**From the review's section 11 to sessions.** 1 → sessions 1 and 3; 2 → 4; 3 → 6 (rules on any attribute in 3); 4 → 9 and 10; 5 → 8; 6 → 11; 7 → 4 and 5; 8 → 7; 9 → 14 and 15; 10 → 16; 11 → 17; 12 → 18; 13 → 21; 14 → 19; 15 → 20; 16 → 22. Session 2 is the owner's request. Sessions 12 and 13 carry review items outside its table (survey design support, imports from survey tools).

**Releases.** 1.1.0 after sessions 1–7; 1.2.0 after 8–13; 2.0.0 after 14–17, because waves and the engagement record change the specification's scope and the project file; sessions 18–22 as decided.

**Project file.** Sessions 2, 3, 5, 7, 8, 9, 10, 11, 12, 14, 16, 17 and 19 change it. Under rule 9, sessions before release 1.1.0 extend schema 4 in place while it is unreleased; the first session after a release that changes the file raises the version, and the rest of that release extends it in place.

## 4. Sessions

Each session lists its goal, the suggested modules (new files are marked "new"), what proves it done, and the prompt to paste.

### 4.1 Session 1. Defects found in the review

**Goal.** Fix defects A1, A2 and A4–A8 of the review's Appendix A. A3 goes to session 3, which removes conflict layers from the silo rule.

**Suggested modules.** `tests/e2e/guide.spec.ts`; `docs/user-guide/*.jpg` (regenerated); `src/ui/copy/data.ts` (one coverage formatter); `src/ui/views/TopBar.tsx`, `StatusLine.tsx`, `CoveragePanel.tsx`, `InsightsPanel.tsx`, `MapView.tsx`; `src/ui/views/Workspace.tsx` (left column by tab); `src/styles/layout.css` (map tools); `src/ui/export/report.ts`, `src/ui/copy/export.ts`; `tests/e2e/audit.spec.ts`; `tests/unit/exports.test.ts`.

**Done when.** The regenerated guide images show their panels, coverage never reads "80%, below the 80% threshold", the tools-against-legend check passes at the compact sizes, and the report tests cover A7 and A8.

```text
Session 1 of docs/build-plan.md: fix the defects found in the consultant review.

Follow the standing rules in docs/build-plan.md §2, and read §4.1 there and Appendix A of docs/reports/consultant-review.md.

Fix A1, A2 and A4–A8 (A3 belongs to session 3):
- A1: the user guide's member-panel, insights and coverage screenshots show only the collapsed right rail, and survey-setup.jpg is two-thirds blank. Capture the open drawer (or take those shots in the full layout), keep the survey setup shot within the page, assert in tests/e2e/guide.spec.ts that each image shows its panel, and regenerate docs/user-guide/.
- A2: at 79.6 % the app says "Coverage 80% is below the 80% threshold". Add one coverage formatter that keeps one decimal place whenever whole-number rounding would reach or cross the threshold, and use it wherever coverage is shown: top bar, map note, insights, Coverage panel, report.
- A4: in the compact layout with the drawer open, Lasso select covers the legend. Keep the map tools clear of the legend, and add an end-to-end check that their boxes never overlap at 1280 × 720, 1366 × 768 and 1440 × 900, drawer open and closed.
- A5: until the project has at least one rating, show a neutral "No ratings yet" note instead of the coverage warning.
- A6: while Members or Survey is the centre tab, the left column shows Layers only, with a line saying the map settings are on the Map tab.
- A7: in the report's key-metrics table, leave out the structural measures for negative sub-layers (separate parts, communities, modularity, centralisation of bridging); keep their ties, density and reciprocity.
- A8: explain "Not recorded" in the report's table of rating sources.

Record the batch as one decision. Done when lint, typecheck, unit tests and the guide, audit, export and present specs pass, and the regenerated guide images show their panels; then open a pull request.
```

### 4.2 Session 2. Tie-strength range (owner request)

**Goal.** Replace "Tie strength at least" with a range, so the map can show, for example, only ties from 0.30 to 0.50. The default stays 0.30 to 1.00 (D129). Like the threshold, the range changes only what is drawn; every metric still uses all ties (plan Q6).

**Where the threshold lives today.** The filter is `shown` in `src/ui/map/model.ts` (line 570: `w > 0 && w >= settings.threshold`). The setting is `MapSettings.threshold`, with `DEFAULT_THRESHOLD = 0.3`, in `src/ui/state/store.ts`. The slider is in `src/ui/views/MapControls.tsx` (lines 435–457), and the legend line in `src/ui/map/legend.ts` (lines 162–164) with copy in `src/ui/copy/map.ts` (`threshold`, "Ties below … hidden", and the empty-map message). Insight views set 0 in `src/ui/state/insights.ts` (line 48). Saved views capture it in `src/ui/state/savedViews.ts` (line 54), declare it in `src/data/schema.ts` (line 142), check it in `src/data/projectFile.ts` (line 360) and migrate it in `src/data/migrations.ts` (line 103).

**Suggested modules.** All of the above. Optionally a new `src/ui/components/RangeSlider.tsx` holding two labelled native range inputs that stay ordered. Also `docs/method-notes.md` §11 ("Map display rules"), `docs/user-guide.md` (map settings) and `spec.md` §8 (Interaction).

**Notes.**
- Compare weights with the bounds inclusively, with a tolerance of 10⁻⁹. Composite weights are sums of fractions, and a tie meant to sit on a bound must not be lost to rounding.
- In the directed view, a direction counts when it is within the range. A pair is one line only when both directions are (D131); otherwise it is a one-way tie.
- An insight's view sets the full range, because its rule counted every tie (D129).
- The initial assessment's option to draw negative ratings whatever the range is part of session 3 (issue 9).
- Named bands such as "Close ties only" (review §5) come only after the checkpoint.

**Done when.** The map, saved-view, project-file and export unit tests and `map.spec.ts` pass, including both sliders by keyboard and with a screen reader name, and axe.

```text
Session 2 of docs/build-plan.md: replace the tie-strength threshold with a range.

Follow the standing rules in docs/build-plan.md §2 and read §4.2 there. This is my own request (2026-10-22): instead of a slider that only shows ties at or above one value, let me show the ties between two values, for example from 0.30 to 0.50.

Build:
- Map settings: replace `threshold` with a lower and an upper bound; the default stays 0.30 to 1.00 (D129). A tie is drawn when its weight is above 0 and within the bounds, inclusive, compared with a tolerance of 1e-9.
- Controls: replace "Tie strength at least" with "Tie strength from" and "to": two labelled sliders (0 to 1, step 0.05), each showing its value. From can never exceed to; moving one past the other moves both. Keyboard and screen reader operation as for the current slider.
- Everything that uses the threshold follows the range: one-way and both-way pairs in the directed view (D131), the mutual view, the ego view, the hidden table for screen readers, the comparison mini maps if they apply it, and every export.
- Legend: "Ties below 0.30 hidden", "Ties above 0.50 hidden" or "Ties outside 0.30–0.50 hidden", as applies, followed by "Every metric uses all ties, hidden or not". Update the empty-map message to suggest widening the range.
- An insight's "Show on the map" and "Save as view" set the full range, 0 to 1 (amends D73 and D129).
- Saved views store both bounds. Follow rule 9: if schema 4 is still unreleased, add an optional upper bound (absent means 1); otherwise raise the version with a migration that turns a threshold t into the range t to 1.
- Amend spec §8 ("a tie-strength range" in place of "a tie-strength threshold slider"), method notes §11 and the user guide, and record the decision.

Checkpoint: measure on the demo and on tests/fixtures/synthetic.ts how many pairs are drawn for candidate named bands (for example all ties, close ties only, occasional ties only), as D129 did, and show me the counts before adding any band shortcuts. Build the range itself regardless.

Done when lint, typecheck, the unit tests (map, saved views, project file, exports) and map.spec.ts pass, including keyboard operation of both sliders and axe; then open a pull request.
```

### 4.3 Session 3. Insight rules on realistic data

**Goal.** Resolve issues 1, 2, 3, 5, 7, 8 and 9 of the initial assessment, defect A3, and the overlapping observations of review §4. Issues 4 and 6 belong to sessions 4 and 5.

**Suggested modules.** `src/engine/insights.ts` (`INSIGHT_RULES`, the silo, peripheral, broker and formal–informal rules, and a new count of negative ratings that are not returned); `src/data/defaults.ts` or `src/ui/state/presets.ts` and `src/engine/composite.ts` (the conflict treatment); `src/data/schema.ts` and `projectFile.ts` (the grouping attribute for the rules, as a project setting); `src/ui/map/model.ts` (drawing negative ratings whatever the range); `src/ui/copy/insights.ts`; `src/ui/views/InsightsPanel.tsx`; `scripts/measure-scenarios.ts`; `docs/method-notes.md` §8. New: `tests/unit/scenarioOutcomes.test.ts`.

**Done when.** The chosen changes are built, an outcome test per scenario and rule passes, and `insights.test.ts` and `insightsCopy.test.ts` pass.

```text
Session 3 of docs/build-plan.md: make the insight rules hold on realistic data (Q37).

Follow the standing rules in docs/build-plan.md §2, and read §4.3 there and issues 1–3, 5 and 7–9 of docs/reports/initial-assessment.md. Issues 4 and 6 belong to sessions 4 and 5.

Measure first, then stop: run npm run scenarios:measure and, for each proposal below, show me what the demo and each scenario report before and after. Wait for my choices on thresholds (Q26) and on the conflict treatment before building.

Proposals:
1. Silos (issue 1): skip the rule when the grouping attribute has fewer than two groups of the minimum size, or a group has no possible outside ties; require a minimum number of ties per group and layer.
2. Conflict layers (issues 2 and 3): leave layers in the conflict group out of the silo and peripheral rules. For the composite, show two options: default weight 0, or the signed layers' filter and multiplier treatments.
3. Relative rules (issue 5): a floor on betweenness for potential brokers, a minimum spread for peripheral members, and a cap of five on the peripheral list.
4. Grouping (issue 7): the analyst chooses the attribute the silo and formal–informal rules use, saved with the project; the copy names the attribute.
5. Copy (issue 8 and review defect A3): fix the silo sentence when the layer is the composite; no "How does work reach…" question on conflict ties.
6. One-way negativity (issue 9): a count of negative ratings that are not returned, by layer and group, worded as a question; and an option to draw negative ratings whatever the tie-strength range.
7. Overlap: where a list of members largely repeats a group observation (six of eight Finance members also listed as peripheral), say so in one observation rather than two.

Done when the chosen changes are built with outcome tests on the scenarios (new file tests/unit/scenarioOutcomes.test.ts), the copy test passes, method notes §8 and the user guide are updated and the decisions recorded; then open a pull request.
```

### 4.4 Session 4. Data-quality checks and statement

**Goal.** Show whether the data can bear a conclusion, and carry that judgement into every output (review §7; issues 4 and 6).

**Suggested modules.** New: `src/data/quality.ts` (main thread, beside `coverage.ts`, D29), `src/ui/views/DataCheckPanel.tsx` (replacing `CoveragePanel.tsx`), `src/ui/copy/quality.ts`, `tests/unit/quality.test.ts`. Changed: `src/data/coverage.ts`; `src/engine/types.ts` (`NodeFlag`); `src/engine/analyse.ts` (flags from the coverage the result already carries, D49); `src/ui/views/MemberPanel.tsx`, `TableView.tsx`; `src/ui/map/scene.ts`, `legend.ts` (non-respondents drawn hollow); `src/ui/export/report.ts`, `tables.ts`; `src/ui/views/PresentationView.tsx`, `ExportDialog.tsx`; `src/engine/insights.ts` and `src/ui/copy/insights.ts` (shared attributes of the members named).

**Done when.** `quality.test.ts` finds each condition built into the scenario projects (`docs/scenarios.md`): the silent members, the same-answer raters, the generous and harsh raters, the one-way ties.

```text
Session 4 of docs/build-plan.md: data-quality checks and a data-quality statement.

Follow the standing rules in docs/build-plan.md §2, and read §4.4 there, section 7 of docs/reports/consultant-review.md, and issues 4 and 6 of docs/reports/initial-assessment.md.

Build:
- src/data/quality.ts (main thread, beside coverage.ts, D29): coverage by group and by level; people who gave no ratings and people who gave few; each rater's style (mean rescaled rating, spread, share of the scale used, the same answer for everyone, share of colleagues reported as tied); the share of one-way ties by group and by level.
- Node flags for "gave no ratings" and "gave few ratings", shown wherever a value depends on the member's own ratings (member panel, table, the member CSV's reason column), and drawn on the map as a hollow node with its own legend entry.
- The Coverage tab becomes "Check the data", with these sections and a preview of the statement.
- A data-quality statement written from the structured results, with its wording in src/ui/copy, shown on the report cover, at the start of a presentation and in the Export dialog.
- Observations that name members also state the attribute values most of those members share (for example "three of the five joined in the last year"), and mark members who gave no ratings.

Checkpoint: propose thresholds for "few ratings", for a same-answer rater and for reporting unusually many ties, with counts on the twelve scenarios, and wait for my choice.

Done when tests/unit/quality.test.ts finds each condition built into the scenario projects (docs/scenarios.md), the statement appears everywhere listed, the export tests and the anonymisation sweep pass, and the method notes gain an appended section on these checks; then open a pull request.
```

### 4.5 Session 5. Data remedies

**Goal.** Analysis options that counter what session 4 shows, each previewed by its effect on the observations.

**Suggested modules.** `src/engine/aggregate.ts` (`combine`: a new rule); `src/engine/input.ts` and `composite.ts` (rescaling within each rater); `src/engine/analyse.ts`, `insights.ts`, `protocol.ts`; `src/ui/state/store.ts`, `analysisSync.ts`; `src/ui/views/MapControls.tsx` (Direction); `src/ui/views/DataCheckPanel.tsx` (previews on a second worker, as `src/ui/export/scope.ts` runs the exclusion); `scripts/generate_fixtures.py` and `tests/fixtures/*.json`; `docs/method-notes.md` §1.3.

**Done when.** The fixture, engine, insight and null-zero tests pass, and each option's preview matches a full analysis with that option.

```text
Session 5 of docs/build-plan.md: remedies for the data problems that session 4 shows.

Follow the standing rules in docs/build-plan.md §2, and read §4.5 there and method notes §1.3.

Build each of these as an analysis option saved in views, explained in the method notes, and previewed in "Check the data" by its effect on the observations (run on a second worker, as the export exclusion is, D105):
1. A fourth way to combine the two directions, "Both report a tie": a tie only where both directions are rated above 0. A missing direction gives no tie, unlike "Weaker of the two", which falls back to the one rating (plan Q3). Add it to the fixture script and the fixtures.
2. People who gave no ratings: left out of outgoing and path-based measures and out of the rules, or marked in them; and, for relations that are mutual by nature, an optional reconstruction of their ties from the other side's ratings, labelled as reconstructed.
3. Rater standardisation for the composite and strength: rescale each rater's ratings within that rater before combining.

Checkpoint: before building 2 and 3, show me each option's effect on the twelve scenarios, propose the method for 3 (ranks or z-scores within each rater) and the defaults, and wait for my choice.

Done when the fixture, engine and insight tests pass, the preview shows each option's effect, and the decisions are recorded; then open a pull request.
```

### 4.6 Session 6. Groups view by any attribute

**Goal.** Put group-to-group structure on screen: the first picture for a leadership audience, and the view for mergers, matrices and silos (review §5, §6).

**Suggested modules.** New: `src/ui/views/GroupsView.tsx`, `GroupMatrix.tsx` (a keyboard grid like `AdjacencyView.tsx`), `GroupMap.tsx` (canvas, per D8, with a table alternative), `src/ui/map/groupModel.ts`, `src/ui/copy/groups.ts`, `src/styles/groups.css`, `tests/unit/groups.test.ts`, `tests/e2e/groups.spec.ts`. Changed: `src/ui/views/Workspace.tsx` (the tab); `src/ui/state/store.ts`; `src/engine/analyse.ts` (mixing by community; mixing by every attribute already exists, line 147); `src/ui/export/report.ts` (mixing by the chosen attribute); `tests/e2e/present.spec.ts` (sweep).

**Done when.** The unit tests cover the group map model and community mixing, and the new end-to-end spec covers keyboard use, selection sync, axe and the three desktop layouts.

```text
Session 6 of docs/build-plan.md: a Groups view by any attribute.

Follow the standing rules in docs/build-plan.md §2, and read §4.6 there and section 5 of docs/reports/consultant-review.md.

Build a "Groups" centre tab between Table and Compare:
- Group by any categorical or ordered attribute, or by community; the layer is "Ties from", in the current view.
- A group connection matrix: the share of possible ties within each group and between each pair of groups, heat-coded on the matrix ramp, as a keyboard-operable grid like the adjacency matrix (D65), with a sentence for the focused cell ("Finance and Sales: 4 of 64 possible ties, 6 %").
- A group map: one node per group, sized by its members, joined by lines whose width is the share of possible ties between the groups, with a table alternative for screen readers.
- A table per group: members, ties inside, ties leaving, E-I.
- Choosing a group makes its members the subgroup, so the map, matrix and table follow (D64).
- The report's mixing table uses the chosen attribute instead of team only.
Use the mixing figures the engine already computes for every attribute (src/engine/analyse.ts), and add community as a grouping.

Done when unit tests cover the group map and community mixing, a new end-to-end spec covers keyboard use, selection sync, axe and the full and compact layouts, the anonymisation sweep includes the tab, and spec §8, the user guide and the method notes are updated; then open a pull request.
```

### 4.7 Session 7. Bridges, single points of failure and load

**Goal.** The tie-level and risk analyses of review §5 and §6, as measures, map marks and observations.

**Suggested modules.** New: `src/engine/metrics/bridges.ts` (edge betweenness, which graphology-metrics provides as `edgeBetweenness`; local bridges and their span), `cutpoints.ts`, `load.ts`; `src/ui/views/RankedBars.tsx`. Changed: `src/engine/analyse.ts`, `types.ts`, `insights.ts`; `src/ui/map/model.ts`, `scene.ts`, `legend.ts`; `src/ui/copy/insights.ts`, `metrics.ts`, `map.ts`; `src/styles/tokens.css` (the bridge mark); `scripts/generate_fixtures.py` (NetworkX `local_bridges`, `articulation_points`, `edge_betweenness_centrality`) and `tests/fixtures/*.json`.

**Done when.** The fixture, engine, insight, copy, contrast, map and export tests pass.

```text
Session 7 of docs/build-plan.md: bridges, single points of failure and load concentration.

Follow the standing rules in docs/build-plan.md §2, and read §4.7 there and sections 5 and 6 of docs/reports/consultant-review.md.

Build in the engine, with method-note sections and NetworkX reference values (local_bridges with span, articulation_points, edge_betweenness_centrality; Python 3.11):
- Edge betweenness (graphology-metrics has edgeBetweenness; check its normalisation against NetworkX) and local bridges with their span.
- The members and ties that are the only routes between two groups, and the cut points of the network.
- Load concentration on advice and workflow dependency: the share of incoming ties held by the top 10 % of members, overall and by group.
Then:
- Observations for "only routes between groups" and "concentrated demand", worded as questions, with their rules in INSIGHT_RULES.
- A "Mark bridge ties" option on the map, with a legend entry: a new data mark that passes the contrast test and is neither the accent nor the shortest-path ink.
- A ranked bar chart of incoming ties per member on a chosen layer, with a table alternative.

Checkpoint: propose the rule thresholds with counts on the demo and the twelve scenarios, and wait for my choice.

Done when the fixture, engine, insight, copy, map and export tests pass and the user guide shows the new marks; then open a pull request.
```

### 4.8 Session 8. Questions first, readouts, and the composite under Advanced

**Goal.** A newcomer starts from a question and reads sentences instead of decimals (review §4).

**Suggested modules.** New: `src/ui/state/questions.ts` (the catalogue: question, relations needed, settings, view), `src/ui/views/QuestionPicker.tsx`, `src/ui/views/MapHeader.tsx`, `src/ui/copy/questions.ts`, `src/ui/copy/readouts.ts`, `tests/unit/readouts.test.ts`. Changed: `src/ui/views/WeightPanel.tsx` (under "Advanced"), `MapControls.tsx`, `MemberPanel.tsx`, `Workspace.tsx`; `src/ui/state/store.ts` and `savedViews.ts` (the question saved with a view); `src/ui/copy/metrics.ts`; `tests/unit/insightsCopy.test.ts` (extended to questions); `tests/e2e/map.spec.ts`.

**Done when.** A newcomer's path (choose a question, read the sentences, save the view) is covered end to end, and the copy, map, member-panel and saved-view tests pass.

```text
Session 8 of docs/build-plan.md: questions first, plain-language readouts, and the composite under Advanced.

Follow the standing rules in docs/build-plan.md §2, and read §4.8 there and section 4 of docs/reports/consultant-review.md.

Propose first, then stop: a catalogue of six to ten questions a client asks (for example "How does information reach people?", "Where do teams connect, and where not?", "Whose time do others depend on?", "Where does work happen outside the formal structure?", "Who links groups that otherwise rarely meet?"), each with the relations it needs, the view and settings that answer it, and the sentences shown. Wait for my approval of the wording and the mapping.

Then build:
- A question picker at the top of the left column. The chosen question sets the view, becomes its title, and is the default caption when the view is saved. A question whose relation is not enabled or rated says so.
- A sentence for every number shown, generated from structured results with the wording in src/ui/copy: network measures (density, reciprocity, separate parts, communities, centralisation, E-I) and member measures, with a comparison a lay reader can use beside the rank ("a more open network than any of their 39 colleagues").
- The weight panel moves under "Advanced: combine layers", closed by default, and "Ties from" follows the question. When the composite is used, the map states its weights.
- Amend spec §7 and §8, and D60 and D130 as needed; extend the copy test to question strings.

Done when the copy, map, member-panel and saved-view tests pass, an end-to-end test follows a newcomer from question to saved view, and the user guide opens with questions; then open a pull request.
```

### 4.9 Session 9. Audience levels and the personal network card

**Goal.** One setting decides how fine-grained each output is, enforced as Hide names is (review §8).

**Suggested modules.** New: `src/ui/state/audience.ts` (one policy layer, like `names.ts`), `src/ui/copy/audience.ts`, `src/ui/views/AudienceSelect.tsx`, `src/ui/views/PersonalCard.tsx`, `tests/unit/audience.test.ts`, `tests/e2e/audience.spec.ts`. Changed: `src/ui/views/PresentationView.tsx`, `ExportDialog.tsx`; `src/ui/state/presentation.ts`; `src/ui/export/context.ts`, `scope.ts`, `report.ts`, `tables.ts`, `document.ts`; `src/ui/map/model.ts`, `legend.ts`; `src/data/schema.ts` (the default level and per-team consent).

**Done when.** An audience sweep, built like the anonymisation sweep, proves that at board level no member's code or name appears in the page, on the canvas or in any export, and that small groups are suppressed.

```text
Session 9 of docs/build-plan.md: audience levels and the personal network card.

Follow the standing rules in docs/build-plan.md §2, and read §4.9 there and section 8 of docs/reports/consultant-review.md.

Build audience levels, applied in one policy layer as names are (src/ui/state/names.ts) and enforced in presentation mode and every export:
- Board: groups and the whole network only; no individual, and no group below a minimum size.
- Leadership team: as board, plus roles such as the links between groups, where those involved have agreed.
- Team workshop: one team's own network, named only if the team agreed (a per-team consent setting), otherwise in codes.
- One-to-one: one person's network card, with their ties by group, given against received, sentences about their position, and change once waves exist.
The analyst's workspace stays unrestricted. The level is chosen in presentation mode and in the Export dialog, with a default saved in the project.

Checkpoint: propose the minimum group size and the exact content of each level, and wait for my choice.

Done when an audience sweep (built like the anonymisation sweep) proves that at board level no member's code or name appears in the page, on the canvas or in any export, and that small groups are suppressed; the presentation, exports and card pass axe; and spec §8, §10 and §11 are amended. Then open a pull request.
```

### 4.10 Session 10. Executive narrative and storyline report

**Goal.** The PDF reads as a briefing for executives, with the technical material in appendices (review §8).

**Suggested modules.** New: `src/ui/export/summary.ts` (draft headlines from the structured observations, using deterministic templates and no language model, so no data leaves the browser), `src/ui/views/SummaryEditor.tsx`. Changed: `src/ui/export/report.ts`, `pdf.ts`, `methodNotes.ts`; `src/ui/views/ExportDialog.tsx`; `src/ui/copy/export.ts`; `src/data/schema.ts` (the edited summary); `docs/method-notes.md` (reader-facing notes, appended); `docs/samples/` (regenerated).

**Done when.** The export tests cover the new sections at each audience level and under both export settings.

```text
Session 10 of docs/build-plan.md: an executive narrative, and a report built from a storyline.

Follow the standing rules in docs/build-plan.md §2, and read §4.10 there and section 8 of docs/reports/consultant-review.md.

Rebuild the PDF report (src/ui/export/report.ts, pdf.ts) as:
- a cover with the question, the audience level and the data-quality statement;
- an executive summary of two pages: three to five group-level headlines, each with "What we saw", "Why it may matter" and "Questions for discussion", drafted from the structured observations by deterministic templates (no language model) and edited by the analyst before export, saved with the project;
- one page per saved view, in presentation order, with its caption and sentences;
- data quality, then the method in brief, from new reader-facing notes appended to the method notes (one or two sentences per measure);
- appendices for key metrics, insight rules and the technical notes, then the ethics statement.
The Export dialog chooses the views, the audience level and whether to include the appendices.

Checkpoint: show me the summary template and one drafted summary for the demo before building the editor.

Done when the export tests cover the new sections at each audience level and under both export settings, docs/samples is regenerated, and the user guide describes the new report; then open a pull request.
```

### 4.11 Session 11. Custom relations and a question bank

**Goal.** Ask about the client's issue without re-purposing a built-in layer (review §10).

**Suggested modules.** New: `src/data/questionBank.ts`, `src/ui/views/LayerCreateDialog.tsx`, `src/ui/copy/questionBank.ts`, `tests/unit/customLayers.test.ts`. Changed: `src/data/schema.ts` (`LayerDefinition.role`, today only `formal` or `informal`, gains a vocabulary; layers with `builtin: false`), `defaults.ts`, `projectFile.ts`, `migrations.ts`; `src/ui/views/LayerPanel.tsx`; `src/ui/views/survey/SurveySetup.tsx`; `src/engine/insights.ts` (roles instead of keys); `src/ui/state/presets.ts`; `src/ui/export/scope.ts` (the exclusion by role); `src/survey/payload.ts`; `src/data/import/validate.ts`.

**Done when.** The project-file, survey, insight and export tests carry a custom relation end to end.

```text
Session 11 of docs/build-plan.md: custom relations with declared roles, and a question bank.

Follow the standing rules in docs/build-plan.md §2, and read §4.11 there and section 10 of docs/reports/consultant-review.md.

Propose first, then stop: a role vocabulary (for example formal, informal, information, advice, dependency, affect, friction, awareness, other) and how the rules, presets, composite and export exclusion treat each role; and a question bank of about 30 items grouped by purpose, each with its wording, scale, role and a note on sensitivity. Wait for my approval.

Then build:
- Relations the analyst creates: a label, wording, a scale from a fixed set (frequency 0–5, agreement 0–5, signed −3 to +3, categories) and a role. The key is generated from the label and never changes. Deleting one warns how many ratings go.
- The rules, presets and exclusion read roles instead of keys: overload reads the advice and dependency roles, and friction is left out with the signed layers.
- "Add from the question bank" in the Layers section and in Survey setup, with a topic placeholder (for example "How often do you give information about {topic}?").
- Custom relations travel through survey links, packages, responses, imports and exports.
- Amend spec §4.2 and the method notes' section on relationship layers.

Done when the project-file, survey, insight and export tests carry a custom relation end to end; then open a pull request.
```

### 4.12 Session 12. Survey design support

**Goal.** Help a newcomer design and run a survey that reaches the response rate a whole-network design needs (review §10).

**Suggested modules.** New: `src/ui/views/survey/LaunchKit.tsx`, `src/ui/copy/launchKit.ts`. Changed: `src/survey/model.ts`, `payload.ts`, `response.ts`, `collect.ts` (format versions raised; older versions stay readable); `src/respond/RespondApp.tsx`, `copy.ts`; `src/ui/views/survey/SurveySetup.tsx`, `SurveyDashboard.tsx`; `src/ui/copy/survey.ts`; `src/data/schema.ts`; `src/data/quality.ts` (the boundary answers); `docs/respondent-help.md`.

**Done when.** `survey.test.ts`, `respond.test.ts` and `survey.spec.ts` pass, including phones, keyboard-only use and axe.

```text
Session 12 of docs/build-plan.md: survey design support.

Follow the standing rules in docs/build-plan.md §2, and read §4.12 there and section 10 of docs/reports/consultant-review.md.

Build:
- Design guidance in Survey setup: relations suggested by purpose (from the question bank), what rating everyone and selecting first each record and cost, the response rate a whole-network design needs, and the burden estimate.
- A launch kit generated from the survey's settings: a sponsor's announcement, the invitation, two reminders, the respondent help, a confidentiality statement and a checklist for a data protection impact assessment, as text files.
- Optional context questions about the respondent's own situation (for example time in role, working pattern, main site), stored as member attributes on import with the respondent's consent.
- An optional boundary question: roughly how many people outside the roster the respondent relies on, by function, shown in "Check the data".
Any change to links, packages or responses raises their format version, and older versions stay readable.

Checkpoint: propose the context questions, how answers are stored and the consent wording, and wait for my approval.

Done when the survey and respond unit tests and survey.spec.ts pass (phones, keyboard only, axe), and the respondent help and user guide are updated; then open a pull request.
```

### 4.13 Session 13. Import from survey tools

**Goal.** Import a survey tool's export without reshaping it by hand (review §7).

**Suggested modules.** New: `src/data/import/wide.ts` (detection and reshaping), `src/data/import/match.ts` (matching people), `src/ui/views/ImportWizard.tsx`, `tests/unit/importWide.test.ts`, with fixtures written as TypeScript strings (D34). Changed: `src/ui/views/ImportDialog.tsx`; `src/ui/copy/import.ts`; `src/data/import/validate.ts`; `scripts/make-templates.ts` and `public/templates/` (a wide template); `tests/e2e/data.spec.ts`.

**Done when.** The tests cover detection, matching, ambiguous names and the validation report.

```text
Session 13 of docs/build-plan.md: import from survey tools.

Follow the standing rules in docs/build-plan.md §2 and read §4.13 there.

Build an import wizard for wide survey exports (one row per respondent, with a column for each colleague and question, as most survey tools produce): detect the format; map columns to relations and colleagues; match people by id, email or name (exact, then ignoring case and spacing, then suggestions that need confirmation); preview; and convert to the long rows that the existing validation report checks (as survey responses are, D97). Offer to reconcile attribute values that differ only in case or spacing. Add a wide-format template.

Done when unit tests with fixtures written as TypeScript strings (D34) cover detection, matching, ambiguous names and the validation report, data.spec.ts covers the wizard, and spec §5 and the user guide are amended; then open a pull request.
```

### 4.14 Session 14. Waves 1: repeat a survey, analyse any wave

**Goal.** Run the same survey again and analyse any one wave. This brings multi-wave work into scope (spec §2).

**Suggested modules.** `src/engine/input.ts` (line 49 reads wave 1 only), `analyse.ts`, `protocol.ts` (the input key includes the wave); `src/data/coverage.ts` (counts wave 1, D29); `src/ui/state/store.ts`, `analysisSync.ts`, `savedViews.ts`; `src/ui/views/TopBar.tsx`, `MapControls.tsx`; `src/survey/model.ts`; `src/ui/views/survey/SurveySetup.tsx`, `SurveyDashboard.tsx`; `src/data/schema.ts`, `projectFile.ts`, `migrations.ts`; `scripts/generate-scenarios.ts` (a two-wave scenario, as D138) and its committed output.

**Done when.** The engine, coverage, survey and saved-view tests cover two waves.

```text
Session 14 of docs/build-plan.md: waves 1, repeating a survey and analysing any wave.

Follow the standing rules in docs/build-plan.md §2 and read §4.14 there. This brings multi-wave work into scope: amend spec §2 accordingly.

Build:
- An analysis setting for the wave (by default the latest wave with ratings), read by the engine (src/engine/input.ts reads wave 1 only today), with coverage per wave (src/data/coverage.ts counts wave 1, D29), insights per wave, and the wave saved in views.
- "Repeat this survey": a new survey for the next wave, with the current roster, the same questions, and new tokens and links. The dashboard shows each wave.
- Members who joined or left between waves are handled explicitly: who was on the roster for each wave is recorded, and coverage and analysis use that roster.
- The wave is shown in the top bar, legends, presentation and exports.

Done when the engine, coverage, survey and saved-view tests cover two waves, a two-wave scenario project is added to the scenario generators (as D138 did), and the user guide explains repeating a survey; then open a pull request.
```

### 4.15 Session 15. Waves 2: what changed

**Goal.** Show what changed between two waves (review §5, §6; Granovetter, 1983, p. 229).

**Suggested modules.** New: `src/engine/metrics/change.ts`, `src/ui/views/ChangeView.tsx` (a "Two waves" mode in Compare), `src/ui/copy/change.ts`. Changed: `src/engine/protocol.ts`, `handler.ts`, `analyse.ts`, `insights.ts`; `src/ui/map/scene.ts`, `legend.ts`; `src/styles/tokens.css` (marks for gained and lost ties); `src/ui/export/report.ts`, `tables.ts`; `docs/method-notes.md`.

**Done when.** The engine, insight, export and end-to-end tests cover the two-wave scenario from session 14.

```text
Session 15 of docs/build-plan.md: waves 2, what changed between two waves.

Follow the standing rules in docs/build-plan.md §2 and read §4.15 there.

Build:
- Change analysis in the engine between two waves on one layer and view: ties gained, lost, strengthened and weakened; change in the group matrix, E-I, density, load concentration and bridges; change per member, for the one-to-one card. Members present in one wave only are reported, never guessed.
- A "Two waves" mode in Compare: before-and-after maps on fixed positions with gained and lost ties marked (new data marks that pass the contrast test), the change in the group matrix on the diverging scale, and sentences ("Ties between Product and Sales rose from 31 to 47").
- Change observations worded as questions; a change section in the report and slides; a change CSV.
- Method notes on reading change: different respondents in each wave, coverage in each wave, regression to the mean.

Checkpoint: propose the thresholds for "strengthened" and "weakened" and the minimum coverage in both waves for a change to be reported, with counts on the two-wave scenario, and wait for my choice.

Done when the engine, insight, export and end-to-end tests cover the two-wave scenario; then open a pull request.
```

### 4.16 Session 16. Engagement guide and action log

**Goal.** Carry a newcomer from question to action and back (review §9; the six steps of Terblanche & Erasmus, 2018).

**Suggested modules.** New: `src/ui/state/engagement.ts`; `src/ui/views/guide/EngagementGuide.tsx`, `ActionsPanel.tsx`, `IntentEditor.tsx`; `src/ui/views/tour/FirstRun.tsx`; `src/ui/state/tourStorage.ts` (a browser preference, like D20); `src/data/intent.ts` (expected against observed group ties); `src/ui/copy/engagement.ts`. Changed: `src/data/schema.ts`, `projectFile.ts`, `migrations.ts` (the engagement record); `src/ui/views/Workspace.tsx`; `src/ui/export/report.ts`, `tables.ts`; `src/data/persistence.ts` (Clear local data removes the tour key, D30).

**Done when.** The project-file, engagement and export tests pass, and the first run is covered end to end with axe.

```text
Session 16 of docs/build-plan.md: the engagement guide, a guided first run and the action log.

Follow the standing rules in docs/build-plan.md §2, and read §4.16 there and section 9 of docs/reports/consultant-review.md.

Propose first, then stop: the steps (Plan, Collect, Check, Understand, Discuss, Act, Re-measure) with each step's checklist and outputs, and the scale for the collaboration expected between groups. Wait for my approval.

Then build:
- An engagement record in the project: the business question, sponsor, roster boundary, governance (who sees what, and the retention date), default audience level, the client's prior expectations, the collaboration expected between groups, actions (the observation they answer, owner, date, status) and outcomes.
- The stepper, showing the controls each step needs and keeping the rest under "Advanced".
- Assessment against intent and expectations: where observed ties between groups fall short of or exceed the expected collaboration, and what the data show for each expectation.
- A guided first run on the demo with three tasks, kept as a browser preference (like D20) and removed by Clear local data.
- "Explain this view": a plain description of the current map.
- The action log in the report and as a CSV.

Done when the project-file, engagement and export tests pass, the first run is covered end to end with axe, and the user guide is reorganised around the steps; then open a pull request.
```

### 4.17 Session 17. Workshop pack, slides and annotations

**Goal.** The materials a consultant uses in the room (review §5, §8).

**Suggested modules.** New: `src/ui/export/slides.ts`, `workshop.ts`; `src/ui/views/AnnotationTools.tsx`. Changed: `src/ui/export/pdf.ts` (16:9 pages), `document.ts` (annotation primitives); `src/ui/map/scene.ts`, `controller.ts`; `src/data/schema.ts` (annotations in saved views); `src/ui/views/ExportDialog.tsx`; `src/styles/tokens.css`.

**Done when.** The export tests cover slides, the pack and annotations under both export settings and at each audience level.

```text
Session 17 of docs/build-plan.md: workshop pack, slides and annotations.

Follow the standing rules in docs/build-plan.md §2 and read §4.17 there.

Build:
- Slides: a 16:9 PDF deck with one slide per saved view (the question or caption as title, the map or groups view, the legend, the sentences), drawn with pdf-lib as the report is (D106).
- A workshop pack: for each group, its own network at the team-workshop audience level, its row of the group connection matrix, discussion prompts, and a page of facilitator notes.
- Annotations on saved views: short text callouts anchored to members or points, drawn by the scene so that the canvas, SVG, PNG, PDF and presentation all show them.

Checkpoint: evaluate a PPTX export (a candidate library's licence, its size, and whether it runs under the Content Security Policy without eval, as D106 did for PDF) and recommend for or against before building it.

Done when the export tests cover the slides, the pack and annotations under both export settings and at each audience level; then open a pull request.
```

### 4.18 Session 18. Chance baselines and core–periphery

**Goal.** Say when a pattern goes beyond what group sizes or chance would give (review §6; issue 5).

**Suggested modules.** New: `src/engine/metrics/permutation.ts`, `qap.ts`, `coreperiphery.ts`. Changed: `src/engine/protocol.ts`, `handler.ts`, `schedule.ts` (progress and cancel, as the bootstrap has, D45), `insights.ts`; `src/ui/views/GroupsView.tsx`, `CompareView.tsx`; `docs/method-notes.md`.

**Done when.** Tests on constructed networks pass: a planted partition, random networks, identical layers, a planted core.

```text
Session 18 of docs/build-plan.md: chance baselines and core–periphery.

Follow the standing rules in docs/build-plan.md §2 and read §4.18 there.

Build in the worker, with progress and cancel as the bootstrap has (D45), and with the seeded generator:
- A permutation test for E-I and for density within and between groups (shuffling group labels), reported as "beyond what group sizes alone give" or "within it", with percentiles in the report's appendix only.
- QAP correlation between two layers (Krackhardt, 1988), shown in Compare.
- Core–periphery (Borgatti & Everett, 1999): whether the network has a core at all, and each member's coreness.
Write a method-note section for each, with its limits.

Checkpoint: show whether core–periphery should replace the percentile rule for peripheral members where the fit is adequate, with results on the scenarios, and wait for my choice.

Done when tests on constructed networks pass (a planted partition, random networks, identical layers, a planted core), and the Groups and Compare views show the results; then open a pull request.
```

### 4.19 Session 19. Inclusion analysis with safeguards

**Goal.** Compare network position across demographic groups without exposing anyone (review §6; Decker-Tonnesen et al., 2025).

**Suggested modules.** New: `src/engine/metrics/inclusion.ts`, `src/ui/copy/inclusion.ts`, `src/ui/views/InclusionSection.tsx` (in the Groups view). Changed: `src/data/schema.ts` (attribute flags); `src/ui/views/MembersView.tsx`; `src/data/import/validate.ts`; `src/ui/state/audience.ts` (suppression); `src/ui/export/scope.ts`; `src/ui/copy/notice.ts`.

**Done when.** A suppression sweep proves that no small group, combination of attributes or member appears in any output.

```text
Session 19 of docs/build-plan.md: inclusion analysis with safeguards.

Follow the standing rules in docs/build-plan.md §2, and read §4.19 there and the cautions in section 6 of docs/reports/consultant-review.md.

Checkpoint first: I need to confirm the data protection position before anything is built. Present the safeguards below and wait.

Then build:
- Attribute flags "sensitive" and "special category" (UK GDPR Article 9), set when an attribute is imported or added; setting one asks the analyst to confirm that advice was taken.
- Group-level analyses by such an attribute only: ties received, ties to senior levels, links between groups, homophily, with the chance baselines of session 18.
- Suppression of any group, or combination of attributes, below the minimum group size of session 9.
- Outputs that follow the audience levels and both export settings, and are never per member.
- A section on sensitive attributes in the first-run notice and the method notes.

Done when a suppression sweep proves that no small group, combination of attributes or member appears in any output; then open a pull request.
```

### 4.20 Session 20. Options to consider

**Goal.** Structural options to discuss beside the observations (review §9). This changes the tool's purely descriptive stance, so nothing is built before the owner confirms.

**Suggested modules.** New: `src/ui/copy/options.ts`, `src/ui/views/OptionsPanel.tsx`, `tests/unit/optionsCopy.test.ts`. Changed: `src/ui/views/InsightsPanel.tsx`; `spec.md` §2 and §9; the wording rules in `CLAUDE.md`.

```text
Session 20 of docs/build-plan.md: options to consider.

Follow the standing rules in docs/build-plan.md §2 and read §4.20 there.

This changes Graticule's purely descriptive stance (spec §2), so do not build until I confirm. First present a library of structural options (for example orientation across units, scheduled time in other units, briefings across units, mentoring pairs, arranging work so that occasional contacts link separate groups), each with its source, the observations it relates to and its caveats, together with wording rules (options describe structures, never people, and use no imperative verbs).

After my confirmation, build an "Options to discuss" section apart from the observations, with its own copy test, amend spec §2 and §9, and record the decision; then open a pull request.
```

### 4.21 Session 21. Ciphertext relay

**Goal.** Optional one-step return of survey responses through a store that holds only ciphertext (review §10; "Server transport (future, nothing built)" in `CLAUDE.md`). A spike comes first.

**Suggested modules.** New: `src/survey/relayTransport.ts`; `relay/`, a separate server package with its own tests. Changed: `src/survey/transport.ts`; `src/respond/RespondApp.tsx`; `src/ui/views/survey/SurveyDashboard.tsx`; `vite.config.ts` and `index.html` (a build flavour with the relay origin in `connect-src`); `docs/method-notes.md` §9.

```text
Session 21 of docs/build-plan.md: a ciphertext relay for survey responses. Spike first.

Follow the standing rules in docs/build-plan.md §2, and read §4.21 there and "Server transport (future, nothing built)" in CLAUDE.md.

Spike, then stop: compare hosting options for a store that only ever holds ciphertext, covering data residency, retention, cost, rate limiting and abuse, the metadata the server sees, the changes to the threat model in method notes §9, and the change to the Content Security Policy. Propose a build flavour in which the relay origin is set at build time, so the public site stays file-only. Wait for my decision.

After my decision, build the relay behind ResponseTransport (src/survey/transport.ts), live status and reminders on the dashboard, and the server in its own directory with its own tests; then open a pull request.
```

### 4.22 Session 22. Aggregated interaction data

**Goal.** Optionally import aggregated interaction counts per pair as an observed relation beside the survey (review §10). A spike and legal advice come first.

**Suggested modules.** New: `src/data/import/interactions.ts`. Changed: `src/data/schema.ts` (an observed-interaction role); `src/data/coverage.ts` (left out of coverage); `src/ui/views/ImportDialog.tsx`.

```text
Session 22 of docs/build-plan.md: aggregated interaction data. Spike first.

Follow the standing rules in docs/build-plan.md §2 and read §4.22 there.

Spike, then stop: what aggregated, pair-level interaction exports (meetings or messages per pair) organisations can produce; the legal and employee-consultation requirements for using them; and how an "observed interaction" relation would sit beside survey relations (coverage, composite, rules). Wait for my decision. If I go ahead, build only the import of an aggregated file, never a connection to a live system; then open a pull request.
```

## 5. New modules by area

| Area | New modules (session) |
|---|---|
| Engine | `metrics/bridges.ts`, `cutpoints.ts`, `load.ts` (7); `metrics/change.ts` (15); `metrics/permutation.ts`, `qap.ts`, `coreperiphery.ts` (18); `metrics/inclusion.ts` (19) |
| Data | `quality.ts` (4); `questionBank.ts` (11); `import/wide.ts`, `import/match.ts` (13); `intent.ts` (16); `import/interactions.ts` (22) |
| Interface state | `questions.ts` (8); `audience.ts` (9); `engagement.ts`, `tourStorage.ts` (16) |
| Views | `DataCheckPanel.tsx` (4); `GroupsView.tsx`, `GroupMatrix.tsx`, `GroupMap.tsx` (6); `RankedBars.tsx` (7); `QuestionPicker.tsx`, `MapHeader.tsx` (8); `AudienceSelect.tsx`, `PersonalCard.tsx` (9); `SummaryEditor.tsx` (10); `LayerCreateDialog.tsx` (11); `survey/LaunchKit.tsx` (12); `ImportWizard.tsx` (13); `ChangeView.tsx` (15); `guide/EngagementGuide.tsx`, `ActionsPanel.tsx`, `IntentEditor.tsx`, `tour/FirstRun.tsx` (16); `AnnotationTools.tsx` (17); `InclusionSection.tsx` (19); `OptionsPanel.tsx` (20) |
| Map | `groupModel.ts` (6) |
| Exports | `summary.ts` (10); `slides.ts`, `workshop.ts` (17) |
| Survey | `relayTransport.ts` and the `relay/` package (21) |
| Copy | `quality.ts` (4); `groups.ts` (6); `questions.ts`, `readouts.ts` (8); `audience.ts` (9); `questionBank.ts` (11); `launchKit.ts` (12); `change.ts` (15); `engagement.ts` (16); `inclusion.ts` (19); `options.ts` (20) |
| Components | `RangeSlider.tsx` (2) |
| Tests | `scenarioOutcomes.test.ts` (3); `quality.test.ts` (4); `groups.test.ts`, `groups.spec.ts` (6); `readouts.test.ts` (8); `audience.test.ts`, `audience.spec.ts` (9); `customLayers.test.ts` (11); `importWide.test.ts` (13); `optionsCopy.test.ts` (20) |

## 6. Not planned

These were considered in the review and are left out on purpose:

- **Scores for individuals,** such as a "network health" figure per person. They would make Graticule an evaluation instrument (spec §2).
- **Benchmarks against other organisations.** They would need a shared database, and measures such as density are not comparable across networks of different sizes (method notes §4).
- **Text drafted by a language model.** A hosted model would break the guarantee that no data leaves the browser; deterministic templates serve the narrative (session 10).
- **Live connections to email, calendar or chat systems.** At most, an aggregated file is imported (session 22).
