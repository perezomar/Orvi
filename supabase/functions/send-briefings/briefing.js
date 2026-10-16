// Pure logic for Orvi email briefings. No network and no Deno-only APIs here,
// so it can be tested in Node and runs unchanged inside the Supabase Edge Function.

export const WINDOW_MIN = 90;   // a briefing is sent if the job runs within 90 min after the chosen time
const LEVELS = { college: 'College', highschool: 'High school', middleschool: 'Middle school' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toMin = t => { const [h, m] = String(t || '').split(':'); return (+h || 0) * 60 + (+m || 0); };

export function validTz(tz) { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; } }

export function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (+p.hour) * 60 + (+p.minute) };
}

export function addDays(d, n) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

// Which briefings (morning / evening) should go out right now for this account?
// `prefix` picks the channel's bookkeeping column: '' = email (last_morning), 'push_' = push (last_push_morning).
export function dueSlots(s, now, prefix = '') {
  const tz = validTz(s.tz) ? s.tz : 'UTC', lp = localParts(now, tz), out = [];
  for (const slot of ['morning', 'evening']) {
    const at = toMin(s[slot]);
    if (lp.minutes >= at && lp.minutes < at + WINDOW_MIN && s['last_' + prefix + slot] !== lp.date) out.push({ slot, key: prefix + slot, date: lp.date, tz });
  }
  return out;
}

function streak(days, today) {
  const set = new Set(days || []); let d = set.has(today) ? today : addDays(today, -1), n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

export function personName(p) { return (p && p.name) || LEVELS[p && p.level] || 'Student'; }

function summarize(p, date) {
  const tasks = p.tasks || [], pend = tasks.filter(t => t.status !== 'completed');
  const course = id => ((p.courses || []).find(c => c.id === id) || {}).name || '';
  const row = t => ({ title: t.title, course: course(t.courseId), mins: t.duration || 0, late: t.dueDate < date });
  const byDue = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0);
  return {
    name: personName(p),
    due: pend.filter(t => t.dueDate <= date).sort(byDue).map(row),
    tomorrow: pend.filter(t => t.dueDate === addDays(date, 1)).map(row),
    exams: (p.exams || []).filter(e => e.date >= date && e.date <= addDays(date, 7)).sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(e => ({ title: e.title, inDays: Math.round((new Date(e.date + 'T12:00:00Z') - new Date(date + 'T12:00:00Z')) / 864e5) })),
    done: tasks.filter(t => t.completedAt === date).length,
    focus: (p.focusLog || []).filter(f => f.date === date).reduce((a, f) => a + (f.mins || 0), 0),
    streak: streak(p.activeDays, date),
  };
}

const fmtMins = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m}m`;
const line = r => `${r.title}${r.course ? ' (' + r.course + ')' : ''}${r.mins ? ' · ' + fmtMins(r.mins) : ''}${r.late ? ' · overdue' : ''}`;

// Build one email covering every active person on the account.
export function buildEmail({ slot, people, date, appUrl, unsubUrl, force }) {
  const morning = slot === 'morning', sums = people.map(p => summarize(p, date));
  const has = sums.some(s => morning ? (s.due.length || s.tomorrow.length || s.exams.length) : (s.due.length || s.tomorrow.length || s.done || s.focus));
  const multi = sums.length > 1;
  const sections = sums.map(s => {
    const blocks = [];
    if (morning) {
      blocks.push(['Due today or overdue', s.due.length ? s.due.map(line) : ['Nothing due. Nice.']]);
    } else {
      blocks.push(['Today', [`${s.done} task${s.done === 1 ? '' : 's'} finished · ${s.focus}m focus` + (s.streak ? ` · ${s.streak}-day streak` : '')]]);
      if (s.due.length) blocks.push(['Still open', s.due.map(line)]);
    }
    if (s.tomorrow.length) blocks.push(['Tomorrow', s.tomorrow.map(line)]);
    if (morning && s.exams.length) blocks.push(['Exams this week', s.exams.map(e => `${e.title} · ${e.inDays === 0 ? 'today' : e.inDays === 1 ? 'tomorrow' : 'in ' + e.inDays + ' days'}`)]);
    if (morning && s.streak) blocks.push(['Streak', [`${s.streak} day${s.streak === 1 ? '' : 's'}. Keep it going.`]]);
    return { name: s.name, blocks };
  });
  const dueTotal = sums.reduce((a, s) => a + s.due.length, 0), doneTotal = sums.reduce((a, s) => a + s.done, 0);
  const subject = morning
    ? (dueTotal ? `Your Orvi briefing: ${dueTotal} to do today` : 'Your Orvi briefing: a light day')
    : `Orvi evening check-in: ${doneTotal} finished today`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f2fd;padding:20px"><div style="max-width:520px;margin:auto;background:#fff;border-radius:18px;overflow:hidden">
<div style="background:#6c5ce7;color:#fff;padding:18px 22px"><div style="font-size:12px;opacity:.85;letter-spacing:.06em;text-transform:uppercase">Orvi · ${morning ? 'Morning briefing' : 'Evening check-in'}</div></div>
<div style="padding:8px 22px 18px">${sections.map(s => `${multi ? `<h2 style="margin:18px 0 0;font-size:18px;color:#1b1535">${esc(s.name)}</h2>` : ''}${s.blocks.map(([h, items]) => `<div style="margin-top:14px"><div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#6b6585">${esc(h)}</div><div style="margin-top:4px;font-size:15px;line-height:1.5;color:#1b1535">${items.map(i => '• ' + esc(i)).join('<br>')}</div></div>`).join('')}`).join('')}
${appUrl ? `<p style="margin:22px 0 0"><a href="${esc(appUrl)}" style="background:#6c5ce7;color:#fff;text-decoration:none;padding:11px 20px;border-radius:12px;font-weight:700;display:inline-block">Open Orvi</a></p>` : ''}</div>
<div style="padding:12px 22px 18px;font-size:12px;color:#8a85a0">You get this because email briefings are on in Orvi.${unsubUrl ? ` <a href="${esc(unsubUrl)}" style="color:#8a85a0">Turn them off</a>.` : ''}</div></div></div>`;
  const text = sections.map(s => `${multi ? s.name.toUpperCase() + '\n' : ''}${s.blocks.map(([h, items]) => `${h}\n${items.map(i => '- ' + i).join('\n')}`).join('\n\n')}`).join('\n\n')
    + (appUrl ? `\n\nOpen Orvi: ${appUrl}` : '') + (unsubUrl ? `\nTurn these off: ${unsubUrl}` : '');
  return { subject, html, text, hasContent: !!(has || force) };
}

