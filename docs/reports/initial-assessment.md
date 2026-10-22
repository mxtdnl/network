# Initial assessment: Graticule on realistic survey data

Date: 2026-10-22. Update, same day: issues 1–3, 5 and 7–9 were decided by the owner and built in build plan session 3 (CLAUDE.md D142–D145, `tests/unit/scenarioOutcomes.test.ts`); issues 4 and 6 remain for sessions 4 and 5. The figures below describe the tool before that session.

Status: initial report, written as the brief for a deep dive into the issues below. Nothing in the analysis, the insight rules or the defaults has been changed. Each issue touches a rule or default the owner approved (CLAUDE.md D26, D72, Q26, plan Q3), so each fix needs the owner's decision.

## 1. Scope and method

The owner asked for an assessment of the tool in its current state, using demo data that models real-world constraints: asymmetric ratings, gaps in response, ratings clustered away from the ends of the scale, loosely defined or matrixed functions, large departments without distinct teams, and well-networked teams of 15–20.

Twelve fictional projects were generated for this (`src/demo/scenario-*.ona.json`, described in `docs/scenarios.md`):

- seven single-condition scenarios (`scripts/generate-scenarios.ts`, CLAUDE.md D138);
- five merged scenarios that combine two or more conditions, so the issues can be studied where they compound (`scripts/generate-merged-scenarios.ts`, D139).

Each project was:

1. analysed by the engine under the app's default settings in the directed view and the symmetrised view (mean and min). The default settings are every enabled layer at its default weight, signed layers as multipliers (D130) and the map threshold 0.30 (D129). `npm run scenarios:measure` (`scripts/measure-scenarios.ts`) prints these results; every figure below comes from it or from the engine directly;
2. opened through Project → Open in the production build (`tests/e2e/scenarios.spec.ts`), with names hidden and screenshots taken (`docs/screenshots/scenarios/`).

"Directed" below means the directed view. "Mean" and "min" mean the symmetrised view combining the two directions by Average or by Weaker of the two.

## 2. State of the build

On 2026-10-22, before this work: typecheck, ESLint and Prettier passed, and all 1,191 unit tests in 28 files passed. After it, there are 1,215 tests in 29 files, and all pass. All twelve projects open in the built site with no console or page error, and analyse in both views without an engine warning. The end-to-end suite was not run in full; only `scenarios.spec.ts` was.

## 3. Datasets and the issues each exercises

| Scenario | Conditions combined | Issues (section 5) |
|---|---|---|
| partial-response | Non-response (3 of 18, including the hub), one partial respondent | 4 |
| asymmetric-ratings | Seniority asymmetry, generous and harsh raters, one-way warmth and reliance | 6, 9 |
| compressed-ratings | 17 of 24 avoid the ends of each scale, 3 give one answer to everyone | 5, 6, 9 |
| matrix-organisation | Functions and programmes cut across each other | 7 |
| large-department | 64 members with one team value; strangers marked "does not apply" | 1, 5, 8 |
| dense-team | Everyone works closely with everyone | 5 |
| post-merger | Legacy organisations with different rating habits, advice and conflict layers, a new joiner | 2, 3, 6, 7 |
| silent-leaders | Partial response × asymmetric ratings | 4, 6 |
| polite-dense-team | Compressed ratings × dense team | 5, 6, 9 |
| merger-matrix | Matrix organisation × post-merger, with conflict layers | 2, 3, 6, 7 |
| single-team-shifts | Large department × partial response × conflict layers | 1, 2, 3, 4, 8 |
| messy-survey | Partial response × asymmetric × compressed, a new joiner, coverage just below 80 % | 4, 5, 6, 9 |

## 4. What works

- The structures the rules are designed to find are found when the data carries them:
  - the overloaded integration lead (post-merger: workflow-dependency in-degree 23 against a median of 6);
  - the four-member negative cluster on valence and on energy (post-merger);
  - formal-only ties within functions (matrix organisation, merger matrix);
  - members on two programmes as potential brokers (matrix organisation);
  - remote workers at the edge of the large department;
  - the part-timer in the polite dense team (in-strength 12.0 against 16.1–17.7 for everyone else).
- The rules stay quiet where they should:
  - no brokers and one community in the dense team;
  - no silo in the matrix organisation;
  - no negative cluster from negativity in one direction only.
- Communities recover the structure that is really there: teams in the compressed and messy surveys (100 % purity), programmes in both matrix scenarios (90 % and 85 %), shifts in the contact centre (100 %), teams rather than legacy organisations after the merger.
- These states are all carried into coverage and the metrics without errors: "does not apply" (3,035 ratings in the large department), declined ratings, missing attribute values, partial responses and a member who knows no one.
- The coverage warning appears when overall coverage is below the threshold (silent leaders 77.3 %, messy survey 79.6 %).

## 5. Issues

Ordered by how likely each is to mislead an analyst or an audience. Each lists its evidence, where the behaviour comes from in the code, and a proposed direction for the deep dive.

