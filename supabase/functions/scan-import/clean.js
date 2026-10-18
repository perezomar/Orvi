// Server-side cleanup of whatever the AI returned. The app never trusts it as-is.
export const MAX_IMAGES = 4, MAX_B64 = 8_000_000, MAX_TEXT = 30_000;
const TYPES = ['assignment', 'quiz', 'reading', 'test', 'video'], CONF = ['high', 'medium', 'low'];
const validDate = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, n) : '');
export function cleanItems(input) {
  const items = [], seen = new Set();
  for (const x of (input && Array.isArray(input.items) ? input.items : []).slice(0, 80)) {
    if (!x || typeof x !== 'object') continue;
    const title = str(x.title, 120); if (title.length < 2) continue;
    const type = TYPES.includes(x.type) ? x.type : 'assignment';
    const due = validDate(x.due_date) ? x.due_date : null;
    let conf = CONF.includes(x.confidence) ? x.confidence : 'medium'; if (!due) conf = 'low';
    const mins = Number.isFinite(x.minutes) && x.minutes >= 5 && x.minutes <= 600 ? Math.round(x.minutes) : null;
    const k = title.toLowerCase() + '|' + due; if (seen.has(k)) continue; seen.add(k);
    items.push({ title, type, due_date: due, course: str(x.course, 60) || null, minutes: mins, confidence: conf, note: str(x.note, 160) || null });
  }
  const questions = (input && Array.isArray(input.questions) ? input.questions : []).map(q => str(q, 200)).filter(Boolean).slice(0, 3);
  return { items, questions };
}
