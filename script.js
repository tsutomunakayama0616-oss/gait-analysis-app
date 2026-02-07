// script.js（完全修正版：解析修正＋外向きカメラ＋YouTubeサムネ＋実エクササイズ18本）

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
  const diffDays = Math.round((today - surgeryDate) / (1000 * 60 * 60 * 24));

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
  const allChecked = Array.from(liveChecks).every(ch => ch.checked);
  startLiveBtn.disabled = !allChecked;
}
liveChecks.forEach(ch => ch.addEventListener("change", updateLiveButtonState));

// ---------------------------------------------------------
// 撮影補助モード：外向きカメラで録画
// ---------------------------------------------------------
startLiveBtn.addEventListener("click", async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("この端末ではカメラが利用できません。");
      return;
    }

    liveStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });

    liveVideo.srcObject = liveStream;
    await liveVideo.play();

    recordedChunks = [];
    mediaRecorder = new MediaRecorder(liveStream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || "video/mp4" });
      const url = URL.createObjectURL(blob);

      loadedVideoURL = url;
      analysisVideo.src = url;
      analysisVideo.load();

      tabButtons.forEach(b => b.classList.remove("active"));
      const analyzeTab = Array.from(tabButtons).find(b => b.dataset.target === "videoSection");
      if (analyzeTab) analyzeTab.classList.add("active");
      showSection("videoSection");
    };

    mediaRecorder.start();
  } catch (e) {
    console.error(e);
    alert("カメラの起動に失敗しました。");
  }
});

stopLiveBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (liveStream) {
    liveStream.getTracks().forEach(t => t.stop());
    liveStream = null;
  }
  liveVideo.srcObject = null;
});

// ---------------------------------------------------------
// ファイル選択 → 動画読み込み
// ---------------------------------------------------------
videoFileInput.addEventListener("change", () => {
  const file = videoFileInput.files[0];
  if (!file) return;

  if (loadedVideoURL) {
    URL.revokeObjectURL(loadedVideoURL);
  }
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
// 動画解析（ファイル選択でも確実に動く版）
// ---------------------------------------------------------
async function analyzeVideoWithPose() {
  return new Promise((resolve) => {
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

      runningMode = "VIDEO";
      poseLandmarker.setOptions({ runningMode: "VIDEO" });

      async function processFrame() {
        if (video.paused || video.ended) {
          finalize();
          return;
        }

        const now = performance.now();
        if (video.currentTime === lastVideoTime) {
          requestAnimationFrame(processFrame);
          return;
        }
        lastVideoTime = video.currentTime;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const result = poseLandmarker.detectForVideo(video, now);
        if (result && result.landmarks && result.landmarks.length > 0) {
          const lm = result.landmarks[0];
          lastLandmarks = lm;

          const rightHip = lm[24];
          const leftHip  = lm[23];
          const rightKnee = lm[26];
          const leftKnee  = lm[25];

          const pelvisAngleR = (rightHip.y - leftHip.y) * 180;
          const pelvisAngleL = (leftHip.y - rightHip.y) * 180;

          pelvisR += Math.abs(pelvisAngleR);
          pelvisL += Math.abs(pelvisAngleL);

          const abdAngleR = Math.abs(rightHip.x - rightKnee.x) * 180;
          const abdAngleL = Math.abs(leftHip.x - leftKnee.x) * 180;

          abdR += abdAngleR;
          abdL += abdAngleL;

          const addAngleR = Math.abs(rightHip.x - rightKnee.x) * 90;
          const addAngleL = Math.abs(leftHip.x - leftKnee.x) * 90;

          addR += addAngleR;
          addL += addAngleL;

          frameCount++;
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

        const speedPercent = 100;

        lastAnalysisResult = {
          pelvisR,
          pelvisL,
          abdR,
          abdL,
          addR,
          addL,
          speedPercent,
          types: [],
        };

        videoStatus.textContent = "解析が完了しました。";
        finalizeAnalysis();
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
}

// ---------------------------------------------------------
// エクササイズ一覧（添付ファイル18本に置換）
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
// YouTube サムネイル取得（通常URL＋短縮URL対応）
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
// エクササイズHTML（サムネイルはそのまま表示）
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
