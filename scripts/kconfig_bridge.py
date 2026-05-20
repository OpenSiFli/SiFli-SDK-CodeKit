#!/usr/bin/env python3

import argparse
import json
import os
import re
import sys
import tempfile
from pathlib import Path


TRI_TO_STR = {0: "n", 1: "m", 2: "y"}
STR_TO_TRI = {"n": 0, "m": 1, "y": 2}


def fail(message, code=1):
    print(message, file=sys.stderr)
    sys.exit(code)


def normalize_path(path_value):
    return str(Path(path_value).expanduser().resolve())


def parse_board(board_name):
    for suffix in ("_lcpu", "_hcpu", "_acpu"):
        if board_name.endswith(suffix):
            return board_name[: -len(suffix)], suffix[1:]
    return board_name, "hcpu"


def infer_chip(board_name):
    match = re.search(r"sf32lb\d+", board_name, re.IGNORECASE)
    return match.group(0).upper() if match else ""


def import_kconfiglib(sdk_path):
    kconfig_dir = os.path.join(sdk_path, "tools", "kconfig")
    if not os.path.isfile(os.path.join(kconfig_dir, "kconfiglib.py")):
        fail("SDK Kconfiglib not found: {}".format(kconfig_dir))
    sys.path.insert(0, kconfig_dir)
    try:
        import kconfiglib  # type: ignore
    except Exception as exc:
        fail("Failed to import SDK Kconfiglib: {}".format(exc))
    return kconfiglib


def resolve_board_path(sdk_path, board_name, board_search_path):
    board, core = parse_board(board_name)
    board_root = os.path.join(sdk_path, "customer", "boards")
    if board_search_path:
        candidate_root = normalize_path(board_search_path)
        if os.path.exists(os.path.join(candidate_root, board)):
            board_root = candidate_root

    board_path = os.path.join(board_root, board, core)
    board_conf = os.path.join(board_path, "board.conf")
    if not os.path.isfile(board_conf):
        fail("Board config not found: {}".format(board_conf))
    if not os.path.isfile(os.path.join(board_path, "Kconfig.board")):
        fail("Board Kconfig not found: {}".format(os.path.join(board_path, "Kconfig.board")))
    return board, core, board_path, board_conf


def build_top_kconfig_content(sdk_path, project_path, board_path):
    lines = [
        'source "{}"'.format(os.path.join(board_path, "Kconfig.board").replace("\\", "/")),
        'source "{}"'.format(os.path.join(sdk_path, "customer", "boards", "Kconfig.v2").replace("\\", "/")),
        'source "{}"'.format(os.path.join(sdk_path, "Kconfig.v2").replace("\\", "/")),
        'orsource "{}"'.format(os.path.join(project_path, "sf-pkgs", "Kconfig.conandeps").replace("\\", "/")),
        'source "{}"'.format(os.path.join(project_path, "Kconfig.proj").replace("\\", "/")),
        "",
    ]
    return "\n".join(lines)


def read_stdin_json():
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        fail("Invalid JSON input: {}".format(exc))


def get_symbol_value(kconfiglib, sym):
    if sym.orig_type in (kconfiglib.BOOL, kconfiglib.TRISTATE):
        return TRI_TO_STR.get(sym.tri_value, "n")
    return sym.str_value


def get_symbol_type(kconfiglib, sym):
    type_to_str = getattr(kconfiglib, "TYPE_TO_STR", {})
    return type_to_str.get(sym.orig_type, "unknown")


def expr_to_str(kconfiglib, expr):
    try:
        return kconfiglib.expr_str(expr)
    except Exception:
        return ""


def prompt_text(node):
    if node.prompt:
        return node.prompt[0] or ""
    return ""


def prompt_visible(kconfiglib, node):
    if not node.prompt:
        return False
    try:
        if kconfiglib.expr_value(node.prompt[1]) <= 0:
            return False
        if node.item == kconfiglib.MENU and kconfiglib.expr_value(node.visibility) <= 0:
            return False
        return True
    except Exception:
        return False


def node_location(node):
    filename = getattr(node, "filename", "")
    lineno = getattr(node, "lineno", None)
    if filename and lineno:
        return "{}:{}".format(filename, lineno)
    return filename or ""


def node_help(node):
    return getattr(node, "help", None) or ""


def symbol_editable(kconfiglib, sym, visible):
    if not visible:
        return False
    if sym.orig_type in (kconfiglib.BOOL, kconfiglib.TRISTATE):
        return len(sym.assignable) > 0
    return sym.visibility > 0


