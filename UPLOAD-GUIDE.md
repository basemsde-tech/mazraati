# Mazraati v2.3.0 — GitHub Pages + company sync

Live: https://basemsde-tech.github.io/mazraati/  
Repo: https://github.com/basemsde-tech/mazraati

## For you (developer) — company email sync

See **[CLOUD-SYNC.md](./CLOUD-SYNC.md)** for Firebase setup.

1. Create Firebase project + Email/Password auth + Realtime Database  
2. Paste rules from `database.rules.json`  
3. Fill `firebase-config.js`  
4. `node build.mjs` then push to GitHub  

End users: Settings → Company sync → create account → create/join company with invite code.

## Rebuild

```powershell
cd "$env:USERPROFILE\Downloads\mazraati-deploy"
node build.mjs
```

Bump `VERSION.code` and `sw.js` `CACHE` together (`mazraati-v2.3.0`).

## Deploy files

`index.html`, `sw.js`, `manifest.webmanifest`, icons, `.nojekyll`  
Source: `App.jsx`, `firebaseCloud.js`, `firebase-config.js`, `build.mjs`
