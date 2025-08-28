// ES module loading of Three.js + helpers from CDN for simplicity
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// Depuração: alterna a exibição de helpers (ex.: AxesHelper). Defina false para desativar.
const isDebugMode = true;

// Espaçamento vertical entre linhas no Gráfico 2D Consolidado (em unidades de cena)
const CHART_VERTICAL_SPACING = 1;
// Offset específico entre o bloco superior (linhas 1-2) e o bloco inferior (linhas 3-4) no gráfico 2D
const CHART_SUP_INF_OFFSET = 10;
// Offset vertical entre arcadas (superior e inferior) nas cenas principais
// Define a distância total entre as arcadas; valores aplicados são simétricos (+/- metade)
const ARCH_VERTICAL_OFFSET = 40;

// Offset vertical adicional para implantes nos dentes inferiores (Gráfico 2D)
// Edite este valor para ajustar manualmente a altura relativa dos implantes inferiores
const IMPLANT_LOWER_Y_OFFSET = 3;

const statusEl = document.getElementById('status');
const btnClear = document.getElementById('btn-clear');
const btnToggle3D = document.getElementById('btn-toggle-3d');
// Four viewport containers from HTML
const viewVestUp = document.getElementById('viewport-vest-up');
const viewVestLow = document.getElementById('viewport-vest-low');
const viewOcluUp = document.getElementById('viewport-oclu-up');
const viewOcluLow = document.getElementById('viewport-oclu-low');
// Fifth consolidated 2D chart viewport
const viewChart = document.getElementById('viewport-chart');

// Two scenes to allow different transforms per view; geometries/materials are shared
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
const sceneOclu = new THREE.Scene();
sceneOclu.background = new THREE.Color(0x0b0f14);
// Fifth scene (orthographic consolidated chart)
const sceneChart = new THREE.Scene();
sceneChart.background = new THREE.Color(0x0b0f14);
// Basic lights for chart scene
const hemiC = new THREE.HemisphereLight(0xffffff, 0x202020, 0.9);
sceneChart.add(hemiC);
const dirC1 = new THREE.DirectionalLight(0xffffff, 0.9);
dirC1.position.set(50, 80, 100);
sceneChart.add(dirC1);
const dirC2 = new THREE.DirectionalLight(0xffffff, 0.5);
dirC2.position.set(-60, -40, -80);
sceneChart.add(dirC2);
// Arch subgroups to selectively render upper/lower per viewport
const vestUpperGroup = new THREE.Group();
vestUpperGroup.name = 'vest-upper-group';
const vestLowerGroup = new THREE.Group();
vestLowerGroup.name = 'vest-lower-group';
scene.add(vestUpperGroup);
scene.add(vestLowerGroup);

const ocluUpperGroup = new THREE.Group();
ocluUpperGroup.name = 'oclu-upper-group';
const ocluLowerGroup = new THREE.Group();
ocluLowerGroup.name = 'oclu-lower-group';
sceneOclu.add(ocluUpperGroup);
sceneOclu.add(ocluLowerGroup);

// Offsets absolutos em Y por arcada; derivados de ARCH_VERTICAL_OFFSET
const archOffsets = {
  get upperY() { return -ARCH_VERTICAL_OFFSET / 2; },
  get lowerY() { return  ARCH_VERTICAL_OFFSET / 2; },
};

function applyArchOffsets() {
  vestUpperGroup.position.y = archOffsets.upperY;
  ocluUpperGroup.position.y = archOffsets.upperY;
  vestLowerGroup.position.y = archOffsets.lowerY;
  ocluLowerGroup.position.y = archOffsets.lowerY;
}

// AxesHelper apenas para depuração, controlado por isDebugMode
if (isDebugMode) {
  const axesHelper = new THREE.AxesHelper(5); // tamanho 5 para boa visibilidade
  axesHelper.position.set(0, 0, 0); // origem do mundo
  scene.add(axesHelper); // adicionar apenas à cena principal (vestibular)
  // Opcional: também mostrar na cena oclusal
  const axesHelperOclu = new THREE.AxesHelper(5);
  axesHelperOclu.position.set(0, 0, 0);
  sceneOclu.add(axesHelperOclu);
}

// Lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 0.9);
scene.add(hemi);
const dir1 = new THREE.DirectionalLight(0xffffff, 0.9);
dir1.position.set(50, 80, 100);
scene.add(dir1);
const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
dir2.position.set(-60, -40, -80);
scene.add(dir2);
// Duplicate lights for occlusal scene
const hemi2 = new THREE.HemisphereLight(0xffffff, 0x202020, 0.9);
sceneOclu.add(hemi2);
const dir1b = new THREE.DirectionalLight(0xffffff, 0.9);
dir1b.position.set(50, 80, 100);
sceneOclu.add(dir1b);
const dir2b = new THREE.DirectionalLight(0xffffff, 0.5);
dir2b.position.set(-60, -40, -80);
sceneOclu.add(dir2b);

// Cameras (four viewports)
const camVestUp = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
const camVestLow = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
const camOcluUp = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
const camOcluLow = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
camVestUp.position.set(0, 20, 140);
camVestLow.position.copy(camVestUp.position);
camOcluUp.position.copy(camVestUp.position);
camOcluLow.position.copy(camVestUp.position);

// Orthographic camera for consolidated chart
const camChart = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 5000);
camChart.position.set(0, 0, 1000);
camChart.lookAt(0, 0, 0);
// Show both layers so vestibular rows include roots; occlusal rows hide via visibility flags
camChart.layers.enable(0);
camChart.layers.enable(1);

// Renderers (one per viewport)
const rendererOpts = { antialias: true, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: false };
const rendererVestUp = new THREE.WebGLRenderer(rendererOpts);
const rendererVestLow = new THREE.WebGLRenderer(rendererOpts);
const rendererOcluUp = new THREE.WebGLRenderer(rendererOpts);
const rendererOcluLow = new THREE.WebGLRenderer(rendererOpts);
const rendererChart = new THREE.WebGLRenderer(rendererOpts);
[rendererVestUp, rendererVestLow, rendererOcluUp, rendererOcluLow, rendererChart].forEach(r => r.setPixelRatio(Math.min(window.devicePixelRatio, 2)));
// Attach only chart initially; others attach lazily on toggle
if (viewChart) viewChart.appendChild(rendererChart.domElement);

