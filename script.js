/* ---------------------------------------------------------
グローバル変数
--------------------------------------------------------- */
let poseLandmarker = null;
let runningMode = "IMAGE";
let liveStream = null;
let liveAnimationId = null;
let videoAnimationId = null;
let compareChart = null;

const historyLabels = [];
const historyPelvis = [];
const historyHipAbd = [];
const historyHipAdd = [];
const historySpeed = [];

let previousStability = null;
let previousSymmetry = null;
let loadedVideoURL = null;

// 録画用
let mediaRecorder = null;
let recordedChunks = [];
let hasRecordedVideo = false;

// 直近フレームのランドマーク（THA判定用）
let lastLandmarks = null;

// 利用者モード："none" | "patient" | "therapist"
let userMode = "none";

/* ---------------------------------------------------------
PDFレポート用：直近の解析結果を保持
--------------------------------------------------------- */
let lastAnalysisResult = {
  pelvisR: 0,
  pelvisL: 0,
  abdR: 0,
  abdL: 0,
  addR: 0,
  addL: 0,
  speedPercent: 0,
  types: [],
  conditionLabel: ""
};

/* ---------------------------------------------------------
セルフエクササイズ一覧（カテゴリ付き）
--------------------------------------------------------- */
const exerciseList = [
  { id:1, category:"ストレッチ", name:"太もものうしろを伸ばすストレッチ", url:"https://youtu.be/ihchQBuigY0" },
  { id:2, category:"ストレッチ", name:"太ももの前を伸ばすストレッチ", url:"https://youtu.be/lVpF9TiepLg" },
  { id:3, category:"ストレッチ", name:"股関節の前を伸ばすストレッチ", url:"https://youtu.be/XIA80pBZ3ws" },
  { id:4, category:"ストレッチ", name:"内ももを伸ばすストレッチ", url:"https://youtu.be/racb4M_hycM" },
  { id:7, category:"筋力トレーニング（おしり）", name:"おしりの筋肉を意識して力を入れる運動", url:"https://youtu.be/4ckJ67_8IB8" },
  { id:8, category:"筋力トレーニング（おしり）", name:"おしりの筋肉を使ったブリッジ運動", url:"https://youtu.be/9zKZ-YRmU8I" },
  { id:9, category:"筋力トレーニング（おしり）", name:"立ったまま行うおしりの横の筋トレ", url:"https://youtu.be/aikGoCaTFFI" },
  { id:10, category:"筋力トレーニング（太もも）", name:"太ももの前の筋肉を目覚めさせる運動", url:"https://youtu.be/rweyU-3O3zo" },
  { id:11, category:"筋力トレーニング（太もも）", name:"足を持ち上げる運動（SLR）", url:"https://youtu.be/fNM6w_RnVRk" },
  { id:14, category:"バランス練習", name:"前後に足を並べて立つバランス練習", url:"https://youtu.be/F0OVS9LT1w4" },
  { id:15, category:"バランス練習", name:"片脚立ちのバランス練習", url:"https://youtu.be/HUjoGJtiknc" },
  { id:16, category:"有酸素運動", name:"ウォーキング", url:"https://youtu.be/Cs4NOzgkS8s" },
  { id:17, category:"有酸素運動", name:"自転車こぎの運動", url:"https://youtu.be/12_J_pr-MUE" },
  { id:18, category:"有酸素運動", name:"水の中での運動", url:"https://youtu.be/xqj3dn9mw50" }
];

