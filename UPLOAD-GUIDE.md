# مزرعتي · Mazraati — نسخة الرفع المباشر · Direct-upload edition

**v1.0.0** — ٨ ملفات، بدون أي مجلد، وبدون أي بناء أو تنصيب.
**v1.0.0** — 8 files, no folders, no build step, nothing to install.

---

## لماذا كانت الصفحة بيضاء؟ · Why the page was blank

النسخة السابقة كانت **مشروعًا برمجيًا** يحتاج خطوة بناء (`npm run build`). عند رفع ملفاته كما هي، كان المتصفح يحاول تشغيل ملف `src/App.jsx` وهو لا يفهمه — فتظهر صفحة بيضاء.

The previous version was a **source project** that needs a build step (`npm run build`). Uploaded as-is, the browser tried to run `src/App.jsx`, which it cannot read — hence the blank page.

هذه النسخة **مبنية مسبقًا**: التطبيق كامل داخل `index.html`.

This edition is **pre-built**: the entire app lives inside `index.html`.

---

## الملفات الثمانية · The eight files

| الملف · File | لماذا · Why |
|---|---|
| `index.html` | **التطبيق كامل** — الشيفرة والتصميم بداخله · the whole app, code and styling inside |
| `manifest.webmanifest` | الاسم والأيقونة عند التثبيت على الهاتف · name and icon when installed |
| `sw.js` | العمل بدون إنترنت · offline support |
| `icon-192.png` | أيقونة أندرويد · Android icon |
| `icon-512.png` | أيقونة كبيرة · large icon |
| `icon-maskable-512.png` | أيقونة أندرويد الدائرية · Android adaptive icon |
| `apple-touch-icon.png` | أيقونة آيفون · iPhone icon |
| `.nojekyll` | يمنع GitHub من معالجة الملفات · stops GitHub from processing the files |

> ⚠️ ارفع **الملفات نفسها** إلى جذر المستودع — لا ترفع مجلدًا يحتوي عليها.
> ⚠️ Upload **the files themselves** to the repository root — not a folder containing them.

---

## خطوات الرفع · Upload steps

### ١ — أنشئ المستودع · Create the repository

على GitHub: **New repository** ← الاسم `mazraati` ← **Public** ← **Create**.

> الاسم غير مهم — التطبيق يعمل تحت أي اسم مستودع.
> The name doesn't matter — the app works under any repository name.

### ٢ — ارفع الملفات · Upload the files

**Add file → Upload files**، ثم اسحب **الملفات الثمانية** دفعة واحدة.

**Add file → Upload files**, then drag **all eight files** in at once.

إن لم يظهر ملف `.nojekyll` عند السحب (بعض الأنظمة تخفي الملفات التي تبدأ بنقطة):
If `.nojekyll` doesn't appear when dragging (some systems hide dot-files):

- **Add file → Create new file** ← اكتب الاسم `.nojekyll` ← اتركه فارغًا ← **Commit**.

ثم اضغط **Commit changes**.

### ٣ — شغّل النشر · Turn on Pages

**Settings → Pages → Source: Deploy from a branch → Branch: `main` → Folder: `/ (root)` → Save**

### ٤ — افتح التطبيق · Open the app

انتظر دقيقة إلى دقيقتين، ثم:
Wait one or two minutes, then open:

```
https://<your-username>.github.io/mazraati/
```

يجب أن تظهر شاشة **«مَن يستخدم التطبيق؟»**. إن ظهرت — التطبيق يعمل.

You should see the **"Who is using the app?"** screen. If you do, it's working.

---

## ثبّته على الهاتف · Install it on the phone

**أندرويد** — افتح الرابط في Chrome ← ⋮ ← *Add to Home screen*
**آيفون** — افتح الرابط في Safari ← زر المشاركة ← *Add to Home Screen*

---

## التحديث لاحقًا · Updating later

عندما أرسل لك نسخة جديدة: **افتح `index.html` في المستودع ← أيقونة القلم ✏️ ← احذف كل المحتوى ← الصق الجديد ← Commit.**

When you get a new version: **open `index.html` in the repo → pencil icon ✏️ → select all → paste the new content → Commit.**

أو ببساطة ارفع الملف الجديد فوق القديم عبر **Upload files**.
Or simply upload the new file over the old one via **Upload files**.

---

## إذا بقيت الصفحة بيضاء · If the page is still blank

| السبب المحتمل · Likely cause | الحل · Fix |
|---|---|
| الملفات داخل مجلد · files inside a folder | يجب أن يظهر `index.html` مباشرة في الصفحة الأولى للمستودع · `index.html` must appear on the repository's first page |
| النشر لم يكتمل · Pages not finished | افتح تبويب **Actions** وانتظر العلامة الخضراء · check the **Actions** tab for the green tick |
| المجلد خطأ في الإعدادات · wrong folder setting | **Settings → Pages** يجب أن يكون **`/ (root)`** وليس `/docs` |
| نسخة قديمة محفوظة · cached old version | أغلق التبويب وافتح الرابط في نافذة تصفح خفي · reopen the link in a private window |

---

## البيانات · Your data

في هذه النسخة تُحفظ البيانات **على كل هاتف على حدة**.
In this edition the data is saved **on each phone separately**.

لكي يرى كل العمال المزرعة نفسها، فعّل **☁️ المزامنة السحابية** من الإعدادات على كل هاتف بنفس الرابط.
For everyone to share one farm, turn on **☁️ Cloud sync** in Settings on every phone, using the same URL.

خذ نسخة احتياطية أسبوعيًا: **الإعدادات ← 💾 النسخ الاحتياطي ← نسخة كاملة (JSON)**.
Take a weekly backup: **Settings → 💾 Backup → Full backup (JSON)**.