let conventionalViewsAttached = false;
function attachConventionalViewRenderers() {
  if (conventionalViewsAttached) return;
  viewVestUp.appendChild(rendererVestUp.domElement);
  viewVestLow.appendChild(rendererVestLow.domElement);
  viewOcluUp.appendChild(rendererOcluUp.domElement);
  viewOcluLow.appendChild(rendererOcluLow.domElement);
  conventionalViewsAttached = true;
  // Re-run resize to size new canvases
  resize();
}

// Controls per viewport
const controlsVestUp = new OrbitControls(camVestUp, rendererVestUp.domElement);
controlsVestUp.enableDamping = true;
const controlsVestLow = new OrbitControls(camVestLow, rendererVestLow.domElement);
controlsVestLow.enableDamping = true;
const controlsOcluUp = new OrbitControls(camOcluUp, rendererOcluUp.domElement);
controlsOcluUp.enableDamping = true;
const controlsOcluLow = new OrbitControls(camOcluLow, rendererOcluLow.domElement);
controlsOcluLow.enableDamping = true;
// Mantém a navegação suave; a câmera será enquadrada em vista de planta

// Resize handling
function resize() {
  const rVU = viewVestUp.getBoundingClientRect();
  const rVL = viewVestLow.getBoundingClientRect();
  const rOU = viewOcluUp.getBoundingClientRect();
  const rOL = viewOcluLow.getBoundingClientRect();
  // Size only if attached/visible
  if (rendererVestUp.domElement.parentElement) rendererVestUp.setSize(rVU.width, rVU.height, false);
  if (rendererVestLow.domElement.parentElement) rendererVestLow.setSize(rVL.width, rVL.height, false);
  if (rendererOcluUp.domElement.parentElement) rendererOcluUp.setSize(rOU.width, rOU.height, false);
  if (rendererOcluLow.domElement.parentElement) rendererOcluLow.setSize(rOL.width, rOL.height, false);
  if (rendererVestUp.domElement.parentElement) { camVestUp.aspect = rVU.width / Math.max(1, rVU.height); camVestUp.updateProjectionMatrix(); }
  if (rendererVestLow.domElement.parentElement) { camVestLow.aspect = rVL.width / Math.max(1, rVL.height); camVestLow.updateProjectionMatrix(); }
  if (rendererOcluUp.domElement.parentElement) { camOcluUp.aspect = rOU.width / Math.max(1, rOU.height); camOcluUp.updateProjectionMatrix(); }
  if (rendererOcluLow.domElement.parentElement) { camOcluLow.aspect = rOL.width / Math.max(1, rOL.height); camOcluLow.updateProjectionMatrix(); }

  if (viewChart) {
    const rCH = viewChart.getBoundingClientRect();
    rendererChart.setSize(rCH.width, rCH.height, false);
    updateChartCameraFrustum(rCH.width, rCH.height);
  }
}
// Debounced resize to avoid repeated layout thrash on window resizes
let resizeRAF = 0;
window.addEventListener('resize', () => {
  if (resizeRAF) cancelAnimationFrame(resizeRAF);
  resizeRAF = requestAnimationFrame(() => {
    resizeRAF = 0;
    resize();
  });
});

// Raycasters
const raycasterVestUp = new THREE.Raycaster();
const raycasterVestLow = new THREE.Raycaster();
const raycasterOcluUp = new THREE.Raycaster();
const raycasterOcluLow = new THREE.Raycaster();
const raycasterChart = new THREE.Raycaster();

// Tooth registry
const toothGroups = new Map(); // toothId -> THREE.Group (vestibular)
const toothGroupsOclu = new Map(); // toothId -> THREE.Group (oclusal/lingual)
const transientMarkers = [];   // 3D fallback markers to clear
// Base colors (normalized 0..1)
const BASE_GREY = { r: 240 / 255, g: 240 / 255, b: 240 / 255 }; // ~0xf0f0f0
const BLUE = { r: 30 / 255, g: 144 / 255, b: 1.0 }; // dodgerblue
const PURPLE = { r: 153 / 255, g: 50 / 255, b: 204 / 255 }; // purple for part coloring

// Debug palette removed for per-arch colors; keep neutral base grey only

function ensureVertexColors(geometry) {
  const g = geometry;
  if (!g.attributes) return;
  const position = g.getAttribute('position');
  const vcount = position ? position.count : 0;
  let colorAttr = g.getAttribute('color');
  if (!colorAttr || colorAttr.count !== vcount) {
    const arr = new Float32Array(vcount * 3);
    for (let i = 0; i < vcount; i++) {
      arr[i * 3 + 0] = BASE_GREY.r;
      arr[i * 3 + 1] = BASE_GREY.g;
      arr[i * 3 + 2] = BASE_GREY.b;
    }
    colorAttr = new THREE.BufferAttribute(arr, 3);
    g.setAttribute('color', colorAttr);
  }
  return colorAttr;
}

function setAllVertexColors(geometry, color) {
  const g = geometry;
  if (!g || !g.attributes) return;
  const vcount = g.getAttribute('position')?.count || 0;
  let colorAttr = g.getAttribute('color');
  if (!colorAttr || colorAttr.count !== vcount) {
    colorAttr = new THREE.BufferAttribute(new Float32Array(vcount * 3), 3);
    g.setAttribute('color', colorAttr);
  }
  for (let i = 0; i < vcount; i++) {
    colorAttr.setX(i, color.r);
    colorAttr.setY(i, color.g);
    colorAttr.setZ(i, color.b);
  }
  colorAttr.needsUpdate = true;
}

function colorFace(mesh, faceIndex, color) {
  const g = mesh.geometry;
  if (!g) return;
  const colorAttr = ensureVertexColors(g);
  if (!colorAttr) return;
  const index = g.getIndex();
  if (index) {
    const i0 = index.getX(faceIndex * 3 + 0);
    const i1 = index.getX(faceIndex * 3 + 1);
    const i2 = index.getX(faceIndex * 3 + 2);
    colorAttr.setX(i0, color.r); colorAttr.setY(i0, color.g); colorAttr.setZ(i0, color.b);
    colorAttr.setX(i1, color.r); colorAttr.setY(i1, color.g); colorAttr.setZ(i1, color.b);
    colorAttr.setX(i2, color.r); colorAttr.setY(i2, color.g); colorAttr.setZ(i2, color.b);
  } else {
    const base = faceIndex * 3;
    const i0 = base + 0, i1 = base + 1, i2 = base + 2;
    colorAttr.setX(i0, color.r); colorAttr.setY(i0, color.g); colorAttr.setZ(i0, color.b);
    colorAttr.setX(i1, color.r); colorAttr.setY(i1, color.g); colorAttr.setZ(i1, color.b);
    colorAttr.setX(i2, color.r); colorAttr.setY(i2, color.g); colorAttr.setZ(i2, color.b);
  }
  colorAttr.needsUpdate = true;
}

