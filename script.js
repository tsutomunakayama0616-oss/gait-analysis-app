/* ---------------------------------------------------------
  グローバル変数
--------------------------------------------------------- */
let poseLandmarker = null;
let runningMode = "IMAGE";
let liveAnimationId = null;
let videoAnimationId = null;
let compareChart = null;

const historyLabels = [];
const historyPelvis = [];
const historyHipAbd = [];
const historyHipAdd = [];
const historySpeed = [];

let loadedVideoURL = null;
let lastLandmarks = null;
let lastAnalysisResult = null;
let userMode = "none";

/* ---------------------------------------------------------
  エクササイズリスト（添付の18本）
--------------------------------------------------------- */
const exerciseList = [
  { id: 1,  category: "ストレッチ", name: "ハムストリングス（大腿部後面）のストレッチ", url: "https://youtu.be/ihchQBuigY0" },
  { id: 2,  category: "ストレッチ", name: "大腿四頭筋（大腿部前面）のストレッチ", url: "https://youtu.be/lVpF9TiepLg" },
  { id: 3,  category: "ストレッチ", name: "腸腰筋（股関節前面）のストレッチ", url: "https://youtu.be/XIA80pBZ3ws" },
  { id: 4,  category: "ストレッチ", name: "内転筋（大腿部内側）のストレッチ", url: "https://youtu.be/racb4M_hycM" },
  { id: 5,  category: "ストレッチ", name: "下腿三頭筋（ふくらはぎ）のストレッチ", url: "https://youtu.be/Wbi5St1J9Kk" },
  { id: 6,  category: "可動域・循環", name: "足首の上下（ポンプ）運動", url: "https://youtu.be/-inqX6tmDm8" },
  { id: 7,  category: "筋力（殿筋）", name: "大殿筋（お尻）の筋力増強運動（収縮のみ）", url: "https://youtu.be/4ckJ67_8IB8" },
  { id: 8,  category: "筋力（殿筋）", name: "大殿筋（お尻）の筋力増強運動（ブリッジ）", url: "https://youtu.be/9zKZ-YRmU8I" },
  { id: 9,  category: "筋力（殿筋）", name: "大殿筋（お尻）の筋力増強運動（立位）", url: "https://youtu.be/aikGoCaTFFI" },
  { id: 10, category: "筋力（大腿四頭筋）", name: "大腿四頭筋（大腿部前面）の筋力増強運動（セッティング）", url: "https://youtu.be/rweyU-3O3zo" },
  { id: 11, category: "筋力（大腿四頭筋）", name: "大腿四頭筋（大腿部前面）の筋力増強運動（SLR）", url: "https://youtu.be/fNM6w_RnVRk" },
  { id: 12, category: "筋力（中殿筋）", name: "中殿筋（殿部外側）の筋力増強運動（背臥位）", url: "https://youtu.be/UBN5jCP-ErM" },
  { id: 13, category: "筋力（中殿筋）", name: "中殿筋（殿部外側）の筋力増強運動（立位）", url: "https://youtu.be/0gKoLDR8HcI" },
  { id: 14, category: "バランス", name: "バランス運動（タンデム）", url: "https://youtu.be/F0OVS9LT1w4" },
  { id: 15, category: "バランス", name: "バランス運動（片脚立位）", url: "https://youtu.be/HUjoGJtiknc" },
  { id: 16, category: "有酸素運動", name: "ウォーキング", url: "https://youtu.be/Cs4NOzgkS8s" },
  { id: 17, category: "有酸素運動", name: "自転車エルゴメータ", url: "https://youtu.be/12_J_pr-MUE" },
  { id: 18, category: "有酸素運動", name: "水中運動", url: "https://youtu.be/xqj3dn9mw50" }
];

/* ---------------------------------------------------------
  YouTubeサムネイル自動生成
--------------------------------------------------------- */
function getThumbnail(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace("/", "");
      return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    }
  } catch (e) {}
  return "exercise.png";
}

/* ---------------------------------------------------------
  スタート画面：患者様用 / 理学療法士用
--------------------------------------------------------- */
const startSection = document.getElementById("startSection");
const tabBar = document.getElementById("tabBar");

