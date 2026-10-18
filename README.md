# Orvi: setup guide

Orvi is a study planner with a companion. It is a web app: it runs in any modern browser and installs on a phone's home screen like a normal app.

Files in this folder (keep them together):

| File | Purpose |
|---|---|
| `index.html` | The whole app |
| `manifest.json` | Tells phones how to install it (name, icon, colors) |
| `sw.js` | Lets it open offline |
| `cloud.js` | Accounts and cloud sync (does nothing until you add keys) |
| `config.js` | Where you paste your Supabase keys (Part 7) |
| `supabase/schema.sql` | The database setup, run once in Supabase (Part 7) |
| `supabase/notifications.sql`, `push.sql`, `quiet.sql` | Briefing, push and quiet-hours setup (Parts 8 and 9) |
| `supabase/share.sql` | Read-only parent links (Part 10) |
| `supabase/scan.sql`, `supabase/functions/scan-import/` | The AI scanner (Part 11) |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | App icons |

---

## Part 1: Try it right now (2 minutes)

1. Unzip the folder.
2. Double-click `index.html`. It opens in your browser and works.

This is for a quick look only. Phones can't install it from a file on your computer, and offline mode needs it hosted (Part 2).

---

## Part 2: Put it online for free (15 minutes)

You'll get a link like `https://yourname.github.io/orvi/` that works on every phone and computer.

### Option A: GitHub Pages
1. Create a free account at github.com.
2. Click **New repository**. Name it `orvi`. Set it to **Public**. Click **Create repository**.
3. On the new repo page click **uploading an existing file**.
4. Drag in ALL files from the folder (the 3 app files and the 4 icons, but not this README unless you want it). Click **Commit changes**.
5. Go to **Settings, then Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, choose **main** and **/ (root)**, then **Save**.
6. Wait about a minute and refresh. The page shows your live link.

### Option B: Netlify Drop (fastest)
1. Go to app.netlify.com/drop and sign up free.
2. Drag the whole folder onto the page.
3. You get a live link immediately. You can rename it in Site settings.

---

## Part 3: Install it on your devices

**iPhone or iPad (must use Safari):**
1. Open your link in Safari.
2. Tap the Share button (square with an up arrow).
3. Tap **Add to Home Screen**, then **Add**.

**Android (Chrome):**
1. Open your link in Chrome.
2. Tap the menu (three dots), then **Install app** (or **Add to Home screen**).

**Computer (Chrome or Edge):**
1. Open your link.
2. Click the install icon at the right end of the address bar, then **Install**.

Open it from the new icon. It runs full screen like an app.

---

## Part 4: Using it well

- **First run:** go to Settings, tap **Clear sample tasks**, then add your real courses. Use the **+** button to add tasks, import a calendar (.ics file) or paste a syllabus.
- **People and levels:** Orvi starts empty. The first time you open it, it asks for a name and a level (Elementary, Middle school, High school, College, Grad school, or Work / Professional). Each person has their own tasks, XP, coins and companion. Tap the name at the top (phone) or in the sidebar (desktop) to switch or **Add a person**. Two people can share a level. Settings has **Edit name or level**. **Remove** hides a person but keeps their progress; restore them under Settings, **Removed people**. With cloud sync on, names, levels and removals follow you across devices.
- **Look and feel:** each person gets a look that matches their level, and you can change it in Settings, **Look and feel**. **Kid friendly** has bigger buttons, a bigger companion and words like Subjects, Homework and Tests. **Standard** is the default for middle school through grad school. **Professional** is calmer and more compact, with Projects, Tasks, Check-ins and Deadlines, and a small companion. Pick **Match their level** to go back to the default.
- **Staying organized:** the top of Home always shows one task to do right now, with a reason (Start, Done or Not now). A **Heads up** card appears when a day has more due than you usually have time for, and names a task to start early. The Plan tab shows the next 7 days as bars against your usual study time (set it under Settings, **Study time per day**). If two or more tasks are overdue, **Give me a fresh start** spreads them over the coming days without overloading any day, and it can be undone. **Review** on Home opens a one-screen look at the last week and the next one; it also pops up as a card from Friday afternoon to Monday morning.
- **Reminders:** tap **Daily briefing**, then **Enable reminders**. Reminders only fire while the app is open. Reliable background notifications need the accounts build (see Part 6).

