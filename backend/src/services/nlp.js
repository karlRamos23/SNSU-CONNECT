// Date/time helpers and a small natural-language date parser (no database needed).
// "off" is the student's UTC offset in minutes east of UTC (Philippines = 480).
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const SHORT = ['jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sept', 'sep', 'oct', 'nov', 'dec'];
const pad = (n) => String(n).padStart(2, '0');
const toMs = (y, mo, d, h, mi, off) => Date.UTC(y, mo, d, h, mi) - off * 60000;
const local = (ms, off) => new Date(ms + off * 60000); // read with getUTC* methods

function fmtLocal(ms, off) {
  const d = local(ms, off);
  let h = d.getUTCHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mon = MONTHS[d.getUTCMonth()];
  return `${mon[0].toUpperCase()}${mon.slice(1, 3)} ${d.getUTCDate()}, ${h}:${pad(d.getUTCMinutes())} ${ap}`;
}
function toLocalIso(ms, off) {
  const d = local(ms, off), s = off >= 0 ? '+' : '-', a = Math.abs(off);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${s}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
function isoToMs(str, off) {
  str = String(str || '').trim();
  if (/(z|[+-]\d{2}:\d{2})$/i.test(str)) { const t = Date.parse(str); return Number.isFinite(t) ? t : null; }
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/);
  return m ? toMs(+m[1], m[2] - 1, +m[3], +m[4], +m[5], off) : null;
}
function dayBounds(off, addDays = 0) {
  const n = local(Date.now(), off);
  const start = toMs(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + addDays, 0, 0, off);
  return [start, start + 864e5];
}

function parseWhen(text, off) {
  let t = ' ' + String(text) + ' ';
  const cut = (re) => { const m = t.match(re); if (m) t = t.replace(re, ' '); return m; };
  let m;
  if ((m = cut(/\bin (\d{1,3}) ?(minutes?|mins?|hours?|hrs?|days?|weeks?)\b/i))) {
    const u = m[2].toLowerCase();
    const mult = u.startsWith('m') ? 6e4 : u.startsWith('h') ? 36e5 : u.startsWith('d') ? 864e5 : 6048e5;
    return { ms: Date.now() + +m[1] * mult, rest: t };
  }
  const now = local(Date.now(), off);
  let y = now.getUTCFullYear(), mo = now.getUTCMonth(), d = now.getUTCDate();
  let dateSet = false, tonight = false, weekday = false, monthDay = false, explicitYear = false;
  const shift = (n) => { const x = new Date(Date.UTC(y, mo, d + n)); y = x.getUTCFullYear(); mo = x.getUTCMonth(); d = x.getUTCDate(); };
  if ((m = cut(/\b(today|tonight)\b/i))) { dateSet = true; tonight = m[1].toLowerCase() === 'tonight'; }
  else if (cut(/\btomorrow\b/i)) { dateSet = true; shift(1); }
  else if ((m = cut(new RegExp('\\b(?:(next|this|on) )?(' + DAYS.join('|') + ')\\b', 'i')))) {
    const target = DAYS.indexOf(m[2].toLowerCase());
    let add = (target - now.getUTCDay() + 7) % 7;
    if (add === 0 && (m[1] || '').toLowerCase() === 'next') add = 7;
    shift(add); dateSet = true; weekday = true;
  } else if ((m = cut(new RegExp('\\b(' + MONTHS.concat(SHORT).join('|') + ')\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b', 'i')))) {
    const k = m[1].toLowerCase().slice(0, 3);
    mo = MONTHS.findIndex((x) => x.startsWith(k)); d = +m[2]; dateSet = true; monthDay = true;
  } else if ((m = cut(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    mo = +m[1] - 1; d = +m[2]; dateSet = true; monthDay = true;
    if (m[3]) { y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; explicitYear = true; }
  }
  let h = null, mi = 0;
  if ((m = cut(/\b(\d{1,2})(?::(\d{2}))?\s?(a\.?m\.?|p\.?m\.?)(?=\W|$)/i))) {
    h = +m[1]; mi = +(m[2] || 0);
    const pm = m[3][0].toLowerCase() === 'p';
    if (h > 12 || h < 1 || mi > 59) return null;
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  } else if ((m = cut(/\b([01]?\d|2[0-3]):([0-5]\d)\b/))) { h = +m[1]; mi = +m[2]; }
  else if (cut(/\bnoon\b/i)) { h = 12; }
  else if (cut(/\bmidnight\b/i)) { h = 0; }
  if (!dateSet && h === null) return null;
  if (dateSet && h === null) {
    if (tonight) h = 20; else return { ms: null, needTime: true, rest: t };
  }
  if (monthDay && !explicitYear && toMs(y, mo, d, 23, 59, off) < Date.now()) y += 1;
  let ms = toMs(y, mo, d, h, mi, off);
  if (!dateSet && ms <= Date.now()) ms += 864e5;
  if (weekday && ms <= Date.now()) ms += 6048e5;
  return { ms, rest: t };
}

function cleanTitle(s) {
  s = String(s)
    .replace(/\b(please|can you|could you|would you|hey|hi)\b/gi, ' ')
    .replace(/\b(remind me|set (?:a |an )?(?:new )?reminder|add (?:a |an )?(?:new )?reminder|create (?:a |an )?(?:new )?reminder|make (?:a |an )?reminder|new reminder)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    s = s.replace(/^(to|about|for|that|of|:|-)\s+/i, '').replace(/\s+(on|at|by|in|this|next|for|to|due|before|until|of)$/i, '').replace(/[.,!?:;-]+$/, '').trim();
  }
  s = s.replace(/^(to|about|for|that)$/i, '');
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

module.exports = { DAYS, fmtLocal, toLocalIso, isoToMs, dayBounds, parseWhen, cleanTitle, toMs, local };
