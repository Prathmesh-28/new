// Renders the Headroom brand source assets (app icon + splash) from the logo SVG
// into assets/, which @capacitor/assets then expands into the full iOS + Android sets.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const NAVY = "#1E2A4E", GREEN = "#5FBE7C", CREAM = "#FDFAF0", DARK = "#0D1117";

// Visual bounding box of the mark within its 128x100 design space (incl. stroke + dot).
const BBOX = { cx: 65.75, cy: 46.25, w: 114.5 };

// Mark centered on a square canvas, drawn with the given stroke colour.
function markGroup(canvas, contentW, stroke) {
  const scale = contentW / BBOX.w;
  const tx = canvas / 2 - BBOX.cx * scale;
  const ty = canvas / 2 - BBOX.cy * scale;
  return `<g transform="translate(${tx} ${ty}) scale(${scale})">
    <path d="M14 74 H112" stroke="${stroke}" stroke-width="11" stroke-linecap="round" fill="none"/>
    <path d="M68 74 L99 34" stroke="${stroke}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="112" cy="24" r="11" fill="${GREEN}"/>
  </g>`;
}
const svg = (canvas, body) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">${body}</svg>`
);

mkdirSync("assets", { recursive: true });
const out = (name, buf) => buf.then(b => { writeFileSync(`assets/${name}`, b); console.log("wrote assets/" + name); });

await Promise.all([
  // iOS full-bleed icon: white field, navy mark.
  out("icon-only.png", sharp(svg(1024, `<rect width="1024" height="1024" fill="#ffffff"/>${markGroup(1024, 560, NAVY)}`)).png().toBuffer()),
  // Android adaptive: transparent foreground (mark in the central safe zone) + white background.
  out("icon-foreground.png", sharp(svg(1024, markGroup(1024, 460, NAVY))).png().toBuffer()),
  out("icon-background.png", sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#ffffff" } }).png().toBuffer()),
  // Splash: brand-dark field with the light mark centred.
  out("splash.png", sharp(svg(2732, `<rect width="2732" height="2732" fill="${DARK}"/>${markGroup(2732, 820, CREAM)}`)).png().toBuffer()),
  out("splash-dark.png", sharp(svg(2732, `<rect width="2732" height="2732" fill="${DARK}"/>${markGroup(2732, 820, CREAM)}`)).png().toBuffer()),
]);
console.log("done");
