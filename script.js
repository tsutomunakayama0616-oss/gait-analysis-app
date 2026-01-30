// =========================
// モード切替
// =========================
const liveModeBtn = document.getElementById("liveModeBtn");
const videoModeBtn = document.getElementById("videoModeBtn");
const liveSection = document.getElementById("liveSection");
const videoSection = document.getElementById("videoSection");

liveModeBtn.onclick = () => {
  liveModeBtn.classList.add("active");
  videoModeBtn.classList.remove("active");
  liveSection.classList.add("active");
  videoSection.classList.remove("active");
};

videoModeBtn.onclick = () => {
  videoModeBtn.classList.add("active");
  liveModeBtn.classList.remove("active");
  videoSection.classList.add("active");
  liveSection.classList.remove("active");
};


// =========================
// 撮影補助モード（リアルタイム）
// =========================
const liveVideo = document.getElementById("liveVideo");
const liveCanvas = document.getElementById("liveCanvas");
const liveCtx = liveCanvas.getContext("2d");
const startLiveBtn = document.getElementById("startLiveBtn");
const stopLiveBtn = document.getElementById("stopLiveBtn");
const liveStatus = document.getElementById("liveStatus");
const liveError = document.getElementById("liveError");

const prechecks = document.querySelectorAll(".precheck");

let liveStream = null;
let poseLandmarker = null;
let liveRunning = false;

// MediaPipe を window から取得
const PoseLandmarker = window.PoseLandmarker;
const FilesetResolver = window.FilesetResolver;
const DrawingUtils = window.DrawingUtils;

let drawingUtils = null;

// チェックリストで撮影開始ボタン制御
function updateLiveReady() {
  const allChecked = Array.from(prechecks).every(c => c.checked);
  startLiveBtn.disabled = !allChecked;
}
prechecks.forEach(c => c.addEventListener("change", updateLiveReady));

// モデル読み込み（リアルタイム用）
async function initPoseLandmarker() {
  liveStatus.textContent = "モデル読み込み中…";

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });

  drawingUtils = new DrawingUtils(liveCtx);
  liveStatus.textContent = "準備完了。撮影開始できます。";
}

// カメラ開始
async function startLiveCamera() {
  if (!poseLandmarker) await initPoseLandmarker();

  try {
    liveStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: 640, height: 480 },
      audio: false
    });

    liveVideo.srcObject = liveStream;
    await liveVideo.play();

    liveCanvas.width = liveVideo.videoWidth;
    liveCanvas.height = liveVideo.videoHeight;

    liveRunning = true;
    liveStatus.textContent = "リアルタイム解析中…";

    requestAnimationFrame(liveLoop);
  } catch (err) {
    liveError.textContent = "カメラにアクセスできません。権限を確認してください。";
  }
}

// カメラ停止
function stopLiveCamera() {
  liveRunning = false;
  if (liveStream) liveStream.getTracks().forEach(t => t.stop());
  liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  liveStatus.textContent = "カメラ停止中";
}

// リアルタイムループ
async function liveLoop() {
  if (!liveRunning) return;

  const now = performance.now();

  liveCtx.drawImage(liveVideo, 0, 0, liveCanvas.width, liveCanvas.height);

  const result = await poseLandmarker.detectForVideo(liveVideo, now);

  if (result.landmarks.length > 0) {
    const lm = result.landmarks[0];
    drawingUtils.drawLandmarks(lm, { radius: 3, color: "#00ff88" });
    drawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
      color: "#00e0ff",
      lineWidth: 2
    });
  }

  requestAnimationFrame(liveLoop);
}

startLiveBtn.onclick = startLiveCamera;
stopLiveBtn.onclick = stopLiveCamera;


// =========================
// 動画解析モード
// =========================
const videoFileInput = document.getElementById("videoFileInput");
const analyzeVideoBtn = document.getElementById("analyzeVideoBtn");
const analysisVideo = document.getElementById("analysisVideo");
const analysisCanvas = document.getElementById("analysisCanvas");
const analysisCtx = analysisCanvas.getContext("2d");
const videoStatus = document.getElementById("videoStatus");
const videoError = document.getElementById("videoError");

const resultBox = document.getElementById("resultBox");
const pelvisResult = document.getElementById("pelvisResult");
const hipResult = document.getElementById("hipResult");
const speedResult = document.getElementById("speedResult");

const surgeryStatus = document.getElementById("surgeryStatus");
const postOpDays = document.getElementById("postOpDays");

const gaitStatusBadge = document.getElementById("gaitStatusBadge");
const gaitFeatureText = document.getElementById("gaitFeatureText");
const exerciseList = document.getElementById("exerciseList");

let analysisPose = null;
let analysisDrawingUtils = null;

// 解析履歴とグラフ
let analysisHistory = [];
let chart = null;

// 歩行速度用
let frameCount = 0;
let fps = 30; // 仮の値（必要なら動画から取得）

