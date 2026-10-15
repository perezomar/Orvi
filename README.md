# Orvi: setup guide

Orvi is a study planner with a companion. It is a web app: it runs in any modern browser and installs on a phone's home screen like a normal app.

Files in this folder (keep them together):

| File | Purpose |
|---|---|
| `index.html` | The whole app |
| `manifest.json` | Tells phones how to install it (name, icon, colors) |
| `sw.js` | Lets it open offline |
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
- **Profiles:** College, High school and Middle school are separate. Each has its own tasks, XP, coins and companion.
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

## Changing the name later
Edit `APP_NAME` near the top of the script in `index.html`, plus the `<title>`, and the names in `manifest.json`.

## Adding companions
In `index.html`, copy one `registerCompanion('...', {...})` block, change the id, label, colors, ears and unlock rule. It appears automatically on the Buddy screen.

## Naming and trademark note
"Orvi" showed no direct conflicts in a quick web search, but that is not a legal clearance. Check the USPTO trademark database and domain availability before you publish or spend money on branding.
