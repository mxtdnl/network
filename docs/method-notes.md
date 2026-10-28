# Method notes

These notes define every metric Graticule computes: what it means in plain English, the formula the engine evaluates, and the caveats a reader needs. They also state every rule and threshold that shapes a result: the insight rules (section 8), survey collection (section 9), the relationship layers (section 10), and the rules for data, display and exports (section 11). The in-app explanations are drawn from this text, and the notes can be read in Graticule from Help → Method notes. Where Graticule's convention differs from NetworkX, the difference is stated and the reference fixtures apply the same convention (section 7). How to use each measure in practice is in the [user guide](user-guide.md); references are in section 12.

**Design.** Graticule uses a whole-network (roster) design: each member rates every other member on each active relationship variable (layer). Ties are directed: A's rating of B may differ from B's rating of A. For general concepts (nodes, weighted and directed edges, centrality, community structure and stability), see Hevey (2018). Much of that paper concerns networks of psychological variables estimated statistically. Those estimation methods do not apply here, because ties are directly observed ratings between people. Graticule is descriptive, not diagnostic: it reports network structure and does not evaluate individuals.

The analysis engine is `src/engine/`. Formulas below use this notation:

- n: number of members.
- v_ij: the rating member i gave member j on a layer (the rater is i).
- w_ij: the rescaled weight of the tie i → j, between 0 and 1. A tie exists when w_ij > 0.
- d_ij: the length of the shortest path from i to j, where each tie counts as 1/w.
- N(i): the members i has a tie with, in either direction.

## 1. General conventions

### 1.1 Not rated is not zero

A rating of 0 means "no connection" or "never" (on a signed layer, "neutral"). A missing rating means the person did not answer. The two are never treated alike: a missing rating does not create a tie, is not counted as a 0 in averages, and is counted as missing in data coverage. Inside the engine a missing rating is the value NaN; in project files it is `null` or an absent tie.

A third state, **does not apply**, records that the rater said the question has no answer for that colleague, such as the quality of a relationship they do not have. It is neither 0 nor missing. Metrics treat it like a missing rating (no tie), but coverage leaves it out of the ratings that were possible, because there was nothing to give. In project files it is `null` with `not_applicable: true`; in ties files and matrix entry it is written `n/a`.

### 1.2 Rescaling

Every layer is rescaled to 0–1 before any metric, so values from different layers can be compared and combined.

- Unsigned layers: r = (v − min) / (max − min). On a 0–5 scale, 0 → 0, 1 → 0.2, 5 → 1.
- Signed layers (valence, energy): s = v / max for v ≥ 0 and v / |min| for v < 0, so s runs from −1 to +1. Each signed layer is split into a positive sub-layer, w⁺ = max(s, 0), and a negative sub-layer, w⁻ = max(−s, 0). The two are analysed separately and never netted.

Caveat: rescaling assumes the points of a rating scale are equally spaced. A "5" is treated as five times a "1".

### 1.3 Directed and symmetrised views

In the directed view A's rating of B and B's rating of A are separate ties.

In the symmetrised view each pair has one tie, combined from the two directions by the rule the analyst chooses:

- mean: (w_ij + w_ji) / 2;
- minimum: min(w_ij, w_ji), a tie only if both sides report one;
- maximum: max(w_ij, w_ji), a tie if either side reports one;
- both report a tie: min(w_ij, w_ji) when both are above 0, otherwise 0; missing when either direction is missing.

If only one of the two has rated the other, that rating is used on its own under mean, minimum and maximum (they then agree). Under "both report a tie" it is not: the pair is missing, so a member who gave no ratings has no ties at all in this view. If neither has rated the other, the pair is missing under every rule. Signed layers are combined before they are split, so when A rates B positively and B rates A negatively the pair's sign follows the rule: the sign of the mean, negative under minimum, positive under maximum, and no tie under "both report a tie", which keeps a pair only when both ratings have the same sign (the one nearer zero).

The minimum rule is often described as "a tie only if both sides report one", and it is when both have answered; but because a missing direction is filled from the one given, a tie to someone who did not answer survives it. "Both report a tie" is the rule for confirmed ties only (build plan session 5; section 14).

Caveat: the minimum rule and "both report a tie" make the network sparser and the maximum rule denser; metrics can change markedly between them. "Both report a tie" turns non-response into absent ties, so below full coverage it removes real ties along with unconfirmed ones. The chosen rule is part of every result.

### 1.4 Distance for path-based metrics

Shortest paths treat a strong tie as short: each tie has length 1/w. A tie of weight 1 has length 1; a tie of weight 0.2 has length 5. This applies to betweenness, harmonic closeness, resilience and shortest paths.

Negative weights are never passed to path-based algorithms. The only way into them is one gate (`pathGraph` in `src/engine/graphs.ts`), which refuses any negative or undefined weight, and a unit test runs a full analysis of the demo (which has negative valence) through every view, rule and signed treatment while checking that gate. Path-based metrics are not computed on negative sub-layers at all (section 3.1).

### 1.5 Undefined values

A metric that cannot be computed for a member is shown as "Not defined" with the reason, never as 0. Reasons: the member has no ties; the member is outside the largest connected group (eigenvector centrality); the calculation did not converge.

## 2. Tie aggregation

### Reciprocity

**Meaning.** How often ties are returned: when one member reports a tie to another, how often the other reports one back.

**Formula.** On the directed ties of the layer, whichever view is shown:

- tie reciprocity = (number of ties whose reverse tie also exists) / (number of ties);
- dyad reciprocity = mutual pairs / (mutual pairs + one-way pairs).

**Caveats.** The two figures differ: a network with one mutual pair and one one-way pair has tie reciprocity 2/3 and dyad reciprocity 1/2. Both ignore tie strength. Missing ratings lower reciprocity, because an unanswered survey looks like an unreturned tie.

## 3. Node metrics

Computed for every unsigned layer, the positive sub-layer of each signed layer, and the composite. In the directed view in- and out- versions are reported separately; in the symmetrised view there is one of each.

The app names each metric in plain words; the technical name is given in its explanation (the information button beside it in the member panel).

| Name in the app | Metric | View |
|---|---|---|
| Received strength, Given strength | In-strength, out-strength | Directed |
| Strength | Strength | Mutual (symmetrised) |
| Connections in, Connections out | In-degree, out-degree | Directed |
| Connections | Degree | Mutual |
| Bridging | Betweenness (weighted); "Bridging, every tie counted as 1" is the binary version | Both |
| Reach from others, Reach to others | Harmonic closeness, incoming and outgoing | Directed |
| Reach | Harmonic closeness | Mutual |
| Ties to the well connected | Eigenvector centrality | Both |
| Constraint | Burt's constraint | Both |
| Non-redundant contacts | Effective size | Both |
| Local clustering | Local clustering coefficient | Both |

**Ranks.** The member panel shows each value with its rank among the members: 1 is the highest value. Tied values share a range ("22–24"), and a value that is not defined has no rank ("–"). Rank ranges from resampling (the bootstrap below) replace the single rank of the chosen metric once they have been run; their percentiles are rounded outwards to whole ranks. A rank orders positions in this network on this layer; it is not a score of the person.

### 3.1 Negative sub-layers

Negative sub-layers get strength, degree and clustering only. Betweenness, harmonic closeness, eigenvector centrality, constraint and effective size are not computed there, because a shortest path or a flow along negative ties has no clear social meaning.

### In-strength and out-strength

**Meaning.** How much tie weight a member receives (in-strength) or gives (out-strength). In the symmetrised view, the total weight of the member's ties.

**Formula.** in-strength_i = Σ_j w_ji; out-strength_i = Σ_j w_ij; symmetrised strength_i = Σ_j w_ij.

**Caveats.** Uses 0–1 weights, so the maximum is n − 1. Out-strength reflects how the member answered the survey as much as their relationships: generous raters have high out-strength.

### Degree

**Meaning.** How many ties a member has, regardless of strength.

**Formula.** in-degree_i = number of j with w_ji > 0; out-degree_i = number of j with w_ij > 0; symmetrised degree_i = |N(i)|.

