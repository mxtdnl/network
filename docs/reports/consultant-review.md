# Consultant review: Graticule in a first network analysis engagement

Date: 2026-10-22. Version reviewed: 1.0.0 (`main` at `b99e92a`). Status: review for the owner. Nothing in the tool has been changed. Most changes proposed here amend the specification or a decision recorded in `CLAUDE.md`, so each needs the owner's decision; each section names the ones it touches.

## 1. Scope and method

**Persona.** An organisational development or HR consultant who runs change and team engagements competently but has no training in organisational network analysis (ONA), using Graticule for the first time, with a client whose leaders have never seen a network analysis. The owner confirmed this persona on 2026-10-22.

**The test applied throughout.** Can this consultant, with this tool, take the client from a business question to agreed actions, and later show whether anything changed, without calling in an ONA specialist?

**Method.**

1. Built the production site and used it in headless Chromium at 1440 × 900 (a typical laptop, which Graticule shows in its compact layout) and at 1920 × 1080. Covered the first-run notice, the empty state, the demo, and two scenario projects opened through Project → Open (messy survey and post-merger, described in `docs/scenarios.md`), all with names hidden. Looked at the map, member panel, insights, coverage, Compare, survey setup and the Export dialog, and exported the PDF report for each project.
2. Read the user guide, method notes and specification, and the initial assessment (`docs/reports/initial-assessment.md`). Its nine issues are referred to here as "issue 1" to "issue 9" and are not repeated.
3. Drew on the five resources supplied with the brief, and on five further sources checked on 2026-10-22 (section 13).

**How each section is set out.** The top-level finding and its associated change come first, then the evidence, then what the change involves and which decisions it touches. Section 11 puts the changes in order. Appendix A lists small defects found on the way.

**Limits.** Synthetic data, one reviewer playing a persona, and no sessions with real consultants or clients (section 12).

## 2. Summary

Graticule is a careful, private and technically sound instrument. Its metrics match NetworkX reference values, it never treats a missing rating as 0, every observation is worded as a question with its rule shown, and it can run an encrypted survey without a server. An analyst who already knows ONA can do good work with it.

For the persona, it supplies the machinery of an analysis but not the method of an engagement. It does not help frame the business question, choose what to ask, judge whether the data can bear a conclusion, turn numbers into meaning for a lay audience, move from observation to action, or measure change afterwards. Both case studies supplied with the brief locate the value of ONA in exactly those steps: the business challenge built into the questions and the results discussed with the team (Terblanche & Erasmus, 2018), and findings interpreted with the organisation's leaders, who then set the goals of the final analysis (Merrill et al., 2007).

| Section | Top-level finding | Change |
|---|---|---|
| 3. Usefulness | Trustworthy engine and strong privacy, but on realistic data a newcomer gets correct output they cannot explain or act on | Build the engagement cycle around the engine: question, collect, check, understand, discuss, act, re-measure |
| 4. Intuitiveness | The workspace opens on a weighted composite, unanchored decimals and network vocabulary | Question-first views, a plain sentence for every number, the composite and weights under "Advanced" |
| 5. Visualisation | One node-link map carries everything and tangles on realistic data; group, bridge and change views are missing | Group connection views, bridge ties, distributions, a personal network card, before-and-after maps |
| 6. Analysis | Measures describe members and layers; consultants ask about groups, flows, risk and change | Group, tie, perception, risk, change and chance-baseline analyses as rule-stated observations; assessment against the client's own intent |
| 7. Real data | Data states are recorded rigorously, but nothing says whether the data can bear a conclusion | A "Check the data" step with diagnostics, named remedies and a data-quality statement in every output |
| 8. Presentation | Saved views replay faithfully, but the report is a technical appendix and names individuals for every audience | Audience levels, an editable executive narrative, a workshop pack, slide export |
| 9. Utility | Nearly every option is visible at once, and the tool stops at analysis | An engagement guide with progressive disclosure, a guided first run and an action log |
| 10. Collection | Secure and respondent-friendly, but generic fixed relations and a manual return loop put the response rate at risk | Purpose-specific relations from a question bank, an optional ciphertext relay, repeat waves |

If only five changes are made, these give the persona most (section 11 has the full order):

1. Fix issues 1–3 of the initial assessment and the defects in Appendix A.
2. Add a data-quality statement, with non-respondents flagged and coverage shown by group.
3. Add a group connection view by any attribute, and let the insight rules use any attribute.
4. Add audience levels and an executive narrative to presentations and the report.
5. Support repeat waves with a before-and-after comparison.

## 3. Current state and usefulness to an organisation

**Finding.** The engine is trustworthy and the privacy model is unusually strong, but on realistic data a consultant new to ONA receives technically correct output that they can neither explain to a client nor turn into action without outside expertise.

**Change.** Build the engagement cycle around the existing engine: frame the question, collect, check the data, understand, discuss with the client, agree actions and re-measure.

**What works.**

