const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  balance: document.getElementById("balance"),
  betInput: document.getElementById("betInput"),
  height: document.getElementById("height"),
  startBtn: document.getElementById("startBtn"),
  cashoutBtn: document.getElementById("cashoutBtn"),
  message: document.getElementById("message"),
};

const app = document.querySelector(".app");
const scaleRoot = document.querySelector(".scale-root");
const sfx = {
  pop: document.getElementById("sfxPop"),
  crack: document.getElementById("sfxCrack"),
};
if (sfx.pop) sfx.pop.volume = 0.45;
if (sfx.crack) sfx.crack.volume = 0.6;

const W = canvas.width;
const H = canvas.height;

const GRAVITY = 0.35;
const JUMP_VELOCITY = -10;
const MOVE_SPEED = 3.5;
const PLAYER_W = 30;
const PLAYER_H = 34;
const PLATFORM_W = 70;
const PLATFORM_H = 12;
const PLATFORM_COUNT = 12;
const HEIGHT_PER_MULT = 200;
const START_BALANCE = 1000;

const state = {
  mode: "idle",
  balance: START_BALANCE,
  bet: 10,
  multiplier: 1,
  heightClimbed: 0,
  crashMult: 0,
  crashArmed: false,
  lossSoundPlayed: false,
};

let player = {
  x: W / 2 - PLAYER_W / 2,
  y: H - 80,
  vx: 0,
  vy: 0,
};

let platforms = [];
let keys = { left: false, right: false };

function sampleCrashMultiplier() {
  const r = Math.max(Math.random(), 1e-6);
  return Math.max(1.01, 0.96 / r);
}

function formatMoney(value) {
  return `$${value.toFixed(2)}`;
}

function setMessage(text) {
  ui.message.textContent = text;
  fitToViewport();
}

function playSfx(audio) {
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function primeAudio() {
  if (primeAudio.done) return;
  [sfx.pop, sfx.crack].forEach((audio) => {
    if (!audio) return;
    audio.play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
      })
      .catch(() => {});
  });
  primeAudio.done = true;
}
primeAudio.done = false;

function updateHud() {
  ui.balance.textContent = formatMoney(state.balance);
  ui.height.textContent = Math.floor(state.heightClimbed);
  ui.cashoutBtn.disabled =
    state.mode !== "playing" || state.crashArmed === true;
  ui.startBtn.disabled = state.mode === "playing" || state.mode === "crashing";
  ui.betInput.disabled = state.mode === "playing" || state.mode === "crashing";
}

function resetPlayer() {
  player = {
    x: W / 2 - PLAYER_W / 2,
    y: H - 80,
    vx: 0,
    vy: JUMP_VELOCITY,
  };
}

function createPlatform(y) {
  return {
    x: Math.random() * (W - PLATFORM_W),
    y,
    w: PLATFORM_W,
    h: PLATFORM_H,
    type: "normal",
  };
}

function resetPlatforms() {
  platforms = [];
  const baseY = H - 40;
  platforms.push(createPlatform(baseY));
  let y = baseY - 60;
  for (let i = 1; i < PLATFORM_COUNT; i += 1) {
    platforms.push(createPlatform(y));
    y -= 60 + Math.random() * 40;
  }
}

function startRound() {
  const bet = Number(ui.betInput.value);
  if (!Number.isFinite(bet) || bet <= 0) {
    setMessage("Enter a valid bet.");
    return;
  }
  if (bet > state.balance) {
    setMessage("Bet exceeds balance.");
    return;
  }

  state.balance -= bet;
  state.bet = bet;
  state.mode = "playing";
  state.multiplier = 1;
  state.heightClimbed = 0;
  state.crashMult = sampleCrashMultiplier();
  state.crashArmed = false;
  state.lossSoundPlayed = false;

  resetPlayer();
  resetPlatforms();

  primeAudio();
  setMessage("Round started. Climb and cash out!");
  updateHud();
}

function cashout() {
  if (state.mode !== "playing" || state.crashArmed) {
    return;
  }
  const payout = state.bet * state.multiplier;
  state.balance += payout;
  state.mode = "ended";
  setMessage(`Cashed out at ${state.multiplier.toFixed(2)}x. +${formatMoney(payout)}`);
  updateHud();
}

function endRoundLoss() {
  const crashText = state.crashArmed
    ? `Crashed at ${state.multiplier.toFixed(2)}x.`
    : "Fell off.";
  if (!state.lossSoundPlayed) {
    playSfx(sfx.crack);
    state.lossSoundPlayed = true;
  }
  state.mode = "ended";
  setMessage(`${crashText} Lost ${formatMoney(state.bet)}.`);
  updateHud();
}

