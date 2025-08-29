import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { LAYOUT_DATA } from './layout_data.js';
import { exportNodeToGLB } from './exporter.js';

// Requisitos principais:
// - Carregar cada geometria (.obj) uma única vez
// - Reutilizar geometria/material para múltiplas instâncias
// - Aplicar transformações do LAYOUT_DATA
// - Usar OrthographicCamera e layout vertical fixo das 4 linhas
// - Coloração sincronizada via compartilhamento de materiais

const viewChart = document.getElementById('viewport-chart');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

// Luzes leves para visual geral
scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 0.9));
const d1 = new THREE.DirectionalLight(0xffffff, 0.9); d1.position.set(50,80,100); scene.add(d1);
const d2 = new THREE.DirectionalLight(0xffffff, 0.5); d2.position.set(-60,-40,-80); scene.add(d2);

// Camera ortográfica
const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 5000);
camera.position.set(0, 0, 1000);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
viewChart.appendChild(renderer.domElement);

// Constante de espaçamento vertical entre as linhas
const CHART_VERTICAL_SPACING = 1;
const CHART_SUP_INF_OFFSET = 10;
// Implantes: offsets verticais por arcada (aplicados ao alvo do fundo do ABU)
const IMPLANT_SUPERIOR_Y_OFFSET = 0;
const IMPLANT_INFERIOR_Y_OFFSET = -7;

// Quatro grupos (linhas): ordem visual: Vest Superior, Oclu Superior, Oclu Inferior, Vest Inferior
const root = new THREE.Group(); root.name = 'chart-root';
const rowVestUp = new THREE.Group(); rowVestUp.name = 'row-vest-up';
const rowOcluUp = new THREE.Group(); rowOcluUp.name = 'row-oclu-up';
const rowOcluLow = new THREE.Group(); rowOcluLow.name = 'row-oclu-low';
const rowVestLow = new THREE.Group(); rowVestLow.name = 'row-vest-low';
root.add(rowVestUp, rowOcluUp, rowOcluLow, rowVestLow);
scene.add(root);

// Cache de geometria por arquivo
const objLoader = new OBJLoader();
objLoader.setPath('/models/');
const geometryCache = new Map(); // key -> { group:THREE.Group, meshes:THREE.Mesh[] }

// Material base compartilhado para sincronizar coloração via vertex colors
const baseMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true, side: THREE.DoubleSide });
const BASE_GREY = new THREE.Color(240/255, 240/255, 240/255);
const PURPLE = new THREE.Color(153/255, 50/255, 204/255);

// Top-level: classify component type from filename
function parseComponentTypeFromFilename(fname){
  const s = String(fname||'').toLowerCase();
  if (/implante|implant/.test(s)) return 'implante';
  if (/canal/.test(s)) return 'canal';
  if (/raiz|raíz/.test(s)) return 'raiz';
  if (/\bnuc\b|nu[cç]|_nuc|_n_|\bnucleo\b/.test(s)) return 'nucleo';
  const m = s.match(/^d\d{2}([crn])_/i);
  if (m) {
    const sec = m[1].toLowerCase();
    if (sec==='r') return 'raiz';
    if (sec==='n') return 'nucleo';
    if (sec==='c') return 'dente';
  }
  return 'dente';
}

function ensureVertexColors(geometry) {
  const pos = geometry.getAttribute('position');
  const count = pos ? pos.count : 0;
  let color = geometry.getAttribute('color');
  if (!color || color.count !== count) {
    color = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    for (let i = 0; i < count; i++) {
      color.setXYZ(i, BASE_GREY.r, BASE_GREY.g, BASE_GREY.b);
    }
    geometry.setAttribute('color', color);
  }
}

function setAllVertexColors(geometry, color) {
  const pos = geometry.getAttribute('position');
  const count = pos ? pos.count : 0;
  let col = geometry.getAttribute('color');
  if (!col || col.count !== count) {
    col = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute('color', col);
  }
  for (let i = 0; i < count; i++) col.setXYZ(i, color.r, color.g, color.b);
  col.needsUpdate = true;
}