document.getElementById("patientModeBtn").addEventListener("click", () => {
  userMode = "patient";
  startSection.style.display = "none";

  document.querySelectorAll(".section").forEach(sec => sec.classList.remove("active"));
  document.getElementById("videoSection").classList.add("active");

  tabBar.style.display = "flex";  // ★ スタート後は常時表示
  setActiveTab("videoSection");
});

document.getElementById("therapistModeBtn").addEventListener("click", () => {
  userMode = "therapist";
  startSection.style.display = "none";

  document.querySelectorAll(".section").forEach(sec => sec.classList.remove("active"));
  document.getElementById("usageSection").classList.add("active");

  tabBar.style.display = "flex";  // ★ スタート後は常時表示
  setActiveTab("usageSection");
});

/* ---------------------------------------------------------
  下タブバー（常時表示）
--------------------------------------------------------- */
function setActiveTab(targetId) {
  document.querySelectorAll("#tabBar button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.target === targetId);
  });
}

document.querySelectorAll("#tabBar button").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    document.querySelectorAll(".section").forEach(sec => sec.classList.remove("active"));
    document.getElementById(target).classList.add("active");
    setActiveTab(target);
  });
});

/* ---------------------------------------------------------
  撮影補助：チェックリスト → 全チェックでカメラ起動ボタン有効
--------------------------------------------------------- */
const liveChecks = document.querySelectorAll(".live-check");
const startLiveBtn = document.getElementById("startLiveBtn");

function updateLiveStartButton() {
  const allChecked = Array.from(liveChecks).every(ch => ch.checked);
  startLiveBtn.disabled = !allChecked;
}

liveChecks.forEach(ch => {
  ch.addEventListener("change", updateLiveStartButton);
});

/* ---------------------------------------------------------
  撮影補助モード：外側カメラ起動（スマホ最適化）
--------------------------------------------------------- */
document.getElementById("startLiveBtn").addEventListener("click", async () => {
  const video = document.getElementById("liveVideo");

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { exact: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });

  video.srcObject = stream;
  await video.play();
});

document.getElementById("stopLiveBtn").addEventListener("click", () => {
  const video = document.getElementById("liveVideo");
  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  video.srcObject = null;
});

/* ---------------------------------------------------------
  動画読み込み（解析用）
--------------------------------------------------------- */
document.getElementById("videoFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  loadedVideoURL = URL.createObjectURL(file);

  const video = document.getElementById("analysisVideo");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.muted = true;
  video.src = loadedVideoURL;

  document.getElementById("videoStatus").textContent =
    "動画が読み込まれました。「動作を解析する」を押してください。";
});

/* ---------------------------------------------------------
  MediaPipe PoseLandmarker 初期化
--------------------------------------------------------- */
async function initPoseLandmarker() {
  if (poseLandmarker) return;

  const vision = await window.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  poseLandmarker = await window.PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });

  runningMode = "VIDEO";
}

/* ---------------------------------------------------------
  手術日 → 手術後◯日
--------------------------------------------------------- */
document.getElementById("surgeryDate").addEventListener("change", () => {
  const inputDate = new Date(document.getElementById("surgeryDate").value);
  const today = new Date();
  if (isNaN(inputDate.getTime())) {
    document.getElementById("surgeryDiffText").textContent = "";
    return;
  }
  const diffDays = Math.floor((today - inputDate) / (1000 * 60 * 60 * 24));
  const text =
    diffDays >= 0
      ? `手術後 ${diffDays}日`
      : `手術前 ${Math.abs(diffDays)}日`;
  document.getElementById("surgeryDiffText").textContent = text;
});

