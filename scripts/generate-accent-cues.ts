/**
 * Generate everyone_close.mp3 narrator cues for all 8 accents using ElevenLabs TTS API.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_... bun run scripts/generate-accent-cues.ts
 *
 * Each accent maps to a specific ElevenLabs voice for distinct character.
 * Run with --dry-run to see what would be generated without calling the API.
 */

import fs from "fs";
import path from "path";

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("Set ELEVENLABS_API_KEY environment variable");
  process.exit(1);
}

// ── Accent → Voice mapping ──────────────────────────────────────
const ACCENT_VOICES: Record<string, string> = {
  classic:       "cjVigY5qzO86Huf0OWal", // Eric — smooth, trustworthy
  british:       "JBFqnCBsd6RMkjVDRZzb", // George — warm British storyteller
  australian:    "IKne3meq5aSn9XLyUdCD", // Charlie — deep Australian
  southern:      "iP95p4xoKVk53GoZ742B", // Chris — charming, down-to-earth
  italian:       "nPczCjzI2devNBz1zQrb", // Brian — deep, resonant + Italian text
  pirate:        "SOYHLrjzK2X1ezoPC6cr", // Harry — fierce warrior, rough
  transylvanian: "N2lVS1w4EtoT3dr4eOWO", // Callum — husky trickster
  noir:          "pNInz6obpgDQGcFmaJgB", // Adam — dominant, firm
};

// ── Load narration text from narration.json ─────────────────────
const narrationPath = path.join(import.meta.dir, "..", "public", "narration.json");
const narrationData = JSON.parse(fs.readFileSync(narrationPath, "utf-8"));

const OUT_DIR = path.join(import.meta.dir, "..", "public", "audio");
const DRY_RUN = process.argv.includes("--dry-run");
const CUE = "everyone_close";

async function generateAudio(voiceId: string, text: string): Promise<ArrayBuffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": API_KEY!,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.4,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs API error ${res.status}: ${err}`);
  }

  return res.arrayBuffer();
}

async function main() {
  const accents = Object.keys(ACCENT_VOICES);
  console.log(`Generating ${CUE}.mp3 for ${accents.length} accents`);
  console.log(`Output: ${OUT_DIR}/\n`);

  let generated = 0;
  let skipped = 0;
  let totalChars = 0;

  for (const accent of accents) {
    const voiceId = ACCENT_VOICES[accent];
    const text = narrationData.cues[accent]?.[CUE];
    if (!text) {
      console.error(`No text found for ${accent}/${CUE} in narration.json`);
      continue;
    }

    const outDir = path.join(OUT_DIR, accent);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const filename = path.join(outDir, `${CUE}.mp3`);
    totalChars += text.length;

    // Skip if file already exists (resume support)
    if (fs.existsSync(filename)) {
      console.log(`  SKIP (exists): ${accent}/${CUE}.mp3`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[DRY] ${accent}/${CUE}.mp3 — "${text}" (${text.length} chars)`);
      generated++;
      continue;
    }

    console.log(`Generating: ${accent}/${CUE}.mp3 ...`);
    try {
      const audio = await generateAudio(voiceId, text);
      await Bun.write(filename, audio);
      generated++;
      // Small delay to be nice to the API
      await Bun.sleep(500);
    } catch (e) {
      console.error(`  FAILED: ${e}`);
    }
  }

  console.log(`\nDone! Generated: ${generated}, Skipped (already exist): ${skipped}`);
  console.log(`Total characters used: ~${totalChars}`);
}

main();