// モデル読み込み（動画解析用）
async function initAnalysisPose() {
  videoStatus.textContent = "モデル読み込み中…";

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  analysisPose = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1
  });

  videoStatus.textContent = "モデル準備完了。";
}

// 骨盤傾斜（数値）
function calcPelvisTiltValue(lm) {
  const L = lm[23];
  const R = lm[24];
  const dy = (L.y - R.y);
  const angle = (Math.atan2(dy, 1) * 180 / Math.PI);
  return angle; // 正：左高い、負：右高い
}

// 骨盤傾斜（表示用フレーズ）
function pelvisTiltPhrase(angle) {
  const a = Math.abs(angle).toFixed(1);
  if (angle > 1) return `左へ ${a}° 傾斜（後方から撮影して）`;
  else if (angle < -1) return `右へ ${a}° 傾斜（後方から撮影して）`;
  else return `傾斜なし（後方から撮影して）`;
}

// 股関節外転・内転角度（ここでは左側）
function calcHipAbduction(lm, side = "left") {
  const hip = side === "left" ? lm[23] : lm[24];
  const knee = side === "left" ? lm[25] : lm[26];
  const ankle = side === "left" ? lm[27] : lm[28];

  const v1 = { x: knee.x - hip.x, y: knee.y - hip.y };
  const v2 = { x: ankle.x - knee.x, y: ankle.y - knee.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);

  const angle = Math.acos(dot / (mag1 * mag2)) * 180 / Math.PI;
  return angle;
}

// 歩行速度（m/s）
// ここでは「3m 歩行」を仮定
function calcWalkingSpeed(distanceMeters, frameCount, fps) {
  const timeSec = frameCount / fps;
  if (timeSec === 0) return 0;
  return distanceMeters / timeSec;
}

