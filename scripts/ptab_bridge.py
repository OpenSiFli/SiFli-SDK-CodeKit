#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0

from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='CodeKit PTAB v3 bridge')
    parser.add_argument('command', choices=['snapshot'])
    parser.add_argument('--sdk', required=True)
    parser.add_argument('--project', required=True)
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--board', required=True)
    parser.add_argument('--board-search-path')
    parser.add_argument('--candidate-base-ptab')
    parser.add_argument('--candidate-full-ptab')
    parser.add_argument('--candidate-chip-overlay')
    parser.add_argument('--candidate-board-overlay')
    return parser.parse_args()


def _add_sdk_paths(sdk_root: str) -> None:
    tools_dir = os.path.join(sdk_root, 'tools')
    build_tools = os.path.join(tools_dir, 'build')
    for item in (tools_dir, build_tools):
        if item not in sys.path:
            sys.path.insert(0, item)


def _import_sdk_modules(sdk_root: str):
    _add_sdk_paths(sdk_root)
    import ptab as ptab_module
    from validate_ptab_v3 import validate_ptab_v3
    from sdk_py_actions import ptab_ext

    return ptab_module, validate_ptab_v3, ptab_ext


def _load_yaml_mapping(path: str) -> Dict[str, Any]:
    with open(path, encoding='utf-8-sig') as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError(f'{path}: expected YAML mapping')
    return data


def _validation_issues(validate_ptab_v3, ptab_obj: Any) -> List[Dict[str, str]]:
    issues = validate_ptab_v3(ptab_obj)
    return [
        {
            'severity': str(getattr(issue, 'severity', 'error') or 'error'),
            'message': str(getattr(issue, 'message', issue)),
        }
        for issue in issues
    ]


def _hex_or_none(value: Optional[int], width: int = 8) -> Optional[str]:
    if value is None:
        return None
    return f'0x{int(value):0{width}X}'


def _parse_size_or_none(ptab_module: Any, value: Any) -> Optional[int]:
    try:
        return int(ptab_module.parse_size(value))
    except Exception:
        return None


def _raw_partition_names(path: Optional[str]) -> set[str]:
    if not path or not os.path.exists(path):
        return set()
    try:
        data = _load_yaml_mapping(path)
    except Exception:
        return set()
    partitions = data.get('partitions')
    if not isinstance(partitions, list):
        return set()
    return {
        str(item.get('name') or '').strip().lower()
        for item in partitions
        if isinstance(item, dict) and str(item.get('name') or '').strip()
    }


