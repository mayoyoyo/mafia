// Generate simple SVG-based PNG icons for the PWA
// Run with: bun run scripts/generate-icons.ts

import fs from "fs";
import path from "path";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="90" fill="#0a0a0a"/>
  <rect x="20" y="20" width="472" height="472" rx="75" fill="#151515"/>
  <text x="256" y="300" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="260" fill="#e91e63">M</text>
  <text x="256" y="420" text-anchor="middle" font-family="Arial,sans-serif" font-weight="600" font-size="60" fill="#8e8e93" letter-spacing="12">MAFIA</text>
</svg>`;

const iconsDir = path.join(import.meta.dir, "..", "public", "icons");
fs.mkdirSync(iconsDir, { recursive: true });

// Write SVG versions (browsers can use these)
fs.writeFileSync(path.join(iconsDir, "icon-192.svg"), svg);
fs.writeFileSync(path.join(iconsDir, "icon-512.svg"), svg);

// For actual PNG generation we'd need a canvas library.
// For now, we serve the SVG as the icon and update manifest.
// Most modern browsers and iOS support SVG icons.

console.log("Icons generated (SVG). Update manifest.json if needed for PNG.");