function screenToNDC(event, renderer) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  return new THREE.Vector2(x, y);
}

function getRoots(which) {
  return (
    which === 'vest-up' ? [vestUpperGroup]
    : which === 'vest-low' ? [vestLowerGroup]
    : which === 'oclu-up' ? [ocluUpperGroup]
  : which === 'oclu-low' ? [ocluLowerGroup]
  : which === 'chart' ? [chartRoot]
  : [vestUpperGroup, vestLowerGroup, ocluUpperGroup, ocluLowerGroup]
  );
}

function setupPicking(renderer, camera, raycaster, which) {
  renderer.domElement.addEventListener('pointerdown', (ev) => {
    // Only left click paints a single face
    if (ev.button !== 0) return;
    const ndc = screenToNDC(ev, renderer);
    raycaster.setFromCamera(ndc, camera);
    const roots = getRoots(which);
    const hits = raycaster.intersectObjects(roots, true);
    if (hits.length > 0) {
      const hit = hits[0];
      // Color entire part (OBJ file group) purple
      const partRoot = findPartRoot(hit.object);
      if (partRoot) {
        colorPart(partRoot, PURPLE);
        const label = (partRoot.userData.partName || partRoot.name || '').split('/').pop();
        statusEl.textContent = `Parte colorida: ${label}`;
      }
    }
  }, { passive: true });
}
// Attach pickers for each viewport
const viewConfigs = [
  { which: 'vest-up', renderer: rendererVestUp, camera: camVestUp, raycaster: raycasterVestUp, controls: controlsVestUp },
  { which: 'vest-low', renderer: rendererVestLow, camera: camVestLow, raycaster: raycasterVestLow, controls: controlsVestLow },
  { which: 'oclu-up', renderer: rendererOcluUp, camera: camOcluUp, raycaster: raycasterOcluUp, controls: controlsOcluUp },
  { which: 'oclu-low', renderer: rendererOcluLow, camera: camOcluLow, raycaster: raycasterOcluLow, controls: controlsOcluLow },
  // Chart: static camera; provide a stub controls object for the painter to toggle
  { which: 'chart', renderer: rendererChart, camera: camChart, raycaster: raycasterChart, controls: { enabled: true, update(){/* no-op */} } },
];
viewConfigs.forEach(v => setupPicking(v.renderer, v.camera, v.raycaster, v.which));

// Right-click paint mode: if started over a tooth, freeze camera and paint while moving
function setupPainter(renderer, camera, raycaster, which, controls) {
  let painting = false;
  // prevent context menu on right-click over canvas
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  const paintAtEvent = (ev) => {
    const ndc = screenToNDC(ev, renderer);
    raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(getRoots(which), true);
    if (hits.length > 0) {
      const h = hits[0];
      if (h.faceIndex != null) {
        colorFace(h.object, h.faceIndex, BLUE);
      }
    }
  };

  renderer.domElement.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 2) return; // only right button
    const ndc = screenToNDC(ev, renderer);
    raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(getRoots(which), true);
    // Start painting only if clicking over a tooth; otherwise let OrbitControls pan
    if (hits.length > 0) {
      painting = true;
      controls.enabled = false; // freeze camera while painting
      paintAtEvent(ev); // paint initial point
      ev.preventDefault();
    }
  });

  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (!painting) return;
    // Continue painting only while right button is pressed
    if ((ev.buttons & 2) === 0) return;
    paintAtEvent(ev);
    ev.preventDefault();
  });

  const stopPainting = () => {
    if (!painting) return;
    painting = false;
    controls.enabled = true;
  };
  renderer.domElement.addEventListener('pointerup', stopPainting);
  renderer.domElement.addEventListener('pointerleave', stopPainting);
}
viewConfigs.forEach(v => setupPainter(v.renderer, v.camera, v.raycaster, v.which, v.controls));

// Load manifest and then load all permanent teeth (Step 5)
async function loadManifest() {
  const res = await fetch('/manifest.json');
  if (!res.ok) throw new Error('Falha ao carregar manifest.json');
  return res.json();
}

const objLoader = new OBJLoader();
objLoader.setPath('/models/');

function isPosterior(toothId) {
  const n = Number(toothId);
  return (
    (14 <= n && n <= 18) || (24 <= n && n <= 28) ||
    (34 <= n && n <= 38) || (44 <= n && n <= 48)
  );
}

function isAnterior(toothId) {
  const n = Number(toothId);
  return (
    (11 <= n && n <= 13) || (21 <= n && n <= 23) ||
    (31 <= n && n <= 33) || (41 <= n && n <= 43)
  );
}

function isUpper(toothId) {
  const n = Number(toothId);
  return ((11 <= n && n <= 18) || (21 <= n && n <= 28));
}

function isLowerPosterior(toothId) {
  const n = Number(toothId);
  return ((31 <= n && n <= 38) || (41 <= n && n <= 48));
}

function getToothSet(toothId) {
  const upper = isUpper(toothId);
  if (isPosterior(toothId)) return upper ? 'UP_POST' : 'LOW_POST';
  if (isAnterior(toothId)) return upper ? 'UP_ANT' : 'LOW_ANT';
  return 'UNKNOWN';
}