def convert_tree(kconfiglib, root_node):
    sequence = {"value": 0}

    def next_id(prefix):
        sequence["value"] += 1
        return "{}:{}".format(prefix, sequence["value"])

    def convert_node(node):
        children = []
        child = node.list
        while child:
            converted = convert_node(child)
            if converted:
                children.append(converted)
            child = child.next

        item = node.item
        prompt = prompt_text(node)
        visible = prompt_visible(kconfiglib, node)

        if isinstance(item, kconfiglib.Symbol):
            if not prompt and not children:
                return None
            assignable = [TRI_TO_STR[value] for value in item.assignable] if item.orig_type in (
                kconfiglib.BOOL,
                kconfiglib.TRISTATE,
            ) else []
            choice_id = None
            kind = "symbol"
            if item.choice is not None:
                choice_id = "choice:{}:{}".format(node_location(item.choice.nodes[0]) if item.choice.nodes else item.name, id(item.choice))
                kind = "choice-item"
            return {
                "id": next_id("sym"),
                "kind": kind,
                "prompt": prompt or item.name,
                "symbol": item.name,
                "type": get_symbol_type(kconfiglib, item),
                "value": get_symbol_value(kconfiglib, item),
                "assignable": assignable,
                "visible": visible,
                "editable": symbol_editable(kconfiglib, item, visible),
                "help": node_help(node),
                "location": node_location(node),
                "dependsOn": expr_to_str(kconfiglib, item.direct_dep),
                "choiceId": choice_id,
                "children": children,
            }

        if isinstance(item, kconfiglib.Choice):
            if not prompt and not children:
                return None
            selection = item.selection.name if item.selection is not None else ""
            return {
                "id": next_id("choice"),
                "kind": "choice",
                "prompt": prompt or "Choice",
                "symbol": "",
                "type": "choice",
                "value": selection,
                "assignable": [],
                "visible": visible,
                "editable": visible,
                "help": node_help(node),
                "location": node_location(node),
                "dependsOn": expr_to_str(kconfiglib, item.direct_dep),
                "children": children,
            }

        if item == kconfiglib.MENU:
            if not prompt and not children:
                return None
            return {
                "id": next_id("menu"),
                "kind": "menu",
                "prompt": prompt or "Menu",
                "symbol": "",
                "type": "menu",
                "value": "",
                "assignable": [],
                "visible": visible,
                "editable": False,
                "help": node_help(node),
                "location": node_location(node),
                "dependsOn": expr_to_str(kconfiglib, node.visibility),
                "children": children,
            }

        if item == kconfiglib.COMMENT:
            if not prompt:
                return None
            return {
                "id": next_id("comment"),
                "kind": "comment",
                "prompt": prompt,
                "symbol": "",
                "type": "comment",
                "value": "",
                "assignable": [],
                "visible": visible,
                "editable": False,
                "help": node_help(node),
                "location": node_location(node),
                "dependsOn": "",
                "children": children,
            }

        return children[0] if len(children) == 1 else None

    nodes = []
    node = root_node.list
    while node:
        converted = convert_node(node)
        if converted:
            nodes.append(converted)
        node = node.next
    return nodes


def apply_changes(kconfiglib, kconf, changes):
    for change in changes:
        name = str(change.get("symbol", "")).strip()
        value = str(change.get("value", "")).strip()
        if not name:
            fail("Kconfig change is missing symbol.")
        if name not in kconf.syms:
            fail("Unknown Kconfig symbol: {}".format(name))

        sym = kconf.syms[name]
        if sym.orig_type in (kconfiglib.BOOL, kconfiglib.TRISTATE):
            if value not in STR_TO_TRI:
                fail("Invalid value '{}' for symbol {}".format(value, name))
            if STR_TO_TRI[value] not in sym.assignable and value != get_symbol_value(kconfiglib, sym):
                fail("Value '{}' is not assignable for symbol {}".format(value, name))
        elif sym.visibility <= 0:
            fail("Symbol {} is not user editable.".format(name))

        sym.set_value(value)


def load_kconfig(args, top_kconfig_path, kconfiglib, board_conf):
    kconf = kconfiglib.Kconfig(top_kconfig_path, warn_to_stderr=False, suppress_traceback=True)
    kconf.warn_assign_undef = True
    kconf.warn_assign_override = False
    kconf.warn_assign_redun = False
    kconf.warn_unsatisfied_deps = False

    kconf.load_config(board_conf)
    with open(board_conf, "r", encoding="utf-8", errors="replace") as handle:
        kconf.excluding_sym = handle.readlines()

    if os.path.exists(args.config):
        kconf.load_config(args.config, replace=False)
    else:
        fail("Project config not found: {}".format(args.config))
    return kconf


def build_context(args):
    sdk_path = normalize_path(args.sdk)
    project_path = normalize_path(args.project)
    config_path = normalize_path(args.config or os.path.join(project_path, "proj.conf"))
    board_name = args.board.strip()
    if not board_name or board_name == "N/A":
        fail("No SiFli board is selected.")
    if not os.path.isdir(project_path):
        fail("Project path not found: {}".format(project_path))
    if not os.path.isfile(os.path.join(project_path, "Kconfig.proj")):
        fail("Project Kconfig.proj not found: {}".format(os.path.join(project_path, "Kconfig.proj")))
    if not os.path.isdir(sdk_path):
        fail("SDK path not found: {}".format(sdk_path))
    if not os.path.isfile(config_path):
        fail("Project config not found: {}".format(config_path))

    board, core, board_path, board_conf = resolve_board_path(sdk_path, board_name, args.board_search_path)
    return sdk_path, project_path, config_path, board_name, board, core, board_path, board_conf


