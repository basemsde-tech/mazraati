import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appJsx = fs.readFileSync(path.join(__dirname, "App.jsx"), "utf8");
const m = appJsx.match(/const APP_MARK_SRC = "data:image\/jpeg;base64,([^"]+)"/);
if (!m) throw new Error("APP_MARK_SRC not found in App.jsx");

const logoBuf = Buffer.from(m[1], "base64");
const brand = { r: 27, g: 107, b: 90 }; // #1B6B5A

async function makeIcon(size, out, { maskable = false, bg = brand } = {}) {
  const pad = maskable ? Math.round(size * 0.18) : Math.round(size * 0.12);
  const inner = size - pad * 2;
  const logo = await sharp(logoBuf)
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...bg, alpha: 1 },
    },
  })
    .composite([{ input: logo, left: pad, top: pad }])
    .png()
    .toFile(path.join(__dirname, out));

  console.log("wrote", out, size);
}

await makeIcon(192, "icon-192.png", { bg: brand });
await makeIcon(512, "icon-512.png", { bg: brand });
await makeIcon(512, "icon-maskable-512.png", { maskable: true, bg: brand });
await makeIcon(180, "apple-touch-icon.png", { bg: brand });

// Keep a clean source asset for future regenerations
fs.writeFileSync(path.join(__dirname, "assets", "mazraati-mark.jpg"), logoBuf);
console.log("done");
