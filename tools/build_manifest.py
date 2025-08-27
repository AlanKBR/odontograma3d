import json
import os
import re
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MODELS_DIR = os.path.join(ROOT, 'objetos_separados')
LEGACY_FILE = os.path.join(ROOT, 'dentalchartload.inc')
OUT_JSON = os.path.join(ROOT, 'tooth_manifest.json')
ASSEMBLY_OBJ = os.path.join(ROOT, 'ArcadaCompleta.obj')

# Patterns
# Examples: D11C_CL.obj, D11R_Raiz.obj, D11N_NUC.obj
OBJ_RE = re.compile(
    r"^D(?P<tooth>\d{2})(?P<section>[A-Z])_(?P<part>[A-Za-z0-9]+)\.obj$"
)
# Some files like D35C_ACL.obj / D35C_CUV.obj / D14C_FDL.obj are covered by
# the generic "part" capture group above.

# Optional additional OBJ files like 237.obj appear unrelated; we'll ignore
# non-D-prefixed files

# Parse legacy positions, AxisglDenteXX AbsolutePosition vector
POS_RE = re.compile(r"cbTemp1\.Name := 'AxisglDente(?P<tooth>\d{2})';")
_F = r"[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?"
VEC_RE = re.compile(
    rf"AbsolutePosition := TVector\((?P<x>{_F}),(?P<y>{_F}),(?P<z>{_F}),1\)"
)


def scan_models():
    by_tooth = defaultdict(lambda: defaultdict(list))
    other = []
    numeric = []
    for name in os.listdir(MODELS_DIR):
        if not name.lower().endswith('.obj'):
            continue
        if not name.startswith('D'):
            # Keep track of numeric/alternative-named parts (e.g., 608_1.obj)
            stem = os.path.splitext(name)[0]
            if re.fullmatch(r"\d+[A-Za-z0-9_]*", stem):
                numeric.append(name)
            else:
                other.append(name)
            continue
        m = OBJ_RE.match(name)
        if not m:
            # Some items might be like D33R_Raiz.obj (matches), otherwise log
            other.append(name)
            continue
        tooth = m.group('tooth')  # '11', '12', ...
        section = m.group('section')  # C crown, R root, N nucleus(?)
    # part name exists but we only group by section; keep for docs if
    # needed
        _ = m.group('part')
        by_tooth[tooth][section].append(name)
    # Sort deterministically
    for tooth in by_tooth:
        for section in by_tooth[tooth]:
            by_tooth[tooth][section] = sorted(by_tooth[tooth][section])
    return by_tooth, sorted(other), sorted(numeric)