function updatePlatforms() {
  let topMost = Math.min(...platforms.map((p) => p.y));
  for (const platform of platforms) {
    if (platform.y > H + 60) {
      const gap = 60 + Math.random() * 40;
      platform.y = topMost - gap;
      topMost = platform.y;
      platform.x = Math.random() * (W - PLATFORM_W);
      platform.type = "normal";
    }
  }
}

function handleCollision(prevY) {
  if (state.mode !== "playing" || player.vy <= 0) {
    return;
  }
  for (const platform of platforms) {
    const withinX =
      player.x + PLAYER_W > platform.x && player.x < platform.x + platform.w;
    const crossedY =
      prevY + PLAYER_H <= platform.y &&
      player.y + PLAYER_H >= platform.y;

    if (withinX && crossedY) {
      if (state.crashArmed) {
        platform.type = "break";
        state.mode = "crashing";
        player.vy = 2;
        if (!state.lossSoundPlayed) {
          playSfx(sfx.crack);
          state.lossSoundPlayed = true;
        }
      } else {
        playSfx(sfx.pop);
        player.vy = JUMP_VELOCITY;
      }
      break;
    }
  }
}

function updateState(delta) {
  if (state.mode !== "playing" && state.mode !== "crashing") {
    return;
  }

  const frameScale = delta / 16.67;

  const prevY = player.y;
  if (keys.left) {
    player.vx = -MOVE_SPEED;
  } else if (keys.right) {
    player.vx = MOVE_SPEED;
  } else {
    player.vx = 0;
  }

  player.x += player.vx * frameScale;
  if (player.x > W) player.x = -PLAYER_W;
  if (player.x < -PLAYER_W) player.x = W;

  player.vy += GRAVITY * frameScale;
  player.y += player.vy * frameScale;

  if (state.mode === "playing") {
    const targetY = H * 0.3;
    if (player.y < targetY && player.vy < 0) {
      const shift = targetY - player.y;
      player.y = targetY;
      for (const platform of platforms) {
        platform.y += shift;
      }
      state.heightClimbed += shift;
    }

    state.multiplier = 1 + state.heightClimbed / HEIGHT_PER_MULT;
    if (!state.crashArmed && state.multiplier >= state.crashMult) {
      state.crashArmed = true;
      setMessage("Crash armed! Next landing will break.");
    }
  }

  handleCollision(prevY);
  updatePlatforms();

  if (player.y > H + 80) {
    endRoundLoss();
  }

  updateHud();
}

