#!/usr/bin/env bash
# Regenerate the narrator-voice audio for the Mafia game.
#
# 14 accents x {male, female} = 28 voices, 11 cues each = 308 MP3s.
# Uses edge-tts (Microsoft Edge neural voices) — free, no account, no API key.
#
# Requires `uv` (https://docs.astral.sh/uv/). Runs edge-tts via `uvx`.
#
# Usage:
#   bash scripts/generate-narration.sh          # skip clips that already exist
#   FORCE=1 bash scripts/generate-narration.sh   # regenerate everything
#
# Output: public/audio/<accent>-<gender>/<cue>.mp3
# Keep this in sync with public/narration.json (accent keys + cue texts).

set -euo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)/public/audio"

# cue key | spoken text  (must match public/narration.json cues)
CUES=(
  "everyone_close|Night falls over the town. Everyone, close your eyes."
  "mafia_open|Mafia, open your eyes."
  "mafia_close|Mafia, close your eyes."
  "doctor_open|Doctor, open your eyes."
  "doctor_close|Doctor, close your eyes."
  "detective_open|Detective, open your eyes."
  "detective_close|Detective, close your eyes."
  "vigilante_open|Vigilante, open your eyes."
  "vigilante_close|Vigilante, close your eyes."
  "hunter_open|Hunter, open your eyes."
  "hunter_close|Hunter, close your eyes."
)

# <accent>-<gender> | edge-tts voice
VOICES=(
  "classic-male|en-US-AndrewNeural"            "classic-female|en-US-AriaNeural"
  "british-male|en-GB-RyanNeural"              "british-female|en-GB-SoniaNeural"
  "australian-male|en-AU-WilliamMultilingualNeural" "australian-female|en-AU-NatashaNeural"
  "indian-male|en-IN-PrabhatNeural"            "indian-female|en-IN-NeerjaNeural"
  "irish-male|en-IE-ConnorNeural"              "irish-female|en-IE-EmilyNeural"
  "south-african-male|en-ZA-LukeNeural"        "south-african-female|en-ZA-LeahNeural"
  "new-zealand-male|en-NZ-MitchellNeural"      "new-zealand-female|en-NZ-MollyNeural"
  "nigerian-male|en-NG-AbeoNeural"             "nigerian-female|en-NG-EzinneNeural"
  "canadian-male|en-CA-LiamNeural"             "canadian-female|en-CA-ClaraNeural"
  "hong-kong-male|en-HK-SamNeural"             "hong-kong-female|en-HK-YanNeural"
  "kenyan-male|en-KE-ChilembaNeural"           "kenyan-female|en-KE-AsiliaNeural"
  "filipino-male|en-PH-JamesNeural"            "filipino-female|en-PH-RosaNeural"
  "singaporean-male|en-SG-WayneNeural"         "singaporean-female|en-SG-LunaNeural"
  "tanzanian-male|en-TZ-ElimuNeural"           "tanzanian-female|en-TZ-ImaniNeural"
)

made=0; skipped=0
for vp in "${VOICES[@]}"; do
  vk="${vp%%|*}"; vn="${vp##*|}"
  mkdir -p "$BASE/$vk"
  for cp in "${CUES[@]}"; do
    ck="${cp%%|*}"; ct="${cp##*|}"
    out="$BASE/$vk/$ck.mp3"
    if [ -s "$out" ] && [ "${FORCE:-0}" != "1" ]; then
      skipped=$((skipped+1)); continue
    fi
    uvx edge-tts --voice "$vn" --text "$ct" --write-media "$out" >/dev/null 2>&1
    made=$((made+1))
  done
done
echo "narration audio: $made generated, $skipped skipped -> $BASE"