// Simplified, config-driven transforms
const deg2rad = (d) => (d * Math.PI) / 180;
// Absolute Euler (degrees) per set; keeps teeth where they are, just orients
const OCLU_ABS_ROT_DEG = {
  // Upper posteriors: 180° in X and 180° in Z (per request)
  UP_POST: { x: 90, y: 180, z: 180 },
  // Upper anteriors: 180 in Y
  UP_ANT:  { x: 0, y: 180, z: 180 },
  // Lower posteriors: occlusal up (+Z)
  LOW_POST:{ x: 90, y: 0, z: 0 },
  // Lower anteriors: 180 in Y + 180 in Z
  LOW_ANT: { x: 0, y: 180, z: 180 },
  UNKNOWN: { x: 0, y: 0, z: 0 },
};
// Optional relative offsets (degrees / units) per set or per tooth, default 0
const OCLU_REL_OFFSETS = {
  set: {
    UP_POST: { rot: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
    UP_ANT:  { rot: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
    LOW_POST:{ rot: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
    LOW_ANT: { rot: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
    UNKNOWN: { rot: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } },
  },
  tooth: {
    // Example per-tooth override:
    // '26': { rot: { x: 0, y: 0, z: 5 }, pos: { x: 0, y: 0, z: 0 } }
  },
};

// --- Component type detection from OBJ filename ---
function parseComponentTypeFromFilename(fname) {
  const s = String(fname || '').toLowerCase();
  if (/(implante|implant)/i.test(s)) return 'implante';
  if (/canal/i.test(s)) return 'canal';
  if (/raiz|raíz/i.test(s)) return 'raiz';
  if (/\bnu[cç]/i.test(s)) return 'nucleo';
  // Heuristics by section letter if present (e.g., D11R_*, D11N_*, D11C_*)
  // Prioritize explicit matches above; fall back by prefix
  if (/\b[a-z]:?\/|^/.test(s)) {
    // no-op for paths, just keep fallbacks below
  }
  // Section letter after tooth code: D\d\d([CRN])_
  const m = s.match(/^d\d{2}([crn])_/i);
  if (m) {
    const sec = m[1].toLowerCase();
    if (sec === 'r') return 'raiz';
    if (sec === 'n') return 'nucleo';
    if (sec === 'c') return 'dente';
  }
  return 'dente';
}

function applyOcclusalTransform(toothId, pivot) {
  const setKey = getToothSet(toothId);
  const abs = OCLU_ABS_ROT_DEG[setKey] || OCLU_ABS_ROT_DEG.UNKNOWN;
  const relSet = OCLU_REL_OFFSETS.set[setKey] || OCLU_REL_OFFSETS.set.UNKNOWN;
  const relTooth = OCLU_REL_OFFSETS.tooth[toothId] || { rot: { x: 0, y: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } };
  // Final absolute + relative (degrees)
  const rx = deg2rad((abs.x || 0) + (relSet.rot.x || 0) + (relTooth.rot.x || 0));
  const ry = deg2rad((abs.y || 0) + (relSet.rot.y || 0) + (relTooth.rot.y || 0));
  const rz = deg2rad((abs.z || 0) + (relSet.rot.z || 0) + (relTooth.rot.z || 0));
  pivot.rotation.set(rx, ry, rz, 'XYZ');
  // Keep position (center) and allow small relative offsets if configured
  pivot.position.x += (relSet.pos.x || 0) + (relTooth.pos.x || 0);
  pivot.position.y += (relSet.pos.y || 0) + (relTooth.pos.y || 0);
  pivot.position.z += (relSet.pos.z || 0) + (relTooth.pos.z || 0);
}

// Compute crown-only bounding box for a pivot (exclude layer 1 roots)
function computeCrownBox(root) {
  const box = new THREE.Box3();
  let has = false;
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
  if (node.isMesh && (node.layers.mask & 1)) { // crowns only (layer 0)
      const geo = node.geometry;
      if (!geo) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox.clone();
      bb.applyMatrix4(node.matrixWorld);
      if (!has) { box.copy(bb); has = true; } else { box.union(bb); }
    }
  });
  return has ? box : null;
}

// Compute bounding box for meshes of a specific component type within a subtree
function computeComponentBox(root, type) {
  const box = new THREE.Box3();
  let has = false;
  const desired = String(type || '').toLowerCase();
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    if (node.isMesh && String(node.userData?.type || '').toLowerCase() === desired) {
      const geo = node.geometry;
      if (!geo) return;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const bb = geo.boundingBox.clone();
      bb.applyMatrix4(node.matrixWorld);
      if (!has) { box.copy(bb); has = true; } else { box.union(bb); }
    }
  });
  return has ? box : null;
}

// (Alignment helpers removed per request)

// Per-arch debug colors removed; keep single neutral color

function cloneNodeForOclu(node) {
  const nodeClone = node.clone(false);
  nodeClone.name = node.name;
  nodeClone.userData = { ...node.userData };
  if (node.isMesh) {
    const meshClone = new THREE.Mesh(node.geometry, node.material);
    meshClone.name = node.name;
    meshClone.position.copy(node.position);
    meshClone.quaternion.copy(node.quaternion);
    meshClone.scale.copy(node.scale);
    meshClone.layers.mask = node.layers.mask;
    meshClone.userData = { ...node.userData };
    return meshClone;
  }
  // Copy transforms for non-mesh nodes as well
  nodeClone.position.copy(node.position);
  nodeClone.quaternion.copy(node.quaternion);
  nodeClone.scale.copy(node.scale);
  node.children.forEach((child) => {
    const c = cloneNodeForOclu(child);
    if (c) nodeClone.add(c);
  });
  nodeClone.layers.mask = node.layers.mask;
  return nodeClone;
}

// Filtered clone for oclusal/lingual views: skip roots/canals/implants meshes entirely
function cloneNodeForOcluFiltered(node, predicateMeshInclude) {
  // If it's a Mesh, decide directly
  if (node.isMesh) {
    if (!predicateMeshInclude(node)) return null;
    const meshClone = new THREE.Mesh(node.geometry, node.material);
    meshClone.name = node.name;
    meshClone.position.copy(node.position);
    meshClone.quaternion.copy(node.quaternion);
    meshClone.scale.copy(node.scale);
    meshClone.layers.mask = node.layers.mask;
    meshClone.userData = { ...node.userData };
    return meshClone;
  }
  // Non-mesh: clone shallow and process children; drop if no child included
  const nodeClone = node.clone(false);
  nodeClone.name = node.name;
  nodeClone.userData = { ...node.userData };
  nodeClone.position.copy(node.position);
  nodeClone.quaternion.copy(node.quaternion);
  nodeClone.scale.copy(node.scale);
  for (const child of node.children) {
    const c = cloneNodeForOcluFiltered(child, predicateMeshInclude);
    if (c) nodeClone.add(c);
  }
  nodeClone.layers.mask = node.layers.mask;
  // If this node ended up childless and isn't a mesh, drop it
  if (nodeClone.children.length === 0) return null;
  return nodeClone;
}

