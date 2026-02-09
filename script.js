// ---------------------------------------------------------
// グローバル変数
// ---------------------------------------------------------
let userMode = null;
let poseLandmarker = null;
let runningMode = "IMAGE";
let lastAnalysisResult = null;
let lastLandmarks = null;

let historyLabels = [];
let historyPelvis = [];
let historyHipAbd = [];
let historyHipAdd = [];
let historySpeed = [];
let compareChart = null;

let loadedVideoURL = null;

// 撮影補助モード用
let liveStream = null;
let mediaRecorder = null;
let recordedChunks = [];

// ★ 追加：歩行軌跡データ（A）
let trajectory = [];

// ★ 追加：骨格アニメーション用フレームデータ（B）
let allFrames = [];

let mode = localStorage.getItem("mode") || "patient";

// ---------------------------------------------------------
// DOM取得
// ---------------------------------------------------------
const startSection = document.getElementById("startSection");
const usageSection = document.getElementById("usageSection");
const liveSection = document.getElementById("liveSection");
const videoSection = document.getElementById("videoSection");

const tabBar = document.getElementById("tabBar");
const tabButtons = tabBar.querySelectorAll("button");

const patientModeBtn = document.getElementById("patientModeBtn");
const therapistModeBtn = document.getElementById("therapistModeBtn");

const liveChecks = document.querySelectorAll(".live-check");
const liveVideo = document.getElementById("liveVideo");
const startLiveBtn = document.getElementById("startLiveBtn");
const stopLiveBtn = document.getElementById("stopLiveBtn");

const surgeryDateInput = document.getElementById("surgeryDate");
const surgeryDiffText = document.getElementById("surgeryDiffText");
const videoFileInput = document.getElementById("videoFileInput");
const analyzeVideoBtn = document.getElementById("analyzeVideoBtn");
const analysisVideo = document.getElementById("analysisVideo");
const analysisCanvas = document.getElementById("analysisCanvas");
const videoStatus = document.getElementById("videoStatus");
const videoError = document.getElementById("videoError");

const typeBox = document.getElementById("typeBox");
const exerciseBox = document.getElementById("exerciseBox");
const graphCard = document.getElementById("graphCard");
const historyCard = document.getElementById("historyCard");
const resultBox = document.getElementById("resultBox");

// ★ 追加：新しいカードの DOM
const animationCard = document.getElementById("animationCard");
const trajectoryCard = document.getElementById("trajectoryCard");

const sideVideoInput = document.getElementById("sideVideoInput");
const sideVideo = document.getElementById("sideVideo");
const sideCanvas = document.getElementById("sideCanvas");
const sideAngleCard = document.getElementById("sideAngleCard");
const sideAngleList = document.getElementById("sideAngleList");

sideVideoInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (file) {
    sideVideo.src = URL.createObjectURL(file);
  }
});

// ---------------------------------------------------------
// MediaPipe 初期化
// ---------------------------------------------------------
async function initPoseLandmarker() {
  if (poseLandmarker) return;

  const vision = await window.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  poseLandmarker = await window.PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });
}

// ---------------------------------------------------------
// タブ切り替え
// ---------------------------------------------------------
function showSection(id) {
  [usageSection, liveSection, videoSection, startSection].forEach(sec =>
    sec.classList.remove("active")
  );
  document.getElementById(id).classList.add("active");
}

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    showSection(btn.dataset.target);
  });
});

// ---------------------------------------------------------
// モード選択
// ---------------------------------------------------------
patientModeBtn.addEventListener("click", () => {
  userMode = "patient";
  startSection.classList.remove("active");
  usageSection.classList.add("active");
  tabBar.style.display = "flex";
});

therapistModeBtn.addEventListener("click", () => {
  userMode = "therapist";
  startSection.classList.remove("active");
  usageSection.classList.add("active");
  tabBar.style.display = "flex";
});

 if (mode === "therapist") {
   document.getElementById("sideVideoArea").style.display = "block";
 } else {
   document.getElementById("sideVideoArea").style.display = "none";
 }

// ---------------------------------------------------------
// 手術日 → 手術前◯日 / 手術後◯日
// ---------------------------------------------------------
surgeryDateInput.addEventListener("change", () => {
  const val = surgeryDateInput.value;
  if (!val) {
    surgeryDiffText.textContent = "";
    return;
  }
  const surgeryDate = new Date(val);
  const today = new Date();
  const diffDays = Math.round((today - surgeryDate) / 86400000);

  if (diffDays === 0) {
    surgeryDiffText.textContent = "手術当日";
  } else if (diffDays > 0) {
    surgeryDiffText.textContent = `手術後${diffDays}日`;
  } else {
    surgeryDiffText.textContent = `手術前${Math.abs(diffDays)}日`;
  }
});