- **Correctness.** Every metric is checked against NetworkX fixtures within 10⁻⁹ (10⁻⁶ for eigenvector centrality), with the conventions that differ documented (method notes §7). The initial assessment reports 1,215 unit tests passing.
- **Data states.** A rating of 0, a missing rating and "does not apply" are kept apart from file to metric (method notes §1.1).
- **Ethics in the product, not left to the user.** The first-run notice, Hide names, leaving negative ratings out of exports, and "not an assessment of anyone" on the report cover.
- **Observations as questions,** each with its rule and thresholds stated (method notes §8).
- **Survey collection** with end-to-end encryption and no server, enforced by the Content Security Policy (spec §10, §15).
- **Accessibility:** axe-core checks against WCAG 2.2 AA, a keyboard-operable map and a table alternative for screen readers.

**What limits its usefulness for the persona.**

- Nothing scaffolds the engagement itself: scoping, question design tied to a business issue, sense-making with the client, actions and re-measurement.
- Results are per member and per layer, but organisations act on groups and processes. The engine computes the E-I index and cross-group density for every attribute (`src/engine/analyse.ts:147`), but they reach the user only in the network metrics CSV and, for team alone, as a table in the PDF report. On screen, a group's figures can be had only by selecting its members as a subgroup in Explore.
- Ties carry a wave, but the analysis reads wave 1 only (`src/engine/input.ts:49`). A before-and-after comparison is out of reach, although it was the design of Terblanche and Erasmus' study and the "most pressing need" Granovetter (1983, p. 229) named for network analysis: a move away from analyses "at one point in time".

**Where it fits today, and where it does not yet.**

| Ready now | Needs the changes in this review |
|---|---|
| An analyst who already knows ONA | A consultant new to ONA |
| Teams and departments of up to about 60 members, where every member is labelled on the map (D53); a personal link fits the 2,000-character budget at 40 members (1,741 characters) but not at 100 (2,483; D95) | 100–250 members: the map tangles, respondents need a shared survey file, and responses arrive one email at a time |
| Settings where no data may leave the device | Evaluating an intervention before and after |
| A one-off snapshot to open a conversation | Integration across legacy organisations, matrix structures or sites, which needs group views by any attribute |
| | Inclusion analysis by demographic group |

## 4. How intuitive is the output?

**Finding.** The output is accurate but not self-explanatory: a newcomer meets a weighted composite of every layer, unanchored decimals and network vocabulary before any plain statement of what the picture shows or which question it answers.

**Change.** Make every view question-first, with a plain-language sentence for every number shown, and move the composite and its weights behind an "Advanced" control.

**Evidence.**

1. **The first screen asks for a decision the newcomer cannot make.** Once data is loaded, the left column opens on "Weights" and the composite formula: 0.33 × Connection strength + 0.33 × Informal collaboration + 0.33 × Formal collaboration, × (1 + 0.5 × Valence), capped at 1. The column holds about 70 controls (16 inputs, 17 drop-down lists and 36 buttons, 18 of them switches), measured on the demo at both window sizes.
2. **The default map answers no stated question.** It draws "Ties from: Composite of all layers" with node size "Bridging 0.000 … 0.443". Nothing on the map says what bridging is, or whether 0.443 is a lot.
3. **The composite is a method choice made by default.** The method notes call it "a statement of priorities, not a measurement" (§6); a newcomer does not know they made that statement. In the post-merger scenario nine layers are enabled, and the seven summed layers take 0.14 each, both conflict layers included, so more friction makes a stronger tie (issue 3; [screenshot](../screenshots/consultant-review/post-merger-default-map.jpg)).
4. **Ranks run against intuition for some measures.** Rank 1 is the highest value for every metric. The demo's most prominent go-between (OPE-L3-02, bridging 0.443, rank 1) shows "Constraint 0.135, rank 40": the most open network of the 40 reads as last place. The same panel shows Received strength at rank 1 and Connections in at rank 22–24, which needs explaining before it helps ([screenshot](../screenshots/consultant-review/demo-member-panel.jpg)).
5. **One fact is reported twice, once about people.** In the demo, Finance is a silo, and six of its eight members are also listed under "Peripheral members". In the messy survey, ADM-L2-01 is listed both as a potential broker and as a peripheral member, the pattern the initial assessment traced to a generous rater in the silent-leaders scenario (issue 6).
6. **Rounding contradicts itself.** At 79.6 % coverage the top bar reads "Coverage 80% is below the 80% threshold", and the report "Coverage is 80%, below the 80% threshold" ([screenshot](../screenshots/consultant-review/messy-survey-insights.jpg); `percent` rounds to a whole number, `src/ui/copy/data.ts:6`).
7. **Correct but meaningless figures reach the report.** The key-metrics table gives the negative valence ties a column of their own: 37 separate parts, 37 communities, modularity 0.

**What the change involves.**

- **Questions as the entry point.** A short list of questions, each bound to the relation and view that answer it: "How does information reach people?" (advice), "Where do teams connect, and where not?" (group view, section 5), "Whose time do others depend on?" (workflow dependency and load), "Where does work happen outside the formal structure?" (formal against informal collaboration). The question becomes the view's title, as captions already are in presentation mode.
- **A sentence for every number,** built from the engine's structured results, with the wording kept in `src/ui/copy` (D9). For example: "OPE-L3-02 lies on more of the shortest routes between colleagues than anyone else", or "About half of all possible pairs (46 %) have a working tie, and four in five ties are returned (82 %)."
- **Comparisons a lay reader can use** instead of bare ranks: "a more open network than any of their 39 colleagues" for constraint, and the group's median beside each value.
- **The composite moves to "Advanced".** "Ties from" is set by the chosen question. Where the composite is used, its weights are stated on the map as well as in the report.
- **Overlapping observations are merged,** with the cause shown when the cause is the data (section 7).
- **Coverage is shown to one decimal place** near the threshold.

