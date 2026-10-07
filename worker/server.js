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
app.disable("x-powered-by");

const upload = multer({
  dest: root,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }
});

app.get("/health", (_req, res) => res.json({
  ok: true,
  service: "autoshorts-worker",
  ffmpeg: "available",
  version: "1.1.1"
}));

app.get("/test-youtube", async (req, res) => {
  const url = String(req.query?.url || "").trim();
  let parsed; try { parsed = new URL(url); } catch { return res.status(400).json({ error: "valid YouTube URL is required" }); } if (!["youtube.com","www.youtube.com","m.youtube.com","youtu.be","www.youtu.be"].includes(parsed.hostname.toLowerCase())) return res.status(400).json({ error: "valid YouTube URL is required" });
  const id = crypto.randomUUID(), source = path.join(root, `${id}-source.mp4`), output = path.join(root, `${id}.mp4`);
  const cleanup = () => { fs.rmSync(source,{force:true}); fs.rmSync(output,{force:true}); };
  const fail = (stage, detail="") => { cleanup(); if(!res.headersSent) res.status(500).json({ok:false,stage,detail:detail.slice(-4000)}); };
  const dl = spawn("yt-dlp", ["--no-playlist","--js-runtimes","node","--remote-components","ejs:github","--extractor-args","youtube:player_client=android,web_safari","--user-agent","Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36","-f","bv*+ba/b","--merge-output-format","mp4","--download-sections","*0-10","--force-keyframes-at-cuts","-o",source,url]);
  let ds=""; dl.stderr.on("data",c=>{ds+=c.toString();});
  dl.on("error",()=>fail("yt-dlp-start"));
  dl.on("close",code=>{
    if(code!==0) return fail("youtube-download",ds);
    const ff = spawn("ffmpeg",["-hide_banner","-loglevel","error","-i",source,"-t","10","-vf","scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920","-c:v","libx264","-preset","veryfast","-crf","20","-c:a","aac","-b:a","160k","-movflags","+faststart","-y",output]);
    let fsErr=""; ff.stderr.on("data",c=>{fsErr+=c.toString();});
    ff.on("error",()=>fail("ffmpeg-start",fsErr));
    ff.on("close",code2=>{
      if(code2!==0) return fail("render",fsErr);
      let bytes=0; try { bytes=fs.statSync(output).size; } catch {}
      const valid=bytes>10000;
      cleanup();
      if(!valid) return res.status(500).json({ok:false,stage:"output-validation",bytes});
      res.json({ok:true,clip:"10s",width:1080,height:1920,bytes,format:"mp4"});
    });
  });
});

app.post("/render-youtube", express.json(), async (req, res) => {
  const url = String(req.body?.url || "").trim();
  const start = Number(req.body?.start ?? 0);
  const end = Number(req.body?.end ?? 30);
  const duration = end - start;
  if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) return res.status(400).json({ error: "valid YouTube URL is required" });
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || duration <= 0 || duration > 180) return res.status(400).json({ error: "invalid clip range (max 180 seconds)" });
  const id = crypto.randomUUID(), source = path.join(root, `${id}-source.mp4`), output = path.join(root, `${id}.mp4`);
  const dlArgs = [
    "--no-playlist",
    "--no-js-runtimes",
    "--js-runtimes","node",
    "--remote-components","ejs:github",
    "-f","bv*+ba/b",
    "--merge-output-format","mp4",
    "--download-sections",`*${start}-${end}`,
    "--force-keyframes-at-cuts",
    "-o",source,url
  ];
  const dl = spawn("yt-dlp", dlArgs);
  let stderr = ""; dl.stderr.on("data", c => { stderr += c.toString(); });
  const fail = (msg, detail="") => { fs.rmSync(source,{force:true}); fs.rmSync(output,{force:true}); if(!res.headersSent) res.status(500).json({error:msg,detail:detail.slice(-4000)}); };
  dl.on("error", () => fail("yt-dlp could not start"));
  dl.on("close", code => {
    if (code !== 0) return fail("YouTube download failed", stderr);
    const filter = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";
    const ffmpeg = spawn("ffmpeg", ["-hide_banner","-loglevel","error","-i",source,"-t",String(duration),"-vf",filter,"-c:v","libx264","-preset","veryfast","-crf","20","-c:a","aac","-b:a","160k","-movflags","+faststart","-y",output]);
    let ferr=""; ffmpeg.stderr.on("data", c => { ferr += c.toString(); });
    ffmpeg.on("error", () => fail("FFmpeg could not start", ferr));
    ffmpeg.on("close", code2 => {
      fs.rmSync(source,{force:true});
      if(code2!==0) return fail("render failed",ferr);
      res.download(output,"autoshorts-youtube-1080x1920.mp4",err=>{fs.rmSync(output,{force:true});if(err&&!res.headersSent)res.status(500).end();});
    });
  });
});

app.post("/render", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "video file is required" });
  const start = Number(req.body.start ?? 0), end = Number(req.body.end ?? 30), duration = end - start;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || duration <= 0 || duration > 180) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ error: "invalid clip range (max 180 seconds)" });
  }
  const id = crypto.randomUUID(), output = path.join(root, `${id}.mp4`);
  const filter = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";
  const args = ["-hide_banner","-loglevel","error","-ss",String(start),"-i",req.file.path,"-t",String(duration),"-vf",filter,"-c:v","libx264","-preset","veryfast","-crf","20","-c:a","aac","-b:a","160k","-movflags","+faststart","-y",output];
  const ffmpeg = spawn("ffmpeg", args);
  let stderr = ""; ffmpeg.stderr.on("data", chunk => { stderr += chunk.toString(); });
  ffmpeg.on("error", () => { fs.rmSync(req.file.path,{force:true}); if(!res.headersSent) res.status(500).json({error:"FFmpeg is not installed or could not start"}); });
  ffmpeg.on("close", code => {
    fs.rmSync(req.file.path,{force:true});
    if(code!==0){fs.rmSync(output,{force:true});return res.status(500).json({error:"render failed",detail:stderr.slice(-2000)});}
    res.download(output,"autoshorts-1080x1920.mp4",err=>{fs.rmSync(output,{force:true});if(err&&!res.headersSent)res.status(500).end();});
  });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`AutoShorts worker listening on :${port}`));
