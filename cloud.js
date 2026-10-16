/* ============================================================
   Orvi cloud sync (Supabase)
   Loads after the main app. If config.js has no keys, none of this
   runs and Orvi stays a local-only app, exactly as before.

   Rules this file follows:
   1. The device copy is always the working copy. The app never waits on
      the network, so it works offline.
   2. Sync NEVER throws away progress. Conflicts are merged, not overwritten.
   3. Deleted items are tracked (tombstones) so they don't come back.
   4. The only time the cloud copy is overwritten is on purpose: restoring a
      backup, resetting a profile, or restoring a version. The server saves a
      snapshot of what's being replaced first.
   ============================================================ */
(function () {
  'use strict';
  const CFG = window.ORVI_CONFIG || {};
  const ENABLED = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const T = 'student_profiles', H = 'student_profile_history';
  const AUTH_KEY = 'orvi.auth';

  const C = { client: null, user: null, rows: {}, synced: {}, forceKeys: new Set(), timer: null, busy: false, again: false,
              state: 'local', msg: '', backoff: 0, poll: null, hist: [] };
  window.Cloud = C;

  /* ---------- status ---------- */
  const LABEL = { local: 'Saved on this device', signedout: 'Signed out', syncing: 'Syncing…', synced: 'All changes synced',
                  offline: 'Offline. Saved on this device, will sync later', error: 'Sync problem' };
  function setState(s, msg) {
    C.state = s; C.msg = msg || '';
    document.querySelectorAll('[data-sync]').forEach(e => { e.dataset.state = s; e.title = LABEL[s] + (msg ? ': ' + msg : ''); });
    const el = document.getElementById('acctStatus'); if (el) el.textContent = LABEL[s] + (msg ? ' (' + msg + ')' : '');
  }

  /* ---------- merge (progress is never lost) ---------- */
  const uniq = a => [...new Set(a)];
  const clone = o => JSON.parse(JSON.stringify(o));
  function mergeList(l, r, dead, fn) {
    const m = new Map(); (r || []).forEach(x => m.set(x.id, x));
    (l || []).forEach(x => { const o = m.get(x.id); m.set(x.id, o && fn ? fn(x, o) : x); });
    return [...m.values()].filter(x => !dead[x.id]);
  }
  function mergeProfiles(l, r) {
    const dead = Object.assign({}, r.deleted, l.deleted);
    const o = Object.assign({}, r, l);                       // this device wins plain settings (cards, vibe...)
    o.deleted = dead;
    o.courses = mergeList(l.courses, r.courses, dead);
    o.exams = mergeList(l.exams, r.exams, dead);
    o.events = mergeList(l.events, r.events, dead);
    o.tasks = mergeList(l.tasks, r.tasks, dead, (a, b) => {
      const t = Object.assign({}, b, a);
      if (a.status === 'completed' || b.status === 'completed') { t.status = 'completed'; t.completedAt = a.completedAt || b.completedAt; }
      t.actualMins = Math.max(a.actualMins || 0, b.actualMins || 0);
      return t;
    });
    ['xp', 'coins', 'completedTotal', 'scans', 'bestStreak', 'freezes'].forEach(k => { o[k] = Math.max(l[k] || 0, r[k] || 0); });
    o.activeDays = uniq([...(l.activeDays || []), ...(r.activeDays || [])]).sort();
    o.freezeUsed = uniq([...(l.freezeUsed || []), ...(r.freezeUsed || [])]).sort();
    o.unlocked = uniq([...(l.unlocked || []), ...(r.unlocked || [])]);
    o.focusLog = mergeList(l.focusLog, r.focusLog, {});
    o.xpLog = {}; [r.xpLog || {}, l.xpLog || {}].forEach(x => Object.keys(x).forEach(d => { o.xpLog[d] = Math.max(o.xpLog[d] || 0, x[d]); }));
    o.claimed = {}; [r.claimed || {}, l.claimed || {}].forEach(x => Object.keys(x).forEach(w => { o.claimed[w] = uniq([...(o.claimed[w] || []), ...x[w]]); }));
    o.lastBrief = [l.lastBrief || '', r.lastBrief || ''].sort().pop();
    o.notifSent = [l.notifSent || '', r.notifSent || ''].sort().pop();
    o.cards = l.cards || r.cards || '';
    o.comp = Object.assign({}, r.comp, l.comp, {
      species_unlocked: uniq([...(l.comp.species_unlocked || []), ...(r.comp.species_unlocked || [])]),
      owned: uniq([...(l.comp.owned || []), ...(r.comp.owned || [])])
    });
    // Name, level and removed/restored state: whichever device changed it most recently wins.
    if ((r.metaAt || 0) > (l.metaAt || 0)) { o.name = r.name; o.level = r.level; o.archived = r.archived; o.metaAt = r.metaAt; }
    return normalize(o);
  }
  // A profile that is still just the demo data (nothing real on it yet).
  function isPristine(p) {
    return p.xp === 0 && p.completedTotal === 0 && !p.focusLog.length && !p.activeDays.length && !Object.keys(p.deleted || {}).length &&
      p.coins <= 30 && !(p.cards || '').trim() && !(p.comp.owned || []).length && (p.comp.species_unlocked || []).length <= 1 &&
      p.comp.species === 'dog' && p.comp.name === 'Biscuit' &&
      ['courses', 'tasks', 'exams', 'events'].every(k => (p[k] || []).every(x => x.seed));
  }
  // Bring one remote profile into the device. Returns true if the device copy changed.
  function reconcile(key, remoteData) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) return false;       // ignore malformed profile ids
    const remote = normalize(clone(remoteData || {}));
    const local = DB.profiles[key], before = local ? JSON.stringify(local) : '';
    const next = (!local || isPristine(local)) ? remote : mergeProfiles(local, remote);
    DB.profiles[key] = next;
    const s = JSON.stringify(next);
    if (s === JSON.stringify(remote)) C.synced[key] = s;       // identical to cloud: nothing to upload
    return s !== before;
  }

  /* ---------- sync engine ---------- */
  async function syncProfile(key, force) {
    const c = C.client, label = (DB.profiles[key] && profLabel(key)) || key;
    for (let i = 0; i < 4; i++) {
      let row = C.rows[key];
      if (!row) {
        const r = await c.from(T).select('id,rev,data').eq('key', key).maybeSingle();
        if (r.error) throw r.error;
        if (r.data) { C.rows[key] = row = { id: r.data.id, rev: r.data.rev }; if (!force) reconcile(key, r.data.data); }
        else {
          const ins = await c.from(T).insert({ key, label, data: DB.profiles[key], rev: 1 }).select('id,rev').single();
          if (ins.error) { if (ins.error.code === '23505') continue; throw ins.error; }
          C.rows[key] = { id: ins.data.id, rev: ins.data.rev }; C.synced[key] = JSON.stringify(DB.profiles[key]); return;
        }
      }
      const payload = JSON.stringify(DB.profiles[key]);
      const up = await c.from(T).update({ data: DB.profiles[key], rev: row.rev + 1, label }).eq('id', row.id).eq('rev', row.rev).select('rev');
      if (up.error) throw up.error;
      if (up.data && up.data.length) { row.rev = up.data[0].rev; C.synced[key] = payload; return; }
      // Someone else (another device) saved first: fetch their version and merge, then try again.
      const f = await c.from(T).select('id,rev,data').eq('id', row.id).maybeSingle();
      if (f.error) throw f.error;
      if (!f.data) { delete C.rows[key]; continue; }
      C.rows[key] = { id: f.data.id, rev: f.data.rev };
      if (!force) reconcile(key, f.data.data);
    }
    throw new Error('Could not finish syncing after several tries');
  }
  async function pullAll() {
    const r = await C.client.from(T).select('id,key,rev,data');
    if (r.error) throw r.error;
    let changed = false;
    for (const row of r.data || []) {
      const known = C.rows[row.key];
      if (known && known.id === row.id && known.rev === row.rev) continue;
      C.rows[row.key] = { id: row.id, rev: row.rev };
      if (C.forceKeys.has(row.key)) continue;                  // a deliberate overwrite is pending for this profile
      changed = reconcile(row.key, row.data) || changed;
    }
    if (changed) { saveNow(); if (!DB.profiles[DB.current]) DB.current = Object.keys(DB.profiles)[0]; buildChrome(); renderAll(); renderAccount(); }
  }
  async function pushAll() {
    for (const key of Object.keys(DB.profiles)) {
      const forced = C.forceKeys.has(key);
      if (forced || C.synced[key] !== JSON.stringify(DB.profiles[key])) { await syncProfile(key, forced); C.forceKeys.delete(key); }
    }
  }
  async function syncNow(opts) {
    opts = opts || {};
    if (!C.user || !C.client) return;
    if (C.busy) { C.again = true; return; }
    C.busy = true; setState('syncing');
    try {
      if (opts.pull !== false) await pullAll();
      await pushAll();
      C.backoff = 0; setState('synced');
    } catch (e) { handleErr(e); }
    finally { C.busy = false; if (C.again) { C.again = false; schedule(400); } }
  }
  function handleErr(e) {
    const m = String((e && e.message) || e || '');
    const offline = !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|fetch/i.test(m);
    if (offline) setState('offline'); else setState('error', m.slice(0, 80));
    C.backoff = Math.min(120000, (C.backoff || 5000) * 2); schedule(C.backoff);
  }
  function schedule(ms) { clearTimeout(C.timer); C.timer = setTimeout(() => syncNow(), ms); }
  window.cloudNotify = function () {                           // called by the app after every local save
    if (!C.user) return;
    clearTimeout(C.timer); C.timer = setTimeout(() => syncNow({ pull: false }), 1500);
  };
  window.cloudForce = async function (keys) {                  // deliberate overwrite of the cloud copy
    if (!C.user || !C.client) return;
    keys.forEach(k => C.forceKeys.add(k));
    for (const k of keys) { const row = C.rows[k]; if (row) { try { await C.client.rpc('snapshot_profile_now', { p_id: row.id }); } catch (e) {} } }
    schedule(200);
  };
  function startLoop() {
    stopLoop();
    C.poll = setInterval(() => { if (!document.hidden && C.user) syncNow(); }, 60000);
  }
  function stopLoop() { clearInterval(C.poll); clearTimeout(C.timer); C.poll = null; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && C.user) syncNow(); });
  window.addEventListener('online', () => { if (C.user) syncNow(); else if (ENABLED && !DB.localOnly) startClient(); });
  window.addEventListener('offline', () => { if (C.user) setState('offline'); });

  /* ---------- sign-in / session ---------- */
  function wipeLocal() {
    DB = freshDB(); try { localStorage.removeItem(KEY + '.bak'); } catch (e) {}
    saveNow(); buildChrome(); renderAll();
  }
  async function onAuth(evt, session) {
    if (evt === 'PASSWORD_RECOVERY') openSheet('recoverSheet');
    if (!session) {
      if (C.user) { C.user = null; C.rows = {}; C.synced = {}; stopLoop(); }
      if (DB.owner && !navigator.onLine) { setState('offline'); hideGate(); renderAccount(); return; }
      setState('signedout'); renderAccount(); if (!DB.localOnly) showGate(); return;
    }
    if (C.user && C.user.id === session.user.id) { C.user = session.user; return; }
    C.user = session.user;
    if (DB.owner && DB.owner !== session.user.id) wipeLocal();  // a different person: never mix accounts on one device
    DB.owner = session.user.id; delete DB.localOnly; saveNow();
    hideGate(); renderAccount();
    await syncNow();
    startLoop();
  }
  async function startClient() {
    try { await ensureLib(); } catch (e) { setState(DB.owner ? 'offline' : 'local', 'sync unavailable'); return; }
    if (!C.client) {
      C.client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY,
        { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_KEY } });
      // Never call other Supabase methods directly inside this callback; defer it.
      C.client.auth.onAuthStateChange((evt, session) => { setTimeout(() => onAuth(evt, session), 0); });
    }
    const r = await C.client.auth.getSession();
    await onAuth('INITIAL', r.data && r.data.session);
  }
  function ensureLib() {
    return new Promise((res, rej) => {
      if (window.supabase && window.supabase.createClient) return res();
      const s = document.createElement('script'); s.src = LIB; s.onload = () => res(); s.onerror = () => rej(new Error('lib')); document.head.appendChild(s);
    });
  }

  /* ---------- sign-in screen ---------- */
  let gateMode = 'in', gateBusy = false;
  const gate = () => document.getElementById('gate');
  function showGate() { gate().classList.add('open'); setGateMode(gateMode); }
  function hideGate() { gate().classList.remove('open'); }
  function gmsg(t, ok) { const m = document.getElementById('gMsg'); m.textContent = t || ''; m.className = 'gmsg' + (t ? (ok ? ' ok' : ' err') : ''); }
  window.setGateMode = function (m) {
    gateMode = m; gmsg('');
    document.getElementById('gTabIn').classList.toggle('on', m === 'in'); document.getElementById('gTabUp').classList.toggle('on', m === 'up');
    document.getElementById('gGo').textContent = m === 'in' ? 'Sign in' : 'Create account';
    document.getElementById('gPass').autocomplete = m === 'in' ? 'current-password' : 'new-password';
  };
  function friendly(e) {
    const m = String((e && e.message) || e || '');
    if (/invalid login/i.test(m)) return 'That email or password is not right.';
    if (/not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox.';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Please wait a minute and try again.';
    if (/password/i.test(m) && /(short|least|weak)/i.test(m)) return 'Choose a longer password (8+ characters).';
    if (/fetch|network/i.test(m)) return "Can't reach the sign-in service. Check your connection.";
    return m || 'Something went wrong. Please try again.';
  }
  async function ensureClient() { if (!C.client) await startClient(); return !!C.client; }
  window.submitAuth = async function (e) {
    e.preventDefault(); if (gateBusy) return;
    const email = document.getElementById('gEmail').value.trim(), password = document.getElementById('gPass').value;
    gateBusy = true; document.getElementById('gGo').disabled = true; gmsg('');
    try {
      if (!(await ensureClient())) throw new Error("Can't reach the sign-in service. Check your connection.");
      if (gateMode === 'up') {
        const r = await C.client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (r.error) throw r.error;
        if (!r.data.session) gmsg('Check your email to confirm your account, then come back and sign in.', true);
      } else {
        const r = await C.client.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
      }
    } catch (err) { gmsg(friendly(err)); }
    finally { gateBusy = false; document.getElementById('gGo').disabled = false; }
  };
  window.forgotPassword = async function () {
    const email = document.getElementById('gEmail').value.trim();
    if (!email) return gmsg('Type your email above first.');
    try {
      if (!(await ensureClient())) throw new Error('fetch');
      const r = await C.client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (r.error) throw r.error;
      gmsg('If that email has an account, a reset link is on its way.', true);
    } catch (err) { gmsg(friendly(err)); }
  };
  window.setNewPassword = async function (e) {
    e.preventDefault();
    const r = await C.client.auth.updateUser({ password: document.getElementById('rPass').value });
    if (r.error) return toast(friendly(r.error));
    closeSheet('recoverSheet'); toast('Password updated.');
  };
  window.skipSignIn = function () { DB.localOnly = true; saveNow(); hideGate(); setState('local'); renderAccount(); };

  /* ---------- settings: account box, history, sign-out, delete ---------- */
  function renderAccount() {
    const box = document.getElementById('acctBox'); if (!box) return;
    if (!ENABLED) { box.innerHTML = '<div class="sub">Cloud sync is not set up for this copy of Orvi, so your progress stays on this device. See the setup guide to turn it on.</div>'; return; }
    if (C.user) {
      box.innerHTML = `<div><b>Signed in</b><div class="sub">${esc(C.user.email || '')}</div></div>
        <div class="sub" id="acctStatus"></div>
        <div id="mailBox" class="stack"></div>
        <div class="row wrap"><button class="btn sm" onclick="cloudSyncNow()">Sync now</button><button class="btn sm" onclick="cloudHistory()">Version history</button><button class="btn sm" onclick="cloudSignOut()">Sign out</button></div>
        <div><button class="linkbtn" style="color:var(--bad)" onclick="cloudDeleteAccount()">Delete my account and cloud data</button></div>`;
      setState(C.state, C.msg); renderMail(); loadMail();
    } else {
      box.innerHTML = `<div class="sub">${DB.owner ? 'Offline right now. Your progress is saved on this device.' : 'This device is not signed in. Progress stays on this device only.'}</div><div class="row"><button class="btn sm p" onclick="cloudShowGate()">Sign in or create account</button></div>`;
    }
  }

  /* ---------- email briefings (server sends them on a schedule; see README Part 8) ---------- */
  const N = 'notif_settings';
  const FN_URL = (CFG.SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/send-briefings';
  const el = id => document.getElementById(id);
  const localTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } };
  C.mail = null; C.mailErr = '';
  async function loadMail() {
    if (!C.user || !C.client) return;
    const r = await C.client.from(N).select('*').eq('owner_id', C.user.id).maybeSingle();
    if (r.error) C.mailErr = /relation|does not exist|schema cache|not find/i.test(r.error.message || '') ? 'setup' : 'error';
    else { C.mailErr = ''; C.mail = r.data || null; }
    renderMail();
  }
  function tzOptions(cur) {
    let l = []; try { l = Intl.supportedValuesOf('timeZone'); } catch (e) {}
    if (!l.includes(cur)) l = [cur].concat(l);
    return l.map(z => `<option${z === cur ? ' selected' : ''}>${esc(z)}</option>`).join('');
  }
  function renderMail() {
    const box = el('mailBox'); if (!box || !C.user) return;
    if (C.mailErr === 'setup') { box.innerHTML = '<div class="sub">Email briefings are not set up on the server yet. See the setup guide, Part 8.</div>'; return; }
    const m = C.mail || {}, tz = m.tz || localTz();
    box.innerHTML = `<div><b>Briefings</b><div class="sub">A morning and an evening summary, even when the app is closed. It covers everyone on this account. The times below apply to email and to notifications.</div></div>
      <label class="row" style="font-size:14px"><input type="checkbox" id="mEn" ${m.email_enabled ? 'checked' : ''}> Email me briefings at ${esc(C.user.email || 'my email')}</label>
      <div class="row wrap"><div><label for="mAm">Morning</label><input type="time" id="mAm" value="${esc((m.morning || '07:30').slice(0, 5))}"></div><div><label for="mPm">Evening</label><input type="time" id="mPm" value="${esc((m.evening || '19:00').slice(0, 5))}"></div></div>
      <label for="mTz">Time zone</label><select id="mTz">${tzOptions(tz)}</select>
      <div class="row wrap"><button class="btn sm p" onclick="cloudSaveMail()">Save</button><button class="btn sm" onclick="cloudTestMail()">Send a test email</button></div>
      <div id="pushBox" class="stack"></div>`;
    renderPush();
  }
  async function saveMailRow(extra) {
    const f = el('mAm') ? { email_enabled: el('mEn').checked, tz: el('mTz').value || localTz(), morning: el('mAm').value || '07:30', evening: el('mPm').value || '19:00' } : {};
    const row = Object.assign({}, f, extra || {});
    const r = C.mail ? await C.client.from(N).update(row).eq('owner_id', C.user.id)
                     : await C.client.from(N).insert(Object.assign({ owner_id: C.user.id }, row));
    if (!r.error) C.mail = Object.assign({}, C.mail || {}, row, { owner_id: C.user.id });
    return r;
  }
  window.cloudSaveMail = async function () {
    if (!C.user) return;
    const r = await saveMailRow();
    if (r.error) return toast(/relation|does not exist|schema cache/i.test(r.error.message || '') ? 'Briefings are not set up on the server yet.' : "Couldn't save: " + r.error.message);
    toast(C.mail.email_enabled ? 'Saved. Email briefings are on.' : 'Saved. Email briefings are off.');
  };
  window.cloudTestMail = async function () {
    const s = C.client && (await C.client.auth.getSession()).data.session; if (!s) return toast('Please sign in first.');
    toast('Sending…');
    try {
      const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token, apikey: CFG.SUPABASE_ANON_KEY }, body: JSON.stringify({ action: 'test' }) });
      toast(r.ok ? 'Test email sent. Check your inbox (and spam).' : r.status === 404 ? "The email function isn't deployed yet. See the setup guide, Part 8." : "Couldn't send the test email. Check the setup guide, Part 8.");
    } catch (e) { toast("Can't reach the server."); }
  };

  /* ---------- push notifications (this device) ---------- */
  const PS = 'push_subscriptions';
  const PUSH_OK = () => !!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
  const iosBrowser = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  const b64ToU8 = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, ch => ch.charCodeAt(0)); };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  // Never waits on a service worker that isn't there (blocked, unsupported, private mode): sign-out must not hang.
  async function thisSub() {
    try {
      if (!CFG.VAPID_PUBLIC_KEY || !PUSH_OK()) return null;
      const reg = await withTimeout(navigator.serviceWorker.getRegistration(), 3000);
      return reg ? await withTimeout(reg.pushManager.getSubscription(), 3000) : null;
    } catch (e) { return null; }
  }
  async function renderPush() {
    const box = el('pushBox'); if (!box || !CFG.VAPID_PUBLIC_KEY) return;
    const hint = t => { box.innerHTML = `<div><b>Notifications on this device</b><div class="sub">${t}</div></div>`; };
    if (iosBrowser()) return hint('On iPhone and iPad, first add Orvi to your Home Screen (Share, then Add to Home Screen) and open it from there. Then come back here.');
    if (!PUSH_OK()) return hint('This browser does not support notifications.');
    if (Notification.permission === 'denied') return hint('Notifications are blocked for Orvi. Allow them in your browser or phone settings, then come back.');
    const sub = await thisSub();
    box.innerHTML = `<div><b>Notifications on this device</b><div class="sub">${sub ? 'On. This device gets the morning and evening briefings.' : 'Off. Turn on to get the briefings as notifications.'}</div></div>
      <div class="row wrap">${sub ? '<button class="btn sm" onclick="cloudPushOff()">Turn off</button><button class="btn sm" onclick="cloudTestPush()">Send a test notification</button>' : '<button class="btn sm p" onclick="cloudPushOn()">Turn on</button>'}</div>`;
  }
  async function storeSub(sub) {
    const j = sub.toJSON(), rec = { owner_id: C.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
    const ex = await C.client.from(PS).select('id').eq('endpoint', j.endpoint).maybeSingle();
    return ex.data ? C.client.from(PS).update(rec).eq('endpoint', j.endpoint) : C.client.from(PS).insert(rec);
  }
  window.cloudPushOn = async function () {
    if (!C.user) return;
    try {
      if ((await Notification.requestPermission()) !== 'granted') { toast('Notifications were not allowed.'); return renderPush(); }
      const reg = await withTimeout(navigator.serviceWorker.ready, 8000), subscribe = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CFG.VAPID_PUBLIC_KEY) });
      let sub = (await reg.pushManager.getSubscription()) || (await subscribe()), r = await storeSub(sub);
      if (r.error && /duplicate|23505/i.test((r.error.code || '') + (r.error.message || ''))) {   // this browser was used with another account: start a fresh subscription
        try { await sub.unsubscribe(); } catch (e) {}
        sub = await subscribe(); r = await storeSub(sub);
      }
      if (r.error) throw r.error;
      const r2 = await saveMailRow({ push_enabled: true }); if (r2.error) throw r2.error;
      toast('Notifications are on for this device.');
    } catch (e) { toast(/relation|does not exist|schema cache/i.test(String(e && e.message)) ? 'Notifications are not set up on the server yet (setup guide, Part 9).' : "Couldn't turn on notifications."); }
    renderPush();
  };
  window.cloudPushOff = async function () {
    try {
      const sub = await thisSub();
      if (sub) { const ep = sub.endpoint; try { await sub.unsubscribe(); } catch (e) {} await C.client.from(PS).delete().eq('endpoint', ep); }
      const left = await C.client.from(PS).select('id').eq('owner_id', C.user.id);
      if (!left.error && !(left.data || []).length) await saveMailRow({ push_enabled: false });
      toast('Notifications are off for this device.');
    } catch (e) { toast("Couldn't turn them off. Try again."); }
    renderPush();
  };
  async function dropDevicePush() {          // called when signing out / deleting the account on this device
    try { const sub = await thisSub(); if (!sub) return; const ep = sub.endpoint; try { await C.client.from(PS).delete().eq('endpoint', ep); } catch (e) {} await sub.unsubscribe(); } catch (e) {}
  }
  window.cloudTestPush = async function () {
    const s = C.client && (await C.client.auth.getSession()).data.session; if (!s) return toast('Please sign in first.');
    toast('Sending…');
    try {
      const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.access_token, apikey: CFG.SUPABASE_ANON_KEY }, body: JSON.stringify({ action: 'test_push' }) });
      toast(r.ok ? 'Test notification sent.' : r.status === 501 ? 'The server has no push keys yet (setup guide, Part 9).' : r.status === 404 ? "The server doesn't know this device yet. Turn notifications off and on again." : "Couldn't send the test notification.");
    } catch (e) { toast("Can't reach the server."); }
  };
  // Link in the email: <app>#unsub=<owner>.<signature>
  function checkUnsub() {
    const m = /^#unsub=([0-9a-f-]{36})\.([0-9a-f]{64})$/i.exec(location.hash); if (!m) return;
    C.unsub = { u: m[1], s: m[2] }; openSheet('unsubSheet');
  }
  window.cloudUnsub = async function () {
    if (!C.unsub) return;
    try {
      const r = await fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY }, body: JSON.stringify(C.unsub) });
      if (!r.ok) throw 0;
      closeSheet('unsubSheet'); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      if (C.mail) C.mail.email_enabled = false; renderMail(); toast('Done. You will not get more briefing emails.');
    } catch (e) { toast("Couldn't turn them off. Sign in and use Settings instead."); }
  };
  window.cloudShowGate = async function () { closeSheet('settingsSheet'); delete DB.localOnly; saveNow(); showGate(); await ensureClient(); };
  window.cloudSyncNow = function () { syncNow(); toast('Syncing…'); };
  window.cloudSignOut = async function () {
    if (!C.user) return;
    setState('syncing'); try { await pushAll(); } catch (e) {}
    const unsynced = Object.keys(DB.profiles).some(k => C.synced[k] !== JSON.stringify(DB.profiles[k]));
    const ok = unsynced
      ? confirm('Some recent changes have NOT reached the cloud yet. Signing out removes this device\'s copy, so they would be lost.\n\nOK = sign out anyway\nCancel = stay signed in (recommended)')
      : confirm('Sign out? Your progress stays safe in your account and returns when you sign back in.');
    if (!ok) { setState(unsynced ? 'offline' : 'synced'); return; }
    await dropDevicePush();
    try { await C.client.auth.signOut(); } catch (e) {}
    C.mail = null; stopLoop(); C.user = null; C.rows = {}; C.synced = {}; C.forceKeys.clear();
    wipeLocal(); setState('signedout'); closeSheet('settingsSheet'); renderAccount(); showGate();
  };
  window.cloudDeleteAccount = async function () {
    if (!C.user) return;
    if (prompt('This permanently deletes your account and ALL your cloud progress. It cannot be undone.\n\nType DELETE to confirm.') !== 'DELETE') return;
    await dropDevicePush();
    const r = await C.client.rpc('delete_my_account');
    if (r.error) return toast("Couldn't delete the account: " + r.error.message);
    try { await C.client.auth.signOut({ scope: 'local' }); } catch (e) {}
    stopLoop(); C.user = null; C.rows = {}; C.synced = {}; C.forceKeys.clear();
    wipeLocal(); setState('signedout'); closeSheet('settingsSheet'); renderAccount(); showGate(); toast('Your account was deleted.');
  };
  window.cloudHistory = async function () {
    const row = C.rows[DB.current]; if (!row) return toast('Nothing saved to the cloud yet. Try Sync now first.');
    const r = await C.client.from(H).select('id,rev,saved_at,data').eq('profile_id', row.id).order('saved_at', { ascending: false }).limit(48);
    if (r.error) return toast("Couldn't load history: " + r.error.message);
    C.hist = r.data || [];
    document.getElementById('histList').innerHTML = C.hist.length
      ? C.hist.map((v, i) => `<div class="quest row between"><div><b>${esc(new Date(v.saved_at).toLocaleString())}</b><div class="sub">${(v.data.xp || 0)} XP · ${(v.data.tasks || []).length} tasks · ${(v.data.coins || 0)} coins</div></div><button class="btn sm" onclick="cloudRestore(${i})">Restore</button></div>`).join('')
      : '<div class="empty">No snapshots yet. They are created automatically as you use the app.</div>';
    openSheet('histSheet');
  };
  window.cloudRestore = async function (i) {
    const v = C.hist[i]; if (!v) return;
    if (!confirm('Restore the version from ' + new Date(v.saved_at).toLocaleString() + '? Your current version is saved first.')) return;
    const key = DB.current;
    try { await pushAll(); } catch (e) {}
    DB.profiles[key] = normalize(clone(v.data)); saveNow();
    await window.cloudForce([key]);
    closeSheet('histSheet'); closeSheet('settingsSheet'); buildChrome(); renderAll(); toast('Version restored.');
  };

  /* ---------- boot ---------- */
  window.addEventListener('storage', e => { if (e.key === KEY && C.user) schedule(500); });
  (async function boot() {
    renderAccount();
    if (!ENABLED) { setState('local'); return; }
    checkUnsub();
    if (DB.localOnly) { setState('local'); return; }
    let hasSession = false; try { hasSession = !!localStorage.getItem(AUTH_KEY); } catch (e) {}
    if (!hasSession && !(DB.owner && !navigator.onLine)) showGate();   // show the sign-in screen immediately, before any sample data
    await startClient();
  })();
})();
