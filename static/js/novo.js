import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Basic scene
const container = document.getElementById('viewport-novo');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 0.9);
scene.add(hemi);
const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(50,80,100); scene.add(d1);
const d2 = new THREE.DirectionalLight(0xffffff, 0.5); d2.position.set(-60,-40,-80); scene.add(d2);

// Ortho camera and renderer
const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 5000);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

function getWorldBox(node){ node.updateWorldMatrix(true,true); return new THREE.Box3().setFromObject(node); }

function fitOrthoTo(node){
  const rect = container.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  const b = getWorldBox(node);
  const aspect = rect.width / Math.max(1, rect.height);
  if (b.isEmpty()) {
    camera.left = -rect.width/2; camera.right = rect.width/2;
    camera.top = rect.height/2; camera.bottom = -rect.height/2;
  } else {
    const s = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
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

function onResize(){ fitOrthoTo(scene); }
window.addEventListener('resize', ()=> requestAnimationFrame(onResize));

function animate(){ requestAnimationFrame(animate); renderer.render(scene, camera); }

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
  for (const k of Object.keys(mapped)) mapped[k] = [];
  root.traverse((n)=>{
    if (!n.isMesh) return;
    const t0 = String(n.userData?.type||'').toLowerCase();
    const t = t0 || parseTypeFromName(n.name);
    if (t && mapped[t]) mapped[t].push(n);
    // ensure userData.type for future toggles
    if (!n.userData) n.userData = {};
    if (!n.userData.type) n.userData.type = t;
  });
}

function applyVisibilityMapped(){
  const enabled = getEnabledTypes();
  for (const [k, arr] of Object.entries(mapped)) {
    const vis = enabled.has(k);
    for (const m of arr) m.visible = vis;
  }
}

async function loadGLB(){
  const loader = new GLTFLoader();
  try {
    const gltf = await loader.loadAsync('/static/models/odontograma.glb');
    // Robustness: log hierarchy
    console.groupCollapsed('GLB Hierarchy');
    gltf.scene.traverse((o)=>{ console.log(o.type, o.name || '(sem nome)'); });
    console.groupEnd();

    scene.add(gltf.scene);
    mapSceneByType(gltf.scene);
    applyVisibilityMapped();
    fitOrthoTo(scene);
    animate();
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
