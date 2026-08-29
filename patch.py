# -*- coding: utf-8 -*-
import os
import sys
import json
import struct
import shutil

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
PATCHES_DIR = os.path.join(ROOT_DIR, 'patches')
LOCALES_DIR = os.path.join(PATCHES_DIR, 'locales', 'zh-CN')

def find_antigravity_asar():
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
        ]

    for c in candidates:
        if os.path.exists(c) and os.path.isfile(c):
            return c
    return None

def build_master_dict():
    dict_files = ['通用.json', '对话.json', '设置.json', '工作区.json']
    master = {}
    for df in dict_files:
        fpath = os.path.join(LOCALES_DIR, df)
        if os.path.exists(fpath):
            with open(fpath, 'r', encoding='utf-8') as f:
                d = json.load(f)
                master.update(d)
    return master

def read_asar(path):
    with open(path, 'rb') as f:
        u4, total_size, payload_size, json_len = struct.unpack('<IIII', f.read(16))
        header_json = f.read(json_len).decode('utf-8')
        padding = (4 - (json_len % 4)) % 4
        f.seek(16 + json_len + padding)
        data_start = f.tell()
        header = json.loads(header_json)
        
        files_data = {}
        unpacked_nodes = {}
        def extract(node, curr=''):
            if 'files' in node:
                for k, v in node['files'].items():
                    extract(v, curr + '/' + k if curr else k)
            else:
                if node.get('unpacked'):
                    unpacked_nodes[curr] = node
                else:
                    offset = int(node['offset'])
                    size = int(node['size'])
                    f.seek(data_start + offset)
                    files_data[curr] = f.read(size)
        extract(header)
        return header, files_data, unpacked_nodes

def write_asar(output_path, files_data, unpacked_nodes):
    root = {'files': {}}
    paths = sorted(files_data.keys())
    for p in paths:
        parts = p.split('/')
        curr = root['files']
        for part in parts[:-1]:
            if part not in curr:
                curr[part] = {'files': {}}
            curr = curr[part]['files']
        curr[parts[-1]] = {'size': len(files_data[p]), 'offset': '0'}
    
    for p, node in unpacked_nodes.items():
        parts = p.split('/')
        curr = root['files']
        for part in parts[:-1]:
            if part not in curr:
                curr[part] = {'files': {}}
            curr = curr[part]['files']
        curr[parts[-1]] = node

    current_offset = 0
    for p in paths:
        parts = p.split('/')
        curr = root['files']
        for part in parts[:-1]:
            curr = curr[part]['files']
        curr[parts[-1]]['offset'] = str(current_offset)
        current_offset += len(files_data[p])

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
        for p in paths:
            f.write(files_data[p])

def apply_patch(asar_path=None):
    if not asar_path:
        asar_path = find_antigravity_asar()
    if not asar_path or not os.path.exists(asar_path):
        print('[-] 未找到 Antigravity 安装路径，请手动指定 app.asar 路径。')
        return False

    print(f'[+] 目标文件: {asar_path}')
    backup_path = asar_path + '.backup'
    bak_alt = asar_path + '.bak'

    source_path = None
    if os.path.exists(backup_path):
        source_path = backup_path
    elif os.path.exists(bak_alt):
        source_path = bak_alt
    else:
        print(f'[+] 创建官方原版备份: {backup_path}')
        shutil.copyfile(asar_path, backup_path)
        source_path = backup_path

    print('[+] 构建全量主词典...')
    master_dict = build_master_dict()
    print(f'[+] 词典装配完毕，共计 {len(master_dict)} 条术语')

    with open(os.path.join(PATCHES_DIR, 'preload.js'), 'r', encoding='utf-8') as f:
        preload_code = f.read()

    dict_json = json.dumps(master_dict, ensure_ascii=False)
    if '/*__I18N_DICT_PLACEHOLDER__*/{}' in preload_code:
        preload_code = preload_code.replace('/*__I18N_DICT_PLACEHOLDER__*/{}', dict_json)
    else:
        preload_code = preload_code + f'\n\nconst I18N_DICT = {dict_json};\n'

    print('[+] 读取原始 ASAR 资源包...')
    header, files_data, unpacked_nodes = read_asar(source_path)

    patch_mapping = {
        'dist/preload.js': preload_code.encode('utf-8'),
    }

    optional_patches = [
        ('menu.js', 'dist/menu.js'),
        ('tray.js', 'dist/tray.js'),
        ('ipcHandlers.js', 'dist/ipcHandlers.js'),
        ('loadingOverlay.js', 'dist/loadingOverlay.js'),
        ('updater.js', 'dist/updater.js'),
        ('ideInstall/wizardHtml.js', 'dist/ideInstall/wizardHtml.js'),
    ]

    for src_name, dst_path in optional_patches:
        src_path = os.path.join(PATCHES_DIR, src_name)
        if os.path.exists(src_path):
            with open(src_path, 'r', encoding='utf-8') as f:
                patch_mapping[dst_path] = f.read().encode('utf-8')

    print('[+] 注入本地化补丁...')
    for k, v in patch_mapping.items():
        files_data[k] = v

    temp_patched = asar_path + '.temp_patched'
    print('[+] 正在重新打包并应用 ASAR...')
    write_asar(temp_patched, files_data, unpacked_nodes)

    shutil.move(temp_patched, asar_path)
    print('\n==================================================')
    print('  [√] 恭喜！Antigravity 简体中文深度汉化补丁安装成功！')
    print('  [!] 请重启 Antigravity 客户端体验完整中文界面。')
    print('==================================================')
    return True

def restore_backup(asar_path=None):
    if not asar_path:
        asar_path = find_antigravity_asar()
    if not asar_path:
        print('[-] 未找到 Antigravity 安装路径。')
        return False
    
    backup_path = asar_path + '.backup'
    bak_alt = asar_path + '.bak'

    src = backup_path if os.path.exists(backup_path) else (bak_alt if os.path.exists(bak_alt) else None)
    if not src:
        print('[-] 未找到备份文件，无法还原。')
        return False

    shutil.copyfile(src, asar_path)
    print('[√] 已成功还原官方英文原版！')
    return True

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] in ['--restore', '-r']:
        restore_backup()
    else:
        custom_path = sys.argv[1] if len(sys.argv) > 1 else None
        apply_patch(custom_path)
