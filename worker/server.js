import express from "express";
import cors from "cors";
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
const allowedOrigin = process.env.WORKER_ALLOWED_ORIGIN || "*";
app.use(cors({
  origin: allowedOrigin === "*" ? true : allowedOrigin.split(",").map(v => v.trim()),
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "1mb" }));
app.disable("x-powered-by");

const upload = multer({
  dest: root,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);
const mobileUA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";

function isYouTubeUrl(value) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) && YT_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function run(command, args, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.stdout?.on("data", c => { stdout += c.toString(); });
    child.stderr?.on("data", c => { stderr += c.toString(); });
    child.on("error", e => finish({ ok: false, code: -1, stdout, stderr: String(e) }));
    child.on("close", code => finish({ ok: code === 0, code, stdout, stderr }));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, code: -1, stdout, stderr: stderr + "\nprocess timeout" });
    }, timeoutMs);
    if (timer.unref) timer.unref();
  });
}

function cleanup(...files) {
  for (const file of files) fs.rmSync(file, { force: true });
}

function renderArgs(input, output, duration) {
  return [
    "-hide_banner", "-loglevel", "error",
    "-i", input, "-t", String(duration),
    "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
    "-y", output
  ];
}

app.get("/health", (_req, res) => res.json({
  ok: true,
  service: "autoshorts-worker",
  ffmpeg: "available",
  youtube: "best-effort",
  version: "1.2.0"
}));

// Pipeline-only smoke test: proves FFmpeg can create a real 1080x1920 MP4
// without depending on YouTube or any external network.
app.get("/test-render", async (_req, res) => {
  const id = crypto.randomUUID();
  const output = path.join(root, id + ".mp4");
  const result = await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=880:sample_rate=48000",
    "-t", "5",
    "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
    "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
    "-y", output
  ], 120000);
  if (!result.ok) {
    cleanup(output);
    return res.status(500).json({ ok: false, stage: "ffmpeg", detail: result.stderr.slice(-3000) });
  }
  let bytes = 0;
  try { bytes = fs.statSync(output).size; } catch {}
  cleanup(output);
  if (bytes <= 10000) return res.status(500).json({ ok: false, stage: "output-validation", bytes });
  res.json({ ok: true, clip: "synthetic-5s", width: 1080, height: 1920, bytes, format: "mp4" });
});

app.post("/render", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "video file is required" });
  const start = Number(req.body.start ?? 0);
  const end = Number(req.body.end ?? 30);
  const duration = end - start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || duration <= 0 || duration > 180) {
    cleanup(req.file.path);
    return res.status(400).json({ error: "invalid clip range (max 180 seconds)" });
  }
  const output = path.join(root, crypto.randomUUID() + ".mp4");
  const result = await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(start), "-i", req.file.path, "-t", String(duration),
    "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-y", output
  ], 10 * 60 * 1000);
  cleanup(req.file.path);
  if (!result.ok) {
    cleanup(output);
    return res.status(500).json({ error: "render failed", detail: result.stderr.slice(-3000) });
  }
  if (!fs.existsSync(output) || fs.statSync(output).size <= 10000) {
    cleanup(output);
    return res.status(500).json({ error: "render produced an invalid MP4" });
  }
  res.download(output, "autoshorts-1080x1920.mp4", err => {
    cleanup(output);
    if (err && !res.headersSent) res.status(500).end();
  });
});

async function downloadYouTube(url, source, start, end) {
  const common = [
    "--no-playlist",
    "--js-runtimes", "node",
    "--remote-components", "ejs:github",
    "--user-agent", mobileUA,
    "--force-ipv4",
    "--retries", "2",
    "--fragment-retries", "2",
    "--sleep-requests", "1",
    "-f", "bv*+ba/b",
    "--merge-output-format", "mp4",
    "--download-sections", `*${start}-${end}`,
    "--force-keyframes-at-cuts",
    "-o", source, url
  ];
  const clients = [
    "web_embedded",
    "web_safari",
    "android",
    "web"
  ];
  let diagnostics = "";
  for (const client of clients) {
    cleanup(source);
    const args = [...common, "--extractor-args", `youtube:player_client=${client}`];
    const result = await run("yt-dlp", args, 8 * 60 * 1000);
    diagnostics += `[client ${client}]\n${result.stderr.slice(-3500)}\n`;
    if (result.ok && fs.existsSync(source) && fs.statSync(source).size > 10000) {
      return { ok: true, diagnostics };
    }
  }
  return { ok: false, diagnostics };
}

app.post("/render-youtube", async (req, res) => {
  const url = String(req.body?.url || "").trim();
  const start = Number(req.body?.start ?? 0);
  const end = Number(req.body?.end ?? 30);
  const duration = end - start;
  if (!isYouTubeUrl(url)) return res.status(400).json({ error: "valid YouTube URL is required" });
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || duration <= 0 || duration > 180) {
    return res.status(400).json({ error: "invalid clip range (max 180 seconds)" });
  }

  const id = crypto.randomUUID();
  const source = path.join(root, id + "-source.mp4");
  const output = path.join(root, id + ".mp4");
  const downloaded = await downloadYouTube(url, source, start, end);
  if (!downloaded.ok) {
    cleanup(source, output);
    return res.status(502).json({
      error: "YouTube download blocked or unavailable from this worker",
      code: "YOUTUBE_INGEST_BLOCKED",
      detail: downloaded.diagnostics.slice(-8000)
    });
  }

  const rendered = await run("ffmpeg", renderArgs(source, output, duration), 10 * 60 * 1000);
  cleanup(source);
  if (!rendered.ok) {
    cleanup(output);
    return res.status(500).json({ error: "render failed", detail: rendered.stderr.slice(-3000) });
  }
  if (!fs.existsSync(output) || fs.statSync(output).size <= 10000) {
    cleanup(output);
    return res.status(500).json({ error: "render produced an invalid MP4" });
  }
  res.download(output, "autoshorts-youtube-1080x1920.mp4", err => {
    cleanup(output);
    if (err && !res.headersSent) res.status(500).end();
  });
});

app.get("/test-youtube", async (req, res) => {
  const url = String(req.query?.url || "").trim();
  if (!isYouTubeUrl(url)) return res.status(400).json({ error: "valid YouTube URL is required" });
  const id = crypto.randomUUID();
  const source = path.join(root, id + "-source.mp4");
  const output = path.join(root, id + ".mp4");
  const downloaded = await downloadYouTube(url, source, 0, 10);
  if (!downloaded.ok) {
    cleanup(source, output);
    return res.status(502).json({ ok: false, stage: "youtube-download", code: "YOUTUBE_INGEST_BLOCKED", detail: downloaded.diagnostics.slice(-8000) });
  }
  const rendered = await run("ffmpeg", renderArgs(source, output, 10), 10 * 60 * 1000);
  cleanup(source);
  if (!rendered.ok) {
    cleanup(output);
    return res.status(500).json({ ok: false, stage: "render", detail: rendered.stderr.slice(-3000) });
  }
  let bytes = 0;
  try { bytes = fs.statSync(output).size; } catch {}
  cleanup(output);
  if (bytes <= 10000) return res.status(500).json({ ok: false, stage: "output-validation", bytes });
  res.json({ ok: true, clip: "10s", width: 1080, height: 1920, bytes, format: "mp4" });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`AutoShorts worker listening on :${port}`));
