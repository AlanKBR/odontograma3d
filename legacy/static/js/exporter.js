import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/**
 * Export a THREE.Object3D (scene or group) to GLB efficiently.
 * - Avoids geometry/material cloning to keep file small (dedup by GLTFExporter)
 * - Ensures node names are correct from userData.partName when present
 * - Restores original names after export (no side effects)
 */
export async function exportNodeToGLB(node, options = {}) {
  const {
    filename = 'odontograma.glb',
    onlyVisible = true,
    binary = true,
    forceIndices = true,
    includeCustomExtensions = true,
    maxTextureSize = Infinity,
  } = options;

  if (!node) throw new Error('No node provided to export');

  // Normalize names on nodes for export, then restore after.
  const originalNames = new Map();
  const applyNames = () => {
    node.traverse((obj) => {
      if (!obj.isMesh) return;
      const desired = obj.userData?.partName || obj.userData?.sourceBase || obj.name || obj.geometry?.name;
      if (desired && obj.name !== desired) {
        originalNames.set(obj, obj.name);
        obj.name = desired;
      }
    });
  };
  const restoreNames = () => {
    originalNames.forEach((name, obj) => {
      obj.name = name;
    });
    originalNames.clear();
  };

  applyNames();

  try {
    const exporter = new GLTFExporter();
    const arrayBuffer = await exporter.parseAsync(node, {
      binary,
      onlyVisible,
      includeCustomExtensions,
      forceIndices,
      maxTextureSize,
    });

    const blob = arrayBuffer instanceof ArrayBuffer
      ? new Blob([arrayBuffer], { type: 'model/gltf-binary' })
      : new Blob([JSON.stringify(arrayBuffer, null, 2)], { type: 'model/gltf+json' });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  } finally {
    restoreNames();
  }
}