/* ---------------------------------------------------------
  動作解析（メイン処理）
--------------------------------------------------------- */
document.getElementById("analyzeVideoBtn").addEventListener("click", async () => {
  if (!loadedVideoURL) {
    document.getElementById("videoError").textContent =
      "動画が選択されていません。";
    return;
  }

  const analyzeBtn = document.getElementById("analyzeVideoBtn");
  analyzeBtn.disabled = true;
  document.getElementById("videoError").textContent = "";
  document.getElementById("videoStatus").textContent = "解析中…";

  await initPoseLandmarker();
  if (!poseLandmarker) {
    document.getElementById("videoError").textContent =
      "骨格モデルの読み込みに失敗しました。";
    analyzeBtn.disabled = false;
    return;
  }

  const video = document.getElementById("analysisVideo");
  const canvas = document.getElementById("analysisCanvas");
  const ctx = canvas.getContext("2d");
  const drawingUtils = new window.DrawingUtils(ctx);

  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.muted = true;
  video.controls = false;
  video.currentTime = 0;
  await video.play();

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  let maxPelvisTiltRight = 0;
  let maxPelvisTiltLeft = 0;
  let maxHipAbductionRight = 0;
  let maxHipAbductionLeft = 0;
  let maxHipAdductionRight = 0;
  let maxHipAdductionLeft = 0;

  let firstFrameTime = null;
  let lastFrameTime = null;
  let firstFootX = null;
  let lastFootX = null;

  const neutralHipAngle = 90;

  function processFrame() {
    if (video.paused || video.ended || video.currentTime >= video.duration) {
      finishAnalysis();
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const nowInMs = performance.now();
    const result = poseLandmarker.detectForVideo(video, nowInMs);

    if (result && result.landmarks && result.landmarks.length > 0) {
      const lm = result.landmarks[0];
      lastLandmarks = lm;

      drawingUtils.drawLandmarks(lm, { radius: 3, color: "#ff3b30" });
      drawingUtils.drawConnectors(
        lm,
        window.PoseLandmarker.POSE_CONNECTIONS,
        { color: "#007aff", lineWidth: 2 }
      );

      const rightHip = lm[24];
      const rightKnee = lm[26];
      const rightAnkle = lm[28];

      const leftHip = lm[23];
      const leftKnee = lm[25];
      const leftAnkle = lm[27];

      const pelvisCenter = {
        x: (rightHip.x + leftHip.x) / 2,
        y: (rightHip.y + leftHip.y) / 2
      };

      const pelvisTiltRight = Math.abs(rightHip.y - pelvisCenter.y);
      const pelvisTiltLeft = Math.abs(leftHip.y - pelvisCenter.y);
      maxPelvisTiltRight = Math.max(maxPelvisTiltRight, pelvisTiltRight);
      maxPelvisTiltLeft = Math.max(maxPelvisTiltLeft, pelvisTiltLeft);

      const hipAngleRight = angleDeg(
        rightKnee.x, rightKnee.y,
        rightHip.x, rightHip.y,
        pelvisCenter.x, pelvisCenter.y
      );

      const hipAngleLeft = angleDeg(
        leftKnee.x, leftKnee.y,
        leftHip.x, leftHip.y,
        pelvisCenter.x, pelvisCenter.y
      );

      if (hipAngleRight >= neutralHipAngle) {
        maxHipAbductionRight = Math.max(maxHipAbductionRight, hipAngleRight - neutralHipAngle);
      } else {
        maxHipAdductionRight = Math.max(maxHipAdductionRight, neutralHipAngle - hipAngleRight);
      }

      if (hipAngleLeft >= neutralHipAngle) {
        maxHipAbductionLeft = Math.max(maxHipAbductionLeft, hipAngleLeft - neutralHipAngle);
      } else {
        maxHipAdductionLeft = Math.max(maxHipAdductionLeft, neutralHipAngle - hipAngleLeft);
      }

      const currentTime = video.currentTime;
      const currentFootX = rightAnkle.x;
      if (firstFrameTime === null) {
        firstFrameTime = currentTime;
        firstFootX = currentFootX;
      }
      lastFrameTime = currentTime;
      lastFootX = currentFootX;
    }

    ctx.restore();
    videoAnimationId = requestAnimationFrame(processFrame);
  }

  function finishAnalysis() {
    if (videoAnimationId) {
      cancelAnimationFrame(videoAnimationId);
      videoAnimationId = null;
    }

    let gaitSpeedRaw = 0;
    if (
      firstFrameTime !== null &&
      lastFrameTime !== null &&
      lastFrameTime > firstFrameTime &&
      firstFootX !== null &&
      lastFootX !== null
    ) {
      const dx = Math.abs(lastFootX - firstFootX);
      const dt = lastFrameTime - firstFrameTime;
      gaitSpeedRaw = dx / dt;
    }
    const gaitSpeedPercent = gaitSpeedRaw * 100;

    const pelvisRdeg = maxPelvisTiltRight * 180;
    const pelvisLdeg = maxPelvisTiltLeft * 180;
    const abdRdeg = maxHipAbductionRight;
    const abdLdeg = maxHipAbductionLeft;
    const addRdeg = maxHipAdductionRight;
    const addLdeg = maxHipAdductionLeft;

    lastAnalysisResult = {
      pelvisR: pelvisRdeg,
      pelvisL: pelvisLdeg,
      abdR: abdRdeg,
      abdL: abdLdeg,
      addR: addRdeg,
      addL: addLdeg,
      speedPercent: gaitSpeedPercent,
      types: [],
      conditionLabel: ""
    };

    document.getElementById("videoStatus").textContent = "解析が完了しました。";
    analyzeBtn.disabled = false;

    finalizeAnalysis();
  }

  processFrame();
});

/* ---------------------------------------------------------
  角度計算（3点からの角度）
--------------------------------------------------------- */
function angleDeg(ax, ay, bx, by, cx, cy) {
  const v1x = ax - bx;
  const v1y = ay - by;
  const v2x = cx - bx;
  const v2y = cy - by;
  const dot = v1x * v2x + v1y * v2y;
  const n1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const n2 = Math.sqrt(v2x * v2x + v2y * v2y);
  if (n1 === 0 || n2 === 0) return 0;
  let cos = dot / (n1 * n2);
  cos = Math.min(1, Math.max(-1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}

/* ---------------------------------------------------------
  一般的な歩行特徴診断
--------------------------------------------------------- */
function diagnoseGait(pR, pL, abdR, abdL, addR, addL, speed) {
  const types = [];

  if (pR > 10 || pL > 10) types.push("骨盤の左右の傾きが大きい傾向があります。");
  if (abdR < 5 || abdL < 5) types.push("股関節の外転が小さい傾向があります。");
  if (addR > 10 || addL > 10) types.push("股関節の内転が大きい傾向があります。");
  if (speed < 80) types.push("歩く速さがゆっくりめです。");
  if (speed > 120) types.push("歩く速さが速めです。");

  return types;
}

/* ---------------------------------------------------------
  THA特有の代償動作の診断
--------------------------------------------------------- */
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
    typesTHA.push(
      expert
        ? "右立脚時に対側骨盤の下制がみられ、中殿筋機能不全を示唆します。"
        : "右脚で立つときに反対側の骨盤が下がりやすい傾向があります。"
    );
  }
  if (pelvisDropLeft > 0.03) {
    typesTHA.push(
      expert
        ? "左立脚時に対側骨盤の下制がみられ、中殿筋機能不全を示唆します。"
        : "左脚で立つときに反対側の骨盤が下がりやすい傾向があります。"
    );
  }

  const shoulderTilt = Math.abs(rightShoulder.y - leftShoulder.y);
  const pelvisTilt   = Math.abs(rightHip.y - leftHip.y);
  if (shoulderTilt > pelvisTilt + 0.03) {
    typesTHA.push(
      expert
        ? "立脚側への体幹側方傾斜が大きく、デュシェンヌ歩行様の代償がみられます。"
        : "歩くときに体が左右に大きく傾く傾向があります。"
    );
  }

  const stepWidth = Math.abs(rightAnkle.x - leftAnkle.x);
  if (stepWidth < 0.03)
    typesTHA.push(expert ? "歩隔が狭い傾向があります。" : "足と足の間の幅が狭い傾向があります。");
  else if (stepWidth > 0.10)
    typesTHA.push(expert ? "歩隔が広い傾向があります。" : "足と足の間の幅が広い傾向があります。");

  return typesTHA;
}

/* ---------------------------------------------------------
  エクササイズ推薦（添付18本＋AI選定）
--------------------------------------------------------- */
function recommendExercises(pR, pL, abdR, abdL, addR, addL, speed) {
  const ids = [];

  const pelvisMean = (pR + pL) / 2;
  const abdMean    = (abdR + abdL) / 2;
  const addMean    = (addR + addL) / 2;

  // 骨盤の左右傾きが大きい → 中殿筋＋殿筋＋バランス
  if (pelvisMean > 10) {
    ids.push(12, 13); // 中殿筋
    ids.push(7, 8, 9); // 大殿筋
    ids.push(14, 15);  // バランス
  }

  // 外転が小さい → 中殿筋
  if (abdMean < 5) {
    ids.push(12, 13);
  }

  // 内転が大きい → 内転筋ストレッチ＋中殿筋
  if (addMean > 10) {
    ids.push(4);       // 内転筋ストレッチ
    ids.push(12, 13);  // 中殿筋
  }

  // 歩行速度が遅い → 有酸素運動＋大筋群
  if (speed < 80) {
    ids.push(16, 17, 18); // 有酸素
    ids.push(7, 8, 9);    // 殿筋
    ids.push(10, 11);     // 大腿四頭筋
  }

  // 軽度なら → 基本ストレッチ＋ポンプ
  if (ids.length === 0) {
    ids.push(1, 2, 3, 5, 6);
  }

  const unique = [...new Set(ids)];
  return unique
    .map(id => exerciseList.find(e => e.id === id))
    .filter(Boolean);
}

/* ---------------------------------------------------------
  エクササイズHTML生成（YouTube＋サムネイル）
--------------------------------------------------------- */
function buildExerciseHTML(exercises) {
  return exercises.map(ex => `
    <div style="margin-bottom:12px;">
      <strong>${ex.category}</strong><br>
      ${ex.name}<br>
      <a href="${ex.url}" target="_blank" rel="noopener noreferrer">
        <img src="${getThumbnail(ex.url)}"
             style="width:100%;border-radius:8px;margin-top:4px;">
      </a>
    </div>
  `).join("");
}

/* ---------------------------------------------------------
  色分けロジック
--------------------------------------------------------- */
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

/* ---------------------------------------------------------
  解析後の表示処理（患者様用 / 理学療法士用）
--------------------------------------------------------- */
function finalizeAnalysis() {
  const r = lastAnalysisResult;
  if (!r) return;

  const typeBox = document.getElementById("typeBox");
  const exerciseBox = document.getElementById("exerciseBox");
  const graphCard = document.getElementById("graphCard");
  const historyCard = document.getElementById("historyCard");
  const resultBox = document.getElementById("resultBox");

  /* 特徴（一般＋THA） */
  let types = diagnoseGait(
    r.pelvisR, r.pelvisL,
    r.abdR, r.abdL,
    r.addR, r.addL,
    r.speedPercent
  );
  const thaTypes = diagnoseTHA(lastLandmarks, userMode === "therapist");
  types = types.concat(thaTypes);
  r.types = types;

  /* -------------------------------
     患者様用：①特徴 → ②エクササイズ → ③グラフ
  -------------------------------- */
  if (userMode === "patient") {

    typeBox.style.display = "block";
    typeBox.innerHTML =
      `<h3>① あなたの歩行の特徴</h3>
       <ul>${types.map(t => `<li>${t}</li>`).join("")}</ul>`;

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
    resultBox.style.display = "none";
  }

  /* -------------------------------
     理学療法士用：
     ①特徴 → ②エクササイズ → ③グラフ → ④表 → ⑤左右別
  -------------------------------- */
  if (userMode === "therapist") {

    typeBox.style.display = "block";
    typeBox.innerHTML =
      `<h3>① あなたの歩行の特徴（専門的）</h3>
       <ul>${types.map(t => `<li>${t}</li>`).join("")}</ul>`;

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

  /* -------------------------------
     履歴保存・表更新・グラフ更新（共通）
  -------------------------------- */
  const label = document.getElementById("surgeryDiffText").textContent || `解析${historyLabels.length + 1}`;
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

/* ---------------------------------------------------------
  グラフ描画
--------------------------------------------------------- */
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

/* ---------------------------------------------------------
  PDFレポート作成
--------------------------------------------------------- */
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
    const lines = doc.splitTextToSize(t, 180);
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

/* ---------------------------------------------------------
  履歴保存・読み込み
--------------------------------------------------------- */
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

/* ---------------------------------------------------------
  初期化
--------------------------------------------------------- */
window.addEventListener("load", () => {
  loadHistory();
});
