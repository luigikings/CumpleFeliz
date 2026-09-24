// ---------- Textos (húngaro por defecto) ----------
const TEXTS = {
  hu: {
    loading: [
      "Születésnap előkészítése...",
      "Lufik felfújása... 🎈",
      "Torta sütése... 🍰",
      "Gyertya keresése... 🕯️",
      "Boldog napot! ✨",
    ],
    button: "Ne nyomd meg!",
    buttonHint: "Komolyan... ne nyomd meg. 👀",
    blowTitle: "Fújd el a gyertyát!",
    blowHint: "🎤 Fújj bele a telefonod mikrofonjába",
    micFallback: "👆 Koppints többször a gyertyára, hogy elfújd!",
    finalTitle: "Boldog születésnapot, Mimi!",
    finalMsg: "Remélem, csodás napod lesz, tele nevetéssel, szeretettel és sok-sok tortával! 🥳",
    finalWish: "Ugye kívántál valamit? ✨",
    replay: "Még egyszer 🔁",
  },
  es: {
    loading: [
      "Preparando cumpleaños...",
      "Inflando globos... 🎈",
      "Horneando la tarta... 🍰",
      "Buscando la vela... 🕯️",
      "¡Feliz día! ✨",
    ],
    button: "¡No lo pulses!",
    buttonHint: "En serio... no lo pulses. 👀",
    blowTitle: "¡Sopla la vela!",
    blowHint: "🎤 Sopla en el micrófono del móvil",
    micFallback: "👆 Toca varias veces la vela para apagarla",
    finalTitle: "¡Feliz cumpleaños, Mimi!",
    finalMsg: "Espero que lo pases increíble, con muchas risas, mucho cariño y mucha tarta. 🥳",
    finalWish: "¿Has pedido un deseo? ✨",
    replay: "Otra vez 🔁",
  },
  en: {
    loading: [
      "Preparing birthday...",
      "Blowing up balloons... 🎈",
      "Baking the cake... 🍰",
      "Finding the candle... 🕯️",
      "Happy day! ✨",
    ],
    button: "Don't press!",
    buttonHint: "Seriously... don't press it. 👀",
    blowTitle: "Blow out the candle!",
    blowHint: "🎤 Blow into your phone's microphone",
    micFallback: "👆 Tap the candle several times to blow it out",
    finalTitle: "Happy birthday, Mimi!",
    finalMsg: "I hope you have an amazing day, full of laughs, love and lots of cake! 🥳",
    finalWish: "Did you make a wish? ✨",
    replay: "Again 🔁",
  },
};

let lang = "hu";
try {
  const saved = localStorage.getItem("lang");
  if (saved && TEXTS[saved]) lang = saved;
} catch (e) {}

const $ = (sel) => document.querySelector(sel);
let micFailed = false;

function applyLang() {
  const t = TEXTS[lang];
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t[el.dataset.i18n];
  });
  if (micFailed) $("#mic-hint").textContent = t.micFallback;
  const loadingEl = $("#loading-text");
  loadingEl.textContent = t.loading[Math.min(loadingStep, t.loading.length - 1)];
  document.querySelectorAll(".lang button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
}

document.querySelectorAll(".lang button").forEach((b) => {
  b.addEventListener("click", () => {
    lang = b.dataset.lang;
    try { localStorage.setItem("lang", lang); } catch (e) {}
    applyLang();
  });
});

function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}

// ---------- 1. Carga ----------
let loadingStep = 0;
applyLang();

const STEP_MS = 1400;
function nextLoadingStep() {
  const msgs = TEXTS[lang].loading;
  loadingStep++;
  $("#bar-fill").style.width = `${(loadingStep / msgs.length) * 100}%`;
  if (loadingStep >= msgs.length) {
    setTimeout(() => show("#screen-button"), 500);
    return;
  }
  const el = $("#loading-text");
  el.classList.add("fade");
  setTimeout(() => {
    // Nodo nuevo en vez de cambiar el texto: Safari (iPhone) dejaba restos
    // del mensaje anterior al repintar durante el fundido
    const fresh = document.createElement("p");
    fresh.id = "loading-text";
    fresh.className = "loading-text enter";
    fresh.textContent = TEXTS[lang].loading[loadingStep];
    el.replaceWith(fresh);
    setTimeout(nextLoadingStep, STEP_MS);
  }, 300);
}
$("#bar-fill").style.width = `${100 / TEXTS[lang].loading.length / 2}%`;
setTimeout(nextLoadingStep, STEP_MS);

// ---------- 2. Botón misterioso ----------
let audioCtx = null;
let micStream = null;

$("#big-button").addEventListener("click", async () => {
  // El audio y el micro solo se pueden activar tras un toque del usuario
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
  } catch (e) {}

  show("#screen-candle");

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    listenForBlow(micStream);
  } catch (e) {
    enableTapFallback();
  }
});

// ---------- 3. Detectar el soplido ----------
const flameHolder = $("#flame-holder");
let blownOut = false;