**Touches.** Spec §7 (the composite drives every ranking) and §8 ("Ties from"); D60, D130.

## 5. How can visualisation better provide insight?

**Finding.** One node-link map carries up to five encodings and becomes a dense tangle on realistic data, while the pictures executives read most easily are not on screen: connection between groups, the ties that bridge them, and change over time.

**Change.** Add a small set of purpose-built views (a group connection matrix and group map, bridge ties, distribution charts, a personal network card and before-and-after maps), and let the main map show one variable per picture by default.

**Evidence.**

- The post-merger scenario's default map is one dense mass in which the two legacy organisations cannot be seen ([screenshot](../screenshots/consultant-review/post-merger-default-map.jpg)); the messy survey's map is similar ([screenshot](../screenshots/consultant-review/messy-survey-insights.jpg)).
- The group-to-group figures that would show the merger are computed for every attribute but not shown on screen: they are in the network metrics CSV, and the PDF report tabulates the E-I index by team only.
- Granovetter is precise about what matters: "I have not argued that all weak ties serve the functions described in SWT—only those acting as bridges between network segments" (1983, p. 229). The map shows how strong a tie is, not whether it is a bridge.
- In a study of interlocking company boards, when all ties were treated "as having equal strength, the whole network is so highly connected that the identification of cliques is very difficult", while the strong ties alone showed clear clusters (Bearden et al., 1975, as cited in Granovetter, 1983, pp. 226–227). Close ties show the groups; all ties show how the groups are held together. The threshold slider can show both, but only as a number between 0 and 1.
- Terblanche and Erasmus' own diagram (2018, Figure 2) is a dense circle of 22 people in which single ties cannot be followed. Their findings came from simple counts with frequency filters ("never" against "at least once a week"), not from the picture.
- The picture matters most in the room: "Rich discussions will often evolve simply by showing network diagrams to the members of a group and asking them to diagnose the patterns they see" (Cross, Borgatti & Parker, 2002, p. 39, as cited in Terblanche & Erasmus, 2018). That only works if lay people can read the diagram.

**What the change involves.**

1. **Group connection matrix and group map,** by any attribute (team, site, legacy organisation, level): the share of possible ties within and between each pair of groups, shaded, with a sentence per cell on demand; and a map with one node per group, sized by its members, joined by lines whose width is that share. This is the first picture for a leadership audience and the natural one for mergers, matrices and silos. It reuses the cross-group density and E-I figures the engine already computes.
2. **Bridge ties.** Mark the ties whose loss would lengthen or cut the routes between groups (local bridges, or the ties with the highest edge betweenness), and list where a group has only one or two routes to another. This draws the spec's own example observation: "Three members connect Finance to the rest of the organisation. What happens if one leaves?" (spec §9).
3. **Named densities** instead of a bare threshold: "Close ties only", "Regular ties" and "All ties", stated in the legend.
4. **Distributions as ranked bars:** requests received per person on advice or workflow dependency, so concentration reads at a glance. Node size cannot show that three people receive a third of all requests.
5. **A personal network card,** for one-to-one coaching only: a member's ties by group, given against received (Terblanche and Erasmus' "individual perspective" against "group perspective"), and the change since the last wave.
6. **Before-and-after maps** on fixed positions, with ties gained and lost (needs waves, section 10).
7. **Annotations:** callouts placed on a saved view, so the consultant's point is on the picture and not only in the caption.
8. **Presentation defaults:** the grouped layout by the chosen attribute, with bridges marked. The force layout stays for exploration.

**Touches.** Spec §8 (encodings, layouts, linked views); D53, D62, D126.

## 6. What native analysis and assessment could add value?

**Finding.** Graticule's measures describe members and layers, but a consultant's questions are about groups, flows, risks and change, and the analyses that answer them are missing or reachable only through CSV.

**Change.** Add group, tie, perception, risk, change-over-time and chance-baseline analyses, each surfaced as an observation with its rule, as insights are now; and add assessment against the organisation's own intent rather than against individuals or other organisations.

