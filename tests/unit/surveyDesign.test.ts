// Survey design support (build plan session 12): context questions stored as
// member attributes with consent, the boundary question, format 2 of links,
// packages and responses (format 1 still read), the estimate, the design
// guidance's figures and the launch kit.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeBoundary, computeQuality } from '../../src/data/quality';
import { parseProject, serialiseProject } from '../../src/data/projectFile';
import type { Project, Survey } from '../../src/data/schema';
import { fromUtf8, toBase64Url, utf8, fromBase64Url, sha256 } from '../../src/survey/bytes';
import { applyImport, planImport } from '../../src/survey/collect';
import { deflate, inflate } from '../../src/survey/compress';
import {
  CONTEXT_ITEMS,
  assignAttributes,
  contextOptions,
  textLines,
  withContextAttributes,
} from '../../src/survey/context';
import { seal } from '../../src/survey/crypto';
import { createSurveyKey } from '../../src/survey/keys';
import {
  buildLinks,
  createSurvey,
  currentVersion,
  draftProblems,
  estimateSeconds,
  extraSeconds,
  needsNewVersion,
  payloadFor,
  updateSurvey,
  type SurveyDraft,
} from '../../src/survey/model';
import { makePackage, readLink, readPackage } from '../../src/survey/payload';
import {
  aadFor,
  armour,
  decryptResponse,
  encryptResponse,
  RESPONSE_FORMAT,
  type Envelope,
  type ResponseBody,
} from '../../src/survey/response';
import { fileTransport } from '../../src/survey/transport';
import { launchKit, plainText, type KitInput } from '../../src/ui/copy/launchKit';
import { respondentsNeeded } from '../../src/ui/views/survey/SurveyGuidance';
import { demoProject, draftFor } from '../fixtures/surveyProject';

const BASE = 'https://username.github.io/network/';
const NOW = '2026-10-29T09:00:00.000Z';
const LATER = '2026-10-30T09:00:00.000Z';
const FAST = 1000;
const PASS = 'correct horse battery';

const CONTEXT: SurveyDraft['context'] = [
  { id: 'time_in_role' },
  { id: 'working_pattern' },
  { id: 'main_site', options: ['North office', 'South office'] },
];
const BOUNDARY = ['Other parts of the organisation', 'Customers or clients'];

async function setup(patch: Partial<SurveyDraft> = {}, project: Project = demoProject()) {
  const { key, privateKey } = await createSurveyKey(PASS, FAST);
  const survey = createSurvey(
    draftFor(project, { context: CONTEXT, boundary: BOUNDARY, ...patch }),
    project,
    key,
    NOW,
    'SURVEYid012',
  );
  return {
    project: withContextAttributes({ ...project, surveys: [survey] }, survey),
    survey,
    privateKey,
  };
}

function bodyFor(
  survey: Survey,
  memberId: string,
  extra: Partial<ResponseBody> = {},
  at = NOW,
): ResponseBody {
  const version = currentVersion(survey);
  const position = version.roster.indexOf(memberId);
  const answers: ResponseBody['answers'] = {};
  const notApplicable: ResponseBody['not_applicable'] = {};
  for (const l of version.layers) {
    answers[l.key] = version.roster.map((_, j) => (j === position ? null : l.signed ? 1 : 2));
    notApplicable[l.key] = [];
  }
  return {
    survey_id: survey.id,
    version: version.version,
    position,
    token: survey.respondents.find((r) => r.member_id === memberId)?.token ?? '',
    submitted_at: at,
    nominated: null,
    answers,
    not_applicable: notApplicable,
    ...extra,
  };
}

async function importBodies(
  project: Project,
  survey: Survey,
  key: CryptoKey,
  bodies: ResponseBody[],
) {
  const texts: string[] = [];
  for (const b of bodies) {
    const r = await fileTransport.submit(
      await encryptResponse(b, survey.key.public_key, survey.key.fingerprint),
    );
    if (r.kind !== 'manual') throw new Error('expected manual');
    texts.push(r.text);
  }
  const plan = await planImport(
    project,
    survey,
    key,
    fileTransport.collect(texts.map((text, i) => ({ source: `file ${String(i)}`, text }))),
  );
  return { plan, project: applyImport(project, plan, LATER) };
}

const attr = (p: Project, member: string, key: string) =>
  p.members.find((m) => m.id === member)?.attributes[key];

