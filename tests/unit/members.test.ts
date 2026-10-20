import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/data/defaults';
import {
  addAttribute,
  addMembers,
  nextMemberIds,
  parseNameList,
  refreshCategories,
  removalImpact,
  removeMembers,
  renameAttribute,
  updateMember,
} from '../../src/data/members';
import { parseProject, serialiseProject } from '../../src/data/projectFile';
import type { Project } from '../../src/data/schema';

const NOW = '2026-10-20T09:00:00.000Z';
const demo = (): Project =>
  parseProject(
    readFileSync(join(import.meta.dirname, '..', '..', 'src', 'demo', 'demo.ona.json'), 'utf8'),
  );
const empty = () => createProject('Roster', NOW);
const roundTrip = (p: Project) => parseProject(serialiseProject(p));

describe('building a roster (D124)', () => {
  it('reads one name per line, trimmed, and only the first cell of a pasted row', () => {
    expect(parseNameList('  Ada Meridian \r\n\nBram Contour\tFinance\n\t\n Cleo Bearing')).toEqual([
      'Ada Meridian',
      'Bram Contour',
      'Cleo Bearing',
    ]);
  });

  it('adds members with generated ids and every attribute not recorded', () => {
    const p = addMembers(empty(), [{ name: ' Ada ' }, { name: '' }, { name: 'Bram' }]);
    expect(p.members.map((m) => [m.id, m.display_name])).toEqual([
      ['m001', 'Ada'],
      ['m002', 'Bram'],
    ]);
    expect(Object.values(p.members[0]?.attributes ?? {}).every((v) => v === null)).toBe(true);
    expect(Object.keys(p.members[0]?.attributes ?? {})).toEqual(
      p.attribute_definitions.map((a) => a.key),
    );
    // The result is a valid project file.
    expect(roundTrip(p).members).toEqual(p.members);
  });

  it('never reuses an id, and continues after the highest generated id', () => {
    let p = addMembers(empty(), [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
    p = removeMembers(p, ['m002']);
    expect(nextMemberIds(p, 2)).toEqual(['m004', 'm005']);
    // Imported ids that look generated are skipped too.
    expect(nextMemberIds(demo(), 1)).toEqual(['m001']);
  });

  it('returns the project unchanged when nothing is added or changed', () => {
    const p = addMembers(empty(), [{ name: 'Ada' }]);
    expect(addMembers(p, [{ name: '  ' }])).toBe(p);
    expect(updateMember(p, 'm001', { name: 'Ada' })).toBe(p);
    expect(updateMember(p, 'm001', { name: '   ' })).toBe(p);
    expect(updateMember(p, 'nobody', { name: 'X' })).toBe(p);
  });

  it('updates names and attributes, trimming and storing blanks as not recorded', () => {
    let p = addMembers(empty(), [{ name: 'Ada' }, { name: 'Bram' }]);
    p = updateMember(p, 'm001', { name: 'Ada Meridian', attributes: { team: ' Finance ' } });
    p = updateMember(p, 'm002', { attributes: { team: 'Sales', manager_id: 'm001' } });
    expect(p.members[0]).toMatchObject({
      display_name: 'Ada Meridian',
      attributes: { team: 'Finance' },
    });
    expect(p.members[1]?.attributes.manager_id).toBe('m001');
    p = updateMember(p, 'm001', { attributes: { team: '  ' } });
    expect(p.members[0]?.attributes.team).toBeNull();
    expect(roundTrip(p).members).toEqual(p.members);
  });

  it('refuses a manager who is the member or not in the project', () => {
    let p = addMembers(empty(), [{ name: 'Ada' }, { name: 'Bram' }]);
    p = updateMember(p, 'm001', { attributes: { manager_id: 'm001' } });
    expect(p.members[0]?.attributes.manager_id).toBeNull();
    const before = p;
    p = updateMember(p, 'm001', { attributes: { manager_id: 'ghost' } });
    expect(p).toBe(before);
  });

  it('keeps the order of known categories and adds new values at the end', () => {
    const project = demo();
    const tenure = project.attribute_definitions.find((a) => a.key === 'tenure_band');
    const id = project.members[0]?.id ?? '';
    const p = updateMember(project, id, { attributes: { tenure_band: 'Over 10 years' } });
    const next = p.attribute_definitions.find((a) => a.key === 'tenure_band');
    expect(next?.categories).toEqual([...(tenure?.categories ?? []), 'Over 10 years']);
    // Definitions that do not change keep their identity.
    expect(p.attribute_definitions.find((a) => a.key === 'team')).toBe(
      project.attribute_definitions.find((a) => a.key === 'team'),
    );
    expect(refreshCategories(project.attribute_definitions, project.members)).toEqual(
      project.attribute_definitions,
    );
  });

  it('removes a member with their ratings and any manager reference to them', () => {
    const project = demo();
    const manager = project.members.find((m) =>
      project.members.some((r) => r.attributes.manager_id === m.id),
    );
    expect(manager).toBeDefined();
    const id = manager?.id ?? '';
    const impact = removalImpact(project, [id]);
    const ratings = project.ties.filter((t) => t.rater_id === id || t.ratee_id === id).length;
    const reports = project.members.filter((m) => m.attributes.manager_id === id).length;
    expect(impact).toEqual({ ratings, reports, surveys: [] });
    expect(ratings).toBeGreaterThan(0);

    const p = removeMembers(project, [id]);
    expect(p.members).toHaveLength(project.members.length - 1);
    expect(p.ties).toHaveLength(project.ties.length - ratings);
    expect(p.ties.some((t) => t.rater_id === id || t.ratee_id === id)).toBe(false);
    expect(p.members.some((m) => m.attributes.manager_id === id)).toBe(false);
    // Saved views may still name the member: restoring drops unknown ids (D76).
    expect(() => roundTrip(p)).not.toThrow();
    expect(removeMembers(p, [id])).toBe(p);
  });

  it('names the surveys whose roster includes a member being removed', () => {
    const project = demo();
    const id = project.members[0]?.id ?? '';
    const withSurvey = {
      ...project,
      surveys: [
        {
          title: 'Spring survey',
          versions: [{ roster: [id, project.members[1]?.id ?? ''] }],
        },
      ],
    } as unknown as Project;
    expect(removalImpact(withSurvey, [id]).surveys).toEqual(['Spring survey']);
    expect(removalImpact(withSurvey, ['nobody']).surveys).toEqual([]);
  });

  it('adds attributes with import-style keys, and at most one email attribute', () => {
    let p = addMembers(empty(), [{ name: 'Ada' }]);
    p = addAttribute(p, 'Project team', 'categorical');
    p = addAttribute(p, 'project-team', 'ordinal');
    p = addAttribute(p, 'Work email', 'email');
    const before = p;
    p = addAttribute(p, 'Other email', 'email');
    expect(p).toBe(before);
    expect(addAttribute(p, '  ', 'categorical')).toBe(p);
    const added = p.attribute_definitions.slice(-3).map((a) => [a.key, a.label, a.type]);
    expect(added).toEqual([
      ['project_team', 'Project team', 'categorical'],
      ['project_team_2', 'project-team', 'ordinal'],
      ['email', 'Work email', 'email'],
    ]);
    expect(p.members[0]?.attributes).toMatchObject({ project_team: null, email: null });
    expect(roundTrip(p).attribute_definitions).toEqual(p.attribute_definitions);
  });

  it('renames an attribute label and keeps its key', () => {
    const p = renameAttribute(empty(), 'team', 'Department');
    expect(p.attribute_definitions.find((a) => a.key === 'team')?.label).toBe('Department');
    expect(renameAttribute(p, 'team', ' ')).toBe(p);
    expect(renameAttribute(p, 'nothing', 'X')).toBe(p);
  });
});
