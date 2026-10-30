# Specification: organisational network analysis (ONA) tool

Product name: Graticule. Repository: `network`, served at `https://<username>.github.io/network/`.

This document is the single source of truth for the build. Decisions made during the build are recorded in `CLAUDE.md`. If the two conflict, stop and ask; do not resolve the conflict silently.

---

## 1. Purpose and audience

- Maps relationships within teams and organisations of roughly 5–250 members.
- Three user modes:
  - **Analyst:** survey setup and collection, data entry, validation, metrics, exploration.
  - **Presenter:** clean, captioned views shown to C-suite and senior HR.
  - **Respondent:** a participant who completes a survey through a personal link (section 15). Respondents see only the roster and their own answers.
- The output must be credible in a boardroom: precise, restrained, legible on a projector.

## 2. Scope boundaries

- **Descriptive, not diagnostic.** The tool reports network structure; it does not evaluate individuals. No member is ever labelled good or bad.
- **No backend.** All data is processed in the browser. No analytics, telemetry, or third-party requests at runtime; fonts are self-hosted. This applies to respondent mode too: survey links carry the survey, and responses return to the analyst as encrypted files or text blocks, not through a server.
- **In scope: survey collection (section 15).** The analyst sets up a whole-network survey, issues personal links, and imports the encrypted responses. The response return step sits behind a transport interface so that a hosted collection service can replace it later without changing the survey experience; no server is built in v1.
- **In scope: several waves.** A project can hold ratings from repeated runs of the same survey. Ties carry a `wave` field, defaulting to 1, surveys record the wave their responses belong to, and the project records who was on each wave's roster. The analysis, coverage, insights, saved views, presentation and exports read one wave at a time, on that wave's roster (section 6). Showing what changed between two waves is planned as a separate comparison.
- **Out of scope for v1:** a hosted collection backend.

## 3. Methodological basis

- **Design:** whole-network (roster) design. Each member rates every other member on each active relationship variable.
- **Direction:** ties are directed. A's rating of B may differ from B's rating of A.
- **Reference:** Hevey, D. (2018). Network analysis: a brief overview and tutorial. *Health Psychology and Behavioral Medicine*. Use it for general concepts only: nodes, weighted and directed edges, centrality, community structure and stability. Much of that paper concerns networks of psychological variables estimated statistically. Those estimation methods do not apply here, because ties are directly observed ratings between people.

## 4. Data model

### 4.1 Members
Each member has an `id` and a `display_name`, plus attributes the user can define. The default attributes are:
- team/function
- level
- location
- tenure band
- formal manager id

An optional `email` attribute holds a member's email address for survey administration (section 15.3). It is stored only in the project file, is never placed in a survey link, package or response, and is never shown in analysis views or analysis exports.

Each attribute has a `shareable` flag, off by default. Only attributes marked shareable are included in survey links and packages, and so shown to respondents (section 15.3).