// ---------------------------------------------------------
// 撮影補助モード：チェックボックス
// ---------------------------------------------------------
function updateLiveButtonState() {
  startLiveBtn.disabled = !Array.from(liveChecks).every(ch => ch.checked);
}
liveChecks.forEach(ch => ch.addEventListener("change", updateLiveButtonState));

// ---------------------------------------------------------
// 撮影補助モード：外向きカメラで録画
// ---------------------------------------------------------
startLiveBtn.addEventListener("click", async () => {
  try {
    liveStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });

    liveVideo.srcObject = liveStream;
    await liveVideo.play();

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(liveStream);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || "video/mp4" });
      loadedVideoURL = URL.createObjectURL(blob);

      analysisVideo.src = loadedVideoURL;
      analysisVideo.load();

      tabButtons.forEach(b => b.classList.remove("active"));
      document.querySelector('[data-target="videoSection"]').classList.add("active");
      showSection("videoSection");
    };

    mediaRecorder.start();
  } catch (e) {
    alert("カメラを起動できませんでした。");
  }
});

stopLiveBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (liveStream) liveStream.getTracks().forEach(t => t.stop());
  liveVideo.srcObject = null;
});

// ---------------------------------------------------------
// ファイル選択 → 動画読み込み
// ---------------------------------------------------------
videoFileInput.addEventListener("change", () => {
  const file = videoFileInput.files[0];
  if (!file) return;

  if (loadedVideoURL) URL.revokeObjectURL(loadedVideoURL);

  loadedVideoURL = URL.createObjectURL(file);
  analysisVideo.src = loadedVideoURL;
  analysisVideo.load();
});

// ---------------------------------------------------------
// 動画解析ボタン
// ---------------------------------------------------------
analyzeVideoBtn.addEventListener("click", async () => {
  if (!loadedVideoURL) {
    videoError.textContent = "動画が選択されていません。";
    return;
  }

  videoError.textContent = "";
  videoStatus.textContent = "解析を準備中…";

  await initPoseLandmarker();
  await analyzeVideoWithPose();
});