### Protect your progress (important)
Progress is stored in your browser on that one device. It survives closing the app and restarting, and Orvi keeps an automatic backup copy. But:
- Clearing browser or site data deletes it.
- A phone and a computer do NOT share progress yet.
- On iPhone, Safari can delete website data if the app isn't opened for a long time (about 7 weeks). Installing to the Home Screen and opening it regularly avoids this, but it is not a guarantee.

So: **Settings, then Export backup** about once a week, and keep the file somewhere safe (cloud drive, email). To restore, use **Import backup**.

---

## Part 5: Updating the app later

1. Replace the changed file in your GitHub repo (open the file, click the pencil, paste, commit; or upload to replace it).
2. Wait a minute. Reload the app. If it still looks old, close it fully and reopen it (the offline cache refreshes on the next load).
3. Your progress is not touched by updates.

---

## Part 6: Taking it to the App Store

Short version: yes, it's possible, but do it in this order. A homework app that stores everything on one phone is not ready for the App Store.

### Step 1: Add accounts and sync first (required)
Inside a store app, the data can be wiped by the phone or the app being removed. Before launch you need real accounts and a cloud database so progress follows the student. The usual stack: **Supabase** (database and login) plus a small server for the AI scanner and push notifications. This is also where background reminders, the real screenshot scanner, and parent/student permissions come from.

### Step 2: Wrap it as a native app
The common route for a web app is **Capacitor** (free, open source), which puts your web app inside an iOS and Android shell. Roughly:
1. Install Node.js. In the project folder run `npm init -y`, then `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`.
2. Run `npx cap init Orvi com.yourname.orvi`, point it at the folder with `index.html`, then `npx cap add ios` and `npx cap add android`.
3. Open the iOS project in **Xcode** (requires a Mac) and the Android project in **Android Studio**.
4. Add native features through Capacitor plugins: push notifications, local notifications, haptics.

### Step 3: Accounts and fees (check current prices)
- **Apple Developer Program:** about $99/year. Needed to publish on the App Store.
- **Google Play Console:** about a $25 one-time fee.
- You need a **Mac with Xcode** to build and submit the iOS app.

### Step 4: Be ready for review
- **Apple can reject apps that are just a website in a wrapper** (App Review Guideline 4.2, minimum functionality). Real native features such as push notifications, offline sync and a polished experience help a lot.
- You need a **privacy policy** URL and accurate **privacy labels** (what data you collect).
- **Children's privacy:** if under-13s will use it, US law (COPPA) and App Store Kids rules apply, including parental consent and limits on data collection and analytics. Get a lawyer to review this before launch.
- Allow time for review and for back-and-forth with Apple.

### Step 5: Beta test first
Use **TestFlight** (iOS) and Google Play's **closed testing** with a handful of real students for a few weeks before public launch.

### Cheaper alternative
Many people skip the stores at first and just share the web link. The installed web app works well on phones, costs nothing, and updates instantly. Go to the stores only once the accounts build is done and students are asking for it.

---

---

## Part 7: Turn on accounts and cloud sync (Supabase, about 30 minutes)

With this on, students sign in with email and password, and progress follows them between phone and computer. The app still works offline and still saves on the device first. If you skip this part, Orvi simply stays a local-only app.

### 1. Create the project
1. Go to supabase.com and sign up free. Click **New project**.
2. Name it `orvi`. Choose a database password and **save it somewhere safe**. Pick the region closest to your users. Click **Create** and wait about 2 minutes.

