import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "tmp");
fs.mkdirSync(root, { recursive: true });

const app = express();
const upload = multer({
  dest: root,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

app.get("/health", (_req, res) => res.json({
  ok: true,
  service: "autoshorts-worker",
  ffmpeg: "required"
}));

app.post("/render", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "video file is required" });

  const start = Number(req.body.start ?? 0);
  const end = Number(req.body.end ?? 30);
  const duration = end - start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || duration <= 0 || duration > 180) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ error: "invalid clip range (max 180 seconds)" });
  }

  const id = crypto.randomUUID();
  const output = path.join(root, `${id}.mp4`);
  const filter = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";
  const args = [
    "-hide_banner","-loglevel","error",
    "-ss", String(start), "-i", req.file.path,
    "-t", String(duration),
    "-vf", filter,
    "-c:v","libx264","-preset","veryfast","-crf","20",
    "-c:a","aac","-b:a","160k",
    "-movflags","+faststart","-y",output
  ];

  const ffmpeg = spawn("ffmpeg", args);
  let stderr = "";
  ffmpeg.stderr.on("data", chunk => { stderr += chunk.toString(); });

  ffmpeg.on("error", () => {
    fs.rmSync(req.file.path, { force: true });
    res.status(500).json({ error: "FFmpeg is not installed or could not start" });
  });

  ffmpeg.on("close", code => {
    fs.rmSync(req.file.path, { force: true });
    if (code !== 0) {
      fs.rmSync(output, { force: true });
      return res.status(500).json({ error: "render failed", detail: stderr.slice(-2000) });
    }
    res.download(output, "autoshorts-1080x1920.mp4", err => {
      fs.rmSync(output, { force: true });
      if (err && !res.headersSent) res.status(500).end();
    });
  });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`AutoShorts worker listening on :${port}`));
