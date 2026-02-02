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

/* ---------------------------------------------------------
  セルフエクササイズ一覧（18種類）
--------------------------------------------------------- */
const exerciseList = [
  { id:1, name:"ハムストリングス（大腿部後面）のストレッチ", url:"https://youtu.be/ihchQBuigY0" },
  { id:2, name:"大腿四頭筋（大腿部前面）のストレッチ", url:"https://youtu.be/lVpF9TiepLg" },
  { id:3, name:"腸腰筋（股関節前面）のストレッチ", url:"https://youtu.be/XIA80pBZ3ws" },
  { id:4, name:"内転筋（大腿部内側）のストレッチ", url:"https://youtu.be/racb4M_hycM" },
  { id:5, name:"下腿三頭筋（ふくらはぎ）のストレッチ", url:"https://youtu.be/Wbi5St1J9Kk" },
  { id:6, name:"足首の上下（ポンプ）運動", url:"https://youtu.be/-inqX6tmDm8" },
  { id:7, name:"大殿筋（お尻）の筋力増強運動（収縮のみ）", url:"https://youtu.be/4ckJ67_8IB8" },
  { id:8, name:"大殿筋（お尻）の筋力増強運動（ブリッジ）", url:"https://youtu.be/9zKZ-YRmU8I" },
  { id:9, name:"大殿筋（お尻）の筋力増強運動（立位）", url:"https://youtu.be/aikGoCaTFFI" },
  { id:10, name:"大腿四頭筋（大腿部前面）の筋力増強運動（セッティング）", url:"https://youtu.be/rweyU-3O3zo" },
  { id:11, name:"大腿四頭筋（大腿部前面）の筋力増強運動（SLR）", url:"https://youtu.be/fNM6w_RnVRk" },
  { id:12, name:"中殿筋（殿部外側）の筋力増強運動（背臥位）", url:"https://youtu.be/UBN5jCP-ErM" },
  { id:13, name:"中殿筋（殿部外側）の筋力増強運動（立位）", url:"https://youtu.be/0gKoLDR8HcI" },
  { id:14, name:"バランス運動（タンデム）", url:"https://youtu.be/F0OVS9LT1w4" },
  { id:15, name:"バランス運動（片脚立位）", url:"https://youtu.be/HUjoGJtiknc" },
  { id:16, name:"ウォーキング", url:"https://youtu.be/Cs4NOzgkS8s" },
  { id:17, name:"自転車エルゴメータ", url:"https://youtu.be/12_J_pr-MUE" },
  { id:18, name:"水中運動", url:"https://youtu.be/xqj3dn9mw50" }
];

