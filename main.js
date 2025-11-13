const gameArea = document.getElementById("game-area");
const startBtn = document.getElementById("start");
const restartBtn = document.getElementById("restart");
const difficultySel = document.getElementById("difficulty");
const roundsInput = document.getElementById("rounds");
const hudRemaining = document.getElementById("hud-remaining");
const hudHits = document.getElementById("hud-hits");
const hudMisses = document.getElementById("hud-misses");
const hudAcc = document.getElementById("hud-acc");
const summary = document.getElementById("summary");
const sumDuration = document.getElementById("sum-duration");
const sumHits = document.getElementById("sum-hits");
const sumMisses = document.getElementById("sum-misses");
const sumAcc = document.getElementById("sum-acc");
const summaryRestart = document.getElementById("summary-restart");
let running = false;
let startTime = 0;
let endTime = 0;
let hits = 0;
let misses = 0;
let shots = 0;
const sizeMap = { large: 0.6, medium: 0.45, small: 0.3 };
let targetRadius = sizeMap.medium;
let scene, camera, renderer, raycaster;
let targets = [];
let yaw = 0;
let pitch = 0;
let locked = false;
const yawLimit = Infinity;
const pitchLimit = Math.PI / 2 - 0.01;
let lastScreenSamples = [];
let aimAssistActive = false;
let lockedTarget = null;
const assistSpeed = 0.18;
let startMarker = null;
let moveLeft = false;
let moveRight = false;
const moveSpeed = 0.08;
let boundsX = 35;
let wallZ = -14;
let wallHalfW = 30;
let wallHalfH = 22.5;
let lastFrameTime = performance.now();
const assistAngularSpeed = 3.6;
let skyY = 9;
let muzzleFlash = null;
function fmt(n) {
  return (Math.round(n * 1000) / 1000).toFixed(3) + "s";
}
function updateHud() {
  hudHits.textContent = String(hits);
  hudMisses.textContent = String(misses);
  hudAcc.textContent = shots ? Math.round((hits / shots) * 100) + "%" : "0%";
}
function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9aa0a6);
  camera = new THREE.PerspectiveCamera(
    65,
    gameArea.clientWidth / gameArea.clientHeight,
    0.1,
    100
  );
  camera.position.set(0, 1.6, 4.5);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(gameArea.clientWidth, gameArea.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "renderer";
  gameArea.appendChild(renderer.domElement);
  raycaster = new THREE.Raycaster();
  const amb = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(4, 6, 3);
  dir.castShadow = true;
  dir.shadow.mapSize.set(2048, 2048);
  dir.shadow.camera.near = 1;
  dir.shadow.camera.far = 30;
  dir.shadow.camera.left = -15;
  dir.shadow.camera.right = 15;
  dir.shadow.camera.top = 12;
  dir.shadow.camera.bottom = -12;
  scene.add(dir);
  const roomGeo = new THREE.BoxGeometry(28, 18, 28);
  const roomMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x8a8f99),
    side: THREE.BackSide,
  });
  const room = new THREE.Mesh(roomGeo, roomMat);
  room.receiveShadow = true;
  scene.add(room);
  skyY = roomGeo.parameters.height / 2;
  const ceilGeo = new THREE.PlaneGeometry(
    roomGeo.parameters.width,
    roomGeo.parameters.depth
  );
  const ceilMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xaec7ff),
    emissive: new THREE.Color(0x314b8f),
    emissiveIntensity: 0.15,
    side: THREE.DoubleSide,
  });
  const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, skyY - 0.001, 0);
  ceiling.receiveShadow = false;
  scene.add(ceiling);
  const wallCanvas = document.createElement("canvas");
  wallCanvas.width = 1024;
  wallCanvas.height = 1024;
  const wctx = wallCanvas.getContext("2d");
  const grid = 16;
  const tile = wallCanvas.width / grid;
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      wctx.fillStyle = (i + j) % 2 === 0 ? "#7c828a" : "#8a8f99";
      wctx.fillRect(i * tile, j * tile, tile, tile);
    }
  }
  const wallTex = new THREE.CanvasTexture(wallCanvas);
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.repeat.set(4, 3);
  wallTex.anisotropy = 4;
  const wallMat2 = new THREE.MeshStandardMaterial({
    map: wallTex,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const frontW = 24;
  const frontH = 14;
  const frontWall = new THREE.Mesh(
    new THREE.PlaneGeometry(frontW, frontH),
    wallMat2
  );
  frontWall.position.set(0, frontH / 2, -9);
  frontWall.receiveShadow = true;
  scene.add(frontWall);
  wallZ = frontWall.position.z;
  wallHalfW = frontW / 2;
  wallHalfH = frontH / 2;
  const platW = frontW * 0.8;
  const platH = 1.2;
  const platD = 3.0;
  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(platW, platH, platD),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8a8f99) })
  );
  plat.position.set(0, platH / 2, wallZ + 2);
  plat.receiveShadow = true;
  plat.castShadow = true;
  scene.add(plat);
  const topTexCanvas = document.createElement("canvas");
  topTexCanvas.width = 512;
  topTexCanvas.height = 512;
  const tctx = topTexCanvas.getContext("2d");
  const g = 24;
  const s = topTexCanvas.width / g;
  for (let i = 0; i < g; i++) {
    for (let j = 0; j < g; j++) {
      tctx.fillStyle = (i + j) % 2 === 0 ? "#b9bec6" : "#d0d4db";
      tctx.fillRect(i * s, j * s, s, s);
    }
  }
  const topTex = new THREE.CanvasTexture(topTexCanvas);
  topTex.wrapS = THREE.RepeatWrapping;
  topTex.wrapT = THREE.RepeatWrapping;
  topTex.repeat.set(2, 2);
  const platTop = new THREE.Mesh(
    new THREE.PlaneGeometry(platW, platD),
    new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.9 })
  );
  platTop.rotation.x = -Math.PI / 2;
  platTop.position.set(0, platH + 0.001, wallZ + 2);
  platTop.receiveShadow = true;
  scene.add(platTop);
  boundsX = wallHalfW - 2;
  const groundGeo = new THREE.PlaneGeometry(40, 40);
  const groundMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x737a82),
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);
  const weaponGroup = new THREE.Group();
  const wMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x2e2f33),
  });
  const wBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.7), wMat);
  wBody.position.set(0.38, -0.32, -0.9);
  const wGrip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.16), wMat);
  wGrip.position.set(0.32, -0.5, -0.65);
  const wBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.35), wMat);
  wBarrel.position.set(0.38, -0.28, -1.1);
  weaponGroup.add(wBody);
  weaponGroup.add(wGrip);
  weaponGroup.add(wBarrel);
  const flashCanvas = document.createElement("canvas");
  flashCanvas.width = 128;
  flashCanvas.height = 128;
  const fctx = flashCanvas.getContext("2d");
  const grad = fctx.createRadialGradient(64, 64, 8, 64, 64, 50);
  grad.addColorStop(0, "rgba(255,235,160,1)");
  grad.addColorStop(0.35, "rgba(255,160,80,0.9)");
  grad.addColorStop(1, "rgba(255,160,80,0)");
  fctx.fillStyle = grad;
  fctx.fillRect(0, 0, 128, 128);
  const flashTex = new THREE.CanvasTexture(flashCanvas);
  const flashMat = new THREE.SpriteMaterial({
    map: flashTex,
    transparent: true,
  });
  muzzleFlash = new THREE.Sprite(flashMat);
  muzzleFlash.scale.set(0.25, 0.25, 1);
  muzzleFlash.position.set(0.38, -0.28, -1.3);
  muzzleFlash.visible = false;
  weaponGroup.add(muzzleFlash);
  camera.add(weaponGroup);
  animate();
}
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.max(0.0005, Math.min(0.05, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  const dx = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
  if (dx !== 0) {
    camera.position.x += dx * moveSpeed;
    if (camera.position.x > boundsX) camera.position.x = boundsX;
    if (camera.position.x < -boundsX) camera.position.x = -boundsX;
  }
  // no auto-centering; user can move view freely
  if (aimAssistActive) {
    if (!lockedTarget || !targets.includes(lockedTarget))
      lockedTarget = selectTarget();
    if (lockedTarget) {
      const to = computeAnglesTo(lockedTarget.position);
      const dy = wrapAngle(to.yaw - yaw);
      const dp = to.pitch - pitch;
      const maxStep = assistAngularSpeed * dt;
      const stepYaw = Math.max(-maxStep, Math.min(maxStep, dy));
      const stepPitch = Math.max(-maxStep, Math.min(maxStep, dp));
      yaw += stepYaw;
      pitch += stepPitch;
      if (pitch > pitchLimit) pitch = pitchLimit;
      if (pitch < -pitchLimit) pitch = -pitchLimit;
    }
  }
  yaw = wrapAngle(yaw);
  camera.rotation.set(pitch, yaw, 0);
  renderer.render(scene, camera);
  if (!running) return;
  const remain = Math.max(0, (endTime - now) / 1000);
  hudRemaining.textContent = fmt(remain);
  if (remain <= 0) {
    finish();
  }
}
function clearTargets() {
  for (const m of targets) {
    scene.remove(m);
  }
  targets = [];
}
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}
function computeAnglesTo(pos) {
  const v = new THREE.Vector3().copy(pos).sub(camera.position);
  const desiredYaw = Math.atan2(v.x, -v.z);
  const desiredPitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
  return { yaw: desiredYaw, pitch: desiredPitch };
}
function faceWallCenter() {
  const center = new THREE.Vector3(0, wallHalfH, wallZ);
  const to = computeAnglesTo(center);
  yaw = Math.max(-yawLimit, Math.min(yawLimit, to.yaw));
  pitch = Math.max(-pitchLimit, Math.min(pitchLimit, to.pitch));
  camera.rotation.set(pitch, yaw, 0);
}
function selectTarget() {
  if (targets.length === 0) return null;
  let best = null;
  let bestScore = Infinity;
  for (const t of targets) {
    const p = t.position.clone().project(camera);
    if (p.z > 1) continue; // behind camera or too far
    const dist = camera.position.distanceTo(t.position);
    const screenErr = Math.hypot(p.x, p.y); // center distance in NDC
    const score = screenErr + 0.01 * dist;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (!best) {
    // fallback to angular error if projection yields none
    for (const t of targets) {
      const to = computeAnglesTo(t.position);
      const dy = wrapAngle(to.yaw - yaw);
      const dp = to.pitch - pitch;
      const angErr = Math.hypot(dy, dp);
      const dist = camera.position.distanceTo(t.position);
      const score = angErr + 0.01 * dist;
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
  }
  return best;
}
function ensureLock() {
  if (!aimAssistActive) return;
  if (lockedTarget && targets.includes(lockedTarget)) return;
  lockedTarget = selectTarget();
}
function gaussianRand() {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function spawnPosFront(r) {
  const margin = r * 1.2;
  let x = 0,
    y = 0,
    tries = 0;
  const mode = Math.random();
  while (tries < 240) {
    if (mode < 0.3 && lastScreenSamples.length) {
      const p = lastScreenSamples[0];
      x = p.x + gaussianRand() * (wallHalfW * 0.15);
      y = p.y + gaussianRand() * (wallHalfH * 0.12);
    } else if (mode < 0.6) {
      const theta = rand(-Math.PI, Math.PI);
      const rw = rand(wallHalfW * 0.7, wallHalfW * 0.98);
      const rh = rand(wallHalfH * 0.7, wallHalfH * 0.98);
      x = Math.cos(theta) * Math.min(wallHalfW, rw);
      y = Math.sin(theta) * Math.min(wallHalfH, rh);
    } else if (mode < 0.85) {
      x = gaussianRand() * (wallHalfW * 0.5);
      y = gaussianRand() * (wallHalfH * 0.4);
    } else {
      x = rand(-wallHalfW + margin, wallHalfW - margin);
      y = rand(-wallHalfH + margin, wallHalfH - margin);
    }
    tries++;
    x = Math.max(-wallHalfW + margin, Math.min(wallHalfW - margin, x));
    y = Math.max(-wallHalfH + margin, Math.min(wallHalfH - margin, y));
    const sepOk = lastScreenSamples.every(
      (p) => Math.hypot(x - p.x, y - p.y) > margin * 0.7
    );
    if (sepOk) break;
  }
  const minY = r + 0.2;
  const maxY = skyY - r - 0.2;
  const posY = Math.max(minY, Math.min(maxY, y + wallHalfH));
  const pos = new THREE.Vector3(x, posY, wallZ + r + 0.6);
  lastScreenSamples.unshift({ x, y });
  if (lastScreenSamples.length > 10) lastScreenSamples.pop();
  return pos;
}
function ensureTargets() {
  const needed = 6 - targets.length;
  for (let i = 0; i < needed; i++) {
    let pos = spawnPosFront(targetRadius);
    let safe = 0;
    const minDist = targetRadius * 2 + 0.02;
    while (safe < 300) {
      const tooClose = targets.some(
        (t) => t.position.distanceTo(pos) < minDist
      );
      if (!tooClose) break;
      pos = spawnPosFront(targetRadius);
      safe++;
    }
    const geo = new THREE.SphereGeometry(targetRadius, 32, 16);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x8fd3ff),
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.position.copy(pos);
    scene.add(m);
    targets.push(m);
  }
  if (aimAssistActive) ensureLock();
}
function processShot() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  if (!running) {
    if (startMarker) {
      const hitStart = raycaster.intersectObject(startMarker, false);
      if (hitStart.length) {
        start();
        scene.remove(startMarker);
        startMarker = null;
      }
    }
    return;
  }
  shots++;
  const hitsList = raycaster.intersectObjects(targets, false);
  if (hitsList.length) {
    const obj = hitsList[0].object;
    hits++;
    scene.remove(obj);
    targets = targets.filter((t) => t !== obj);
    updateHud();
    ensureTargets();
    if (aimAssistActive) ensureLock();
  } else {
    misses++;
    updateHud();
  }
  if (muzzleFlash) {
    muzzleFlash.visible = true;
    setTimeout(() => {
      if (muzzleFlash) muzzleFlash.visible = false;
    }, 70);
  }
}
function start() {
  summary.classList.add("hidden");
  const durationSec = Math.max(
    5,
    Math.min(600, parseInt(roundsInput.value || "60", 10))
  );
  targetRadius = sizeMap[difficultySel.value] || sizeMap.medium;
  hits = 0;
  misses = 0;
  shots = 0;
  updateHud();
  startTime = performance.now();
  endTime = startTime + durationSec * 1000;
  hudRemaining.textContent = fmt(durationSec);
  startBtn.disabled = true;
  restartBtn.disabled = true;
  running = true;
  clearTargets();
  if (startMarker) {
    scene.remove(startMarker);
    startMarker = null;
  }
  ensureTargets();
}
function finish() {
  if (!running) return;
  running = false;
  sumDuration.textContent = fmt((endTime - startTime) / 1000);
  sumHits.textContent = String(hits);
  sumMisses.textContent = String(misses);
  sumAcc.textContent = shots ? Math.round((hits / shots) * 100) + "%" : "0%";
  summary.classList.remove("hidden");
  startBtn.disabled = false;
  restartBtn.disabled = false;
  showStartMarker();
}
function showStartMarker() {
  if (startMarker) {
    scene.remove(startMarker);
    startMarker = null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#8a8f99";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 90px system-ui, -apple-system, Segoe UI, Roboto";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("开始", canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex });
  const sprite = new THREE.Sprite(mat);
  const ahead = new THREE.Vector3(0, 0, -8).applyEuler(camera.rotation);
  sprite.position.copy(camera.position).add(ahead);
  sprite.scale.set(6, 3, 1);
  scene.add(sprite);
  startMarker = sprite;
}
function onLockChange() {
  locked = document.pointerLockElement === renderer.domElement;
}
function onMouseMove(e) {
  if (!locked) return;
  const sens = 0.002;
  yaw -= e.movementX * sens;
  pitch -= e.movementY * sens;
  yaw = wrapAngle(yaw);
  if (pitch > pitchLimit) pitch = pitchLimit;
  if (pitch < -pitchLimit) pitch = -pitchLimit;
}
startBtn.addEventListener("click", start);
restartBtn.addEventListener("click", start);
summaryRestart.addEventListener("click", start);
window.addEventListener("resize", () => {
  if (!renderer || !camera) return;
  renderer.setSize(gameArea.clientWidth, gameArea.clientHeight);
  camera.aspect = gameArea.clientWidth / gameArea.clientHeight;
  camera.updateProjectionMatrix();
  if (!running) showStartMarker();
});
window.addEventListener("DOMContentLoaded", () => {
  init3D();
  showStartMarker();
  renderer.domElement.addEventListener("click", () => {
    if (!locked) renderer.domElement.requestPointerLock();
    else processShot();
  });
  document.addEventListener("pointerlockchange", onLockChange);
  renderer.domElement.addEventListener("mousemove", onMouseMove);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      start();
    }
    if (e.code === "KeyV") {
      aimAssistActive = true;
      lockedTarget = selectTarget();
    }
    if (e.code === "KeyA" || e.code === "ArrowLeft") moveLeft = true;
    if (e.code === "KeyD" || e.code === "ArrowRight") moveRight = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyV") {
      aimAssistActive = false;
      lockedTarget = null;
    }
    if (e.code === "KeyA" || e.code === "ArrowLeft") moveLeft = false;
    if (e.code === "KeyD" || e.code === "ArrowRight") moveRight = false;
  });
});
