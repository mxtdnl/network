// The personal network card (build plan session 9): one member's own network,
// for a one-to-one conversation. Built as report blocks, so the presentation
// and the PDF show the same content. It holds the member's ties by group (ties
// received counted by group only, small groups pooled), ties given against
// received on each working layer, the colleagues the member rated with their
// own ratings, and sentences on where they sit in the network. It never shows
// a rating someone else gave, except as a count.

import {
  DEFAULT_WAVE,
  isCategorical,
  layerRole,
  NON_WORKING_ROLES,
  type LayerDefinition,
  type MemberId,
  type Project,
} from '../../data/schema';
import type { AnalysisResult } from '../engineClient';
import { audienceCopy } from '../copy/audience';
import { formatValue, mapCopy } from '../copy/map';
import { DIRECTED_METRICS, SYMMETRISED_METRICS, metricCopy } from '../copy/metrics';
import { memberSentence } from '../copy/readouts';
import type { Block, ReportSection } from '../export/report';
import { groupSizes, type AudiencePolicy } from './audience';
import { memberReadout } from './readouts';
import type { MapSettings } from './store';

const C = audienceCopy.card;

export interface CardModel {
  member: MemberId;
  /** The member's name, or code when names are hidden. */
  name: string;
  title: string;
  subtitle: string;
  sections: ReportSection[];
}

/** Layers whose ties are working ties: rated on a scale, unsigned, not friction. */
function workingLayers(project: Project): LayerDefinition[] {
  return project.layers.filter(
    (l) => l.enabled && !isCategorical(l) && !l.signed && !NON_WORKING_ROLES.includes(layerRole(l)),
  );
}

/** The layer the card counts ties on: the map's "Ties from" layer when it is a working layer, else the first. */
export function cardLayer(project: Project, settings: MapSettings): LayerDefinition | null {
  const layers = workingLayers(project);
  return layers.find((l) => l.key === settings.layer) ?? layers[0] ?? null;
}

const n = (v: number) => formatValue(v);

