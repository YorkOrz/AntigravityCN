#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AntigravityCN - 跨平台极速无损汉化补丁脚本 (零外部编译依赖)
============================================================
特点:
1. 原生零依赖：纯 Python 标准库实现，无需 Node.js、npm 或 Go 编译环境。
2. 模块化加载：自动读取并合并 patches/locales/zh-CN/ 下的 4 大领域词典。
3. 深度注入：支持 React 虚拟 DOM 拦截引擎与 Electron 6 大系统级原生模块。
4. 安全回滚：首次执行自动生成 app.asar.backup 备份，支持随时无损还原。
"""

import os
import sys
import json
import struct
import shutil
from typing import Dict, Tuple, Optional, Any, List

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
PATCHES_DIR = os.path.join(ROOT_DIR, 'patches')
LOCALES_DIR = os.path.join(PATCHES_DIR, 'locales', 'zh-CN')


def find_antigravity_asar() -> Optional[str]:
    """
    智能检测操作系统并查找 Antigravity 客户端的 app.asar 安装路径。
    """
    if sys.platform == 'win32':
        local_app = os.environ.get('LOCALAPPDATA', '')
        prog_files = os.environ.get('ProgramFiles', '')
        prog_files_x86 = os.environ.get('ProgramFiles(x86)', '')
        candidates = [
            os.path.join(local_app, 'Programs', 'antigravity', 'resources', 'app.asar'),
            os.path.join(local_app, 'Programs', 'Antigravity', 'resources', 'app.asar'),
            os.path.join(prog_files, 'Antigravity', 'resources', 'app.asar'),
            os.path.join(prog_files_x86, 'Antigravity', 'resources', 'app.asar'),
        ]
    elif sys.platform == 'darwin':
        candidates = [
            '/Applications/Antigravity.app/Contents/Resources/app.asar',
            os.path.expanduser('~/Applications/Antigravity.app/Contents/Resources/app.asar'),
        ]
    else:
        candidates = [
            '/opt/Antigravity/resources/app.asar',
            '/usr/lib/antigravity/resources/app.asar',
            '/usr/share/antigravity/resources/app.asar',
        ]

    for candidate in candidates:
        if os.path.exists(candidate) and os.path.isfile(candidate):
            return candidate
    return None


def build_master_dictionary() -> Dict[str, str]:
    """
    按模块顺序读取 patches/locales/zh-CN/ 目录下的所有 JSON 词典并合并去重。
    """
    dict_files = ['通用.json', '对话.json', '设置.json', '工作区.json']
    master_dict: Dict[str, str] = {}
    
    for filename in dict_files:
        filepath = os.path.join(LOCALES_DIR, filename)
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                try:
                    entries = json.load(f)
                    master_dict.update(entries)
                except Exception as e:
                    print(f'[!] 读取词典 {filename} 失败: {e}')
        else:
            print(f'[!] 警告: 未找到词典文件 {filepath}')
            
    return master_dict


def read_asar(path: str) -> Tuple[Dict[str, Any], Dict[str, bytes], Dict[str, Any]]:
    """
    解析 Electron 标准 ASAR 归档文件，提取文件头和内存二进制映射。
    """
    with open(path, 'rb') as f:
        u4, total_size, payload_size, json_len = struct.unpack('<IIII', f.read(16))
        header_json = f.read(json_len).decode('utf-8')
        padding = (4 - (json_len % 4)) % 4
        f.seek(16 + json_len + padding)
        data_start = f.tell()
        header = json.loads(header_json)
        
        files_data: Dict[str, bytes] = {}
        unpacked_nodes: Dict[str, Any] = {}

        def extract_entries(node: Dict[str, Any], current_path: str = '') -> None:
            if 'files' in node:
                for name, child_node in node['files'].items():
                    sub_path = f'{current_path}/{name}' if current_path else name
                    extract_entries(child_node, sub_path)
            else:
                if node.get('unpacked'):
                    unpacked_nodes[current_path] = node
                else:
                    offset = int(node['offset'])
                    size = int(node['size'])
                    f.seek(data_start + offset)
                    files_data[current_path] = f.read(size)

        extract_entries(header)
        return header, files_data, unpacked_nodes


def write_asar(output_path: str, files_data: Dict[str, bytes], unpacked_nodes: Dict[str, Any]) -> None:
    """
    将内存中的文件树与二进制数据序列化为符合 Chromium/Electron 规范的 ASAR 文件。
    """
    root: Dict[str, Any] = {'files': {}}
    sorted_paths: List[str] = sorted(files_data.keys())

    # 构建目录骨架
    for p in sorted_paths:
        parts = p.split('/')
        curr = root['files']
        for part in parts[:-1]:
            if part not in curr:
                curr[part] = {'files': {}}
            curr = curr[part]['files']
        curr[parts[-1]] = {'size': len(files_data[p]), 'offset': '0'}
    
    # 保留 unpacked 外部资源声明节点
    for p, node in unpacked_nodes.items():
        parts = p.split('/')
        curr = root['files']
        for part in parts[:-1]:
            if part not in curr:
                curr[part] = {'files': {}}
            curr = curr[part]['files']
        curr[parts[-1]] = node

    # 计算连续文件偏移量
    current_offset = 0
    for p in sorted_paths:
        parts = p.split('/')
        curr = root['files']
        for part in parts[:-1]:
            curr = curr[part]['files']
        curr[parts[-1]]['offset'] = str(current_offset)
        current_offset += len(files_data[p])

    # 序列化 JSON 头部并对齐 4 字节
    json_bytes = json.dumps(root, separators=(',', ':')).encode('utf-8')
    json_len = len(json_bytes)
    padding = (4 - (json_len % 4)) % 4
    header_payload = json_len + padding

    with open(output_path, 'wb') as f:
        f.write(struct.pack('<I', 4))
        f.write(struct.pack('<I', header_payload + 8))
        f.write(struct.pack('<I', header_payload + 4))
        f.write(struct.pack('<I', json_len))
        f.write(json_bytes)
        f.write(b'\x00' * padding)
        for p in sorted_paths:
            f.write(files_data[p])


def apply_patch(custom_asar_path: Optional[str] = None) -> bool:
    """
    执行完整的汉化补丁安装流程。
    """
    asar_path = custom_asar_path if custom_asar_path else find_antigravity_asar()
    if not asar_path or not os.path.exists(asar_path):
        print('[-] 错误: 未检测到 Antigravity 安装路径。请通过命令行参数传入 app.asar 绝对路径。')
        return False

    print(f'[+] 目标资源文件: {asar_path}')
    backup_path = asar_path + '.backup'
    bak_alt = asar_path + '.bak'

    # 安全备份管理：始终基于原版纯净镜像操作
    source_path = None
    if os.path.exists(backup_path):
        source_path = backup_path
    elif os.path.exists(bak_alt):
        source_path = bak_alt
    else:
        print(f'[+] 创建官方原版备份镜像: {backup_path}')
        try:
            shutil.copyfile(asar_path, backup_path)
            source_path = backup_path
        except Exception as e:
            print(f'[-] 备份失败（请检查是否有权限或程序被占用）: {e}')
            return False

    # 1. 组装全量词典
    print('[+] 读取并合并模块化本地化词典...')
    master_dict = build_master_dictionary()
    print(f'[+] 词典构建完成，共计装配 {len(master_dict)} 条术语')

    # 2. 准备 Preload 深度拦截补丁
    preload_template_path = os.path.join(PATCHES_DIR, 'preload.js')
    if not os.path.exists(preload_template_path):
        print(f'[-] 缺少核心补丁文件: {preload_template_path}')
        return False

    with open(preload_template_path, 'r', encoding='utf-8') as f:
        preload_code = f.read()

    dict_json = json.dumps(master_dict, ensure_ascii=False)
    if '/*__I18N_DICT_PLACEHOLDER__*/{}' in preload_code:
        preload_code = preload_code.replace('/*__I18N_DICT_PLACEHOLDER__*/{}', dict_json)
    else:
        preload_code = preload_code + f'\n\nconst I18N_DICT = {dict_json};\n'

    # 3. 读取 ASAR 数据
    print('[+] 正在读取 ASAR 资源包...')
    try:
        header, files_data, unpacked_nodes = read_asar(source_path)
    except Exception as e:
        print(f'[-] 读取 ASAR 失败: {e}')
        return False

    # 4. 装载核心与系统级补丁映射
    patch_mapping = {
        'dist/preload.js': preload_code.encode('utf-8'),
    }

    system_patches = [
        ('menu.js', 'dist/menu.js'),
        ('tray.js', 'dist/tray.js'),
        ('ipcHandlers.js', 'dist/ipcHandlers.js'),
        ('loadingOverlay.js', 'dist/loadingOverlay.js'),
        ('updater.js', 'dist/updater.js'),
        ('ideInstall/wizardHtml.js', 'dist/ideInstall/wizardHtml.js'),
    ]

    for src_name, dst_path in system_patches:
        src_path = os.path.join(PATCHES_DIR, src_name)
        if os.path.exists(src_path):
            with open(src_path, 'r', encoding='utf-8') as f:
                patch_mapping[dst_path] = f.read().encode('utf-8')

    print(f'[+] 注入本地化补丁模块 (共 {len(patch_mapping)} 个文件)...')
    for k, v in patch_mapping.items():
        files_data[k] = v

    temp_patched = asar_path + '.temp_patched'
    print('[+] 正在原子重构并写入 ASAR 文件...')
    try:
        write_asar(temp_patched, files_data, unpacked_nodes)
        shutil.move(temp_patched, asar_path)
    except Exception as e:
        print(f'[-] 写入 ASAR 失败（请确认已完全退出 Antigravity）: {e}')
        if os.path.exists(temp_patched):
            os.remove(temp_patched)
        return False

    print('\n==================================================')
    print('  [√] 恭喜！Antigravity 简体中文深度汉化补丁安装成功！')
    print('  [!] 请重启 Antigravity 客户端体验完整中文界面。')
    print('==================================================')
    return True


def restore_backup(custom_asar_path: Optional[str] = None) -> bool:
    """
    还原官方纯净英文原版备份。
    """
    asar_path = custom_asar_path if custom_asar_path else find_antigravity_asar()
    if not asar_path:
        print('[-] 未找到 Antigravity 安装路径。')
        return False
    
    backup_path = asar_path + '.backup'
    bak_alt = asar_path + '.bak'

    src = backup_path if os.path.exists(backup_path) else (bak_alt if os.path.exists(bak_alt) else None)
    if not src:
        print('[-] 未找到备份文件 (app.asar.backup)，无法还原。')
        return False

    try:
        shutil.copyfile(src, asar_path)
        print('[√] 已成功还原官方英文原版！')
        return True
    except Exception as e:
        print(f'[-] 还原失败（请确认程序未在运行）: {e}')
        return False


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] in ['--restore', '-r']:
        restore_backup()
    else:
        custom_arg = sys.argv[1] if len(sys.argv) > 1 else None
        apply_patch(custom_arg)
