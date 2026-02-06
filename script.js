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
  数値の重症度クラス（PT用）
--------------------------------------------------------- */
function getSeverityClass(value, normalMax, mildMax) {
  if (value <= normalMax) return "sev-normal";
  if (value <= mildMax) return "sev-mild";
  return "sev-high";
}

/* ---------------------------------------------------------
  今日の歩き方スコア（患者様用）
--------------------------------------------------------- */
function computeGaitScore(pelvisR, pelvisL, abdR, abdL, addR, addL, speedPercent) {
  let score = 100;

  const pelvisAvg = (Math.abs(pelvisR) + Math.abs(pelvisL)) / 2;
  score -= Math.min(25, pelvisAvg * 1.0);

  const abdAvg = (abdR + abdL) / 2;
  if (abdAvg < 5) score -= 10;

  const addAvg = (addR + addL) / 2;
  if (addAvg > 10) score -= 10;

  if (speedPercent < 80) score -= Math.min(20, (80 - speedPercent) * 0.5);
  if (speedPercent > 120) score -= Math.min(10, (speedPercent - 120) * 0.2);

  score = Math.max(0, Math.min(100, score));
  return Math.round(score);
}

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
  スタート画面：患者様用 / 理学療法士用
--------------------------------------------------------- */
document.getElementById("patientModeBtn").addEventListener("click", () => {
  userMode = "patient";

  document.getElementById("startSection").style.display = "none";
  document.getElementById("modeSwitchWrapper").style.display = "block";

  // 患者様用は「動作解析」から開始
  document.getElementById("videoSection").classList.add("active");
  document.getElementById("usageSection").classList.remove("active");
  document.getElementById("liveSection").classList.remove("active");

  document.getElementById("videoModeBtn").classList.add("active");
  document.getElementById("usageModeBtn").classList.remove("active");
  document.getElementById("liveModeBtn").classList.remove("active");

  // 患者様用はグラフ非表示
  document.getElementById("resultTable").style.display = "none";
  document.getElementById("compareChart").style.display = "none";
});

