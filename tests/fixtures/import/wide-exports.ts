// Survey tools' wide exports for the import wizard (build plan session 13):
// one row per respondent, one column per colleague and question. Kept as
// TypeScript strings rather than .csv files, as the seeded validation files
// are (CLAUDE.md D34), so .gitignore's participant-data rule needs no
// exception. The people are fictional.
//
// Row numbers are spreadsheet rows: the first header is row 1.

/** The roster the exports name. Two members share the name Sam Lee; one team
 *  is written "finance" once, to be reconciled with "Finance". */
export const wideRosterCsv = [
  'id,display_name,team,email',
  'W01,Ada Example,Finance,ada.example@example.org',
  'W02,Bram Example,Finance,bram@example.org',
  'W03,Zoë Hart,Sales,zoe@example.org',
  'W04,Sam Lee,Sales,sam.lee@example.org',
  'W05,Sam Lee,People,s.lee@example.org',
  'W06,Chiara Conti,finance ,chiara@example.org',
].join('\n');

const strength = 'How strong is your working connection with this person?';
const valence = 'Overall, how positive or negative is your working relationship with this person?';

/** One header row, colleagues in brackets, answers as numbers and labels. */
export const bracketExportCsv = [
  // 1: A Timestamp, B Email address, C–G strength, H–I valence
  [
    'Timestamp',
    'Email address',
    `${strength} [Ada Example]`,
    `${strength} [Bram Example]`,
    `${strength} [Zoe Hart]`, // suggested: the accent is missing
    `${strength} [Sam Lee]`, // ambiguous: two members
    `${strength} [Chiara Conti]`,
    `"${valence} [Ada Example]"`,
    `"${valence} [Bram Example]"`,
  ].join(','),
  '2026-10-01 09:00,bram@example.org,4,,3,2,5,Very positive,', // 2: W02 by email
  '2026-10-01 09:05,ADA.EXAMPLE@example.org,,3,2,,1,,Neutral', // 3: W01 ignoring case
  '2026-10-01 09:10,Chiara Conti,5,9,,,,+1,', // 4: W06 by name; 9 is out of range
  '2026-10-01 09:20,unknown@example.org,1,1,1,1,1,,', // 5: not in the roster
].join('\n');

/** Two header rows: the question over blank cells, colleagues below. */
export const twoRowExportCsv = [
  'Respondent ID,Your email,How often do you collaborate with this person outside formal roles?,,', // 1
  ',,Ada Example,Bram Example,Zoë Hart', // 2
  '1001,bram@example.org,Weekly,Daily,Never', // 3: Bram rates himself
  '1002,zoe@example.org,Monthly,,', // 4
].join('\n');

/** Question codes, then the full texts, then a row of import ids. */
export const codedExportCsv = [
  'StartDate,RecipientEmail,Q1_1,Q1_2,Q1_3', // 1
  `Start Date,Recipient Email,${strength} - Ada Example,${strength} - Bram Example,${strength} - Chiara Conti`, // 2
  '"{""ImportId"":""startDate""}","{""ImportId"":""recipientEmail""}","{""ImportId"":""QID1_1""}","{""ImportId"":""QID1_2""}","{""ImportId"":""QID1_3""}"', // 3
  '2026-10-01,ada.example@example.org,,2,4', // 4
].join('\n');

/** Two rows from the same respondent: both are left out. */
export const duplicateRespondentCsv = [
  `Email,${strength} [Ada Example],${strength} [Bram Example]`,
  'chiara@example.org,2,3',
  'zoe@example.org,1,1',
  'Chiara@example.org,4,4',
].join('\n');
