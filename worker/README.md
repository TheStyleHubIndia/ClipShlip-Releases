# AutoShorts FFmpeg Worker

Local/self-hostable rendering service.

## API

### Health
GET `/health`

### Render
POST multipart/form-data to `/render`:

- `video`: source video
- `start`: clip start in seconds
- `end`: clip end in seconds

The worker renders H.264/AAC MP4 at 1080×1920 using a center crop.

## Run

Requires Node 22+ and FFmpeg:

```bash
npm install
npm start
```

Or:

```bash
docker build -t autoshorts-worker .
docker run --rm -p 8787:8787 autoshorts-worker
```

This worker intentionally does not claim face tracking or AI transcription yet. Those are separate pipeline stages.