document.getElementById("therapistModeBtn").addEventListener("click", () => {
  userMode = "therapist";

  document.getElementById("startSection").style.display = "none";
  document.getElementById("modeSwitchWrapper").style.display = "block";

  document.getElementById("usageSection").classList.add("active");
  document.getElementById("liveSection").classList.remove("active");
  document.getElementById("videoSection").classList.remove("active");

  document.getElementById("usageModeBtn").classList.add("active");
  document.getElementById("liveModeBtn").classList.remove("active");
  document.getElementById("videoModeBtn").classList.remove("active");

  // PT用はグラフ表示
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
  const pelvisDropRight = leftHip.y - rightHip.y;
  const pelvisDropLeft  = rightHip.y - leftHip.y;

  if (pelvisDropRight > 0.03) {
    typesTHA.push(
      expert
        ? "右立脚時に対側骨盤の下制がみられ、中殿筋機能不全を示唆するトレンデレンブルグ徴候の傾向があります。"
        : "右脚で立っているときに、反対側の骨盤が下がりやすい傾向があります。"
    );
  }
  if (pelvisDropLeft > 0.03) {
    typesTHA.push(
      expert
        ? "左立脚時に対側骨盤の下制がみられ、中殿筋機能不全を示唆するトレンデレンブルグ徴候の傾向があります。"
        : "左脚で立っているときに、反対側の骨盤が下がりやすい傾向があります。"
    );
  }

  // デュシェンヌ歩行
  const shoulderTilt = Math.abs(rightShoulder.y - leftShoulder.y);
  const pelvisTilt   = Math.abs(rightHip.y - leftHip.y);
  if (shoulderTilt > pelvisTilt + 0.03) {
    typesTHA.push(
      expert
        ? "立脚側への体幹側方傾斜が骨盤傾斜よりも大きく、デュシェンヌ歩行様の代償がみられます。"
        : "体が左右に大きく傾く歩き方がみられます。"
    );
  }

  // 歩隔
  const stepWidth = Math.abs(rightAnkle.x - leftAnkle.x);
  if (stepWidth < 0.03)
    typesTHA.push(expert ? "歩隔がやや狭い傾向があります。" : "足と足の間の幅がやや狭い傾向があります。");
  else if (stepWidth > 0.10)
    typesTHA.push(expert ? "歩隔がやや広い傾向があります。" : "足と足の間の幅がやや広い傾向があります。");

  // 骨盤高さ差
  const pelvisHeightDiff = Math.abs(rightHip.y - leftHip.y);
  if (pelvisHeightDiff > 0.03)
    typesTHA.push(
      expert
        ? "骨盤の高さに左右差がみられ、脚長差の可能性があります。"
        : "骨盤の高さに左右差がみられます。"
    );

  return typesTHA;
}

/* ---------------------------------------------------------
  エクササイズ推薦
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
  動作解析（メイン処理）
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

    /* -------------------------------
       患者様用 / PT用の分岐
    -------------------------------- */
    if (userMode === "therapist") {
      document.getElementById("resultBox").style.display = "block";

      const pelvisRClass = getSeverityClass(pelvisRdeg, 5, 10);
      const pelvisLClass = getSeverityClass(pelvisLdeg, 5, 10);
      const abdRClass    = getSeverityClass(abdRdeg, 5, 10);
      const abdLClass    = getSeverityClass(abdLdeg, 5, 10);
      const addRClass    = getSeverityClass(addRdeg, 5, 10);
      const addLClass    = getSeverityClass(addLdeg, 5, 10);

      document.getElementById("pelvisResult").innerHTML =
        `<strong>骨盤の傾き</strong><br>
         右：<span class="${pelvisRClass}">${pelvisRdeg.toFixed(1)} 度</span> /
         左：<span class="${pelvisLClass}">${pelvisLdeg.toFixed(1)} 度</span>`;

      document.getElementById("hipAbductionResult").innerHTML =
        `<strong>外転</strong><br>
         右：<span class="${abdRClass}">${abdRdeg.toFixed(1)} 度</span> /
         左：<span class="${abdLClass}">${abdLdeg.toFixed(1)} 度</span>`;

      document.getElementById("hipAdductionResult").innerHTML =
        `<strong>内転</strong><br>
         右：<span class="${addRClass}">${addRdeg.toFixed(1)} 度</span> /
         左：<span class="${addLClass}">${addLdeg.toFixed(1)} 度</span>`;

      document.getElementById("speedResult").innerHTML =
        `<strong>歩く速さ</strong><br>${gaitSpeedPercent.toFixed(1)} %`;

      document.getElementById("typeBoxTitle").textContent = "② 歩き方の特徴（専門的）";
      document.getElementById("exerciseBoxTitle").textContent = "③ おすすめのセルフエクササイズ";
      document.getElementById("historyTitle").textContent = "④ 回復の変化を比べる";

      document.getElementById("patientScoreArea").style.display = "none";

    } else {
      document.getElementById("resultBox").style.display = "none";

      document.getElementById("typeBoxTitle").textContent = "① あなたの歩行の特徴";
      document.getElementById("exerciseBoxTitle").textContent = "② あなたにおすすめのセルフエクササイズ";
      document.getElementById("historyTitle").textContent = "③ 回復の変化を比べる";

      const score = computeGaitScore(
        pelvisRdeg, pelvisLdeg,
        abdRdeg, abdLdeg,
        addRdeg, addLdeg,
        gaitSpeedPercent
      );
      document.getElementById("gaitScoreText").textContent = score;
      document.getElementById("patientScoreArea").style.display = "block";
    }

    /* -------------------------------
       歩行タイプ診断（一般＋THA）
    -------------------------------- */
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

    /* -------------------------------
       エクササイズ推薦
    -------------------------------- */
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
            <img src="${getThumbnail(ex.url)}" style="width:100%;border-radius:8px;margin-top:4px;">
          </a>
        </div>
      `).join("");
      document.getElementById("exerciseContent").innerHTML = html;
      document.getElementById("exerciseBox").style.display = "block";
    } else {
      document.getElementById("exerciseBox").style.display = "none";
    }

    /* -------------------------------
       履歴保存（患者様も表は表示）
    -------------------------------- */
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
      // 患者様用：表は表示、グラフは非表示
      document.getElementById("resultTable").style.display = "table";
      document.getElementById("compareChart").style.display = "none";
    }

    document.getElementById("videoStatus").textContent = "解析が完了しました。";
    analyzeBtn.disabled = false;
  }

  processFrame();
}

/* ---------------------------------------------------------
  グラフ更新（PT用）
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
  PDFレポート作成（患者様：簡易版 / PT：詳細版＋グラフ）
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
  let y = 30;

  if (userMode === "therapist") {
    // PT用：詳細数値
    doc.text(`骨盤の傾き 右：${lastAnalysisResult.pelvisR.toFixed(1)} 度 / 左：${lastAnalysisResult.pelvisL.toFixed(1)} 度`, 10, y); y += 8;
    doc.text(`外転 右：${lastAnalysisResult.abdR.toFixed(1)} 度 / 左：${lastAnalysisResult.abdL.toFixed(1)} 度`, 10, y); y += 8;
    doc.text(`内転 右：${lastAnalysisResult.addR.toFixed(1)} 度 / 左：${lastAnalysisResult.addL.toFixed(1)} 度`, 10, y); y += 8;
    doc.text(`歩行速度：${lastAnalysisResult.speedPercent.toFixed(1)} %`, 10, y); y += 12;

    doc.text("歩き方の特徴（専門的）：", 10, y); y += 8;
  } else {
    // 患者様用：簡易版
    doc.text("歩き方の特徴：", 10, y); y += 8;
  }

  // 特徴（一般＋THA）
  lastAnalysisResult.types.forEach((t) => {
    const lines = doc.splitTextToSize(t, 180);
    doc.text(lines, 10, y);
    y += lines.length * 7;
  });

  // PT用：グラフをPDFに追加
  if (userMode === "therapist") {
    const chartCanvas = document.getElementById("compareChart");
    if (chartCanvas) {
      const imgData = chartCanvas.toDataURL("image/png");
      y += 10;
      if (y > 200) {
        doc.addPage();
        y = 20;
      }
      doc.text("回復の変化（グラフ）", 10, y); y += 6;
      doc.addImage(imgData, "PNG", 10, y, 180, 80);
    }
  }

  doc.save("gait-report.pdf");
});

/* ---------------------------------------------------------
  初期化
--------------------------------------------------------- */
window.addEventListener("load", () => {
  loadHistory();
});