/* ---------------------------------------------------------
  YouTube サムネイル生成
--------------------------------------------------------- */
function getThumbnail(url) {
  const id = url.split("youtu.be/")[1];
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/* ---------------------------------------------------------
  履歴の保存・読み込み
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
        <td>${Number(historySpeed[i]).toFixed(3)}</td>
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
  モード切替（撮影補助・動作解析・使用方法）
--------------------------------------------------------- */
document.getElementById("liveModeBtn").addEventListener("click", () => {
  document.getElementById("liveSection").classList.add("active");
  document.getElementById("videoSection").classList.remove("active");
  document.getElementById("usageSection").classList.remove("active");

  document.getElementById("liveModeBtn").classList.add("active");
  document.getElementById("videoModeBtn").classList.remove("active");
  document.getElementById("usageModeBtn").classList.remove("active");
});

document.getElementById("videoModeBtn").addEventListener("click", () => {
  document.getElementById("videoSection").classList.add("active");
  document.getElementById("liveSection").classList.remove("active");
  document.getElementById("usageSection").classList.remove("active");

  document.getElementById("videoModeBtn").classList.add("active");
  document.getElementById("liveModeBtn").classList.remove("active");
  document.getElementById("usageModeBtn").classList.remove("active");
});

document.getElementById("usageModeBtn").addEventListener("click", () => {
  document.getElementById("usageSection").classList.add("active");
  document.getElementById("liveSection").classList.remove("active");
  document.getElementById("videoSection").classList.remove("active");

  document.getElementById("usageModeBtn").classList.add("active");
  document.getElementById("liveModeBtn").classList.remove("active");
  document.getElementById("videoModeBtn").classList.remove("active");
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
  角度計算
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
  撮影補助モード：カメラ起動
--------------------------------------------------------- */
document.getElementById("startLiveBtn").addEventListener("click", async () => {
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

    document.getElementById("liveStatus").textContent = "カメラ起動中…";

    const drawingUtils = new window.DrawingUtils(ctx);

    function liveLoop() {
      if (!poseLandmarker) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const nowInMs = performance.now();
      const result = poseLandmarker.detectForVideo(video, nowInMs);

      if (result && result.landmarks && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0];

        drawingUtils.drawLandmarks(landmarks, {
          radius: 3,
          color: "#ff3b30"
        });

        drawingUtils.drawConnectors(
          landmarks,
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
  カメラ停止
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
  document.getElementById("liveStatus").textContent = "カメラ停止";
});

/* ---------------------------------------------------------
  動画読み込み
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
});

/* ---------------------------------------------------------
  グラフ更新（Chart.js）
--------------------------------------------------------- */
function updateCompareChart() {
  const ctx = document.getElementById("compareChart").getContext("2d");

  if (compareChart) {
    compareChart.destroy();
  }

  compareChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: historyLabels,
      datasets: [
        {
          label: "骨盤傾斜（最大）",
          data: historyPelvis,
          borderColor: "#ff3b30",
          backgroundColor: "rgba(255,59,48,0.1)",
          tension: 0.3
        },
        {
          label: "股関節外転（最大）",
          data: historyHipAbd,
          borderColor: "#007aff",
          backgroundColor: "rgba(0,122,255,0.1)",
          tension: 0.3
        },
        {
          label: "股関節内転（最大）",
          data: historyHipAdd,
          borderColor: "#ffcc00",
          backgroundColor: "rgba(255,204,0,0.1)",
          tension: 0.3
        },
        {
          label: "歩行速度指標（相対値）",
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
        y: {
          title: { display: true, text: "角度（度）" }
        },
        y1: {
          position: "right",
          title: { display: true, text: "速度指標（相対値）" },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

/* ---------------------------------------------------------
  歩行タイプ診断ロジック
--------------------------------------------------------- */
function diagnoseGait(pelvis, abd, add, speedIndex, symmetryScore) {
  const types = [];

  if (pelvis > 10)
    types.push("骨盤の安定性がやや低い傾向があります。");
  if (abd < 5)
    types.push("股関節外転筋（中殿筋）の働きが弱い可能性があります。");
  if (add > 5)
    types.push("股関節内転が強く，立脚時の安定性が低い可能性があります。");
  if (speedIndex < 0.005)
    types.push("歩行速度が低く，推進力が弱い傾向があります。");
  if (symmetryScore < 95)
    types.push("左右差がやや大きい歩行パターンです。");

  if (types.length === 0)
    return ["大きな問題は見られません。現在の歩行を維持していきましょう。"];

  return types;
}

/* ---------------------------------------------------------
  歩行タイプ → おすすめエクササイズ選択
--------------------------------------------------------- */
function recommendExercises(pelvis, abd, add, speedIndex, symmetryScore) {
  const ids = [];

  if (pelvis > 10) ids.push(7, 8, 12, 14);
  if (abd < 5) ids.push(12, 13, 9);
  if (add > 5) ids.push(4, 14, 15, 13);
  if (speedIndex < 0.005) ids.push(10, 11, 16, 17);
  if (symmetryScore < 95) ids.push(14, 15);

  const unique = [...new Set(ids)];
  return unique.map(id => exerciseList.find(e => e.id === id)).filter(Boolean);
}

/* ---------------------------------------------------------
  動作解析
--------------------------------------------------------- */
async function analyzeVideo() {
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

  let maxPelvisTilt = 0;
  let maxHipAbduction = 0;
  let maxHipAdduction = 0;

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

      const pelvisCenter = {
        x: (rightHip.x + leftHip.x) / 2,
        y: (rightHip.y + leftHip.y) / 2
      };

      const pelvisTilt = angleDeg(
        leftHip.x, leftHip.y,
        pelvisCenter.x, pelvisCenter.y,
        rightHip.x, rightHip.y
      );
      if (pelvisTilt > maxPelvisTilt) maxPelvisTilt = pelvisTilt;

      const hipAngle = angleDeg(
        rightKnee.x, rightKnee.y,
        rightHip.x, rightHip.y,
        pelvisCenter.x, pelvisCenter.y
      );

      if (hipAngle >= neutralHipAngle) {
        const abd = hipAngle - neutralHipAngle;
        if (abd > maxHipAbduction) maxHipAbduction = abd;
      } else {
        const add = neutralHipAngle - hipAngle;
        if (add > maxHipAdduction) maxHipAdduction = add;
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

    let gaitSpeedIndex = 0;
    if (
      firstFrameTime !== null &&
      lastFrameTime !== null &&
      lastFrameTime > firstFrameTime &&
      firstFootX !== null &&
      lastFootX !== null
    ) {
      const dx = Math.abs(lastFootX - firstFootX);
      const dt = lastFrameTime - firstFrameTime;
      gaitSpeedIndex = dx / dt;
    }

    const currentStability = 100 - maxPelvisTilt;
    const currentSymmetry = 100 - Math.abs(maxPelvisTilt);

    const stabilityElem = document.getElementById("stabilityResult");
    const symmetryElem = document.getElementById("symmetryResult");
    const threshold = 1.0;

    if (previousStability === null) {
      stabilityElem.textContent =
        "歩行の安定性：今回が初回の測定です。前回との比較はありません。";
    } else {
      const diff = currentStability - previousStability;
      if (diff > threshold)
        stabilityElem.textContent = "歩行の安定性：良くなってきています。";
      else if (Math.abs(diff) <= threshold)
        stabilityElem.textContent = "歩行の安定性：大きな変化はありません。";
      else
        stabilityElem.textContent = "歩行の安定性：やや低下しています。";
    }

    if (previousSymmetry === null) {
      symmetryElem.textContent =
        "左右差：今回が初回の測定です。前回との比較はありません。";
    } else {
      const diff = currentSymmetry - previousSymmetry;
      if (diff > threshold)
        symmetryElem.textContent = "左右差：良くなってきています。";
      else if (Math.abs(diff) <= threshold)
        symmetryElem.textContent = "左右差：大きな変化はありません。";
      else
        symmetryElem.textContent = "左右差：やや悪化しています。";
    }

    previousStability = currentStability;
    previousSymmetry = currentSymmetry;

    document.getElementById("pelvisResult").textContent =
      `骨盤傾斜（最大）：${maxPelvisTilt.toFixed(1)}°`;
    document.getElementById("hipAbductionResult").textContent =
      `股関節外転角度（最大）：${maxHipAbduction.toFixed(1)}°（推定）`;
    document.getElementById("hipAdductionResult").textContent =
      `股関節内転角度（最大）：${maxHipAdduction.toFixed(1)}°（推定）`;
    document.getElementById("speedResult").textContent =
      `歩行速度指標（相対値）：${gaitSpeedIndex.toFixed(3)}`;

    document.getElementById("resultBox").style.display = "block";
    document.getElementById("videoStatus").textContent = "解析完了";

    const tbody = document.querySelector("#resultTable tbody");
    const row = document.createElement("tr");
    const conditionLabel =
      document.getElementById("surgeryDiffText").textContent || "未設定";

    row.innerHTML = `
      <td>${conditionLabel}</td>
      <td>${maxPelvisTilt.toFixed(1)}</td>
      <td>${maxHipAbduction.toFixed(1)}</td>
      <td>${maxHipAdduction.toFixed(1)}</td>
      <td>${gaitSpeedIndex.toFixed(3)}</td>
    `;
    tbody.appendChild(row);

    historyLabels.push(conditionLabel);
    historyPelvis.push(Number(maxPelvisTilt.toFixed(1)));
    historyHipAbd.push(Number(maxHipAbduction.toFixed(1)));
    historyHipAdd.push(Number(maxHipAdduction.toFixed(1)));
    historySpeed.push(Number(gaitSpeedIndex.toFixed(3)));

    updateCompareChart();
    saveHistory();

    /* ---------------------------------------------------------
      ② 歩行タイプ診断
    --------------------------------------------------------- */
    const typeBox = document.getElementById("typeBox");
    const typeContent = document.getElementById("typeContent");
    const symmetryScore = currentSymmetry;

    const types = diagnoseGait(
      maxPelvisTilt,
      maxHipAbduction,
      maxHipAdduction,
      gaitSpeedIndex,
      symmetryScore
    );

    typeContent.innerHTML = `<ul>${types
      .map(t => `<li>${t}</li>`)
      .join("")}</ul>`;
    typeBox.style.display = "block";

    /* ---------------------------------------------------------
      ③ おすすめセルフエクササイズ（サムネイル付き）
    --------------------------------------------------------- */
    const exerciseBox = document.getElementById("exerciseBox");
    const exerciseContent = document.getElementById("exerciseContent");

    const recs = recommendExercises(
      maxPelvisTilt,
      maxHipAbduction,
      maxHipAdduction,
      gaitSpeedIndex,
      symmetryScore
    );

    if (recs.length === 0) {
      exerciseContent.innerHTML =
        "<p>特に大きな問題は見られませんでした。今の歩行を維持していきましょう。</p>";
    } else {
      exerciseContent.innerHTML = recs
        .map(
          r => `
          <div style="margin-bottom:16px; display:flex; gap:12px; align-items:center;">
            <img src="${getThumbnail(r.url)}"
                 style="width:120px; height:90px; border-radius:8px; object-fit:cover;">
            <div>
              <div>${r.name}</div>
              <a class="exercise-link" href="${r.url}" target="_blank" rel="noopener noreferrer">
                動画を見る（YouTube）
              </a>
            </div>
          </div>
        `
        )
        .join("");
    }

    exerciseBox.style.display = "block";

    video.controls = true;
    analyzeBtn.disabled = false;
  }

  processFrame();
}

/* ---------------------------------------------------------
  解析ボタン
--------------------------------------------------------- */
document
  .getElementById("analyzeVideoBtn")
  .addEventListener("click", analyzeVideo);

/* ---------------------------------------------------------
  初期化：履歴読み込み
--------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  loadHistory();
});
