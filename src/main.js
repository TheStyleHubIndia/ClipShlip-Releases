import "./style.css";

const root=document.querySelector("#root");
root.innerHTML=`
<main class="app">
  <header><div><span class="eyebrow">CLIPSHLIP • AUTOSHORTS</span><h1>Turn long videos into Shorts.</h1><p>Local-first workspace for finding, scoring and preparing vertical clips.</p></div><button id="settings">Settings</button></header>
  <section class="drop" id="drop"><div class="icon">＋</div><h2>Drop a video here</h2><p>MP4, MOV, WebM • processing pipeline ready for local FFmpeg/AI workers</p><input id="file" type="file" accept="video/*" hidden><button id="choose">Choose video</button></section>
  <section class="grid"><article><b>01</b><h3>Analyze</h3><p>Transcript, silence, scene changes and speaker/face signals.</p></article><article><b>02</b><h3>Score</h3><p>Rank candidate moments instead of inventing dialogue or clips.</p></article><article><b>03</b><h3>Export</h3><p>Prepare 9:16, captions and MP4 output at 1080×1920.</p></article></section>
  <footer><span>AutoShorts foundation</span><span>Engine adapter: local worker</span></footer>
</main>`;
const input=document.querySelector("#file"),drop=document.querySelector("#drop");
document.querySelector("#choose").onclick=()=>input.click();
input.onchange=()=>{if(input.files[0]){drop.querySelector("h2").textContent=input.files[0].name;drop.querySelector("p").textContent="Video selected • connect the local processing worker to analyze it.";}}
drop.ondragover=e=>{e.preventDefault();drop.classList.add("active")};
drop.ondragleave=()=>drop.classList.remove("active");
drop.ondrop=e=>{e.preventDefault();drop.classList.remove("active");const f=e.dataTransfer.files[0];if(f&&f.type.startsWith("video/")){input.files=e.dataTransfer.files;input.dispatchEvent(new Event("change"));}};