// ---------------------------------------------------------
// 動画解析（骨格描画入り）
// ---------------------------------------------------------
async function analyzeVideoWithPose() {
  return new Promise(resolve => {
    const startAnalysis = async () => {
      const video = analysisVideo;
      const canvas = analysisCanvas;
      const ctx = canvas.getContext("2d");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      let lastVideoTime = -1;
      let pelvisR = 0, pelvisL = 0;
      let abdR = 0, abdL = 0;
      let addR = 0, addL = 0;
      let frameCount = 0;

      // ★ A/B の初期化
      trajectory = [];
      allFrames = [];

      poseLandmarker.setOptions({ runningMode: "VIDEO" });

      async function processFrame() {
        if (video.paused || video.ended) return finalize();

        const now = performance.now();
        if (video.currentTime === lastVideoTime) {
          requestAnimationFrame(processFrame);
          return;
        }
        lastVideoTime = video.currentTime;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const result = poseLandmarker.detectForVideo(video, now);
        if (result?.landmarks?.length) {
          const lm = result.landmarks[0];
          lastLandmarks = lm;

          // ★ 骨格モデルの描画（追加）
          const drawingUtils = new window.DrawingUtils(ctx);
          drawingUtils.drawLandmarks(lm, { radius: 3, color: "#00ff00" });
          drawingUtils.drawConnectors(
            lm,
            window.PoseLandmarker.POSE_CONNECTIONS,
            { color: "#00ff00", lineWidth: 2 }
          );

          // ★ A：歩行軌跡データ保存（骨盤中心X）
         const leftHip = lm[23];
         const rightHip = lm[24];
         const pelvisX = (leftHip.x + rightHip.x) / 2;

         trajectory.push({
           frame: frameCount,
           x: pelvisX
         });

         // ★ B：骨格アニメーション用 全フレーム保存
         allFrames.push({
           keypoints: lm.map(p => ({
             x: p.x,
             y: p.y,
             z: p.z,
             score: p.score
           }))
         });
          const RH = lm[24], LH = lm[23], RK = lm[26], LK = lm[25];

          const pelvisTilt = (LH.y - RH.y) * 180;
          pelvisR += Math.max(0, pelvisTilt);
          pelvisL += Math.max(0, -pelvisTilt);

          abdR += Math.abs(RH.x - RK.x) * 180;
          abdL += Math.abs(LH.x - LK.x) * 180;

          addR += Math.abs(RH.x - RK.x) * 90;
          addL += Math.abs(LH.x - LK.x) * 90;

          frameCount++;
        }

        function stopSkeletonAnimation() {
        if (animationRequestId) {
          cancelAnimationFrame(animationRequestId);
          animationRequestId = null;
        }
      }
        
        requestAnimationFrame(processFrame);
      }

      function finalize() {
        if (frameCount === 0) {
          videoStatus.textContent = "解析できるフレームがありませんでした。";
          resolve();
          return;
        }

        pelvisR /= frameCount;
        pelvisL /= frameCount;
        abdR   /= frameCount;
        abdL   /= frameCount;
        addR   /= frameCount;
        addL   /= frameCount;

        lastAnalysisResult = {
          pelvisR,
          pelvisL,
          abdR,
          abdL,
          addR,
          addL,
          speedPercent: 100,
          types: [],
        };

        // ★ A/B：localStorage に保存
        localStorage.setItem("trajectory", JSON.stringify(trajectory));
        localStorage.setItem("allFrames", JSON.stringify(allFrames));

        videoStatus.textContent = "解析が完了しました。";
        finalizeAnalysis();

        // ★ A/B の結果表示（ここに追加）
        drawTrajectory();
        startSkeletonAnimation(); 
        
        resolve();
      }

      await video.play();
      processFrame();
    };

    if (analysisVideo.readyState >= 2) {
      startAnalysis();
    } else {
      analysisVideo.addEventListener("loadeddata", startAnalysis, { once: true });
    }
  });
  
if (mode === "pt") {
  const angles = JSON.parse(localStorage.getItem("sideAngles") || "{}");

  sideAngleCard.style.display = "block";

  sideAngleList.innerHTML = `
    <li>体幹前傾角度：${angles.trunkForward?.toFixed(1)}°</li>
    <li>股関節屈曲角度：${angles.hipFlex?.toFixed(1)}°</li>
    <li>股関節伸展角度：${angles.hipExt?.toFixed(1)}°</li>
    <li>膝関節屈曲角度：${angles.kneeFlex?.toFixed(1)}°</li>
    <li>膝関節伸展角度：${angles.kneeExt?.toFixed(1)}°</li>
    <li>足関節背屈角度：${angles.ankleDorsi?.toFixed(1)}°</li>
    <li>足関節底屈角度：${angles.anklePlantar?.toFixed(1)}°</li>
  `;
}

async function analyzeVideoWithPoseSide() {
  return new Promise(resolve => {

    const startAnalysis = async () => {
      const video = sideVideo;
      const canvas = sideCanvas;
      const ctx = canvas.getContext("2d");

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      let frameCount = 0;

      // ★ 7つの角度の累積
      let trunkForward = 0;
      let hipFlex = 0;
      let hipExt = 0;
      let kneeFlex = 0;
      let kneeExt = 0;
      let ankleDorsi = 0;
      let anklePlantar = 0;

      poseLandmarker.setOptions({ runningMode: "VIDEO" });

      async function processFrame() {
        if (video.paused || video.ended) return finalize();

        const now = performance.now();
        const result = poseLandmarker.detectForVideo(video, now);

        if (result?.landmarks?.length) {
          const lm = result.landmarks[0];

          // ★ 7つの角度を計算
          const angles = calculateSideAngles(lm);

          trunkForward += angles.trunkForward;
          hipFlex += angles.hipFlex;
          hipExt += angles.hipExt;
          kneeFlex += angles.kneeFlex;
          kneeExt += angles.kneeExt;
          ankleDorsi += angles.ankleDorsi;
          anklePlantar += angles.anklePlantar;

          frameCount++;
        }

        requestAnimationFrame(processFrame);
      }

      function finalize() {
        if (frameCount === 0) return resolve();

        const result = {
          trunkForward: trunkForward / frameCount,
          hipFlex: hipFlex / frameCount,
          hipExt: hipExt / frameCount,
          kneeFlex: kneeFlex / frameCount,
          kneeExt: kneeExt / frameCount,
          ankleDorsi: ankleDorsi / frameCount,
          anklePlantar: anklePlantar / frameCount,
        };

        // ★ 保存
        localStorage.setItem("sideAngles", JSON.stringify(result));

        resolve();
      }

      await video.play();
      processFrame();
    };

    if (sideVideo.readyState >= 2) startAnalysis();
    else sideVideo.addEventListener("loadeddata", startAnalysis, { once: true });
  });
}

function calculateSideAngles(lm) {

  // 体幹前傾角度（肩→股関節の傾き）
  const trunkForward = angleBetweenPoints(lm[11], lm[23], {x: lm[23].x, y: lm[23].y - 1});

  // 股関節屈曲/伸展（股関節-膝-足首）
  const hipFlex = jointAngle(lm[23], lm[25], lm[27]);
  const hipExt = 180 - hipFlex;

  // 膝屈曲/伸展（膝-股関節-足首）
  const kneeFlex = jointAngle(lm[25], lm[23], lm[27]);
  const kneeExt = 180 - kneeFlex;

  // 足関節背屈/底屈（足首-膝-つま先）
  const ankleDorsi = jointAngle(lm[27], lm[25], lm[31]);
  const anklePlantar = 180 - ankleDorsi;

  return {
    trunkForward,
    hipFlex,
    hipExt,
    kneeFlex,
    kneeExt,
    ankleDorsi,
    anklePlantar
  };
}

function jointAngle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };

  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
  const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);

  const angle = Math.acos(dot / (magAB * magCB));
  return angle * (180 / Math.PI);
}

