# Mazraati v2.1.1 — Update GitHub Pages

Live app: https://basemsde-tech.github.io/mazraati/  
Repo: https://github.com/basemsde-tech/mazraati

## Required deploy files

| File | Required |
|------|----------|
| `index.html` | **Yes** — built app |
| `sw.js` | **Yes** — cache `mazraati-v2.1.1` |
| `manifest.webmanifest` | Recommended |
| `.nojekyll` | Recommended (GitHub Pages) |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` | Keep if already on GitHub |

## Rebuild after editing `App.jsx`

```powershell
cd "$env:USERPROFILE\Downloads\mazraati-deploy"
node build.mjs
```

Output: `index.html` (also bump `VERSION.code` in `App.jsx` and `CACHE` in `sw.js` together).

## Push with git (recommended)

```powershell
cd "$env:USERPROFILE\Downloads\mazraati-deploy"
git add -A
git status
git commit -m "Release v2.1.1: themes, production label, UI updates"
git push origin main
```

If this folder is not yet linked:

```powershell
git remote add origin https://github.com/basemsde-tech/mazraati.git
git push -u origin main
```

## Manual upload (fallback)

1. Open the repo → **Add file** → **Upload files**
2. Drag at least `index.html` and `sw.js`
3. Commit, wait ~1–2 minutes, then hard-refresh / private window:
   `https://basemsde-tech.github.io/mazraati/`

## What’s in v2.1.1

- Soft grey light theme + dark mode (header / Settings / Ctrl+K)
- Nav label: **Production** instead of “Today’s milk”
- Official app logo, forest teal redesign, AM/PM milk logging, Action Hub favorites

## What’s in v2.1.0

- Eye-comfort grey surfaces (less pure white)
- Light / dark appearance preference saved per device