def snapshot_payload(args, kconfiglib, kconf, dirty=False, generated_files=None):
    return {
        "projectRoot": args.workspace or str(Path(args.project).parent),
        "projectPath": args.project,
        "sdkPath": args.sdk,
        "boardName": args.board,
        "configFile": args.config,
        "nodes": convert_tree(kconfiglib, kconf.top_node),
        "warnings": list(getattr(kconf, "warnings", [])),
        "dirty": dirty,
        "generatedFiles": generated_files or [],
    }


def build_generation_conf_list(project_path, board, board_conf):
    conf_list = [board_conf, os.path.join(project_path, "proj.conf")]
    chip = ""
    rtconfig_path = os.path.join(project_path, "rtconfig.py")
    if os.path.isfile(rtconfig_path):
        try:
            with open(rtconfig_path, "r", encoding="utf-8", errors="replace") as handle:
                match = re.search(r"^\s*CHIP\s*=\s*['\"]([^'\"]+)['\"]", handle.read(), re.MULTILINE)
            chip = match.group(1).lower() if match else ""
        except Exception:
            chip = ""
    if not chip:
        chip = infer_chip(board).lower()

    chip_conf = os.path.join(project_path, chip, "proj.conf") if chip else ""
    board_conf_extra = os.path.join(project_path, board, "proj.conf")
    if chip_conf and os.path.exists(chip_conf):
        conf_list.append(chip_conf)
    if os.path.exists(board_conf_extra):
        conf_list.append(board_conf_extra)
    return conf_list


def generate_build_outputs(args, sdk_path, project_path, board, core, board_path, board_conf, kconfiglib):
    build_dir = args.build_dir
    if not build_dir:
        build_dir = os.path.join(project_path, "build_{}_{}".format(board, core))
    build_dir = normalize_path(build_dir)
    os.makedirs(build_dir, exist_ok=True)

    top_kconfig_path = os.path.join(build_dir, "Kconfig")
    with open(top_kconfig_path, "w", encoding="utf-8") as handle:
        handle.write(build_top_kconfig_content(sdk_path, project_path, board_path))

    kconf = kconfiglib.Kconfig(top_kconfig_path, warn_to_stderr=False, suppress_traceback=True)
    for index, config_path in enumerate(build_generation_conf_list(project_path, board, board_conf)):
        kconf.load_config(config_path, replace=(index == 0))

    config_out = os.path.join(build_dir, ".config")
    header_out = os.path.join(build_dir, "rtconfig.h")
    kconfig_list_out = os.path.join(build_dir, "kconfiglist")
    kconf.write_config(config_out)
    kconf.write_autoconf(header_out)
    with open(kconfig_list_out, "w", encoding="utf-8") as handle:
        for filename in sorted(os.path.realpath(path) for path in kconf.kconfig_filenames):
            handle.write(filename + "\n")
    return [config_out, header_out, kconfig_list_out]


def run(args):
    sdk_path, project_path, config_path, board_name, board, core, board_path, board_conf = build_context(args)
    args.sdk = sdk_path
    args.project = project_path
    args.config = config_path

    os.environ["SIFLI_SDK"] = sdk_path
    os.environ["SIFLI_SDK_PATH"] = sdk_path
    kconfiglib = import_kconfiglib(sdk_path)

    input_payload = read_stdin_json() if args.command in ("preview", "save") else {}
    changes = input_payload.get("changes", [])
    if not isinstance(changes, list):
        fail("Input 'changes' must be an array.")

    with tempfile.TemporaryDirectory(prefix="codekit-kconfig-") as temp_dir:
        top_kconfig_path = os.path.join(temp_dir, "Kconfig")
        with open(top_kconfig_path, "w", encoding="utf-8") as handle:
            handle.write(build_top_kconfig_content(sdk_path, project_path, board_path))

        kconf = load_kconfig(args, top_kconfig_path, kconfiglib, board_conf)

        if args.command in ("preview", "save"):
            apply_changes(kconfiglib, kconf, changes)

        generated_files = []
        if args.command == "save":
            kconf.write_min_config(config_path)
            generated_files = generate_build_outputs(args, sdk_path, project_path, board, core, board_path, board_conf, kconfiglib)
            kconf = load_kconfig(args, top_kconfig_path, kconfiglib, board_conf)

        return snapshot_payload(
            args,
            kconfiglib,
            kconf,
            dirty=args.command == "preview" and len(changes) > 0,
            generated_files=generated_files,
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["snapshot", "preview", "save"])
    parser.add_argument("--sdk", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--workspace", default="")
    parser.add_argument("--board", required=True)
    parser.add_argument("--board-search-path", default="")
    parser.add_argument("--config", default="")
    parser.add_argument("--build-dir", default="")
    args = parser.parse_args()

    try:
        payload = run(args)
    except SystemExit:
        raise
    except Exception as exc:
        fail(str(exc))

    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
