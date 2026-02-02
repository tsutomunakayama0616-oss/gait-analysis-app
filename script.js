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

  // 前回のエラーを消す
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

    // REC表示
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

  // REC非表示
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
  エクササイズ選択（カテゴリ別）
--------------------------------------------------------- */
function recommendExercises(pelvisR, pelvisL, abdR, abdL, addR, addL, speedPercent) {
  const ids = [];

  if (pelvisR > 10 || pelvisL > 10) ids.push(7, 8, 14);
  if (abdR < 5 || abdL < 5) ids.push(12, 13, 9);
  if (addR > 5 || addL > 5) ids.push(4, 14, 15, 13);
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
      const pelvisTiltLeft  = Math.abs(leftHip.y - pelvisCenter.y);

      maxPelvisTiltRight = Math.max(maxPelvisTiltRight, pelvisTiltRight);
      maxPelvisTiltLeft  = Math.max(maxPelvisTiltLeft, pelvisTiltLeft);

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

    // 結果表示（左右別）
    document.getElementById("pelvisResult").innerHTML = `
      <strong>骨盤の傾き</strong><br>
      右：${maxPelvisTiltRight.toFixed(1)}°<br>
      左：${maxPelvisTiltLeft.toFixed(1)}°
    `;

    document.getElementById("hipAbductionResult").innerHTML = `
      <strong>外転角度（最大）</strong><br>
      右：${maxHipAbductionRight.toFixed(1)}°<br>
      左：${maxHipAbductionLeft.toFixed(1)}°
    `;

    document.getElementById("hipAdductionResult").innerHTML = `
      <strong>内転角度（最大）</strong><br>
      右：${maxHipAdductionRight.toFixed(1)}°<br>
      左：${maxHipAdductionLeft.toFixed(1)}°
    `;

    document.getElementById("speedResult").textContent =
      `歩く速さ（相対速度）：${gaitSpeedPercent.toFixed(1)} %`;

    // 左右バランス
    const balanceRight = 100 - maxPelvisTiltRight;
    const balanceLeft  = 100 - maxPelvisTiltLeft;

    document.getElementById("symmetryResult").innerHTML = `
      <strong>左右のバランス</strong><br>
      右：${balanceRight.toFixed(1)}<br>
      左：${balanceLeft.toFixed(1)}
    `;

    document.getElementById("resultBox").style.display = "block";
    document.getElementById("videoStatus").textContent = "解析が完了しました。";

    // 履歴保存（左右の平均値を記録）
    const conditionLabel =
      document.getElementById("surgeryDiffText").textContent || "条件未設定";

    historyLabels.push(conditionLabel);
    historyPelvis.push(Number(((maxPelvisTiltRight + maxPelvisTiltLeft) / 2).toFixed(1)));
    historyHipAbd.push(Number(((maxHipAbductionRight + maxHipAbductionLeft) / 2).toFixed(1)));
    historyHipAdd.push(Number(((maxHipAdductionRight + maxHipAdductionLeft) / 2).toFixed(1)));
    historySpeed.push(Number(gaitSpeedPercent.toFixed(1)));

    updateCompareChart();
    saveHistory();

    // 歩行タイプ診断
    const types = diagnoseGait(
      maxPelvisTiltRight, maxPelvisTiltLeft,
      maxHipAbductionRight, maxHipAbductionLeft,
      maxHipAdductionRight, maxHipAdductionLeft,
      gaitSpeedPercent
    );

    document.getElementById("typeContent").innerHTML =
      `<ul>${types.map(t => `<li>${t}</li>`).join("")}</ul>`;
    document.getElementById("typeBox").style.display = "block";

    // おすすめエクササイズ（カテゴリ別）
    const recs = recommendExercises(
      maxPelvisTiltRight, maxPelvisTiltLeft,
      maxHipAbductionRight, maxHipAbductionLeft,
      maxHipAdductionRight, maxHipAdductionLeft,
      gaitSpeedPercent
    );

    const exerciseContent = document.getElementById("exerciseContent");

    if (recs.length === 0) {
      exerciseContent.innerHTML =
        "<p>大きな問題は見られませんでした。今の歩き方を続けていきましょう。</p>";
    } else {
      const grouped = {};
      recs.forEach(r => {
        if (!grouped[r.category]) grouped[r.category] = [];
        grouped[r.category].push(r);
      });

      exerciseContent.innerHTML = Object.keys(grouped)
        .map(cat => `
          <h4 style="margin-top:16px; font-weight:700;">${cat}</h4>
          ${grouped[cat]
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
            .join("")}
        `)
        .join("");
    }

    document.getElementById("exerciseBox").style.display = "block";

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