### 2. Create the database
1. In the left menu click **SQL Editor**, then **New query**.
2. Open `supabase/schema.sql` from this folder, copy ALL of it, paste it in, and click **Run**. You should see "Success".
3. Click **Table Editor**. You should see `student_profiles` and `student_profile_history`, each marked **RLS enabled**. RLS is what stops one user from seeing another's data. Never turn it off.

### 3. Set up sign-in
1. Go to **Authentication, then Sign In / Providers** and make sure **Email** is on.
2. Keep **Confirm email** ON for real use (students must click a link in their inbox once). For quick testing you can turn it off.
3. Go to **Authentication, then URL Configuration**. Set **Site URL** to your live app link (for example `https://yourname.github.io/orvi/`). Add the same link under **Redirect URLs**. Password-reset and confirmation emails use this.

### 4. Copy your two keys
1. Go to **Project Settings, then API** (called **API Keys** in newer dashboards).
2. Copy the **Project URL** and the **anon / publishable** key.
3. **Never** use the `service_role` or `secret` key in this app. Anyone can read `config.js`.

### 5. Add the keys and upload
1. Open `config.js` in any text editor and paste the two values between the quotes. Save.
2. Upload ALL the files to your GitHub repo again (replace the old ones), including `cloud.js`, `config.js` and `sw.js`.
3. Wait a minute, then reload the app. Close and reopen it once if it still looks old.

### 6. Test it (do this before real students use it)
1. Open the app on your computer. You should see **Welcome to Orvi**. Create an account, confirm the email, sign in.
2. Add a task and complete it. In Supabase **Table Editor, then student_profiles** you should see one row appear.
3. Open the app on your phone and sign in with the same email. Your task and XP should be there.
4. Create a second test account in a private window. It must show NONE of the first account's data.
5. In Settings try **Version history**. Snapshots appear automatically as you use the app.

### Things to know
- **iPhone:** the installed Home Screen app has its own storage, separate from Safari. Sign in inside the installed app with your password. Email links open in Safari and will not sign in the installed app.
- **Free plan limits:** Supabase may pause free projects after a period of inactivity, and free plans do not include automatic database backups. Check the current terms in your dashboard. This app keeps its own version history and the Export backup button, so use both.
- **Shared devices:** signing out removes the local copy on purpose, so the next person never sees the previous student's data. It warns you first if something has not synced.
- **Two devices at once:** edits are merged, not overwritten. Tasks and purchases from both devices are kept. If a coin purchase happens on two devices before they sync, the higher coin balance wins (the student is never short-changed).
- **Deleting an account** (Settings) permanently removes the cloud data. The App Store requires this feature.
- **Children's privacy:** for students under 13, a parent should create the account and own the profiles. Get a lawyer to review COPPA and your privacy policy before you invite children.

## Changing the name later
Edit `APP_NAME` near the top of the script in `index.html`, plus the `<title>`, and the names in `manifest.json`.

## Adding companions
In `index.html`, copy one `registerCompanion('...', {...})` block, change the id, label, colors, ears and unlock rule. It appears automatically on the Buddy screen.

## Naming and trademark note
"Orvi" showed no direct conflicts in a quick web search, but that is not a legal clearance. Check the USPTO trademark database and domain availability before you publish or spend money on branding.

---

## Part 8: Email briefings (morning and evening emails, even when the app is closed)

Do this after Part 7 works. It needs a free Resend account and the Supabase command-line tool. Allow about 30 minutes.

How it works: every 5 minutes a Supabase scheduled job wakes a small function. The function checks each account's chosen times and time zone, builds the briefing from the saved progress, and sends one email per slot through Resend. Each account gets at most one morning and one evening email per day. Nothing is sent if there is nothing to say.

**1. Create the settings table.** In Supabase, open **SQL Editor**, paste `supabase/notifications.sql` (leave the commented part at the bottom alone for now) and click **Run**.

