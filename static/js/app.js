// ES module loading of Three.js + helpers from CDN for simplicity
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// Depuração: alterna a exibição de helpers (ex.: AxesHelper). Defina false para desativar.
const isDebugMode = true;

const statusEl = document.getElementById('status');
const btnClear = document.getElementById('btn-clear');
// Four viewport containers from HTML
const viewVestUp = document.getElementById('viewport-vest-up');
const viewVestLow = document.getElementById('viewport-vest-low');
const viewOcluUp = document.getElementById('viewport-oclu-up');
const viewOcluLow = document.getElementById('viewport-oclu-low');

// Two scenes to allow different transforms per view; geometries/materials are shared
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
const sceneOclu = new THREE.Scene();
sceneOclu.background = new THREE.Color(0x0b0f14);
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

// Fixed absolute Y offsets per arch (top of native coordinates)
// Per request: upper Y = -20, lower Y = 20
const archOffsets = {
  upperY: -20,
  lowerY: 20,
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

// Renderers (one per viewport)
const rendererVestUp = new THREE.WebGLRenderer({ antialias: true });
const rendererVestLow = new THREE.WebGLRenderer({ antialias: true });
const rendererOcluUp = new THREE.WebGLRenderer({ antialias: true });
const rendererOcluLow = new THREE.WebGLRenderer({ antialias: true });
[rendererVestUp, rendererVestLow, rendererOcluUp, rendererOcluLow].forEach(r => r.setPixelRatio(Math.min(window.devicePixelRatio, 2)));
viewVestUp.appendChild(rendererVestUp.domElement);
viewVestLow.appendChild(rendererVestLow.domElement);
viewOcluUp.appendChild(rendererOcluUp.domElement);
viewOcluLow.appendChild(rendererOcluLow.domElement);

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
  rendererVestUp.setSize(rVU.width, rVU.height, false);
  rendererVestLow.setSize(rVL.width, rVL.height, false);
  rendererOcluUp.setSize(rOU.width, rOU.height, false);
  rendererOcluLow.setSize(rOL.width, rOL.height, false);
  camVestUp.aspect = rVU.width / Math.max(1, rVU.height);
  camVestLow.aspect = rVL.width / Math.max(1, rVL.height);
  camOcluUp.aspect = rOU.width / Math.max(1, rOU.height);
  camOcluLow.aspect = rOL.width / Math.max(1, rOL.height);
  camVestUp.updateProjectionMatrix();
  camVestLow.updateProjectionMatrix();
  camOcluUp.updateProjectionMatrix();
  camOcluLow.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// Raycasters
const raycasterVestUp = new THREE.Raycaster();
const raycasterVestLow = new THREE.Raycaster();
const raycasterOcluUp = new THREE.Raycaster();
const raycasterOcluLow = new THREE.Raycaster();

// Tooth registry
const toothGroups = new Map(); // toothId -> THREE.Group (vestibular)
const toothGroupsOclu = new Map(); // toothId -> THREE.Group (oclusal/lingual)
const transientMarkers = [];   // 3D fallback markers to clear
// Base colors (normalized 0..1)
const BASE_GREY = { r: 240 / 255, g: 240 / 255, b: 240 / 255 }; // ~0xf0f0f0
const BLUE = { r: 30 / 255, g: 144 / 255, b: 1.0 }; // dodgerblue
const PURPLE = { r: 153 / 255, g: 50 / 255, b: 204 / 255 }; // purple for part coloring

// Debug palette removed for per-arch colors; keep neutral base grey only

function getUVPixel(uv, canvas) {
  const u = uv.x;
  const v = uv.y;
  const x = Math.floor(u * canvas.width);
  const y = Math.floor((1 - v) * canvas.height); // flip V
  return { x, y };
}

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

function setupPicking(renderer, camera, raycaster, which) {
  renderer.domElement.addEventListener('pointerdown', (ev) => {
    // Only left click paints a single face
    if (ev.button !== 0) return;
    const ndc = screenToNDC(ev, renderer);
    raycaster.setFromCamera(ndc, camera);
    const roots = which === 'vest-up' ? [vestUpperGroup]
      : which === 'vest-low' ? [vestLowerGroup]
      : which === 'oclu-up' ? [ocluUpperGroup]
      : [ocluLowerGroup];
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
  });
}
setupPicking(rendererVestUp, camVestUp, raycasterVestUp, 'vest-up');
setupPicking(rendererVestLow, camVestLow, raycasterVestLow, 'vest-low');
setupPicking(rendererOcluUp, camOcluUp, raycasterOcluUp, 'oclu-up');
setupPicking(rendererOcluLow, camOcluLow, raycasterOcluLow, 'oclu-low');

// Right-click paint mode: if started over a tooth, freeze camera and paint while moving
function setupPainter(renderer, camera, raycaster, which, controls) {
  let painting = false;
  // prevent context menu on right-click over canvas
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  const getRoots = () => (
    which === 'vest-up' ? [vestUpperGroup]
    : which === 'vest-low' ? [vestLowerGroup]
    : which === 'oclu-up' ? [ocluUpperGroup]
    : [ocluLowerGroup]
  );

  const paintAtEvent = (ev) => {
    const ndc = screenToNDC(ev, renderer);
    raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(getRoots(), true);
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
  const hits = raycaster.intersectObjects(getRoots(), true);
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
setupPainter(rendererVestUp, camVestUp, raycasterVestUp, 'vest-up', controlsVestUp);
setupPainter(rendererVestLow, camVestLow, raycasterVestLow, 'vest-low', controlsVestLow);
setupPainter(rendererOcluUp, camOcluUp, raycasterOcluUp, 'oclu-up', controlsOcluUp);
setupPainter(rendererOcluLow, camOcluLow, raycasterOcluLow, 'oclu-low', controlsOcluLow);

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

async function loadTooth(toothId, manifest) {
  const entry = manifest.teeth[toothId];
  if (!entry) throw new Error(`Tooth ${toothId} não encontrado no manifesto`);
  const group = new THREE.Group();
  group.name = `tooth-${toothId}`;

  const parts = [
    ...(entry.C || []),
    ...(entry.R || []),
    ...(entry.N || []),
  ];

  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide });

  // Load sequentially to keep it simple; can be parallelized if needed
  for (const fname of parts) {
    try {
      const obj = await objLoader.loadAsync(fname);
      // Tag this loaded OBJ group with partName so we can color whole part later
      obj.userData.partName = fname;
      obj.traverse((node) => {
        if (node.isMesh) {
          const mat = baseMaterial.clone();
          node.material = mat; // per-mesh material clone
          ensureVertexColors(node.geometry);
          node.userData.partName = fname;
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
  group.children.forEach((child) => {
    const c = cloneNodeForOclu(child);
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
  // Hide roots in occlusal clone
  pivot.traverse((n) => {
    if (n.isMesh) {
      const p = n.userData?.partName || '';
      const isRoot = /\bR_/i.test(p) || /Raiz|Canal/i.test(p);
      if (isRoot) n.visible = false;
    }
  });
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

function frameScene(camera, controls) {
  const box = new THREE.Box3().setFromObject(scene);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    const fitHeightDistance = size / (2 * Math.tan((Math.PI * camera.fov) / 360));
    const fitWidthDistance = fitHeightDistance / camera.aspect;
    const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.2;
    camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.4, distance));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
  }
}

function frameSceneTopPlan(camera, controls) {
  // Enquadra em vista de planta (olhando do +Y pro centro), mantendo Z como up
  const box = new THREE.Box3().setFromObject(sceneOclu);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.z) * 0.6;
    const distance = radius / Math.tan((Math.PI * camera.fov) / 360);
    camera.position.set(center.x, center.y + distance * 1.2, center.z);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
  }
}

function frameSceneFront(sceneRef, camera, controls) {
  // Enquadra a cena alinhando a câmera ao longo do eixo Z (frontal)
  const box = new THREE.Box3().setFromObject(sceneRef);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const halfY = size.y * 0.5;
    const halfX = size.x * 0.5;
    const vFOV = (Math.PI * camera.fov) / 360; // fov/2 em radianos
    let distH = halfY / Math.tan(vFOV);
    let distW = halfX / (Math.tan(vFOV) * Math.max(0.0001, camera.aspect));
    const distance = Math.max(distH, distW) * 1.2;
  camera.up.set(0, 1, 0);
  camera.position.set(center.x, center.y, center.z + distance); // posição em +Z para ver de frente
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
  }
}

function frameGroupFront(group, camera, controls) {
  const box = new THREE.Box3().setFromObject(group);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const halfY = size.y * 0.5;
    const halfX = size.x * 0.5;
    const vFOV = (Math.PI * camera.fov) / 360;
    let distH = halfY / Math.tan(vFOV);
    let distW = halfX / (Math.tan(vFOV) * Math.max(0.0001, camera.aspect));
    const distance = Math.max(distH, distW) * 1.25;
    camera.up.set(0, 1, 0);
    camera.position.set(center.x, center.y, center.z + distance);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
  }
}

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

// No offset UI; offsets are fixed in code


function animate() {
  requestAnimationFrame(animate);
  controlsVestUp.update();
  controlsVestLow.update();
  controlsOcluUp.update();
  controlsOcluLow.update();
  // Vestibular Upper
  vestUpperGroup.visible = true; vestLowerGroup.visible = false;
  rendererVestUp.render(scene, camVestUp);
  // Vestibular Lower
  vestUpperGroup.visible = false; vestLowerGroup.visible = true;
  rendererVestLow.render(scene, camVestLow);
  // Oclusal Upper
  ocluUpperGroup.visible = true; ocluLowerGroup.visible = false;
  rendererOcluUp.render(sceneOclu, camOcluUp);
  // Oclusal Lower
  ocluUpperGroup.visible = false; ocluLowerGroup.visible = true;
  rendererOcluLow.render(sceneOclu, camOcluLow);
  // Restore visibility so layout-dependent ops still see all
  vestUpperGroup.visible = true; vestLowerGroup.visible = true;
  ocluUpperGroup.visible = true; ocluLowerGroup.visible = true;
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
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Erro: ' + e.message;
  } finally {
    animate();
  }
})();