An attribute can be filled from respondents' own answers to a survey's context questions (section 15.1). Such an attribute records the survey it came from, is kept apart from the built-in attributes (a respondent's answer never writes into `location` or `tenure band`), is never placed in a survey link, and is otherwise used like any other category attribute.

### 4.2 Relationship variables (layers)
Each layer is a configurable definition:

```
{ key, label, question_wording, scale_type, min, max, signed, default_weight, enabled, role }
```

Every layer has a **role**, the kind of relation it records. The rules, presets, composite defaults, question catalogue and export exclusion read the role, never the key, so a relation the analyst creates is treated like a built-in layer of the same kind. Each built-in layer has a fixed role (below).

| Role | Built-in layers | Scales | Treatment |
|---|---|---|---|
| Working connection | Connection strength | Frequency, agreement | Working tie; the map opens on it; mutual by nature |
| Formal collaboration | Formal collaboration | Frequency, agreement | Working tie; the formal–informal comparison; Formal structure preset; mutual by nature |
| Informal collaboration | Informal collaboration | Frequency, agreement | Working tie; the formal–informal comparison; Informal network preset; mutual by nature |
| Information flow | — | Frequency, agreement | Working tie |
| Advice | Advice | Frequency, agreement | Working tie; possible overload and concentrated demand; Informal network preset |
| Dependency | Workflow dependency | Frequency, agreement | Working tie; possible overload and concentrated demand; Formal structure preset |
| Ideas | Idea sharing | Frequency, agreement | Working tie; Informal network preset |
| Trust | Competence-based and benevolence-based trust, interpersonal safety | Agreement | Working tie; Relationship health preset |
| Influence | Decision influence | Frequency, agreement | Working tie |
| Awareness | Knowledge awareness | Agreement | Working tie |
| How people feel about each other (affect) | Valence, energy | Signed, agreement | Signed: adjusts ties in the composite and can colour them; Relationship health preset. Always left out by the export exclusion (section 10) |
| Friction | Conflict (both sub-layers) | Frequency, agreement | Not a working tie; weight 0 in the composite by default; left out by the export exclusion |
| Other | Primary channel | Any; categories only here | Working tie when rated on a scale; categories are recorded, not analysed |

**Relations the analyst creates.** Besides the built-in layers, the analyst can create a relation with a label, question wording, a role and a scale from a fixed set: frequency 0–5 (never → daily), agreement 0–5 (not at all → completely), signed −3 to +3, or two to eight categories. The role limits the scales offered (table above). The key is generated from the label (lower case, ASCII, underscores), is never a built-in key or a key a survey asked about, and never changes, because ties, surveys, saved views and imports name the layer by key. Deleting a created relation deletes its ratings, and the confirmation says how many, and how many saved views and surveys use it. Created relations travel through project files, survey links, packages, responses, imports and exports like built-in layers.

**Question bank.** "Add from the question bank" (in the Layers section and in survey setup) offers about thirty questions grouped by purpose (information flow; advice and problem-solving; work and dependency; innovation and ideas; decisions; collaboration; across a merger or matrix; awareness and onboarding; inclusion and trust; energy and friction), each with its wording, scale, role and a note on its sensitivity. Questions may contain a `{topic}` placeholder, replaced by a topic the analyst enters (for example "How often do you give information about {topic} to this person?"). Adding one creates a relation the analyst can edit. The bank is listed in the method notes.

Store unrated pairs as `null`. "Rated 0" and "not rated" must never be conflated anywhere in the pipeline.

A rating can also be marked **does not apply**: the rater says the question has no answer for that colleague, for example the quality of a relationship they do not have. It is stored as `null` with a `not_applicable` flag, written `n/a` in ties files and matrix entry. It is distinct from 0 (on a signed layer, 0 means neutral) and from a missing rating: metrics treat it as no rating, and coverage leaves it out of the ratings that were possible.

Each tie records its `source`: `self_report` for a rating imported from a survey response collected in Graticule (section 15), `imported` for a CSV or XLSX import, and `entered` for matrix entry. Ties saved before this field existed have no recorded source, and are shown as "Not recorded", never guessed. A tie from a survey response also records the survey and its version.

Core layers (enabled by default):

| Layer | Scale | Meaning |
|---|---|---|
| Connection strength | 0–5 | 0 = no meaningful working connection, 5 = very strong |
| Valence | −3 to +3, signed | Overall affective quality of the relationship; 0 = neutral |
| Informal collaboration | 0–5 frequency, never → daily | Collaboration outside formal roles, processes or reporting lines |
| Formal collaboration | 0–5 frequency, never → daily | Collaboration required by role, process or reporting line |

Optional layers (disabled by default). Each ships with the suggested question wording below, which the user can edit.

| Layer | Suggested question | Notes |
|---|---|---|
| Advice / information seeking | Who do you go to for work-related information or advice? | Directed. A core ONA relation (Cross & Parker, 2004, *The Hidden Power of Social Networks*) |
| Competence-based trust | I rely on this person's expertise and judgement. | Kept separate from benevolence-based trust. Conceptually drawn from Mayer, Davis & Schoorman (1995) |
| Benevolence-based trust | This person would look out for my interests. | As above |
| Energy | Interactions with this person typically leave me energised / drained. | Signed. Cross & Parker (2004) |
| Decision influence | This person's input materially affects my decisions. | Directed |
| Workflow dependency | I cannot complete my work without this person's output. | Directed |
| Knowledge awareness | I understand what this person knows and can do. | |
| Idea sharing | I would take a new or untested idea to this person. | |
| Interpersonal safety | I can raise a concern or admit a mistake with this person without fear of negative consequences. | A one-to-one (dyadic) adaptation of psychological safety, which Edmondson (1999) defined at team level. Label it as an adaptation in the method notes |
| Conflict | How often do you experience task disagreement / personal friction with this person? | Two sub-layers. Distinct from valence |
| Primary channel | In person / video / chat / email | Categorical, not weighted |

### 4.3 Project file
- A whole project is saved as a single JSON file with extension `.ona.json`.
- It holds a `schema_version`, members, layer definitions, ties, attribute definitions, saved views, surveys and settings, among them who was on each wave's roster. A wave with no roster recorded has every member on it.
- Loading an older `schema_version` runs an explicit migration function. Unknown future versions are refused with a clear message.

### 4.4 Surveys
A project holds zero or more surveys (section 15). Each survey stores:
- an `id` and its versions; each version is a snapshot of the roster (member ids in order), the layers with their question wording and scale labels, the entry method and the respondent-facing texts;
- the analyst's public key, and the private key encrypted with the analyst's passphrase (section 15.2);
- every respondent token issued, with the member, the version issued and the date;
- a log of imports: accepted responses, replaced duplicates and rejected files, each with a reason and a receipt code;
- the wave its responses belong to, its status (open or closed) and its settings (deadline, burden limit, link mode);
- when it repeats an earlier survey for a later wave, the survey it repeats.

The passphrase and the decrypted private key are never stored.

## 5. Input

- **Import.** CSV and XLSX import, with downloadable templates:
  - a members file;
  - a ties file in long format: `rater_id, ratee_id, variable, value[, wave]`;
  - a survey tool's export in wide format: one row per respondent, with a column for each colleague and question. Graticule detects the format and opens an import wizard: it reads the header (one row, or the questions in one row and the colleagues in the next), maps each question to a relation and answers written as words to scale values, and matches respondents and colleagues to the roster by id, email or name, first exactly, then ignoring case and spacing; anything else is only suggested, and a suggestion or a name shared by several members is used only once the analyst confirms it. A preview shows the long rows the answers become, and these pass through the same validation report as a ties file, with each problem placed at its row and column in the export. Unmatched people and unmapped questions are left out and reported, never guessed.
- **Reconciling attribute values.** When a members file holds values of one attribute that differ only in case or spacing (for example "Finance" and "finance"), the validation report offers to write them one way, using the most common spelling. Nothing is changed unless the analyst chooses it.
- **Validation report.** Lists problems with row numbers. It covers:
  - unknown ids;
  - self-ratings;
  - out-of-range values;
  - duplicates;
  - unknown variables;
  - non-numeric values.

  Nothing is coerced silently. The user can import valid rows and skip invalid ones, and the report states how many were skipped.
- **Roster entry.** The members of a project can be built and edited in the tool instead of imported: start an empty project, add people by name (one per line, or pasted from a spreadsheet column), edit each member's name and attributes, add attributes, and remove members. Ids are generated and never change. Removing a member removes the ratings they gave or received, after a confirmation that says how many. Like every other change to a project, it is not offered in the read-only phone layout.
- **Matrix entry.** A rater × ratee grid for each layer. It is keyboard-navigable and accepts paste from spreadsheets.
- **Survey responses.** Encrypted response files and text blocks from respondent mode are imported on the collection dashboard (section 15.5). The ratings they contain pass through the same validation report as a ties file.
- **Local persistence.** Optional IndexedDB persistence, off by default, with a visible indicator when it is on. A single action clears all locally stored data.
- **Demo dataset.** About 40 obviously fictional people across 5 teams. It is built to contain:
  - a broker;
  - a siloed team;
  - a pocket of reciprocated negative valence;
  - a clear mismatch between formal and informal ties.

  The generator is a deterministic script (seeded) committed to the repo.

## 6. Analysis engine

- The engine is a pure TypeScript module with no UI imports. It runs in a Web Worker so the interface stays responsive.
- Every metric has an in-app explanation giving its plain-English meaning, its formula and its caveats.

**Tie aggregation.**
- The user chooses a directed view or a symmetrised view.
- The symmetrised view combines the two directions by mean, minimum or maximum, or keeps a tie only where both directions report one ("both report a tie": the weaker of the two; a missing direction gives no tie, where the other rules use the one rating given).
- Reciprocity is reported in both views.

**Node metrics.** Computed per layer and for the composite:
- in-strength and out-strength;
- degree;
- betweenness;
- harmonic closeness, which handles disconnected graphs;
- eigenvector centrality, where defined;
- Burt's constraint and effective size;
- local clustering.

For path-based metrics, weight is converted to distance as 1/w. The method notes state this.

**Network metrics.**
- density and reciprocity;
- average clustering;
- components;
- community detection (Louvain) with modularity;
- centralisation;
- E-I index and cross-group density, by any attribute.

**Ties, cut points and load.** Computed per layer and for the composite, not on negative sub-layers:
- edge betweenness of every tie;
- local bridges (ties whose two members have no contact in common) with their span, the steps of the other route once the tie is removed;
- cut points: members whose removal cuts others off, with the number cut off;
- the members holding each group's ties with other groups, by the attribute the insight rules group by;
- load concentration: ties received per member, from the directed ratings in either view, and the share held by the top 10 % of members, overall and within each group.

**Signed layers (valence, energy).**
- Negative weights are never passed to path-based algorithms.
- Each signed layer is split into positive and negative sub-layers, which are computed separately.
- Report positive and negative in-valence per member.
- Count balanced and unbalanced signed triads (structural balance).

**Multiplexity.**
- Per-pair overlap between layers.
- A dedicated formal–informal comparison classifies each tie as formal-only, informal-only, or both.

**Resilience.** Remove a selected member or set of members and report the change in:
- components;
- reachability;
- average path length.

**Waves.** The analysis reads one wave: by default the latest wave with ratings, or the wave the analyst chooses. Only members on that wave's roster are analysed, and only ratings between them; coverage and the data-quality checks count the same roster, so a member who joined after a wave, or left before it, is not counted as not answering it. "Check the data" shows coverage for every wave, with how many joined and left since the wave before. The wave chosen is saved with views and named, when the project has more than one wave, in the top bar, the map legend, presentation mode and every export.

**Data coverage.**
- Response rate per rater and overall. Ratings marked "does not apply" are left out of the ratings that were possible.
- A configurable threshold, default 80%. Below it, a persistent warning states that whole-network metrics may be unreliable. Until the project has at least one rating, a neutral "No ratings yet" note takes the warning's place.
- Coverage is shown as a whole percentage, or to one decimal place where whole-number rounding would reach or cross the threshold, so a rate below the threshold never reads as equal to it.

**Data quality.** A "Check the data" view, beside coverage, shows whether the data can bear a conclusion:
- coverage by group (the attribute the insight rules group by) and by level;
- the people who gave no ratings and those who gave few, counted, and named to the analyst only;
- each rater's style: mean rescaled rating, spread, share of the scale used, whether they gave everyone the same answer, and the share of colleagues they report as tied;
- the share of reported ties not reported back, by group and by level;
- when a survey asked the boundary question (section 15.1), how many respondents rely on each number of people outside the roster, for each group of people asked about, overall and by the insight rules' grouping attribute (counts only).

Values that depend on a member's own ratings carry a flag when the member gave no ratings or few (member panel, metrics table, member metrics export); a member who gave no ratings is drawn hollow on the map, with a legend entry. Observations that name members also state the attribute values most of those members share, and mark those who gave no ratings. A data-quality statement written from these results, naming no one, is shown in the view, at the start of a presentation, in the export settings and on the PDF report's cover. The checks describe the data; they change no metric.

**Data remedies.** Analysis options that counter what the checks show, each off by default, saved with views, stated in exports, explained in the method notes, and previewed in "Check the data" by their effect on the insight observations before they are applied:
- "both report a tie" as the way to combine the two directions (above);
- members who gave no ratings either marked (the default) or left out: values that depend on their own ratings are then not defined, and the member-level insight rules neither name nor count them;
- for relations that are mutual by nature (marked per layer; by default connection strength, formal and informal collaboration), an optional reconstruction of the ties of members who gave no ratings from colleagues' ratings of them, labelled as reconstructed wherever it is shown;
- rater standardisation: on unsigned layers, each rater's ratings above the scale minimum are replaced by their rank among that rater's own ties, before the composite and every weighted metric; which ties exist does not change.

**Stability (optional).** A node-dropping bootstrap shows how stable the centrality rankings are. Rankings are displayed as intervals, not single ranks.

**Correctness.**
- A committed Python script uses NetworkX to generate reference values for the demo dataset and for Zachary's karate club graph. It writes JSON fixtures to `tests/fixtures/`.
- Vitest asserts that the TypeScript engine matches these values within a stated tolerance.
- CI uses the committed fixtures and does not need Python.
- Document every metric where library conventions differ, for example betweenness normalisation.

## 7. Prioritisation (composite weighting)

The composite is a method choice, not a default: the map opens on a question and draws ties from the relation that answers it (section 8). The weight panel sits under "Advanced: combine layers", closed until the user opens it, and the composite is used only when the user chooses to draw ties from it.

- The weight panel has one slider per active layer.
- Each layer is rescaled to 0–1 before combining. Weights are normalised to sum to 1.
- Signed layers offer three treatments, and the user picks one:
  - include the positive component only;
  - filter out negative ties;
  - use the layer as a multiplier on the composite.

  Unless the user or a preset chooses otherwise, a signed layer is a multiplier: it adjusts the strength of ties found on other layers and does not create ties of its own.
- Layers whose role is friction (the conflict sub-layers, and any friction relation the analyst creates) have default weight 0: they are frequencies of friction, which the composite could only add, so more conflict would make a stronger tie. The user may give them a weight.
- The live formula is shown in plain notation beneath the sliders.
- Presets: Formal structure, Informal network, Relationship health, Custom.
- When the map draws ties from the composite, the composite drives:
  - layout attraction;
  - edge width, unless the map is set to take edge width from another layer (section 8);
  - the node-size metric;
  - all rankings.

  Its weights are then stated on the map, in the title area and in the legend, and so in every export of the map, as well as in the report.
- Weight changes animate node positions by interpolation, so users can see what moved.

## 8. Interactive network map

The network map is an interactive node-link diagram of members and their weighted ties.

**Questions first.** The analysis starts from a question a client asks, chosen at the top of the controls. Each question is bound to the relation that answers it and to the view and settings that show it, and choosing it sets them:

| Question | Relation | View and settings |
|---|---|---|
| Who is connected to whom? (the question the map opens on) | Connection strength | Map; node size by connections in; fill by team |
| How does information reach people? | Advice | Map, directed; node size by received strength; ranked bars of incoming ties offered beside it |
| Where do teams connect, and where not? | Connection strength | Groups view; the map grouped by the same attribute |
| Who links groups that otherwise rarely meet? | Informal collaboration | Map; node size by bridging; communities outlined |
| Whose time do others depend on? | Workflow dependency | Ranked bars of incoming ties; the map sized by received strength |
| Where does work happen outside the formal structure? | Formal and informal collaboration | Map with ties from informal collaboration in the formal and informal line styles, over the formal hierarchy when manager ids exist; the formal and informal comparison offered beside it |
| Where does the network rely on a single route? | Connection strength | Map with every tie drawn, bridge ties marked and cut points highlighted |
| Where are relationships rated negatively, and is that returned? | Valence, or another signed layer | Map with negative ratings coloured and drawn whatever the tie-strength range |

- The chosen question is the view's title and the default caption of a view saved while it is chosen. Choosing another "Ties from" layer returns to the user's own settings, titled by that layer.
- A question whose relation is missing, switched off or not yet rated stays in the list, says which relation it needs and how to add it, and changes nothing; no other relation is put in its place.
- **Readouts.** Every number shown about the network is read out as a sentence a newcomer can use, built from the analysis's results: the question's own figures under its title, and, under "About this network", whichever of density, reciprocity, separate parts, communities, centralisation and the E-I index the question has not already read out. Every member measure in the member panel has a sentence beside its rank comparing the member with their colleagues ("lies on more of the shortest routes between colleagues than any of their 39 colleagues"; constraint reads the other way, as a more open or more closed network) and the median of their group. Readouts describe; they never evaluate anyone (section 2), and they follow the insight wording rules (section 9).

**Layouts.**
- Force-directed (d3-force), with attraction proportional to the selected layer or the composite.
- Grouped by attribute.
- Circular by team.
- Formal hierarchy, if manager ids exist, with informal ties overlaid.

**Encodings.** Each visual channel carries one variable, chosen by the user, and every encoding is explained in a legend that is always present (it can be condensed, never removed).

| Channel | Variable (default first) |
|---|---|
| Node size | Chosen metric, scaled by value (default) or by rank |
| Node fill | Chosen attribute or detected community; a member who gave no ratings is drawn hollow (section 6, data quality) |
| Community outline | Optional: an outline around each detected community, so communities can be read while fill shows another attribute |
| Bridge ties | Optional: a diamond on each local bridge (a tie whose two members have no contact in common) of the layer drawn, in a mark colour that is neither the accent nor the shortest-path ink |
| Edge width | The tie strength of the layer that sets the ties shown (strength or composite); or another unsigned layer; or the same width for every tie |
| Edge colour | Valence, on a diverging scale that is safe for colour-vision deficiencies and has a neutral midpoint, colouring negative ratings only by default with a switch to show the full scale; or another signed layer; or whether a tie stays within a group or crosses between groups; or another unsigned layer on a sequential scale; or none |
| Edge style | Off by default; formal versus informal when switched on and both are shown |
| Arrowheads | Directed view only, on one-way ties; a pair rated in both directions is one line without arrowheads |

**Colour choices.** The user picks a categorical and a diverging palette from a curated set, and may fix a group's colour. Every palette offered is safe for colour-vision deficiencies and meets 3:1 contrast against the map ground; colours are not entered freely.

**Default density.** The map opens showing fewer ties than the full network, so its structure can be read; the legend states which ties are hidden and that metrics are computed on all ties.

**Interaction.**
- Layer toggles, a tie-strength range (a lower and an upper bound; ties outside it are hidden from the drawing only), an option to draw ties carrying a negative rating whatever the range, attribute filters and search.
- Hovering highlights a member's neighbourhood. Clicking opens a member panel with metrics, ranks, and ties by layer.
- Ego view at 1- or 2-step depth.
- Shortest path between any two members.
- Lasso or multi-select to define a subgroup, showing its internal versus external tie density.
- Drag to pin nodes; zoom, pan, and fit to view.
- Resilience simulation.

**Linked secondary views.** Selection stays in sync across all views.
- Adjacency matrix, sortable by attribute, community or metric, and heat-coded.
- Metrics table, sortable and exportable.
- Ranked bars of incoming ties: the members shown, most ties received first, on a chosen layer (advice by default), with each member's share of all ties received and the top 10 % marked; the chart is a table, so it is its own alternative for screen readers.
- Groups view: members grouped by any category or ordered attribute, or by detected community, on the layer that sets the ties shown, in the current view. A group connection matrix (the share of possible ties within each group and between each pair of groups, heat-coded, with a sentence for the focused cell), a group map (one node per group, sized by its members, joined by lines whose width is the share of possible ties between the groups, with a table alternative), and a table of members, ties inside, ties leaving and E-I per group. Choosing a group makes its members the subgroup in every view.
- Side-by-side comparison of two layers.

**Saved views.** A saved view captures weights, filters, layout, positions, selection and the question it answers. Views are named and can be restored.

**Presentation mode.** Full screen with controls hidden. Opens with the data-quality statement (section 6), then steps through saved views, with a short caption for each. What each step shows follows the audience level (below).

**Audience levels.** Presentation mode and every export are prepared for an audience, chosen in presentation mode and in the Export dialog, with a default saved in the project. The level is enforced in one policy layer, as anonymisation is; the analyst's workspace is never restricted.

| Level | Shows | Never shows |
|---|---|---|
| Analyst (no restriction) | Everything the workspace shows, under the anonymisation and signed-layer settings | — |
| Board | Groups and the whole network: each saved view as its group map (one node per group, sized by members, joined by the share of possible ties), group-level insights, network metrics, the data-quality statement | Any member, by name, code or id; any group below the minimum size (5 by default, never below 3), which is pooled as "Other groups" when the small groups together reach the minimum and otherwise left out; member-level exports |
| Leadership team | As board, plus roles between groups (members who hold a group's ties with other groups, cut points, potential brokers), each named only if the member agreed; otherwise "A member of" their group, or "A member" when the group is below the minimum | Ratings given or received by individuals; detail of negative ratings beyond counts by pair of groups |
| Team workshop | One team's own network: its members and the ties among them, its ties with other groups as counts, insights about the team; members named only if the team agreed in advance (a per-team setting), otherwise in codes | Members of other teams; signed layers |
| One-to-one | One member's personal network card: their ties by group (ties received counted by group only, small groups pooled), ties given against received on each working layer, the colleagues they rated with their own ratings, and sentences on their position in the network. Change between waves is added once waves exist | Anyone else's ratings, except as counts |

Free text (view names, captions, the project title) has every member the level may not show replaced by "a colleague", by name or by code.

**Anonymisation.** A global toggle replaces names with role/team codes. It applies to every view and export.

**Performance.**
- The map stays interactive at 250 nodes and about 10,000 edges.
- Render to canvas if SVG performance degrades. SVG export is always available.

## 9. Insights panel

The panel lists rule-based observations. Each one shows the rule that produced it and links to the view that shows it. Examples:
- **Potential brokers:** high betweenness with low constraint.
- **Peripheral members:** low in-strength across most layers.
- **Only routes between groups:** a group whose ties with every other group are held by one or two of its members, and members through whom alone several colleagues are linked to the rest (cut points).
- **Possible overload:** highest in-degree on advice or workflow dependency.
- **Concentrated demand:** on advice or workflow dependency, the share of ties received that the top 10 % of members hold, overall and within each group.
- **Silos:** groups with low cross-group density (E-I index).
- **Negative clusters:** clusters of reciprocated negative valence.
- **Negative ratings not returned:** negative ratings whose reverse rating is not negative, counted by group.
- **Formal/informal gaps:** formal ties with no informal counterpart, and informal ties with no formal counterpart.

Rules that compare groups use one attribute, chosen by the user and saved with the project (team by default). Rules hold on realistic data: a rule on groups is not applied when there is only one group of meaningful size; relative rules need a minimum difference before they name anyone, and list at most five members; friction layers (conflict, and any relation whose role is friction) are not read as working ties; rules that read a kind of relation, such as possible overload on advice and dependency, read every layer of that role; and a finding about a group is not repeated as a list of its members.

Wording is neutral and framed as questions for inquiry, never as verdicts on individuals. For example: "Three members connect Finance to the rest of the organisation. What happens if one leaves?"

## 10. Ethics and data protection

- **First-run notice.** It states that:
  - data stays in the browser;
  - participants should give informed consent and be told how results will be used;
  - results should not be used for individual performance evaluation;
  - processing named employee data is likely to engage data protection law, so appropriate advice should be sought.

  The notice can be reopened from the help menu.
- **Respondent mode (section 15).** The notice gains a section for analysts who run a survey. It states that:
  - participants must be told the purpose, the confidentiality terms and who will see the results before they respond, and the survey cannot be sent without an introduction and a confidentiality statement;
  - responses are confidential, not anonymous: the analyst sees who gave which ratings;
  - negative ratings of named colleagues (valence, energy, conflict, and any relation whose role is affect or friction) need particular care: ask for them only with a clear purpose, and protect them accordingly;
  - response files and the emails that carried them are personal data, and should be deleted once imported.

  Respondents never see the analyst's first-run notice; they see the welcome and consent screens of section 15.4.
- **Signed-layer exclusion.** An option, "Leave out how people feel about each other and friction", excludes every signed layer and every layer whose role is affect or friction (valence, energy, conflict, and any such relation the analyst created) from all exports.
- **Anonymisation.** Available in one click from any view.
- **Audience levels (section 8).** Outputs for a board, a leadership team, a team workshop or a one-to-one show only what that audience may see: no individual and no group below a minimum size for a board; roles between groups named only with the member's agreement for a leadership team; one team's own network, named only with the team's agreement, for a workshop; one person's own card for a one-to-one. Who agreed is recorded in the project.
- **Content Security Policy.** Set via a `<meta>` tag, because GitHub Pages cannot set headers. The policy restricts `connect-src` to `'self'`, so the claim that data stays in the browser is enforced rather than asserted.

## 11. Exports

- PNG and SVG of the current map view, including the legend and caption.
- CSV of node metrics and network metrics.
- A PDF report generated client-side, built as a storyline for its audience:
  - a cover with the question the report answers, the audience level and the data-quality statement (section 6);
  - an executive summary of about two pages: three to five group-level headlines, each with "What we saw", "Why it may matter" and "Questions for discussion", drafted from the structured observations by fixed templates (no language model, so no data leaves the browser) and edited by the analyst before export; the edit is saved with the project, one per audience level;
  - one page per saved view chosen, in presentation order, with its map, caption and the sentences that read out its figures (the map on screen when no view is chosen);
  - data quality (coverage, ratings by source, survey response rates);
  - the method in brief: one or two plain sentences per measure, from the method notes' notes for readers;
  - optional appendices: key metrics (with ties within and between groups by the grouping chosen in the Groups view, team by default), the insight rules with every observation, and the technical notes;
  - an ethics statement.
  The Export dialog chooses the views, the audience level and whether to include the appendices.
- Every export shows one wave, the one analysed (section 6); each saved view in a report shows its own wave. When the project has more than one wave, the wave is named in the map legend, on the report's cover, in the network metrics and in every file name, and the report's survey response rates list that wave's surveys.
- Every export respects the anonymisation and signed-layer exclusion settings, and the audience level (section 8). At board and leadership level the map export is the group map and the report's map page shows groups; member metrics, the formal–informal pairs and the metrics table are not offered; group rows below the minimum size are pooled or left out; the report lists group-level insights only, its summary is drafted from them, its view pages show groups, and for a leadership team it lists the roles between groups. A team workshop's exports hold its team only. A one-to-one offers the member's personal network card as a PDF and nothing else.
- Survey administration files (the mail-merge list of links, the non-responder list and the key backup, section 15) are not analysis exports. They identify people by design, so anonymisation does not apply to them; each is labelled as containing personal data when saved.

## 12. Design language

The audience is C-suite and senior HR. The tool should read as a precise analytical instrument, not a marketing site or a generic dashboard. Ground visual choices in the subject (mapping, organisational diagnosis), not in generic SaaS conventions.

The approved token system lives in `docs/design-system.md` and `src/styles/tokens.css`. The approved tokens are the only source of colour, type, spacing, radius, elevation and motion values in the codebase. Hard-coded values are defects.

**Requirements.**
- **Type:** one type family, or two clearly distinct ones, self-hosted under an open licence, with tabular figures for all numeric data. Do not default to Inter, Space Grotesk or Playfair Display.
- **Case:** sentence case everywhere. No all-caps labels, no eyebrow labels above headings, no decorative numbering.
- **Colour:** reserved primarily for data. UI chrome is neutral, with a single UI accent that does not compete with data colours. The categorical palette has at most 8 hues.
- **Hierarchy:** carried by type size, weight and spacing rather than boxes and borders. Elevation is used only for overlays (menus, dialogs, popovers). Radius varies by component role rather than using one value everywhere.
- **Motion:** only in response to user action, such as layout transitions and panels opening. UI transitions are 250 ms or less, and `prefers-reduced-motion` is respected.
- **Data-ink discipline:** no 3D, no shadows or gradients on data marks, no decorative gridlines.
- **Accessibility:** WCAG 2.2 AA. The map is fully keyboard-operable: nodes are focusable, and arrow keys move between neighbours. A tabular alternative is available for screen readers.
- **Screen sizes:** the analyst workspace and presentation mode are desktop-first (1280–2560 px) and projector-legible, usable on tablet and read-only on phone. On smaller laptop screens (narrower or shorter than a large desktop monitor) a compact layout lets the side panels collapse and the legend condense, so the map keeps most of the screen; the user can also choose the compact or full layout. The collection dashboard follows the analyst rules. Respondent mode (section 15.4) is designed mobile-first and must be fully usable from 320 px wide phones to desktop, in portrait and landscape, with touch targets of at least 48 × 48 CSS px (which meets both Apple's 44 pt and Material's 48 dp guidance) and no horizontal scrolling.

**Avoid.** These are common signs of a generated interface:
- purple, indigo or blue-violet gradients, and gradient washes used as decoration;
- a warm cream background with a high-contrast serif display face and a terracotta accent;
- a near-black background with a single neon accent;
- broadsheet pastiche: hairline rules, zero radius, dense newspaper columns;
- identical rounded cards with the same soft grey shadow;
- glassmorphism, blurred backdrops and glows;
- emoji, sparkle or "AI" iconography;
- hero stat blocks (a big number with a small label);
- meta strings joined with middle dots, arrows appended to button text, and monospace for small data labels;
- entrance animations on every panel.

**Copy.**
- Use plain language and active verbs.
- Name labels by what users understand: "Connection strength", not "edge weight". Technical terms live in the method notes.
- A button's label and its confirmation use the same verb: "Export map" → "Map exported".
- Errors state what went wrong and how to fix it.
- Empty states tell the user the next action.

## 13. Technical stack and repository

**Stack.**
- React and TypeScript (strict mode), built with Vite. Node version pinned in `.nvmrc`.
- d3 (force, scales, zoom), plus graphology with graphology-metrics and graphology-communities-louvain. Equivalents are allowed if the choice is justified in `CLAUDE.md`.
- A lightweight state store, such as Zustand.
- Papa Parse and SheetJS for import.
- Vitest for unit tests, Playwright for end-to-end tests and screenshots, and axe-core for accessibility checks.
- ESLint and Prettier, with a `lint` script.

**Hosting (GitHub Pages).**
- Set Vite `base` to `/network/`.
- No client-side routes that need server rewrites. Use hash-based routing or none.
- Deploy with a GitHub Actions workflow triggered on push to `main`. It installs dependencies, runs lint, type-check and unit tests, builds, then deploys using the official Pages actions: `actions/configure-pages`, `actions/upload-pages-artifact` and `actions/deploy-pages`. A failing check blocks deployment.
- In the repository settings, set Pages source to "GitHub Actions". This is a manual step for the owner.
- Run the Playwright tests in a separate workflow on pull requests.

**Data safety in a public repository.**
- `.gitignore` excludes the following, with explicit exceptions for the templates and demo generator:
  - `*.ona.json`;
  - `data/private/`;
  - any `.csv` or `.xlsx` outside `public/templates/`.
- The README warns never to commit real participant data.

**Suggested structure.**

```
src/
  engine/        pure analysis (worker entry, metrics, aggregation, composite)
  data/          schema, validation, import, migrations, persistence
  ui/            components, views, map renderer
  styles/        tokens.css, global styles
  demo/          seeded demo generator output
  survey/        survey model, link and package codec, crypto, response transport (no React)
  respond/       respondent route (#/respond/…), loaded without the analyst workspace
scripts/         demo generator, NetworkX fixture generator (Python)
tests/           unit, fixtures, e2e
docs/            design-system.md, method-notes.md, screenshots/
public/templates/
```

## 14. Phases

| Phase | Content | Accept when |
|---|---|---|
| 0 | Plan and design system proposal (no code) | Owner approves |
| 1 | Scaffold, tooling, CI/CD, tokens, app shell | A placeholder shell deploys to Pages via Actions; lint, type-check and tests pass in CI |
| 2 | Data model, import and validation, matrix entry, project files, demo dataset | The validation report catches deliberately seeded errors; a project round-trips save/load with no loss |
| 3 | Analysis engine and fixtures | All metrics match the NetworkX fixtures within tolerance |
| 4 | Map view, encodings, legend, member panel | A 250-node synthetic graph pans, zooms and filters without visible lag; every encoding appears in the legend |
| 5 | Composite weighting, layouts, linked views, ego view, path, resilience, multi-select | All views stay in sync; the displayed formula matches the computed values |
| 6 | Insights, saved views, presentation mode, anonymisation, ethics notice | A full presentation runs from saved views; anonymisation applies everywhere |
| 6R | Respondent mode (section 15): survey data model and schema migration, keys and encryption, links and packages, respondent flow, collection dashboard, ethics notice additions | A survey runs end to end in the browser: three respondents (one on a phone viewport) complete it through links, return responses by file and by text, and the analyst's import produces the expected ties and coverage; tampered, unknown, duplicate and wrong-version responses are handled as specified; zero serious or critical axe-core violations on every respondent and dashboard screen; the respondent flow can be completed by keyboard alone |
| 7 | Exports | Every export respects anonymisation and signed-layer exclusion; the PDF report's coverage section includes survey response rates |
| 8 | Design, accessibility and performance pass | Zero serious or critical axe-core violations; full keyboard operation; performance targets met; respondent mode checked on real iOS Safari and Android Chrome devices and with VoiceOver and TalkBack |
| 9 | Documentation and release | README, method notes and user guide are complete, including a guide to running a survey and a one-page help for respondents; release tagged |

## 15. Respondent mode

The analyst runs a whole-network survey inside Graticule, with no backend. Each participant receives a personal link, completes the survey in Graticule, and returns an encrypted response file or text block to the analyst, who imports all responses at once. The return step is isolated behind a transport interface (15.6) so that a hosted collection service can replace it later without rebuilding the survey experience.

### 15.1 Survey setup (analyst)

- The analyst creates a survey within a project. Settings:
  - **Layers:** which enabled layers to include, with editable question wording and scale labels. Categorical layers (primary channel) can be included.
  - **Direction:** respondents rate their outgoing ties (their view of each colleague). This is fixed.
  - **Entry method:**
    - *Nomination then rating* (the default): the respondent first selects the colleagues they have a working relationship with, then rates only those. The nomination question is editable. For each layer the analyst chooses what a colleague who is not selected is stored as: `0` (the default for unsigned layers) or "does not apply" (section 4.2). The default for signed and categorical layers is "does not apply", because 0 on a signed layer means neutral, not absent. The respondent is told in plain words what not selecting someone records.
    - *Required colleagues:* with nomination, the analyst can tick colleagues whom every respondent is asked about, whether or not they select them, for example a leadership team. Changing the list after links have been issued creates a new version.
    - *Full roster:* the respondent rates every colleague on every layer.
  - **Answers are required:** every question must be answered for every colleague the respondent is asked about. Per layer, the analyst chooses whether to offer "Does not apply" as an answer beside the scale; it is offered by default on signed layers, where 0 is a real answer (neutral).
  - **Texts:** introduction, confidentiality statement and return instructions (where to send the response, for example an email address or a file-request link). The survey cannot be issued while any of the three is empty.
  - **Deadline:** optional; shown to respondents.
  - **Estimated completion time:** calculated from roster size, the number of layers, the entry method and any context and boundary questions, using stated per-item times (recorded in `docs/method-notes.md`), and shown to the analyst and to respondents. Nomination uses an expected number of nominations, which the analyst can edit.
- **Burden warning.** When the estimate exceeds a configurable limit, a warning states the estimate and the limit, and suggests including fewer layers or using nomination.
- **Identity and versions.** Each survey has a random `id` and a version number, starting at 1. Changing the roster, the included layers, their wording or scales, or the entry method after links have been issued creates a new version; the texts and the deadline can change without one. Earlier links stay valid and answer their own version. The analyst can issue links for the new version (to everyone, or only to members who have no link yet). Responses record the version they answered.
- **Wave.** Each survey states the wave its ratings are imported into (default 1).
- **Repeat this survey.** Creates a survey for the next wave with the same questions, texts and settings and a new link for each person, on a roster the analyst confirms (by default everyone in the project; people who have left are unticked and keep their earlier waves). It uses the same key and passphrase as the survey it repeats. Repeating records the roster of the new wave and of every earlier wave; people added to the project afterwards join the latest wave only, and the Members tab shows and changes who is on each wave's roster. A survey's roster is its wave's roster.
- **Design guidance.** Setup opens with guidance for a newcomer: relations suggested by purpose from the question bank (section 4.2), with the number of questions asked against a recommended three to five; what rating everyone and selecting first each record and how long each would take for this roster; and the response rate a whole-network design needs (the coverage threshold as a number of people, and the share of pairs reported from both sides at that rate).
- **Context questions (optional).** The analyst can ask about the respondent's own situation from a fixed set: time in current role, where they usually work, usual working hours, and main site (whose answers the analyst lists, 2 to 8, defaulting to the project's locations, plus "Somewhere else"). Each has "Prefer not to say". The questions are on their own screen, after the ratings, behind an unticked consent box; without consent nothing is asked or sent. With consent, each answer is stored on import in a member attribute created for the question (section 4.1), and a later response from the same member replaces the earlier answers as a whole. Changing the context questions creates a new version.
- **Boundary question (optional).** "Roughly how many people outside this list do you rely on to get your work done?", asked for each of 1 to 6 groups of people the analyst names (by default other parts of the organisation, customers or clients, suppliers or partners), answered None, 1 or 2, 3 to 5, 6 to 10 or More than 10; every group must be answered. The answers are stored with the response in the import log, not as attributes, and shown in "Check the data" (section 6). Changing the groups creates a new version.
- **Launch kit.** The survey's page offers drafts built from its settings, each as a text file: a sponsor's announcement, the invitation (a mail-merge template for the links export), two reminders, the one-page respondent help, a confidentiality statement, and a checklist for a data protection impact assessment. The drafts name no member.

### 15.2 Encryption and integrity

- **Analyst key pair.** When a survey is created, Graticule generates an ECDH P-256 key pair with WebCrypto. The public key is placed in every link or package.
- **Hybrid encryption of each response.**
  - The respondent's page generates a fresh ECDH P-256 key pair for that response and derives a shared secret with the analyst's public key.
  - HKDF-SHA-256, with a random 32-byte salt and a fixed context string that names the format version, derives a 256-bit AES-GCM key.
  - AES-GCM encrypts the compressed response with a random 96-bit IV. The survey id, version and a fingerprint of the analyst's public key are bound as additional authenticated data, so the unencrypted header cannot be altered without detection.
- **Private key storage.** The private key is stored in the project file only in encrypted form: it is exported (PKCS #8) and encrypted with AES-GCM under a key derived from the analyst's passphrase with PBKDF2-HMAC-SHA-256, 600,000 iterations and a random salt. The passphrase has at least 12 characters and no composition rules.
- **Key backup.** Survey creation cannot finish until the analyst has downloaded a passphrase-protected key backup file and confirmed it by opening the downloaded file and entering the passphrase, which Graticule uses to decrypt the backup. The screen states clearly: if the key and its backup are lost, or the passphrase is forgotten, the responses cannot be read by anyone, including the analyst.
- **Tokens.** Each respondent receives a random single-use token (128 bits). The token travels inside the encrypted response. The project records every token issued.
- **On import:**
  - the token is validated against the tokens issued for that survey; an unknown token is rejected;
  - a second submission with the same token is a duplicate: the one with the latest submission time is kept, the other is set aside, and the event is logged;
  - the same file imported twice (the same receipt code) is recognised as already imported and changes nothing;
  - a response for a version the survey does not have is rejected;
  - a payload that fails AES-GCM authentication is rejected as tampered or corrupt; the message does not guess which;
  - a response encrypted for another survey's key is rejected as belonging to another survey.
- **What this protects against, stated in the method notes.** Responses cannot be read by anyone without the analyst's private key and passphrase, including whoever carries or stores the file (email providers, file-sharing services). Any change to a response is detected. Without a server there is no proof of who answered: a respondent who forwards their link lets someone else answer as them, and anyone who can see the link (for example in an email security service's click log) holds the token. Tokens detect duplicates; they do not prove identity. The name confirmation step (15.4) asks the respondent to confirm who they are, but this is a prompt, not authentication. Nothing protects answers on a respondent's own device before submission (15.4), or the analyst's project once decrypted.

### 15.3 Survey links

- **Form.** `https://<username>.github.io/network/#/respond/<payload>`. The payload is in the URL fragment, which browsers do not send to the web server. It must not be treated as secret: email and chat security services can rewrite, scan and log whole links (see the research recorded in `CLAUDE.md`).
- **Payload.** The survey id and version; the respondent's roster position and token; the roster (display names and any attributes marked shareable, none by default); the layer definitions; the entry method and nomination wording; the introduction, confidentiality statement, return instructions and deadline; the estimated completion time; the context questions and the boundary question's groups, when asked; and the analyst's public key. It never contains email addresses, other attributes, other respondents' tokens or any rating.
- **Encoding.** The payload is serialised as compact JSON, compressed with `CompressionStream('deflate')` (the zlib format, whose checksum detects a truncated or altered link) and encoded as base64url without padding. A payload format version is its first field. Any change to what links, packages or responses carry raises their format version, and the respondent page and the dashboard still read every earlier version.
- **Link-length budget.** A link is issued only if it is at most **2,000 characters**. Longer surveys use a survey package. The analyst can also choose "Always use a survey package" for every survey size; this is recommended where the organisation's email passes through a link-rewriting security service.
- **Survey package.**
  - The analyst distributes one shared survey file (`.graticule-survey`) containing the same payload minus the personal fields, and gives each person a short personal link: `#/respond/p/<survey id>.<roster position>.<token>.<package fingerprint>` (about 110 characters).
  - The respondent opens the link and is asked for the survey file ("Choose the survey file you were sent"). The page checks the file against the fingerprint in the link and refuses a file that does not match, so a substituted file (for example one carrying another public key) cannot be used.
  - On phones the page explains, in one sentence per platform, how to save an email attachment so it can be chosen. The package path is tested on phone viewports.
- **Distribution.** The analyst can copy each person's link; export a CSV (name, email if recorded, link) for mail merge; and export a list of non-responders, with the same columns, for reminders. Email addresses come only from the optional `email` attribute.

### 15.4 Respondent experience

- **Screens.** Fully usable on phones as well as desktop, designed mobile-first for this route only (section 12, screen sizes). It uses the approved tokens and design language, adapted for respondents: calm, plain and trustworthy. No analyst chrome, analysis data, or first-run notice appears on this route.
- **Sequence.**
  1. **Welcome:** the purpose (introduction text), the estimated time, the deadline if set, the confidentiality statement, and who will see the results.
  2. **Consent:** a required confirmation before any question is shown.
  3. **Name confirmation:** "Are you [name]?" If not, the page asks them not to continue and to tell the sender, and does not show the survey.
  4. **Nomination** (if used): a searchable roster, with the meaning of not selecting someone stated above the list, and the required colleagues listed separately as already included.
  5. **Rating:** one colleague at a time on phones; a compact table on desktop. The question wording and scale labels are always visible while rating. Every question needs an answer; "Does not apply", where offered, sits apart from the scale. Moving on with a question unanswered is refused with a message naming what is missing.
  6. **People outside this list** (if asked): the boundary question, one answer per group, every group required.
  7. **About your work** (if asked): the optional context questions behind a consent box, as section 15.1.
  8. **Review:** every answer, grouped by colleague, then the answers about people outside the list and about the respondent's work, each editable. The response cannot be finished while any question is unanswered.
  9. **Submit.**
- **Honest wording.** Responses are confidential, not anonymous: the analyst sees who gave which ratings, because the method requires it. The respondent screens say so. The word "anonymous" never appears in respondent mode.
- **Progress.** Answers are saved on the device after every change, keyed by survey id and token, so the respondent can close the page and resume. "Clear my answers from this device" is always available. Saved answers are deleted automatically after a successful submission. The welcome screen says that answers are saved on this device until submitted.
- **Return.** Submitting encrypts the response (15.2) and offers two ways to return it:
  - download a response file with a neutral name that contains no names (for example `graticule-response-7KQ2-M4XD.txt`);
  - copy an encrypted text block to paste into an email, offered first on phones.

  The page then shows the return instructions and a short receipt code (eight characters, derived from the encrypted response) that the respondent can quote to the analyst, and which the analyst's dashboard shows on import.
- **Data seen.** The respondent never sees any data other than the roster (with shareable attributes) and their own answers.
- **Offline.** Once the survey has loaded, completing and submitting it needs no network connection: all code for the route is loaded before the welcome screen, and nothing is requested afterwards.
- **Accessibility.** WCAG 2.2 AA; the whole flow can be completed by keyboard alone and with a screen reader; touch targets as section 12.
- **Supported browsers.** Current Safari, Chrome, Firefox and Edge on desktop and mobile. The route needs a secure context, WebCrypto (ECDH P-256, HKDF, AES-GCM) and `CompressionStream`; if any is missing, the page says so before the welcome screen and names the minimum versions recorded in `CLAUDE.md`, rather than failing part-way.

### 15.5 Collection dashboard (analyst)

- **Waves:** once a project has more than one survey, the dashboard lists every survey by wave, with its status and responses, and opens any of them.
- **Status per survey:** links issued; responses imported; response rate against the coverage threshold (section 6); non-responders; duplicates; rejected files with the reason for each.
- **Import:** drag and drop of many files at once, a file chooser, and a paste box for text blocks (several blocks can be pasted together).
- **Passphrase:** required to decrypt. It is held in memory for the session only and never persisted; closing or reloading the page forgets it.
- **Context and boundary answers:** answers to context questions given with consent are written to the members' attributes; boundary answers are kept in the import log. The import plan says how many responses include answers about the respondent's work.
- **Ties:** imported responses become ties with `source` = `self_report`, the survey's wave, and the survey id and version. They pass through the existing validation report before they are applied. A response never overwrites a tie from another source; the conflict is reported. A later duplicate from the same token replaces that token's earlier self-report ties as a whole.
- **Older versions:** responses to an earlier version are mapped to the current roster and layers by member id and layer key. Ratings of members or layers that are no longer in the survey, and colleagues or layers added since, are reported; nothing is guessed.
- **Close:** closing a survey stops further imports until the analyst reopens it.
- **After import:** the dashboard reminds the analyst to delete the received response files and the emails that carried them.
- **Empty state.** The workspace's empty state offers "Run a survey", "Add members" (roster entry, section 5), "Import survey data" (the existing CSV and XLSX import), "Enter as observer" (only if an observer mode is built; none is specified yet) and "Load demo".

### 15.6 Transport abstraction

- Response return is isolated behind a `ResponseTransport` interface used by the respondent flow's final step and by the dashboard's import. v1 has one implementation: an encrypted file or text block.
- The interface is shaped so that a future server transport can plug in without changing the survey screens: submit an encrypted response, receive an acknowledgement (a receipt), and poll collection status. How a server transport would plug in is documented in `CLAUDE.md`. Nothing server-side is built, and the CSP is unchanged.