**2. Create a Resend account** at resend.com (free tier). Open **API Keys**, create a key, and copy it.
- Without your own domain, Resend can only send from `onboarding@resend.dev` to the email you signed up with. That is fine for testing on yourself.
- To email other people, add and verify your own domain in Resend, then set `MAIL_FROM` below (for example `Orvi <hello@yourdomain.com>`).

**3. Install the Supabase CLI** (supabase.com/docs/guides/cli), then in this folder run:
```
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```
(Your project ref is the letters in your Supabase URL, before `.supabase.co`.)

**4. Choose two long random secrets** (any password generator works), one for `CRON_SECRET` and one for `UNSUB_SECRET`. Then set the function's secrets:
```
supabase secrets set RESEND_API_KEY=re_xxx CRON_SECRET=your-first-secret UNSUB_SECRET=your-second-secret APP_URL=https://your-live-link/
supabase secrets set MAIL_FROM="Orvi <onboarding@resend.dev>"
```
`APP_URL` is the address where you host Orvi (with the trailing slash).

**5. Deploy the function:**
```
supabase functions deploy send-briefings --no-verify-jwt
```
(`--no-verify-jwt` is needed because the schedule and the unsubscribe link call it without a login. The function checks its own secrets instead.)

**6. Test it.** Open Orvi, Settings, **Email briefings**. Tick **Send me briefings**, choose your times and time zone, tap **Save**, then **Send a test email**. It should arrive within a minute. Check spam.

**7. Turn on the schedule.** In Supabase, open **Database, Extensions** and enable `pg_cron` and `pg_net`. Then in the SQL Editor, take the commented block at the bottom of `supabase/notifications.sql`, remove the `-- ` marks, replace `YOUR_PROJECT_REF` and `YOUR_CRON_SECRET` (the same value you used for `CRON_SECRET`), and run it.

**8. Check the schedule.** In **Edge Functions, send-briefings, Logs**, you should see a call every 5 minutes. Set a briefing time a few minutes ahead and confirm an email arrives.

Notes:
- Emails cover every active (not removed) person on the account, with a section per person.
- A briefing is sent if the job runs within 90 minutes after the chosen time, so a short outage will not skip a day. Later than that, it is skipped rather than sent stale.
- Every email has a "Turn them off" link, and mail apps show an unsubscribe button.
- To stop everything: `select cron.unschedule('orvi-briefings');`
- Cost: free Supabase and Resend tiers cover a small group. Check current limits before a wider launch.
- Phone notifications are Part 9.

---

## Part 9: Phone and desktop notifications (push)

Do this after Part 8 (it reuses the same schedule, times and function). Allow about 20 minutes.

What you get: the same morning and evening briefings, as a notification on each device where you turn it on. It works even when the app is closed.

Good to know first:
- **iPhone and iPad:** notifications only work after you add Orvi to the Home Screen (Part 3) and open it from there. iOS 16.4 or newer is required. In a normal Safari tab, Orvi shows a reminder to do this.
- **Android and computers (Chrome, Edge, Firefox):** works in the browser, with or without installing.
- Notifications are per device. Turn them on on each phone or computer you want them on.

**1. Add the database pieces.** In Supabase, SQL Editor, paste `supabase/push.sql` and click **Run**.

**2. Make your push keys** (a public and a private key). On any computer with Node.js installed, run:
```
npx web-push generate-vapid-keys
```
Copy both keys. The **public** key is safe to share. The **private** key must stay secret, like a password.

**3. Put the public key in the app.** Paste it into `config.js` as `VAPID_PUBLIC_KEY`, then re-upload the app files (Part 5).

**4. Give the server both keys:**
```
supabase secrets set VAPID_PUBLIC_KEY=your-public-key VAPID_PRIVATE_KEY=your-private-key VAPID_SUBJECT=mailto:you@example.com
```
`VAPID_SUBJECT` is a contact address for you. The push services use it if something goes wrong.

