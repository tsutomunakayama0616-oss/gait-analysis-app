// ---------------------------------------------------------
// グローバル変数
// ---------------------------------------------------------
let userMode = null; // "patient" or "therapist"
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
  [usageSection, liveSection, videoSection, startSection].forEach(sec => {
    sec.classList.remove("active");
  });
  const target = document.getElementById(id);
  if (target) target.classList.add("active");
}

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const target = btn.getAttribute("data-target");
    showSection(target);
  });
});

// ---------------------------------------------------------
// モード選択（患者様用 / 理学療法士用）
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
// 撮影補助モード：チェックボックスでカメラ起動ボタン制御
// ---------------------------------------------------------
function updateLiveButtonState() {
  const allChecked = Array.from(liveChecks).every(ch => ch.checked);
  startLiveBtn.disabled = !allChecked;
}
liveChecks.forEach(ch => ch.addEventListener("change", updateLiveButtonState));

// ---------------------------------------------------------
// 撮影補助モード：カメラ起動＋録画 → 解析に反映
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
    liveVideo.play();

    // MediaRecorder で録画開始
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(liveStream, { mimeType: "video/webm" });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);

      // 解析用にそのまま反映
      loadedVideoURL = url;
      analysisVideo.src = url;
      analysisVideo.load();

      // 解析タブへ切り替え
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
// 動画解析（MediaPipe）
// ---------------------------------------------------------
async function analyzeVideoWithPose() {
  return new Promise((resolve) => {
    analysisVideo.addEventListener(
      "loadeddata",
      async () => {
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

        function processFrame() {
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
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          const result = poseLandmarker.detectForVideo(video, performance.now());
          if (result && result.landmarks && result.landmarks.length > 0) {
            const lm = result.landmarks[0];
            lastLandmarks = lm;

            // ここで骨盤傾き・外転・内転などを計算（簡略版）
            const rightHip = lm[24];
            const leftHip = lm[23];
            const rightKnee = lm[26];
            const leftKnee = lm[25];

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
          abdR /= frameCount;
          abdL /= frameCount;
          addR /= frameCount;
          addL /= frameCount;

          // 歩行速度（仮に100%固定でもよいが、ここでは仮の値）
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

        video.play();
        processFrame();
      },
      { once: true }
    );
  });
}

// ---------------------------------------------------------
// エクササイズリスト（18本）
// ---------------------------------------------------------
const exerciseList = [
  { id: 1, category: "ストレッチ", name: "ハムストリングスストレッチ", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX1" },
  { id: 2, category: "ストレッチ", name: "大腿四頭筋ストレッチ", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX2" },
  { id: 3, category: "ストレッチ", name: "ふくらはぎストレッチ", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX3" },
  { id: 4, category: "ストレッチ", name: "内転筋ストレッチ", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX4" },
  { id: 5, category: "ポンプ運動", name: "足首ポンプ運動", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX5" },
  { id: 6, category: "ポンプ運動", name: "膝の曲げ伸ばし運動", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX6" },
  { id: 7, category: "筋力トレーニング", name: "ブリッジ", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX7" },
  { id: 8, category: "筋力トレーニング", name: "ヒップリフト", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX8" },
  { id: 9, category: "筋力トレーニング", name: "スクワット", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX9" },
  { id: 10, category: "筋力トレーニング", name: "膝伸展トレーニング", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX10" },
  { id: 11, category: "筋力トレーニング", name: "レッグエクステンション", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX11" },
  { id: 12, category: "中殿筋トレーニング", name: "サイドレッグレイズ", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX12" },
  { id: 13, category: "中殿筋トレーニング", name: "クラムシェル", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX13" },
  { id: 14, category: "バランストレーニング", name: "片脚立ち", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX14" },
  { id: 15, category: "バランストレーニング", name: "タンデムスタンス", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX15" },
  { id: 16, category: "有酸素運動", name: "平地歩行", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX16" },
  { id: 17, category: "有酸素運動", name: "エルゴメーター", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX17" },
  { id: 18, category: "有酸素運動", name: "ステップ運動", url: "https://www.youtube.com/watch?v=XXXXXXXXXXX18" },
];

// ---------------------------------------------------------
// YouTube サムネイル取得
// ---------------------------------------------------------
function getThumbnail(url) {
  try {
    const u = new URL(url);
    const id = u.searchParams.get("v");
    if (!id) return "";
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  } catch {
    return "";
  }
}

/* ---------------------------------------------------------
  角度計算（3点からの角度）※必要なら利用
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
  一般的な歩行特徴診断（患者様向けラベル付き）
--------------------------------------------------------- */
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

/* ---------------------------------------------------------
  THA特有の代償動作の診断
  - expert = true のときは専門的表現
  - 戻り値は { level, text } 形式
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

/* ---------------------------------------------------------
  エクササイズ推薦
--------------------------------------------------------- */
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

/* ---------------------------------------------------------
  エクササイズHTML生成（サムネイル 1/4 サイズ）
--------------------------------------------------------- */
function buildExerciseHTML(exercises) {
  return exercises.map(ex => `
    <div style="margin-bottom:12px; display:flex; align-items:flex-start; gap:8px;">
      <div style="flex:0 0 25%;">
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
  患者様用の特徴リストHTML（色付きラベル）
--------------------------------------------------------- */
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

/* ---------------------------------------------------------
  解析後の表示処理（患者様用 / 理学療法士用）
--------------------------------------------------------- */
function finalizeAnalysis() {
  const r = lastAnalysisResult;
  if (!r) return;

  const resultBox = document.getElementById("resultBox");
  const graphCard = document.getElementById("graphCard");
  const historyCard = document.getElementById("historyCard");

  // 特徴（一般＋THA）
  let types = diagnoseGait(
    r.pelvisR, r.pelvisL,
    r.abdR, r.abdL,
    r.addR, r.addL,
    r.speedPercent
  );
  const thaTypes = diagnoseTHA(lastLandmarks, userMode === "therapist");
  types = types.concat(thaTypes);
  r.types = types;

  // 患者様用
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

  // 理学療法士用
  if (userMode === "therapist") {
    // ① 特徴（専門的）
    typeBox.style.display = "block";
    typeBox.innerHTML =
      `<h3>① あなたの歩行の特徴（専門的）</h3>` +
      `<ul>${types.map(t => `<li>${t.text}</li>`).join("")}</ul>`;

    // ② エクササイズ
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

    // ③ グラフ
    graphCard.style.display = "block";
    graphCard.querySelector("h3").textContent = "③ 回復の変化を比べる（グラフ）";

    // ④ 表
    historyCard.style.display = "block";
    historyCard.querySelector("h3").textContent = "④ 回復の変化を比べる（表）";

    // ⑤ 左右別
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

  // 履歴保存・表更新・グラフ更新（共通）
  let label = surgeryDiffText.textContent.trim();
  if (!label) {
    label = "日付未設定";
  }

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

