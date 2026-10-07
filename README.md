# AutoShorts — ClipShlip Releases

This repository is a fork of **Ai-Haris/ClipShlip-Releases**.

## AutoShorts direction

A local-first short-video workflow built around the ClipShlip release lineage:

- long-video input
- candidate clip detection and scoring
- transcript-aware selection
- 9:16 / 1080×1920 preparation
- caption timing
- MP4 export
- local worker / FFmpeg integration

## Current state

The repository now contains an initial AutoShorts web foundation with a responsive upload/workflow UI.

The actual video-processing engine is intentionally kept separate until the upstream source/license and release artifacts are available. No unavailable upstream source code has been fabricated or copied.

## Development

```bash
npm install
npm run dev
```

## License

Keep all upstream ClipShlip license and attribution notices intact. New AutoShorts code should receive an explicit license after the upstream source license is verified.
