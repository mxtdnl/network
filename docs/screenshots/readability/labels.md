# Map labels (Q36)

Measured on 2026-10-21 against the production build (`vite preview`, `/network/`, CSP in force), headless Chromium 141, device pixel ratio 1. The demo was loaded through the first-run notice and Load demo under the defaults built in D125–D136: force-directed layout, directed view, composite under the app's default weights, threshold 0.3, size by Bridging (by value), fill by team, condensed legend in compact mode. 1280 × 720 and 1440 × 900 are compact layouts; 1920 × 1080 is the full desktop layout. Each size was measured with names shown and with names hidden (codes), because names are longer than codes and collide more.

## Method

A page script recorded every `arc`, `fillText` and `measureText` call on the map's 2D contexts. After the map had settled (`data-transition="idle"`, 20 frames and 800 ms), the last full picture gave each member's screen position and radius (the 40 node arcs, drawn in project order) and the labels drawn. A label was matched to its member by its anchor (centred, `radius + s-1 + 12 px` below the member), which is exact in this state because nothing is highlighted.

The options below were evaluated offline on those recorded positions with a re-implementation of the placement rule in `src/ui/map/scene.ts` (greedy, priority by radius, each label placed only if its box clears the boxes already placed). The re-implementation was checked first: with the widths the app used, it reproduced the browser's labelled set exactly, member for member, in all six cases. The options were not built or rendered in the app, so there are no screenshots of them; the counts are a simulation on the real positions.

## Unlabelled members under the defaults

| Window | Layout | Map canvas | Unlabelled, names | Unlabelled, codes |
|---|---|---|---|---|
| 1280 × 720 | compact | 960 × 628 | 9 of 40 | 5 of 40 |
| 1440 × 900 | compact | 1120 × 808 | 3 of 40 | 1 of 40 |
| 1920 × 1080 | desktop | 1240 × 952 | 2 of 40 | 0 of 40 |

Members left out (codes): 1280 × 720: PRO-L2-02, SAL-L2-01, SAL-L2-02, SAL-L2-03, SAL-L2-05; 1440 × 900: SAL-L2-03. With names, the 1280 × 720 case leaves out nine members of Product, Sales and People in the dense right-hand cluster, and two (both in that cluster) at 1920 × 1080. Every unlabelled member has a radius of 4.0–4.8 px; on this map 27 of 40 members are within 1 px of the 4 px minimum, because Bridging by value is dominated by one member (D134).

Other measured facts about the current rule: no label is drawn outside the canvas or under the legend or zoom controls; labels are allowed to cover other members' circles, and do so 5 times at 1280 × 720 with names (3 with codes, 1 at 1440 × 900, at most 1 at 1920 × 1080). An unlabelled member still gets its name on hover, focus or selection, which already tries below, above, right and left (D80).

Screenshots (names hidden, as for all documentation screenshots):

- `labels-1280x720.png`, `labels-1440x900.png`, `labels-1920x1080.png`: the workspace as loaded.
- `labels-1280x720-unlabelled.png`, `labels-1440x900-unlabelled.png`: the map canvas with each unlabelled member circled in magenta. The circles are an annotation added afterwards; they are not part of the app.

## A defect found while measuring

The controller caches each label's width the first time it measures it (`MapController.measure`, `src/ui/map/controller.ts`), and never clears the cache. On the first picture after loading, Fira Sans Condensed 500 has not loaded yet (`document.fonts.check` was false for all 40 measurements in every run), so names are measured in the fallback face, about 10 % wider ("Gideon Northing": 89.9 px cached, 81.5 px in the loaded font). Each name therefore reserves more space than it uses for the rest of the session. Codes were measured after the font had loaded, so the codes counts are unaffected. Measuring once the font has loaded (or clearing the cache when `document.fonts` reports a load) changes names: 1280 × 720 9 → 8, 1440 × 900 3 → 2, 1920 × 1080 unchanged at 2. The same cache feeds highlighted labels, so this is worth fixing whatever option is chosen.

## Options and measured effect