function listenForBlow(stream) {
  if (!audioCtx) return enableTapFallback();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);

  const NEED_SECONDS = 0.45; // cuánto tiempo hay que soplar
  let progress = 0;
  let baseline = 0;
  let frames = 0;
  let last = performance.now();

  function tick(now) {
    if (blownOut) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    // Volumen (RMS) de lo que entra por el micro, de 0 a 1
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);

    // Los primeros ~0.5s medimos el ruido de fondo
    frames++;
    if (frames < 30) {
      baseline += rms / 30;
      requestAnimationFrame(tick);
      return;
    }
    const threshold = Math.max(0.12, baseline * 4);

    if (rms > threshold) progress += dt;
    else progress = Math.max(0, progress - dt * 0.7);

    // La llama se inclina y encoge mientras soplas
    const push = Math.min(rms / threshold, 2.5);
    const ratio = Math.min(progress / NEED_SECONDS, 1);
    flameHolder.style.setProperty("--lean", `${push * 14}deg`);
    flameHolder.style.setProperty("--size", `${1 - ratio * 0.6}`);
    $("#meter-fill").style.width = `${ratio * 100}%`;

    if (progress >= NEED_SECONDS) blowOut();
    else requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// Sin permiso de micro (o sin micro): hay que tocar la vela varias veces
const TAPS_NEEDED = 5;
function enableTapFallback() {
  micFailed = true;
  $("#mic-hint").textContent = TEXTS[lang].micFallback;
  const wrap = $(".candle-wrap");
  wrap.style.cursor = "pointer";
  let taps = 0;
  wrap.addEventListener("click", function onTap() {
    if (blownOut) return;
    taps++;
    const ratio = taps / TAPS_NEEDED;
    // Cada toque "empuja" la llama y la hace más pequeña
    flameHolder.style.setProperty("--lean", `${20 + Math.random() * 15}deg`);
    flameHolder.style.setProperty("--size", `${1 - ratio * 0.6}`);
    setTimeout(() => flameHolder.style.setProperty("--lean", "0deg"), 180);
    $("#meter-fill").style.width = `${ratio * 100}%`;
    if (navigator.vibrate) navigator.vibrate(20);
    if (taps >= TAPS_NEEDED) {
      wrap.removeEventListener("click", onTap);
      blowOut();
    }
  });
}

// ---------- 4. Se apaga la vela ----------
function blowOut() {
  if (blownOut) return;
  blownOut = true;
  flameHolder.style.setProperty("--lean", "40deg");
  flameHolder.classList.add("out");
  $("#smoke").classList.add("on");
  $("#meter-fill").style.width = "100%";
  if (micStream) micStream.getTracks().forEach((t) => t.stop());
  if (navigator.vibrate) navigator.vibrate(80);

  setTimeout(() => {
    show("#screen-final");
    startConfetti();
    playHappyBirthday();
  }, 1600);
}

$("#replay").addEventListener("click", () => location.reload());

// ---------- Música: "Cumpleaños feliz" ----------
function playHappyBirthday() {
  if (!audioCtx) return;
  const N = { G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784 };
  const song = [
    ["G4", 0.75], ["G4", 0.25], ["A4", 1], ["G4", 1], ["C5", 1], ["B4", 2],
    ["G4", 0.75], ["G4", 0.25], ["A4", 1], ["G4", 1], ["D5", 1], ["C5", 2],
    ["G4", 0.75], ["G4", 0.25], ["G5", 1], ["E5", 1], ["C5", 1], ["B4", 1], ["A4", 2],
    ["F5", 0.75], ["F5", 0.25], ["E5", 1], ["C5", 1], ["D5", 1], ["C5", 2.5],
  ];
  const beat = 0.42;
  let t = audioCtx.currentTime + 0.1;
  for (const [note, len] of song) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = N[note];
    const dur = len * beat;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.95);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
    t += dur;
  }
}

// ---------- Confeti ----------
function startConfetti() {
  const canvas = $("#confetti");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  function resize() {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener("resize", resize);

  const colors = ["#ff6fae", "#ffd36e", "#8fd3ff", "#b388ff", "#7dffb0", "#ffffff"];
  const pieces = [];
  function spawn(n) {
    for (let i = 0; i < n; i++) {
      pieces.push({
        x: Math.random() * innerWidth,
        y: -20 - Math.random() * innerHeight * 0.5,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        vy: 1.5 + Math.random() * 2.5,
        vx: -1 + Math.random() * 2,
        rot: Math.random() * Math.PI,
        vr: -0.1 + Math.random() * 0.2,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }
  spawn(160);
  const until = performance.now() + 6000;

  function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    if (now < until && pieces.length < 260) spawn(3);
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      p.x += p.vx + Math.sin(now / 600 + i) * 0.5;
      p.y += p.vy;
      p.rot += p.vr;
      if (p.y > innerHeight + 20) { pieces.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (pieces.length) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