async function loadOBJOnce(filename) {
  if (geometryCache.has(filename)) return geometryCache.get(filename);
  const group = await objLoader.loadAsync(filename);
  // Normalizar: flaten todos os meshes e garantir vertex colors + material compartilhado
  const container = new THREE.Group(); container.name = `proto:${filename}`;
  const meshes = [];
  group.traverse((n) => {
    if (n.isMesh && n.geometry) {
      ensureVertexColors(n.geometry);
  const m = new THREE.Mesh(n.geometry, baseMaterial);
  // Nome estrito: base do arquivo .obj (sem caminho/extensão)
  const baseName = String(filename).replace(/^.*[\\\/]*/, '').replace(/\.[^\.]+$/, '');
  m.name = baseName;
  if (m.geometry && !m.geometry.name) m.geometry.name = baseName;
  // Classificar o tipo pelo nome de arquivo
  m.userData.type = parseComponentTypeFromFilename(filename);
  m.userData.sourceBase = baseName;
  m.userData.partName = baseName;
      container.add(m);
      meshes.push(m);
    }
  });
  const rec = { group: container, meshes };
  geometryCache.set(filename, rec);
  return rec;
}

function applyTRS(obj, px, py, pz, rx, ry, rz) {
  obj.position.set(px, py, pz);
  obj.rotation.set(rx, ry, rz, 'XYZ');
}

function getWorldBox(node) {
  node.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(node);
}

function computeComponentBox(rootNode, desiredType) {
  const want = String(desiredType||'').toLowerCase();
  const box = new THREE.Box3(); let has=false;
  rootNode.updateWorldMatrix(true,true);
  rootNode.traverse((n)=>{
    if(n.isMesh && String(n.userData?.type||'').toLowerCase()===want){
      const g=n.geometry; if(!g) return; if(!g.boundingBox) g.computeBoundingBox();
      const bb=g.boundingBox.clone(); bb.applyMatrix4(n.matrixWorld);
      if(!has){ box.copy(bb); has=true; } else box.union(bb);
    }
  });
  return has?box:null;
}

function layoutRows() {
  // Centraliza cada linha no próprio centro e empilha com espaçamentos
  const rows = [rowVestUp, rowOcluUp, rowOcluLow, rowVestLow];
  rows.forEach((g) => {
    const b = getWorldBox(g); if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3());
    g.position.x -= c.x; g.position.y -= c.y;
  });
  const boxes = [rowVestUp, rowOcluUp, rowOcluLow, rowVestLow].map(g => getWorldBox(g));
  const heights = boxes.map(b => b.isEmpty() ? 0 : (b.max.y - b.min.y));
  const s12 = CHART_VERTICAL_SPACING;
  const s23 = CHART_SUP_INF_OFFSET;
  const s34 = CHART_VERTICAL_SPACING;
  const total = heights.reduce((a,h)=>a+h,0) + s12 + s23 + s34;
  let cursor = total * 0.5;
  [rowVestUp, rowOcluUp, rowOcluLow, rowVestLow].forEach((g, i) => {
    const h = heights[i];
    const centerY = cursor - h * 0.5;
    g.position.y += centerY;
    cursor -= h + ([s12, s23, s34][i] || 0);
  });
  // Recentrar root
  const all = getWorldBox(root);
  if (!all.isEmpty()) {
    const c = all.getCenter(new THREE.Vector3());
    [rowVestUp, rowOcluUp, rowOcluLow, rowVestLow].forEach(g => { g.position.x -= c.x; g.position.y -= c.y; });
  }
}

function fitOrthoToRoot() {
  const rect = viewChart.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  const b = getWorldBox(root);
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

function onResize() {
  fitOrthoToRoot();
}
window.addEventListener('resize', () => requestAnimationFrame(onResize));

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

async function loadManifest() {
  const res = await fetch('/manifest.json');
  if (!res.ok) throw new Error('Falha ao carregar manifest.json');
  return res.json();
}

// Distribuição para linhas: deduz por tipo e/ou nome do arquivo
function pickRowByIndex(idx) {
  return [rowVestUp, rowOcluUp, rowOcluLow, rowVestLow][idx] || rowVestUp;
}

// Visibility helpers: apply current form state to all meshes
function getEnabledTypesFromForm() {
  const form = document.getElementById('visibility-form');
  const enabled = new Set();
  if (!form) return enabled;
  form.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    const t = cb.getAttribute('data-type');
    if (cb.checked) enabled.add(t);
  });
  return enabled;
}
function applyVisibilityFromCurrentForm() {
  const enabled = getEnabledTypesFromForm();
  root.traverse((n) => {
    if (n.isMesh && n.userData && n.userData.type) {
      n.visible = enabled.has(n.userData.type);
    }
  });
}

