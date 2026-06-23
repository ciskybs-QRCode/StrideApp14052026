#!/usr/bin/env python3
"""
fix-scope3.py  —  uses `npx tsc --noEmit` output to inject missing
`const X = make_X(...)` / `const colors = useColors()` into the exact
enclosing function body for each TS2304 error.
"""
import re, os, subprocess

STRIDE_APP = os.path.abspath("artifacts/stride-app")

def run_tsc():
    result = subprocess.run(
        ["npx", "tsc", "-p", "tsconfig.json", "--noEmit"],
        capture_output=True, text=True, cwd=STRIDE_APP
    )
    return result.stdout + result.stderr

def find_make_map(src):
    result = {}
    for m in re.finditer(r'const\s+(make_\w+)\s*=\s*\(primary', src):
        mn = m.group(1)
        result[mn[5:]] = mn  # strip make_
    return result

def process_file(filepath, errors_by_var):
    with open(filepath, encoding='utf-8') as f:
        src = f.read()
    lines = src.split('\n')
    make_map = find_make_map(src)
    insertions = {}  # insert_after_line_0based -> [str]

    for var_name, error_lines in errors_by_var.items():
        min_err = min(error_lines) - 1  # 0-based

        # Walk backwards from the error line to find the enclosing function's opening {
        depth = 0
        brace_line = -1
        for i in range(min_err, -1, -1):
            for ch in reversed(lines[i]):
                if ch == '}':
                    depth += 1
                elif ch == '{':
                    if depth > 0:
                        depth -= 1
                    else:
                        brace_line = i
                        break
            if brace_line != -1:
                break

        if brace_line == -1:
            print(f"  SKIP {var_name}@{min_err+1}: no enclosing brace found")
            continue

        # Body from brace_line to min_err
        body = '\n'.join(lines[brace_line:min_err+1])

        has_colors = bool(re.search(r'\bconst\s+colors\s*=\s*useColors\(\)', body))
        has_var    = bool(re.search(rf'\bconst\s+{re.escape(var_name)}\s*=\s*make_', body))

        if var_name == 'colors' and has_colors:
            continue
        if var_name != 'colors' and has_var:
            continue

        # Insertion point: after `const colors = useColors()` if present, else after opening brace
        insert_after = brace_line
        for j in range(brace_line + 1, min_err):
            if re.search(r'\bconst\s+colors\s*=\s*useColors\(\)', lines[j]):
                insert_after = j
                break

        # Get indent
        indent = '  '
        for j in range(brace_line + 1, min(len(lines), brace_line + 6)):
            m2 = re.match(r'^(\s+)', lines[j])
            if m2:
                indent = m2.group(1)
                break

        to_add = []
        if var_name == 'colors' and not has_colors:
            to_add.append(f'{indent}const colors = useColors();')
        elif not has_var:
            if not has_colors:
                to_add.append(f'{indent}const colors = useColors();')
            mn = make_map.get(var_name)
            if mn:
                to_add.append(f'{indent}const {var_name} = {mn}(colors.primary, colors.secondary);')
            else:
                print(f"  SKIP {var_name}: no make_{var_name} found in {os.path.basename(filepath)}")
                continue

        if to_add:
            insertions.setdefault(insert_after, [])
            for t in to_add:
                if t not in insertions[insert_after]:
                    insertions[insert_after].append(t)

    if not insertions:
        return False

    for li in sorted(insertions.keys(), reverse=True):
        lines[li+1:li+1] = insertions[li]

    new_src = '\n'.join(lines)
    if new_src == src:
        return False
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_src)
    return True

# ─── Main ────────────────────────────────────────────────────────────────────
print("Running tsc...")
tsc_out = run_tsc()

err_re = re.compile(
    r'^(app/[^\(]+)\((\d+),\d+\): error TS2304: Cannot find name \'(\w+)\'',
    re.MULTILINE
)
files_errors = {}
for m in err_re.finditer(tsc_out):
    rel  = m.group(1).strip()
    line = int(m.group(2))
    var  = m.group(3)
    fp   = os.path.join(STRIDE_APP, rel)
    files_errors.setdefault(fp, {}).setdefault(var, set()).add(line)

print(f"Found {len(files_errors)} files with TS2304 errors")

changed = 0
for filepath, errors in sorted(files_errors.items()):
    if not os.path.exists(filepath):
        print(f"  MISSING: {filepath}")
        continue
    if process_file(filepath, errors):
        changed += 1
        print(f"  ✓  {os.path.relpath(filepath, STRIDE_APP)} {list(errors.keys())}")
    else:
        print(f"  -  {os.path.relpath(filepath, STRIDE_APP)} (no change)")

print(f"\nFixed {changed} files")