describe('context questions', () => {
  it('records each question with its attribute and creates the attributes from the survey', async () => {
    const { project, survey } = await setup();
    const v = currentVersion(survey);
    expect(v.context?.map((q) => [q.id, q.attribute])).toStrictEqual([
      ['time_in_role', 'time_in_role'],
      ['working_pattern', 'working_pattern'],
      ['main_site', 'main_site'],
    ]);
    expect(v.boundary).toStrictEqual(BOUNDARY);
    const def = project.attribute_definitions.find((a) => a.key === 'main_site');
    expect(def).toMatchObject({
      label: 'Main site',
      type: 'categorical',
      categories: ['North office', 'South office', 'Somewhere else'],
      from_survey: survey.id,
      builtin: false,
    });
    const role = project.attribute_definitions.find((a) => a.key === 'time_in_role');
    expect(role?.type).toBe('ordinal');
    expect(role?.categories).toStrictEqual([
      'Less than 1 year',
      '1 to 3 years',
      '3 to 5 years',
      'More than 5 years',
    ]);
    // Every member carries the new attributes, not recorded yet.
    expect(project.members.every((m) => m.attributes.working_pattern === null)).toBe(true);
    // Applying again changes nothing.
    expect(withContextAttributes(project, survey)).toBe(project);
  });

  it('never writes over a built-in or existing attribute: a taken key gets _2', () => {
    const project = demoProject();
    const taken: Project = {
      ...project,
      attribute_definitions: [
        ...project.attribute_definitions,
        { key: 'main_site', label: 'Site (HR)', type: 'categorical', builtin: false },
      ],
    };
    const assigned = assignAttributes(taken, [{ id: 'main_site', options: ['A', 'B'] }], []);
    expect(assigned[0]?.attribute).toBe('main_site_2');
    // A question an earlier version asked keeps its attribute.
    const again = assignAttributes(
      taken,
      [{ id: 'main_site', options: ['A', 'B', 'C'] }],
      assigned,
    );
    expect(again[0]?.attribute).toBe('main_site_2');
  });

  it('stores answers in member attributes only with consent; prefer not to say is not recorded', async () => {
    const { project, survey, privateKey } = await setup();
    const { plan, project: after } = await importBodies(project, survey, privateKey, [
      bodyFor(survey, 'FIN02', {
        context: {
          consent: true,
          answers: { time_in_role: '1_3', working_pattern: null, main_site: 'South office' },
        },
        boundary: ['3_5', 'none'],
      }),
      // Consent not given: answers are not sent, and nothing is written.
      bodyFor(survey, 'FIN03', {
        context: { consent: false, answers: {} },
        boundary: ['none', 'none'],
      }),
    ]);
    expect(plan.contextResponses).toBe(1);
    expect(attr(after, 'FIN02', 'time_in_role')).toBe('1 to 3 years');
    expect(attr(after, 'FIN02', 'working_pattern')).toBeNull();
    expect(attr(after, 'FIN02', 'main_site')).toBe('South office');
    expect(attr(after, 'FIN03', 'time_in_role')).toBeNull();
    const log = after.surveys[0]?.log.filter((e) => e.kind === 'accepted') ?? [];
    expect(log.map((e) => e.context_consent)).toStrictEqual([true, false]);
    // The project file keeps everything.
    const reread = parseProject(serialiseProject(after));
    expect(attr(reread, 'FIN02', 'main_site')).toBe('South office');
    expect(reread.attribute_definitions.find((a) => a.key === 'main_site')?.from_survey).toBe(
      survey.id,
    );
  });

  it('ignores an answer the question does not offer', async () => {
    const { project, survey, privateKey } = await setup();
    const { project: after } = await importBodies(project, survey, privateKey, [
      bodyFor(survey, 'FIN02', {
        context: { consent: true, answers: { main_site: 'Moon base', time_in_role: 'forever' } },
        boundary: ['none', 'none'],
      }),
    ]);
    expect(attr(after, 'FIN02', 'main_site')).toBeNull();
    expect(attr(after, 'FIN02', 'time_in_role')).toBeNull();
  });

  it('replaces earlier answers as a whole; a later response without consent clears them', async () => {
    const { project, survey, privateKey } = await setup();
    const first = await importBodies(project, survey, privateKey, [
      bodyFor(survey, 'FIN02', {
        context: { consent: true, answers: { time_in_role: 'over_5', working_pattern: 'remote' } },
        boundary: ['none', 'none'],
      }),
    ]);
    expect(attr(first.project, 'FIN02', 'working_pattern')).toBe('Mostly remote');
    // An analyst's edit to someone who has not answered stays.
    const edited: Project = {
      ...first.project,
      members: first.project.members.map((m) =>
        m.id === 'FIN03'
          ? { ...m, attributes: { ...m.attributes, working_pattern: 'Mostly on site' } }
          : m,
      ),
    };
    const s1 = edited.surveys[0] as Survey;
    const second = await importBodies(edited, s1, privateKey, [
      bodyFor(
        s1,
        'FIN02',
        { context: { consent: false, answers: {} }, boundary: ['1_2', 'none'] },
        LATER,
      ),
      bodyFor(s1, 'FIN03', {
        context: { consent: false, answers: {} },
        boundary: ['none', 'none'],
      }),
    ]);
    expect(second.plan.replaced).toHaveLength(1);
    expect(attr(second.project, 'FIN02', 'working_pattern')).toBeNull();
    expect(attr(second.project, 'FIN02', 'time_in_role')).toBeNull();
    expect(attr(second.project, 'FIN03', 'working_pattern')).toBe('Mostly on site');
  });

  it('creates a new version when the context or boundary questions change', async () => {
    const { project, survey } = await setup();
    const draft = { ...draftFor(project, { context: CONTEXT, boundary: BOUNDARY }) };
    expect(needsNewVersion(survey, draft, project)).toBe(false);
    const fewer = { ...draft, context: CONTEXT.slice(1) };
    expect(needsNewVersion(survey, fewer, project)).toBe(true);
    expect(needsNewVersion(survey, { ...draft, boundary: null }, project)).toBe(true);
    const sites = {
      ...draft,
      context: [...CONTEXT.slice(0, 2), { id: 'main_site' as const, options: ['North office'] }],
    };
    expect(needsNewVersion(survey, sites, project)).toBe(true);
    const next = updateSurvey(survey, fewer, project, LATER);
    expect(next.versions).toHaveLength(2);
    // The attributes stay the same across versions.
    expect(currentVersion(next).context?.map((q) => q.attribute)).toStrictEqual([
      'working_pattern',
      'main_site',
    ]);
  });

  it('refuses a site list outside 2 to 8 answers and a boundary list outside 1 to 6', () => {
    const project = demoProject();
    const one = draftFor(project, { context: [{ id: 'main_site', options: ['Only'] }] });
    expect(draftProblems(one, project)).toContain('siteOptions');
    const none = draftFor(project, { boundary: [] });
    expect(draftProblems(none, project)).toContain('boundaryFunctions');
    const many = draftFor(project, { boundary: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
    expect(draftProblems(many, project)).toContain('boundaryFunctions');
    expect(
      draftProblems(draftFor(project, { context: CONTEXT, boundary: BOUNDARY }), project),
    ).toStrictEqual([]);
    expect(textLines(' A \n\na\nB ')).toStrictEqual(['A', 'B']);
  });

  it('offers every item with fixed answers, and the analyst’s sites plus “Somewhere else”', () => {
    expect(CONTEXT_ITEMS.map((i) => i.id)).toStrictEqual([
      'time_in_role',
      'working_pattern',
      'working_hours',
      'main_site',
    ]);
    expect(
      contextOptions({ id: 'main_site', options: ['X', 'Y'] }).map((o) => o.label),
    ).toStrictEqual(['X', 'Y', 'Somewhere else']);
  });
});

describe('boundary question', () => {
  it('stores the bands on the log and counts them in Check the data, by group', async () => {
    const { project, survey, privateKey } = await setup();
    const { project: after } = await importBodies(project, survey, privateKey, [
      bodyFor(survey, 'FIN02', {
        context: { consent: false, answers: {} },
        boundary: ['3_5', 'none'],
      }),
      bodyFor(survey, 'FIN03', {
        context: { consent: false, answers: {} },
        boundary: ['3_5', '1_2'],
      }),
      bodyFor(survey, 'SAL01', {
        context: { consent: false, answers: {} },
        boundary: ['over_10', 'none'],
      }),
      // A band the format does not know is not stored.
      bodyFor(survey, 'SAL02', {
        context: { consent: false, answers: {} },
        boundary: ['lots', 'none'],
      }),
    ]);
    const entry = after.surveys[0]?.log.find(
      (e) => e.kind === 'accepted' && e.member_id === 'FIN02',
    );
    expect(entry?.kind === 'accepted' && entry.boundary).toStrictEqual({
      functions: BOUNDARY,
      bands: ['3_5', 'none'],
    });
    const b = computeBoundary(after);
    expect(b?.functions).toStrictEqual(BOUNDARY);
    expect(b?.responded).toBe(4);
    expect(b?.answered).toBe(3);
    expect(b?.overall[0]).toStrictEqual([0, 0, 2, 0, 1]);
    expect(b?.overall[1]).toStrictEqual([2, 1, 0, 0, 0]);
    const finance = b?.groups?.rows.find((r) => r.value === 'Finance');
    expect(finance?.respondents).toBe(2);
    expect(finance?.counts[0]).toStrictEqual([0, 0, 2, 0, 0]);
    expect(b?.groups?.attribute).toBe('team');
    // A project whose surveys do not ask has no section.
    expect(computeBoundary(demoProject())).toBeNull();
    // The other checks still run with the context attributes in the project.
    expect(computeQuality(after).members).toBe(after.members.length);
  });
});

describe('formats', () => {
  it('writes format 2 links and packages and reads the questions back', async () => {
    const { project, survey } = await setup();
    const links = await buildLinks(survey, project, BASE);
    const link = links.links[0];
    if (!link) throw new Error('no link');
    const read = await readLink(new URL(link.url).hash.slice('#/respond/'.length));
    expect(read.payload.context).toStrictEqual([
      { id: 'time_in_role' },
      { id: 'working_pattern' },
      { id: 'main_site', options: ['North office', 'South office'] },
    ]);
    expect(read.payload.boundary).toStrictEqual(BOUNDARY);
    // The attribute keys are the analyst's business, not the respondent's.
    expect(link.url).not.toContain('time_in_role_');
    const pkg = await makePackage(payloadFor(survey, currentVersion(survey), project));
    expect(JSON.parse(pkg.text)).toMatchObject({ v: 2 });
  });

  it('still reads a format 1 link and package, as asking neither question', async () => {
    const { project, survey } = await setup({ context: [], boundary: null });
    const links = await buildLinks(survey, project, BASE);
    const encoded = new URL(links.links[0]?.url ?? '').hash.slice('#/respond/'.length);
    const json = JSON.parse(fromUtf8(await inflate(fromBase64Url(encoded)))) as unknown[];
    expect(json[0]).toBe(2);
    expect(json).toHaveLength(22);
    // Format 1 as written before session 12: 20 fields, version first.
    const v1 = [1, ...json.slice(1, 20)];
    const v1Encoded = toBase64Url(await deflate(utf8(JSON.stringify(v1))));
    const read = await readLink(v1Encoded);
    expect(read.payload.context).toStrictEqual([]);
    expect(read.payload.boundary).toBeNull();
    expect(read.payload.title).toBe(survey.title);

    const noPersonal = [...v1.slice(0, 18), null, null];
    const pkgEncoded = toBase64Url(await deflate(utf8(JSON.stringify(noPersonal))));
    const fingerprint = toBase64Url((await sha256(utf8(pkgEncoded))).slice(0, 16));
    const text = JSON.stringify({ format: 'graticule-survey', v: 1, survey: pkgEncoded });
    const payload = await readPackage(text, {
      surveyId: survey.id,
      personal: { position: 0, token: 'x' },
      fingerprint,
    });
    expect(payload.context).toStrictEqual([]);
    // A format the page does not know is refused.
    const v3 = toBase64Url(await deflate(utf8(JSON.stringify([3, ...json.slice(1)]))));
    await expect(readLink(v3)).rejects.toThrow();
  });

  it('still decrypts and imports a version 1 response', async () => {
    const { project, survey, privateKey } = await setup({ context: [], boundary: null });
    const body = bodyFor(survey, 'FIN02');
    // A version 1 envelope as written before session 12: its own AAD string.
    const header = { survey_id: survey.id, version: body.version, kid: survey.key.fingerprint };
    const sealed = await seal(
      survey.key.public_key,
      aadFor({ ...header, v: 1 }),
      await deflate(utf8(JSON.stringify(body))),
    );
    const v1: Envelope = { format: RESPONSE_FORMAT, v: 1, ...header, ...sealed };
    expect(new TextDecoder().decode(aadFor({ ...header, v: 1 }))).toContain(
      'graticule-response/1|',
    );
    expect(await decryptResponse(privateKey, v1)).toStrictEqual(body);
    const plan = await planImport(
      project,
      survey,
      privateKey,
      fileTransport.collect([{ source: 'old', text: armour(v1) }]),
    );
    expect(plan.accepted).toHaveLength(1);
    expect(plan.ties.length).toBeGreaterThan(0);
    // A version 2 envelope relabelled as version 1 fails its integrity check.
    const v2 = await encryptResponse(body, survey.key.public_key, survey.key.fingerprint);
    expect(v2.v).toBe(2);
    await expect(decryptResponse(privateKey, { ...v2, v: 1 })).rejects.toThrow();
  });
});

describe('estimate and guidance', () => {
  it('adds 10 seconds a context question and 5 seconds a boundary group', () => {
    expect(extraSeconds(3, 2)).toBe(40);
    expect(estimateSeconds(40, 4, 'full', 12, 0, 40) - estimateSeconds(40, 4, 'full', 12)).toBe(40);
  });

  it('counts the respondents a coverage threshold needs', () => {
    expect(respondentsNeeded(40, 0.8)).toBe(32);
    expect(respondentsNeeded(41, 0.8)).toBe(33);
    expect(respondentsNeeded(10, 1)).toBe(10);
  });
});

describe('launch kit', () => {
  const help = readFileSync(join(__dirname, '../../docs/respondent-help.md'), 'utf8');
  const input = (patch: Partial<KitInput> = {}): KitInput => ({
    title: 'How we work',
    introduction: 'We want to understand how work moves between teams.',
    confidentiality: 'Only the survey team sees individual answers.',
    returnInstructions: 'Email the response to survey@example.org.',
    deadline: '2026-11-14',
    minutes: 9,
    members: 40,
    needed: 32,
    threshold: 0.8,
    entry: 'nominate',
    questions: ['Connection strength', 'Advice'],
    context: ['Where do you usually work?'],
    boundary: ['Customers or clients'],
    packageFile: null,
    respondentHelp: help,
    ...patch,
  });

  it('drafts the seven documents from the survey’s settings', () => {
    const docs = launchKit(input());
    expect(docs.map((d) => d.id)).toStrictEqual([
      'announcement',
      'invitation',
      'reminder-1',
      'reminder-2',
      'help',
      'confidentiality',
      'dpia',
    ]);
    const text = (id: string) => docs.find((d) => d.id === id)?.text ?? '';
    expect(text('announcement')).toContain('How we work');
    expect(text('announcement')).toContain('14 November 2026');
    expect(text('invitation')).toContain('[Name]');
    expect(text('invitation')).toContain('[Link]');
    expect(text('invitation')).toContain('Email the response to survey@example.org.');
    expect(text('invitation')).toContain('connection strength and advice');
    expect(text('invitation')).toMatch(/optional questions ask about your own work/);
    expect(text('reminder-1')).toContain('at least 32 of the 40 people asked (80%)');
    expect(text('confidentiality')).toContain('Only the survey team sees individual answers.');
    expect(text('dpia')).toContain('[ ]');
    expect(text('dpia')).toContain('Where do you usually work?');
    expect(text('help')).toContain('Help for respondents');
    expect(text('help')).not.toMatch(/^#/m);
    for (const d of docs) {
      expect(d.text).not.toMatch(/anonym/i);
      expect(d.text.endsWith('\n')).toBe(true);
    }
  });

  it('names the survey file when links need one, and leaves out questions not asked', () => {
    const docs = launchKit(
      input({ packageFile: 'graticule-survey-X-v1.graticule-survey', context: [], boundary: [] }),
    );
    const invitation = docs.find((d) => d.id === 'invitation')?.text ?? '';
    expect(invitation).toContain('graticule-survey-X-v1.graticule-survey');
    expect(invitation).not.toMatch(/outside the list/);
    expect(invitation).not.toMatch(/optional questions/);
    expect(launchKit(input({ deadline: null }))[0]?.text).toContain('[date]');
  });

  it('names no member of the project', async () => {
    const { project, survey } = await setup();
    const v = currentVersion(survey);
    const docs = launchKit(input({ title: survey.title, questions: v.layers.map((l) => l.label) }));
    for (const m of project.members)
      for (const d of docs) expect(d.text).not.toContain(m.display_name);
  });

  it('turns the help page into plain text', () => {
    expect(plainText('## Heading\n\nUse `code` and **bold**.')).toBe(
      'Heading\n\nUse code and bold.',
    );
  });
});
