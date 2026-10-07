import "./style.css";
import { buildCandidates, formatTime } from "./processor.js";

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div>
        <span class="eyebrow">CLIPSHLIP • AUTOSHORTS</span>
        <h1>Turn long videos into Shorts.</h1>
        <p class="sub">Local-first workflow for finding, scoring and preparing vertical clips.</p>
      </div>
      <span class="badge">LOCAL</span>
    </header>

    <section class="upload" id="dropzone">
      <input id="videoInput" type="file" accept="video/*" hidden />
      <div class="upload-icon">↑</div>
      <h2>Drop a video here</h2>
      <p>or choose a local video. Nothing is uploaded by this web shell.</p>
      <button id="chooseBtn" type="button">Choose video</button>
      <div id="fileName" class="file-name"></div>
    </section>

    <section class="pipeline">
      <article><b>01</b><h3>Analyze</h3><p>Read local media metadata and prepare clip candidates.</p></article>
      <article><b>02</b><h3>Score</h3><p>Rank candidate moments using duration and transcript signals.</p></article>
      <article><b>03</b><h3>Export</h3><p>Prepare 9:16 / 1080×1920 output for the rendering worker.</p></article>
    </section>

    <section class="results" id="results" hidden>
      <div class="results-head">
        <div><span class="eyebrow">CANDIDATES</span><h2>Best moments</h2></div>
        <span id="meta" class="muted"></span>
      </div>
      <div id="candidateList"></div>
    </section>

    <footer>AutoShorts foundation • browser-safe processing layer</footer>
  </main>
`;

const input = document.querySelector("#videoInput");
const choose = document.querySelector("#chooseBtn");
const dropzone = document.querySelector("#dropzone");
const fileName = document.querySelector("#fileName");
const results = document.querySelector("#results");
const candidateList = document.querySelector("#candidateList");
const meta = document.querySelector("#meta");

choose.addEventListener("click", () => input.click());
input.addEventListener("change", () => input.files[0] && analyze(input.files[0]));

["dragenter", "dragover"].forEach((event) => dropzone.addEventListener(event, (e) => {
  e.preventDefault();
  dropzone.classList.add("dragging");
}));
["dragleave", "drop"].forEach((event) => dropzone.addEventListener(event, (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragging");
}));
dropzone.addEventListener("drop", (e) => {
  const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("video/"));
  if (file) analyze(file);
});

function analyze(file) {
  fileName.textContent = file.name;
  results.hidden = false;
  meta.textContent = "Reading local metadata…";
  candidateList.innerHTML = "<div class=\"loading\">Analyzing video…</div>";

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = url;
  video.onloadedmetadata = () => {
    const duration = video.duration;
    const candidates = buildCandidates(duration);
    meta.textContent = `${Math.round(duration)}s • ${candidates.length} candidates`;
    candidateList.innerHTML = candidates.map((c, i) => `
      <div class="candidate">
        <span class="rank">#${i + 1}</span>
        <div class="candidate-main">
          <strong>${formatTime(c.start)} — ${formatTime(c.end)}</strong>
          <span>${Math.round(c.duration)} sec clip</span>
        </div>
        <div class="score"><b>${c.score}</b><small>score</small></div>
        <button class="export-btn" type="button" data-start="${c.start}" data-end="${c.end}">Prepare 9:16</button>
      </div>
    `).join("");
    URL.revokeObjectURL(url);
  };
  video.onerror = () => {
    meta.textContent = "Could not read this video";
    candidateList.innerHTML = "<div class=\"loading\">Unsupported or damaged media.</div>";
    URL.revokeObjectURL(url);
  };
}

candidateList.addEventListener("click", (e) => {
  const button = e.target.closest(".export-btn");
  if (!button) return;
  button.textContent = "Queued locally";
  button.disabled = true;
});