function angleBetweenPoints(a, b, c) {
  return jointAngle(a, b, c);
}

// ---------------------------------------------------------
// エクササイズ一覧（あなたの18本）
// ---------------------------------------------------------
const exerciseList = [
  { id: 1,  category: "ストレッチ",           name: "ハムストリングス（大腿部後面）のストレッチ",              url: "https://youtu.be/ihchQBuigY0" },
  { id: 2,  category: "ストレッチ",           name: "大腿四頭筋（大腿部前面）のストレッチ",                  url: "https://youtu.be/lVpF9TiepLg" },
  { id: 3,  category: "ストレッチ",           name: "腸腰筋（股関節前面）のストレッチ",                      url: "https://youtu.be/XIA80pBZ3ws" },
  { id: 4,  category: "ストレッチ",           name: "内転筋（大腿部内側）のストレッチ",                      url: "https://youtu.be/racb4M_hycM" },
  { id: 5,  category: "ストレッチ",           name: "下腿三頭筋（ふくらはぎ）のストレッチ",                  url: "https://youtu.be/Wbi5St1J9Kk" },
  { id: 6,  category: "ポンプ運動",           name: "足首の上下（ポンプ）運動",                              url: "https://youtu.be/-inqX6tmDm8" },
  { id: 7,  category: "筋力トレーニング",     name: "大殿筋（お尻）の筋力増強運動（収縮のみ）",              url: "https://youtu.be/4ckJ67_8IB8" },
  { id: 8,  category: "筋力トレーニング",     name: "大殿筋（お尻）の筋力増強運動（ブリッジ）",              url: "https://youtu.be/9zKZ-YRmU8I" },
  { id: 9,  category: "筋力トレーニング",     name: "大殿筋（お尻）の筋力増強運動（立位）",                  url: "https://youtu.be/aikGoCaTFFI" },
  { id: 10, category: "筋力トレーニング",     name: "大腿四頭筋（大腿部前面）の筋力増強運動（セッティング）", url: "https://youtu.be/rweyU-3O3zo" },
  { id: 11, category: "筋力トレーニング",     name: "大腿四頭筋（大腿部前面）の筋力増強運動（SLR）",        url: "https://youtu.be/fNM6w_RnVRk" },
  { id: 12, category: "中殿筋トレーニング",   name: "中殿筋（殿部外側）の筋力増強運動（背臥位）",            url: "https://youtu.be/UBN5jCP-ErM" },
  { id: 13, category: "中殿筋トレーニング",   name: "中殿筋（殿部外側）の筋力増強運動（立位）",              url: "https://youtu.be/0gKoLDR8HcI" },
  { id: 14, category: "バランストレーニング", name: "バランス運動（タンデム）",                              url: "https://youtu.be/F0OVS9LT1w4" },
  { id: 15, category: "バランストレーニング", name: "バランス運動（片脚立位）",                              url: "https://youtu.be/HUjoGJtiknc" },
  { id: 16, category: "有酸素運動",           name: "ウォーキング",                                          url: "https://youtu.be/Cs4NOzgkS8s" },
  { id: 17, category: "有酸素運動",           name: "自転車エルゴメータ",                                    url: "https://youtu.be/12_J_pr-MUE" },
  { id: 18, category: "有酸素運動",           name: "水中運動",                                              url: "https://youtu.be/xqj3dn9mw50" },
];

