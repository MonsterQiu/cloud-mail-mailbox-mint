import { passwordLength } from './validation.js';

const NAMES = ['milo', 'nora', 'ellis', 'adrian', 'clara', 'ethan', 'ada', 'alina', 'alice', 'amber', 'amos', 'anya', 'aria', 'arlo', 'aspen', 'ava', 'blair', 'cora', 'dana', 'dario', 'dylan', 'eden', 'elena', 'elio', 'emma', 'eric', 'eva', 'felix', 'finn', 'flora', 'hanna', 'hazel', 'hugo', 'iris', 'isla', 'ivan', 'jade', 'jona', 'jules', 'kai', 'lara', 'leo', 'liam', 'lina', 'luca', 'luna', 'maia', 'mira', 'noel', 'nova', 'oliver', 'oscar', 'owen', 'quinn', 'remy', 'riley', 'robin', 'rose', 'rowan', 'sasha', 'simon', 'theo', 'vera', 'zoe'];
const SECOND_NAMES = ['arden', 'ellis', 'vale', 'avery', 'bailey', 'bennett', 'blake', 'briar', 'brooks', 'callan', 'cameron', 'carter', 'casey', 'collins', 'dalton', 'darcy', 'dawson', 'devon', 'drew', 'emery', 'finley', 'flynn', 'foster', 'francis', 'graham', 'gray', 'harper', 'hayes', 'hayden', 'hollis', 'james', 'jordan', 'keegan', 'kendall', 'lane', 'lee', 'lennox', 'linden', 'logan', 'lowell', 'marley', 'mason', 'morgan', 'murphy', 'nash', 'oakley', 'parker', 'perry', 'porter', 'reese', 'reid', 'river', 'sage', 'sawyer', 'shea', 'sloane', 'sterling', 'sutton', 'taylor', 'wells', 'west', 'wilder', 'winslow', 'wyatt'];
// Invented syllable combinations, not a list of real people or credentials.
const STARTS = ['ve', 'na', 'me', 'lu', 'se', 'ca', 're', 'no', 'mi', 'ta', 'fi', 'va', 'le', 'ri', 'so', 'ke', 'da', 'mo', 'ne', 'ra', 'zi', 'ma', 'ti', 'vi', 'ce', 'sa', 'te', 'ro', 'fe', 'lo', 'ni', 'la'];
const MIDDLES = ['lo', 've', 'ri', 'na', 'li', 'me', 'ra', 'no', 'vi', 'la', 're', 'mi', 'vo', 'ne', 'lu', 'ro', 'va', 'le', 'ni', 'mo', 'se', 'ti', 'sa', 'fe', 'ca', 'ke', 'da', 'te', 'fi', 'so', 'za', 'nu'];
const ENDINGS = ['rin', 'lio', 'vano', 'lin', 'ren', 'via', 'len', 'ris', 'vin', 'lian', 'ron', 'nora', 'lan', 'ven', 'lis', 'ria', 'rel', 'min', 'lor', 'niel', 'lia', 'vian', 'reni', 'lira', 'mira', 'lorin', 'nari', 'riel', 'rion', 'vori', 'leno', 'niva'];
const GROUPS = ['abcdefghijkmnopqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%&*+-=?'];

// Rejection sampling avoids modulo bias, including during Fisher–Yates shuffle.
export function randomInt(max, random = crypto) {
  if (!Number.isInteger(max) || max < 1 || max > 0x100000000) throw new Error('Invalid random range');
  const limit = Math.floor(0x100000000 / max) * max;
  const values = new Uint32Array(1);
  do { random.getRandomValues(values); } while (values[0] >= limit);
  return values[0] % max;
}

function pick(values, random) {
  return values[randomInt(values.length, random)];
}

function shortDigits(random) {
  const length = 2 + randomInt(3, random);
  const minimum = 10 ** (length - 1);
  return String(minimum + randomInt(9 * minimum, random));
}

export function generatePrefix(random = crypto) {
  // A, B, C, E are independently selected at equal probability on every call.
  // A repeat of the previous style is allowed; no long-lived style preference.
  switch (randomInt(4, random)) {
    case 0: return `${pick(NAMES, random)}${shortDigits(random)}`;
    case 1: return `${pick(NAMES, random)}${pick('abcdefghijklmnopqrstuvwxyz', random)}${shortDigits(random)}`;
    case 2: return `${pick(STARTS, random)}${pick(MIDDLES, random)}${pick(ENDINGS, random)}`;
    case 3: return `${pick(NAMES, random)}.${pick(SECOND_NAMES, random)}`;
  }
}

export function generatePassword(length = 18) {
  passwordLength(length);
  const all = GROUPS.join('');
  const chars = GROUPS.map(group => group[randomInt(group.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function generateDraft(config) {
  return { id: crypto.randomUUID(), prefix: generatePrefix(), domain: config.defaultDomain,
    password: generatePassword(config.passwordLength) };
}