Unlabelled members out of 40 (names / codes). "Covers a member" counts labels drawn over another member's circle (names / codes). "Off its usual place" counts labels not below their member.

| Option | 1280 × 720 | 1440 × 900 | 1920 × 1080 | Covers a member at 1280 × 720 | Off its usual place at 1280 × 720 |
|---|---|---|---|---|---|
| A. As built | 9 / 5 | 3 / 1 | 2 / 0 | 5 / 3 | 0 / 0 |
| B. A with widths measured in the loaded font (the defect above) | 8 / 5 | 2 / 1 | 2 / 0 | 4 / 3 | 0 / 0 |
| C. B, and every label tries below, above, right, left (the places highlighted labels already use) | 1 / 0 | 0 / 0 | 0 / 0 | 6 / 3 | 10 / 7 |
| C8. As C with eight places (adding the four diagonals) | 1 / 0 | 0 / 0 | 0 / 0 | 6 / 3 | — |
| D. C, and a label may not cover another member, leave the canvas or sit under the legend or zoom controls | 3 / 1 | 0 / 0 | 0 / 0 | 0 / 0 | 14 / 9 |
| E. D, with a leader line when none of the four places fits (label up to 48 px away, clear of members) | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 14 / 9 |
| F. Priority by size metric | Already the rule: after highlighted members, labels are placed largest first (`priority` includes `node.radius`). Changing the order changes who is unlabelled, not how many; on this map most members tie near the minimum radius, so the order mostly falls back to project order | | | | |
| G. Labels on hover only above a density | Already the rule above 60 visible members (`LABEL_ALL_BELOW`): the 250-member synthetic project shows names only on hover, focus, selection or highlight. A rule that switches to hover-only whenever any label would be dropped would trigger at both compact sizes (and at 1920 × 1080 with names), leaving 40 of 40 unlabelled at rest instead of 1–9 | | | | |
| H. Zoom in (available today) | Labels keep their screen size, so zooming in about the centre separates them: every label fits at 2.5× (names) or 1.75× (codes) at 1280 × 720, at which 13 or 26 of the 40 members are still on screen | | | | |

Notes on the options:

- E needed leaders only at 1280 × 720: three with names and one with codes, the longest 23 px from the member's edge, none crossing another leader. Crossings with ties were not modelled. A leader line is a new mark: it would need drawing in the canvas, render worker, SVG and PDF backends (D107), a legend or explanation, and a check that it is not read as a tie.
- Eight places gave the same counts as four on every case, so the diagonals add nothing here.
- C labels more members than D because it lets labels sit over other members; D trades two more unlabelled members at 1280 × 720 for no label covering a member.
- Every option keeps the hover, focus and selection behaviour and the anchoring of highlighted names over the faded picture (D80, D114).

## Recommendation

B with D: measure label widths once the map font has loaded, and let every label try the four places already used for highlighted members, refusing a place that covers another member, leaves the canvas or falls under the legend or zoom controls. On the demo this leaves 3 members unlabelled with names and 1 with codes at 1280 × 720 (from 9 and 5), and none at 1440 × 900 or 1920 × 1080 (from 3 and 2), while removing every label drawn over a member. It reuses the existing placement code and its alternatives, adds no mark type, and so changes nothing in the export backends beyond the label positions they already take from the scene.

Not recommended now: leader lines (E) remove the last 3 at 1280 × 720 but add a mark to four backends and the legend; hover-only above a density (G) would hide every name on the demo at the sizes that most need help; priority by size (F) is already in place. The cost of D is that up to 14 of 37 labels at 1280 × 720 (2–4 at the larger sizes) sit above or beside their member rather than below, so position alone no longer tells which member a name belongs to in the densest area; whether that stays clear should be checked by eye once built.

## Limits

- One project (the 40-member demo), one layout (force-directed, which is deterministic: two runs gave the same positions) and the default settings. Grouped and circular layouts, other size metrics and other thresholds were not measured.
- Device pixel ratio 1 only, in headless Chromium; fonts as shipped.
- The options are a simulation on recorded positions, validated by reproducing the current rule exactly; their rendering, label-to-member legibility and export output have not been seen.