def parse_legacy_positions():
    positions = {}
    if not os.path.exists(LEGACY_FILE):
        return positions
    with open(LEGACY_FILE, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    current_tooth = None
    for line in lines:
        pos_m = POS_RE.search(line)
        if pos_m:
            current_tooth = pos_m.group('tooth')
            continue
        if current_tooth is not None:
            vec_m = VEC_RE.search(line)
            if vec_m:
                x = float(vec_m.group('x'))
                y = float(vec_m.group('y'))
                z = float(vec_m.group('z'))
                positions[current_tooth] = {
                    'x': x,
                    'y': y,
                    'z': z,
                }
                current_tooth = None
    return positions


def build_manifest():
    by_tooth, other, numeric = scan_models()
    positions = parse_legacy_positions()

    # Only keep permanent teeth: 11-18, 21-28, 31-38, 41-48
    def is_permanent(t):
        n = int(t)
        return (
            (11 <= n <= 18)
            or (21 <= n <= 28)
            or (31 <= n <= 38)
            or (41 <= n <= 48)
        )

    manifest = {
        'teeth': {},
        'notes': {
            'ignored_files': other,
            'numeric_candidates': numeric,
            'sections': {
                'C': 'Coroa (crown) faces/patches',
                'R': 'Raiz (root) + Canal',
                'N': 'Núcleo/NUC (internal core)'
            }
        }
    }
    for tooth, groups in sorted(by_tooth.items(), key=lambda kv: int(kv[0])):
        if not is_permanent(tooth):
            continue
        manifest['teeth'][tooth] = {
            'C': groups.get('C', []),
            'R': groups.get('R', []),
            'N': groups.get('N', []),
            'position_hint': positions.get(tooth)
        }

    # Compute assembly-derived tooth centers and override position_hint
    tooth_centers = (
        parse_assembly_tooth_centers(ASSEMBLY_OBJ)
        if os.path.exists(ASSEMBLY_OBJ)
        else {}
    )
    for tooth, center in tooth_centers.items():
        if tooth in manifest['teeth']:
            manifest['teeth'][tooth]['position_hint'] = center

    # Optionally enrich crown parts with numeric-named meshes mapped by
    # proximity
    assignments = {}
    # Parse assembly object centers once
    centers = (
        parse_assembly_object_centers(ASSEMBLY_OBJ)
        if os.path.exists(ASSEMBLY_OBJ)
        else {}
    )

    def dist(a, b):
        return (
            (a['x'] - b['x']) ** 2
            + (a['y'] - b['y']) ** 2
            + (a['z'] - b['z']) ** 2
        ) ** 0.5
    for fname in numeric:
        base = os.path.splitext(fname)[0]
        # Get center from assembly; fallback to local OBJ centroid
        c = None
        if base in centers:
            c = centers[base]
        else:
            p = centroid_from_obj(os.path.join(MODELS_DIR, fname))
            if p:
                c = p
        if not c:
            continue
        # Find nearest permanent tooth with a position hint
        best = None
        best_tooth = None
        for tooth, entry in manifest['teeth'].items():
            ph = entry.get('position_hint')
            if not ph:
                continue
            d = dist(c, ph)
            if best is None or d < best:
                best = d
                best_tooth = tooth
        if best_tooth:
            manifest['teeth'][best_tooth]['C'].append(fname)
            assignments[fname] = {
                'tooth': best_tooth,
                'center': c,
                'distance': best
            }
    # Sort crown lists for determinism
    for t in manifest['teeth'].values():
        t['C'] = sorted(set(t['C']))

    manifest['notes']['numeric_assignments'] = assignments

    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    return OUT_JSON


def parse_assembly_object_centers(path):
    """Parse an OBJ assembly and return object centers: name -> {x,y,z}.
    We associate faces encountered under each 'o' object with the current name,
    then compute the centroid from the used vertex indices.
    """
    vertices = []  # 1-based indexing in faces; store 0-based list
    current = None
    used_by_obj = defaultdict(set)
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if not line:
                    continue
                if line.startswith('o '):
                    current = line[2:].strip()
                    continue
                if line.startswith('v '):
                    parts = line.strip().split()
                    if len(parts) >= 4:
                        try:
                            x = float(parts[1])
                            y = float(parts[2])
                            z = float(parts[3])
                            vertices.append((x, y, z))
                        except ValueError:
                            pass
                    continue
                if line.startswith('f ') and current:
                    parts = line.strip().split()[1:]
                    for p in parts:
                        idx_str = p.split('/')[0]
                        try:
                            vi = int(idx_str)
                            if vi < 0:
                                # negative indices from end
                                vi = len(vertices) + 1 + vi
                            used_by_obj[current].add(vi - 1)
                        except ValueError:
                            continue
    except FileNotFoundError:
        return {}
    centers = {}
    for name, idxs in used_by_obj.items():
        if not idxs:
            continue
        sx = sy = sz = 0.0
        n = 0
        for i in idxs:
            if 0 <= i < len(vertices):
                x, y, z = vertices[i]
                sx += x
                sy += y
                sz += z
                n += 1
        if n:
            centers[name] = {'x': sx / n, 'y': sy / n, 'z': sz / n}
    return centers


def centroid_from_obj(path):
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            sx = sy = sz = 0.0
            n = 0
            for line in f:
                if line.startswith('v '):
                    parts = line.strip().split()
                    if len(parts) >= 4:
                        try:
                            x = float(parts[1])
                            y = float(parts[2])
                            z = float(parts[3])
                            sx += x
                            sy += y
                            sz += z
                            n += 1
                        except ValueError:
                            pass
            if n:
                return {'x': sx/n, 'y': sy/n, 'z': sz/n}
    except FileNotFoundError:
        return None
    return None


TOOTH_NAME_RE = re.compile(r"^D(?P<tooth>\d{2})[A-Z]_", re.IGNORECASE)


def parse_assembly_tooth_centers(path):
    """Aggregate centers per tooth from ArcadaCompleta.obj.
    We reuse the same parsing approach but group vertex indices by tooth id
    based on object name prefix like 'D32C_*' / 'D32R_*' etc.
    """
    vertices = []
    used_by_tooth = defaultdict(set)
    current = None
    current_tooth = None
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if not line:
                    continue
                if line.startswith('o '):
                    current = line[2:].strip()
                    m = TOOTH_NAME_RE.match(current)
                    current_tooth = m.group('tooth') if m else None
                    continue
                if line.startswith('v '):
                    parts = line.strip().split()
                    if len(parts) >= 4:
                        try:
                            x = float(parts[1])
                            y = float(parts[2])
                            z = float(parts[3])
                            vertices.append((x, y, z))
                        except ValueError:
                            pass
                    continue
                if line.startswith('f ') and current_tooth:
                    parts = line.strip().split()[1:]
                    for p in parts:
                        idx_str = p.split('/')[0]
                        try:
                            vi = int(idx_str)
                            if vi < 0:
                                vi = len(vertices) + 1 + vi
                            used_by_tooth[current_tooth].add(vi - 1)
                        except ValueError:
                            continue
    except FileNotFoundError:
        return {}
    centers = {}
    for tooth, idxs in used_by_tooth.items():
        if not idxs:
            continue
        sx = sy = sz = 0.0
        n = 0
        for i in idxs:
            if 0 <= i < len(vertices):
                x, y, z = vertices[i]
                sx += x
                sy += y
                sz += z
                n += 1
        if n:
            centers[tooth] = {'x': sx / n, 'y': sy / n, 'z': sz / n}
    return centers


if __name__ == '__main__':
    out = build_manifest()
    print(f'Manifest written to {out}')