// Short text for a phone notification.
export function buildPush({ slot, people, date, appUrl, force }) {
  const morning = slot === 'morning', sums = people.map(p => summarize(p, date)), multi = sums.length > 1;
  const parts = sums.map(s => {
    const n = s.due.length;
    const txt = morning
      ? (n ? `${n} to do today (${s.due.slice(0, 2).map(r => r.title).join(', ')}${n > 2 ? '…' : ''})` : (s.tomorrow.length ? `nothing due, ${s.tomorrow.length} tomorrow` : ''))
      : (s.done || s.focus ? `${s.done} finished · ${s.focus}m focus` : '') + (n ? `${s.done || s.focus ? ' · ' : ''}${n} still open` : '');
    return txt ? (multi ? `${s.name}: ${txt}` : txt) : '';
  }).filter(Boolean);
  const body = parts.join('\n') || 'Nothing due. Enjoy the free time.';
  return { title: morning ? 'Orvi · Morning briefing' : 'Orvi · Evening check-in', body, url: appUrl || './', tag: 'orvi-' + slot, hasContent: !!(parts.length || force) };
}

// ---- signed unsubscribe links (HMAC) ----
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
}
export const sign = (secret, owner) => hmac(secret, 'unsub:' + owner);
export async function verify(secret, owner, sig) {
  const want = await sign(secret, owner); if (typeof sig !== 'string' || sig.length !== want.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ sig.charCodeAt(i); return d === 0;
}

// ---- one scheduled run. All I/O comes in through `deps`, so tests can fake it. ----
// Email and push each keep their own "already sent today" marker, so one failing never repeats the other.
export async function runBriefings(deps, now = new Date()) {
  const res = { sent: 0, skipped: 0, failed: 0, pushed: 0 };
  for (const s of await deps.listEnabled()) {
    const channels = [];
    if (s.email_enabled) channels.push({ prefix: '', kind: 'email' });
    if (s.push_enabled && deps.getSubs) channels.push({ prefix: 'push_', kind: 'push' });
    for (const ch of channels) {
      for (const d of dueSlots(s, now, ch.prefix)) {
        const prev = s['last_' + d.key] || null;
        if (!(await deps.claim(s.owner_id, d.key, d.date))) continue;      // another run already took this one
        try {
          const people = (await deps.getProfiles(s.owner_id)).filter(p => p && !p.archived);
          if (ch.kind === 'email') {
            const to = await deps.getEmail(s.owner_id);
            const mail = buildEmail({ slot: d.slot, people, date: d.date, appUrl: deps.appUrl, unsubUrl: await deps.unsubUrl(s.owner_id) });
            if (!to || !mail.hasContent) { res.skipped++; continue; }
            await deps.send({ to, owner: s.owner_id, ...mail });
            res.sent++;
          } else {
            const msg = buildPush({ slot: d.slot, people, date: d.date, appUrl: deps.appUrl });
            const subs = await deps.getSubs(s.owner_id);
            if (!subs.length || !msg.hasContent) { res.skipped++; continue; }
            let okN = 0, lastErr = null;
            for (const sub of subs) {
              try { await deps.sendPush(sub, { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag }); okN++; }
              catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await deps.removeSub(sub.id); else lastErr = e; }
            }
            if (okN) res.pushed++; else if (lastErr) throw lastErr; else res.skipped++;
          }
        } catch (e) {
          res.failed++; await deps.release(s.owner_id, d.key, prev);   // let the next run retry
        }
      }
    }
  }
  return res;
}