// Helpers de hierarquia por dente
function ensureToothGroup(row, id){
  let tooth = row.children.find(ch => ch.type==='Group' && ch.name===`Dente_${id}`);
  if (!tooth) { tooth = new THREE.Group(); tooth.name = `Dente_${id}`; row.add(tooth); }
  const sub = {};
  const want = ['Faces','Raiz','Canal','Nucleo','Implante'];
  for (const name of want) {
    let g = tooth.children.find(ch => ch.type==='Group' && ch.name===name);
    if (!g) { g = new THREE.Group(); g.name = name; tooth.add(g); }
    sub[name] = g;
  }
  return { tooth, sub };
}

// Agrupar por dente e tipo em Dente_##/{Faces,Raiz,Canal,Nucleo,Implante}
function groupFacesByTooth() {
  const rows = [rowVestUp, rowVestLow];
  const emptyParents = new Set();
  for (const row of rows) {
    const toReparent = [];
    row.traverse((n)=>{
      if (!n.isMesh) return;
      const id = getToothIdFromMeshName(n.name);
      if (!id) return;
      const t = String(n.userData?.type||'').toLowerCase() || 'dente';
      // já está sob Dente_##/Subgrupo?
      if (n.parent && n.parent.type==='Group') {
        const p = n.parent; const gp = p.parent;
        if (gp && gp.type==='Group' && gp.name===`Dente_${id}` && ['Faces','Raiz','Canal','Nucleo','Implante'].includes(p.name)) return;
      }
      toReparent.push({ mesh:n, id, t });
    });
    for (const {mesh, id, t} of toReparent) {
      const { tooth, sub } = ensureToothGroup(row, id);
      const target = t==='raiz' ? sub.Raiz : t==='canal' ? sub.Canal : t==='nucleo' ? sub.Nucleo : t==='implante' ? sub.Implante : sub.Faces;
      const oldParent = mesh.parent;
      target.add(mesh);
      if (oldParent && oldParent.isGroup && oldParent !== row && oldParent !== tooth && oldParent.children.length===0) emptyParents.add(oldParent);
    }
  }
  // Limpar grupos vazios criados por instâncias
  for (const g of emptyParents) {
    if (g.parent) g.parent.remove(g);
  }
}

