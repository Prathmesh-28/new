// PWA / apple-touch PNG icons from the Headroom mark (white field, navy mark, green dot).
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const NAVY = "#1E2A4E", GREEN = "#5FBE7C";
const BBOX = { cx: 65.75, cy: 46.25, w: 114.5 }; // mark bbox in its 128x100 space

function svg(canvas, contentW, bg) {
  const scale = contentW / BBOX.w;
  const tx = canvas / 2 - BBOX.cx * scale, ty = canvas / 2 - BBOX.cy * scale;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
    <rect width="${canvas}" height="${canvas}" fill="${bg}"/>
    <g transform="translate(${tx} ${ty}) scale(${scale})">
      <path d="M14 74 H112" stroke="${NAVY}" stroke-width="11" stroke-linecap="round" fill="none"/>
      <path d="M68 74 L99 34" stroke="${NAVY}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle cx="112" cy="24" r="11" fill="${GREEN}"/>
    </g></svg>`);
}
const out = (name, canvas, content, bg = "#ffffff") =>
  sharp(svg(canvas, content, bg)).png().toBuffer().then(b => { writeFileSync(`public/${name}`, b); console.log("wrote public/" + name); });

await Promise.all([
  out("icon-192.png", 192, 110),
  out("icon-512.png", 512, 290),
  out("icon-512-maskable.png", 512, 220), // smaller content → safe zone for maskable
  out("apple-touch-icon.png", 180, 104),
]);
console.log("done");