// ---------------------------------------------------------
// YouTube サムネイル取得（短縮URL対応）
// ---------------------------------------------------------
function getThumbnail(url) {
  try {
    const u = new URL(url);
    let id = u.searchParams.get("v");
    if (!id && u.hostname.includes("youtu.be")) {
      id = u.pathname.replace("/", "");
    }
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------
// エクササイズHTML
// ---------------------------------------------------------
function buildExerciseHTML(exercises) {
  return exercises.map(ex => `
    <div style="margin-bottom:12px; display:flex; align-items:flex-start; gap:8px;">
      <div style="flex:0 0 35%;">
        <a href="${ex.url}" target="_blank" rel="noopener noreferrer">
          <img src="${getThumbnail(ex.url)}"
               style="width:100%;border-radius:8px;margin-top:4px;">
        </a>
      </div>
      <div style="flex:1;">
        <strong>${ex.category}</strong><br>
        ${ex.name}
      </div>
    </div>
  `).join("");
}

// ---------------------------------------------------------
// 色分けロジック
// ---------------------------------------------------------
function colorizeResult(value, type) {
  if (type === "pelvis") {
    if (value >= 15) return "danger";
    if (value >= 10) return "warning";
    return "normal";
  }
  if (type === "abd") {
    if (value <= 3) return "danger";
    if (value <= 5) return "warning";
    return "normal";
  }
  if (type === "add") {
    if (value >= 15) return "danger";
    if (value >= 10) return "warning";
    return "normal";
  }
  if (type === "speed") {
    if (value < 70 || value > 130) return "danger";
    if (value < 80 || value > 120) return "warning";
    return "normal";
  }
  return "normal";
}

function setColoredValue(id, value, type) {
  const cell = document.getElementById(id);
  cell.textContent = value.toFixed(1);

  const status = colorizeResult(value, type);
  cell.classList.remove("result-normal", "result-warning", "result-danger");
  cell.classList.add(`result-${status}`);
}

// ---------------------------------------------------------
// A：歩行軌跡（左右の揺れ）描画
// ---------------------------------------------------------
function drawTrajectory() {
  const data = JSON.parse(localStorage.getItem("trajectory") || "[]");
  if (data.length === 0) return;

  trajectoryCard.style.display = "block";

  const canvas = document.getElementById("trajectoryCanvas");
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const minX = Math.min(...data.map(p => p.x));
  const maxX = Math.max(...data.map(p => p.x));

  const scaleX = canvas.width / data.length;
  const scaleY = canvas.height / (maxX - minX + 1);

  ctx.beginPath();
  ctx.strokeStyle = "#007aff";
  ctx.lineWidth = 2;

  data.forEach((p, i) => {
    const x = i * scaleX;
    const y = canvas.height - (p.x - minX) * scaleY;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
}

// ---------------------------------------------------------
// B：骨格アニメーション再生
// ---------------------------------------------------------
let animationFrameIndex = 0;
let animationRequestId = null;

function startSkeletonAnimation() {
  const frames = JSON.parse(localStorage.getItem("allFrames") || "[]");
  if (frames.length === 0) return;

  animationCard.style.display = "block";

  const canvas = document.getElementById("animationCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  function drawFrame() {
    const frame = frames[animationFrameIndex];
    if (!frame) return;

    ctx.clearRect(0, 0, W, H);

    const keypoints = frame.keypoints;

    // 点
    keypoints.forEach(kp => {
      if (kp.score > 0.3) {
        ctx.beginPath();
        ctx.arc(kp.x * W, kp.y * H, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#00e676";
        ctx.fill();
      }
    });

    // 線（主要骨格）
    const edges = [
      [11, 12],
      [11, 23], [12, 24],
      [23, 25], [25, 27],
      [24, 26], [26, 28],
      [11, 13], [13, 15],
      [12, 14], [14, 16]
    ];

    ctx.strokeStyle = "#00bfa5";
    ctx.lineWidth = 3;

    edges.forEach(([a, b]) => {
      const p1 = keypoints[a];
      const p2 = keypoints[b];
      if (p1.score > 0.3 && p2.score > 0.3) {
        ctx.beginPath();
        ctx.moveTo(p1.x * W, p1.y * H);
        ctx.lineTo(p2.x * W, p2.y * H);
        ctx.stroke();
      }
    });

    animationFrameIndex = (animationFrameIndex + 1) % frames.length;
    animationRequestId = requestAnimationFrame(drawFrame);
  }

  drawFrame();
}

// ---------------------------------------------------------
// 患者様用の特徴リストHTML（色付きラベル）
// ---------------------------------------------------------
function buildTypeListHTML(types) {
  return `
    <ul style="list-style:none; padding-left:0;">
      ${types.map(t => {
        let color = "#007aff";
        if (t.level === "warning") color = "#ff9500";
        if (t.level === "danger") color = "#ff3b30";
        return `
          <li style="margin-bottom:6px;">
            <span style="
              display:inline-block;
              min-width:70px;
              padding:2px 6px;
              border-radius:999px;
              font-size:11px;
              color:white;
              background:${color};
              margin-right:6px;
            ">
              ${t.level === "normal" ? "目安" : t.level === "warning" ? "注意" : "大きめ"}
            </span>
            <span>${t.text}</span>
          </li>
        `;
      }).join("")}
    </ul>
  `;
}

// ---------------------------------------------------------
// 一般的な歩行特徴診断（患者様向け）
// ---------------------------------------------------------
function diagnoseGait(pR, pL, abdR, abdL, addR, addL, speed) {
  const types = [];

  const pelvisMean = (pR + pL) / 2;
  const abdMean = (abdR + abdL) / 2;
  const addMean = (addR + addL) / 2;

  if (pelvisMean > 15) {
    types.push({ level: "danger", text: "骨盤の左右の傾きが大きい傾向があります。" });
  } else if (pelvisMean > 10) {
    types.push({ level: "warning", text: "骨盤の左右の傾きがやや大きい傾向があります。" });
  } else {
    types.push({ level: "normal", text: "骨盤の左右の傾きはおおむね安定しています。" });
  }

  if (abdMean < 3) {
    types.push({ level: "danger", text: "股関節の外転がかなり小さい傾向があります。" });
  } else if (abdMean < 5) {
    types.push({ level: "warning", text: "股関節の外転がやや小さい傾向があります。" });
  } else {
    types.push({ level: "normal", text: "股関節の外転はおおむね保たれています。" });
  }

  if (addMean > 15) {
    types.push({ level: "danger", text: "股関節の内転が大きく、内側に入りやすい傾向があります。" });
  } else if (addMean > 10) {
    types.push({ level: "warning", text: "股関節の内転がやや大きい傾向があります。" });
  } else {
    types.push({ level: "normal", text: "股関節の内転はおおむね適切な範囲です。" });
  }

  if (speed < 70 || speed > 130) {
    types.push({ level: "danger", text: "歩く速さが大きく変化している可能性があります。" });
  } else if (speed < 80 || speed > 120) {
    types.push({ level: "warning", text: "歩く速さがややゆっくり、またはやや速い傾向があります。" });
  } else {
    types.push({ level: "normal", text: "歩く速さはおおむね適切な範囲です。" });
  }

  return types;
}

// ---------------------------------------------------------
// THA特有の代償動作の診断
// ---------------------------------------------------------
function diagnoseTHA(landmarks, expert = false) {
  const typesTHA = [];
  if (!landmarks || landmarks.length < 29) return typesTHA;

  const rightHip = landmarks[24];
  const leftHip  = landmarks[23];
  const rightAnkle = landmarks[28];
  const leftAnkle  = landmarks[27];
  const rightShoulder = landmarks[12];
  const leftShoulder  = landmarks[11];

  const pelvisDropRight = leftHip.y - rightHip.y;
  const pelvisDropLeft  = rightHip.y - leftHip.y;

  if (pelvisDropRight > 0.03) {
    typesTHA.push({
      level: "warning",
      text: expert
        ? "右立脚時に対側骨盤の下制がみられ、中殿筋機能不全を示唆します。"
        : "右脚で立つときに反対側の骨盤が下がりやすい傾向があります。"
    });
  }
  if (pelvisDropLeft > 0.03) {
    typesTHA.push({
      level: "warning",
      text: expert
        ? "左立脚時に対側骨盤の下制がみられ、中殿筋機能不全を示唆します。"
        : "左脚で立つときに反対側の骨盤が下がりやすい傾向があります。"
    });
  }

  const shoulderTilt = Math.abs(rightShoulder.y - leftShoulder.y);
  const pelvisTilt   = Math.abs(rightHip.y - leftHip.y);
  if (shoulderTilt > pelvisTilt + 0.03) {
    typesTHA.push({
      level: "warning",
      text: expert
        ? "立脚側への体幹側方傾斜が大きく、デュシェンヌ歩行様の代償がみられます。"
        : "歩くときに体が左右に大きく傾く傾向があります。"
    });
  }

  const stepWidth = Math.abs(rightAnkle.x - leftAnkle.x);
  if (stepWidth < 0.03) {
    typesTHA.push({
      level: "normal",
      text: expert ? "歩隔が狭い傾向があります。" : "足と足の間の幅が狭い傾向があります。"
    });
  } else if (stepWidth > 0.10) {
    typesTHA.push({
      level: "normal",
      text: expert ? "歩隔が広い傾向があります。" : "足と足の間の幅が広い傾向があります。"
    });
  }

  return typesTHA;
}

// ---------------------------------------------------------
// エクササイズ推薦
// ---------------------------------------------------------
function recommendExercises(pR, pL, abdR, abdL, addR, addL, speed) {
  const ids = [];

  const pelvisMean = (pR + pL) / 2;
  const abdMean    = (abdR + abdL) / 2;
  const addMean    = (addR + addL) / 2;

  if (pelvisMean > 10) {
    ids.push(12, 13);
    ids.push(7, 8, 9);
    ids.push(14, 15);
  }

  if (abdMean < 5) {
    ids.push(12, 13);
  }

  if (addMean > 10) {
    ids.push(4);
    ids.push(12, 13);
  }

  if (speed < 80) {
    ids.push(16, 17, 18);
    ids.push(7, 8, 9);
    ids.push(10, 11);
  }

  if (ids.length === 0) {
    ids.push(1, 2, 3, 5, 6);
  }

  const unique = [...new Set(ids)];
  return unique
    .map(id => exerciseList.find(e => e.id === id))
    .filter(Boolean);
}

// ---------------------------------------------------------
// 解析後の表示処理
// ---------------------------------------------------------
function finalizeAnalysis() {
  const r = lastAnalysisResult;
  if (!r) return;

  let types = diagnoseGait(
    r.pelvisR, r.pelvisL,
    r.abdR, r.abdL,
    r.addR, r.addL,
    r.speedPercent
  );
  const thaTypes = diagnoseTHA(lastLandmarks, userMode === "therapist");
  types = types.concat(thaTypes);
  r.types = types;

  if (userMode === "patient") {
    resultBox.style.display = "none";

    typeBox.style.display = "block";
    typeBox.innerHTML =
      `<h3>① あなたの歩行の特徴</h3>` +
      buildTypeListHTML(types);

    const exercises = recommendExercises(
      r.pelvisR, r.pelvisL,
      r.abdR, r.abdL,
      r.addR, r.addL,
      r.speedPercent
    );
    if (exercises.length > 0) {
      exerciseBox.style.display = "block";
      exerciseBox.innerHTML =
        `<h3>② あなたにおすすめのセルフエクササイズ</h3>` +
        buildExerciseHTML(exercises);
    } else {
      exerciseBox.style.display = "none";
    }

    graphCard.style.display = "block";
    graphCard.querySelector("h3").textContent = "③ 回復の変化を比べる（グラフ）";

    historyCard.style.display = "none";
  }

  if (userMode === "therapist") {
    typeBox.style.display = "block";
    typeBox.innerHTML =
      `<h3>① あなたの歩行の特徴（専門的）</h3>` +
      `<ul>${types.map(t => `<li>${t.text}</li>`).join("")}</ul>`;

    const exercises = recommendExercises(
      r.pelvisR, r.pelvisL,
      r.abdR, r.abdL,
      r.addR, r.addL,
      r.speedPercent
    );
    if (exercises.length > 0) {
      exerciseBox.style.display = "block";
      exerciseBox.innerHTML =
        `<h3>② あなたにおすすめのセルフエクササイズ</h3>` +
        buildExerciseHTML(exercises);
    } else {
      exerciseBox.style.display = "none";
    }

    graphCard.style.display = "block";
    graphCard.querySelector("h3").textContent = "③ 回復の変化を比べる（グラフ）";

    historyCard.style.display = "block";
    historyCard.querySelector("h3").textContent = "④ 回復の変化を比べる（表）";

    resultBox.style.display = "block";
    resultBox.querySelector("h3").textContent = "⑤ 左右別の結果";

    setColoredValue("pelvisRCell", r.pelvisR, "pelvis");
    setColoredValue("pelvisLCell", r.pelvisL, "pelvis");
    setColoredValue("abdRCell",   r.abdR,   "abd");
    setColoredValue("abdLCell",   r.abdL,   "abd");
    setColoredValue("addRCell",   r.addR,   "add");
    setColoredValue("addLCell",   r.addL,   "add");

    const speedCell = document.getElementById("speedCell");
    speedCell.textContent = r.speedPercent.toFixed(1);
    const speedStatus = colorizeResult(r.speedPercent, "speed");
    speedCell.classList.remove("result-normal", "result-warning", "result-danger");
    speedCell.classList.add(`result-${speedStatus}`);
  }

  let label = surgeryDiffText.textContent.trim();
  if (!label) label = "日付未設定";

  historyLabels.push(label);
  historyPelvis.push((r.pelvisR + r.pelvisL) / 2);
  historyHipAbd.push((r.abdR + r.abdL) / 2);
  historyHipAdd.push((r.addR + r.addL) / 2);
  historySpeed.push(r.speedPercent);
  saveHistory();

  const tbody = document.querySelector("#resultTable tbody");
  const row = document.createElement("tr");
  row.innerHTML = `
    <td>${label}</td>
    <td>${((r.pelvisR + r.pelvisL) / 2).toFixed(1)}</td>
    <td>${((r.abdR + r.abdL) / 2).toFixed(1)}</td>
    <td>${((r.addR + r.addL) / 2).toFixed(1)}</td>
    <td>${r.speedPercent.toFixed(1)}</td>
  `;
  tbody.appendChild(row);

  updateCompareChart();
}

// ---------------------------------------------------------
// グラフ描画
// ---------------------------------------------------------
function updateCompareChart() {
  const ctx = document.getElementById("compareChart").getContext("2d");
  if (compareChart) compareChart.destroy();

  compareChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: historyLabels,
      datasets: [
        {
          label: "骨盤の傾き（平均）",
          data: historyPelvis,
          borderColor: "#ff3b30",
          backgroundColor: "rgba(255,59,48,0.1)",
          tension: 0.3
        },
        {
          label: "外転（平均）",
          data: historyHipAbd,
          borderColor: "#007aff",
          backgroundColor: "rgba(0,122,255,0.1)",
          tension: 0.3
        },
        {
          label: "内転（平均）",
          data: historyHipAdd,
          borderColor: "#ffcc00",
          backgroundColor: "rgba(255,204,0,0.1)",
          tension: 0.3
        },
        {
          label: "歩行速度（%）",
          data: historySpeed,
          borderColor: "#34c759",
          backgroundColor: "rgba(52,199,89,0.1)",
          tension: 0.3,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: { title: { display: true, text: "角度（度）" } },
        y1: {
          position: "right",
          title: { display: true, text: "速度（%）" },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

// ---------------------------------------------------------
// PDFレポート作成
// ---------------------------------------------------------
document.getElementById("pdfReportBtn").addEventListener("click", async () => {
  if (!lastAnalysisResult) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  if (typeof addJapaneseFont === "function") {
    addJapaneseFont(doc);
    doc.setFont("NotoSansJP", "normal");
  }

  doc.setFontSize(16);
  doc.text("歩行解析レポート", 10, 15);

  doc.setFontSize(12);
  let y = 30;

  const r = lastAnalysisResult;

  if (userMode === "therapist") {
    doc.text(`骨盤の傾き R:${r.pelvisR.toFixed(1)}° / L:${r.pelvisL.toFixed(1)}°`, 10, y); y += 8;
    doc.text(`外転 R:${r.abdR.toFixed(1)}° / L:${r.abdL.toFixed(1)}°`, 10, y); y += 8;
    doc.text(`内転 R:${r.addR.toFixed(1)}° / L:${r.addL.toFixed(1)}°`, 10, y); y += 8;
    doc.text(`歩行速度：${r.speedPercent.toFixed(1)} %`, 10, y); y += 12;

    doc.text("歩き方の特徴（専門的）", 10, y); y += 8;
  } else {
    doc.text("歩き方の特徴", 10, y); y += 8;
  }

  r.types.forEach((t) => {
    const lines = doc.splitTextToSize(t.text, 180);
    doc.text(lines, 10, y);
    y += lines.length * 7;
  });

  const chartCanvas = document.getElementById("compareChart");
  if (chartCanvas) {
    const imgData = chartCanvas.toDataURL("image/png");
    y += 10;
    if (y > 200) {
      doc.addPage();
      y = 20;
    }
    doc.text("回復の変化（グラフ）", 10, y);
    y += 6;
    doc.addImage(imgData, "PNG", 10, y, 180, 80);
  }

  doc.save("gait-report.pdf");
});

// ---------------------------------------------------------
// 履歴保存・読み込み
// ---------------------------------------------------------
function saveHistory() {
  const data = {
    labels: historyLabels,
    pelvis: historyPelvis,
    abd: historyHipAbd,
    add: historyHipAdd,
    speed: historySpeed
  };
  localStorage.setItem("gaitHistory", JSON.stringify(data));
}

function loadHistory() {
  const data = localStorage.getItem("gaitHistory");
  if (!data) return;

  const obj = JSON.parse(data);
  historyLabels.push(...obj.labels);
  historyPelvis.push(...obj.pelvis);
  historyHipAbd.push(...obj.abd);
  historyHipAdd.push(...obj.add);
  historySpeed.push(...obj.speed);
}

// ---------------------------------------------------------
// 初期化
// ---------------------------------------------------------
window.addEventListener("load", () => {
  loadHistory();
});