function drawBackground() {
  ctx.fillStyle = "#f7f2e7";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(61, 55, 44, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function drawPlatform(platform) {
  ctx.fillStyle = platform.type === "break" ? "#a0703a" : "#6bbf43";
  ctx.strokeStyle = platform.type === "break" ? "#7a542d" : "#4b8f2f";
  ctx.lineWidth = 2;
  const radius = 6;
  ctx.beginPath();
  ctx.moveTo(platform.x + radius, platform.y);
  ctx.lineTo(platform.x + platform.w - radius, platform.y);
  ctx.quadraticCurveTo(
    platform.x + platform.w,
    platform.y,
    platform.x + platform.w,
    platform.y + radius
  );
  ctx.lineTo(platform.x + platform.w, platform.y + platform.h - radius);
  ctx.quadraticCurveTo(
    platform.x + platform.w,
    platform.y + platform.h,
    platform.x + platform.w - radius,
    platform.y + platform.h
  );
  ctx.lineTo(platform.x + radius, platform.y + platform.h);
  ctx.quadraticCurveTo(
    platform.x,
    platform.y + platform.h,
    platform.x,
    platform.y + platform.h - radius
  );
  ctx.lineTo(platform.x, platform.y + radius);
  ctx.quadraticCurveTo(
    platform.x,
    platform.y,
    platform.x + radius,
    platform.y
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (platform.type === "break") {
    ctx.strokeStyle = "#3a2a1f";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(platform.x + 10, platform.y + 4);
    ctx.lineTo(platform.x + 22, platform.y + 8);
    ctx.lineTo(platform.x + 34, platform.y + 4);
    ctx.stroke();
  }
}

function drawPlayer() {
  ctx.fillStyle = "#f4d44d";
  ctx.strokeStyle = "#c4a12f";
  ctx.lineWidth = 2;
  const radius = 12;
  ctx.beginPath();
  ctx.moveTo(player.x + radius, player.y);
  ctx.lineTo(player.x + PLAYER_W - radius, player.y);
  ctx.quadraticCurveTo(
    player.x + PLAYER_W,
    player.y,
    player.x + PLAYER_W,
    player.y + radius
  );
  ctx.lineTo(player.x + PLAYER_W, player.y + PLAYER_H - radius);
  ctx.quadraticCurveTo(
    player.x + PLAYER_W,
    player.y + PLAYER_H,
    player.x + PLAYER_W - radius,
    player.y + PLAYER_H
  );
  ctx.lineTo(player.x + radius, player.y + PLAYER_H);
  ctx.quadraticCurveTo(
    player.x,
    player.y + PLAYER_H,
    player.x,
    player.y + PLAYER_H - radius
  );
  ctx.lineTo(player.x, player.y + radius);
  ctx.quadraticCurveTo(player.x, player.y, player.x + radius, player.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#3a2a1f";
  ctx.beginPath();
  ctx.arc(player.x + 10, player.y + 12, 2, 0, Math.PI * 2);
  ctx.arc(player.x + 20, player.y + 12, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#3a2a1f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(player.x + 12, player.y + 22);
  ctx.lineTo(player.x + 18, player.y + 22);
  ctx.stroke();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(from, to, t) {
  const r = Math.round(lerp(from[0], to[0], t));
  const g = Math.round(lerp(from[1], to[1], t));
  const b = Math.round(lerp(from[2], to[2], t));
  return `rgb(${r}, ${g}, ${b})`;
}

function multiplierColor() {
  const tension = clamp((state.multiplier - 1) / 6, 0, 1);
  const green = [98, 191, 67];
  const orange = [245, 158, 66];
  const red = [234, 76, 61];
  if (tension < 0.5) {
    return mixColor(green, orange, tension * 2);
  }
  return mixColor(orange, red, (tension - 0.5) * 2);
}

function drawMultiplierOverlay(timestamp) {
  const time = timestamp || 0;
  const pulse = 1 + 0.03 * Math.sin(time * 0.008);
  const shake = state.crashArmed ? Math.sin(time * 0.05) * 2 : 0;
  const crashPulse = state.crashArmed ? 0.5 + 0.5 * Math.sin(time * 0.02) : 1;

  ctx.save();
  ctx.translate(W / 2 + shake, 70 + shake * 0.5);
  ctx.scale(pulse, pulse);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 44px \"Chalkboard SE\", \"Comic Sans MS\", \"Trebuchet MS\", sans-serif";
  ctx.shadowBlur = 18;
  ctx.shadowColor = state.crashArmed
    ? "rgba(255, 60, 60, 0.8)"
    : multiplierColor();
  ctx.fillStyle = state.crashArmed
    ? `rgba(255, 80, 80, ${0.7 + 0.3 * crashPulse})`
    : multiplierColor();
  ctx.fillText(`${state.multiplier.toFixed(2)}x`, 0, 0);

  if (state.crashArmed) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = "700 14px \"Trebuchet MS\", sans-serif";
    ctx.fillText("CRASH ARMED", 0, 34);
  }
  ctx.restore();
}

function draw(timestamp) {
  drawBackground();
  for (const platform of platforms) {
    drawPlatform(platform);
  }
  drawPlayer();
  drawMultiplierOverlay(timestamp);

  if (state.mode === "idle" || state.mode === "ended") {
    ctx.fillStyle = "rgba(47, 42, 36, 0.1)";
    ctx.fillRect(0, 0, W, H);
  }
}

let last = 0;
function loop(timestamp) {
  if (!last) last = timestamp;
  const delta = Math.min(timestamp - last, 40);
  last = timestamp;

  updateState(delta);
  draw(timestamp);

  requestAnimationFrame(loop);
}

ui.startBtn.addEventListener("click", startRound);
ui.cashoutBtn.addEventListener("click", cashout);

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    keys.left = true;
    event.preventDefault();
  }
  if (event.key === "ArrowRight") {
    keys.right = true;
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft") keys.left = false;
  if (event.key === "ArrowRight") keys.right = false;
});

function fitToViewport() {
  if (!app || !scaleRoot) return;
  const appWidth = app.offsetWidth;
  const appHeight = app.offsetHeight;
  const scale = Math.min(
    window.innerWidth / appWidth,
    window.innerHeight / appHeight,
    1
  );
  scaleRoot.style.transform = `scale(${scale})`;
}

window.addEventListener("resize", fitToViewport);

ui.balance.textContent = formatMoney(state.balance);
updateHud();
resetPlayer();
resetPlatforms();
requestAnimationFrame(loop);
fitToViewport();
