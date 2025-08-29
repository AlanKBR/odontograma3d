import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { openToothViewer } from '/static/js/tooth_viewer.js';

// Basic scene
const container = document.getElementById('viewport-novo');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const hemi = new THREE.HemisphereLight(0xf0f0ff, 0x0c0c0c, 0.15);
scene.add(hemi);
const d1 = new THREE.DirectionalLight(0xffffff, 1.7); d1.position.set(240,180,40); scene.add(d1);
const d2 = new THREE.DirectionalLight(0xffe0c0, 0.55); d2.position.set(-240,-180,-60); scene.add(d2);

// Ortho camera and renderer
const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Reusable temp objects to reduce allocations
const _tmpBox = new THREE.Box3();
const _tmpV1 = new THREE.Vector3();
const _tmpV2 = new THREE.Vector3();

function getWorldBox(node){ node.updateWorldMatrix(true,true); return _tmpBox.setFromObject(node); }

function fitOrthoTo(node){
  const rect = container.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  const b = getWorldBox(node);
  const aspect = rect.width / Math.max(1, rect.height);
  if (b.isEmpty()) {
    camera.left = -rect.width/2; camera.right = rect.width/2;
    camera.top = rect.height/2; camera.bottom = -rect.height/2;
  } else {
  const s = b.getSize(_tmpV1);
  const c = b.getCenter(_tmpV2);
    const margin = 20;
    let w = s.x + margin*2; let h = s.y + margin*2;
    const contentAspect = w / Math.max(1e-6, h);
    if (aspect > contentAspect) w = h * aspect; else h = w / aspect;
    camera.left = -w/2; camera.right = w/2; camera.top = h/2; camera.bottom = -h/2;
    camera.position.set(c.x, c.y, 1000);
    camera.lookAt(c.x, c.y, 0);
  }
  camera.near = 0.1; camera.far = 5000; camera.updateProjectionMatrix();
}

function onResize(){ fitOrthoTo(scene); scheduleRender(); }
window.addEventListener('resize', onResize);

// On-demand rendering (no continuous RAF)
let _rafId = 0;
function renderNow(){ _rafId = 0; renderer.render(scene, camera); }
function scheduleRender(){ if (_rafId) return; _rafId = requestAnimationFrame(renderNow); }

// Visibility control
function getEnabledTypes(){
  const form = document.getElementById('novo-visibility-form');
  const enabled = new Set(); if (!form) return enabled;
  form.querySelectorAll('input[type="checkbox"]').forEach(cb=>{ const t = cb.getAttribute('data-type'); if (cb.checked) enabled.add(t); });
  return enabled;
}
// Type inference by name when userData.type is missing
function parseTypeFromName(name){
  const s = String(name||'').toLowerCase();
  if (/canal/.test(s)) return 'canal';
  if (/raiz|raíz/.test(s)) return 'raiz';
  if (/nuc|núcleo|nucleo/.test(s)) return 'nucleo';
  if (/implante|implant|abu/.test(s)) return 'implante';
  return 'dente';
}
(function wireVisibility(){ const form = document.getElementById('novo-visibility-form'); if (form) form.addEventListener('change', applyVisibilityMapped); })();

// Efficient mapping for toggles
const mapped = { dente: [], raiz: [], canal: [], nucleo: [], implante: [] };

function mapSceneByType(root){
  for (const k of Object.keys(mapped)) mapped[k].length = 0;
  root.traverse((n)=>{
    if (!n.isMesh) return;
    const t0 = String(n.userData?.type||'').toLowerCase();
    const t = t0 || parseTypeFromName(n.name);
    if (t && mapped[t]) mapped[t].push(n);
  });
}

function applyVisibilityMapped(){
  const enabled = getEnabledTypes();
  for (const [k, arr] of Object.entries(mapped)) {
    const vis = enabled.has(k);
    for (const m of arr) m.visible = vis;
  }
  scheduleRender();
}

async function loadGLB(){
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync('/static/models/odontograma.glb');
    scene.add(gltf.scene);
    mapSceneByType(gltf.scene);
    applyVisibilityMapped();
    fitOrthoTo(scene);
  scheduleRender();
  // After loading, enable picking for dblclick
  enableToothDoubleClick(gltf.scene);
  } catch (err) {
    console.error('Falha ao carregar odontograma.glb:', err);
  }
}

// Boot
(function init(){
  const rect = container.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  loadGLB();
})();

// ------------------------
// Picking + Double Click -> open viewer
// ------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function getToothRootFromNode(node){
  // Try to find the group that represents a whole tooth.
  // Heuristics: name starting with 'Dente_' or userData.toothId present.
  let n = node;
  while (n && n !== scene) {
    const name = String(n.name || '');
    if (/^Dente[_-]/i.test(name)) return n;
    if (n.userData && (n.userData.toothId || n.userData.tooth)) return n;
    n = n.parent;
  }
  // Fallback: if the mesh itself looks like a crown piece (C_, D_, etc.), the parent group
  return node?.parent || null;
}

