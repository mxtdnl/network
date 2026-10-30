import { useWaveProject } from '../state/waves';
import { useId, useMemo } from 'react';
import { MIN_GROUP_SIZE_FLOOR, type AudienceLevel, AUDIENCE_LEVELS } from '../../data/schema';
import { audienceCopy as A } from '../copy/audience';
import { mapCopy } from '../copy/map';
import { leadershipRoles } from '../state/audience';
import {
  setAudienceLevel,
  setMemberNamed,
  setMinGroupSize,
  setTeamNamed,
} from '../state/audienceActions';
import {
  audienceChoice,
  audienceSettings,
  teamAttribute,
  teamNamed,
  workshopTeams,
} from '../state/audienceSettings';
import { useReadOnly } from '../state/layoutMode';
import { useMemberNames } from '../state/names';
import { useAppStore } from '../state/store';

/**
 * Who presentation mode and the exports are prepared for (build plan session
 * 9): the level, saved in the project as its default, and the team or member
 * it concerns. The full form (Export dialog, Views tab) also holds the
 * smallest group shown and who agreed to be named; in presentation mode only
 * the level and the team are offered, so no member's name enters the page
 * beyond what the level shows.
 */
export function AudienceSelect({ variant = 'full' }: { variant?: 'full' | 'presentation' }) {
  const project = useAppStore((s) => s.data.project);
  const scoped = useWaveProject();
  const chosen = useAppStore((s) => s.ui.audience);
  const setAudience = useAppStore((s) => s.setAudience);
  const insights = useAppStore((s) => s.results.current?.insights);
  const names = useMemberNames();
  const phone = useReadOnly();
  const ids = {
    level: useId(),
    help: useId(),
    team: useId(),
    member: useId(),
    size: useId(),
    sizeHelp: useId(),
    roles: useId(),
  };
  const roles = useMemo(() => leadershipRoles(insights ?? []), [insights]);
  if (!project) return null;
  const settings = audienceSettings(project);
  const choice = audienceChoice(project, chosen);
  const level = choice.level;
  const teams = workshopTeams(project);
  const attr = teamAttribute(project);
  const full = variant === 'full';
  const min = settings.min_group_size;
  const help = level === 'board' || level === 'leadership' ? A.help[level](min) : A.help[level];
  const holders = [...new Set(roles.map((r) => r.member))];

  return (
    <div className={`audience audience--${variant}`}>
      <div className="field">
        <label htmlFor={ids.level} className="field__label">
          {A.label}
        </label>
        <select
          id={ids.level}
          className="select"
          value={level}
          aria-describedby={full ? ids.help : undefined}
          onChange={(e) => {
            setAudienceLevel(e.currentTarget.value as AudienceLevel);
          }}
        >
          {AUDIENCE_LEVELS.map((l) => (
            <option key={l} value={l}>
              {A.levels[l]}
            </option>
          ))}
        </select>
        {full && (
          <p id={ids.help} className="field__help">
            {help}
          </p>
        )}
      </div>

      {level === 'workshop' && attr && teams.length > 0 && (
        <div className="field">
          <label htmlFor={ids.team} className="field__label">
            {attr.label}
          </label>
          <select
            id={ids.team}
            className="select"
            value={choice.team ?? ''}
            onChange={(e) => {
              setAudience({ team: e.currentTarget.value });
            }}
          >
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {full && !phone && choice.team !== null && (
            <label className="radio-list__option audience__consent">
              <input
                type="checkbox"
                checked={teamNamed(project, choice.team)}
                onChange={(e) => {
                  if (choice.team !== null) setTeamNamed(choice.team, e.currentTarget.checked);
                }}
              />
              <span>{A.teamNamed(choice.team)}</span>
            </label>
          )}
          {full && <p className="field__help">{A.teamNamedHelp}</p>}
        </div>
      )}

      {level === 'oneToOne' && full && (
        <div className="field">
          <label htmlFor={ids.member} className="field__label">
            {A.member}
          </label>
          <select
            id={ids.member}
            className="select"
            value={choice.member ?? ''}
            onChange={(e) => {
              setAudience({ member: e.currentTarget.value });
            }}
          >
            {/* The card reads the wave analysed, so the members on its roster (build plan session 14). */}
            {(scoped ?? project).members.map((m) => (
              <option key={m.id} value={m.id}>
                {names.of(m.id)}
              </option>
            ))}
          </select>
        </div>
      )}

      {(level === 'board' || level === 'leadership') && full && !phone && (
        <div className="field">
          <label htmlFor={ids.size} className="field__label">
            {A.minGroupSize}
          </label>
          <input
            id={ids.size}
            type="number"
            className="text-input text-input--number"
            min={MIN_GROUP_SIZE_FLOOR}
            step={1}
            defaultValue={min}
            key={min}
            aria-describedby={ids.sizeHelp}
            onBlur={(e) => {
              setMinGroupSize(Number(e.currentTarget.value));
            }}
          />
          <p id={ids.sizeHelp} className="field__help">
            {A.minGroupSizeHelp(MIN_GROUP_SIZE_FLOOR)}
          </p>
        </div>
      )}

      {level === 'leadership' && full && !phone && (
        <fieldset className="audience__roles" aria-describedby={ids.roles}>
          <legend className="field__label">{A.rolesHeading}</legend>
          <p id={ids.roles} className="field__help">
            {holders.length > 0 ? A.rolesHelp : A.noRoles}
          </p>
          {insights === undefined && <p className="field__help">{mapCopy.calculating}</p>}
          {holders.map((id) => (
            <label key={id} className="radio-list__option">
              <input
                type="checkbox"
                checked={settings.named_members.includes(id)}
                onChange={(e) => {
                  setMemberNamed(id, e.currentTarget.checked);
                }}
              />
              <span>{A.roleNamed(names.of(id))}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
