import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

const viewChart = document.getElementById('viewport-chart');
const statusEl = document.getElementById('file-status');
const statusList = document.getElementById('status-list');
const statusSummary = document.getElementById('status-summary');
const btnClearLog = document.getElementById('btn-clear-log');
const btnCopyLog = document.getElementById('btn-copy-log');

const loaderLog = [];
function logInfo(msg) { loaderLog.push({ level: 'info', msg }); appendLogItem('info', msg); }
function logWarn(msg) { loaderLog.push({ level: 'warn', msg }); appendLogItem('warn', msg); }
function logError(msg) { loaderLog.push({ level: 'error', msg }); appendLogItem('error', msg); }
function appendLogItem(level, msg) {
  if (!statusList) return;
  const li = document.createElement('li');
  li.textContent = `[${level.toUpperCase()}] ${msg}`;
  li.className = `log-${level}`;
  statusList.appendChild(li);
}
function clearLog() {
  loaderLog.length = 0;
  if (statusList) statusList.innerHTML = '';
  if (statusSummary) statusSummary.textContent = '';
}
btnClearLog?.addEventListener('click', clearLog);
btnCopyLog?.addEventListener('click', () => {
  const text = loaderLog.map(l => `[${l.level.toUpperCase()}] ${l.msg}`).join('\n');
  navigator.clipboard?.writeText(text);
});
const inputFile = document.getElementById('json-file');

// Scene and renderer for the consolidated chart only
const sceneChart = new THREE.Scene();
sceneChart.background = new THREE.Color(0x0b0f14);
const hemiC = new THREE.HemisphereLight(0xffffff, 0x202020, 0.9);
sceneChart.add(hemiC);
const dirC1 = new THREE.DirectionalLight(0xffffff, 0.9);
dirC1.position.set(50, 80, 100);
sceneChart.add(dirC1);
const dirC2 = new THREE.DirectionalLight(0xffffff, 0.5);
dirC2.position.set(-60, -40, -80);
sceneChart.add(dirC2);


const camChart = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 5000);
camChart.position.set(0, 0, 1000);
camChart.lookAt(0, 0, 0);

const camOcluUp = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
const camOcluLow = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
camOcluUp.position.set(0, 50, 150); camOcluUp.lookAt(0, 0, 0);
camOcluLow.position.copy(camOcluUp.position); camOcluLow.lookAt(0, 0, 0);

const rendererChart = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
if (viewChart) viewChart.appendChild(rendererChart.domElement);

const chartRoot = new THREE.Group();
chartRoot.name = 'chart-root';
sceneChart.add(chartRoot);


// OBJ loader and simple material/geometry caches
const objLoader = new OBJLoader();
objLoader.setPath('/models/');
const objCache = new Map(); // filename -> processed THREE.Group
const materialCache = new Map();

function getBaseMaterial() {
  const key = 'std:vc:rough1:metal0:double';
  if (materialCache.has(key)) return materialCache.get(key);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
  materialCache.set(key, mat);
  return mat;
}

function ensureVertexColors(geometry) {
  const g = geometry; if (!g || !g.attributes) return;
  const position = g.getAttribute('position');
  const vcount = position ? position.count : 0;
  let colorAttr = g.getAttribute('color');
  if (!colorAttr || colorAttr.count !== vcount) {
    const arr = new Float32Array(vcount * 3);
    for (let i = 0; i < vcount; i++) {
      arr[i * 3 + 0] = 240 / 255; // base grey
      arr[i * 3 + 1] = 240 / 255;
      arr[i * 3 + 2] = 240 / 255;
    }
    colorAttr = new THREE.BufferAttribute(arr, 3);
    g.setAttribute('color', colorAttr);
  }
}