/* ---------------------------------------------------------
YouTube サムネイル生成
--------------------------------------------------------- */
function getThumbnail(url) {
  const id = url.split("youtu.be/")[1];
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/* ---------------------------------------------------------
履歴の保存・読み込み（PT用）
--------------------------------------------------------- */
function saveHistory() {
  const data = {
    labels: historyLabels,
    pelvis: historyPelvis,
    hipAbd: historyHipAbd,
    hipAdd: historyHipAdd,
    speed: historySpeed,
    previousStability,
    previousSymmetry
  };
  try {
    localStorage.setItem("gaitHistoryV1", JSON.stringify(data));
  } catch (e) {
    console.warn("履歴を保存できませんでした", e);
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem("gaitHistoryV1");
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.labels)) return;

    historyLabels.push(...data.labels);
    historyPelvis.push(...(data.pelvis || []));
    historyHipAbd.push(...(data.hipAbd || []));
    historyHipAdd.push(...(data.hipAdd || []));
    historySpeed.push(...(data.speed || []));
    previousStability = data.previousStability ?? null;
    previousSymmetry = data.previousSymmetry ?? null;

    const tbody = document.querySelector("#resultTable tbody");
    tbody.innerHTML = "";
    for (let i = 0; i < historyLabels.length; i++) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${historyLabels[i]}</td>
        <td>${Number(historyPelvis[i]).toFixed(1)}</td>
        <td>${Number(historyHipAbd[i]).toFixed(1)}</td>
        <td>${Number(historyHipAdd[i]).toFixed(1)}</td>
        <td>${Number(historySpeed[i]).toFixed(1)}</td>
      `;
      tbody.appendChild(row);
    }

    if (historyLabels.length > 0) {
      updateCompareChart();
      document.getElementById("resultBox").style.display = "block";
    }
  } catch (e) {
    console.warn("履歴を読み込めませんでした", e);
  }
}

/* ---------------------------------------------------------
MediaPipe PoseLandmarker 初期化
--------------------------------------------------------- */
async function initPoseLandmarker() {
  if (poseLandmarker) return;
  if (!window.FilesetResolver || !window.PoseLandmarker || !window.DrawingUtils) {
    console.error("MediaPipe がまだ読み込まれていません。");
    return;
  }

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
手術日 → 手術前◯日 / 手術後◯日
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
スタート画面：患者様用 / 理学療法士用
--------------------------------------------------------- */
document.getElementById("patientModeBtn").addEventListener("click", () => {
  userMode = "patient";
  document.getElementById("startSection").classList.remove("active");
  document.getElementById("startSection").style.display = "none";

  // 患者様用：モード切替は表示するが、数値系は後で非表示制御
  document.getElementById("modeSwitchWrapper").style.display = "block";

  // デフォルトは動作解析タブを表示（患者様は解析をメインに）
  document.getElementById("videoSection").classList.add("active");
  document.getElementById("usageSection").classList.remove("active");
  document.getElementById("liveSection").classList.remove("active");

  document.getElementById("videoModeBtn").classList.add("active");
  document.getElementById("usageModeBtn").classList.remove("active");
  document.getElementById("liveModeBtn").classList.remove("active");

  // 患者様用では履歴テーブルとグラフは初期状態で非表示
  document.getElementById("resultTable").style.display = "none";
  document.getElementById("compareChart").style.display = "none";
});

document.getElementById("therapistModeBtn").addEventListener("click", () => {
  userMode = "therapist";
  document.getElementById("startSection").classList.remove("active");
  document.getElementById("startSection").style.display = "none";

  document.getElementById("modeSwitchWrapper").style.display = "block";
  document.getElementById("usageSection").classList.add("active");
  document.getElementById("liveSection").classList.remove("active");
  document.getElementById("videoSection").classList.remove("active");

  document.getElementById("usageModeBtn").classList.add("active");
  document.getElementById("liveModeBtn").classList.remove("active");
  document.getElementById("videoModeBtn").classList.remove("active");

  // PT用では履歴テーブルとグラフを活用
  document.getElementById("resultTable").style.display = "table";
  document.getElementById("compareChart").style.display = "block";
});

/* ---------------------------------------------------------
モード切替（使用方法・撮影補助・動作解析）
--------------------------------------------------------- */
document.getElementById("usageModeBtn").addEventListener("click", () => {
  document.getElementById("usageSection").classList.add("active");
  document.getElementById("liveSection").classList.remove("active");
  document.getElementById("videoSection").classList.remove("active");

  document.getElementById("usageModeBtn").classList.add("active");
  document.getElementById("liveModeBtn").classList.remove("active");
  document.getElementById("videoModeBtn").classList.remove("active");
});

document.getElementById("liveModeBtn").addEventListener("click", () => {
  document.getElementById("liveSection").classList.add("active");
  document.getElementById("usageSection").classList.remove("active");
  document.getElementById("videoSection").classList.remove("active");

  document.getElementById("liveModeBtn").classList.add("active");
  document.getElementById("usageModeBtn").classList.remove("active");
  document.getElementById("videoModeBtn").classList.remove("active");
});

document.getElementById("videoModeBtn").addEventListener("click", () => {
  document.getElementById("videoSection").classList.add("active");
  document.getElementById("usageSection").classList.remove("active");
  document.getElementById("liveSection").classList.remove("active");

  document.getElementById("videoModeBtn").classList.add("active");
  document.getElementById("usageModeBtn").classList.remove("active");
  document.getElementById("liveModeBtn").classList.remove("active");
});

/* ---------------------------------------------------------
撮影補助モード：チェックリスト
--------------------------------------------------------- */
const prechecks = document.querySelectorAll(".precheck");
prechecks.forEach((chk) => {
  chk.addEventListener("change", () => {
    const allChecked = [...prechecks].every((c) => c.checked);
    document.getElementById("startLiveBtn").disabled = !allChecked;
  });
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
撮影補助モード：カメラ起動＋録画
--------------------------------------------------------- */
document.getElementById("startLiveBtn").addEventListener("click", async () => {
  document.getElementById("liveError").textContent = "";
  try {
    await initPoseLandmarker();
    if (!poseLandmarker) {
      document.getElementById("liveError").textContent =
        "骨格モデルの読み込みに失敗しました。";
      return;
    }

    liveStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });

    const video = document.getElementById("liveVideo");
    const canvas = document.getElementById("liveCanvas");
    const ctx = canvas.getContext("2d");

    video.srcObject = liveStream;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.muted = true;
    await video.play();

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    document.getElementById("liveStatus").textContent = "カメラ起動中（録画中）…";
    document.getElementById("recIndicator").style.display = "inline-block";

    const drawingUtils = new window.DrawingUtils(ctx);

    // 録画開始
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(liveStream, { mimeType: "video/webm" });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      hasRecordedVideo = true;
      loadedVideoURL = url;

      const analysisVideo = document.getElementById("analysisVideo");
      analysisVideo.setAttribute("playsinline", "");
      analysisVideo.setAttribute("webkit-playsinline", "");
      analysisVideo.muted = true;
      analysisVideo.src = url;

      document.getElementById("videoStatus").textContent =
        "撮影した動画が読み込まれました。「動作を解析する」を押してください。";
    };
    mediaRecorder.start();

    function liveLoop() {
      if (!poseLandmarker) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const nowInMs = performance.now();
      const result = poseLandmarker.detectForVideo(video, nowInMs);

      if (result && result.landmarks && result.landmarks.length > 0) {
        const lm = result.landmarks[0];
        drawingUtils.drawLandmarks(lm, { radius: 3, color: "#ff3b30" });
        drawingUtils.drawConnectors(
          lm,
          window.PoseLandmarker.POSE_CONNECTIONS,
          { color: "#007aff", lineWidth: 2 }
        );
      }

      ctx.restore();
      liveAnimationId = requestAnimationFrame(liveLoop);
    }

    liveLoop();
  } catch (err) {
    console.error(err);
    document.getElementById("liveError").textContent =
      "カメラを起動できませんでした。";
  }
});

/* ---------------------------------------------------------
カメラ停止＋録画停止
--------------------------------------------------------- */
document.getElementById("stopLiveBtn").addEventListener("click", () => {
  if (liveAnimationId) {
    cancelAnimationFrame(liveAnimationId);
    liveAnimationId = null;
  }
  if (liveStream) {
    liveStream.getTracks().forEach((t) => t.stop());
    liveStream = null;
  }
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  document.getElementById("recIndicator").style.display = "none";
  document.getElementById("liveStatus").textContent = "カメラ停止";
});

/* ---------------------------------------------------------
動画読み込み（スマホ内の動画）
--------------------------------------------------------- */
document.getElementById("videoFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  loadedVideoURL = URL.createObjectURL(file);
  hasRecordedVideo = false;

  const video = document.getElementById("analysisVideo");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.muted = true;
  video.src = loadedVideoURL;

  document.getElementById("videoStatus").textContent =
    "選択した動画が読み込まれました。「動作を解析する」を押してください。";
});

/* ---------------------------------------------------------
グラフ更新（Chart.js）
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
          label: "骨盤の傾き（最大）",
          data: historyPelvis,
          borderColor: "#ff3b30",
          backgroundColor: "rgba(255,59,48,0.1)",
          tension: 0.3
        },
        {
          label: "足が外側に動いた角度（最大）",
          data: historyHipAbd,
          borderColor: "#007aff",
          backgroundColor: "rgba(0,122,255,0.1)",
          tension: 0.3
        },
        {
          label: "足が内側に動いた角度（最大）",
          data: historyHipAdd,
          borderColor: "#ffcc00",
          backgroundColor: "rgba(255,204,0,0.1)",
          tension: 0.3
        },
        {
          label: "歩く速さ（相対速度％）",
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
歩行タイプ診断（やさしい表現）
--------------------------------------------------------- */
function diagnoseGait(pelvisR, pelvisL, abdR, abdL, addR, addL, speedPercent) {
  const types = [];

  if (pelvisR > 10 || pelvisL > 10)
    types.push("骨盤が左右に揺れやすい歩き方です。からだの安定性を高める練習が役立ちます。");

  if (abdR < 5 || abdL < 5)
    types.push("足を横に広げる力が少し弱いかもしれません。おしりの横の筋肉を鍛える運動が効果的です。");

  if (addR > 5 || addL > 5)
    types.push("足が内側に入りやすい歩き方です。立っているときのバランス練習が役立ちます。");

  if (speedPercent < 80)
    types.push("歩く速さが少しゆっくりめです。体力や筋力を少しずつ高めていくと良いでしょう。");

  if (types.length === 0)
    return ["大きな問題は見られません。今の歩き方を続けていきましょう。"];

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

  // トレンデレンブルグ徴候
  const pelvisDropRight = leftHip.y - rightHip.y; // 右立脚時
  const pelvisDropLeft  = rightHip.y - leftHip.y; // 左立脚時
  if (pelvisDropRight > 0.03) {
    typesTHA.push(
      expert
        ? "右立脚時に対側骨盤の下制がみられ、中殿筋機能不全を示唆するトレンデレンブルグ徴候の傾向があります。"
        : "右脚で立っているときに、反対側の骨盤が下がりやすい傾向があります（トレンデレンブルグ徴候）。"
    );
  }
  if (pelvisDropLeft > 0.03) {
    typesTHA.push(
      expert
        ? "左立脚時に対側骨盤の下制がみられ、中殿筋機能不全を示唆するトレンデレンブルグ徴候の傾向があります。"
        : "左脚で立っているときに、反対側の骨盤が下がりやすい傾向があります（トレンデレンブルグ徴候）。"
    );
  }

  // デュシェンヌ歩行（体幹側方傾斜）
  const shoulderTilt = Math.abs(rightShoulder.y - leftShoulder.y);
  const pelvisTilt   = Math.abs(rightHip.y - leftHip.y);
  if (shoulderTilt > pelvisTilt + 0.03) {
    typesTHA.push(
      expert
        ? "立脚側への体幹側方傾斜が骨盤傾斜よりも大きく、デュシェンヌ歩行様の代償がみられます。"
        : "体が左右に大きく傾く歩き方がみられます（デュシェンヌ歩行の傾向）。"
    );
  }

  // 歩隔（足の左右幅）
  const stepWidth = Math.abs(rightAnkle.x - leftAnkle.x);
  if (stepWidth < 0.03)
    typesTHA.push(
      expert
        ? "歩隔がやや狭く、バランス戦略として内側寄りの足位置を選択している可能性があります。"
        : "足と足の間の幅がやや狭い傾向があります。"
    );
  else if (stepWidth > 0.10)
    typesTHA.push(
      expert
        ? "歩隔がやや広く、安定性を高めるために足幅を広げている可能性があります。"
        : "足と足の間の幅がやや広い傾向があります。"
    );

  // 骨盤高さの左右差（脚長差の可能性）
  const pelvisHeightDiff = Math.abs(rightHip.y - leftHip.y);
  if (pelvisHeightDiff > 0.03)
    typesTHA.push(
      expert
        ? "骨盤の高さに左右差がみられ、機能的または構造的な脚長差の存在が疑われます。"
        : "骨盤の高さに左右差がみられ、脚の長さに差がある可能性があります。"
    );

  return typesTHA;
}

/* ---------------------------------------------------------
エクササイズ選択（カテゴリ別）
--------------------------------------------------------- */
function recommendExercises(pelvisR, pelvisL, abdR, abdL, addR, addL, speedPercent) {
  const ids = [];
  if (pelvisR > 10 || pelvisL > 10) ids.push(7, 8, 14);
  if (abdR < 5 || abdL < 5) ids.push(9);
  if (addR > 5 || addL > 5) ids.push(4, 14, 15);
  if (speedPercent < 80) ids.push(10, 11, 16, 17);

  const unique = [...new Set(ids)];
  return unique.map(id => exerciseList.find(e => e.id === id)).filter(Boolean);
}

/* ---------------------------------------------------------
動作解析（左右別解析）
--------------------------------------------------------- */
async function analyzeVideo() {
  if (!loadedVideoURL) {
    document.getElementById("videoError").textContent =
      "動画が選択されていません。撮影するか、動画を選択してください。";
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

  // 左右別の最大値
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

      // 右脚
      const rightHip = lm[24];
      const rightKnee = lm[26];
      const rightAnkle = lm[28];

      // 左脚
      const leftHip = lm[23];
      const leftKnee = lm[25];
      const leftAnkle = lm[27];

      // 骨盤中心
      const pelvisCenter = {
        x: (rightHip.x + leftHip.x) / 2,
        y: (rightHip.y + leftHip.y) / 2
      };

      // 骨盤の傾き（左右）
      const pelvisTiltRight = Math.abs(rightHip.y - pelvisCenter.y);
      const pelvisTiltLeft = Math.abs(leftHip.y - pelvisCenter.y);
      maxPelvisTiltRight = Math.max(maxPelvisTiltRight, pelvisTiltRight);
      maxPelvisTiltLeft = Math.max(maxPelvisTiltLeft, pelvisTiltLeft);

      // 股関節角度（右）
      const hipAngleRight = angleDeg(
        rightKnee.x, rightKnee.y,
        rightHip.x, rightHip.y,
        pelvisCenter.x, pelvisCenter.y
      );

      // 股関節角度（左）
      const hipAngleLeft = angleDeg(
        leftKnee.x, leftKnee.y,
        leftHip.x, leftHip.y,
        pelvisCenter.x, pelvisCenter.y
      );

      // 外転・内転（右）
      if (hipAngleRight >= neutralHipAngle) {
        maxHipAbductionRight = Math.max(maxHipAbductionRight, hipAngleRight - neutralHipAngle);
      } else {
        maxHipAdductionRight = Math.max(maxHipAdductionRight, neutralHipAngle - hipAngleRight);
      }

      // 外転・内転（左）
      if (hipAngleLeft >= neutralHipAngle) {
        maxHipAbductionLeft = Math.max(maxHipAbductionLeft, hipAngleLeft - neutralHipAngle);
      } else {
        maxHipAdductionLeft = Math.max(maxHipAdductionLeft, neutralHipAngle - hipAngleLeft);
      }

      // 歩行速度（相対速度用）
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

    // 数値結果（PT用のみ表示）
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

    if (userMode === "therapist") {
      document.getElementById("resultBox").style.display = "block";
      document.getElementById("pelvisResult").innerHTML =
        `<strong>骨盤の傾き</strong><br>右：${pelvisRdeg.toFixed(1)} 度 / 左：${pelvisLdeg.toFixed(1)} 度`;
      document.getElementById("hipAbductionResult").innerHTML =
        `<strong>足が外側に動いた角度（外転）</strong><br>右：${abdRdeg.toFixed(1)} 度 / 左：${abdLdeg.toFixed(1)} 度`;
      document.getElementById("hipAdductionResult").innerHTML =
        `<strong>足が内側に動いた角度（内転）</strong><br>右：${addRdeg.toFixed(1)} 度 / 左：${addLdeg.toFixed(1)} 度`;
      document.getElementById("speedResult").innerHTML =
        `<strong>歩く速さ（相対速度）</strong><br>${gaitSpeedPercent.toFixed(1)} %`;
    } else {
      // 患者様用：数値は非表示
      document.getElementById("resultBox").style.display = "none";
    }

    // 歩行タイプ診断（一般＋THA特有）
    let types = diagnoseGait(
      pelvisRdeg, pelvisLdeg,
      abdRdeg, abdLdeg,
      addRdeg, addLdeg,
      gaitSpeedPercent
    );
    const thaTypes = diagnoseTHA(lastLandmarks, userMode === "therapist");
    types = types.concat(thaTypes);

    lastAnalysisResult.types = types;

    document.getElementById("typeContent").innerHTML =
      `<ul>${types.map(t => `<li>${t}</li>`).join("")}</ul>`;
    document.getElementById("typeBox").style.display = "block";

    // エクササイズ推薦
    const exercises = recommendExercises(
      pelvisRdeg, pelvisLdeg,
      abdRdeg, abdLdeg,
      addRdeg, addLdeg,
      gaitSpeedPercent
    );
    if (exercises.length > 0) {
      const html = exercises.map(ex => `
        <div style="margin-bottom:12px;">
          <strong>${ex.category}</strong><br>
          ${ex.name}<br>
          <a href="${ex.url}" target="_blank" rel="noopener noreferrer">
            <img src="${getThumbnail(ex.url)}" alt="${ex.name}" style="width:100%;border-radius:8px;margin-top:4px;">
          </a>
        </div>
      `).join("");
      document.getElementById("exerciseContent").innerHTML = html;
      document.getElementById("exerciseBox").style.display = "block";
    } else {
      document.getElementById("exerciseBox").style.display = "none";
    }

    // 履歴保存（PT用のみ活用）
    const label = document.getElementById("surgeryDiffText").textContent || `解析${historyLabels.length + 1}`;
    historyLabels.push(label);
    historyPelvis.push((pelvisRdeg + pelvisLdeg) / 2);
    historyHipAbd.push((abdRdeg + abdLdeg) / 2);
    historyHipAdd.push((addRdeg + addLdeg) / 2);
    historySpeed.push(gaitSpeedPercent);

    const tbody = document.querySelector("#resultTable tbody");
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${label}</td>
      <td>${((pelvisRdeg + pelvisLdeg) / 2).toFixed(1)}</td>
      <td>${((abdRdeg + abdLdeg) / 2).toFixed(1)}</td>
      <td>${((addRdeg + addLdeg) / 2).toFixed(1)}</td>
      <td>${gaitSpeedPercent.toFixed(1)}</td>
    `;
    tbody.appendChild(row);

    if (userMode === "therapist") {
      updateCompareChart();
      saveHistory();
      document.getElementById("resultTable").style.display = "table";
      document.getElementById("compareChart").style.display = "block";
    } else {
      // 患者様用：履歴・グラフは非表示のまま
      document.getElementById("resultTable").style.display = "none";
      document.getElementById("compareChart").style.display = "none";
    }

    document.getElementById("videoStatus").textContent = "解析が完了しました。";
    analyzeBtn.disabled = false;
  }

  processFrame();
}