function getMouseNDC(event, dom){
  const r = dom.getBoundingClientRect();
  ndc.x = ((event.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((event.clientY - r.top) / r.height) * 2 + 1;
  return ndc;
}

function inferStartViewFromHit(hitObject){
  // If the clicked object (or its parents) indicate oclusal, start from oclusal view
  let n = hitObject;
  while (n) {
    const s = String(n.name || '').toLowerCase();
    const t = String(n.userData?.type || '').toLowerCase();
    if (s.includes('oclu') || t.includes('oclu')) return 'oclu';
    n = n.parent;
  }
  return 'vest';
}

function isOcluNode(node){
  let n = node;
  while(n){
    const s = String(n.name || '').toLowerCase();
    const t = String(n.userData?.type || '').toLowerCase();
    if (s.includes('oclu') || t.includes('oclu')) return true;
    n = n.parent;
  }
  return false;
}

function getToothIdFromGroup(group){
  // Expect names like Dente_11, Dente_26, etc., or userData.toothId
  const name = String(group?.name || '');
  const m = name.match(/Dente[_-]([0-9]{1,3})/i);
  if (m) return m[1];
  return group?.userData?.toothId || null;
}

function extractToothIdFromName(name){
  const s = String(name || '');
  let m = s.match(/Dente[_-]([0-9]{2})/i);
  if (m) return m[1];
  m = s.match(/\bD([1-4][1-8])\b/i); // D11..D48
  if (m) return m[1];
  m = s.match(/\b([1-4][1-8])\b/);
  if (m) return m[1];
  return null;
}

function getToothIdFromNodeDeep(node){
  let n = node;
  while(n){
    const tid = getToothIdFromGroup(n) || extractToothIdFromName(n.name);
    if (tid) return tid;
    n = n.parent;
  }
  return null;
}

function findVestibularSourceForTooth(root, toothId){
  if (!toothId) return null;
  let best = null;
  root.traverse((n)=>{
    if (!n.name) return;
    const tid = extractToothIdFromName(n.name) || getToothIdFromGroup(n);
    if (tid === toothId && !isOcluNode(n)) {
      if (!best) best = n;
    }
  });
  return best;
}

function enableToothDoubleClick(root){
  container.addEventListener('dblclick', (ev) => {
    if (!root) return;
    getMouseNDC(ev, renderer.domElement);
  raycaster.setFromCamera(ndc, camera);
  // Intersect only visible meshes to avoid hidden picking confusion
  const pickables = [];
  root.traverse((n)=>{ if(n.isMesh && n.visible) pickables.push(n); });
  const hits = raycaster.intersectObjects(pickables, true);
    if (!hits.length) return;
    const hit = hits[0].object;
    let tooth = getToothRootFromNode(hit);
    if (!tooth) return;
    // Sempre resolver para o dente vestibular equivalente
    const toothId = getToothIdFromNodeDeep(tooth);
    const sourceTooth = findVestibularSourceForTooth(root, toothId) || tooth;
    const clickedIsOclu = inferStartViewFromHit(hit) === 'oclu';

    // Categoria por quadrante/posição (FDI):
    // 1x: superior direito; 2x: superior esquerdo; 3x: inferior esquerdo; 4x: inferior direito
    const q = toothId ? parseInt(String(toothId)[0], 10) : null;
    const pos = toothId ? parseInt(String(toothId).slice(-1), 10) : null; // 1..8
    const isAnterior = pos != null ? (pos >= 1 && pos <= 3) : false;
    const isPosterior = pos != null ? (pos >= 4 && pos <= 8) : false;

  // Direções: default +Y; -Y para down-top; -Z para anteriores (superior e inferior)
    let cameraDirection = null; // null -> viewer usa padrão
    if (clickedIsOclu && q && pos) {
      if (q === 3 || q === 4) {
        // inferiores
        if (isPosterior) {
          // oclusais posteriores inferiores: manter como está (+Y)
          cameraDirection = new THREE.Vector3(0, 1, 0);
        } else if (isAnterior) {
      // oclusais anteriores inferiores: -Z
      cameraDirection = new THREE.Vector3(0, 0, -1);
        }
      } else if (q === 1 || q === 2) {
        // superiores
        if (isPosterior) {
          // oclusais posteriores superiores: -Y (down-top)
          cameraDirection = new THREE.Vector3(0, -1, 0);
        } else if (isAnterior) {
      // oclusais anteriores superiores: -Z
      cameraDirection = new THREE.Vector3(0, 0, -1);
        }
      }
    }
    openToothViewer({
      sourceTooth,
  startView: clickedIsOclu ? 'oclu' : 'vest',
      title: (sourceTooth.name || (toothId ? `Dente ${toothId}` : 'Dente')),
      respectVisibility: true,
  cloneFilter: (n)=> !isOcluNode(n),
  cameraDirection: cameraDirection || undefined
    });
  });
}