### Issue 1. The silo rule fires on a group that holds every member

- **Evidence.** large-department: "Operations", all 64 members, 822 composite ties inside and 0 outside (E-I −1.00), in every view, with the question "How does work reach the rest of the organisation?". single-team-shifts: "Contact Centre", all 48 members, 516 inside, 0 outside, on all 6 layers.
- **Cause.** `silos()` in `src/engine/insights.ts` (line 311; skip test at line 327) checks group size and E-I but not whether anyone is outside the group. With one value, E-I is −1 by construction. Members with no value (`null`) are not a group, so they do not count as outside either.
- **Direction.** Skip the rule when the grouping attribute has fewer than two groups of at least `minGroupSize`, or when a group has no possible outside ties. Add a unit test on a single-group project. Owner decision: the rule thresholds were approved in Q26.

### Issue 2. The silo rule reads the conflict layers

- **Evidence.** post-merger: all four silo observations come from conflict layers. Examples: Technology on personal friction, 7 inside and 0 outside; the Integration Office on task disagreement, 24 inside and 0 outside. merger-matrix: every function is a "silo" on personal friction, People from 2 ties. The composite shows no silo in either.
- **Cause.** D72 tests silos on the composite and every unsigned layer. The conflict sub-layers are unsigned 0–5 frequencies (D26), so they qualify. Conflict among people who work together stays inside teams by nature, and the rule has no minimum number of ties.
- **Direction.** Leave layers in the `conflict` group out of the silo rule (D105 already groups them with the signed layers for export exclusion), and require a minimum tie count per group and layer. Check the other rules for the same exposure: the peripheral rule also reads every unsigned layer, so being in little conflict currently counts towards being peripheral.

### Issue 3. Conflict raises the composite

- **Evidence.** post-merger: with nine layers enabled, each conflict layer is 0.14 of the composite. merger-matrix: core layers plus the two conflict layers, with valence as a multiplier, give the conflict layers 0.20 each, so **40 %** of the composite is friction. More friction makes a stronger composite tie, and so changes node size, communities, brokers and the map.
- **Cause.** `finish()` in `src/data/defaults.ts` (line 186) gives every scaled layer `default_weight: 1`. The composite adds weighted unsigned layers (D41).
- **Direction.** Give the conflict group default weight 0. Or treat conflict like a signed layer's negative side (as a filter or multiplier), with the same treatment choice in the weight panel. Owner decision.

### Issue 4. Non-response looks like an absence of ties, and the views disagree about it

- **Evidence.**
  - partial-response: FIE01, the most connected member (in-strength 12.3 against the next 6.1), gave no ratings. They show out-strength 0 and directed betweenness 0, so the directed view names HYD01 as the only broker. Mean and min both name FIE01 (betweenness 0.65).
  - silent-leaders: the five silent members have directed betweenness 0 (rank 15 of 22). Under min, ANA01 is first on both strength and betweenness, and PAR04 third: their rows are filled entirely from juniors' ratings, which are inflated by seniority asymmetry.
  - single-team-shifts: 8 of the 10 night agents gave no ratings. The peripheral rule lists 10 members, 9 of them on the night shift. Two of the nine are night agents who did respond: their silent colleagues never rated them.
  - Coverage passed the threshold in partial-response (80.1 %, with 3 of 18 silent) and in single-team-shifts (80.2 %, with 80 % of one shift silent).
- **Cause.**
  - A missing rating is NaN (D2), and a non-respondent has no outgoing ties.
  - `combine()` in `src/engine/aggregate.ts` (line 46) uses the given direction when the other is missing, under every rule (plan Q3). So "Weaker of the two" is not conservative for non-respondents.
  - Ties between two non-respondents are absent in both views.
  - `computeCoverage()` (`src/data/coverage.ts`, line 41) reports one overall rate and per-rater rates. It reports nothing per group and no count of complete non-respondents.
  - Node flags (`NodeFlag` in `src/engine/types.ts`) have no non-response state, so the member panel and table show 0 as a real value.
- **Direction.**
  - A per-member flag for gave-no-ratings and gave-few-ratings, shown on outgoing and path metrics in the member panel, table and exports.
  - A coverage note that counts complete non-respondents and the lowest group rate.
  - An option for how a missing direction is treated when symmetrising (fill from the other direction, as now, or treat the pair as unknown).
  - Leaving non-respondents out of the peripheral and broker rules, or marking them there.

### Issue 5. Relative rules fire on differences too small to mean anything

- **Evidence.**
  - dense-team: three members are "peripheral" with in-strength 14.8–15.0 against a maximum of 16.4.
  - polite-dense-team: DES02 and DES03 are listed beside the real part-timer with 16.1–16.2 against 17.7.
  - compressed-ratings: potential brokers are named at betweenness at most 0.04.
  - polite-dense-team: potential brokers are named at 0.01.
  - large-department and single-team-shifts: the peripheral list runs to 13 and 12 members (brokers are capped at 5; peripheral members are not).