| Analysis | Question it answers | Method | Source or precedent |
|---|---|---|---|
| Group profiles by any attribute | Which groups work closely, and which hardly at all? | Density within and between groups, E-I, the members linking each pair of groups; insight rules on any attribute | Spec §6 already requires E-I and cross-group density "by any attribute"; issue 7 |
| Bridges and single points of failure | Which ties and people are the only routes between groups? | Local bridges, edge betweenness, cut vertices; the resilience simulation turned into an observation | Friedkin found all 11 local bridges in his network were weak ties (as cited in Granovetter, 1983, p. 217) |
| Load concentration | Whose time do others depend on? | Share of advice or workflow requests received by the top 10 %, by group | ONA used to "reduce and minimize points of overload" (Auton, 2014, as cited in Decker-Tonnesen et al., 2025); time in collaborative activities up "50 percent or more" over two decades (a study reported by Duhigg, 2016) |
| Perception gaps | Where do the two sides see a relationship differently? | Asymmetry of ratings by pair, by level and by group | The "perception mismatch" in Terblanche and Erasmus (2018); status-linked differences in reporting (Cyr et al., 2021, as cited in Decker-Tonnesen et al., 2025) |
| Change between waves | Did the intervention change who works with whom? | Ties gained and lost; change in the group matrix, E-I and load | Terblanche and Erasmus' pre- and post-test design; Granovetter (1983, p. 229) |
| Chance baselines | Is this pattern more than group sizes alone would produce? | Permutation of group labels for E-I and density; QAP correlation between layers | Krackhardt (1988); issue 5 |
| Core and periphery | Is there a core at all, and who belongs to it? | Core–periphery fit and coreness, instead of percentile lists that always name someone | Borgatti and Everett (1999); used by Katerndahl (2012, as cited in Decker-Tonnesen et al., 2025) |
| Inclusion | Do people in some groups have less access to colleagues, senior levels or brokers? | Position by demographic group, homophily, ties to senior levels; group level only, with a minimum group size | Decker-Tonnesen et al. (2025) |
| Team climate | How do relationships feel inside each team? | The distribution of interpersonal safety ratings per team, and how evenly ties are spread inside it | Edmondson (1999); Woolley et al. (2010), reported by Duhigg (2016) |

**Assessment, but not of people.** Three kinds of assessment add value without evaluating anyone:

- **Against intent.** The consultant records which groups the client expects to work closely, from process maps, responsibility charts or the leadership's own sketch, and Graticule reports where observed ties fall short of that design or go beyond it. The formal–informal comparison already does this for one pair of layers.
- **Against prior expectations.** Before the results are shown, the client writes down what they expect to see ("Product and Sales rarely talk"), and Graticule reports what the data show for each expectation. This guards against reading the map only to confirm what everyone already believed.
- **Data fitness:** whether the data can support each conclusion (section 7).

Two kinds are not recommended. Individual scores, such as a "network health" figure per person, would break spec §2 and turn a descriptive tool into an evaluation instrument. Benchmarks against other organisations would need a shared database, and the method notes already warn that density is "not comparable across networks of very different size" (§4).

**Cautions.**

- Woolley et al. (2010) studied the distribution of conversational turns in small groups, not network ties. An evenness measure of ties inside a team is an analogue, to be labelled as one.
- The interpersonal safety layer is already a one-to-one adaptation of a team-level construct (method notes §10); a team summary must say so.
- Some attributes an inclusion analysis might use (racial or ethnic origin, health, sex life or sexual orientation, among others) are special category data under Article 9 of the UK GDPR. The tool should prompt for advice before such attributes are imported.
- Each new rule needs its method note, thresholds in `INSIGHT_RULES`, tests, and copy that passes the banned-word list.

**Touches.** Spec §2, §6 and §9; D71, D72, Q26.

## 7. How can issues with data from real sources be addressed?

**Finding.** Graticule records the states of real data rigorously, but it does not tell the analyst whether the data can bear a conclusion, so non-response, rater habits, over-reporting and status differences flow silently into rankings and observations.

**Change.** Add a "Check the data" step between collection and analysis, with diagnostics, named remedies whose effect is previewed, and a data-quality statement that travels into every view and export.

**Evidence.**

- The initial assessment found nine ways in which realistic data misleads the current rules: a silo found in a group that holds everyone (issue 1), silos read from conflict layers (2), conflict raising the composite (3), non-respondents shown as unconnected (4), relative rules naming members on trivial differences (5), rater habits driving member results (6), rules limited to team (7), copy (8), and one-way negativity hidden (9).
- **Over-reporting.** In a 156-person health department every network came out "uniformly dense, an indication of possible expansiveness bias". The analysts countered it by counting a tie only where the respondent had answered positively to all four relational questions (Merrill et al., 2007, p. 4). Graticule has neither the check nor the remedy.
- **Missing data matters more than one coverage figure suggests.** A 93 % response rate was judged "sufficient to provide a correlation between true and observed centrality > .90" (Merrill et al., 2007, p. 3). The study behind that figure used random networks and random error (Borgatti, Carley & Krackhardt, 2006); in organisations non-response is not random (issue 4: the silent hub, the night shift). Simple imputations correct for non-response only in specific situations (Huisman, 2009).
- **Status shapes reports.** In one study, people of higher status were "less attentive to those they interact with", so the ties they reported differed from those reported to them (Cyr et al., 2021, as cited in Decker-Tonnesen et al., 2025).
- **Context changes meaning.** In Terblanche and Erasmus' study one manager's tie count fell by 36, which the authors attribute to a restructuring that moved her to another department; they stress "not to accept ONA results at face value" (2018, p. 7). Production problems were also being discussed with people outside the 22 surveyed, so the roster boundary hid part of the work.
- The Coverage tab gives one overall rate and a rate per rater; nothing per group, and no count of people who gave no ratings (issue 4).

**What the change involves.**

