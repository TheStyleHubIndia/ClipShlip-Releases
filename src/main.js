import "./style.css";
import { buildCandidates, formatTime } from "./processor.js";

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div><span class="eyebrow">CLIPSHLIP • AUTOSHORTS</span><h1>Turn long videos into Shorts.</h1><p class="sub">Local-first workflow for finding, scoring and rendering vertical clips.</p></div>
      <span class="badge">LOCAL</span>
    </header>

    <section class="upload" id="dropzone">
      <input id="videoInput" type="file" accept="video/*" hidden />
      <div class="upload-icon">↑</div><h2>Drop a video here</h2>
      <p>Choose a local video to analyze. Rendering can use your own worker.</p>
      <button id="chooseBtn" type="button">Choose video</button>
      <div id="fileName" class="file-name"></div>
    </section>

    <section class="settings"><label>YouTube URL <input id="youtubeUrl" placeholder="https://youtu.be/..." /></label><button id="youtubeTest" type="button">Test YouTube → 30s Short</button><span>Downloads a 30-second section through the render worker.</span></section>\n\n    <section class="settings">
      <label>Worker URL <input id="workerUrl" placeholder="https://your-worker.example.com" /></label>
      <span>Optional — leave empty to keep processing in-browser only.</span>
    </section>

    <section class="pipeline">
      <article><b>01</b><h3>Analyze</h3><p>Read local media metadata and create candidate moments.</p></article>
      <article><b>02</b><h3>Score</h3><p>Rank candidate moments by duration and local signals.</p></article>
      <article><b>03</b><h3>Render</h3><p>Send the selected range to FFmpeg for 1080×1920 MP4.</p></article>
    </section>

    <section class="results" id="results" hidden>
      <div class="results-head"><div><span class="eyebrow">CANDIDATES</span><h2>Best moments</h2></div><span id="meta" class="muted"></span></div>
      <div id="candidateList"></div>
      <div id="status" class="status"></div>
    </section>
    <footer>AutoShorts • local-first rendering pipeline</footer>
  </main>`;

const input=document.querySelector("#videoInput"), choose=document.querySelector("#chooseBtn"), dropzone=document.querySelector("#dropzone");
const fileName=document.querySelector("#fileName"), results=document.querySelector("#results"), candidateList=document.querySelector("#candidateList");
const meta=document.querySelector("#meta"), status=document.querySelector("#status"), workerUrl=document.querySelector("#workerUrl"), youtubeUrl=document.querySelector("#youtubeUrl"), youtubeTest=document.querySelector("#youtubeTest");

const workerCandidates = [
  import.meta.env.VITE_WORKER_URL?.trim().replace(/\/$/,""),
  localStorage.getItem("autoshorts_worker_url")?.trim().replace(/\/$/,""),
  "https://autoshorts-worker.onrender.com",
  "https://autoshorts-worker-production.up.railway.app"
].filter(Boolean).filter((url,index,all)=>all.indexOf(url)===index);
workerUrl.value=localStorage.getItem("autoshorts_worker_url")||workerCandidates[0]||"";
workerUrl.addEventListener("input",()=>localStorage.setItem("autoshorts_worker_url",workerUrl.value.trim()));
async function checkWorker(url){ try { const r=await fetch(`${url}/health`,{cache:"no-store"}); return r.ok; } catch { return false; } }
async function selectHealthyWorker(){
  status.textContent="Checking render workers…";
  for(const candidate of workerCandidates){
    if(await checkWorker(candidate)){
      workerUrl.value=candidate;
      status.textContent="Worker online — rendering enabled.";
      return candidate;
    }
  }
  status.textContent="No render worker reachable — local analysis still works.";
  return "";
}
selectHealthyWorker();
choose.addEventListener("click",()=>input.click());
input.addEventListener("change",()=>input.files[0]&&analyze(input.files[0]));
["dragenter","dragover"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.classList.add("dragging")}));
["dragleave","drop"].forEach(e=>dropzone.addEventListener(e,x=>{x.preventDefault();dropzone.classList.remove("dragging")}));
dropzone.addEventListener("drop",e=>{const f=[...e.dataTransfer.files].find(x=>x.type.startsWith("video/"));if(f)analyze(f)});

function analyze(file){
 fileName.textContent=file.name; results.hidden=false; meta.textContent="Reading local metadata…"; status.textContent="";
 candidateList.innerHTML="<div class=\"loading\">Analyzing video…</div>";
 const url=URL.createObjectURL(file), video=document.createElement("video"); video.preload="metadata"; video.src=url;
 video.onloadedmetadata=()=>{
   const candidates=buildCandidates(video.duration);
   meta.textContent=`${Math.round(video.duration)}s • ${candidates.length} candidates`;
   candidateList.innerHTML=candidates.map((c,i)=>`
    <div class="candidate"><span class="rank">#${i+1}</span><div class="candidate-main"><strong>${formatTime(c.start)} — ${formatTime(c.end)}</strong><span>${Math.round(c.duration)} sec • score ${c.score}</span></div>
    <button class="export-btn" type="button" data-start="${c.start}" data-end="${c.end}">Render 9:16</button></div>`).join("");
   URL.revokeObjectURL(url);
 };
 video.onerror=()=>{meta.textContent="Could not read this video";candidateList.innerHTML="<div class=\"loading\">Unsupported or damaged media.</div>";URL.revokeObjectURL(url)};
}

candidateList.addEventListener("click",async e=>{
 const b=e.target.closest(".export-btn"); if(!b)return;
 const worker=workerUrl.value.trim().replace(/\/$/,"");
 if(!worker){status.textContent="Set a Worker URL above to render an MP4.";return}
 b.disabled=true;b.textContent="Rendering…";status.textContent="Uploading selected clip to worker…";
 const form=new FormData();form.append("video",input.files[0]);form.append("start",b.dataset.start);form.append("end",b.dataset.end);
 try{
   const response=await fetch(`${worker}/render`,{method:"POST",body:form});
   if(!response.ok) throw new Error(await response.text());
   const blob=await response.blob(), url=URL.createObjectURL(blob), a=document.createElement("a");
   a.href=url;a.download="autoshorts-1080x1920.mp4";a.click();URL.revokeObjectURL(url);
   status.textContent="Render complete — MP4 download started.";
 }catch(err){status.textContent=`Render failed: ${err.message||"worker unavailable"}`;b.disabled=false;b.textContent="Retry render"}
});

youtubeTest.addEventListener("click",async()=>{
  const worker=workerUrl.value.trim().replace(/\/$/,""), url=youtubeUrl.value.trim();
  if(!worker){status.textContent="Worker URL missing.";return}
  if(!url){status.textContent="Paste a YouTube URL first.";return}
  youtubeTest.disabled=true; youtubeTest.textContent="Testing…"; status.textContent="Downloading YouTube section and rendering 9:16…";
  try{
    const r=await fetch(`${worker}/render-youtube`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,start:0,end:30})});
    if(!r.ok) throw new Error(await r.text());
    const blob=await r.blob(), u=URL.createObjectURL(blob), a=document.createElement("a"); a.href=u; a.download="autoshorts-youtube-1080x1920.mp4"; a.click(); URL.revokeObjectURL(u);
    status.textContent="YouTube test passed — MP4 download started.";
  }catch(e){status.textContent=`YouTube test failed: ${e.message||"worker error"}`}
  finally{youtubeTest.disabled=false;youtubeTest.textContent="Test YouTube → 30s Short"}
});