/* ---------------------------------------------------------
解析ボタン
--------------------------------------------------------- */
document.getElementById("analyzeVideoBtn").addEventListener("click", () => {
  analyzeVideo();
});

/* ---------------------------------------------------------
PDFレポート作成（患者様：簡易版 / PT：詳細版）
--------------------------------------------------------- */
document.getElementById("pdfReportBtn").addEventListener("click", async () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  if (typeof addJapaneseFont === "function") {
    addJapaneseFont(doc);
    doc.setFont("NotoSansJP", "normal");
  }

  doc.setFontSize(16);
  doc.text("歩行解析レポート", 10, 15);

  doc.setFontSize(12);

  if (userMode === "therapist") {
    // 詳細版（PT用）
    doc.text(`骨盤の傾き 右：${lastAnalysisResult.pelvisR.toFixed(1)} 度 / 左：${lastAnalysisResult.pelvisL.toFixed(1)} 度`, 10, 30);
    doc.text(`外転 右：${lastAnalysisResult.abdR.toFixed(1)} 度 / 左：${lastAnalysisResult.abdL.toFixed(1)} 度`, 10, 38);
    doc.text(`内転 右：${lastAnalysisResult.addR.toFixed(1)} 度 / 左：${lastAnalysisResult.addL.toFixed(1)} 度`, 10, 46);
    doc.text(`歩く速さ（相対速度）：${lastAnalysisResult.speedPercent.toFixed(1)} %`, 10, 54);

    doc.text("歩き方の特徴・THA特有の代償：", 10, 70);
  } else {
    // 簡易版（患者様用）
    doc.text("歩き方の特徴：", 10, 30);
  }

  let y = userMode === "therapist" ? 78 : 38;
  lastAnalysisResult.types.forEach((t) => {
    const lines = doc.splitTextToSize(t, 180);
    doc.text(lines, 10, y);
    y += lines.length * 8;
  });

  doc.save("gait-report.pdf");
});

/* ---------------------------------------------------------
初期化
--------------------------------------------------------- */
window.addEventListener("load", () => {
  loadHistory();
});