**5. Redeploy the function** (it has new code):
```
supabase functions deploy send-briefings --no-verify-jwt
```

**6. Turn it on in the app.** Open Orvi, Settings, **Briefings**, then **Notifications on this device**, then **Turn on**. Allow the permission prompt. Tap **Send a test notification**. It should appear within seconds.

**7. Choose your times.** The morning and evening times and time zone in the same section apply to both email and notifications. Tap **Save** after changing them. The schedule from Part 8 step 7 must be running.

Notes:
- If a device stops being reachable (app removed, notifications blocked, phone reset), the server notices and forgets it automatically.
- Signing out turns notifications off on that device.
- Tapping a notification opens Orvi.
- If the test notification does not arrive: check the permission in your phone or browser settings, check Edge Functions, send-briefings, Logs for errors, and confirm the public key in `config.js` is the same pair as the private key on the server.


## Part 10: Family features (optional)

**Family week (no setup).** When two or more people are on one account, Settings shows a **Family week** button. It lists everyone side by side: what is due in the next 7 days, what is overdue, and whether the week is heavier than usual. Tap a name to switch to that person.

**Share with a parent or tutor (needs one SQL step, about 3 minutes).**

1. In Supabase open **SQL Editor**, then **New query**. Paste all of `supabase/share.sql` and click **Run**. It should say success.
2. In Orvi, sign in, then Settings, **Account and sync**, **Share with a parent**.
3. Choose whether task names show, then **Create link**. Copy the link and send it to the parent or tutor.

What the link shows: that one person's upcoming tasks for about three weeks, what is overdue, and how many tasks were finished in the last 7 days. It is read-only and needs no account. It never shows notes, links, grades, flashcards or anyone else on the account.

Turning it off: the same screen has **Turn off sharing** (the link stops working at once) and **Make a new link** (the old link stops, a new one is created). Anyone who has the link can see it, so send it only to people you trust. Because the link works without signing in, treat it like a password for that one person's schedule.

For younger students, check the rules where you live about sharing a child's information, and tell the child who can see their link.


## Part 11: The scanner (photo, screenshot or PDF to tasks)

Students tap **+**, then **Scan**, and choose a photo, screenshot or PDF of a syllabus, assignment list or board. An AI reads it and proposes tasks. The student then checks each one (date, course) and taps **Add selected**. Nothing is added without that review. Low-confidence or undated items start switched off and marked **Check**. Pasting text and using **Find tasks (basic)** still works offline with no AI.

**How it works and what it costs.** The picture goes from the app to a Supabase Edge Function, and the function calls the Anthropic API with a key that only the server holds. The key is never in the app or in `config.js`. Each scan costs a few cents or less. Each person gets 15 scans a day by default so one account cannot run up your bill. You pay for scans through your Anthropic account, so decide before you open the app to others whether it stays free, has a daily limit, or becomes part of a paid plan.

**Setup (about 10 minutes).**

1. Get an API key at console.anthropic.com (API keys, create key). Add a small spending limit there.
2. In Supabase, SQL Editor, New query. Paste all of `supabase/scan.sql` and click Run.
3. On your computer, in this folder:

```
supabase secrets set ANTHROPIC_API_KEY=your-key-here
supabase secrets set SCAN_DAILY_LIMIT=15
supabase functions deploy scan-import
```

Do not add `--no-verify-jwt` here. Scanning must only work for signed-in people. Optional: `supabase secrets set SCAN_MODEL=` another model name if you want a cheaper or stronger one.

4. Open Orvi signed in, tap **+**, **Scan**, choose a photo of any dated list. You should see tasks to review.

If you see "scanner is not set up on the server", step 3's deploy did not finish. If you see "no AI key", the secret is missing. If scans stop for the day, the limit was reached.

**Privacy.** Pictures are sent to the AI service to be read, and are not saved by Orvi. Tell students not to scan anything with other people's personal details. For young children, check the rules where you live before turning this on, and mention it in your privacy policy.
