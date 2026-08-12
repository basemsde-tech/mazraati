# Mazraati v2.2.0 — Update GitHub Pages

Live app: https://basemsde-tech.github.io/mazraati/  
Repo: https://github.com/basemsde-tech/mazraati

## Cloud sync (easy)

1. Open **Settings → Backup & sync**
2. Tap **Create free sync**
3. Tap **Copy link** and paste the same link on other phones/PCs
4. Turn sync **On** there

Treat the link like a password. Optional advanced: JSONBin URL + master key.

## Required deploy files

| File | Required |
|------|----------|
| `index.html` | **Yes** — built app |
| `sw.js` | **Yes** — cache `mazraati-v2.2.0` |
| `manifest.webmanifest` | Recommended |
| `.nojekyll` | Recommended (GitHub Pages) |
| Icons | Keep if already on GitHub |

## Rebuild after editing `App.jsx`

```powershell
cd "$env:USERPROFILE\Downloads\mazraati-deploy"
node build.mjs
```

Bump `VERSION.code` in `App.jsx` and `CACHE` in `sw.js` together.

## Push with git

```powershell
cd "$env:USERPROFILE\Downloads\mazraati-deploy"
git add -A
git commit -m "Release v2.2.0: easy cloud sync"
git push origin main
```

## What’s in v2.2.0

- One-click free cloud sync (JSONBlob link)
- Cloud settings now persist on GitHub Pages / device storage
- JSONBin-compatible headers + `/latest` read URL
- Copy sync link for other devices