- **Cause.** `peripheralMembers()` (line 188) takes the bottom 20 % by quantile and `potentialBrokers()` (line 123) the top 10 %, with no absolute floor or spread test.
- **Direction.** A minimum relative spread (for example, the quantile below the median by some share) and a minimum betweenness before an observation is made; a cap on the peripheral list, as for brokers. Owner decision (Q26 thresholds).

### Issue 6. Respondents' rating habits drive member-level results and are not visible

- **Evidence.**
  - asymmetric-ratings: the generous rater DES04 has out-strength 18.2 (next 10.6) and is a broker under mean; the harsh rater ENG05 is peripheral under mean and min.
  - silent-leaders: the generous rater ADV04 is at once peripheral (directed in-strength rank 21 of 22) and a potential broker (betweenness rank 2), and first on both under mean.
  - messy-survey: the generous ADM03 is a broker in every view.
  - compressed-ratings and polite-dense-team: the respondents who gave everyone one answer have the highest out-strengths and are named brokers.
  - post-merger: Northbank respondents give a mean connection strength of 2.05 and Southbank 0.88, while receiving 1.49 and 1.40.
  - merger-matrix: mean composite out-strength is 10.73 for Eastgate and 4.46 for Westmoor.
- **Cause.** Out-strength, directed betweenness and the symmetrised mean all take ratings at face value. The tool has no view of each respondent's distribution of answers. That is consistent with a descriptive tool, but it leaves the analyst unable to see the effect.
- **Direction.**
  - A per-respondent summary in the Coverage tab: mean, spread, share of the scale used, and a note when every answer is the same.
  - An optional within-rater standardisation for the composite (a method change, which the method notes would need to describe).
  - Making Weaker of the two easier to choose, since it damps generous raters.

### Issue 7. The insight rules group only by team

- **Evidence.** matrix-organisation and merger-matrix: communities follow programmes (90 % and 85 % purity), not functions (30 % and 29 %), but silo and formal–informal questions are asked only of functions. post-merger: the legacy-organisation split is never examined.
- **Cause.** `INSIGHT_RULES.silo.attributes` is `['team']` (line 55). formalInformal uses the same attribute.
- **Direction.** Let the analyst choose the grouping attribute for the rules, saved with the project or view. The insight copy names "team" in places and would need to name the attribute.

### Issue 8. Copy and display details

- The silo sentence reads "Most composite of all layers ties involving Operations stay within Operations" when the layer is the composite (`src/ui/copy/insights.ts`, line 147).
- At 1440 × 900 (compact layout) the drawer covers the right edge of the large maps until the view is fitted again (by design, D125).
- With more than 60 members no names are drawn unless highlighted (by design, D53). Both are noted for the deep dive, not as defects.

### Issue 9. Negativity in one direction only is hard to see

- **Evidence.**
  - asymmetric-ratings: three pairs rate each other warmly one way and negatively the other. The negative direction's composite weight is 0.00–0.06, because the valence multiplier reduces it, so it falls below the 0.30 threshold and is never drawn.
  - messy-survey: of four Clinic members in strained relationships, one never uses negative ratings and one did not respond, so only one pair is mutually negative and no cluster (minimum 3) is found.
  - compressed-ratings and polite-dense-team: friction is reported by one side only.
- **Cause.** The negative-cluster rule needs negative ratings in both directions (by definition). The multiplier treatment (D130) removes the ties that carry negative ratings from the drawn map.
- **Direction.**
  - A descriptive count of one-way negative ratings (by layer and group) in the insights or Coverage tab.
  - A map setting that draws negative ratings regardless of the threshold.

## 6. Limitations of the scenario data

- The data is synthetic. Every condition is built in deliberately, and the noise is uniform. Real response styles vary more and overlap.
- Same-answer respondents are exact (every answer identical), and compressed respondents use exactly 2–4. Real straight-lining is usually partial.
- One wave only. No survey-sourced ties (`source: 'self_report'`), no saved views and no categorical layer (primary channel) are included, so those paths are not exercised by this data.
- Seeds and generators are committed. Any change to a generator changes its file, and the unit test then requires the committed file to be regenerated (`npm run scenarios`).
- Figures in this report are from the files as committed on 2026-10-22. They change if a generator, a default or a metric changes.

## 7. Suggested order for the deep dive

1. Issues 1 and 2: clear defects in one rule, small and testable. Add regression tests on large-department, single-team-shifts, post-merger and merger-matrix.
2. Issue 3: a default that inverts the meaning of two layers. Needs an owner decision on the treatment.
3. Issue 4: the largest. Covers flags, coverage reporting and symmetrisation, and touches the engine, copy, exports and method notes.
4. Issues 5, 6, 7 and 9: methodological options for the owner, best put as a short proposal with measured effects on the twelve scenarios before building.
5. Issue 8: copy fix.

Re-measure after each change with `npm run scenarios:measure`. The unit tests in `tests/unit/scenarios.test.ts` check the data, not the insight outcomes, so they will not fail when a rule changes. Add outcome tests per issue as each is fixed.
