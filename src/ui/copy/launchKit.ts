// The launch kit (build plan session 12, CLAUDE.md D183): drafts of every
// message a survey needs, built from its settings, for the analyst to adapt
// and send. Plain text with the parts to fill in square brackets. The kit
// names no member: the invitation is a mail-merge template.

import { percent } from './data';

export interface KitInput {
  title: string;
  introduction: string;
  confidentiality: string;
  returnInstructions: string;
  /** YYYY-MM-DD, or null. */
  deadline: string | null;
  minutes: number;
  members: number;
  /** Respondents needed to reach the coverage threshold. */
  needed: number;
  threshold: number;
  entry: 'nominate' | 'full';
  /** Short names of the questions asked about each colleague. */
  questions: string[];
  /** Wording of the context questions asked. */
  context: string[];
  /** Groups the boundary question asks about; empty when it is not asked. */
  boundary: string[];
  /** The shared survey file, when links need one. */
  packageFile: string | null;
  /** docs/respondent-help.md. */
  respondentHelp: string;
}

export interface KitDocument {
  id:
    | 'announcement'
    | 'invitation'
    | 'reminder-1'
    | 'reminder-2'
    | 'help'
    | 'confidentiality'
    | 'dpia';
  title: string;
  description: string;
  text: string;
}

export const launchKitCopy = {
  heading: 'Launch kit',
  intro:
    'Drafts of each message, built from this survey’s settings. Each is a text file: replace the parts in square brackets, adapt the wording, and send them in this order.',
  noNames: 'The drafts name no one. The invitation is a mail-merge template for the links export.',
  download: 'Download',
  downloadLabel: (title: string) => `Download ${title.toLowerCase()}`,
  preview: 'Show the text',
  downloaded: (file: string) => `Downloaded ${file}`,
};