1. **A "Check the data" screen,** shown before the insights: coverage by group and level; people who gave no ratings, counted (and named to the analyst only); each rater's style (mean, spread, share of the scale used, the same answer for everyone); the share of one-way ties by level and team; and the share of possible ties each respondent reported, to flag over-reporting.
2. **Named remedies, each with its effect previewed,** for example how many of the potential brokers remain when only confirmed ties count:
   - **Confirmed ties only:** a tie counts when both sides report one. This is close to the existing minimum rule ("Weaker of the two"), presented as a check on over-reporting and generous raters rather than as an abstract choice; unlike that rule, it would not fall back to one side's rating when the other side did not answer (plan Q3, issue 4). Friedkin defined a strong tie the same way (as cited in Granovetter, 1983, p. 217).
   - **Non-respondents:** left out of outgoing and path-based measures and out of the rules, and drawn hollow on the map. For relations that are mutual by nature, such as collaboration frequency, an optional reconstruction from the other side's report, labelled as such.
   - **Rater standardisation:** an optional rescaling within each rater (ranks or z-scores) for the composite and strength (issue 6).
   - **Rules that skip what the data cannot support** (issues 1, 2 and 5).
3. **A data-quality statement,** written from these results and carried onto the report cover, the presentation and every export. For the messy survey it could read: "Coverage 79.6 %, below the 80 % threshold. Three of 26 people gave no ratings (one each in Admin, Clinic and Labs), and three more answered fewer than half of the questions. What these six people's own ratings would show is missing; their results rest on other people's reports."
4. **A context log:** events (a restructuring, a merger date) and notes on members (new joiner, part-time, on leave), so a rule can say "three of the five members named joined in the last six months".
5. **Imports that match real sources:** a wizard for wide survey exports (one row per respondent and one column per colleague and question, the shape most survey tools produce), matching people by name or email with confirmation, and reconciling team names against the roster. Ties are currently imported in long format only (spec §5); pasting into matrix entry works one layer at a time and needs people in the same order.
6. **A boundary question:** an optional count of important contacts outside the roster, by function, so a survey can show when its boundary hides the work.

**Touches.** Spec §5, §6 (coverage) and §9; D2, D29, plan Q3; issues 1–9.

## 8. How can analysis be better presented to stakeholders?

**Finding.** Presentation mode replays saved views faithfully, but the PDF report is a technical appendix with no executive narrative, it lists individuals by code whatever the audience, and nothing supports the collective sense-making that the case studies identify as the point where change begins.

**Change.** Introduce audience levels that set how fine-grained each output is, an editable executive narrative built from the structured observations, a sense-making workshop pack, and slide-ready export.

**Evidence.**

- The demo's report, exported from 1.0.0, runs to 11 pages: a cover stating the weights were "set by the analyst"; the map as set on screen; a table of twelve whole-network measures for the composite and each layer; the insights, naming three potential brokers and six "peripheral" Finance members by code; method notes that include `NaN`, `null`, `not_applicable: true` and a comparison of graphology with NetworkX; coverage, including "Where the ratings came from: Not recorded, 5,948"; and an ethics statement. It has no headline findings, no plain account of what the figures mean, and no next steps.
- The Export dialog has two settings: Hide names, and leaving out valence, energy and conflict. The report's content and audience cannot be chosen, and its map is the map as set on screen, not a chosen saved view (left open in the Phase 7 review of the report, `CLAUDE.md`).
- Codes such as FIN-L3-02 can still identify someone in a small team. Graticule says so, but cannot prevent it.
- Merrill et al. (2007) agreed with the department's leaders that "individual level data would be shared in a limited and selective manner", and that presentations to general management would be "program level findings, not focused on individuals" (p. 3). Preliminary results were interpreted with the leaders, who then set the goals of the final analysis (p. 5).
- In Terblanche and Erasmus (2018) the pre-test results were the input to a reflective coaching session. The leaders "were surprised", accepted the picture and agreed a coaching goal (p. 5).
- In Duhigg's account (2016) of Google's work on teams, survey results became an off-site conversation that ended in agreed team norms. The manager's view was that "it's easier to talk about our feelings when we can point to a number"; a researcher's, "Don't underestimate the power of giving people a common platform and operating language." The same study of 180 teams found that "the 'who' part of the equation didn't seem to matter": how a group works, not who is in it, carried the effect, which favours group-level conversation.

**What the change involves.**

1. **Audience levels,** chosen per presentation and per export and enforced as Hide names is today:

   | Level | Shows | Never shows |
   |---|---|---|
   | Board | Groups and the whole network; the data-quality statement | Any individual; any group below a set minimum size (for example 5) |
   | Leadership team | As board, plus roles such as the links between groups, where those involved have agreed | Ratings given or received by individuals; detail of negative ratings |
   | Team workshop | The team's own network, with names only if the team agreed in advance | Members of other teams |
   | One-to-one | One person's own network card | Anyone else's ratings |

2. **An executive narrative** of two pages, drafted from the structured observations (D9 already separates structure from wording) and edited by the consultant: three to five group-level headlines, each with "What we saw", "Why it may matter" and "Questions for discussion"; the data-quality statement; and the method in one paragraph. The method notes become a reader-facing appendix, and the technical notes stay in Help.
3. **A report built from a storyline of saved views,** instead of one map as set on screen.
4. **A workshop pack:** a page per group with its map, the group connection matrix and prompts in the spirit of Cross et al. (2002), such as "What do you see? What surprises you? What would you want to be different?", with facilitator notes.
5. **Slide export:** one 16:9 slide per saved view (the question as title, the map, the legend, the caption), as PPTX or as PDF pages. Consultants assemble decks; today they place PNGs by hand.
6. **Before-and-after slides** once waves exist (section 10).

