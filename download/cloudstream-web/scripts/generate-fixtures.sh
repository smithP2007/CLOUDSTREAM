#!/usr/bin/env bash
# Generates TINY deterministic test fixtures for the media player (demo page + tests).
#
# Provenance & licensing: every asset below is GENERATED LOCALLY by the ffmpeg CLI
# from synthetic sources (`testsrc` color bars / `sine` tones). No copyrighted
# material is downloaded or committed. Files are 1-2 seconds long and a few KiB.
#
# Requirements: ffmpeg with libx264, libvpx, libtheora, libvorbis, libopus, libmp3lame.
# Run: npm run fixtures:generate   (writes into demo/fixtures/)
set -euo pipefail

command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg CLI not found" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/demo/public/fixtures"
mkdir -p "$OUT/hls" "$OUT/subs"

VIDEO="-f lavfi -i testsrc=duration=2:size=320x180:rate=24"
AUDIO="-f lavfi -i sine=frequency=440:duration=2"

echo "== MP4 (H.264 baseline + AAC) =="
ffmpeg -hide_banner -loglevel error -y $VIDEO $AUDIO \
  -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p \
  -c:a aac -b:a 48k -shortest -movflags +faststart "$OUT/sample-mp4.mp4"

echo "== WebM (VP9 + Opus) =="
ffmpeg -hide_banner -loglevel error -y $VIDEO $AUDIO \
  -c:v libvpx-vp9 -b:v 150k -deadline realtime -cpu-used 8 \
  -c:a libopus -b:a 48k -shortest "$OUT/sample-webm.webm"

echo "== Ogg (Theora + Vorbis) =="
ffmpeg -hide_banner -loglevel error -y $VIDEO $AUDIO \
  -c:v libtheora -q:v 5 -c:a libvorbis -q:a 2 -shortest "$OUT/sample-ogg.ogg"

echo "== MKV (Matroska container, H.264 + AAC) =="
ffmpeg -hide_banner -loglevel error -y $VIDEO $AUDIO \
  -c:v libx264 -profile:v baseline -pix_fmt yuv420p \
  -c:a aac -b:a 48k -shortest -f matroska "$OUT/sample-mkv.mkv"

echo "== AVI (MPEG-4 part 2 + MP3) =="
ffmpeg -hide_banner -loglevel error -y $VIDEO $AUDIO \
  -c:v mpeg4 -q:v 6 -c:a libmp3lame -b:a 48k -shortest -f avi "$OUT/sample-avi.avi"

echo "== MOV (H.264 + AAC) =="
ffmpeg -hide_banner -loglevel error -y $VIDEO $AUDIO \
  -c:v libx264 -profile:v baseline -pix_fmt yuv420p \
  -c:a aac -b:a 48k -shortest -f mov -movflags +faststart "$OUT/sample-mov.mov"

echo "== HLS VOD (2 x ~1s MPEG-TS segments + media playlist) =="
ffmpeg -hide_banner -loglevel error -y $VIDEO $AUDIO \
  -c:v libx264 -profile:v baseline -pix_fmt yuv420p -g 24 \
  -c:a aac -b:a 48k -shortest \
  -f hls -hls_time 1 -hls_list_size 0 -hls_flags independent_segments \
  -hls_segment_filename "$OUT/hls/seg_%d.ts" "$OUT/hls/index.m3u8"

echo "== Subtitles (WebVTT + SubRip, same 3 cues) =="
cat > "$OUT/subs/sample-en.vtt" <<'VTT'
WEBVTT

00:00:00.000 --> 00:00:00.700
Hello from the generated fixture (cue 1).

00:00:00.700 --> 00:00:01.400
Second cue: seeking should keep captions in sync.

00:00:01.400 --> 00:00:02.000
Final cue.
VTT
cat > "$OUT/subs/sample-en.srt" <<'SRT'
1
00:00:00,000 --> 00:00:00,700
Hello from the generated fixture (cue 1).

2
00:00:00,700 --> 00:00:01,400
Second cue: seeking should keep captions in sync.

3
00:00:01,400 --> 00:00:02,000
Final cue.
SRT

echo "== Generated files =="
ls -l "$OUT" "$OUT/hls" "$OUT/subs" | awk '{print $5, $9}'