async function build() {
  const manifest = await loadManifest();
  const available = new Set();
  // Colete todos os nomes citados no LAYOUT_DATA que existam no manifesto (qualquer categoria)
  const allFiles = new Set();
  Object.values(manifest.teeth).forEach((t) => {
    ['C','R','N'].forEach(k => (t[k]||[]).forEach(f => allFiles.add(f)));
  });
  // Prepare prototypes for either static layout or dynamic build
  if (LAYOUT_DATA.length > 0) {
    for (const entry of LAYOUT_DATA) {
      const [geomKey] = entry;
      if (allFiles.has(geomKey)) available.add(geomKey);
    }
    const prototypes = new Map();
    for (const key of available) {
      prototypes.set(key, await loadOBJOnce(key));
    }
    for (const item of LAYOUT_DATA) {
      const [key, rowIdx, px, py, pz, rx, ry, rz] = item;
      const proto = prototypes.get(key);
      if (!proto) continue;
      const inst = proto.group.clone(false);
      proto.group.children.forEach((child) => {
        if (child.isMesh) {
          const mesh = new THREE.Mesh(child.geometry, child.material);
          // Garantir nome base
          mesh.name = String(child.name||'').replace(/^.*[\\\/]*/, '').replace(/\.[^\.]+$/, '');
          if (mesh.geometry && !mesh.geometry.name) mesh.geometry.name = mesh.name;
          mesh.userData = { ...child.userData };
          if (!mesh.userData.sourceBase) mesh.userData.sourceBase = mesh.name;
          if (!mesh.userData.partName) mesh.userData.partName = mesh.name;
          inst.add(mesh);
        }
      });
      inst.name = `inst:${key}`;
      applyTRS(inst, px||0, py||0, pz||0, rx||0, ry||0, rz||0);
      pickRowByIndex(rowIdx|0).add(inst);
    }
  } else {
    // Dynamic fallback: build from manifest with occlusal transforms
    const prototypes = new Map();
    for (const f of allFiles) {
      prototypes.set(f, await loadOBJOnce(f));
    }
    // Tooth helpers
    const isUpper = (id) => { const n = Number(id); return (11 <= n && n <= 18) || (21 <= n && n <= 28); };
    const isPosterior = (id) => { const n = Number(id); return (14 <= n && n <= 18)||(24 <= n && n <= 28)||(34 <= n && n <= 38)||(44 <= n && n <= 48); };
    const isAnterior = (id) => { const n = Number(id); return (11 <= n && n <= 13)||(21 <= n && n <= 23)||(31 <= n && n <= 33)||(41 <= n && n <= 43); };
    const getToothSet = (id)=>{const up=isUpper(id); if(isPosterior(id)) return up?'UP_POST':'LOW_POST'; if(isAnterior(id)) return up?'UP_ANT':'LOW_ANT'; return 'UNKNOWN';};
    const deg2rad = (d)=>d*Math.PI/180;
    const OCLU_ABS_ROT_DEG = {
      UP_POST:{x:90,y:180,z:180}, UP_ANT:{x:0,y:180,z:180}, LOW_POST:{x:90,y:0,z:0}, LOW_ANT:{x:0,y:180,z:180}, UNKNOWN:{x:0,y:0,z:0}
    };
    function applyOcclusalTransform(toothId, pivot){
      const abs = OCLU_ABS_ROT_DEG[getToothSet(toothId)]||OCLU_ABS_ROT_DEG.UNKNOWN;
      pivot.rotation.set(deg2rad(abs.x||0),deg2rad(abs.y||0),deg2rad(abs.z||0),'XYZ');
    }
    function computeCrownBox(rootNode){
      const box = new THREE.Box3(); let has=false;
      rootNode.updateWorldMatrix(true,true);
      rootNode.traverse((n)=>{
        if(n.isMesh){ const t=String(n.userData?.type||'').toLowerCase(); if(t==='raiz'||t==='canal'||t==='implante') return; const g=n.geometry; if(!g) return; if(!g.boundingBox) g.computeBoundingBox(); const bb=g.boundingBox.clone(); bb.applyMatrix4(n.matrixWorld); if(!has){box.copy(bb);has=true;} else box.union(bb);} });
      return has?box:null;
    }
    function createToothGroup(toothId, entry){
      // Grupo por dente com subgrupos Faces/Raiz/Canal/Nucleo/Implante
      const toothGroup = new THREE.Group(); toothGroup.name = `Dente_${toothId}`;
      const faces = new THREE.Group(); faces.name = 'Faces';
      const raiz = new THREE.Group(); raiz.name = 'Raiz';
      const canal = new THREE.Group(); canal.name = 'Canal';
      const nucleo = new THREE.Group(); nucleo.name = 'Nucleo';
      const impl = new THREE.Group(); impl.name = 'Implante';
      toothGroup.add(faces, raiz, canal, nucleo, impl);
      const seqAll = [...(entry.C||[]), ...(entry.R||[]), ...(entry.N||[])];
      for(const fname of seqAll){
        const proto = prototypes.get(fname); if(!proto) continue;
        const baseName = String(fname).replace(/^.*[\\\/]*/, '').replace(/\.[^\.]+$/, '');
        const compType = parseComponentTypeFromFilename(fname);
        const target = compType==='raiz' ? raiz : compType==='canal' ? canal : compType==='nucleo' ? nucleo : faces;
        proto.group.children.forEach((src)=>{
          if(src.isMesh){
            const m=new THREE.Mesh(src.geometry, src.material);
            m.name = baseName;
            if (m.geometry && !m.geometry.name) m.geometry.name = baseName;
            m.userData={...src.userData};
            if(!m.userData.type){ m.userData.type = compType; }
            m.userData.sourceBase = baseName;
            m.userData.partName = baseName;
            target.add(m);
          }
        });
      }
      return toothGroup;
    }
    // Build vest rows
    const ids = Object.keys(manifest.teeth).sort((a,b)=>Number(a)-Number(b));
    for(const id of ids){ const entry = manifest.teeth[id]; if(!entry) continue; const tooth = createToothGroup(id, entry); (isUpper(id)?rowVestUp:rowVestLow).add(tooth); }
    // Build occlusal clones (crowns only) with pivot rotation
    function cloneCrowns(node){
      const grp=new THREE.Group(); grp.name=node.name;
      // Se houver subgrupo Faces, preferir clonar dele
      const faces = node.children && node.children.find(ch=>ch.type==='Group' && ch.name==='Faces');
      const source = faces || node;
      source.traverse((n)=>{ if(n.isMesh){ const t=String(n.userData?.type||'').toLowerCase(); if(t==='raiz'||t==='canal'||t==='implante') return; const m=new THREE.Mesh(n.geometry, n.material); m.name=n.name; m.userData={...n.userData}; grp.add(m);} });
      return grp;
    }
    root.updateWorldMatrix(true,true);
  [rowVestUp, rowVestLow].forEach((row, idx)=>{
      row.children.forEach((tooth)=>{
    const id = (tooth.name.match(/Dente_(\d{2})/)||[])[1]||'00';
        const crowns = cloneCrowns(tooth);
        const bb = computeCrownBox(crowns) || new THREE.Box3().setFromObject(crowns);
        const center = bb.getCenter(new THREE.Vector3());
        crowns.position.sub(center);
        const pivot = new THREE.Group(); pivot.name=`tooth-${id}-oclu-pivot`; pivot.position.copy(center);
        pivot.add(crowns); applyOcclusalTransform(id, pivot);
        (idx===0?rowOcluUp:rowOcluLow).add(pivot);
      });
    });

    // Simplified implants: center X/Z at nucleus center; align ABU bottom to nucleus center Y + per-arch offset
    async function loadImplantPrototypeSimple(){
      const files = ['IMP11_ABU.obj','IMP11_IMP.obj'];
      const raw = new THREE.Group(); raw.name='implant-proto-raw';
      for (const f of files) {
        try {
          const rec = await loadOBJOnce(f);
          rec.group.children.forEach((src)=>{ if(src.isMesh){ const m=new THREE.Mesh(src.geometry, src.material); m.userData={...src.userData, partName:f, type:'implante'}; m.name=src.name||f; raw.add(m);} });
        } catch(_) { /* ignore */ }
      }
      if (raw.children.length===0) return null;
      const proto = new THREE.Group(); proto.name='implant-proto'; proto.add(raw); return proto;
    }
  function cloneImplantSimple(proto){ const clone=new THREE.Group(); proto.traverse((n)=>{ if(n.isMesh){ const m=new THREE.Mesh(n.geometry, n.material); m.name=n.name; m.userData={...n.userData}; clone.add(m);} }); return clone; }
    function getAbutmentWorldBox(inst){ const box=new THREE.Box3(); let has=false; inst.updateWorldMatrix(true,true); inst.traverse((n)=>{ if(n.isMesh){ const pn=String(n.userData?.partName||n.name||''); if(/ABU|APU/i.test(pn)){ const g=n.geometry; if(!g) return; if(!g.boundingBox) g.computeBoundingBox(); const bb=g.boundingBox.clone(); bb.applyMatrix4(n.matrixWorld); if(!has){ box.copy(bb); has=true; } else box.union(bb);} } }); return has?box:null; }
    function getNucleusBox(group){ return computeComponentBox(group,'nucleo'); }
  function findToothGroupById(id){ let found=null; (isUpper(id)?rowVestUp:rowVestLow).traverse((n)=>{ if(!found && n.type==='Group' && n.name===`Dente_${id}`) found=n; }); return found; }

    try {
      const proto = await loadImplantPrototypeSimple();
      if (!proto) { /* no assets */ } else {
        const idsAll = Object.keys(manifest.teeth).sort((a,b)=>Number(a)-Number(b));
        for (const id of idsAll) {
          const g = findToothGroupById(id); if(!g) continue; const nuc = getNucleusBox(g); if(!nuc) continue;
          const c = nuc.getCenter(new THREE.Vector3());
          const inst = cloneImplantSimple(proto); inst.name=`tooth-${id}-implant`;
          // Base transform: X/Z at nucleus center. Rotate uppers 180°.
          inst.position.set(c.x, 0, c.z);
          inst.quaternion.identity();
          // Rotate only lower arch 180°, uppers keep prototype orientation
          if (!isUpper(id)) inst.rotateZ(Math.PI);
          inst.scale.set(1,1,1);
          // Adicionar no subgrupo Implante
          let implGrp = g.children.find(ch=>ch.type==='Group' && ch.name==='Implante');
          if (!implGrp){ implGrp = new THREE.Group(); implGrp.name='Implante'; g.add(implGrp); }
          implGrp.add(inst);
          // Ensure initial visibility follows current form (implants start hidden if checkbox is off)
          const enabled = getEnabledTypesFromForm();
          inst.traverse((n)=>{ if(n.isMesh && n.userData?.type){ n.visible = enabled.has(n.userData.type); } });
          // Align horizontally (X/Z): ABU center -> nucleus center; and vertically (Y): ABU bottom -> targetY
          const abu = getAbutmentWorldBox(inst) || getWorldBox(inst);
          const targetY = c.y + (isUpper(id) ? IMPLANT_SUPERIOR_Y_OFFSET : IMPLANT_INFERIOR_Y_OFFSET);
          const cw = abu.getCenter(new THREE.Vector3());
          const dx = c.x - cw.x;
          const dz = c.z - cw.z;
          const dy = targetY - abu.min.y;
          const newCW = cw.clone().add(new THREE.Vector3(dx, dy, dz));
          const cL = g.worldToLocal(cw.clone());
          const nL = g.worldToLocal(newCW);
          inst.position.add(nL.sub(cL));
        }
      }
    } catch(_) { /* ignore */ }
  }
  // Apply current visibility once after build completes
  applyVisibilityFromCurrentForm();
  // Garantir hierarquia por dente mesmo em layouts estáticos
  groupFacesByTooth();
  layoutRows();
  fitOrthoToRoot();
  animate();
  wirePainting();
}

