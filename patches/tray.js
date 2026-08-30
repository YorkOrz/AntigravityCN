"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTray = createTray;
exports.updateTrayAgentCount = updateTrayAgentCount;
const electron_1 = require("electron");
const path = __importStar(require("path"));
const utils_1 = require("./utils");

// Keep tray as a global variable to prevent it from being garbage collected.
let tray = null;
let contextMenu = null;

// ============================================================================
// 托盘菜单本地化辅助模块
// ============================================================================
const TRAY_I18N_MAP = {
    'No agents running': '暂无正在运行的智能体',
    'Quit': '退出',
    'New Window': '新建窗口',
    'Documentation': '官方文档',
    'Check for Updates': '检查更新',
    'Cancel': '取消',
};

/**
 * 转换托盘单条菜单项的文本标签
 */
function translateTrayLabel(label) {
    if (!label || typeof label !== 'string') return label;
    const trimmed = label.trim();
    if (TRAY_I18N_MAP[trimmed]) return TRAY_I18N_MAP[trimmed];
    if (trimmed.startsWith('Open ')) {
        return '打开 ' + trimmed.slice(5);
    }
    if (trimmed.endsWith(' agent running')) {
        return trimmed.replace(' agent running', ' 个智能体正在运行');
    }
    if (trimmed.endsWith(' agents running')) {
        return trimmed.replace(' agents running', ' 个智能体正在运行');
    }
    return label;
}

/**
 * 递归遍历并汉化托盘上下文菜单配置列表
 */
function translateTrayActions(items) {
    if (!Array.isArray(items)) return items;
    return items.map((item) => {
        const copy = Object.assign({}, item);
        if (copy.label) {
            copy.label = translateTrayLabel(copy.label);
        }
        if (copy.submenu) {
            copy.submenu = translateTrayActions(copy.submenu);
        }
        return copy;
    });
}

/**
 * Creates a system tray icon with a context menu to focus a window or quit the app.
 *
 * For macOS it uses a template image to automatically handle light/dark mode.
 * Other platforms use the normal app icon.
 */
function createTray(actions) {
    // On macOS use a template image (auto-inverts for dark/light menu bar).
    // Otherwise use a full-color icon since template images are unsupported
    // and a solid-black glyph can be invisible on dark panels.
    const iconFile = (0, utils_1.isMacOS)() ? 'trayTemplate.png' : 'icon.png';
    const icon = electron_1.nativeImage.createFromPath(path.join(__dirname, '..', iconFile));
    if ((0, utils_1.isMacOS)()) {
        icon.setTemplateImage(true);
    }
    tray = new electron_1.Tray(icon);
    tray.setToolTip(electron_1.app.getName());

    // 注入汉化后的上下文菜单配置
    const localizedActions = translateTrayActions(actions);
    contextMenu = electron_1.Menu.buildFromTemplate(localizedActions);
    tray.setContextMenu(contextMenu);
}

/**
 * Updates the active agents count in the tray menu.
 */
function updateTrayAgentCount(count) {
    if (tray && contextMenu) {
        const countItem = contextMenu.items.find((item) => item.id === 'running-agents');
        if (countItem) {
            countItem.label = count > 0 ? `${count} 个智能体正在运行` : '暂无正在运行的智能体';
            tray.setContextMenu(contextMenu);
        }
    }
}