The narrative should be drafted by deterministic templates over the structured observations, not by a language model: a hosted model would break the guarantee that no data leaves the browser (spec §2 and §10).

**Touches.** Spec §8 (presentation), §10 (anonymisation) and §11 (exports); D79, D108, D109.

## 9. What else would improve readability, utility and application?

**Finding.** The interface shows nearly every option at once and stops at analysis: it neither guides a newcomer through an engagement nor records what the organisation decided to do, so the value obtained depends on the consultant's prior expertise.

**Change.** Add an engagement guide with progressive disclosure, a guided first run on the demo, and an action log that links observations to agreed actions and to the next wave.

**Evidence.**

- About 70 controls sit in the left column (section 4). During survey setup the same column still shows the composite weights and formula, and the top bar warns "Coverage 0% is below the 80% threshold" before any survey has been sent (`docs/user-guide/survey-setup.jpg`).
- There is no guided first run: the empty state offers four ways in, and the user guide and method notes are in Help.
- The guide's pictures of three key panels are missing. `member-panel.jpg`, `insights.jpg` and `coverage.jpg` in `docs/user-guide/` are 40 × 852 px strips of the collapsed right rail, because `tests/e2e/guide.spec.ts` (lines 170, 189 and 200) captures the right column, which is a rail in the compact layout (D125). The same images are bundled into Help. `survey-setup.jpg` is 1440 × 2553 px with its lower two-thirds blank.
- Terblanche and Erasmus' six-step cycle (2018, Table 1) runs: gathering data, feedback, analysing data, action planning, action taking, evaluation. Graticule supports the first three. The last three happen outside it, and evaluation needs a second wave that the analysis cannot read.
- Merrill et al. (2007, p. 5) asked the leaders to judge the analysis against five outcomes: managerial value, changes to organisational processes, redeployment of resources, function changes and cross-programme support. Graticule has nowhere to record outcomes.

**What the change involves.**

1. **An engagement guide:** a stepper (Plan, Collect, Check, Understand, Discuss, Act, Re-measure) giving each step's purpose, a checklist and its output. Plan records the business question, sponsor, roster boundary, governance (who sees what, and for how long data is kept) and audience levels. Each later step shows only the controls it needs, with the rest under "Advanced".
2. **A guided first run on the demo,** about ten minutes, built as tasks: "Find the team that keeps to itself"; "Who links Finance to the rest?"; "What would you ask that team?"
3. **"Explain this view":** a plain description of the current map, from the same machinery that writes each insight's view description, and a glossary drawn from the method notes.
4. **An action log:** actions agreed in discussion, linked to the observation that prompted them, with an owner and a date. "Re-measure" opens wave 2 with the same roster and questions; an evaluation page compares the waves and records outcomes against the client's own criteria, for example Merrill et al.'s five.
5. **Options to consider,** kept apart from observations: structural options other organisations have used, each with its source and caveats. Examples are orienting new staff across units, scheduled work time in other units, cross-programme briefings and mentoring pairs (Merrill et al., 2007, p. 5); or, by analogy with classrooms arranged "to produce enough weak contacts" to connect separate cliques (Karweit et al., 1979, as cited in Granovetter, 1983, p. 221), arranging work so that occasional contacts link otherwise separate groups. Options would describe structures, never individuals. This changes the tool's purely descriptive stance (spec §2) and the insight wording rules (`CLAUDE.md`, "Insight wording"), so it is the owner's call.
6. **Fix the defects in Appendix A,** starting with the guide's screenshots.

**Touches.** Spec §2 (descriptive, not diagnostic; multi-wave comparison out of scope for v1) and §12; the insight wording list.

## 10. How can data collection be improved?

**Finding.** The built-in survey protects respondents well, but it starts from a fixed set of generic relations rather than the client's question, and its manual return-and-import loop puts at risk the high response rate a whole-network design needs.

**Change.** Let the consultant build purpose-specific relations from a question bank, offer an optional ciphertext-only relay for returning and tracking responses, and support repeat waves and context questions.

**Evidence.**

- **Relations are fixed.** The analyst can switch the 16 built-in layers on and off and re-word them, but cannot add a relation, and keys and scales cannot change (`src/ui/views/LayerPanel.tsx`; method notes §10). Terblanche and Erasmus wrote their three questions around the chief executive's concern, a continuous improvement programme ("How often do you give information about the CI programme?" and two more), on a seven-point frequency scale (2018, p. 4 and Table 2). In Graticule a consultant would have to re-word an unrelated layer, whose key still decides how the rules and exports treat it: a re-worded conflict layer, for example, is still removed by "Leave out valence, energy and conflict".
- **The core defaults are general.** "Connection strength" and "valence" describe relationships in general, which makes it harder to say what a result means for the business question.
- **Returning a response is manual.** The respondent copies an encrypted block or downloads a file, then emails it as instructed; downloading clears their answers from the device ([`respond-done.jpg`](../user-guide/respond-done.jpg)). The analyst sees no response until it is imported.
- **Links outgrow their budget.** Between 40 members (1,741 characters) and 100 members (2,483 characters) a personal link passes the 2,000-character budget (D95), so larger surveys send everyone a shared survey file with a short link, which phone users must save and then choose.
- **Burden.** The estimate is 60 s plus 5 s per rating, plus 2 s per colleague considered when selecting (method notes §9). A full roster of 40 people on 4 layers is 156 ratings, 14 minutes; 150 people would be 596 ratings, 51 minutes, so selection is needed. Guidance on choosing between the two designs is one line in the user guide: rating everyone "is simplest to interpret but long for large teams".
- **Response rate drives everything** (section 7). Merrill et al. (2007, p. 3) reached 93 % by holding collection sessions in work time, with lunch or coffee, while completing the survey stayed voluntary.