async function loadTooth(toothId, manifest) {
  const entry = manifest.teeth[toothId];
  if (!entry) throw new Error(`Tooth ${toothId} não encontrado no manifesto`);
  const group = new THREE.Group();
  group.name = `tooth-${toothId}`;

  // Carregar todas as partes (Coroa, Raiz, Canal e Núcleo); a visibilidade padrão é controlada pelo menu 2D
  const crowns = entry.C || [];
  const roots = entry.R || [];
  const nuclei = entry.N || [];
  const parts = [
    ...crowns,
    ...roots,   // inclui Raiz e Canal
    ...nuclei,  // inclui Núcleo
  ];

  // Reuse a small pool of materials keyed by basic parameters to reduce allocations
  const baseMatKey = 'std:vc:rough1:metal0:double';
  const materialCache = loadTooth._matCache || (loadTooth._matCache = new Map());
  let baseMaterial = materialCache.get(baseMatKey);
  if (!baseMaterial) {
    baseMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
    materialCache.set(baseMatKey, baseMaterial);
  }

  // Load sequentially to keep it simple; can be parallelized if needed
  for (const fname of parts) {
    try {
      const obj = await objLoader.loadAsync(fname);
      // Tag this loaded OBJ group with partName so we can color whole part later
      obj.userData.partName = fname;
      obj.traverse((node) => {
        if (node.isMesh) {
          // Use a material instance per mesh when possible; clone only if uniforms differ
          node.material = baseMaterial;
          ensureVertexColors(node.geometry);
          node.userData.partName = fname;
          // Tag component type for visibility filtering in consolidated chart
          node.userData.type = parseComponentTypeFromFilename(fname);
          // Keep neutral base color (no per-arch coloring)
          node.castShadow = false;
          node.receiveShadow = false;
          // Marcar raízes (R_/Raiz/Canal) na layer 1 para ocultar apenas na 2ª vista
          const isRootPart = /\bR_/i.test(fname) || /Raiz|Canal/i.test(fname);
          if (isRootPart) {
            node.layers.set(1); // roots
          } else {
            node.layers.set(0); // crowns/others
          }
        }
      });
      group.add(obj);
    } catch (e) {
      console.warn('Erro carregando', fname, e);
    }
  }

  // Do not apply legacy position offsets; keep native OBJ coordinates

  toothGroups.set(toothId, group);
  if (isUpper(toothId)) vestUpperGroup.add(group); else vestLowerGroup.add(group);
  // Build and add occlusal/lingual clone group with requested rotations
  const ocluGroup = new THREE.Group();
  ocluGroup.name = `tooth-${toothId}-oclu`;
  // Clone only needed parts for oclusal: exclude roots, canals and implants
  const includeMesh = (mesh) => {
    const t = String(mesh.userData?.type || '').toLowerCase();
    return t !== 'raiz' && t !== 'canal' && t !== 'implante';
  };
  group.children.forEach((child) => {
    const c = cloneNodeForOcluFiltered(child, includeMesh);
    if (c) ocluGroup.add(c);
  });
  // Compute center to rotate around tooth center, not world origin
  ocluGroup.updateWorldMatrix(true, true);
  // Use crown-only bounding box to determine pivot center (ignore roots)
  let center = null;
  const crownBox = computeCrownBox(ocluGroup);
  if (crownBox) {
    center = crownBox.getCenter(new THREE.Vector3());
  } else {
    // Fallback to full object bounds if crown box is unavailable
    const fullBox = new THREE.Box3().setFromObject(ocluGroup);
    center = fullBox.getCenter(new THREE.Vector3());
  }
  const pivot = new THREE.Group();
  pivot.name = `tooth-${toothId}-oclu-pivot`;
  // Move child so its local origin is at center; place pivot at center
  ocluGroup.position.sub(center);
  pivot.position.copy(center);
  pivot.add(ocluGroup);
  // No roots/canals/implants are cloned for oclusal; nothing to hide
  // Apply simplified absolute + relative transform (keeps position)
  applyOcclusalTransform(toothId, pivot);
  toothGroupsOclu.set(toothId, pivot);
  if (isUpper(toothId)) ocluUpperGroup.add(pivot); else ocluLowerGroup.add(pivot);
  return group;
}

// Align only anterior teeth in occlusal view, using crown centers (ignore roots)
function alignOcclusalAnteriorByCrowns() {
  toothGroupsOclu.forEach((pivot, toothId) => {
  // Only incisors (centrais e laterais): 11,12,21,22,31,32,41,42
  const n = Number(toothId);
  const isIncisor = [11,12,21,22,31,32,41,42].includes(n);
  if (!isIncisor) return;
    const vest = toothGroups.get(toothId);
    if (!vest) return;
    const boxVest = computeCrownBox(vest);
    const boxOclu = computeCrownBox(pivot);
    if (!boxVest || !boxOclu) return;
    const cVest = boxVest.getCenter(new THREE.Vector3());
    const cOclu = boxOclu.getCenter(new THREE.Vector3());
    pivot.position.y += (cVest.y - cOclu.y);
    pivot.position.z += (cVest.z - cOclu.z);
  });
}

// Find the ancestor group that represents a single OBJ part load
function findPartRoot(node) {
  let n = node;
  while (n) {
    if (n.userData && n.userData.partName) return n;
    n = n.parent;
  }
  return null;
}

function colorPart(root, color) {
  root.traverse((n) => {
    if (n.isMesh && n.geometry) {
      setAllVertexColors(n.geometry, color);
    }
  });
}

// Removed unused framing helpers; we keep a single origin-centered framing function below

// Frame cameras so that the view is centered at the world origin (0,0,0)
function frameSceneToOrigin(sceneRef, camera, controls) {
  const box = new THREE.Box3().setFromObject(sceneRef);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const halfY = size.y * 0.5;
    const halfX = size.x * 0.5;
    const vFOV = (Math.PI * camera.fov) / 360;
    const distH = halfY / Math.tan(vFOV);
    const distW = halfX / (Math.tan(vFOV) * Math.max(0.0001, camera.aspect));
    const distance = Math.max(distH, distW) * 1.25;
    camera.up.set(0, 1, 0);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }
}

function reframeAll() {
  // Center all viewports on the world origin
  frameSceneToOrigin(scene, camVestUp, controlsVestUp);
  frameSceneToOrigin(scene, camVestLow, controlsVestLow);
  frameSceneToOrigin(sceneOclu, camOcluUp, controlsOcluUp);
  frameSceneToOrigin(sceneOclu, camOcluLow, controlsOcluLow);
}

// -------- Consolidated 2D Chart (Orthographic) --------
// Root group for chart rows
const chartRoot = new THREE.Group();
chartRoot.name = 'chart-root';
sceneChart.add(chartRoot);

