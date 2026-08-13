# Company cloud sync (developer setup)

Mazraati syncs one shared farm database to every signed-in user in the same **company**.

**Stack:** Firebase Authentication (email/password) + Realtime Database  
**Why:** Works with static GitHub Pages, no custom server, proper accounts (not a secret URL).

## 1. Create a Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/)
2. Add a project (e.g. `mazraati`)
3. Add a **Web** app and copy the config object

## 2. Enable Email/Password

Authentication → Sign-in method → **Email/Password** → Enable

## 3. Create Realtime Database

Build → Realtime Database → Create  
- Start in **locked mode**  
- Copy the database URL (`https://….firebaseio.com`)

## 4. Paste security rules

Realtime Database → Rules → paste contents of `database.rules.json` → Publish

## 5. Put config in the app

Edit `firebase-config.js` and fill every field from the Firebase web config  
(especially `apiKey`, `authDomain`, `databaseURL`, `projectId`).

## 6. Authorized domains

Authentication → Settings → Authorized domains  
Add:

- `basemsde-tech.github.io`
- `localhost` (for local preview)

## 7. Rebuild & deploy

```powershell
cd "$env:USERPROFILE\Downloads\mazraati-deploy"
node build.mjs
git add -A
git commit -m "Configure company cloud sync"
git push origin main
```

## How company users use it

1. Settings → **Company sync**
2. **Create account** with work email + password (or Sign in)
3. Owner: **Create company** → share the **invite code**
4. Staff: **Join company** with that code
5. Farm data syncs automatically for everyone in the company

## Notes for you (developer)

- Client API keys are expected to be public; **security is the RTDB rules + Auth**
- Farm payload is stored at `companies/{id}/farmJson` (string). Keep logos compressed; very large farms may need Storage later
- Link-based JSONBlob sync remains only as a legacy/advanced fallback
- Leave `firebase-config.js` empty in public forks if you do not want a shared backend; the app still works offline on-device