**What the change involves.**

1. **A question bank organised by purpose:** information flow, advice and problem-solving, innovation and ideas, decisions, energy, collaboration across a merger or matrix, onboarding and inclusion. Each item gives its wording, scale, what it reveals, which views and rules use it, and how sensitive it is. The consultant adapts the wording to the client's issue, as Terblanche and Erasmus did.
2. **Custom relations with a declared role:** the analyst creates a relation (label, wording, scale type) and declares its kind (flow, dependency, affect, friction, formal or informal collaboration), so the rules, presets and exclusions treat it correctly. This also removes the class of problem behind issues 2 and 3.
3. **Guidance on design choices:** three to five relations; rating everyone against selecting first, with what each records; frequency anchors that mean the same thing to everyone.
4. **An optional relay:** a store that only ever holds ciphertext, as already sketched in `CLAUDE.md` ("Server transport (future)"). Respondents submit in one step, the analyst sees live counts by group and sends reminders, and the file transport remains for organisations that forbid any server. This changes spec §2 (no backend) and the Content Security Policy's `connect-src`, and the "data stays in the browser" statement must change with them.
5. **A launch kit:** a sponsor's announcement, the invitation, two reminders, the existing one-page help for respondents, confidentiality text and a prompt for a data protection impact assessment, with guidance on collection sessions in work time (Merrill et al., 2007).
6. **Context questions:** optional questions about the respondent's own situation (time in role, working pattern, site), or the same from HR records, feeding the context log of section 7.
7. **Repeat waves:** "Repeat this survey" with the same roster and questions, wave-aware import, and the analysis of change in section 6. Spec §2 places multi-wave comparison out of scope for v1; the data model is ready for it.
8. **Other sources (bolder):** import of aggregated interaction counts, such as meetings or messages per pair prepared by the client's IT, as an "observed interaction" layer beside the survey. It would show volume, not quality, would raise monitoring concerns that need legal advice and consultation with employees, and should never connect to a live system.

**Touches.** Spec §2, §4.2, §5 and §15; D26, D84, D95, D105.

## 11. Prioritised changes

Ordered by value to the persona against effort. Size is the reviewer's judgement: **S** is a change to existing code and copy, **M** a new view, rule set or screen within the current architecture, **L** a new capability that changes the data model, the architecture or the specification's scope.

| # | Change | Section | Size | Decisions touched |
|---|---|---|---|---|
| 1 | Fix issues 1–3 (silo rule on single groups and conflict layers; conflict out of the default composite) and the defects in Appendix A | 7, A | S | D26, D72, Q26 |
| 2 | Data-quality statement, non-respondent flags, coverage by group | 7 | M | D29; issue 4 |
| 3 | Group connection matrix and group map by any attribute; insight rules on any attribute | 5, 6 | M | Spec §8, §9; issue 7 |
| 4 | Audience levels, executive narrative, reader-facing method appendix | 8 | M | Spec §11; D108 |
| 5 | Question-first entry, plain-language readouts, composite under "Advanced" | 4 | M | Spec §7; D60, D130 |
| 6 | Custom relations with declared roles, and a question bank | 10 | M | Spec §4.2; D26 |
| 7 | "Check the data" screen with remedies previewed: confirmed ties, treatment of non-respondents, rater standardisation | 7 | M | Method notes §1.3; plan Q3 |
| 8 | Bridges, single points of failure and load concentration as observations | 5, 6 | M | Spec §9 |
| 9 | Repeat waves, analysis of change, before-and-after views | 6, 10 | L | Spec §2 |
| 10 | Engagement guide, guided first run, action log | 9 | M | Spec §2 |
| 11 | Workshop pack and slide export | 8 | M | Spec §11 |
| 12 | Chance baselines (permutation, QAP) and core–periphery | 6 | M | Spec §6 |
| 13 | Optional ciphertext relay | 10 | L | Spec §2, §10, §15.6 |
| 14 | Inclusion analysis with safeguards | 6 | M | Spec §10; legal advice |
| 15 | Options to consider (structural) | 9 | M | Spec §2; insight wording |
| 16 | Import of aggregated interaction data | 10 | L | Spec §2; legal advice |

## 12. Limits of this review

