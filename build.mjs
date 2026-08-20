import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const result = await esbuild.build({
  entryPoints: [join(__dirname, "main.jsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  jsx: "automatic",
  write: false,
  define: { "process.env.NODE_ENV": '"production"' },
});

const js = result.outputFiles[0].text;

const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5" />
    <meta name="description" content="إدارة المزرعة: أبقار وماعز وأغنام ودواجن — حليب وبيض ومبيعات وفواتير" />
    <meta name="theme-color" content="#1B6B5A" />
    <meta name="color-scheme" content="light dark" />
    <title>مزرعتي · Mazraati</title>
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="مزرعتي" />
    <link rel="apple-touch-icon" href="./apple-touch-icon.png" />
    <link rel="icon" href="./icon-192.png" />
    <link rel="manifest" href="./manifest.webmanifest" />
    <style>
html,body,#root{height:100%}body{margin:0;background:#F8FAFC;color:#1A2420;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;text-size-adjust:100%;overscroll-behavior-y:none}input,select,textarea{font-size:16px}@media (prefers-color-scheme: dark){body{background:#0F1613;color:#E6F0EB}}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
${js}
    </script>
  </body>
</html>
`;

writeFileSync(join(__dirname, "index.html"), html, "utf8");
const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
console.log(`Built index.html (${kb} KB)`);
