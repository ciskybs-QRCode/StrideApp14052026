#!/usr/bin/env python3
"""
fix-scope2.py

For every .tsx file that has make_XXX factory functions,
find every React component function that uses the result variable (styles, S, ss, em, etc.)
but doesn't declare it in its own body — then inject the declaration right after
the first `const colors = useColors();` call, or after the opening `{` of the function.

Also fixes: if a component uses `colors.` but has no `const colors = useColors()`, injects it.
"""

import re
import os
import glob

STRIDE_APP = "artifacts/stride-app"
SKIP = {"useColors.ts", "BrandingContext.tsx", "colors.ts", "app-customization.tsx", "PdfBadgeGenerator.tsx"}

def walk(base):
    files = []
    for root, dirs, filenames in os.walk(base):
        dirs[:] = [d for d in dirs if d != "node_modules"]
        for f in filenames:
            if f.endswith(".tsx") or f.endswith(".ts"):
                if f not in SKIP:
                    files.append(os.path.join(root, f))
    return files

def find_make_map(src):
    """Returns {varName: makeName} e.g. {'styles': 'make_styles', 'S': 'make_S'}"""
    result = {}
    for m in re.finditer(r'const\s+(make_\w+)\s*=\s*\(primary', src):
        make_name = m.group(1)
        var_name = make_name[len("make_"):]  # strip make_
        result[var_name] = make_name
    return result

def find_function_blocks(src):
    """
    Find all top-level and nested function/const component declarations.
    Returns list of (fn_name, body_start_char, body_end_char) tuples.
    body_start_char is the index of the opening '{' of the function body.
    """
    results = []

    # Pattern: function FnName( or export function/default function etc.
    fn_re = re.compile(
        r'(?:^|\n)'
        r'(?:export\s+(?:default\s+)?)?'
        r'(?:function\s+([A-Za-z_]\w*)\s*[(<]'
        r'|const\s+([A-Za-z_]\w*)\s*(?::\s*React\.FC[^=]*)?\s*=\s*(?:React\.memo\s*\(|React\.forwardRef\s*\(|\([^)]*\)\s*(?::\s*\w[^=]*)?\s*=>))',
    )

    for m in fn_re.finditer(src):
        fn_name = m.group(1) or m.group(2)
        if not fn_name:
            continue

        # Find the opening brace of this function's body
        start = m.start()
        brace_pos = src.find('{', m.end())
        if brace_pos == -1:
            continue

        # Count braces to find end
        depth = 0
        end_pos = brace_pos
        for i in range(brace_pos, len(src)):
            if src[i] == '{':
                depth += 1
            elif src[i] == '}':
                depth -= 1
                if depth == 0:
                    end_pos = i
                    break

        results.append((fn_name, brace_pos, end_pos))

    return results

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        src = f.read()

    make_map = find_make_map(src)
    if not make_map and 'useColors' not in src:
        return False

    # For files with make_map, find components that use variables without declaring them
    fn_blocks = find_function_blocks(src)
    if not fn_blocks:
        return False

    # Collect insertions: list of (insert_after_pos, text_to_insert)
    insertions = []

    for fn_name, body_start, body_end in fn_blocks:
        body = src[body_start:body_end+1]

        # Determine indentation from the first real line in the body
        lines_in_body = body.split('\n')
        indent = '  '
        for line in lines_in_body[1:4]:
            m = re.match(r'^(\s+)', line)
            if m:
                indent = m.group(1)
                break

        # Check if this component uses colors but doesn't declare it
        uses_colors = bool(re.search(r'\bcolors\.\w+', body))
        has_colors_decl = bool(re.search(r'\bconst\s+colors\s*=\s*useColors\(\)', body))

        # Check for each make_XXX variable
        missing_vars = []
        for var_name, make_name in make_map.items():
            # Does this component USE this variable? (e.g. styles.xxx or S.xxx)
            # Be careful: don't match the make_styles definition itself
            use_pattern = re.compile(rf'\b{re.escape(var_name)}\s*\.')
            has_use = bool(use_pattern.search(body))
            if not has_use:
                continue

            # Does it DECLARE it?
            decl_pattern = re.compile(rf'\bconst\s+{re.escape(var_name)}\s*=\s*make_\w+\(')
            has_decl = bool(decl_pattern.search(body))
            if not has_decl:
                missing_vars.append((var_name, make_name))

        if not missing_vars and (not uses_colors or has_colors_decl):
            continue

        # Find insertion point: after `const colors = useColors();`
        # or after the opening brace of the function
        colors_match = re.search(r'const\s+colors\s*=\s*useColors\(\);\s*\n', body)
        if colors_match:
            insert_at_body_offset = colors_match.end()
        else:
            # Insert right after opening brace + newline
            newline_pos = body.find('\n', 1)
            insert_at_body_offset = newline_pos + 1 if newline_pos != -1 else 1

        insert_at_src = body_start + insert_at_body_offset

        to_insert_lines = []

        # Add useColors if missing
        if uses_colors and not has_colors_decl:
            to_insert_lines.append(f'{indent}const colors = useColors();')

        # Add missing make_XXX calls
        for var_name, make_name in missing_vars:
            to_insert_lines.append(f'{indent}const {var_name} = {make_name}(colors.primary, colors.secondary);')

        if to_insert_lines:
            insertions.append((insert_at_src, '\n'.join(to_insert_lines) + '\n'))

    if not insertions:
        return False

    # Apply insertions in reverse order of position so indices remain valid
    insertions.sort(key=lambda x: x[0], reverse=True)
    chars = list(src)
    for pos, text in insertions:
        chars[pos:pos] = list(text)
    new_src = ''.join(chars)

    if new_src == src:
        return False

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_src)
    return True

files = walk(os.path.join(STRIDE_APP, "app")) + walk(os.path.join(STRIDE_APP, "components"))
changed = 0
for f in sorted(files):
    try:
        if process_file(f):
            changed += 1
            print(f"  ✓  {f}")
    except Exception as e:
        print(f"  ✗  {f}: {e}")

print(f"\nFixed {changed} files")
