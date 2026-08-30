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

let tray = null;
let contextMenu = null;

const TRAY_DICT = {
    'No agents running': '暂无正在运行的智能体',
    'Quit': '退出',
    'New Window': '新建窗口',
    'Documentation': '官方文档',
    'Check for Updates': '检查更新',
    'Cancel': '取消',
};

function translateLabel(label) {
    if (!label || typeof label !== 'string') return label;
    const trimmed = label.trim();
    if (TRAY_DICT[trimmed]) return TRAY_DICT[trimmed];
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

function translateActions(items) {
    if (!Array.isArray(items)) return items;
    return items.map((item) => {
        const copy = Object.assign({}, item);
        if (copy.label) {
            copy.label = translateLabel(copy.label);
        }
        if (copy.submenu) {
            copy.submenu = translateActions(copy.submenu);
        }
        return copy;
    });
}

function createTray(actions) {
    const iconFile = (0, utils_1.isMacOS)() ? 'trayTemplate.png' : 'icon.png';
    const icon = electron_1.nativeImage.createFromPath(path.join(__dirname, '..', iconFile));
    if ((0, utils_1.isMacOS)()) {
        icon.setTemplateImage(true);
    }
    tray = new electron_1.Tray(icon);
    tray.setToolTip(electron_1.app.getName());
    const translatedActions = translateActions(actions);
    contextMenu = electron_1.Menu.buildFromTemplate(translatedActions);
    tray.setContextMenu(contextMenu);
}

function updateTrayAgentCount(count) {
    if (tray && contextMenu) {
        const countItem = contextMenu.items.find((item) => item.id === 'running-agents');
        if (countItem) {
            countItem.label = count > 0 ? `${count} 个智能体正在运行` : '暂无正在运行的智能体';
            tray.setContextMenu(contextMenu);
        }
    }
}