function toBasename(name) {
  if (!name) return name;
  // If absolute URL, return as-is
  if (/^https?:\/\//i.test(name)) return name;
  // Strip any leading directory components
  const parts = String(name).split(/[/\\]+/);
  return parts[parts.length - 1];
}

async function loadObjProcessed(filename, typeHint) {
  // Return a clone from cache when available
  filename = toBasename(filename);
  if (!/\.obj$/i.test(filename)) filename = `${filename}.obj`;
  const cache = objCache.get(filename);
  if (cache) return cache.clone(true);
  let obj;
  try {
    obj = await objLoader.loadAsync(filename);
  } catch (e) {
    logError(`Falha ao carregar OBJ: ${filename}`);
    throw e;
  }
  obj.userData.partName = filename;
  const baseMat = getBaseMaterial();
  obj.traverse((n) => {
    if (n.isMesh) {
      n.material = baseMat;
      ensureVertexColors(n.geometry);
      n.userData.partName = filename;
      if (typeHint) n.userData.type = String(typeHint).toLowerCase();
    }
  });
  objCache.set(filename, obj);
  return obj.clone(true);
}

function resize() {
  if (!viewChart) return;
  const r = viewChart.getBoundingClientRect();
  rendererChart.setSize(r.width, r.height, false);
  // Fit to content if available
  const box = new THREE.Box3().setFromObject(chartRoot);
  let w = r.width, h = r.height;
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const margin = 20;
    let viewW = size.x + margin * 2;
    let viewH = size.y + margin * 2;
    const aspect = r.width / Math.max(1, r.height);
    const contentAspect = viewW / Math.max(1e-6, viewH);
    if (aspect > contentAspect) viewW = viewH * aspect; else viewH = viewW / aspect;
    camChart.left = -viewW / 2; camChart.right = viewW / 2;
    camChart.top = viewH / 2; camChart.bottom = -viewH / 2;
    camChart.position.set(center.x, center.y, 1000);
    camChart.lookAt(center.x, center.y, 0);
  }
  camChart.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function animate() {
  requestAnimationFrame(animate);
  rendererChart.render(sceneChart, camChart);
}
animate();

function setObjectTRSLocal(obj, t) {
  if (!t) return;
  const pos = t.transformLocal?.position || t.position;
  const rot = t.transformLocal?.rotation || t.rotation;
  const scl = t.transformLocal?.scale || t.scale;
  if (pos) obj.position.set(pos.x, pos.y, pos.z);
  if (rot) obj.rotation.set(rot.x, rot.y, rot.z, rot.order || 'XYZ');
  if (scl) obj.scale.set(scl.x ?? 1, scl.y ?? 1, scl.z ?? 1);
}

function setObjectTRSWorld(obj, parent, t) {
  if (!t) return;
  const pos = t.transformWorld?.position || t.position;
  const rot = t.transformWorld?.rotation || t.rotation;
  const scl = t.transformWorld?.scale || t.scale;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1,1,1);
  if (rot) q.setFromEuler(new THREE.Euler(rot.x, rot.y, rot.z, rot.order || 'XYZ'));
  if (pos) obj.position.set(pos.x, pos.y, pos.z);
  if (scl) s.set(scl.x ?? 1, scl.y ?? 1, scl.z ?? 1);
  m.compose(obj.position, q, s);
  parent.updateWorldMatrix(true, true);
  const invParent = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const localM = new THREE.Matrix4().multiplyMatrices(invParent, m);
  const lp = new THREE.Vector3(); const lq = new THREE.Quaternion(); const ls = new THREE.Vector3();
  localM.decompose(lp, lq, ls);
  obj.position.copy(lp); obj.quaternion.copy(lq); obj.rotation.setFromQuaternion(lq, 'XYZ'); obj.scale.copy(ls);
}