// Utility: clone a node, but share geometry and material refs for color sync
function cloneShareGeoMat(node) {
  const nodeClone = node.clone(false);
  nodeClone.name = node.name;
  nodeClone.userData = { ...node.userData };
  if (node.isMesh) {
    const meshClone = new THREE.Mesh(node.geometry, node.material);
    meshClone.name = node.name;
    meshClone.position.copy(node.position);
    meshClone.quaternion.copy(node.quaternion);
    meshClone.scale.copy(node.scale);
    meshClone.layers.mask = node.layers.mask;
    meshClone.visible = node.visible;
    meshClone.userData = { ...node.userData };
    return meshClone;
  }
  nodeClone.position.copy(node.position);
  nodeClone.quaternion.copy(node.quaternion);
  nodeClone.scale.copy(node.scale);
  node.children.forEach((child) => {
    const c = cloneShareGeoMat(child);
    if (c) nodeClone.add(c);
  });
  nodeClone.layers.mask = node.layers.mask;
  nodeClone.visible = node.visible;
  return nodeClone;
}

let chartRows = null; // will hold the four row groups

function buildConsolidatedChart() {
  chartRoot.clear();
  // Create four row groups by cloning from existing scene roots
  const rowVestUp = cloneShareGeoMat(vestUpperGroup);
  rowVestUp.name = 'chart-row-vest-up';
  const rowOcluUp = cloneShareGeoMat(ocluUpperGroup);
  rowOcluUp.name = 'chart-row-oclu-up';
  const rowOcluLow = cloneShareGeoMat(ocluLowerGroup);
  rowOcluLow.name = 'chart-row-oclu-low';
  const rowVestLow = cloneShareGeoMat(vestLowerGroup);
  rowVestLow.name = 'chart-row-vest-low';
  chartRows = [rowVestUp, rowOcluUp, rowOcluLow, rowVestLow];
  chartRows.forEach(g => chartRoot.add(g));
  layoutChartRows();
  // Reaplicar filtros de visibilidade do menu (se existirem)
  if (typeof window !== 'undefined' && window.ComponentVisibility?.apply) {
    window.ComponentVisibility.apply();
  }
}

function getWorldBox(obj) {
  obj.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(obj);
}

// -------- Implant prototype (from tooth 11) and chart placement --------
let implantProtoPivot = null; // centered pivot with child meshes tagged as implante

async function loadImplantPrototype() {
  // Load both parts of tooth 11 implant and build a centered pivot group
  const files = ['IMP11_ABU.obj', 'IMP11_IMP.obj'];
  const raw = new THREE.Group(); raw.name = 'implant-proto-raw';
  for (const f of files) {
    try {
      const obj = await objLoader.loadAsync(f);
      obj.userData.partName = f;
      obj.traverse((n) => {
        if (n.isMesh) {
          // Share the base material to keep costs down
          const baseMatKey = 'std:vc:rough1:metal0:double';
          const materialCache = loadTooth._matCache || (loadTooth._matCache = new Map());
          let baseMaterial = materialCache.get(baseMatKey);
          if (!baseMaterial) {
            baseMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
            materialCache.set(baseMatKey, baseMaterial);
          }
          n.material = baseMaterial;
          ensureVertexColors(n.geometry);
          n.userData.partName = f;
          n.userData.type = 'implante';
        }
      });
      raw.add(obj);
    } catch (e) {
      console.warn('Implant load failed', f, e);
    }
  }
  if (raw.children.length === 0) return null;
  // Center raw at its bounding box center inside a pivot
  const bb = getWorldBox(raw);
  const center = bb.getCenter(new THREE.Vector3());
  const pivot = new THREE.Group();
  pivot.name = 'implant-proto-pivot';
  raw.position.sub(center);
  pivot.add(raw);
  // Determine main axis of the implant from its local AABB extents
  const size = bb.getSize(new THREE.Vector3());
  let protoAxis = new THREE.Vector3(0, 1, 0);
  if (size.x >= size.y && size.x >= size.z) protoAxis.set(1, 0, 0);
  else if (size.y >= size.x && size.y >= size.z) protoAxis.set(0, 1, 0);
  else protoAxis.set(0, 0, 1);
  pivot.userData.protoAxis = protoAxis.clone().normalize();
  implantProtoPivot = pivot;
  return pivot;
}

function findToothGroupInChart(toothId) {
  let found = null;
  chartRoot.traverse((n) => {
    if (!found && n.type === 'Group' && n.name === `tooth-${toothId}`) found = n;
  });
  return found;
}

function computeToothDirection(group) {
  // Direction from crown center toward overall group center approximates root axis
  const crownBox = computeCrownBox(group);
  const fullBox = getWorldBox(group);
  if (!crownBox || fullBox.isEmpty()) return null;
  const cc = crownBox.getCenter(new THREE.Vector3());
  const fc = fullBox.getCenter(new THREE.Vector3());
  const dir = fc.clone().sub(cc);
  if (dir.lengthSq() < 1e-6) return null;
  return { crownCenter: cc, dir: dir.normalize() };
}

function cloneImplantPivotSharing(node) {
  // Reuse existing helper to share geo/material where possible
  return cloneShareGeoMat(node);
}

