import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Lightweight modal tooth viewer that reuses geometry/material references
// so painting/material edits can be synchronized across views.

function ensureStyles() {
  if (document.getElementById('tooth-viewer-styles')) return;
  const style = document.createElement('style');
  style.id = 'tooth-viewer-styles';
  style.textContent = `
  .tooth-viewer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:1000}
  .tooth-viewer-dialog{background:#0b0f14;border:1px solid #30363d;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5);width:min(90vw,1000px);height:min(85vh,800px);display:flex;flex-direction:column;overflow:hidden}
  .tooth-viewer-header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #30363d}
  .tooth-viewer-title{font-size:14px;margin:0;color:#e6edf3}
  .tooth-viewer-close{background:#161b22;border:1px solid #30363d;border-radius:6px;color:#e6edf3;padding:4px 8px;cursor:pointer}
  .tooth-viewer-close:hover{background:#1f2630}
  .tooth-viewer-canvas{flex:1 1 auto;position:relative}
  .tooth-viewer-canvas canvas{display:block;width:100%;height:100%}
  `;
  document.head.appendChild(style);
}

function fitPerspectiveTo(object3D, camera, renderer, opts = {}) {
  // Compute tight bounding sphere to set camera distance
  const box = new THREE.Box3().setFromObject(object3D);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight);
  // Fit by height or width depending on aspect
  const fitHeightDistance = (maxDim / 2) / Math.tan(fov / 2);
  const fitWidthDistance = (maxDim / 2) / Math.tan(Math.atan(Math.tan(fov / 2) * aspect));
  const distance = (opts.distanceMultiplier || 1.25) * Math.max(fitHeightDistance, fitWidthDistance);
  // Default direction slightly offset for nicer lighting
  const dir = opts.direction || new THREE.Vector3(1, 0.6, 1).normalize();
  const pos = center.clone().addScaledVector(dir, distance);
  camera.position.copy(pos);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return { center, distance };
}

function setOclusalView(camera, target, distance, dirVec, upVec) {
  // Top-down view: camera above looking down the +Z axis toward target
  if (upVec && upVec.isVector3) camera.up.copy(upVec); else camera.up.set(0, 1, 0);
  const dir = (dirVec && dirVec.isVector3) ? dirVec.clone() : new THREE.Vector3(0, 1, 0); // default +Y
  camera.position.copy(target).addScaledVector(dir, distance);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
}

export function openToothViewer({ sourceTooth, startView = 'vest', title, respectVisibility = true, cloneFilter, cameraDirection, cameraUp } = {}) {
  if (!sourceTooth) return;
  ensureStyles();

  // Build overlay DOM
  const overlay = document.createElement('div');
  overlay.className = 'tooth-viewer-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'tooth-viewer-dialog';
  const header = document.createElement('div');
  header.className = 'tooth-viewer-header';
  const hTitle = document.createElement('div');
  hTitle.className = 'tooth-viewer-title';
  hTitle.textContent = title || (sourceTooth.name || 'Dente');
  const btnClose = document.createElement('button');
  btnClose.className = 'tooth-viewer-close';
  btnClose.textContent = 'Fechar';
  header.appendChild(hTitle);
  header.appendChild(btnClose);
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'tooth-viewer-canvas';
  dialog.appendChild(header);
  dialog.appendChild(canvasWrap);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Three.js setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);
  // Softer, uniform fill with raised ground tint
  const hemi = new THREE.HemisphereLight(0xf0f8ff, 0x1a1a1a, 0.55); scene.add(hemi);
  // Three fixed directional lights (absolute values)
  const d1 = new THREE.DirectionalLight(0xfff2e5, 0.75); d1.position.set(2.1, 3.2, 3.2); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xdde6ff, 0.75); d2.position.set(-2.4, 1.4, -1.0); scene.add(d2);
  const d3 = new THREE.DirectionalLight(0xeaf2ff, 0.5); d3.position.set(0.6, -3.7, 2.2); scene.add(d3);
  const d4 = new THREE.DirectionalLight(0xeaf2ff, 0.45); d4.position.set(0.0, -3.2, -2.2); scene.add(d4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // Gentle tone mapping to reduce harsh contrast
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  canvasWrap.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);

  // Helpers
  function isVisibleInHierarchy(obj, stopAt){
    let n = obj;
    while(n && n !== stopAt){ if (n.visible === false) return false; n = n.parent; }
    return true;
  }

  // Clone lightweight tooth (share geometry/material references)
  const tooth = new THREE.Group();
  tooth.name = sourceTooth.name || 'Tooth';
  sourceTooth.traverse((n) => {
    if (n.isMesh) {
      // Apply both filters: custom filter AND visibility (if requested)
      const passFilter = !cloneFilter || !!cloneFilter(n);
      const passVis = !respectVisibility || isVisibleInHierarchy(n, sourceTooth);
      if (!(passFilter && passVis)) return;
      const m = new THREE.Mesh(n.geometry, n.material);
      m.name = n.name;
      // Preserve basic userData so future features (painting/tags) can look it up
      m.userData = { ...n.userData };
      // Preserve transforms (if any)
      m.matrix.copy(n.matrix);
      m.matrixAutoUpdate = n.matrixAutoUpdate;
      m.position.copy(n.position);
      m.quaternion.copy(n.quaternion);
      m.scale.copy(n.scale);
      tooth.add(m);
    } else if (n !== sourceTooth && (n.isGroup || n.isObject3D)) {
      // Keep hierarchy shallow but avoid deep empty groups; optional
    }
  });
  scene.add(tooth);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false; // on-demand rendering; no inertia keeps it simple
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  function resize() {
    const w = canvasWrap.clientWidth || 600;
    const h = canvasWrap.clientHeight || 400;
    camera.aspect = Math.max(1e-3, w / Math.max(1, h));
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    render();
  }

  function render() { renderer.render(scene, camera); }

  const { center, distance } = fitPerspectiveTo(tooth, camera, renderer);
  if (startView === 'oclu' || startView === 'oclu-top') {
    // Oclusal: use +Y by default, or cameraDirection if provided
  setOclusalView(camera, center, distance, cameraDirection, cameraUp);
  } else if (startView === 'vest' || startView === 'front') {
    // Vestibular: straight-on front view along +Z
    const dir = cameraDirection || new THREE.Vector3(0, 0, 1);
    camera.up.set(0, 1, 0);
    camera.position.copy(center).addScaledVector(dir.normalize(), distance);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  } else if (startView === 'oclu-back') {
    const dir = cameraDirection || new THREE.Vector3(-1, 0, 0);
    camera.up.set(0, 1, 0);
    camera.position.copy(center).addScaledVector(dir.normalize(), distance);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }
  controls.target.copy(center);

  // Render on interaction only
  controls.addEventListener('change', render);
  window.addEventListener('resize', resize);
  resize();

  function close() {
    window.removeEventListener('resize', resize);
    controls.dispose();
    renderer.dispose();
    overlay.remove();
  }

  btnClose.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });

  // Initial frame
  render();
}
