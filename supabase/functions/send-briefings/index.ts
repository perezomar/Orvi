// Supabase Edge Function: sends Orvi email briefings.
// Deploy with:  supabase functions deploy send-briefings --no-verify-jwt
// Secrets (see README Part 8): RESEND_API_KEY, CRON_SECRET, UNSUB_SECRET, APP_URL, MAIL_FROM (optional)
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { runBriefings, buildEmail, buildPush, sign, verify, localParts } from './briefing.js';

const env = (k: string) => Deno.env.get(k) || '';
const SB_URL = env('SUPABASE_URL'), SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
const CRON = env('CRON_SECRET'), UNSUB = env('UNSUB_SECRET'), RESEND = env('RESEND_API_KEY');
const APP = env('APP_URL'), FROM = env('MAIL_FROM') || 'Orvi <onboarding@resend.dev>';
const VAPID_PUB = env('VAPID_PUBLIC_KEY'), VAPID_PRIV = env('VAPID_PRIVATE_KEY'), VAPID_SUBJECT = env('VAPID_SUBJECT') || 'mailto:admin@example.com';
if (VAPID_PUB && VAPID_PRIV) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUB, VAPID_PRIV);
const FN = `${SB_URL}/functions/v1/send-briefings`;
const db = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const same = (a: string, b: string) => { if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

async function unsubUrls(owner: string) {
  const s = await sign(UNSUB, owner);
  return { page: APP ? `${APP}#unsub=${owner}.${s}` : '', oneClick: `${FN}?u=${owner}&s=${s}` };
}

async function send(m: { to: string; owner: string; subject: string; html: string; text: string }) {
  const u = await unsubUrls(m.owner);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text,
      headers: { 'List-Unsubscribe': `<${u.oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
  });
  if (!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

const deps = {
  appUrl: APP,
  listEnabled: async () => { const r = await db.from('notif_settings').select('*').or('email_enabled.eq.true,push_enabled.eq.true'); if (r.error) throw r.error; return r.data || []; },
  claim: async (owner: string, slot: string, date: string) => {
    const col = 'last_' + slot;
    const r = await db.from('notif_settings').update({ [col]: date }).eq('owner_id', owner).or(`${col}.is.null,${col}.neq.${date}`).select('owner_id');
    return !r.error && (r.data || []).length > 0;
  },
  release: async (owner: string, slot: string, prev: string | null) => { await db.from('notif_settings').update({ ['last_' + slot]: prev }).eq('owner_id', owner); },
  getEmail: async (owner: string) => { const r = await db.auth.admin.getUserById(owner); return r.data?.user?.email || ''; },
  getProfiles: async (owner: string) => { const r = await db.from('student_profiles').select('data').eq('owner_id', owner); return (r.data || []).map((x: { data: unknown }) => x.data); },
  unsubUrl: async (owner: string) => (await unsubUrls(owner)).page,
  getSubs: async (owner: string) => { const r = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('owner_id', owner); return r.data || []; },
  removeSub: async (id: string) => { await db.from('push_subscriptions').delete().eq('id', id); },
  sendPush: (sub: { endpoint: string; p256dh: string; auth: string }, payload: unknown) =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600 }),
  send,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const url = new URL(req.url);
  let body: Record<string, string> = {};
  try { body = await req.json(); } catch (_) { /* one-click unsubscribe posts a form body */ }

  // 1) the schedule
  if (CRON && same(req.headers.get('x-cron-secret') || '', CRON)) return json(await runBriefings(deps, new Date()));

  // 2) unsubscribe (link in the email, or the mail app's one-click button)
  const u = url.searchParams.get('u') || body.u, s = url.searchParams.get('s') || body.s;
  if (u && s) {
    if (!(await verify(UNSUB, u, s))) return json({ error: 'bad link' }, 400);
    const r = await db.from('notif_settings').update({ email_enabled: false }).eq('owner_id', u);
    return r.error ? json({ error: 'failed' }, 500) : json({ ok: true });
  }

  // 3) "send me a test email" from Settings (signed-in user)
  if (body.action === 'test') {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
    const who = token ? await db.auth.getUser(token) : null;
    const user = who?.data?.user; if (!user) return json({ error: 'not signed in' }, 401);
    const st = (await db.from('notif_settings').select('tz').eq('owner_id', user.id).maybeSingle()).data;
    const date = localParts(new Date(), st?.tz || 'UTC').date;
    const profiles = (await deps.getProfiles(user.id)).filter((p: { archived?: boolean }) => p && !p.archived);
    const mail = buildEmail({ slot: 'morning', people: profiles, date, appUrl: APP, unsubUrl: (await unsubUrls(user.id)).page, force: true });
    try { await send({ to: user.email!, owner: user.id, ...mail }); return json({ ok: true }); }
    catch (e) { return json({ error: String(e) }, 502); }
  }

  // 4) "send a test notification" to this user's devices
  if (body.action === 'test_push') {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
    const who = token ? await db.auth.getUser(token) : null;
    const user = who?.data?.user; if (!user) return json({ error: 'not signed in' }, 401);
    if (!VAPID_PUB || !VAPID_PRIV) return json({ error: 'push keys are not set on the server' }, 501);
    const subs = await deps.getSubs(user.id); if (!subs.length) return json({ error: 'no devices' }, 404);
    const st = (await db.from('notif_settings').select('tz').eq('owner_id', user.id).maybeSingle()).data;
    const date = localParts(new Date(), st?.tz || 'UTC').date;
    const profiles = (await deps.getProfiles(user.id)).filter((p: { archived?: boolean }) => p && !p.archived);
    const msg = buildPush({ slot: 'morning', people: profiles, date, appUrl: APP, force: true });
    let ok = 0;
    for (const sub of subs) {
      try { await deps.sendPush(sub, { title: msg.title, body: msg.body, url: msg.url, tag: 'orvi-test' }); ok++; }
      catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await deps.removeSub(sub.id); }
    }
    return ok ? json({ ok: true, devices: ok }) : json({ error: 'could not reach any device' }, 502);
  }
  return json({ error: 'unauthorized' }, 401);
});