- **Synthetic data.** The demo and scenario projects were built to contain known structures; real response styles vary more and overlap (initial assessment §6).
- **One reviewer playing a persona.** No consultant or client used the tool for this review: no usability sessions, timings or interviews. Judgements about what a newcomer understands are the reviewer's.
- **One browser.** Headless Chromium at two window sizes; no phones, tablets or screen readers.
- **Sources.** The five resources supplied plus five further sources; not a systematic review. Duhigg (2016) is journalism, and Project Aristotle studied team norms, not networks; it is used here for how data supports conversation, not as evidence about network measures.
- **Proposals, not prototypes.** None of the changes has been built or measured, and the sizes in section 11 are judgements.
- **Report sample.** `docs/samples/graticule-report-2026-09-27-codes.pdf` was made with 0.2.0; this review used reports exported from 1.0.0 on 2026-10-22.

## 13. References

The first five were supplied with the brief. The next five were checked on 2026-10-22 against publisher or index records found by web search. Edmondson (1999) is as checked for the method notes (§12). Works known only through these sources are cited in the text "as cited in" the source and are not listed separately.

**Supplied with the brief**

- Decker-Tonnesen, P. L., Chesak, S. S., Walker, L. E., Kohler, K., Phelan, S., Gunnels, M. S., Saliba, K. L., & Bhagra, A. (2025). Role of organizational network analyses to advance workforce inclusion and belonging: A scoping literature review. *Frontiers in Psychology*, *16*, Article 1708522. https://doi.org/10.3389/fpsyg.2025.1708522
- Duhigg, C. (2016, February 25). What Google learned from its quest to build the perfect team. *The New York Times Magazine*. https://www.nytimes.com/2016/02/28/magazine/what-google-learned-from-its-quest-to-build-the-perfect-team.html
- Granovetter, M. (1983). The strength of weak ties: A network theory revisited. *Sociological Theory*, *1*, 201–233. https://doi.org/10.2307/202051
- Merrill, J., Bakken, S., Rockoff, M., Gebbie, K., & Carley, K. M. (2007). Description of a method to support public health information management: Organizational network analysis. *Journal of Biomedical Informatics*, *40*(4), 422–428.
- Terblanche, N. H. D., & Erasmus, E. D. (2018). The use of organisational network analysis as a diagnostic tool during team coaching. *SA Journal of Industrial Psychology*, *44*, Article a1548. https://doi.org/10.4102/sajip.v44i0.1548

**Checked on 2026-10-22**

- Borgatti, S. P., Carley, K. M., & Krackhardt, D. (2006). On the robustness of centrality measures under conditions of imperfect data. *Social Networks*, *28*(2), 124–136.
- Borgatti, S. P., & Everett, M. G. (1999). Models of core/periphery structures. *Social Networks*, *21*(4), 375–395.
- Huisman, M. (2009). Imputation of missing network data: Some simple procedures. *Journal of Social Structure*, *10*(1).
- Krackhardt, D. (1988). Predicting with networks: Nonparametric multiple regression analysis of dyadic data. *Social Networks*, *10*(4), 359–381. https://doi.org/10.1016/0378-8733(88)90004-4
- Woolley, A. W., Chabris, C. F., Pentland, A., Hashmi, N., & Malone, T. W. (2010). Evidence for a collective intelligence factor in the performance of human groups. *Science*, *330*(6004), 686–688. https://doi.org/10.1126/science.1193147

**From the method notes**

- Edmondson, A. (1999). Psychological safety and learning behavior in work teams. *Administrative Science Quarterly*, *44*(2), 350–383. https://doi.org/10.2307/2666999

## Appendix A. Defects found during the walkthrough

Small, and independent of the proposals above. Each was seen in the 1.0.0 build on 2026-10-22.

| # | Defect | Where | Evidence |
|---|---|---|---|
| A1 | Three user guide screenshots show only the collapsed right rail (40 × 852 px), and a fourth, of survey setup, has its lower two-thirds blank; all four are bundled into Help | `docs/user-guide/member-panel.jpg`, `insights.jpg`, `coverage.jpg`, `survey-setup.jpg`; `tests/e2e/guide.spec.ts:170`, `:189`, `:200` | Image sizes |
| A2 | "Coverage 80% is below the 80% threshold" at 79.6 %, in the top bar, the map note, the insights panel and the report | `src/ui/copy/data.ts:6` (`percent` rounds to a whole number) | [Screenshot](../screenshots/consultant-review/messy-survey-insights.jpg) |
| A3 | The silo question "How does work reach the rest of the organisation?" is asked of conflict ties ("Most conflict: personal friction ties involving Technology stay within Technology") | `src/ui/copy/insights.ts:147`; the rule is issue 2 | Post-merger insights |
| A4 | With the drawer open at 1440 × 900, "Lasso select" covers the end of the legend's last row | Compact layout, map controls | [Screenshot](../screenshots/consultant-review/messy-survey-insights.jpg) |
| A5 | "Coverage 0% is below the 80% threshold" is shown as a warning while a survey is being set up and no ratings have been collected yet | Top bar | `docs/user-guide/survey-setup.jpg` |
| A6 | The weights and composite formula stay in the left column during survey setup | Left column | `docs/user-guide/survey-setup.jpg` |
| A7 | The report's key-metrics table gives negative valence ties a column whose structural figures are degenerate (37 separate parts, 37 communities, modularity 0) | `src/ui/export/report.ts` | Demo report |
| A8 | The report's coverage section shows "Where the ratings came from: Not recorded, 5,948" with no explanation for a reader | `src/ui/export/report.ts` | Demo report |