function placeImplantsOnChart() {
  if (!implantProtoPivot) return;
  // Reference using tooth 11 in chart (prefer superior vestibular row)
  const refToothId = '11';
  const refGroup = findToothGroupInChart(refToothId) || null;
  if (!refGroup) return;
  const ref = computeToothDirection(refGroup);
  if (!ref) return;
  const protoAxis = implantProtoPivot.userData?.protoAxis || new THREE.Vector3(0,1,0);

  // Helper: create oriented instance and place near tooth using previous heuristic
  const createInitialPlaced = (toothGroup, opts = {}) => {
    const { impOnly = false } = opts;
    const data = computeToothDirection(toothGroup);
    if (!data) return null;
    const { crownCenter, dir } = data;
    const inst = cloneImplantPivotSharing(implantProtoPivot);
    // If only the implant (without abutment) is required, prune ABU nodes now
    if (impOnly) {
      const toRemove = [];
      inst.traverse((n) => {
        if (n.userData?.partName === 'IMP11_ABU.obj') toRemove.push(n);
      });
      toRemove.forEach((n) => n.parent && n.parent.remove(n));
    }
    const q = new THREE.Quaternion().setFromUnitVectors(protoAxis, dir);
    inst.quaternion.copy(q);
    // Heuristic initial offset along axis to get roughly under the crown
    const full = getWorldBox(toothGroup); const crown = computeCrownBox(toothGroup);
    let k = 3.0;
    if (full && crown) {
      const fullH = full.getSize(new THREE.Vector3()).length();
      const crownH = crown.getSize(new THREE.Vector3()).length();
      k = Math.max(2.0, (fullH - crownH) * 0.25);
    }
    inst.position.copy(crownCenter).add(dir.clone().multiplyScalar(k));
    return inst;
  };

  // Step 1: place for tooth 11 to measure constant deltaY between canal top and implant top
  const canalRefBox = computeComponentBox(refGroup, 'canal');
  if (!canalRefBox) return; // no canal => cannot determine constant
  const instRef = createInitialPlaced(refGroup);
  if (!instRef) return;
  instRef.name = `${refGroup.name}-implant`;
  refGroup.add(instRef);
  // Compute current delta after initial placement
  const impRefBox = getWorldBox(instRef);
  const deltaYConst = impRefBox.max.y - canalRefBox.max.y;

  // Helper to adjust an instance vertically so its top matches canalTop + deltaYConst
  const adjustInstanceTopTo = (instance, parentGroup, canalTopY, deltaY) => {
    const box = getWorldBox(instance);
    const currentTop = box.max.y;
    const targetTop = canalTopY + deltaY;
    const dy = targetTop - currentTop;
    if (Math.abs(dy) < 1e-6) return;
    // Translate by dy in world-Y: move the instance's center by (0, dy, 0)
    const center = box.getCenter(new THREE.Vector3());
    const newCenterWorld = center.clone(); newCenterWorld.y += dy;
    const centerLocal = parentGroup.worldToLocal(center.clone());
    const newCenterLocal = parentGroup.worldToLocal(newCenterWorld);
    const deltaLocal = newCenterLocal.sub(centerLocal);
    instance.position.add(deltaLocal);
  };

  // Adjust tooth 11 instance precisely to match the measured constant
  adjustInstanceTopTo(instRef, refGroup, canalRefBox.max.y, deltaYConst);

  // Step 2: iterate all tooth groups in chart and place/adjust instances
  const created = [{ inst: instRef, group: refGroup, id: refToothId }];
  chartRoot.traverse((n) => {
    if (n.type === 'Group' && /^tooth-\d{2}$/.test(n.name) && n !== refGroup) {
      const canalBox = computeComponentBox(n, 'canal');
      if (!canalBox) return; // skip if no canal data
      const id = (n.name.match(/^tooth-(\d{2})$/) || [null, null])[1] || null;
      const impOnly = id === '18' || id === '28';
      const inst = createInitialPlaced(n, { impOnly });
      if (!inst) return;
      inst.name = `${n.name}-implant`;
      n.add(inst);
      adjustInstanceTopTo(inst, n, canalBox.max.y, deltaYConst);
      created.push({ inst, group: n, id });
    }
  });

  // --- Overrides section (simple and applied after base positioning) ---
  const translateWorldY = (instance, parentGroup, dy) => {
    const box = getWorldBox(instance);
    const center = box.getCenter(new THREE.Vector3());
    const newCenterWorld = center.clone(); newCenterWorld.y += dy;
    const centerLocal = parentGroup.worldToLocal(center.clone());
    const newCenterLocal = parentGroup.worldToLocal(newCenterWorld);
    const deltaLocal = newCenterLocal.sub(centerLocal);
    instance.position.add(deltaLocal);
  };

  // 1) Todos os inferiores: offset -3 em Y (subir no layout atual)
  created.forEach(({ inst, group, id }) => {
    if (!id) return;
    const num = Number(id);
    const isLower = (31 <= num && num <= 38) || (41 <= num && num <= 48);
    if (isLower) {
      translateWorldY(inst, group, IMPLANT_LOWER_Y_OFFSET);
    }
  });

  // 2) Remoção do ABU já tratada na criação (impOnly em 18 e 28)

  // 3) Altura do implante do 11 deve ser a mesma do 21 (ajuste 11 para casar com 21)
  const item11 = created.find(x => x.id === '11');
  const item21 = created.find(x => x.id === '21');
  if (item11 && item21) {
    const top11 = getWorldBox(item11.inst).max.y;
    const top21 = getWorldBox(item21.inst).max.y;
    const dy = top21 - top11;
    if (Math.abs(dy) > 1e-6) {
      translateWorldY(item11.inst, item11.group, dy);
    }
  }

  // Apply current visibility filter so implants follow menu state
  if (typeof window !== 'undefined' && window.ComponentVisibility?.apply) {
    window.ComponentVisibility.apply();
  }
  return created;
}

function layoutChartRows() {
  if (!chartRows) return;
  // First, center each row around X and Y by subtracting its own center
  const boxes = chartRows.map(g => getWorldBox(g));
  boxes.forEach((box, i) => {
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    chartRows[i].position.x -= center.x;
    chartRows[i].position.y -= center.y;
    // Keep Z center; Ortho camera will handle depth
  });
  // Recompute boxes after centering
  const boxes2 = chartRows.map(g => getWorldBox(g));
  const heights = boxes2.map(b => b.isEmpty() ? 0 : (b.max.y - b.min.y));
  // Spacings: 1-2 and 3-4 use CHART_VERTICAL_SPACING; between 2-3 uses CHART_SUP_INF_OFFSET
  const s12 = CHART_VERTICAL_SPACING;
  const s23 = CHART_SUP_INF_OFFSET;
  const s34 = CHART_VERTICAL_SPACING;
  const spacings = [s12, s23, s34];
  const totalHeight = heights.reduce((a, h) => a + h, 0) + s12 + s23 + s34;
  let cursor = totalHeight * 0.5; // start from top
  for (let i = 0; i < chartRows.length; i++) {
    const h = heights[i];
    const centerY = cursor - h * 0.5;
    chartRows[i].position.y += centerY; // they were centered at 0 before
    cursor -= h + (i < spacings.length ? spacings[i] : 0);
  }
  // After arranging, keep chartRoot centered at origin in X and Y
  const allBox = getWorldBox(chartRoot);
  if (!allBox.isEmpty()) {
    const c = allBox.getCenter(new THREE.Vector3());
    chartRows.forEach(g => { g.position.x -= c.x; g.position.y -= c.y; });
  }
}