**Caveats.** A weak tie counts as much as a strong one. In the directed view in- and out-degree are reported separately and never added (NetworkX's `degree_centrality` on a directed graph adds them, giving values that can exceed 1).

### Betweenness

**Meaning.** How often a member lies on the shortest routes between other members. High betweenness marks someone who connects parts of the network that are otherwise far apart.

**Formula.** Freeman (1977), computed with Brandes' (2001) algorithm, as graphology and NetworkX do: B_i = Σ over pairs s ≠ i ≠ t of σ_st(i) / σ_st, where σ_st is the number of shortest paths from s to t and σ_st(i) the number passing through i, with tie length 1/w. Normalised so values run from 0 to 1: divided by (n − 1)(n − 2) for ordered pairs in the directed view, and by (n − 1)(n − 2)/2 for unordered pairs in the symmetrised view. Weighted betweenness comes from Graticule's own Brandes pass, which gives edge betweenness at the same time (section 16); binary betweenness from graphology. Both match NetworkX on the fixtures.

**Caveats.** Assumes that things travel along shortest paths only. Sensitive to single ties: one extra tie can move a member's value a great deal. Paths of exactly equal length are compared by floating-point equality, so two paths whose lengths differ only by rounding are not both counted. A binary version (every tie length 1) is also computed, for centralisation.

### Harmonic closeness

**Meaning.** How easily a member can be reached from everyone else ("reachability from others"). The outgoing version measures how easily the member reaches everyone else.

**Formula.** Harmonic closeness (Marchiori & Latora, 2000): H_i = (1 / (n − 1)) Σ_{j ≠ i} 1 / d_ji, where 1/d = 0 when there is no path. The outgoing version uses d_ij.

**Caveats.** Unlike classic closeness, it stays defined when the network is split into separate groups: unreachable members simply add nothing. Divided by (n − 1), so with 0–1 weights the value is at most 1. NetworkX's `harmonic_centrality` returns the undivided sum and uses incoming distances; Graticule follows its direction and divides.

### Eigenvector centrality

**Meaning.** A member is central if they are tied to members who are themselves central. It rewards being well connected to the well connected.

**Formula.** Bonacich (1972): the principal eigenvector x of the weighted adjacency matrix: λ x_i = Σ_j w_ji x_j, found by power iteration (on A + I, which avoids oscillation), scaled so that Σ x_i² = 1. Converged when the summed change is below n × 10⁻¹².

**Where defined.** Only on the largest strongly connected group (directed view) or connected group (symmetrised view): a set of members who can all reach each other. Everyone outside it is "Not defined", because a member who cannot be reached from the core has no well-defined score. If two groups tie for largest, the one containing the earliest member in the member list is used. If the largest group has fewer than two members, or the iteration does not converge within 10,000 steps, the metric is not defined for anyone.

**Caveats.** Values are only comparable within one group and one layer. NetworkX returns values for a graph that is not strongly connected without warning; they are not meaningful there, and Graticule does not report them.

### Burt's constraint

**Meaning.** How much a member's contacts are tied to each other. High constraint means a closed, redundant network in which the member has few independent options; low constraint means contacts in separate circles.

**Formula.** Burt (1992). With mutual weight M_ij = w_ij + w_ji and proportional tie p_ij = M_ij / Σ_k M_ik:

c_i = Σ_{j ∈ N(i)} (p_ij + Σ_{q ∈ N(i), q ≠ i, j} p_iq p_qj)².

**Caveats.** Ranges from about 0 to just over 1; members with few contacts score high by construction (one contact gives constraint 1). Not defined for a member with no ties. Directed ties in either direction count as contact.

### Effective size

**Meaning.** The number of a member's contacts who are not redundant: the size of their network after discounting contacts who are tied to each other.

**Formula.** Burt (1992). With p as above and m_jq = M_jq / max_k M_jk (the tie from j to q relative to j's strongest tie):

ES_i = Σ_{j ∈ N(i)} (1 − Σ_{q ∈ N(i), q ≠ j} p_iq m_jq).

**Caveats.** At most the number of contacts. Not defined for a member with no ties. For unweighted undirected data this equals Borgatti's (1997) simpler formula, n − 2t/n. NetworkX 3.6.1's `effective_size` has a defect when SciPy is installed: its matrix code divides by the strongest tie of q instead of j, and disagrees with its own per-node code and its documentation by up to 0.74 on the reference cases. Graticule follows the documented formula, and the reference values are computed with NetworkX's per-node code (section 7).

### Local clustering

**Meaning.** How many of a member's contacts are tied to one another, weighted by the strength of those ties.

**Formula.** Weights are first divided by the largest weight in the layer, ŵ = w / max(w), and a = ŵ^(1/3).

- Symmetrised view (Onnela et al., 2005): C_i = Σ_{j,k} a_ij a_jk a_ki / (k_i (k_i − 1)), with k_i the degree.
- Directed view (Fagiolo, 2007): C_i = [(A + Aᵀ)³]_ii / (2 (d_i^tot (d_i^tot − 1) − 2 d_i^↔)), with d^tot = in-degree + out-degree and d^↔ the number of reciprocated ties.

A member with fewer than two contacts, or no closed triangle, has clustering 0 and is flagged "fewer than two contacts" where that applies.

**Caveats.** Because weights are divided by the layer's single largest weight, one unusually strong tie anywhere changes every member's value. On 0–5 ratings the largest weight is usually 1, so this rarely matters.

## 4. Network metrics

### Density

**Meaning.** The share of possible ties that exist.

**Formula.** Directed: m / (n (n − 1)); symmetrised: 2m / (n (n − 1)), with m the number of ties.

**Caveats.** Ignores strength. Not comparable across networks of very different size: large networks are sparser because people have limited time.

### Average clustering

**Meaning.** How clustered the network is overall: the mean of the members' local clustering.

**Formula.** (1/n) Σ_i C_i, counting members with clustering 0.

**Caveats.** Members with fewer than two contacts pull the average down.

### Components

**Meaning.** Groups of members connected by some chain of ties, with no ties to other groups.

**Formula.** Directed view: weakly connected groups (ties read in either direction) and strongly connected groups (every member can reach every other along the direction of the ties). Symmetrised view: connected groups. Reported as counts and sizes, largest first.

**Caveats.** An isolated member is a group of one.

### Communities (Louvain) and modularity

**Meaning.** Groups of members more densely tied to each other than to the rest, found automatically.

**Formula.** The Louvain method (Blondel et al., 2008) searches for the partition with the highest modularity:

Q = (1 / 2m) Σ_ij [w_ij − γ s_i s_j / 2m] δ(c_i, c_j),

the modularity of Newman & Girvan (2004), with m the total tie weight, s_i the strength of i, and γ = 1 (the resolution). Communities are found on the symmetrised graph of the layer, combined by the chosen rule, in both views. The search visits members in a random order, so it is run ten times from one stream seeded with the project's random seed, and the partition with the highest modularity is kept; the same data and seed always give the same result. Each run uses classic local moving (every member is reconsidered on every sweep, as in NetworkX). Communities are numbered in order of their earliest member.

**Caveats.** Louvain is a heuristic: it finds a good partition, not necessarily the best, and a different node order or seed can give a different one of similar quality. Graticule uses graphology's implementation, whose partitions can differ from NetworkX's; on every reference case its modularity is equal to or higher than NetworkX's. With a single run, or with graphology's default fast local moving, it fell up to 0.015 short. Modularity around 0.3 or above is usually read as clear community structure; values near 0 mean none. The resolution γ = 1 is the same default as NetworkX; larger values find smaller communities.

### Centralisation

**Meaning.** How much the network is dominated by one member, compared with a star, the most centralised shape possible.

**Formula.** Freeman (1979): C = Σ_i (c_max − c_i) / (the same sum for a star of n members), computed for:

- degree (symmetrised): divided by (n − 1)(n − 2);
- in-degree and out-degree (directed): divided by (n − 1)²;
- binary betweenness (normalised): divided by (n − 1).

**Caveats.** Computed for binary degree and betweenness only, where the star-graph maximum is established. Not defined for fewer than three members. NetworkX has no centralisation function; the reference values are computed from NetworkX degree and betweenness.

### E-I index

**Meaning.** Whether ties stay within groups (such as teams) or cross between them.

**Formula.** EI = (E − I) / (E + I), with E the ties between members of different groups and I the ties within groups (Krackhardt & Stern, 1988). −1: all ties internal; +1: all ties external. A per-group value uses the ties with at least one end in that group.

**Caveats.** Counts ties, not strength. Larger groups have more internal opportunities, so their index is lower even when members mix freely; compare with cross-group density. Members with no value for the attribute are left out, and the number left out is reported.

### Cross-group density

**Meaning.** For every pair of groups, the share of possible ties between them that exist; on the diagonal, the density within each group.

**Formula.** D_AB = e_AB / (|A| |B|) for A ≠ B, where e_AB counts ties from A to B (directed) or between A and B (symmetrised); D_AA = e_AA / (|A| (|A| − 1)), halved in the denominator for the symmetrised view.

**Caveats.** A group of one has no internal density.

The Groups view (section 15) shows these figures as a matrix and a group map, and offers communities as a grouping.

## 5. Signed layers

### Positive and negative in-valence

**Meaning.** How positively, and separately how negatively, a member is rated by others.

**Formula.** V_i⁺ = Σ_j w⁺_ji and V_i⁻ = Σ_j w⁻_ji on the −1..1 scale, with the number of members giving each. Always computed from the directed ratings.

**Caveats.** The two are shown side by side and never combined into a single score, which would read as a verdict on the person. Negative ratings describe relationships, not individuals.

### Structural balance

**Meaning.** Whether trios of members are in a stable pattern. Balance theory (Heider, 1946; Cartwright & Harary, 1956) holds that "my friend's friend is my friend" (+++) and "my enemy's enemy is my friend" (+−−) are stable, while a trio with one negative pair (++−) or three (−−−) is under strain.

**Formula.** On the signed layer symmetrised by the chosen rule, every trio whose three pairs all carry a sign is counted: balanced if the product of the three signs is positive (+++, +−−), unbalanced otherwise (++−, −−−). The balance ratio is balanced / (balanced + unbalanced).

**Caveats.** Trios with a neutral (0) or unrated pair are not counted. The dyad sign depends on the symmetrisation rule when the two directions disagree.

## 6. Multiplexity, resilience, composite and stability

### Multiplexity

**Meaning.** Whether the same pairs are tied on several layers.

**Formula.** For each pair (ordered in the directed view, unordered in the symmetrised view), the number of layers on which a tie exists; signed layers count their positive and negative sub-layers separately. Between each two layers, the Jaccard overlap J = |E_a ∩ E_b| / |E_a ∪ E_b|.

**Caveats.** Categorical layers (primary channel) are not included.

### Formal–informal comparison

**Meaning.** Classifies every pair as formal only, informal only, both, or neither, using the formal and informal collaboration layers.

**Formula.** Formal tie: formal collaboration weight > 0; informal tie likewise. A pair with either rating missing is "not classified" and counted.

**Caveats.** "Formal only" means the collaboration is required but not reported as happening outside formal channels; it is a prompt for inquiry, not evidence of a problem.

### Resilience

**Meaning.** What happens to the network if selected members leave.

**Formula.** The selected members are removed with their ties, and on the remaining members:

- components: the count (weak and strong in the directed view) and the size of the largest;
- reachability: the share of ordered pairs (u, v) with a path from u to v;
- average path length: the mean shortest-path length over reachable pairs only, both as distance (1/w) and in steps.

Each is reported before, after and as the change.

**Caveats.** Averages over reachable pairs only, so average path length can fall when the network falls apart (distant pairs become unreachable and leave the average). Read it with reachability. NetworkX's `average_shortest_path_length` refuses a disconnected network instead.

### Composite

**Meaning.** One combined relationship score per pair, weighting the layers by importance.

**Formula.** For each directed pair (i, j):

C_ij = Σ_l ω_l r_l(v_ijl) / Σ_l ω_l over the summed layers rated for (i, j),

with ω_l = W_l / Σ_k W_k (the slider weights, normalised to sum to 1). Summed layers are unsigned layers (r = rescaled rating) and signed layers treated as "positive only" (r = w⁺). Each signed layer has one of three treatments:

- positive ratings, weighted: the layer is summed as above, so a positive rating adds to the composite and can create a tie on its own;
- filter out negative ties: C_ij = 0 wherever the signed rating is negative;
- multiplier: C_ij × (1 + 0.5 s_ij), with s on −1..1, so a neutral rating leaves the composite unchanged, the most positive raises it by half and the most negative halves it.

A signed layer whose treatment neither the analyst nor a preset has chosen is a multiplier, so it adjusts the ties the other layers create and never creates one itself: with "positive ratings", a member who rated a colleague positively on valence but reported no connection, collaboration or other tie with them still had a composite tie to them (in the demo, Finance members rate many colleagues outside Finance positively without working with them). The engine on its own, when called without a treatment, still uses "positive ratings"; the reference fixtures record the composite under each of the three treatments.

The result is capped at 1. If a pair is rated on some summed layers but not others, the weights are re-normalised over the layers that are rated; if it is rated on none, it is missing. A missing signed rating leaves the composite unchanged. A layer with weight 0 is left out entirely. The symmetrised composite combines the two directed composites by the chosen rule.

The engine returns the formula as a structure (terms, weights, filters, multipliers, cap) together with the notation shown to the user, and computes the composite from that same structure.

**Caveats.** The composite is only as meaningful as the weights: it is a statement of priorities, not a measurement. Re-normalising over rated layers means a pair rated on one layer only is scored on that layer alone.

### Presets

**Meaning.** Starting points for the weights, named for the question being asked. Each names raw slider values for the layers it uses; every other enabled layer gets weight 0 and is left out. The engine normalises the summed layers' weights to 1, so only their proportions matter, and a layer a preset names but the project has not enabled is simply absent.

One rule applies to every preset: the layer that defines it has twice the raw weight of each supporting layer.

| Preset | Raw weights | Signed layers |
|---|---|---|
| Formal structure | formal collaboration 0.4, workflow dependency 0.2 | none used |
| Informal network | informal collaboration 0.4, advice 0.2, idea sharing 0.2 | none used |
| Relationship health | connection strength, benevolence-based trust, interpersonal safety and energy 0.2 each | valence as a multiplier, energy as positive ratings |
| Custom | the analyst's own slider values; a layer never moved uses its default weight (1, or 0 for the conflict layers) | as chosen; a signed layer whose treatment was never chosen is a multiplier |

Why these layers. Formal structure uses the ties created by role or process: formal collaboration (defined in spec §4.2 as required by role, process or reporting line) and workflow dependency. Informal network uses discretionary ties: informal collaboration, advice (a core ONA relation: Cross & Parker, 2004, *The Hidden Power of Social Networks*) and idea sharing. Neither uses connection strength, so the two presets differ only in what defines them. Relationship health sums relational layers and lets valence, the overall affective quality of the relationship, scale the result, so a negative relationship lowers the composite (by up to half) instead of being scored like a neutral one. It leaves out competence-based trust, which concerns expertise rather than the relationship, and the conflict layers, which are frequencies that the composite could only add, so frequent conflict would raise the score.

With only the four core layers enabled, Formal structure is formal collaboration alone (1.00), Informal network is informal collaboration alone (1.00), and Relationship health is connection strength (1.00) scaled by valence. Custom with no slider moved gives connection strength, formal and informal collaboration a third each, scaled by valence.

**Caveats.** The presets are conventions chosen for this tool and approved by the owner, not published standards; the 2 : 1 ratio in particular is a convention. Moving a slider under a preset switches to Custom, starting from the preset's values.

### Shortest path

**Meaning.** The strongest route between two members: the chain of ties along which the total distance is smallest.

**Formula.** Dijkstra's (1959) algorithm with tie length 1/w in the current view (following tie direction in the directed view). The result gives the members along one shortest path, its distance (Σ 1/w), its number of steps, and how many different paths share that shortest distance. When several do, the one whose members, read back from the destination, come earliest in the member list is shown.

**Caveats.** A shortest path is one route among possibly several; the count of equally short paths says how many. Paths of equal length are detected by floating-point equality, as in NetworkX. Not computed on negative sub-layers.

### Subgroup density

**Meaning.** For a group of members chosen on the map (multi-select or lasso), how densely they are tied to each other compared with how densely they are tied to everyone else.

**Formula.** Binary ties (w > 0) of the layer the map draws, in the current view, among the members shown (after filters and the ego view). For a subgroup S of k members and the r other members shown:

- directed view: internal density = ties within S / (k (k − 1)); external density = ties from S to the rest and from the rest to S / (2 k r);
- symmetrised view: internal density = ties within S / (k (k − 1) / 2); external density = ties between S and the rest / (k r);
- E-I index = (E − I) / (E + I), with E the external and I the internal tie count.

**Caveats.** Counts ties, not their strength. A small subgroup has few possible internal ties, so one tie moves its internal density a great deal. Computed on the main thread from the weights the engine returned (`subgroupDensity` in `src/engine/metrics/subgroup.ts`), so it always uses the ties the map shows.

### Layer overlap (side-by-side comparison)

**Meaning.** How many ties two layers share.

**Formula.** For every pair (ordered in the directed view, unordered in the symmetrised view), whether it has a tie (w > 0) on the first layer, the second, or both; the share in common is the Jaccard overlap, both / (both + first only + second only), the same measure as in multiplexity above.

**Caveats.** A pair not rated on one of the layers counts as having no tie there. The formal–informal comparison, by contrast, sets such pairs aside as not classified.

### Data coverage

**Meaning.** The share of possible ratings that were given, per rater and overall.

**Formula.** coverage_i = (ratings given by i) / ((n − 1) × enabled layers − ratings i marked "does not apply"), over wave 1, including categorical layers; overall coverage is the same ratio over all raters. A rating of 0 counts as given; declined and not entered are counted separately. Below the threshold (default 80 %) a warning states that whole-network metrics may be unreliable.

**Caveats.** Computed from the project on the main thread, because the engine's NaN cannot tell "declined" from "not entered"; the analysis result carries the same figures.

### Stability of rankings (bootstrap)

**Meaning.** How much a member's rank on a metric depends on exactly who took part.

**Formula.** B times (default 200), drop a random ⌊p·n⌋ members (default p = 0.1, seeded), recompute the metric on the remaining network and rank the members (1 = highest; tied values share the average rank). Ranks are rescaled to 1..n so replicates of different sizes compare. Each member's rank is reported as the interval from the 2.5th to the 97.5th percentile of their ranks across the replicates in which they were kept.

**Caveats.** Shows sensitivity to missing members, not statistical confidence about a population. Wide intervals mean a ranking should not be read precisely. Runs in the background with progress and can be cancelled.

## 7. Reference values and differences from NetworkX

`scripts/generate_fixtures.py` computes reference values with NetworkX (Hagberg, Schult & Swart, 2008) and writes them to `tests/fixtures/`:

| File | Case |
|---|---|
| `karate-unweighted.json` | Zachary's karate club (Zachary, 1977), every tie rated 1 in both directions |
| `karate-weighted.json` | Zachary's karate club with Zachary's interaction counts (1–7) as ratings on a 0–7 scale |
| `karate-directed.json` | Karate club ties with four deterministic, asymmetric layers (strength, valence, informal and formal collaboration), including rated zeros and missing directions |
| `demo.json` | The demo project's four core layers and the composite; the file's SHA-256 is recorded and checked |

Each case is computed in five views: directed, and symmetrised by mean, minimum, maximum and "both report a tie". The fixtures record the NetworkX, SciPy, NumPy and Python versions (NetworkX 3.6.1, SciPy 1.17.1, NumPy 2.4.6, Python 3.11.17 at the time of writing). `tests/unit/engine.fixtures.test.ts` asserts that the engine matches them: within 10⁻⁹ absolute for every metric except eigenvector centrality (10⁻⁶, an iterative method), and exactly for counts.

Regenerate after changing the demo, the fixture script or a convention:

```
pip install -r scripts/requirements-fixtures.txt
npm run fixtures        # python3 scripts/generate_fixtures.py
```

CI uses the committed fixtures and does not need Python.

Conventions applied in the fixture script rather than taken from NetworkX:

| Metric | NetworkX | Graticule (and the fixture) |
|---|---|---|
| Rescaling, symmetrisation, composite | No equivalent | Computed in plain Python with the engine's operation order |
| Harmonic closeness | Undivided sum | Divided by (n − 1) |
| Eigenvector centrality | Computed on the whole graph, even when not strongly connected | Largest (strongly) connected group only; others not defined |
| Effective size | SciPy code path (used when SciPy is installed) divides by the wrong row maximum in 3.6.1 | Documented formula, via NetworkX's per-node code; a member with incoming ties only is not treated as isolated (NetworkX's per-node code checks outgoing ties only) |
| Degree (directed) | `degree_centrality` sums in and out | In and out reported separately, not normalised |
| Louvain | Different implementation and node order | Tested by the modularity of NetworkX's own partition (exact, 10⁻⁹) and by requiring Graticule's modularity to be no lower than NetworkX's (10⁻⁹), not by equal partitions |
| Negative sub-layers | — | Strength, degree and clustering only |
| Centralisation, E-I index, cross-group density, dyad reciprocity, signed in-valence and triads, multiplexity, resilience | No function (or it raises on disconnected graphs) | Plain Python from NetworkX components and shortest paths |

Shortest paths (distance and number of equal paths, via `dijkstra_path_length` and `all_shortest_paths`), betweenness (weighted and binary, directed and undirected, normalised), constraint, clustering, density, overall reciprocity, components and fixed-partition modularity need no adjustment: graphology and the custom code match NetworkX's own functions directly.

## 8. Insight rules

The insights panel (spec §9) lists rule-based observations. Each rule is a pure function in `src/engine/insights.ts`; its thresholds are the constants `INSIGHT_RULES` there, and the panel quotes them, so the rule shown is the rule that ran. Rules run on the analysis on screen (its view, symmetrisation rule and weights). Each observation is worded as a question for inquiry, never as a verdict on a person; `tests/unit/insightsCopy.test.ts` checks the wording against the banned list in `CLAUDE.md`. A rule that found nothing says so, and a rule that cannot run says why.

Quantiles use linear interpolation over the members whose value is defined (NumPy's default), as in the bootstrap.

Five rules group members: only routes between groups, concentrated demand (its groups), silos, both formal–informal rules and negative ratings not returned. They use one attribute, chosen in the insights panel ("Group members by") and saved with the project (`settings.insight_group`); team by default, and team again if the chosen attribute is removed. Any category or ordered category attribute can be chosen, for example a programme in a matrix organisation or the legacy organisation after a merger. The rule text names the attribute.

The silo and peripheral rules do not read layers in the conflict group (`INSIGHT_RULES.excludedLayerGroups`). Conflict is not a working tie: conflict between people who work together stays inside their group by nature, so on a conflict layer most groups look like silos, and receiving little conflict would count towards being peripheral.

| Rule | Reads | Observation when | Shows on the map |
|---|---|---|---|
| Potential brokers | Composite: weighted betweenness and constraint | Betweenness among the highest 10 % of members (at least one member; ties with the last included) and at least 0.05, and constraint at or below the median; at most 5 members | Ties from the composite, size by betweenness, the members highlighted |
| Peripheral members | Received strength (strength when symmetrised) on every unsigned layer outside the conflict group and the positive part of each signed layer | At or below the 20th percentile and at least 10 % below the median on more than half of those layers; a layer on which nobody receives a tie is not counted, and a member at a layer's highest value is never low. At most 5 members are listed, most low layers first, then furthest below the median (mean value as a share of the median); the wording gives how many were found | Ties from the composite, size by received strength, the listed members highlighted |
| Only routes between groups | The composite and each unsigned layer outside the conflict group, ties read without direction (section 16) | Applied to groups only when at least 2 groups have 3 members or more. A group of at least 3 members, with members outside it, whose ties with every other group are held by at most 2 of its members and at most half the group; the layer with the fewest such members is quoted, with the group's ties to each other group. Also every member who is a cut point cutting at least 3 members off from the largest part that remains; the layer on which it cuts off most is quoted | That layer, grouped by the attribute (or force-directed for a cut point), the members holding the ties (the cut point and the members it links) highlighted, bridge ties marked |
| Possible overload | Connections in (connections when symmetrised) on advice and workflow dependency | At or above the 90th percentile and at least twice the median, and above 0; at most 5 per layer | That layer, size by connections in |
| Concentrated demand | Ties received on advice and workflow dependency, from the directed ratings in either view (section 16) | The 10 % of members who receive the most ties (at least one) hold at least 25 % of at least 20 ties; or, within a group of at least 5 members receiving at least 10 ties, the group's own top 10 % hold at least 2.5 times their even share (top members ÷ group members) | That layer, size by connections in, the top members highlighted (grouped by the attribute for a group) |
| Silos | E-I index per group on the composite and each unsigned layer outside the conflict group | Applied only when at least 2 groups have 3 members or more. A group of at least 3 members, with members outside it, with E-I −0.50 or lower on a layer on which at least 5 ties involve the group (at least three internal ties per external one); the lowest is quoted | That layer, grouped by the attribute, the group highlighted |
| Negative clusters | Each signed layer's directed ratings | Pairs who rate each other negatively in both directions, joined through shared members into groups of at least 3 | The composite with valence colour on, the group highlighted |
| Negative ratings not returned | Each signed layer's directed ratings | At least 3 negative ratings whose reverse rating is not negative (neutral, positive or not given) on a layer; counted by pair of groups, the rater's group first, and how many reverse ratings were not given | The composite with that layer's colour on, negative ratings drawn whatever the tie strength, everyone who gave or received one highlighted |
| Formal ties with no informal counterpart | Formal–informal classes (multiplexity) | For a pair of groups, or one group: at least 50 % of formal ties are formal only, and at least 5 such ties | Formal collaboration, the two groups only, grouped, formal and informal line styles on; the 5 members in the most such ties highlighted |
| Informal ties with no formal counterpart | As above | The same, for informal only | Informal collaboration, as above |

**Silos and peripheral members together.** When at least half of a silo group's members are also peripheral members, the silo observation says how many, and the peripheral list leaves them out (saying how many more are named under silos), so one finding is not reported twice. On the demo all six peripheral members in the directed view are in Finance (six of its eight members), so Finance is reported once, as a silo.

**Why these limits (build plan session 3).** The rules were measured on the demo and the twelve scenario projects (`docs/scenarios.md`, `npm run scenarios:measure`) before and after each limit. Without the two-group condition, a department of 64 members with one team value was reported as a silo with no tie outside it, because E-I is −1 by construction when there is no outside. Without the conflict exclusion, every function of the merger scenarios was a "silo" on personal friction, from as few as 2 ties. Without the betweenness floor, members were named as potential brokers at betweenness 0.01 in teams where everyone works with everyone. Without the 10 % spread, members within 10 % of the highest received strength were listed as peripheral. Without the cap, the peripheral list reached 13 members. The figures are in the pull request of that session; `tests/unit/scenarioOutcomes.test.ts` checks the outcomes on every scenario.

**Only routes and concentrated demand (build plan session 7).** The thresholds were chosen by the owner from counts on the demo and the twelve scenarios (`npm run scenarios:bridges`), in the directed view and symmetrised by mean and by min. Only routes: on the composite alone, at most 3 members found Finance in the demo (3 of 8) and nothing else, and at most 2 found nothing; on the composite and the working layers, at most 2 (or 3) members found Finance (2 of 8 on connection strength) in every view and the post-merger Integration Office (1 of 6 on workflow dependency) in the directed and mean views. Without "at most half the group", every group of 3 in which all 3 hold ties with other groups would be named (5 groups in 4 scenarios). Cut points cutting off at least 1 member also named two members who cut off a single colleague, whom the peripheral rule already covers; at least 3 leaves the demo's OPE04 (8 members of Finance) and the post-merger's INT01 (23 members, workflow dependency). Concentrated demand: only the post-merger project has advice and workflow dependency ratings; the top 10 % hold 15 % and 22 % of their ties, and on every other working layer of the thirteen projects 10–24 %, so 25 % is above what these projects show without a hub. Within groups, the Integration Office's INT01 receives 50 % of the 46 ties its team receives (3 times the even share of 17 %). The rule keeps "Possible overload", which names members by connections in against the median, beside it: one describes the network, the other the members. `tests/unit/bridges.test.ts` checks both rules at their thresholds and their outcomes on every project.

**Caveats.** The thresholds are conventions chosen for this tool, not published standards; they are stated wherever a rule is shown so a reader can judge them. Every rule inherits the caveats of the metric it reads (sections 3 to 6): betweenness assumes shortest-path flow, the E-I index counts ties and favours larger groups, received strength depends on who answered. A negative rating not returned negatively may reflect a real difference in experience, a rater who rates everyone low or high, or a colleague who did not answer; the signed rule counts ratings, not people. The rules describe positions in the network, which have many causes (role, tenure, location, workload, the survey itself); an observation is a reason to ask, not an answer. Below the coverage threshold the panel repeats the coverage warning.

**Demo.** On the demo the rules find the structures it was built with (scripts/generate-demo.ts): the Operations broker, Finance as a silo (naming its peripheral members), the pocket of reciprocated negative valence, formal-only ties between Product and Sales and informal-only ties between People and Product. Possible overload does not apply, because the demo has no advice or workflow dependency ratings, and only one negative rating is not returned, below the 3 the rule needs. `tests/unit/insights.test.ts` checks each threshold at its boundary and the demo findings; `tests/unit/scenarioOutcomes.test.ts` checks the outcomes on the twelve scenario projects.

## 9. Survey collection (respondent mode)

Graticule can run the survey itself (spec §15). Each participant opens a personal link, answers in the browser and returns an encrypted response, which the analyst imports. This section states what that arrangement protects and what it does not, and the conventions behind the completion-time estimate.

### What the encryption protects

- **Reading a response.** Each response is encrypted on the respondent's device to the survey's public key: a fresh ECDH P-256 key pair per response, HKDF-SHA-256 and AES-256-GCM (`src/survey/crypto.ts`). Only the survey's private key can decrypt it. That key is stored in the project file only in encrypted form, under a key derived from the analyst's passphrase (PBKDF2-HMAC-SHA-256, 600,000 iterations). Whoever carries or stores a response file (email providers, file-sharing services, the respondent's own mailbox) cannot read it.
- **Altering a response.** AES-GCM authenticates the whole response, and the unencrypted header (survey, version, key fingerprint) is bound to it. Any change makes the import reject the file as changed or damaged.
- **Mixing up surveys.** A response encrypted for another survey or key, or answering a version the survey does not have, is rejected with its reason.
- **Duplicates.** Every respondent has a random 128-bit token inside the encrypted response. Two responses with one token are duplicates: the one submitted latest (by the respondent's device clock) is kept and the event is logged. The same file imported twice changes nothing.

### What it does not protect

- **Who answered.** There is no server, so nothing proves identity. A respondent who forwards their link lets someone else answer as them. The token detects duplicates; it does not show who used it. The name check at the start of the survey ("This link was made for …") is a prompt, not authentication.
- **The link itself.** The survey travels in the link's fragment, which browsers do not send to the web server, but email and chat security services can rewrite, scan and log whole links (CLAUDE.md, "Research"). Anyone who can see a link can therefore read the roster and questions and answer as its recipient. Links hold nothing the organisation does not already hold, apart from the token.
- **Answers before submission.** While a respondent works, their answers are saved in the browser on their device, unencrypted, so they can resume. Anyone using that device and browser can see them until they are submitted or cleared. They are cleared automatically once the encrypted response has been copied or downloaded, and on request.
- **The analyst's side.** Once decrypted and imported, ratings are ordinary project data: the project file, exports and the analyst's device need the same care as any personal data. A lost key and passphrase cannot be recovered; the responses encrypted to it are then unreadable by anyone.
- **Timing.** The submission time comes from the respondent's device and can be wrong; it decides only which of two duplicates is kept.

Responses are confidential and carry the respondent's name: the analyst sees who gave which ratings, because a whole-network design needs it (section 1, spec §3). The respondent screens say so and never describe the survey as anonymous.

### Colleagues not selected

With "select colleagues, then rate them", a colleague the respondent did not select is recorded as the lowest point of each unsigned layer (0: "Never" or "No meaningful working connection"), and as "does not apply" on signed and categorical layers, because 0 on a signed layer means neutral, a quality nobody reported (CLAUDE.md D88, D102). The analyst can change this per layer, and respondents are told what is recorded before they select anyone. Because "does not apply" is left out of coverage, a complete response counts as complete.

The analyst can also name colleagues every respondent is asked about, whether or not they select them (D103), and every question must be answered for every colleague a respondent is asked about (D104). Where a question may have no answer for a colleague, the survey offers "Does not apply" beside the scale (by default on signed layers), so a respondent never has to choose between a false "neutral" and leaving the question blank. The respondent's own "does not apply" is recorded exactly as the one for colleagues not selected.

### Completion-time estimate

Estimated time = 60 s to read the introduction and agree + 5 s per rating + (with selection) 2 s per colleague considered, where ratings = colleagues × questions for a full roster, or, with selection, the larger of the expected number of selections (default 12) and the number of required colleagues, at most the number of colleagues, × questions. The result is rounded up to whole minutes, and is at least 1 minute. These are conventions, not measurements; the owner approved them as proposed (CLAUDE.md Q31). The warning limit defaults to 15 minutes; above it, the setup warns and suggests fewer layers or selection first.

### Survey rules and limits

| Rule | Value |
|---|---|
| Link length | A survey link is issued only if it is at most 2,000 characters long. Longer surveys, or every survey when the analyst chooses "Always use a survey file with short links", use a shared survey file (`.graticule-survey`) and a short personal link (about 110 characters) that carries the file's fingerprint; a file that does not match the fingerprint is refused |
| Passphrase | At least 12 characters, no composition rules; it protects the private key with PBKDF2-HMAC-SHA-256 at 600,000 iterations and a random salt |
| Key backup | The survey cannot be created until the analyst has downloaded the key backup and opened it again with the passphrase |
| Texts | A survey cannot be issued without a title, an introduction, a confidentiality statement and return instructions |
| Tokens | 128 random bits per respondent; survey ids 64 bits |
| Receipt code | The first 40 bits of the SHA-256 of the encrypted response, as eight characters (`XXXX-XXXX`) |
| Import order | Unreadable, already imported (same receipt: changes nothing), survey closed, another survey, another key, failed decryption (changed or damaged), unknown version, unknown token, token that does not match the roster position; each rejected file is logged with its reason |
| Duplicates | Two responses with one token: the later submission time is kept, and its ties replace the earlier response's self-reported ties as a whole |
| Conflicts | A response never overwrites a rating from another source (an imported file or matrix entry); the conflict is reported in the validation report |
| Versions | Changing the roster, the questions, their wording or scales, the entry method or the shared attributes after links are issued creates a new version. Earlier links answer their own version; their responses are mapped to the current roster and layers by member id and layer key, and dropped layers, dropped colleagues and colleagues not asked are listed, never guessed |
| Burden warning | Shown when the estimate exceeds the limit (default 15 minutes) |
| Blank answers | Respondents must answer every question for every colleague they are asked about; a blank answer from another source is imported as declined (not rated) |

## 10. Relationship layers

A layer is one relationship variable: every member rates every other member on it. Each layer has a key (used in ties files), a label, question wording, a scale, whether it is signed, a default weight and whether it is enabled. The question wording and labels can be edited in the Layers section; the key and scale cannot. Core layers are enabled by default and can be turned off but not deleted; optional layers are disabled by default.

Scale labels: frequency scales run 0 "Never", 1 "Less than monthly", 2 "Monthly", 3 "Weekly", 4 "Several times a week", 5 "Daily"; agreement scales run from 0 "Not at all" to 5 "Completely"; signed scales run from −3 to +3 with 0 "Neutral". Every rated layer has default weight 1, except the two conflict sub-layers, whose default weight is 0: friction is not a working tie, and as frequencies the composite could only add them, so more conflict would make a stronger composite tie (CLAUDE.md D143). An analyst who wants them in the composite raises their weight; a project saved by version 1.0.0 opens with them at 0, and a saved view that weighted them keeps its weight.

**Core layers**

| Layer (key) | Scale | Question wording | Meaning |
|---|---|---|---|
| Connection strength (`connection_strength`) | 0–5, from "No meaningful working connection" to "Very strong" | How strong is your working connection with this person? | 0 = no meaningful working connection, 5 = very strong |
| Valence (`valence`) | −3 to +3, signed, "Very negative" to "Very positive" | Overall, how positive or negative is your working relationship with this person? | Overall affective quality of the relationship; 0 = neutral |
| Informal collaboration (`informal_collaboration`) | 0–5 frequency, never → daily | How often do you collaborate with this person outside formal roles, processes or reporting lines? | Collaboration outside formal roles, processes or reporting lines |
| Formal collaboration (`formal_collaboration`) | 0–5 frequency, never → daily | How often does your role, a process or a reporting line require you to collaborate with this person? | Collaboration required by role, process or reporting line |

**Optional layers.** The question wording is the suggested wording from the specification; the analyst can edit it.

| Layer (key) | Scale | Question wording | Notes |
|---|---|---|---|
| Advice and information seeking (`advice`) | 0–5 frequency | Who do you go to for work-related information or advice? | Directed. A core ONA relation (Cross & Parker, 2004, *The Hidden Power of Social Networks*) |
| Competence-based trust (`competence_trust`) | 0–5 agreement | I rely on this person's expertise and judgement. | Kept separate from benevolence-based trust. Conceptually drawn from Mayer, Davis & Schoorman (1995) |
| Benevolence-based trust (`benevolence_trust`) | 0–5 agreement | This person would look out for my interests. | As above |
| Energy (`energy`) | −3 to +3, signed, "Very draining" to "Very energising" | Interactions with this person typically leave me energised / drained. | Signed. Cross & Parker (2004) |
| Decision influence (`decision_influence`) | 0–5 agreement | This person's input materially affects my decisions. | Directed |
| Workflow dependency (`workflow_dependency`) | 0–5 agreement | I cannot complete my work without this person's output. | Directed |
| Knowledge awareness (`knowledge_awareness`) | 0–5 agreement | I understand what this person knows and can do. | |
| Idea sharing (`idea_sharing`) | 0–5 agreement | I would take a new or untested idea to this person. | |
| Interpersonal safety (`interpersonal_safety`) | 0–5 agreement | I can raise a concern or admit a mistake with this person without fear of negative consequences. | An adaptation: a one-to-one (dyadic) adaptation of psychological safety, which Edmondson (1999) defined at team level. Graticule asks it about each colleague, which is not how the construct was defined, and results should be read as such |
| Conflict: task disagreement (`conflict_task`) | 0–5 frequency | How often do you experience task disagreement with this person? | One of two conflict sub-layers. Distinct from valence |
| Conflict: personal friction (`conflict_personal`) | 0–5 frequency | How often do you experience personal friction with this person? | As above |
| Primary channel (`primary_channel`) | Categories: in person, video, chat, email | Which channel do you mainly use with this person? | Categorical, not weighted |

All ties are directed, whatever the layer; the "Directed" notes above repeat the specification's emphasis for relations whose direction matters most in reading them.

The scales the specification leaves open are conventions of this tool (CLAUDE.md D26): the statement layers use a 0–5 agreement scale, advice and both conflict sub-layers a 0–5 frequency scale, and energy the −3 to +3 scale of valence.

**How layers enter the analysis.**

- Signed layers (valence, energy) are split into positive and negative sub-layers (section 1.2) and never passed to path-based metrics with negative weights (section 1.4).
- The conflict sub-layers are frequencies, not signed: they are analysed like other unsigned layers. Their default weight is 0 and the composite presets leave them out (section 6, "Presets"); the silo and peripheral insight rules do not read them (section 8).
- Primary channel is categorical: it is stored, entered and counted in coverage, but not analysed as a network, weighted, or included in multiplexity.
- Layers that are turned off keep their ratings and are left out of every metric, the composite and coverage until turned on again.

## 11. Rules for data, display and exports

### Import and validation

Members and ties are imported from CSV or XLSX files in the template layout (`public/templates/`). Nothing is coerced silently: every problem is listed with its spreadsheet row number (the header is row 1), and the analyst can import the valid rows and skip the rest, with the number skipped stated.

| Rule | Detail |
|---|---|
| Headers | Matched without regard to case; spaces and hyphens read as underscores. Members need `id` and `display_name`; ties need `rater_id`, `ratee_id`, `variable` and `value`, with optional `wave`. Any other members column becomes a member attribute |
| Unknown ids | A rater or ratee id that is not a member is an error |
| Self-ratings | A member rating themselves is an error; self-pairs are never recorded |
| Numbers | Plain decimals only: an optional sign, digits and an optional fraction. Exponents, decimal commas, the Unicode minus sign and words are non-numeric. Cells are trimmed. Decimals inside the range are accepted |
| Range | A value outside the layer's minimum and maximum is an error |
| Unknown variables | A `variable` that is not a layer key is an error; a close match is suggested |
| Duplicates | Every row sharing a rater, ratee, variable and wave with another row is skipped (no "first wins"). A row repeating a rating already in the project is a duplicate, never an overwrite |
| Empty value | Stored as not rated (`null`), never as 0, and noted |
| `n/a` | Stored as "does not apply" (section 1.1) |
| Categories | Matched by key on import (`in_person`, `video`, `chat`, `email`) |
| Manager ids | `manager_id` must name another imported member; a member cannot be their own manager |
| Waves | Empty means wave 1; otherwise a whole number from 1. Ratings for later waves are stored, and the analysis uses wave 1 only |
| Disabled layers | Ratings for a layer that is turned off are imported and noted |
| XLSX | The first sheet is read and other sheets are named in a note; stored values are read rather than display formats (a cell shown as 50 % is 0.5); a file that is not an XLSX package is refused |
| Members file | Importing a members file starts a new project; a ties file alone is added to the open project |

Matrix entry follows the same rules: a value is a number in the layer's range, `n/a`, or (for categorical layers) a category's key, label or one-letter code; clearing a cell removes the rating; self-pairs cannot be edited. A block pasted from a spreadsheet is written from the active cell; blank cells clear, and self-pairs, invalid values and cells outside the grid are skipped and reported. A rating edited in the matrix is recorded as entered in the matrix.

Survey responses (section 9) are turned into rows and pass through the same validation.

### Data coverage threshold

Coverage (section 6) is compared with a threshold, 80 % by default, which the analyst can set as a whole percentage from 0 to 100 under Check the data; it is saved with the project. Below it, a persistent warning under the top bar and on the map states that whole-network metrics may be unreliable, the insights panel repeats it, and the PDF report states it with the raters below the threshold. Until the project has at least one rating, a neutral "No ratings yet" note is shown instead of the warning. Coverage is shown as a whole percentage, except where rounding would reach or cross the threshold: then it keeps one decimal place, rounded away from the threshold, so 79.6 % against 80 % reads 79.6 %, and 79.98 % reads 79.9 %. Coverage counts wave 1 on enabled layers.

### Map display rules

These rules change what the map draws, never a metric.

| Rule | Detail |
|---|---|
| Ties from | The layer (or the composite) that sets which pairs are drawn, edge width, layout attraction, node size, communities and ranks; the composite by default |
| Tie strength range | "Tie strength from" and "to" (each 0 to 1 in steps of 0.05, default 0.30 to 1.00) draw a tie when its weight is above 0 and within the range, both bounds included, compared with a tolerance of 10⁻⁹ because composite weights are sums of fractions. From never exceeds to. In the directed view each direction is tested on its own, and a pair is one line only when both directions are within the range (CLAUDE.md D131); otherwise it is a one-way tie. The legend states which ties are hidden ("Ties below …", "Ties above …" or "Ties outside …–…") and that every metric uses all ties. Metrics always use every tie. The default lower bound was chosen by measurement (CLAUDE.md D129): on the demo it draws 241 of the 423 tied pairs, keeps every member connected and keeps half of the negatively rated ties, which 0.5 would all hide. An insight shown on the map sets the range to 0 to 1, because the rule counted every tie; a saved view keeps its own (CLAUDE.md D141) |
| Negative ratings outside the range | "Draw negative ratings outside the range" (offered when a signed layer is enabled, off by default) also draws a tie that has a negative rating on any enabled signed layer, whatever its strength on the Ties from layer, as long as that layer rates the pair (0 included): in the directed view the rating in that direction, in the mutual view a negative rating in either direction. Under valence as a multiplier a negatively rated tie is weakened, often below 0.30, so without the switch it is hidden. The legend says so. Display only; saved with views; switched on by the negative-ratings-not-returned insight (CLAUDE.md D145) |
| Node size | By value (default): area linear between the smallest and largest defined value of the chosen metric, from 4 to 16 px radius. By rank: area linear in the rank instead, rank 1 (the highest value) largest, tied values at their average rank. Either way, a member whose value is not defined is drawn at 2 px and listed as "Not defined" |
| Node fill | An attribute's values in category order, at most 8 colours; further values share "Other (n groups)" and missing values "Not recorded", both grey with a dashed outline. Or the Louvain community on the chosen layer |
| Edge width | Linear in weight, from 1 px to 3 px at weight 1, on the Ties from layer (default) or another layer or the composite; Ties from still decides which pairs are drawn. A drawn tie with no rating on the width layer is drawn at 1 px in grey (stone) with its own legend entry, so it is never read as 0. Or the same width (2 px) for every tie |
| Edge colour | By default valence in the current view (the directed rating, or the two directions combined by the chosen rule), negative ratings only: the three negative steps of the 7-step diverging scale, interpolated between steps, with neutral and positive ties in grey (stone). "Show the full scale" colours every step. Any other enabled signed layer can be chosen instead. A pair with no rating on the colour layer is drawn in dark grey (graphite) with its own legend entry, so it is never shown as neutral. Other choices: an unsigned layer or the composite, in five steps of weight (up to 0.2, …, above 0.8) on a ramp from val-p3 mixed into paper at 60 % to val-p3 itself, with a pair rated 0 in stone; "within or between groups", where a tie between two members of the same group of the node-fill attribute (or the same community) is stone and a tie between groups graphite, members without a value forming a group of their own; or none, every tie in stone. A colour layer that is not enabled, or that an export leaves out, draws no colour and the legend says so |
| Edge style | Off by default; when chosen, and both formal and informal collaboration are enabled: formal only solid, informal only dashed, both solid with a parallel dashed line, neither dotted. Where one of the two is not rated, a known positive rating decides the style; otherwise it is dotted ("Neither, or not rated") |
| Community outlines | Optional, while node fill shows an attribute: a 1 px stone outline round each Louvain community on the Ties from layer, the convex hull of circles round its visible members, drawn under the ties |
| Direction | Directed view only. A tie shown in one direction has an arrowhead pointing from rater to rated member. A pair shown in both directions is one line without arrowheads; its width, colour and style use the two directions combined by the chosen rule (average, weaker or stronger), as in the mutual view. The member panel still gives each direction |
| Layer switches | "Keep its ties" (default) draws every layer's ties; "Hide its ties" offers a switch per layer and hides every pair with a tie on a switched-off layer (a signed layer counts ties of either sign). The encodings have choices of their own |
| Filters | Values of one attribute combine with OR, different attributes with AND; filtered members and their ties are hidden without moving anyone |
| Labels | Every member is named when 60 or fewer are visible; otherwise only highlighted members; labels never overlap |
| Ego view | The member and everyone within 1 or 2 steps along the ties shown, in either direction, after threshold and filters; applies to every view |
| Resilience | Removed members are hidden on the map only |

**Layouts.** Force-directed (d3-force): each tie pulls its two members together with strength w / (the smaller of the two members' tie counts), with repulsion between all members; the layout is settled for 300 steps before it is drawn, so nothing moves on load. Grouped: one centre per value of the chosen attribute on a grid of square cells, with weaker attraction along ties inside a group. Each member keeps a box clear for itself and its name below it (the name's width estimated at 6.5 units per character, a unit being a screen pixel at zoom 1); the cell is large enough for the group whose boxes take most area to fill a quarter of it, and the boxes of smaller groups grow until they fill the same share, so groups spread over their cells and names inside a group do not overlap. Circular: members on a circle, one arc per group, with a gap between groups. Formal hierarchy: managers above their reports, from the formal manager attribute; cycles in reporting lines are broken; offered only when at least one member's manager is another member; informal collaboration ties are drawn over it while node size, fill and ranks still follow "Ties from". A change of layout, layer or weights moves members over 600 ms, and not at all when the system asks for reduced motion. Pinned members stay where they were dragged.

Two thresholds only choose where the work is done and do not change what is drawn: maps with 3,000 or more ties are drawn in a background worker, and force or grouped layouts with 1,500 or more attractions are settled in one after the first layout.

### Saved views and presentation

A saved view captures the weights (preset, weights and signed treatments), the map settings (direction, rule, ties from, node size and its scale, fill, community outlines, edge colour with its scale, edge width, edge style, threshold, layer switches, filters, layout, grouping, ego view and highlight), every member's position and pin, and the selection (member and subgroup). It does not save the search text, the pointer tool or the zoom: a restored view is fitted to the screen. Restoring ends the explore tools (path, simulation, resampling). Presentation mode steps through the saved views in order, with each caption.

### Anonymisation

"Hide names" replaces every member's name, in every view and every analysis export, with a code: the first three letters of the team (or its initials or other letters, unique per team), the level, and a two-digit number within that team and level in project order, for example FIN-L3-02. A missing team or level is written X. Codes of a team and level with fewer than 3 members may still identify someone; turning names off says how many such codes there are. In free text (view names, captions, the project title in exports) members' full names are replaced as whole words, ignoring case and spacing; a first name or surname on its own is not replaced, and a full name shared by two members becomes "[name]". Member ids are left out of the member CSV while names are hidden, because ids can be names or email addresses. Survey administration files (links for mail merge, non-responders, key backups) identify people by design and are not anonymised.

### Signed-layer exclusion

"Leave out valence, energy and conflict" removes every signed layer and both conflict sub-layers, with all their ratings, from the project before any analysis export is made, and runs the analysis again. Every exported figure is therefore calculated as if those layers had never been collected: the composite (a Relationship health composite loses its valence multiplier), communities, insights, coverage and all metrics. The report leaves out the negative-clusters and negative-ratings-not-returned rules and the method-note sentences about those layers. The setting is saved with the project and applies to every analysis export; the analysis on screen is unchanged.

### Random seed

Louvain and the bootstrap draw from one seeded generator (mulberry32) with the project's random seed (default 1), so the same data, settings and seed always give the same communities and rank ranges.

## 12. References

References follow APA style (7th edition) and were checked against the publishers' records or a library index on 2026-09-29. The specification (`spec.md` section 3 and the table in section 4.2) cites Hevey, Cross & Parker, Mayer, Davis & Schoorman, and Edmondson in short form; they are given in full here. The others are the original sources of the methods these notes describe.

- Blondel, V. D., Guillaume, J.-L., Lambiotte, R., & Lefebvre, E. (2008). Fast unfolding of communities in large networks. *Journal of Statistical Mechanics: Theory and Experiment*, *2008*(10), P10008. https://doi.org/10.1088/1742-5468/2008/10/P10008
- Bonacich, P. (1972). Factoring and weighting approaches to status scores and clique identification. *Journal of Mathematical Sociology*, *2*(1), 113–120. https://doi.org/10.1080/0022250X.1972.9989806
- Borgatti, S. P. (1997). Structural holes: Unpacking Burt's redundancy measures. *Connections*, *20*(1), 35–38.
- Brandes, U. (2001). A faster algorithm for betweenness centrality. *Journal of Mathematical Sociology*, *25*(2), 163–177. https://doi.org/10.1080/0022250X.2001.9990249
- Burt, R. S. (1992). *Structural holes: The social structure of competition*. Harvard University Press.
- Cartwright, D., & Harary, F. (1956). Structural balance: A generalization of Heider's theory. *Psychological Review*, *63*(5), 277–293. https://doi.org/10.1037/h0046049
- Cross, R., & Parker, A. (2004). *The hidden power of social networks: Understanding how work really gets done in organizations*. Harvard Business School Press.
- Dijkstra, E. W. (1959). A note on two problems in connexion with graphs. *Numerische Mathematik*, *1*, 269–271. https://doi.org/10.1007/BF01386390
- Edmondson, A. (1999). Psychological safety and learning behavior in work teams. *Administrative Science Quarterly*, *44*(2), 350–383. https://doi.org/10.2307/2666999
- Fagiolo, G. (2007). Clustering in complex directed networks. *Physical Review E*, *76*(2), 026107. https://doi.org/10.1103/PhysRevE.76.026107
- Freeman, L. C. (1977). A set of measures of centrality based on betweenness. *Sociometry*, *40*(1), 35–41. https://doi.org/10.2307/3033543
- Freeman, L. C. (1979). Centrality in social networks: Conceptual clarification. *Social Networks*, *1*(3), 215–239. https://doi.org/10.1016/0378-8733(78)90021-7
- Granovetter, M. S. (1973). The strength of weak ties. *American Journal of Sociology*, *78*(6), 1360–1380. https://www.jstor.org/stable/2776392
- Granovetter, M. (1983). The strength of weak ties: A network theory revisited. *Sociological Theory*, *1*, 201–233. https://doi.org/10.2307/202051
- Hagberg, A. A., Schult, D. A., & Swart, P. J. (2008). Exploring network structure, dynamics, and function using NetworkX. In G. Varoquaux, T. Vaught, & J. Millman (Eds.), *Proceedings of the 7th Python in Science Conference (SciPy2008)* (pp. 11–15).
- Heider, F. (1946). Attitudes and cognitive organization. *The Journal of Psychology*, *21*(1), 107–112. https://doi.org/10.1080/00223980.1946.9917275
- Hevey, D. (2018). Network analysis: A brief overview and tutorial. *Health Psychology and Behavioral Medicine*, *6*(1), 301–328. https://doi.org/10.1080/21642850.2018.1521283
- Hopcroft, J., & Tarjan, R. (1973). Algorithm 447: Efficient algorithms for graph manipulation. *Communications of the ACM*, *16*(6), 372–378.
- Krackhardt, D., & Stern, R. N. (1988). Informal networks and organizational crises: An experimental simulation. *Social Psychology Quarterly*, *51*(2), 123–140. https://doi.org/10.2307/2786835
- Marchiori, M., & Latora, V. (2000). Harmony in the small-world. *Physica A: Statistical Mechanics and Its Applications*, *285*(3–4), 539–546. https://doi.org/10.1016/S0378-4371(00)00311-3
- Mayer, R. C., Davis, J. H., & Schoorman, F. D. (1995). An integrative model of organizational trust. *Academy of Management Review*, *20*(3), 709–734. https://doi.org/10.5465/amr.1995.9508080335
- Newman, M. E. J., & Girvan, M. (2004). Finding and evaluating community structure in networks. *Physical Review E*, *69*(2), 026113. https://doi.org/10.1103/PhysRevE.69.026113
- Onnela, J.-P., Saramäki, J., Kertész, J., & Kaski, K. (2005). Intensity and coherence of motifs in weighted complex networks. *Physical Review E*, *71*(6), 065103. https://doi.org/10.1103/PhysRevE.71.065103
- Zachary, W. W. (1977). An information flow model for conflict and fission in small groups. *Journal of Anthropological Research*, *33*(4), 452–473. https://doi.org/10.1086/jar.33.4.3629752

**Where each is used.** Hevey (2018): general concepts only (see "Design" at the top). Cross & Parker (2004): advice seeking as a core ONA relation, and the energy layer. Mayer, Davis & Schoorman (1995): competence-based trust, kept separate from benevolence-based trust. Edmondson (1999): psychological safety, defined at team level; the interpersonal safety layer is a one-to-one (dyadic) adaptation of it. The method sources are cited where each method is described (sections 3 to 7 and 16). Library software used by the tool itself (graphology and the other dependencies) is credited, with its licence, in `README.md` and `public/THIRD-PARTY-NOTICES.txt`.

## 13. Data-quality checks

The "Check the data" tab (build plan session 4) shows whether the ratings can bear a conclusion, before the insights are read. Like coverage (section 6), the checks read the raw ratings of wave 1 on the enabled layers, on the main thread (`src/data/quality.ts`). They describe how the data was given, not anyone's relationships or conduct. Thresholds are in `QUALITY_RULES`; they were chosen by the owner from counts on the demo and the twelve scenario projects (CLAUDE.md D146).

**Meaning.** Organisational network data rarely misses at random: a senior group that does not answer, a night shift, or a respondent who gives everyone the same answer changes the results in ways one coverage figure does not show (Q37 issues 4 and 6; consultant review §7).

### Who gave no ratings, and who gave few

A member **gave no ratings** when they gave none of the ratings possible for them (coverage 0, with at least one rating possible). A member **gave few ratings** when they gave at least one but fewer than half of the ratings possible (coverage below 0.5).

Wherever a value depends on the member's own ratings, it carries the flag: in the member panel (marked * with the reason in the metric's explanation), the metrics table (the member's row is labelled and the values marked *) and the member metrics CSV (in the column "Not defined because, or note"). In the directed view the incoming metrics (received strength, connections in, reach from others) read only other members' ratings and are not flagged; every other metric is. In the mutual view every metric is flagged, because each tie combines both directions and a missing direction is filled from the one given (section 2). On the map a member who gave no ratings is drawn hollow: a ring of their fill colour with an ink outline round a paper centre, half the radius, with the legend entry "Gave no ratings (hollow)".

### Coverage by group and by level

Coverage (section 6) is also reported for the members of each group of the attribute the insight rules group by (team by default) and of each level, with how many of them gave ratings. The data-quality statement quotes the group with the lowest coverage, among groups of at least 3 members of any category attribute with two or more such groups, when that coverage is below the threshold.

### How each person rates

For each member who gave ratings, over every enabled scaled layer, each rating rescaled to 0–1 on its layer's scale, r = (v − min) / (max − min), signed layers included (so neutral on valence is 0.5):

| Measure | Definition |
|---|---|
| Mean | Mean of the rescaled ratings |
| Spread | Standard deviation of the rescaled ratings on each layer, averaged over the layers rated |
| Scale used | Distinct values given on each layer as a share of the layer's scale points (max − min + 1), averaged over the layers rated |
| Colleagues tied | Share of the other members (n − 1) given a rating above the scale minimum on at least one tie layer: an enabled layer that is neither signed nor in the conflict group |

A rater is marked:

- **Same answer for everyone** when, on every enabled scaled layer on which they gave at least 5 ratings, every rating has the same value (and there is at least one such layer).
- **Rates higher (lower) than most** when their mean is at least 0.15 above (below) the median of the means of everyone who gave ratings.
- **Reports many more ties than most** when their share of colleagues tied is at least 0.25 above the median share, unless the median is 1.
- The statement adds that **most people report a tie with nearly every colleague** when the median share is at least 0.9.

**Caveats.** A member with genuinely stronger ties (a supervisor, a coordinator, an integration lead) also rates higher than most and reports more ties, so these marks say where a rating habit may be at work, not that one is. On the scenarios, the 0.15 margin finds every generous and harsh rater built in, and also flags supervisors in the large department, the coordinators of the matrix organisation and the integration lead after the merger. Comparing each rating with the reverse rating was measured instead and rejected, because it marks the seniority asymmetry built into the asymmetric scenarios. A same-answer respondent may have meant every answer; the check says only that their ratings do not tell colleagues apart. The checks themselves change no metric; the remedies the analyst can apply are in section 14.

### Ties reported by one side only

A tie i → j is reported when i rates j above the scale minimum on a tie layer. It is **reported back** when j also reports a tie to i. It is counted only when j answered about i on at least one tie layer, so a tie to a member who gave no ratings is neither one-way nor reported back. The share of reported ties that are not reported back is given overall and for each group and level, by the group of the member who reported it.

### The data-quality statement

A few sentences written from these results (`src/ui/copy/quality.ts`), naming no member: coverage against the threshold; how many gave no ratings (and where, by the grouping attribute, or by another attribute when the grouping attribute has one group) and how many gave few; that their results rest largely on other people's reports; the lowest group coverage when below the threshold; how many gave everyone the same answer; how many rate higher or lower than most; dense reporting; how many report many more ties than most; and the share of ties not reported back. It is shown in the Check the data tab, at the start of a presentation (an "About the data" step before the first view), in the Export dialog and on the PDF report's cover. Exports compute it from the project they show, so under "Leave out valence, energy and conflict" coverage and rating styles are counted over the remaining layers.

### What the members named share

An observation that names at least 2 members also states the attribute values more than half of them share, when the value is also more common among them than among all members, at most two, most shared first, leaving out the attribute the observation is about (the silo group or the pair of groups). For example: "Three of the five share tenure band Under 1 year." or "All five share location Remote." Members named who gave no ratings are marked "gave no ratings", and the observation says that only colleagues' reports of their ties are counted.

## 14. Data remedies

Four analysis options counter what the data-quality checks (section 13) show (build plan session 5; CLAUDE.md D150–D153). Each is off by default, applies to the whole analysis (map, tables, insights and exports), is saved with views, and is stated wherever results leave the app: in the map legend, on the report cover and in the network metrics CSV ("Analysis option"). "Check the data" previews each one: it runs the analysis on screen again with that option switched, on a worker of its own, and lists the insight observations it would change, so the analyst can judge an option by its effect before applying it. The engine code is `src/engine/remedies.ts`.

**Measured on the demo and the twelve scenario projects** (`npm run scenarios:remedies`, under the app's default weights). Where everyone answered (the asymmetric, compressed, matrix, dense and polite projects), the options about non-response change nothing. "Both report a tie" against the minimum rule changes nothing in those projects either, and changes most where members gave no ratings: partial response 95 → 55 composite ties and 3 → 6 communities, silent leaders 161 → 79, messy survey 271 → 180. Leaving out non-respondents removes the potential brokers FIE01 (partial response) and PAR04 (silent leaders) in the mutual view, and the silent night-shift members from the peripheral list of the shift scenario. Reconstruction adds 35 to 82 directed ties in the projects with non-respondents. Rank standardisation never changes which ties exist; it finds two potential brokers in the compressed-ratings project in the directed view, where the compressed ratings left none, and otherwise mostly reorders members (rank correlation of received strength with the unstandardised analysis 0.86–0.98 directed).

### Both report a tie

**Meaning.** A tie counts only where each member reports one with the other: confirmed ties only.

**Formula.** Section 1.3: min(w_ij, w_ji) when both are above 0 (same sign on a signed layer), 0 when either is 0 or the signs differ, missing when either is missing. It is a fourth way to combine the two directions, chosen under Direction on the Map tab or switched in "Check the data" (which moves to the mutual view).

**Caveats.** Below full coverage it cannot tell an unconfirmed tie from one whose other side was never asked, so every tie of a member who gave no ratings disappears; combine it with reconstruction (below) only where the relation is mutual by nature. Reciprocity (section 2) is the network-level counterpart and is reported in every view.

### Members who gave no ratings

**Meaning.** A member who gave none of the ratings possible for them (section 13) still appears through other members' ratings of them. Their outgoing values, and in the mutual view all their values, rest on those reports alone (D147).

**Marked (default).** Values that depend on their own ratings are shown and marked * (section 13).

**Left out.** Those values are not defined, with the reason "this member gave no ratings, and the analysis leaves out values that depend on their own ratings": in the directed view every metric except received strength, connections in and reach from others; in the mutual view every metric. Potential brokers, peripheral members and possible overload neither name them nor count their values in the quantiles and medians they compare against. The group rules (silos, the formal–informal gaps, negative ratings) are unchanged, because they count ties of a group, not values of a member. The member stays on the map and in every tie count: leaving out changes what is reported about them, not the network.

**Caveat.** Leaving out hides members about whom something is known (colleagues' reports), so a member who is genuinely peripheral and did not answer is no longer listed. The data-quality statement still counts them.

### Reconstruction from colleagues' ratings

**Meaning.** For a relation that is mutual by nature, such as working together, a colleague's report of the tie is also evidence of the other direction.

**Formula.** On each enabled layer marked mutual by nature, for each member j who gave no ratings and each colleague i who rated j: if j → i is missing, j → i := i → j (after rater standardisation, when that is on). Only missing directions are filled, never a rating given, and never between two members who both gave no ratings. A layer is mutual by nature when its "Mutual by nature" switch (layer manager, edit) is on; by default connection strength, formal collaboration and informal collaboration, and no other layer. Advice, trust, influence, dependency, awareness, idea sharing, safety, valence, energy and conflict describe one person's experience of another, so they are not reconstructed unless the analyst marks them.

Reconstructed directions are labelled as reconstructed: in the member panel's ties ("reconstructed", with a note), in the map legend ("n tie directions reconstructed from colleagues' ratings") and in the member metrics CSV's note column. Coverage and the data-quality checks are unchanged: a reconstructed rating is not a rating.

**Caveats.** Reconstruction assumes the relation is symmetric; where colleagues over-report ties to a senior member, the reconstructed member inherits the over-report. Under mean, minimum and maximum it changes nothing in the mutual view, which already fills a missing direction from the other; it matters in the directed view and under "both report a tie".

### Rater standardisation (ranks within each rater)

**Meaning.** Some raters rate everyone high and others everyone low (section 13, "How each person rates"). Standardising within each rater compares each rating with that rater's own other ratings, so habits of the scale do not decide who appears strong.

**Formula.** On each unsigned layer, for each rater i with k ties (rescaled weights above 0), each tie's weight is replaced by (rank − 0.5) / k, where rank is its position among i's ties from weakest (1) to strongest (k), and equal weights share their average rank. A rater's ties therefore spread evenly between 0 and 1; a rater whose ties are all equal, or who has one, gets 0.5 for each. A rated 0 stays 0 and a missing rating stays missing, so which ties exist does not change, and binary measures (degree, connections, density, components, E-I) are unchanged. Signed layers are not standardised. The standardised weights replace the rescaled ones before the composite and every weighted metric (strength, betweenness and harmonic closeness through 1/w distances, eigenvector centrality, constraint, effective size, clustering, communities). Members who gave no ratings have nothing to standardise.

**Why ranks.** The owner chose ranks over z-scores at the session's checkpoint. Ranks need no assumption that scale points are equally spaced (section 1.2), no clamping and no pooled mean to map back to; z-scores within each rater collapsed every same-answer rater to the overall mean (rank correlation of strength 0.04 with the unstandardised analysis in the polite dense team, mutual view, against 0.68 for ranks).

**Caveats.** Ranks discard the size of the gaps between ratings, and a rater with few ties gets coarse values (two ties: 0.25 and 0.75). A rater who really is closer to everyone than most loses that difference, which the section 13 caveats also note. The composite's rescaled terms then mix standardised unsigned layers with unstandardised signed treatments.

## 15. Groups view

**Meaning.** How closely groups of members are tied to each other: for every group, the share of the ties possible inside it that exist, and for every pair of groups, the share of the ties possible between them. It answers "which groups work closely, and which hardly at all?" for teams, sites, legacy organisations, levels or any other category attribute, and for the communities detected on the layer.

**Formula.** The E-I index and cross-group density of section 4, read from the engine's mixing figures for the layer the map draws ties from ("Ties from"), in the current view, on binary ties (any weight above 0). Each cell of the group connection matrix gives e_AB of p_AB possible ties and their share e_AB / p_AB, with p_AB = |A| |B| between groups and |A| (|A| − 1) within, halved within a group in the mutual view. In the directed view the matrix is read from row to column, and the group map adds both directions: (e_AB + e_BA) / (p_AB + p_BA). Communities are the Louvain partition of section 4 on the same layer, numbered from 1 by their lowest member; mixing by community uses the same formulas with each member's community as the group.

**Group map.** One circle per group, its area proportional to the group's members, placed on a circle in group order. One line per pair of groups with at least one tie, its width linear in the share of possible ties between them, from the thinnest line to the thickest at the largest share between any two groups (stated in the key). No line is drawn where two groups have no ties.

**Caveats.** Shares count ties, not their strength; on the composite, any pair the composite rates above 0 counts. Every member and every tie counts, whatever the map's tie-strength range, filters or ego view, as for every metric. Members with no value for the attribute are left out, with their ties, and the number is stated. Larger groups have more possible ties, so a share is comparable across groups where a count is not; a group of one has no tie possible within itself. Communities are found from the ties themselves, so a high share inside each community is partly by construction; they change when the layer or its weights change. The table's "ties leaving" counts every tie between the group and another group in either direction, as the E-I index does.

## 16. Bridges, cut points and load concentration

Added in build plan session 7. Every measure here is computed in the engine for the composite, each unsigned layer and each signed layer's positive ratings, in the current view, from every tie (any weight above 0), whatever the map shows. None is computed on negative sub-layers (section 3.1).

### Edge betweenness

**Meaning.** How many of the shortest routes between members pass through a tie. A tie with high edge betweenness carries routes between parts of the network that have few other links (Freeman, 1977; Brandes, 2001).

**Formula.** EB(e) = Σ_{s ≠ t} σ_st(e) / σ_st, over ordered pairs of members, where σ_st is the number of shortest paths from s to t (distance 1/w, section 1.4) and σ_st(e) the number through tie e, divided by n(n − 1) in both views. This is `nx.edge_betweenness_centrality(G, weight='distance', normalized=True)`, computed with Brandes' accumulation in the same pass as members' weighted betweenness (section 3); its values match NetworkX on the four fixtures within 1e-16 (12,956 ties across views). In the directed view each direction of a pair is its own tie.

**Caveats.** As betweenness (section 3): it assumes that what flows takes shortest paths, and stronger ties count as shorter. It is listed per tie; the map marks local bridges instead, which do not depend on weights.

### Local bridges and their span

**Meaning.** A tie whose two members have no contact in common, so that the tie is their shortest link and, without it, any route between them is longer (Granovetter, 1973, 1983). The span is how many steps that other route takes. A local bridge with no other route at all is a bridge in the strict sense: removing it splits the network.

**Formula.** On the ties read without direction (a tie in either direction counts once): a tie between u and v is a local bridge when N(u) ∩ N(v) = ∅. Its span is the number of steps between u and v in the network without that tie, by breadth-first search, or infinite when there is none; every local bridge has span at least 3. This is `nx.local_bridges(G, with_span=True, weight=None)`, which NetworkX defines for undirected graphs, so in the directed view the ties are read without direction as `G.to_undirected()` does. Values match NetworkX exactly on the fixtures.

**Caveats.** Whether a tie is a local bridge depends on every tie of the layer, so a missing rating can create or remove one; read it with the coverage. On a dense layer there are few local bridges, because most pairs share a contact; on a sparse layer, such as a high threshold would draw, there are many. The map marks local bridges among every tie of the layer drawn, not among the ties drawn only.

### Cut points

**Meaning.** A member whose removal splits the part of the network they belong to: some colleagues are linked to the rest only through them. For each, Graticule counts the members who would be cut off from the largest part that remains.

**Formula.** Articulation points of the ties read without direction (the depth-first search of Hopcroft & Tarjan, 1973), as `nx.articulation_points`. Cut off = the members of the cut point's part, less the cut point, less the largest part that remains once it is removed. Values match NetworkX's articulation points and its connected components exactly on the fixtures.

**Caveats.** A cut point is a structural position, not a description of a person; many have it because of their role, location or the survey itself. A member who answered no survey can still be a cut point through colleagues' ratings of them. The resilience simulation (section 6) shows the effect of removing any member.

### Routes between groups

**Meaning.** For the grouping attribute of the insight rules: which members hold every tie between a group and other groups, and how many ties link each pair of groups directly.

**Formula.** On the ties read without direction, a group's ties with other groups are the pairs (one member inside, one outside, both with a value) tied in either direction; the members holding them are listed most ties first. Members without a value are left out. The "Only routes between groups" rule (section 8) reads these on the composite and each working layer.

**Caveats.** Direct ties only: two groups can reach each other through a third. A group with no tie to any other group is described by the silo rule, not this one.

### Load concentration

**Meaning.** How far the ties members receive gather on a few of them: the share of all incoming ties held by the 10 % of members who receive the most. On advice and workflow dependency it describes where requests and reliance gather (review §6, "Load concentration"; the "points of overload" ONA is used to find).

**Formula.** Ties received by member i: the number of members j with w(j → i) > 0, read from the directed ratings in either view, so the mutual view does not lose who named whom. With m members, k = ⌈0.1 m⌉ (at least 1) members are taken by ties received, highest first (ties broken by member order, which does not change the share); share = Σ_top received / Σ_all received, not defined when no one receives a tie. Within a group the same is computed over the group's members, against the ties they receive; spread evenly, the top members would hold k / m. The fixtures compute the same from NetworkX in-degree; values match exactly.

**Caveats.** Counts, not strength: a member named once by many colleagues counts more than one named often by a few. A share near k / m means ties are spread evenly, not that anyone's load is right; a high share may reflect a role (a coordinator, a single expert) that the organisation intends. Members who gave no ratings still receive ties from others, so their count is complete, but members who did not answer do not name anyone, which lowers others' counts.

### Ranked bars of incoming ties

The Table tab's "Incoming ties" mode lists the members the map shows, most ties received first, on a chosen layer (advice by default, then workflow dependency, then "Ties from"), with each member's share of all ties received and a bar relative to the longest. A rule marks the last of the top 10 % of all members. The list is a table, so it is also the alternative for screen readers. Filters and the ego view choose the members listed; shares are always of every tie received.

The references cited here are listed in section 12.

## 17. Questions and readouts

Added in build plan session 8. The analysis starts from a question a client asks, and every number shown is read out in a sentence. Nothing here is a new measure: each sentence restates a figure from the sections above, computed on every tie of the layer the map draws ties from, whatever the map's range hides.

### The question catalogue

Each question is bound to the relation that answers it, and choosing it sets "Ties from", the node size, the layout and the encodings (spec §8 lists them). The map opens on "Who is connected to whom?", with ties from connection strength: the relation every survey asks and the one most directly meaning "these two members are connected". The composite (section 6) is a statement of priorities, so it is never chosen for the user: it sits under "Advanced: combine layers" and is used only when the user draws ties from it, in which case its weights are stated on the map and in the legend of every export. A question whose relation is missing, switched off or not rated says so and changes nothing; another relation is never put in its place, because a stand-in would answer a different question under the same title.

The opening tie-strength range stays 0.30 to 1.00 (section 11, "Map display"). Measured on the demo with connection strength, the range draws 212 of the 780 pairs in the directed view (182 when mutual, by the average), against 241 for the composite under the default weights, and keeps 4 of the 6 pairs coloured by a negative valence rating.

### Network readouts

- **Density:** the ties present out of those possible, n(n − 1) in the directed view (each direction a tie) or n(n − 1)/2 pairs when mutual, with the share (section 4).
- **Reciprocity:** the share of ties returned (`nx.overall_reciprocity`, section 4), always read from the directed ratings, so the mutual view says "in the ratings as given".
- **Separate parts:** weak components in the directed view, connected components when mutual; members in a part of their own are named as members with no tie.
- **Communities:** the number found and the modularity Q (section 4), with the guide that networks with clear clusters typically score between 0.3 and 0.7. This range is commonly attributed to Newman & Girvan (2004), but it was checked here only against secondary sources quoting that paper. A Q below 0.3 is reported as it is, without a verdict.
- **Centralisation:** Freeman degree centralisation (section 4), in-degree in the directed view, with the largest and the median number of connections, so the figure is anchored in counts.
- **E-I index:** ties within and between groups of the insight rules' attribute (section 4), with the share of all possible pairs that cross between groups. That share is what an even spread of ties would give, but no test against chance is made (planned in build plan session 18).

Question readouts add, by question: members asked for advice and the most-asked and median counts (ties received, section 16); the pair of groups sharing the most ties between groups and the pairs sharing none (mixing counts, section 15); the member with the highest bridging; the top 10 % share of incoming ties (section 16); formal-only, informal-only and both shares of working ties (section 6), with the pair of groups whose working ties are most often informal only, among pairs with at least 5 such ties so that a share of one or two ties is not quoted; local bridges and the cut point that cuts off most members (section 16); and negative ratings given on the signed layer, with how many were returned in kind and the structural balance of its trios (section 5).

### Member readouts

Beside each rank, the member panel says how the member's value compares with their colleagues' values: "more … than k of their N colleagues", or "than any" when no colleague's value is equal or higher, with ties counted separately ("2 colleagues have the same value"). Colleagues whose value is not defined are left out and the sentence says so. Constraint reads the other way: a lower value is a more open network (contacts not tied to one another), so the comparison is of openness, and rank 1, the highest constraint, is read as the most closed network. The median of the member's group (the insight rules' attribute) is given beside it.

**Caveats.** A comparison says where a value sits among colleagues, not whether it is high enough for any purpose; the caveats of each measure (section 3) apply unchanged. Readouts follow the insight wording rules: they describe positions and never evaluate a member (spec §2).

The references cited here are listed in section 12.

## 18. Audience levels

Every presentation and export is prepared for an audience: the analyst (no restriction), a board, a leadership team, a team workshop, or a one-to-one. The level is applied in one policy layer (`src/ui/state/audience.ts`), beside the names layer, and every output reads it; the analyst's workspace never does. The level is chosen in presentation mode and in the Export dialog; the choice is saved in the project as its default, with the smallest group shown, the teams that agreed to be named in a workshop and the members who agreed to be named in leadership outputs.

**Minimum group size.** At board and leadership level, a group with fewer members than the minimum (5 by default, never below 3) is not shown on its own. Groups below the minimum are pooled into one group, "Other groups (n members)", when together they reach the minimum; otherwise they are left out, and a note says how many members that is. Pooling is exact: ties and possible ties add up, so the pooled group's density, ties inside and E-I are those of a group made of its members (a unit test compares them with an analysis in which the small groups share one value). The groups shown keep their own figures, including ties with members of small groups, and the totals ("All groups") count every member, with the pooled groups as one group. Communities are pooled in the same way. The same rule applies to every attribute in the network metrics CSV, and to the groups of a one-to-one card.

**Caveat: subtraction.** When one small group is left out while the whole-network totals are shown, its figures can sometimes be worked out by subtracting the groups shown from the totals (the owner accepted this, 2026-10-28). Pooling avoids it whenever two or more small groups together reach the minimum. Where it matters, raise the minimum so that the small group is pooled with others, or group by another attribute.

**What each level shows.**

- *Board:* each saved view as its group map (one node per group, area by members; one line per pair of groups with ties, width by the share of possible ties between them, up to the largest share), with its key; network metrics; ties within and between groups; insights about groups only (silos, formal–informal gaps between groups, a group whose ties with other groups are held by one or two members, concentrated demand within a group, negative ratings not returned as counts by pair of groups), each about groups of at least the minimum size and naming no member; the data-quality statement. Insight rules about individual members (potential brokers, peripheral members, possible overload, negative clusters) and cut points are left out. Coverage is given as counts, without the list of raters below the threshold.
- *Leadership team:* as for a board, plus the roles between groups found by the insight rules: members who hold a group's ties with other groups, cut points, and potential brokers. A member is named (or given their code, when names are hidden) only if they agreed; otherwise "A member of" their group, or "A member" when their group is below the minimum, and members of one group in the same role are counted in one sentence.
- *Team workshop:* one team (a value of the group rules' attribute): its members and the ties among them, its ties with other groups counted by group (small groups pooled), and insights about the team. Members are named only if the team agreed in advance; otherwise they are shown as codes, whatever "Hide names" says. Members of other teams never appear; signed layers are not drawn.
- *One-to-one:* the member's personal network card. Ties given and received are counted from the ratings as given (a tie is a rating above the lowest point of the scale), whatever the view: by group on the "Ties from" layer when it is a working layer (otherwise the first working layer), with ties received counted by group only and small groups pooled; ties given, received and returned on each working layer (unsigned, not conflict); the colleagues the member rated, with their own ratings; and the member panel's sentences on their position (section 17). No rating someone else gave the member is shown except as a count. Change between waves is added once the survey can be repeated (build plan sessions 14 and 15).

**Free text.** View names, captions and the project title have every member the level may not show replaced by "a colleague", by full name or by code; at board level that is every member.

**Limits.** An audience level controls what Graticule outputs; it cannot stop someone recognising a colleague from context (a group of five in which only one person is new), and a group's figures always describe its members together. Agreement to be named is recorded by the analyst; Graticule does not collect it.

## 19. Notes for readers

These notes are written for the readers of a report rather than for the analyst: one or two sentences on what each measure means, without formulas. The PDF report prints them as "The method in brief" (build plan session 10); the sections above give the full definitions and caveats, and the report's technical appendix quotes them.

### How the data was gathered

Each person rated their colleagues on a few kinds of working relationship, such as how often they collaborate or whom they ask for advice. A tie is a rating above the lowest point of a scale; a rating someone did not give is treated as unknown, never as no tie.

### Kinds of relationship

Each kind of relationship is analysed on its own, as a layer of the network. Where the report combines layers, it says which ones and how much each counts; the combination states the analyst's priorities and is not a finding.

### Directions

A tie has a direction: one person's rating of another may differ from the reverse. A report either counts each direction separately or reads the two directions of a pair together, and says which.

### How dense the network is

The share of possible ties that are present. A dense network is one in which most people are tied to most others.

### Ties returned

The share of ties that are given in both directions: the colleague named also names the person who named them.

### Separate parts

Groups of people with no route of ties between them. In most organisations everyone is connected, directly or through others.

### Clusters

Groups of people who are tied mostly to one another, found automatically from the ties alone. Modularity says how clear the clusters are; networks with clear clusters typically score between 0.3 and 0.7.

### Ties within and between groups

How many ties stay within a group, such as a team, and how many cross to other groups. The E-I index runs from −1, when every tie stays inside, to +1, when every tie crosses.

### Concentration

Whether ties fall evenly across people or gather on a few. Centralisation runs from 0, when everyone has as many ties, to 1, when every tie involves the same person.

### Bridging

How often a person lies on the shortest routes between colleagues. People with high bridging join up parts of the network that would otherwise be further apart.

### Connections in and out

How many colleagues name a person, and how many they name. These count ties; they say nothing about the quality of anyone's work.

### Bridge ties and cut points

A bridge tie joins two people who have no contact in common. A cut point is a person through whom alone some colleagues are linked to the rest of the network.

### Demand on a few people

The share of all requests, such as for advice, that the people named most often receive, set against the share they would receive if requests were spread evenly.

### Formal and informal collaboration

Formal collaboration is work that a role, process or reporting line requires; informal collaboration is work people choose to do together. Comparing the two shows where work runs outside the formal structure.

### Negative ratings

Some relationships are rated on a scale from negative to positive. Negative ratings are counted on their own and never offset by positive ones; a trio of people is balanced when none or two of their three ties are negative.

### Insight rules

Each pattern in the report was found by a fixed rule, with stated thresholds, applied to every group in the same way. A pattern is a question for the people involved, not a finding about anyone.

### How complete the data is

The share of possible ratings that were given. When coverage is below the threshold, figures about the whole network rest on incomplete data; people who gave few ratings are described largely by others' reports.