def _source_by_partition(
    partition_names: List[str],
    base_path: Optional[str],
    source_mode: str,
    operations: List[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    base_names = _raw_partition_names(base_path)
    out: Dict[str, Dict[str, Any]] = {}
    for name in partition_names:
        key = name.lower()
        if source_mode == 'project_full':
            out[key] = {'source': 'project', 'overlayFields': [], 'overlayOperation': None}
        elif key in base_names:
            out[key] = {'source': 'base', 'overlayFields': [], 'overlayOperation': None}
        else:
            out[key] = {'source': 'generated', 'overlayFields': [], 'overlayOperation': None}

    for op in operations:
        name = str(op.get('name') or '').strip().lower()
        if not name:
            continue
        layer = str(op.get('layer') or '').strip()
        out[name] = {
            'source': 'chip_overlay' if layer == 'chip' else 'board_overlay',
            'overlayFields': op.get('fields') or [],
            'overlayOperation': op.get('kind'),
        }
    return out


def _partition_payload(
    ptab_module: Any,
    partitions: List[Dict[str, Any]],
    source_info: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for partition in partitions:
        if not isinstance(partition, dict):
            continue
        name = str(partition.get('name') or '').strip()
        if not name:
            continue
        offset_bytes = _parse_size_or_none(ptab_module, partition.get('offset', 0))
        size_bytes = _parse_size_or_none(ptab_module, partition.get('size', 0))
        end_offset = None
        if offset_bytes is not None and size_bytes is not None:
            end_offset = offset_bytes + size_bytes
        item = dict(partition)
        item['offset_bytes'] = offset_bytes if offset_bytes is not None else 0
        item['offset_hex'] = _hex_or_none(offset_bytes)
        item['size_bytes'] = size_bytes if size_bytes is not None else 0
        item['size_hex'] = _hex_or_none(size_bytes)
        item['end_offset'] = end_offset if end_offset is not None else 0
        item['end_offset_hex'] = _hex_or_none(end_offset)
        item.update(source_info.get(name.lower(), {}))
        result.append(item)
    return result


def _prepare_actual(
    ptab_module: Any,
    project: str,
    board: str,
    chip_dir: str,
    board_path: Optional[str],
) -> Tuple[Dict[str, Any], Any, Optional[Dict[str, Any]]]:
    prepared = ptab_module.prepare_project_ptab(
        project,
        board,
        chip_dir,
        board_path=board_path,
        emit_summary=False,
        validate=False,
        strict_validation=False,
    )
    ptab_obj = prepared.get('ptab_obj')
    if not ptab_obj or not ptab_obj.is_v3():
        raise ValueError('PTAB visualization only supports ptab v3 (ptab.yaml). ptab v1/v2 is not supported.')
    return prepared, ptab_obj, prepared.get('merged_data')


def _prepare_candidate(
    args: argparse.Namespace,
    ptab_module: Any,
    project: str,
    board: str,
    chip_dir: str,
    board_path: Optional[str],
) -> Tuple[Dict[str, Any], Any, Optional[Dict[str, Any]]]:
    resolved = ptab_module.resolve_project_ptab_paths(project, board, chip_dir, board_path=board_path)
    overlay_paths = resolved.get('overlay_paths') or {}

    if args.candidate_full_ptab:
        full_path = os.path.abspath(args.candidate_full_ptab)
        ptab_obj = ptab_module.load_ptab(full_path, fatal=False)
        if not ptab_obj or not ptab_obj.is_v3():
            raise ValueError('Candidate project PTAB must be ptab v3 YAML.')
        data = _load_yaml_mapping(full_path)
        return {
            'path': full_path,
            'effective_path': full_path,
            'base_path': full_path,
            'project_root': project,
            'board': board,
            'chip': chip_dir,
            'uses_overlay': False,
            'overlay_paths': overlay_paths,
            'report': {
                'base_path': full_path,
                'overlay_paths': overlay_paths,
                'effective_path': full_path,
                'operations': [],
                'validation': [],
            },
            'merged_data': None,
            'ptab_obj': ptab_obj,
        }, ptab_obj, data

    base_path = os.path.abspath(args.candidate_base_ptab) if args.candidate_base_ptab else resolved.get('board_base_ptab')
    chip_overlay = (
        os.path.abspath(args.candidate_chip_overlay)
        if args.candidate_chip_overlay
        else overlay_paths.get('chip')
    )
    board_overlay = (
        os.path.abspath(args.candidate_board_overlay)
        if args.candidate_board_overlay
        else overlay_paths.get('board')
    )

    if not base_path:
        raise ValueError('Board-level ptab.yaml was not found.')

    if chip_overlay or board_overlay:
        if resolved.get('project_full_ptab'):
            raise ValueError('Project-level ptab.yaml/ptab.json and ptab.overlay.yaml cannot be used together')
        merged_data, report = ptab_module.build_effective_ptab_v3(
            base_path,
            chip_overlay_path=chip_overlay,
            board_overlay_path=board_overlay,
            strict_validation=False,
        )
        report['effective_path'] = base_path
        ptab_obj = ptab_module.PtabV3(base_path, merged_data)
        return {
            'path': base_path,
            'effective_path': base_path,
            'base_path': base_path,
            'project_root': project,
            'board': board,
            'chip': chip_dir,
            'uses_overlay': True,
            'overlay_paths': {
                'chip': chip_overlay,
                'board': board_overlay,
            },
            'report': report,
            'merged_data': merged_data,
            'ptab_obj': ptab_obj,
        }, ptab_obj, merged_data

    ptab_obj = ptab_module.load_ptab(base_path, fatal=False)
    if not ptab_obj or not ptab_obj.is_v3():
        raise ValueError('PTAB visualization only supports ptab v3 (ptab.yaml). ptab v1/v2 is not supported.')
    return {
        'path': base_path,
        'effective_path': base_path,
        'base_path': base_path,
        'project_root': project,
        'board': board,
        'chip': chip_dir,
        'uses_overlay': False,
        'overlay_paths': overlay_paths,
        'report': {
            'base_path': base_path,
            'overlay_paths': overlay_paths,
            'effective_path': base_path,
            'operations': [],
            'validation': [],
        },
        'merged_data': None,
        'ptab_obj': ptab_obj,
    }, ptab_obj, _load_yaml_mapping(base_path)


def _snapshot(args: argparse.Namespace) -> Dict[str, Any]:
    sdk_root = os.path.abspath(args.sdk)
    project = os.path.abspath(args.project)
    ptab_module, validate_ptab_v3, ptab_ext = _import_sdk_modules(sdk_root)

    board = ptab_module.normalize_board_name(args.board)
    chip_dir = ptab_module.detect_chip_dir_from_board(
        board,
        board_search_path=args.board_search_path,
        sdk_root=sdk_root,
    )
    if not chip_dir:
        raise ValueError(f'Unable to detect CHIP from board rtconfig.py: {board}')

    board_path, _ = ptab_module.get_board_paths(
        board,
        board_search_path=args.board_search_path,
        sdk_root=sdk_root,
    )

    has_candidate = any(
        (
            args.candidate_base_ptab,
            args.candidate_full_ptab,
            args.candidate_chip_overlay,
            args.candidate_board_overlay,
        )
    )
    if has_candidate:
        prepared, ptab_obj, effective_data = _prepare_candidate(args, ptab_module, project, board, chip_dir, board_path)
    else:
        prepared, ptab_obj, effective_data = _prepare_actual(ptab_module, project, board, chip_dir, board_path)

    chip_config = ptab_obj.get_chip_config()
    usage_data = ptab_ext.build_ptab_usage_data(
        ptab_module,
        prepared,
        ptab_obj,
        chip_config,
        project,
        board,
        chip_dir,
    )

    report = prepared.get('report') or {}
    operations = report.get('operations') or []
    resolved = ptab_module.resolve_project_ptab_paths(project, board, chip_dir, board_path=board_path)
    source_mode = 'project_full' if resolved.get('project_full_ptab') and not has_candidate else (
        'overlay' if prepared.get('uses_overlay') else 'board'
    )
    if args.candidate_full_ptab:
        source_mode = 'project_full'

    effective_partitions = ptab_obj.partitions
    source_info = _source_by_partition(
        [str(item.get('name') or '') for item in effective_partitions if isinstance(item, dict)],
        prepared.get('base_path'),
        source_mode,
        operations,
    )
    validation = _validation_issues(validate_ptab_v3, ptab_obj)

    return {
        'schema_version': 1,
        'metadata': {
            'workspace_root': os.path.abspath(args.workspace),
            'project_dir': project,
            'sdk_root': sdk_root,
            'board': args.board,
            'normalized_board': board,
            'chip': getattr(ptab_obj, 'chip', None) or '',
            'chip_dir': chip_dir,
            'board_path': board_path,
            'source_mode': source_mode,
            'uses_overlay': bool(prepared.get('uses_overlay')),
            'base_path': prepared.get('base_path'),
            'effective_path': prepared.get('effective_path'),
            'project_full_ptab': resolved.get('project_full_ptab'),
            'project_yaml_ptab': resolved.get('project_yaml_ptab'),
            'overlay_paths': prepared.get('overlay_paths') or {},
        },
        'effective_data': effective_data,
        'regions': usage_data.get('regions') or [],
        'usage_entries': usage_data.get('partitions') or [],
        'gaps': usage_data.get('gaps') or [],
        'overlaps': usage_data.get('overlaps') or [],
        'partitions': _partition_payload(ptab_module, effective_partitions, source_info),
        'validation': validation,
        'overlay_operations': operations,
    }


def main() -> int:
    args = _parse_args()
    try:
        if args.command == 'snapshot':
            payload = _snapshot(args)
        else:
            raise ValueError(f'Unsupported command: {args.command}')
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        if os.environ.get('CODEKIT_PTAB_BRIDGE_DEBUG'):
            traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
