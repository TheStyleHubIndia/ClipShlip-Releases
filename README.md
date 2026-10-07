# ClipShlip-Releases — AutoShorts

A production-oriented web foundation for turning long videos into vertical Shorts.

## Current build

- Responsive AutoShorts interface
- Local video-file selection
- 9:16 / 1080×1920 target
- Vite production build
- GitHub Pages deployment on every push to `main`
- Processing architecture kept separate from the UI so the real video engine can be added without replacing the interface

## Development

```bash
npm install
npm run dev
npm run build
npm run preview
```

## GitHub Pages

The project is configured for the repository path:

`/ClipShlip-Releases/`

The workflow in `.github/workflows/deploy-pages.yml` builds and deploys automatically.

## Processing engine

The web shell does not pretend to contain an upstream ClipShlip processing engine when that source is not present in this fork. The next implementation layer can add a local FFmpeg/worker pipeline for:

1. full-video analysis
2. candidate segment detection
3. clip scoring
4. transcript-aware selection
5. face/speaker-aware reframing
6. 9:16 rendering
7. timed captions
8. MP4 export

Any upstream code or release assets must retain their original license and notices; verify the upstream license before reusing source code.

## License

See the upstream project and release notices for applicable licensing. Do not remove upstream attribution.