// 結果表の更新
function updateResultTable() {
  const tbody = document.querySelector("#resultTable tbody");
  tbody.innerHTML = "";

  analysisHistory.forEach(r => {
    const row = `
      <tr>
        <td>${r.condition}</td>
        <td class="mono">${r.pelvisValue.toFixed(1)}</td>
        <td class="mono">${r.hipAngle.toFixed(1)}</td>
        <td class="mono">${r.speed.toFixed(2)}</td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}

// グラフ更新（WHOOP / Fitbit っぽくシンプル＆色分け）
function updateChart() {
  const ctx = document.getElementById("compareChart");

  const labels = analysisHistory.map(r => r.condition);
  const pelvisVals = analysisHistory.map(r => parseFloat(r.pelvisValue.toFixed(1)));
  const hipVals = analysisHistory.map(r => parseFloat(r.hipAngle.toFixed(1)));
  const speedVals = analysisHistory.map(r => parseFloat(r.speed.toFixed(2)));

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "骨盤傾斜（°）",
          data: pelvisVals,
          borderColor: "#ff6ec7",
          backgroundColor: "rgba(255,110,199,0.12)",
          tension: 0.35,
          pointRadius: 4,
          yAxisID: "y1"
        },
        {
          label: "股関節外転/内転角度（°）",
          data: hipVals,
          borderColor: "#00c3ff",
          backgroundColor: "rgba(0,195,255,0.12)",
          tension: 0.35,
          pointRadius: 4,
          yAxisID: "y1"
        },
        {
          label: "歩行速度（m/秒）",
          data: speedVals,
          borderColor: "#00cc88",
          backgroundColor: "rgba(0,204,136,0.18)",
          type: "bar",
          borderWidth: 1,
          yAxisID: "y2"
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y1: {
          position: "left",
          title: { display: true, text: "角度（°）" },
          grid: { drawOnChartArea: true }
        },
        y2: {
          position: "right",
          title: { display: true, text: "速度（m/秒）" },
          grid: { drawOnChartArea: false }
        }
      },
      plugins: {
        legend: {
          position: "bottom"
        }
      }
    }
  });
}

// AI風 歩容特徴・ステータス判定
function evaluateGait(pelvisValue, hipAngle, speed) {
  // シンプルな閾値ベース
  const tiltAbs = Math.abs(pelvisValue);
  const hip = hipAngle;
  const v = speed;

  let status = "green";
  let message = "前回より安定して歩けています。";
  let feature = "左右差：ほぼなし　歩行安定性：良好　リズム：安定しています。";
  let exercises = [];

  // ベースの運動提案
  exercises.push("・もも前のストレッチ（左右各20〜30秒）");
  exercises.push("・片脚立ちバランス（10秒 × 2〜3回）");

  if (tiltAbs > 5 || hip < 150 || v < 0.7) {
    status = "yellow";
    message = "回復は続いています。今日は少し慎重に。";
    feature = "左右差：ややあり　歩行安定性：注意　リズム：少しバラつきがあります。";
    exercises.push("・ゆっくりしたペースでの5分間ウォーキング");
    exercises.push("・椅子からの立ち上がり練習（5回 × 2セット）");
  }

  if (tiltAbs > 10 || v < 0.5) {
    status = "red";
    message = "無理せず、次回の受診で相談しましょう。";
    feature = "左右差：明らかにあり　歩行安定性：不安定　転倒に注意が必要です。";
    exercises = [
      "・痛みや不安が強い場合は、まずは休息を優先してください。",
      "・必要に応じて杖や手すりを使用しましょう。"
    ];
  }

  return { status, message, feature, exercises };
}

// ステータスバッジの更新
function updateGaitStatusUI(evaluation) {
  gaitStatusBadge.style.display = "inline-flex";
  gaitStatusBadge.classList.remove("gait-status-green", "gait-status-yellow", "gait-status-red");

  if (evaluation.status === "green") {
    gaitStatusBadge.classList.add("gait-status-green");
    gaitStatusBadge.textContent = "🟢 前回より安定して歩けています";
  } else if (evaluation.status === "yellow") {
    gaitStatusBadge.classList.add("gait-status-yellow");
    gaitStatusBadge.textContent = "🟡 回復は続いています。今日は少し慎重に";
  } else {
    gaitStatusBadge.classList.add("gait-status-red");
    gaitStatusBadge.textContent = "🔴 無理せず、次回の受診で相談しましょう";
  }

  gaitFeatureText.textContent = evaluation.feature;

  exerciseList.innerHTML = "";
  evaluation.exercises.forEach(ex => {
    const li = document.createElement("li");
    li.textContent = ex;
    exerciseList.appendChild(li);
  });
}

// 動画解析開始
let currentCondition = "";
let maxPelvisValue = 0;
let maxHipAngle = 0;
let maxSpeed = 0;

analyzeVideoBtn.onclick = async () => {
  const file = videoFileInput.files[0];
  videoError.textContent = "";
  if (!file) {
    videoError.textContent = "動画を選択してください。";
    return;
  }

  if (!analysisPose) await initAnalysisPose();

  // 条件ラベル
  if (surgeryStatus.value === "術前") {
    currentCondition = "術前";
  } else {
    const d = postOpDays.value ? `${postOpDays.value}日` : "日数未入力";
    currentCondition = `術後${d}`;
  }

  const url = URL.createObjectURL(file);
  analysisVideo.src = url;

  analysisVideo.onloadedmetadata = () => {
    analysisCanvas.width = analysisVideo.videoWidth;
    analysisCanvas.height = analysisVideo.videoHeight;

    analysisDrawingUtils = new DrawingUtils(analysisCtx);

    frameCount = 0;
    maxPelvisValue = 0;
    maxHipAngle = 0;
    maxSpeed = 0;

    analysisVideo.play();
    videoStatus.textContent = "解析中…";
    requestAnimationFrame(videoLoop);
  };

  analysisVideo.onended = () => {
    videoStatus.textContent = "解析完了";

    // 最大値で記録
    analysisHistory.push({
      condition: currentCondition,
      pelvisValue: maxPelvisValue,
      hipAngle: maxHipAngle,
      speed: maxSpeed
    });

    updateResultTable();
    updateChart();

    // AI風評価とセルフエクササイズ提案
    const evalResult = evaluateGait(maxPelvisValue, maxHipAngle, maxSpeed);
    updateGaitStatusUI(evalResult);
  };
};

// 動画解析ループ（最大値を更新）
async function videoLoop() {
  if (analysisVideo.paused || analysisVideo.ended) {
    return;
  }

  const now = performance.now();
  frameCount++;

  analysisCtx.drawImage(
    analysisVideo,
    0,
    0,
    analysisCanvas.width,
    analysisCanvas.height
  );

  const result = await analysisPose.detectForVideo(analysisVideo, now);

  if (result.landmarks.length > 0) {
    const lm = result.landmarks[0];

    analysisDrawingUtils.drawLandmarks(lm, { radius: 3, color: "#ff6ec7" });
    analysisDrawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, {
      color: "#ffd54f",
      lineWidth: 2
    });

    // ① 骨盤傾斜
    const pelvisVal = calcPelvisTiltValue(lm);
    const pelvisText = pelvisTiltPhrase(pelvisVal);

    // ② 股関節外転・内転角度（左）
    const hipAngleVal = calcHipAbduction(lm, "left");

    // ③ 歩行速度（3m 歩行を仮定）
    const speedVal = calcWalkingSpeed(3, frameCount, fps);

    // 最大値更新
    if (Math.abs(pelvisVal) > Math.abs(maxPelvisValue)) maxPelvisValue = pelvisVal;
    if (hipAngleVal > maxHipAngle) maxHipAngle = hipAngleVal;
    if (speedVal > maxSpeed) maxSpeed = speedVal;

    // 画面表示（常に「現時点の最大値」を表示）
    pelvisResult.textContent = `① 骨盤傾斜：${pelvisTiltPhrase(maxPelvisValue)}`;
    hipResult.textContent = `② 股関節外転・内転角度：${maxHipAngle.toFixed(1)}°`;
    speedResult.textContent = `③ 歩行速度：${maxSpeed.toFixed(2)} m/秒`;
    resultBox.style.display = "block";
  }

  requestAnimationFrame(videoLoop);
}