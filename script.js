/* ---------------------------------------------------------
   手術日 → 手術前◯日 / 手術後◯日 を自動表示
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
   モード切替（撮影補助 ↔ 動画解析）
--------------------------------------------------------- */
document.getElementById("liveModeBtn").addEventListener("click", () => {
  document.getElementById("liveSection").classList.add("active");
  document.getElementById("videoSection").classList.remove("active");

  document.getElementById("liveModeBtn").classList.add("active");
  document.getElementById("videoModeBtn").classList.remove("active");
});

document.getElementById("videoModeBtn").addEventListener("click", () => {
  document.getElementById("videoSection").classList.add("active");
  document.getElementById("liveSection").classList.remove("active");

  document.getElementById("videoModeBtn").classList.add("active");
  document.getElementById("liveModeBtn").classList.remove("active");
});

/* ---------------------------------------------------------
   撮影補助モード：チェックリストが全てONで撮影開始ボタンを有効化
--------------------------------------------------------- */
const prechecks = document.querySelectorAll(".precheck");
prechecks.forEach((chk) => {
  chk.addEventListener("change", () => {
    const allChecked = [...prechecks].every((c) => c.checked);
    document.getElementById("startLiveBtn").disabled = !allChecked;
  });
});

/* ---------------------------------------------------------
   撮影補助モード：カメラ起動
--------------------------------------------------------- */
let liveStream;

document.getElementById("startLiveBtn").addEventListener("click", async () => {
  try {
    liveStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });

    const video = document.getElementById("liveVideo");
    video.srcObject = liveStream;
    video.play();

    document.getElementById("liveStatus").textContent = "カメラ起動中…";
  } catch (err) {
    document.getElementById("liveError").textContent =
      "カメラを起動できませんでした。権限を確認してください。";
  }
});

/* ---------------------------------------------------------
   撮影補助モード：カメラ停止
--------------------------------------------------------- */
document.getElementById("stopLiveBtn").addEventListener("click", () => {
  if (liveStream) {
    liveStream.getTracks().forEach((t) => t.stop());
  }
  document.getElementById("liveStatus").textContent = "カメラ停止";
});

/* ---------------------------------------------------------
   動画解析モード：動画読み込み
--------------------------------------------------------- */
let loadedVideoURL = null;

document.getElementById("videoFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  loadedVideoURL = URL.createObjectURL(file);
  const video = document.getElementById("analysisVideo");
  video.src = loadedVideoURL;
});

/* ---------------------------------------------------------
   動画解析（仮ロジック）
   ※ MediaPipe PoseLandmarker を組み込む場合はここに実装
--------------------------------------------------------- */
function analyzeVideo() {
  if (!loadedVideoURL) {
    document.getElementById("videoError").textContent =
      "動画が選択されていません。";
    return;
  }

  // -------------------------
  // 仮の解析結果（実際は MediaPipe で計算）
  // -------------------------
  const pelvisTilt = 8.2;        // 骨盤傾斜
  const hipAbduction = 14.5;     // 股関節外転
  const hipAdduction = 6.3;      // 股関節内転
  const gaitSpeed = 0.92;        // 歩行速度

  // -------------------------
  // 結果表示
  -------------------------
  document.getElementById("pelvisResult").textContent =
    `骨盤傾斜：${pelvisTilt.toFixed(1)}°`;

  document.getElementById("hipAbductionResult").textContent =
    `股関節外転角度：${hipAbduction.toFixed(1)}°`;

  document.getElementById("hipAdductionResult").textContent =
    `股関節内転角度：${hipAdduction.toFixed(1)}°`;

  document.getElementById("speedResult").textContent =
    `歩行速度：${gaitSpeed.toFixed(2)} m/秒`;

  document.getElementById("resultBox").style.display = "block";

  // -------------------------
  // テーブルに記録
  // -------------------------
  const tbody = document.querySelector("#resultTable tbody");
  const row = document.createElement("tr");

  const conditionLabel =
    document.getElementById("surgeryDiffText").textContent || "未設定";

  row.innerHTML = `
    <td>${conditionLabel}</td>
    <td>${pelvisTilt.toFixed(1)}</td>
    <td>${hipAbduction.toFixed(1)}</td>
    <td>${hipAdduction.toFixed(1)}</td>
    <td>${gaitSpeed.toFixed(2)}</td>
  `;

  tbody.appendChild(row);
}

/* ---------------------------------------------------------
   解析ボタン
--------------------------------------------------------- */
document.getElementById("analyzeVideoBtn").addEventListener("click", analyzeVideo);