function updateChartCameraFrustum(w, h) {
  if (!w || !h) return;
  // Fit camera to the bounding box of chartRoot with a margin
  const box = getWorldBox(chartRoot);
  if (box.isEmpty()) {
    camChart.left = -w / 2; camChart.right = w / 2;
    camChart.top = h / 2; camChart.bottom = -h / 2;
    camChart.updateProjectionMatrix();
    return;
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = 20; // units of scene for padding
  let viewW = size.x + margin * 2;
  let viewH = size.y + margin * 2;
  const aspect = w / Math.max(1, h);
  const contentAspect = viewW / Math.max(1e-6, viewH);
  if (aspect > contentAspect) {
    // Wider viewport, expand width to match aspect
    viewW = viewH * aspect;
  } else {
    // Taller viewport, expand height
    viewH = viewW / aspect;
  }
  const halfW = viewW / 2;
  const halfH = viewH / 2;
  camChart.left = -halfW;
  camChart.right = halfW;
  camChart.top = halfH;
  camChart.bottom = -halfH;
  camChart.near = 0.1;
  camChart.far = 5000;
  camChart.position.set(center.x, center.y, 1000);
  camChart.lookAt(center.x, center.y, 0);
  camChart.updateProjectionMatrix();
}


function clearMarks() {
  // Remove transient 3D markers
  for (const m of transientMarkers.splice(0)) {
    scene.remove(m);
  }
  // Reset vertex colors to base grey for every mesh
  const restoreColor = (node) => {
    if (node.isMesh && node.geometry) {
      setAllVertexColors(node.geometry, BASE_GREY);
    }
  };
  scene.traverse(restoreColor);
  sceneOclu.traverse(restoreColor);
  statusEl.textContent = 'Marcas limpas';
}

btnClear?.addEventListener('click', clearMarks);

// Toggle 3D views (conventional) visibility and lazy attachment
let conventionalViewsVisible = false;
function setConventionalViewsVisible(visible) {
  conventionalViewsVisible = visible;
  [viewVestUp, viewVestLow, viewOcluUp, viewOcluLow].forEach(el => {
    if (!el) return;
    el.classList.toggle('is-hidden', !visible);
  });
  if (visible) {
    attachConventionalViewRenderers();
    reframeAll();
    resize();
  } else {
    resize();
  }
}

btnToggle3D?.addEventListener('click', () => {
  const next = !conventionalViewsVisible;
  setConventionalViewsVisible(next);
  btnToggle3D.textContent = next ? 'Ocultar vistas 3D' : 'Mostrar vistas 3D';
});

// Inicialmente oculto
setConventionalViewsVisible(false);

// No offset UI; offsets are fixed in code


function animate() {
  requestAnimationFrame(animate);
  controlsVestUp.update();
  controlsVestLow.update();
  controlsOcluUp.update();
  controlsOcluLow.update();
  // Vestibular Upper
  if (conventionalViewsVisible && rendererVestUp.domElement.parentElement) {
    vestUpperGroup.visible = true; vestLowerGroup.visible = false;
    rendererVestUp.render(scene, camVestUp);
  }
  // Vestibular Lower
  if (conventionalViewsVisible && rendererVestLow.domElement.parentElement) {
    vestUpperGroup.visible = false; vestLowerGroup.visible = true;
    rendererVestLow.render(scene, camVestLow);
  }
  // Oclusal Upper
  if (conventionalViewsVisible && rendererOcluUp.domElement.parentElement) {
    ocluUpperGroup.visible = true; ocluLowerGroup.visible = false;
    rendererOcluUp.render(sceneOclu, camOcluUp);
  }
  // Oclusal Lower
  if (conventionalViewsVisible && rendererOcluLow.domElement.parentElement) {
    ocluUpperGroup.visible = false; ocluLowerGroup.visible = true;
    rendererOcluLow.render(sceneOclu, camOcluLow);
  }
  // Restore visibility so layout-dependent ops still see all
  vestUpperGroup.visible = true; vestLowerGroup.visible = true;
  ocluUpperGroup.visible = true; ocluLowerGroup.visible = true;
  // Consolidated Chart
  if (viewChart) {
    rendererChart.render(sceneChart, camChart);
  }
}

(async () => {
  try {
    resize();
    const manifest = await loadManifest();
    const ids = Object.keys(manifest.teeth).sort((a, b) => Number(a) - Number(b));
    // Load all in sequence for simplicity; can parallelize later
    for (const id of ids) {
      statusEl.textContent = `Carregando dente ${id}…`;
      await loadTooth(id, manifest);
    }
  statusEl.textContent = 'Odontograma carregado. Clique para marcar.';
  // Layers: vestibular shows roots; oclusal hides roots
  camVestUp.layers.enable(0); camVestUp.layers.enable(1);
  camVestLow.layers.enable(0); camVestLow.layers.enable(1);
  camOcluUp.layers.enable(0); camOcluUp.layers.disable(1);
  camOcluLow.layers.enable(0); camOcluLow.layers.disable(1);
  // Align incisors in occlusal/lingual based solely on crown centers
  alignOcclusalAnteriorByCrowns();
  // Apply initial arch offsets (0 by default) and frame all
  applyArchOffsets();
  reframeAll();
  // Build and layout the consolidated 2D chart now that teeth are loaded and aligned
  buildConsolidatedChart();
  // Load implant prototype and place instances on chart for all teeth
  try {
    await loadImplantPrototype();
    placeImplantsOnChart();
  } catch (e) {
    console.warn('Implant prototype unavailable or placement failed', e);
  }
  // Ensure camera fits chart
  const rc = viewChart?.getBoundingClientRect();
  if (rc) updateChartCameraFrustum(rc.width, rc.height);
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Erro: ' + e.message;
  } finally {
    animate();
  }
})();

// -------- Visibility control API (chart-only) --------
// Expose a global function for the UI menu to call
if (typeof window !== 'undefined') {
  window.setComponentTypeVisibility = function setComponentTypeVisibility(type, isVisible) {
    // Only affect consolidated chart meshes
    const desired = String(type || '').toLowerCase();
    chartRoot.traverse((n) => {
      if (n.isMesh && n.userData && n.userData.type) {
        const t = String(n.userData.type).toLowerCase();
        if (t === desired) {
          n.visible = !!isVisible;
        }
      }
    });
    // Optionally hide empty part groups if all children are invisible
    chartRoot.traverse((n) => {
      if (!n.isMesh && n.children && n.children.length) {
        let anyVisible = false;
        for (const c of n.children) { if (c.visible) { anyVisible = true; break; } }
        // Do not force-hide top-level rows; only per-part groups (those that came from OBJ)
        if (n.userData && n.userData.partName) {
          n.visible = anyVisible;
        }
      }
    });
  };
}