function formatDate(iso: string | null): string {
  if (!iso) return '[date]';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const minutes = (m: number) => `${String(m)} ${m === 1 ? 'minute' : 'minutes'}`;
const note = (text: string) => `[Note for you, not for sending: ${text}]`;
const join = (parts: (string | false | null | undefined)[]) =>
  `${parts.filter((p): p is string => typeof p === 'string' && p !== '').join('\n\n')}\n`;

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/** Plain text from the help page's Markdown: headings without marks, no code marks. */
export function plainText(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) =>
      line
        .replace(/^#+\s+/, '')
        .replace(/`/g, '')
        .replace(/\*\*/g, ''),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function whatYouAreAsked(k: KitInput): string {
  const lines = [
    k.entry === 'nominate'
      ? `You first select the colleagues you work with, then answer ${k.questions.length === 1 ? 'one question' : `${String(k.questions.length)} questions`} about each of them: ${list(k.questions.map((q) => q.toLowerCase()))}.`
      : `You answer ${k.questions.length === 1 ? 'one question' : `${String(k.questions.length)} questions`} about each colleague on the list: ${list(k.questions.map((q) => q.toLowerCase()))}.`,
  ];
  if (k.boundary.length > 0)
    lines.push(
      'One question asks roughly how many people outside the list you rely on to get your work done.',
    );
  if (k.context.length > 0)
    lines.push(
      'A few optional questions ask about your own work, such as where you usually work. You choose whether your answers to them are stored.',
    );
  return lines.join(' ');
}

const confidentialLine =
  'Your answers are confidential, and they carry your name. The people running the survey see which ratings you gave, because mapping how people work together needs to know who each rating came from. The results describe how we work together; they are not used to assess anyone’s performance.';

export function launchKit(k: KitInput): KitDocument[] {
  const deadline = formatDate(k.deadline);
  const target = `at least ${String(k.needed)} of the ${String(k.members)} people asked (${percent(k.threshold)})`;
  const linkLine = k.packageFile
    ? `Your personal link: [Link]\n\nThe link works with the survey file attached to this email, ${k.packageFile}. Save the file, open your link, and choose the file when the page asks for it. On an iPhone or iPad, touch and hold the attachment in Mail and choose Save to Files; on Android, download the attachment.`
    : 'Your personal link: [Link]';

  return [
    {
      id: 'announcement',
      title: 'Sponsor’s announcement',
      description: 'From the sponsor, about a week before the links go out.',
      text: join([
        note(
          'send this from the sponsor, a senior person the participants know, about a week before the links. Delete the sentence about time set aside if you have not arranged it.',
        ),
        `Subject: ${k.title}: a survey about how we work together`,
        'Dear colleagues,',
        `In the coming weeks we are running a short survey, ${k.title}, to understand how we work together: who people go to for information and help, and how work moves between teams.`,
        k.introduction.trim(),
        `Each of you will receive a personal link from [name of the person or team running the survey] on [date]. The survey takes about ${minutes(k.minutes)}, and the deadline is ${deadline}. We have set aside [time] on [date] so that everyone can answer in working hours.`,
        confidentialLine,
        `Taking part is your choice. I hope you will: the picture is complete only when most people respond.`,
        '[Sponsor’s name]\n[Role]',
      ]),
    },
    {
      id: 'invitation',
      title: 'Invitation',
      description: 'To each person, with their own link (mail merge).',
      text: join([
        note(
          `send one email per person with your email program’s mail merge, from the links export: [Name] is its name column and [Link] its link column.${k.packageFile ? ` Attach the survey file, ${k.packageFile}, to every email.` : ''} Attach the respondent help as well.`,
        ),
        `Subject: Your link to ${k.title}`,
        'Dear [Name],',
        k.introduction.trim(),
        linkLine,
        `It takes about ${minutes(k.minutes)}. Please respond by ${deadline}. Your answers are saved on your device as you go, so you can stop and return through the same link.`,
        whatYouAreAsked(k),
        `When you finish, your answers are encrypted on your device, and you send them back yourself: ${k.returnInstructions.trim()}`,
        confidentialLine,
        'The link is personal: please do not forward it. The attached help page answers common questions.',
        'Thank you,\n[Your name]',
      ]),
    },
    {
      id: 'reminder-1',
      title: 'First reminder',
      description: 'About halfway to the deadline, to those who have not responded.',
      text: join([
        note(
          `send to the non-responders export, about halfway to the deadline. A complete picture needs ${target}.`,
        ),
        `Subject: Reminder: ${k.title}`,
        'Dear [Name],',
        `A reminder that ${k.title} is open until ${deadline}. It takes about ${minutes(k.minutes)}, and every response makes the picture more complete.`,
        linkLine,
        `If you have started, the same link takes you back to your answers. If you have already sent your answers, thank you, and please ignore this message.`,
        'Thank you,\n[Your name]',
      ]),
    },
    {
      id: 'reminder-2',
      title: 'Final reminder',
      description: 'Two or three days before the deadline, to those who have not responded.',
      text: join([
        note(
          `send to a fresh non-responders export two or three days before the deadline. A complete picture needs ${target}.`,
        ),
        `Subject: Last days to respond: ${k.title}`,
        'Dear [Name],',
        `${k.title} closes on ${deadline}. If you can spare about ${minutes(k.minutes)} before then, your answers will make the results more complete for everyone.`,
        linkLine,
        `When you finish, send your answers back as follows: ${k.returnInstructions.trim()}`,
        'If you have already sent your answers, thank you, and please ignore this message.',
        'Thank you,\n[Your name]',
      ]),
    },
    {
      id: 'help',
      title: 'Respondent help',
      description: 'One page for participants, to attach to the invitation.',
      text: `${plainText(k.respondentHelp)}\n`,
    },
    {
      id: 'confidentiality',
      title: 'Confidentiality statement',
      description: 'What is collected, who sees it and how it is kept.',
      text: join([
        note(
          'check each part against your organisation’s arrangements before you send or publish it.',
        ),
        `${k.title}: confidentiality statement`,
        k.confidentiality.trim(),
        `What is collected. Your name, and your answers about colleagues on the list: ${list(k.questions.map((q) => q.toLowerCase()))}.${k.boundary.length > 0 ? ' Roughly how many people outside the list you rely on, by group.' : ''}${k.context.length > 0 ? ' Answers to the optional questions about your own work, only if you agree to their being stored.' : ''}`,
        `Who sees it. ${confidentialLine} [Name the people or team who see individual answers, and who sees the results.]`,
        'How it is kept. Your answers are encrypted on your device before you send them, and only the survey team can open them. They are then kept in the survey project, [say where and for how long]. The emails and files that carried them are deleted once they have been imported.',
        'Your choices. Taking part is your choice. You can ask to see the answers you gave, or to have them removed, by writing to [contact].',
        '[Contact for questions: name and email address]',
      ]),
    },
    {
      id: 'dpia',
      title: 'Data protection impact assessment checklist',
      description: 'Points to settle with your data protection adviser before launch.',
      text: join([
        'Data protection impact assessment: checklist',
        `Survey: ${k.title}. People asked: ${String(k.members)}.`,
        note(
          'this is a prompt for the questions an assessment usually covers, not legal advice. Settle each point with your data protection adviser, and with employee representatives where they must be consulted.',
        ),
        [
          'Purpose and basis',
          '[ ] The purpose of the survey and how the results will be used are written down.',
          '[ ] The lawful basis for processing named ratings is identified.',
          '[ ] Why names are needed is recorded: a whole-network survey must know who each rating came from.',
          '[ ] The results will not be used to assess individuals’ performance, and the sponsor has agreed to this in writing.',
        ].join('\n'),
        [
          'What is collected',
          `[ ] Ratings of colleagues: ${list(k.questions.map((q) => q.toLowerCase()))}. Each question has been checked for necessity.`,
          k.questions.length > 5 &&
            '[ ] More than five questions are asked: each extra question has a stated reason.',
          k.context.length > 0 &&
            `[ ] Optional questions about respondents’ own work: ${list(k.context)}. Answers are stored only with consent; the reason for each is recorded.`,
          k.boundary.length > 0 &&
            '[ ] Counts of people outside the list each respondent relies on (no names).',
          '[ ] Email addresses are used only to send links and reminders.',
        ]
          .filter((l): l is string => typeof l === 'string')
          .join('\n'),
        [
          'Who sees what',
          '[ ] The people who see individual answers are named.',
          '[ ] Results for senior audiences are prepared at group level, with groups below the minimum size pooled.',
          '[ ] Names are hidden in shared material unless the people shown have agreed.',
        ].join('\n'),
        [
          'Security and retention',
          '[ ] The survey passphrase and the key backup are stored apart from the project file.',
          '[ ] Where the project file is kept, and who can open it, is decided.',
          '[ ] Response files and the emails that carried them are deleted after import.',
          '[ ] A date for deleting the named data is set.',
        ].join('\n'),
        [
          'People’s rights and communication',
          '[ ] Participants receive the confidentiality statement and the respondent help before they answer.',
          '[ ] Participants know how to ask to see or remove their answers.',
          '[ ] Employee representatives have been consulted where required.',
          '[ ] Risks to individuals (being identified in small groups, results used against someone) are listed with how each is reduced.',
        ].join('\n'),
      ]),
    },
  ];
}

export const kitFileName = (surveyId: string, id: KitDocument['id']) =>
  `graticule-${id}-${surveyId}.txt`;