export function buildCard(
  project: Project,
  result: AnalysisResult,
  settings: MapSettings,
  policy: AudiencePolicy,
): CardModel | null {
  const id = policy.member;
  const index = project.members.findIndex((m) => m.id === id);
  const member = project.members[index];
  if (!id || !member) return null;
  const names = policy.names;
  const layer = cardLayer(project, settings);
  const sections: ReportSection[] = [];
  const intro: Block[] = [];
  const noRatings = result.ratingFlags[index] === 'gaveNoRatings';
  if (noRatings) intro.push({ kind: 'paragraph', text: C.noRatings });

  // Ties given and received on one layer, as raw ratings (directed, whatever the view).
  const ties = (l: LayerDefinition) => {
    const gave = new Set<MemberId>();
    const received = new Set<MemberId>();
    for (const t of project.ties) {
      if (t.wave !== DEFAULT_WAVE || t.variable !== l.key) continue;
      if (typeof t.value !== 'number' || !(t.value > l.min)) continue;
      if (t.rater_id === id) gave.add(t.ratee_id);
      if (t.ratee_id === id) received.add(t.rater_id);
    }
    return { gave, received };
  };

  // Ties by group: the group rules' attribute, small groups pooled.
  const attr = policy.attribute;
  if (layer && attr) {
    const { gave, received } = ties(layer);
    const sizes = groupSizes(project, attr.key);
    const own = member.attributes[attr.key] ?? null;
    const valueOf = new Map(project.members.map((m) => [m.id, m.attributes[attr.key] ?? null]));
    const groups = [...sizes.keys()];
    const big = groups.filter((g) => (sizes.get(g) ?? 0) >= policy.minGroupSize);
    const small = groups.filter((g) => !big.includes(g));
    const smallMembers = small.reduce((s, g) => s + (sizes.get(g) ?? 0), 0);
    const pool = smallMembers >= policy.minGroupSize;
    const countIn = (set: Set<MemberId>, inGroup: (v: string | null) => boolean) =>
      [...set].filter((x) => inGroup(valueOf.get(x) ?? null)).length;
    const colleaguesIn = (inGroup: (v: string | null) => boolean) =>
      project.members.filter((m) => m.id !== id && inGroup(m.attributes[attr.key] ?? null)).length;
    const rows: string[][] = big.map((g) => {
      const is = (v: string | null) => v === g;
      return [
        g === own ? C.ownGroup(g) : g,
        n(colleaguesIn(is)),
        n(countIn(gave, is)),
        n(countIn(received, is)),
      ];
    });
    if (pool) {
      const is = (v: string | null) => v !== null && small.includes(v);
      rows.push([
        audienceCopy.otherGroups(smallMembers),
        n(colleaguesIn(is)),
        n(countIn(gave, is)),
        n(countIn(received, is)),
      ]);
    }
    rows.push([C.allColleagues, n(project.members.length - 1), n(gave.size), n(received.size)]);
    const label = layer.label.toLowerCase();
    sections.push({
      title: C.byGroup,
      blocks: [
        ...intro,
        { kind: 'paragraph', text: C.byGroupHelp(label, policy.minGroupSize), tone: 'graphite' },
        {
          kind: 'table',
          columns: [
            { label: attr.label, numeric: false },
            { label: C.byGroupColumns.colleagues, numeric: true },
            { label: C.byGroupColumns.gave, numeric: true },
            { label: C.byGroupColumns.received, numeric: true },
          ],
          rows,
        },
      ],
    });
  } else if (intro.length > 0) {
    sections.push({ title: C.byGroup, blocks: intro });
  }

  // Given against received, per working layer.
  const layerRows = workingLayers(project).map((l) => {
    const { gave, received } = ties(l);
    const returned = [...gave].filter((x) => received.has(x)).length;
    return [l.label, n(gave.size), n(received.size), n(returned)];
  });
  if (layerRows.length > 0)
    sections.push({
      title: C.layers,
      blocks: [
        { kind: 'paragraph', text: C.layersHelp, tone: 'graphite' },
        {
          kind: 'table',
          columns: [
            { label: C.layersColumns.layer, numeric: false },
            { label: C.layersColumns.gave, numeric: true },
            { label: C.layersColumns.received, numeric: true },
            { label: C.layersColumns.returned, numeric: true },
          ],
          rows: layerRows,
        },
      ],
    });

  // The colleagues the member rated: their own answers, on every scaled layer.
  const scaled = project.layers.filter((l) => l.enabled && !isCategorical(l));
  const given = new Map<MemberId, Map<string, string>>();
  for (const t of project.ties) {
    if (t.wave !== DEFAULT_WAVE || t.rater_id !== id) continue;
    if (!scaled.some((l) => l.key === t.variable)) continue;
    const text = t.not_applicable
      ? C.notApplicable
      : typeof t.value === 'number'
        ? formatValue(t.value)
        : null;
    if (text === null) continue;
    let row = given.get(t.ratee_id);
    if (!row) {
      row = new Map();
      given.set(t.ratee_id, row);
    }
    row.set(t.variable, text);
  }
  const ratedLayers = scaled.filter((l) => [...given.values()].some((r) => r.has(l.key)));
  const ratedRows = project.members
    .filter((m) => given.has(m.id))
    .map((m) => [
      names.of(m.id),
      ...ratedLayers.map((l) => given.get(m.id)?.get(l.key) ?? C.notRated),
    ])
    .sort((a, b) => (a[0] ?? '').localeCompare(b[0] ?? ''));
  sections.push({
    title: C.rated,
    blocks:
      ratedRows.length === 0
        ? [{ kind: 'paragraph', text: C.ratedNone }]
        : [
            { kind: 'paragraph', text: C.ratedHelp, tone: 'graphite' },
            {
              kind: 'table',
              columns: [
                { label: C.colleague, numeric: false },
                ...ratedLayers.map((l) => ({ label: l.label, numeric: true })),
              ],
              rows: ratedRows,
            },
          ],
  });

  // Position: the member panel's sentences, on the "Ties from" layer of the analysis.
  const ref = result.refs[settings.layer];
  const refLabel =
    settings.layer === 'composite'
      ? mapCopy.controls.composite
      : (project.layers.find((l) => l.key === settings.layer)?.label ?? settings.layer);
  const metrics = result.view === 'directed' ? DIRECTED_METRICS : SYMMETRISED_METRICS;
  const position: Block[] = [];
  if (ref)
    for (const m of metrics) {
      const column = ref.node.columns[m];
      if (!column) continue;
      const readout = memberReadout(project, column, index, m);
      if (!readout) continue;
      position.push({
        kind: 'paragraph',
        lead: metricCopy[m].label,
        text: memberSentence(readout),
      });
    }
  sections.push({
    title: C.position,
    blocks: [
      { kind: 'paragraph', text: C.positionHelp(refLabel.toLowerCase()), tone: 'graphite' },
      ...(position.length > 0 ? position : [{ kind: 'paragraph' as const, text: C.noPosition }]),
    ],
  });

  const name = names.of(id);
  return {
    member: id,
    name,
    title: name,
    subtitle: `${C.title}. ${C.subtitle(layer?.label.toLowerCase() ?? refLabel.toLowerCase())}`,
    sections,
  };
}
