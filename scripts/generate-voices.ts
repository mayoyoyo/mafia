/**
 * Generate narrator voice cues using ElevenLabs TTS API.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_... bun run scripts/generate-voices.ts
 *
 * Free tier: 10,000 chars/month. This script uses ~5,500 chars (17 phrases x 4 voices).
 * Run with --dry-run to see what would be generated without calling the API.
 */

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error("Set ELEVENLABS_API_KEY environment variable");
  process.exit(1);
}

// ── Voices ──────────────────────────────────────────────────────
// Pick 3-4 voices with distinct character. To browse voices:
//   curl -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/voices | jq '.voices[] | {voice_id, name, labels}'
//
// Default ElevenLabs voices (available on free tier):
const VOICES: { id: string; label: string }[] = [
  { id: "29vD33N1CtxCmqQRPOHJ", label: "drew" },       // American male, well-rounded
  { id: "ErXwobaYiN019PkySvjV", label: "antoni" },      // American male, warm
  { id: "VR6AewLTigWG4xSOukaG", label: "arnold" },      // American male, crisp
  { id: "21m00Tcm4TlvDq8ikWAM", label: "rachel" },      // American female, calm
];

// ── Phrases ─────────────────────────────────────────────────────
// These match the fixed narrator arrays in src/narrator.ts exactly.

const PHRASES: { category: string; slug: string; text: string }[] = [
  // Night falls
  { category: "night-falls", slug: "night-falls-1", text: "The sun sets and shadows creep across the town. Night has fallen. Lock your doors... and maybe your fridge." },
  { category: "night-falls", slug: "night-falls-2", text: "Darkness descends. The town sleeps, but not everyone rests peacefully. Someone is definitely up to no good." },
  { category: "night-falls", slug: "night-falls-3", text: "Night falls like a curtain. Somewhere in the dark, plans are being made and snacks are being eaten..." },
  { category: "night-falls", slug: "night-falls-4", text: "The last light fades. Another night begins, and with it, the Mafia stirs. Everyone else? Anxiety stirs." },

  // Day breaks
  { category: "day-breaks", slug: "day-breaks-1", text: "The first rays of sunlight pierce the darkness. A new day dawns... but at what cost?" },
  { category: "day-breaks", slug: "day-breaks-2", text: "Morning comes. The rooster crows. The coffee is strong. But is everyone still here to drink it?" },
  { category: "day-breaks", slug: "day-breaks-3", text: "The sun rises on another day. Time to find out who survived and who... didn't make the cut." },

  // No kill
  { category: "no-kill", slug: "no-kill-1", text: "The town wakes to an unusual calm. Everyone is alive. The Mafia must've had WiFi issues." },
  { category: "no-kill", slug: "no-kill-2", text: "Dawn arrives peacefully. No blood was spilled. Did the Mafia oversleep? Classic." },
  { category: "no-kill", slug: "no-kill-3", text: "A quiet night passes without incident. The Mafia apparently had better things to do, like laundry." },
  { category: "no-kill", slug: "no-kill-4", text: "Nobody died! The Mafia must have gotten distracted by a Netflix binge. Lucky break, everyone." },

  // Town wins
  { category: "town-win", slug: "town-win-1", text: "The last Mafia member falls. The town erupts in celebration. Someone brought confetti! The Citizens win! Time for a pizza party." },
  { category: "town-win", slug: "town-win-2", text: "Justice prevails! Every Mafia member has been found and eliminated. The town is safe once more. Citizens win! Group hug, everyone!" },
  { category: "town-win", slug: "town-win-3", text: "The shadow over the town lifts. With every Mafia member gone, peace returns at last. Victory for the Citizens! Now who left the fridge open?" },

  // Mafia wins
  { category: "mafia-win", slug: "mafia-win-1", text: "The town falls silent. The Mafia now runs this place. Everyone gets a horse head pillow. The Mafia wins!" },
  { category: "mafia-win", slug: "mafia-win-2", text: "It's over. The Mafia has grown too powerful, and honestly, their outfits are way better. The Mafia wins!" },
  { category: "mafia-win", slug: "mafia-win-3", text: "The citizens look around and realize they're outnumbered. The Mafia claims victory and immediately raises HOA fees!" },
];

// ── Generation ──────────────────────────────────────────────────

const OUT_DIR = new URL("../public/audio", import.meta.url).pathname;
const DRY_RUN = process.argv.includes("--dry-run");

let totalChars = 0;

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
  console.log(`Generating ${PHRASES.length} phrases x ${VOICES.length} voices = ${PHRASES.length * VOICES.length} files`);
  console.log(`Output: ${OUT_DIR}/\n`);

  // Ensure output dirs exist
  const categories = [...new Set(PHRASES.map((p) => p.category))];
  for (const cat of categories) {
    await Bun.write(`${OUT_DIR}/${cat}/.keep`, "");
  }

  let generated = 0;
  let skipped = 0;

  for (const phrase of PHRASES) {
    for (const voice of VOICES) {
      const filename = `${OUT_DIR}/${phrase.category}/${phrase.slug}-${voice.label}.mp3`;
      totalChars += phrase.text.length;

      // Skip if file already exists (resume support)
      const exists = await Bun.file(filename).exists();
      if (exists) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`[DRY] ${phrase.slug}-${voice.label}.mp3 (${phrase.text.length} chars)`);
        generated++;
        continue;
      }

      console.log(`Generating: ${phrase.slug}-${voice.label}.mp3 ...`);
      try {
        const audio = await generateAudio(voice.id, phrase.text);
        await Bun.write(filename, audio);
        generated++;
        // Small delay to be nice to the API
        await Bun.sleep(500);
      } catch (e) {
        console.error(`  FAILED: ${e}`);
      }
    }
  }

  console.log(`\nDone! Generated: ${generated}, Skipped (already exist): ${skipped}`);
  console.log(`Total characters used: ~${totalChars} / 10,000 free tier`);
}

main();