async function buildFromLayout(layout) {
  // Clear chart
  chartRoot.clear();
  const rows = layout?.views?.chart?.rows || {};
  const teeth = layout?.views?.chart?.teeth || {};
  const implants = layout?.views?.chart?.implants || {};
  // Consolidated chart holds both vestibular and occlusal rows

  // Recreate rows (vestibular up, oclusal up, oclusal low, vestibular low)
  const rowGroups = {};
  const toothIndexByRow = new Map(); // rowName -> Map(toothId -> [groups])
  Object.entries(rows).forEach(([name, tr]) => {
    const g = new THREE.Group();
    g.name = name;
    // Always apply absolute/world transform from JSON
    setObjectTRSWorld(g, chartRoot, tr);
    chartRoot.add(g); rowGroups[name] = g;
  });

  // Create simple box placeholders for parts by type/color
  const typeColor = {
    dente: 0xffffff,
    raiz: 0x999999,
    canal: 0x00a2ff,
    nucleo: 0x8a2be2,
    implante: 0xffc107,
    desconhecido: 0x888888,
  };
  const unitGeo = new THREE.BoxGeometry(1, 1, 1);

  const makePart = (type) => new THREE.Mesh(
    unitGeo,
    new THREE.MeshStandardMaterial({ color: typeColor[type] || typeColor.desconhecido })
  );

  // Teeth with actual OBJ parts
  let totalParts = 0, failedParts = 0;
  const rowCounts = new Map();
  let worldUsed = 0, localUsed = 0;
  for (const [toothId, entries] of Object.entries(teeth)) {
    for (const entry of entries) {
      let parent = rowGroups[entry.inRow];
      if (!parent) {
        logWarn(`Linha ausente no JSON.rows: ${entry.inRow}. Criando placeholder.`);
        parent = new THREE.Group(); parent.name = entry.inRow || 'row-unknown';
        chartRoot.add(parent);
        rowGroups[parent.name] = parent;
      }
  const toothG = new THREE.Group();
      const isOclu = typeof entry.inRow === 'string' && entry.inRow.toLowerCase().includes('oclu');
      toothG.name = isOclu ? `tooth-${toothId}-oclu-pivot` : `tooth-${toothId}`;
    // Prefer absolute transform from JSON
    if (entry.transformWorld) { setObjectTRSWorld(toothG, parent, entry); worldUsed++; }
    else if (entry.transformLocal) { setObjectTRSLocal(toothG, entry); localUsed++; }
      parent.add(toothG);
      rowCounts.set(parent.name, (rowCounts.get(parent.name) || 0) + 1);
  // index for implant parenting later
  const rowMap = toothIndexByRow.get(parent.name) || new Map();
  const list = rowMap.get(toothId) || [];
  list.push(toothG);
  rowMap.set(toothId, list);
  toothIndexByRow.set(parent.name, rowMap);
      // load and attach parts
      const parts = entry.parts || [];
      for (const p of parts) {
        totalParts++;
        try {
          const partObj = await loadObjProcessed(p.id, p.type);
      // Prefer absolute/world transform for parts
      if (p.transformWorld) setObjectTRSWorld(partObj, toothG, p);
      else if (p.transformLocal) setObjectTRSLocal(partObj, p);
          // tipagem
          partObj.traverse((n) => { if (n.isMesh) n.userData.type = p.type || n.userData.type; });
          toothG.add(partObj);
        } catch (e) {
          failedParts++;
          logWarn(`Parte não carregada: ${p.id}`);
        }
      }
    }
  }

  // Implants: load listed parts
  let totalImpParts = 0, failedImpParts = 0;
  for (const [toothId, entries] of Object.entries(implants)) {
    for (const entry of entries) {
      const parentTooth = toothIndexByRow.get(entry.inRow)?.get(toothId)?.[0] || null;
      if (!parentTooth) {
        logWarn(`Implante ignorado: dente ${toothId} sem grupo correspondente na linha ${entry.inRow}.`);
        continue;
      }
      const parent = parentTooth;
      const g = new THREE.Group(); g.name = `tooth-${toothId}-implant`;
      // Prefer absolute/world transform for implant group
      if (entry.transformWorld) setObjectTRSWorld(g, parent, entry); else if (entry.transformLocal) setObjectTRSLocal(g, entry);
      parent.add(g);
      const parts = entry.parts || [];
    for (const fname of parts) {
        try {
          const partObj = await loadObjProcessed(fname, 'implante');
      // As partes do implante herdam a TRS do grupo do implante (entry);
      // não aplicar transform novamente no filho para evitar duplicação.
          g.add(partObj);
        } catch (e) {
    failedImpParts++;
    logWarn(`Implante não carregado: ${fname}`);
        }
      }
    }
  }

  resize();
  // Apply current visibility defaults if menu module is present
  if (typeof window !== 'undefined' && window.ComponentVisibility?.apply) {
    window.ComponentVisibility.apply();
  }

  // Compatibility fallback: if occlusal rows exist but have 0 teeth and the JSON has a legacy views.oclusal section, populate chart rows from it
  try {
    const ocluLegacy = layout?.views?.oclusal;
    if (ocluLegacy) {
      const hasRow = (n) => Object.prototype.hasOwnProperty.call(rowGroups, n);
      const countFor = (n) => rowCounts.get(n) || 0;
      const needUp = hasRow('chart-row-oclu-up') && countFor('chart-row-oclu-up') === 0;
      const needLow = hasRow('chart-row-oclu-low') && countFor('chart-row-oclu-low') === 0;
      if (needUp || needLow) {
        logInfo('Preenchendo linhas oclusais a partir de views.oclusal (compatibilidade).');
        await appendOclusalIntoChart(ocluLegacy, rowGroups, rowCounts);
      }
    }
  } catch (e) {
    logWarn('Falha ao aplicar fallback para oclusal.');
  }

  // Summary
  const okParts = totalParts - failedParts;
  const okImp = totalImpParts - failedImpParts;
  const rowsBreakdown = Array.from(rowCounts.entries()).map(([n,c]) => `${n}:${c}`).join(', ');
  const summary = `Partes: ${okParts}/${totalParts} carregadas; Implantes: ${okImp}/${totalImpParts} carregadas. Dentes por linha: ${rowsBreakdown || '—'}; TRS usadas (world/local): ${worldUsed}/${localUsed}`;
  if (statusSummary) statusSummary.textContent = summary;


async function appendOclusalIntoChart(oclu, rowGroups, rowCounts) {
  const upper = oclu.upper?.teeth || {};
  const lower = oclu.lower?.teeth || {};
  const addToRow = async (teethMap, rowName) => {
    let parent = rowGroups[rowName];
    if (!parent) {
      parent = new THREE.Group(); parent.name = rowName; chartRoot.add(parent); rowGroups[rowName] = parent;
    }
    for (const [toothId, node] of Object.entries(teethMap)) {
      const entries = Array.isArray(node)
        ? node
        : [{ parts: node.parts || [], transformLocal: node.transformLocal, transformWorld: node.transformWorld }];
      for (const entry of entries) {
        const pivot = new THREE.Group(); pivot.name = `tooth-${toothId}-oclu-pivot`;
        if (entry.transformLocal) setObjectTRSLocal(pivot, entry); else if (entry.transformWorld) setObjectTRSWorld(pivot, parent, entry);
        parent.add(pivot);
        rowCounts.set(rowName, (rowCounts.get(rowName) || 0) + 1);
        for (const p of (entry.parts || [])) {
          try {
            const obj = await loadObjProcessed(p.id, p.type);
            if (p.transformLocal) setObjectTRSLocal(obj, p); else if (p.transformWorld) setObjectTRSWorld(obj, pivot, p);
            obj.traverse((n) => { if (n.isMesh) n.userData.type = p.type || n.userData.type; });
            pivot.add(obj);
          } catch (e) {
            logWarn(`Oclusal parte não carregada: ${p.id}`);
          }
        }
      }
    }
  };
  await addToRow(upper, 'chart-row-oclu-up');
  await addToRow(lower, 'chart-row-oclu-low');
}
}

// Visibility API for shared menu module
if (typeof window !== 'undefined') {
  window.setComponentTypeVisibility = function(type, isVisible) {
    const desired = String(type || '').toLowerCase();
    chartRoot.traverse((n) => {
      if (n.isMesh && n.userData?.type) {
        if (String(n.userData.type).toLowerCase() === desired) n.visible = !!isVisible;
      }
    });
  };
}

// Bind file loader
inputFile?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
  clearLog();
    const text = await file.text();
    const json = JSON.parse(text);
  statusEl.textContent = `Arquivo: ${file.name} (${file.size} bytes)`;
  await buildFromLayout(json);
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Falha ao ler/parsing do JSON';
  logError('Falha ao ler/parsing do JSON');
  }
});