// Visibilidade: checkbox -> filtra por userData.type
(function wireVisibility() {
  const form = document.getElementById('visibility-form');
  if (!form) return;
  form.addEventListener('change', () => applyVisibilityFromCurrentForm());
  // Initialize visibility on first load according to default checkbox states
  applyVisibilityFromCurrentForm();
})();

// Boot
(function init() {
  const rect = viewChart.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  build().then(()=>{
    const btn = document.getElementById('export-glb');
    const input = document.getElementById('export-filename');
    if (btn) btn.addEventListener('click', ()=>{
      const name = (input && input.value && input.value.trim()) ? input.value.trim() : 'odontograma.glb';
      if (typeof window.exportDentalChartGLB === 'function') window.exportDentalChartGLB(name);
    });
  }).catch(err => console.error(err));
})();

// Pintura simples: clique pinta a parte inteira (material compartilhado)
function wirePainting() {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const onPointer = (ev) => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects([root], true);
    if (!hits.length) return;
    const hit = hits[0];
    const mesh = hit.object;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    if (!g) return;
    setAllVertexColors(g, PURPLE);
  };
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // left only
    onPointer(e);
  });
}

// Optional: expose a simple export API for future use
window.exportDentalChartGLB = async function exportDentalChartGLB(filename = 'odontograma.glb'){
  try {
    await exportNodeToGLB(scene, { filename, binary: true, onlyVisible: false, forceIndices: true, includeCustomExtensions: true });
  } catch (err) {
    console.error('Export failed:', err);
  }
}

function getToothIdFromMeshName(name){
  const m = String(name||'').toUpperCase().match(/^D(\d{2})/);
  return m ? m[1] : null;
}
