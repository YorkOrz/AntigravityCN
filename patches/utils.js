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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SleepBlocker = exports.showOrCreateWindow = exports.showQuitConfirmation = void 0;
exports.setShowQuitConfirmation = setShowQuitConfirmation;
exports.isMacOS = isMacOS;
exports.createWindow = createWindow;
exports.getNodeWrapperPaths = getNodeWrapperPaths;
exports.setupNodeWrapper = setupNodeWrapper;
const electron_1 = require("electron");
const constants_1 = require("./constants");
const keybindings_1 = require("./keybindings");
const path_1 = __importDefault(require("path"));
const fs = __importStar(require("fs"));
const paths_1 = require("./paths");
const loadingOverlay_1 = require("./loadingOverlay");
exports.showQuitConfirmation = false;
function setShowQuitConfirmation(value) {
    exports.showQuitConfirmation = value;
}
function isMacOS() {
    return process.platform === 'darwin';
}
/**
 * Reads the user's theme preference from the settings file.
 */
function getThemeMode() {
    try {
        const filePath = (0, paths_1.getSettingsPbPath)();
        if (!fs.existsSync(filePath)) {
            return 'DARK';
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const config = JSON.parse(content);
        const themeMode = config?.userSettings?.themeMode;
        if (themeMode && themeMode.includes('INHERIT')) {
            return electron_1.nativeTheme.shouldUseDarkColors ? 'DARK' : 'LIGHT';
        }
        if (themeMode && themeMode.includes('LIGHT')) {
            return 'LIGHT';
        }
        return 'DARK';
    }
    catch (e) {
        console.error('Error reading theme mode:', e);
        return 'DARK';
    }
}
/**
 * Ensures the app is visible in the dock for MacOS with the icon set.
 * When refocusing the app after being hidden in the dock, the icon is sometimes lost.
 * This ensures the icon is always visible.
 */
function ensureAppIsInDock() {
    void electron_1.app.dock?.show();
    if (isMacOS() && electron_1.app.dock) {
        const iconPath = path_1.default.join(__dirname, '..', 'icon.png');
        electron_1.app.dock.setIcon(electron_1.nativeImage.createFromPath(iconPath));
    }
}

/**
 * Reads stored window state (position, size, maximized state).
 */
function getStoredWindowBounds(storageManager) {
    if (!storageManager || !storageManager.storagePath) return null;
    try {
        if (fs.existsSync(storageManager.storagePath)) {
            const raw = fs.readFileSync(storageManager.storagePath, 'utf-8');
            if (raw && raw.trim()) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.windowBounds) {
                    const bounds = typeof parsed.windowBounds === 'string' ? JSON.parse(parsed.windowBounds) : parsed.windowBounds;
                    return bounds;
                }
            }
        }
    } catch (e) {
        console.error('[WindowBounds] Error reading stored window bounds:', e);
    }
    return null;
}

/**
 * Safely clamps window coordinates and dimensions to a display's available workArea.
 * Guarantees that the titlebar and a substantial portion of the window remain visible and draggable,
 * fully accommodating RDP resolution changes, DPI scaling shifts, and taskbar dimensions.
 */
function fitBoundsToWorkArea(bounds, workArea) {
    // Determine minimum reasonable window dimensions
    const minW = 500;
    const minH = 400;

    // Constrain width and height to not exceed available work area
    let width = Math.max(minW, Math.min(bounds.width || 1400, workArea.width));
    let height = Math.max(minH, Math.min(bounds.height || 900, workArea.height));

    let x = typeof bounds.x === 'number' ? bounds.x : workArea.x;
    let y = typeof bounds.y === 'number' ? bounds.y : workArea.y;

    // Horizontal clamping: ensure window is within workArea bounds
    // At least 150px of window or full width must be visible horizontally
    if (x < workArea.x) {
        x = workArea.x;
    } else if (x + 150 > workArea.x + workArea.width) {
        x = Math.max(workArea.x, workArea.x + workArea.width - width);
    } else if (x + width > workArea.x + workArea.width) {
        // If window extends off right edge, shift left if space permits
        x = Math.max(workArea.x, workArea.x + workArea.width - width);
    }

    // Vertical clamping: top titlebar MUST be accessible (between workArea.y and workArea.y + height - 60)
    if (y < workArea.y) {
        y = workArea.y;
    } else if (y + 60 > workArea.y + workArea.height) {
        y = Math.max(workArea.y, workArea.y + workArea.height - height);
    } else if (y + height > workArea.y + workArea.height) {
        y = Math.max(workArea.y, workArea.y + workArea.height - height);
    }

    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
        isMaximized: Boolean(bounds.isMaximized)
    };
}

/**
 * Validates whether the saved bounds are valid across currently active monitors.
 * Fully adapts to RDP remote desktop connections where:
 * 1. Monitor resolution shrinks or expands (e.g. 4K host vs 1080p RDP client).
 * 2. Secondary monitors disappear upon connecting via RDP.
 * 3. Windows minimize coordinates (-32000, -32000) occurred during session detach.
 */
function validateWindowBounds(bounds) {
    if (!bounds || typeof bounds.width !== 'number' || typeof bounds.height !== 'number') {
        return null;
    }

    // Filter out Windows minimized coordinates (-32000, -32000)
    const hasCoords = typeof bounds.x === 'number' && typeof bounds.y === 'number' && bounds.x > -10000 && bounds.y > -10000;

    try {
        const displays = electron_1.screen.getAllDisplays();
        if (!displays || displays.length === 0) {
            return null;
        }

        const primaryDisplay = electron_1.screen.getPrimaryDisplay();

        if (hasCoords) {
            // Find display that best matches or overlaps with saved bounds
            const matchedDisplay = electron_1.screen.getDisplayMatching({
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height
            });

            if (matchedDisplay) {
                // Check if there is actual intersection between bounds and matched display
                const db = matchedDisplay.bounds;
                const intersects = (
                    bounds.x < db.x + db.width &&
                    bounds.x + bounds.width > db.x &&
                    bounds.y < db.y + db.height &&
                    bounds.y + bounds.height > db.y
                );

                if (intersects) {
                    return fitBoundsToWorkArea(bounds, matchedDisplay.workArea);
                }
            }
        }

        // Fallback: If saved display is disconnected or coordinates are off-screen,
        // safely adapt and center inside primary display workArea
        const targetWorkArea = primaryDisplay ? primaryDisplay.workArea : { x: 0, y: 0, width: 1400, height: 900 };
        const safeWidth = Math.min(Math.max(500, bounds.width), Math.max(500, targetWorkArea.width - 40));
        const safeHeight = Math.min(Math.max(400, bounds.height), Math.max(400, targetWorkArea.height - 40));
        const safeX = targetWorkArea.x + Math.max(0, Math.floor((targetWorkArea.width - safeWidth) / 2));
        const safeY = targetWorkArea.y + Math.max(0, Math.floor((targetWorkArea.height - safeHeight) / 2));

        return {
            x: safeX,
            y: safeY,
            width: safeWidth,
            height: safeHeight,
            isMaximized: Boolean(bounds.isMaximized)
        };
    } catch (e) {
        console.error('[WindowBounds] Error validating bounds with displays:', e);
    }
    return null;
}

// ---------------------------------------------------------------------------
// Window Management
// ---------------------------------------------------------------------------
/**
 * Creates and returns a new BrowserWindow pointed at `url`.
 * Uses a hidden title bar with native traffic lights on macOS.
 * Restores and persists window position, size, and maximized state with RDP adaptive support.
 */
function createWindow(url, storageManager) {
    ensureAppIsInDock();
    const theme = getThemeMode().toUpperCase();
    const isLight = theme.includes('LIGHT');
    const backgroundColor = isLight ? '#FAFAFA' : '#131313';
    const foregroundColor = isLight ? '#383A42' : '#FAFAFA';

    const savedBounds = validateWindowBounds(getStoredWindowBounds(storageManager));
    const windowOptions = {
        width: savedBounds?.width || 1400,
        height: savedBounds?.height || 900,
        minWidth: 500,
        minHeight: 400,
        title: electron_1.app.getName(),
        icon: path_1.default.join(__dirname, '..', 'icon.png'),
        titleBarStyle: 'hidden',
        titleBarOverlay: isMacOS()
            ? false
            : {
                color: backgroundColor,
                symbolColor: foregroundColor,
                height: 30,
            },
        backgroundColor,
        trafficLightPosition: { x: 12, y: 12 },
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path_1.default.join(__dirname, 'preload.js'),
            devTools: !electron_1.app.isPackaged,
        },
    };

    if (savedBounds && typeof savedBounds.x === 'number' && typeof savedBounds.y === 'number') {
        windowOptions.x = savedBounds.x;
        windowOptions.y = savedBounds.y;
    }

    const win = new electron_1.BrowserWindow(windowOptions);

    if (savedBounds?.isMaximized) {
        win.maximize();
    }

    // Prevent the menu dropdown from being very wide due to long page titles
    win.on('page-title-updated', (event, title) => {
        const maxLength = 25;
        if (title.length > maxLength) {
            event.preventDefault();
            win.setTitle(title.substring(0, maxLength) + '...');
        }
    });
    win.webContents.setWindowOpenHandler((details) => {
        void electron_1.shell.openExternal(details.url);
        return { action: 'deny' };
    });
    (0, loadingOverlay_1.attachLoadingOverlay)(win, foregroundColor, backgroundColor);
    (0, keybindings_1.registerKeybindings)(win, {
        createNewWindow: () => {
            void createWindow(url, storageManager);
        },
        onQuitRequested: () => {
            exports.showQuitConfirmation = true;
            electron_1.app.quit();
        },
    });

    // Window position & size persistence with RDP dynamic resolution adaptation
    if (storageManager) {
        const WINDOW_BOUNDS_KEY = 'windowBounds';
        let saveTimeout = null;

        const saveBounds = () => {
            if (win.isDestroyed()) return;
            try {
                const isMaximized = win.isMaximized();
                const isMinimized = win.isMinimized();
                if (isMinimized) return; // Do not record minimized window state

                let bounds;
                if (isMaximized) {
                    bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
                } else {
                    bounds = win.getBounds();
                }

                // Ignore invalid or minimized coordinates (-32000 on Windows)
                if (!bounds || bounds.x <= -10000 || bounds.y <= -10000 || bounds.width < 100 || bounds.height < 100) {
                    return;
                }

                const state = {
                    x: bounds.x,
                    y: bounds.y,
                    width: bounds.width,
                    height: bounds.height,
                    isMaximized,
                };
                void storageManager.updateItems({
                    [WINDOW_BOUNDS_KEY]: JSON.stringify(state),
                });
            } catch (err) {
                console.error('[WindowBounds] Error saving window state:', err);
            }
        };

        const debouncedSaveBounds = () => {
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(saveBounds, 300);
        };

        win.on('resize', debouncedSaveBounds);
        win.on('move', debouncedSaveBounds);
        win.on('maximize', debouncedSaveBounds);
        win.on('unmaximize', debouncedSaveBounds);
        win.on('close', saveBounds);

        // Dynamic Display Changes: Handle RDP connect/disconnect and resolution/DPI shifts while running
        const handleDisplayChange = () => {
            if (win.isDestroyed()) return;
            try {
                if (win.isMaximized()) {
                    // Re-maximize so OS fits the window to the new display resolution/workArea
                    win.unmaximize();
                    win.maximize();
                    return;
                }
                if (win.isMinimized()) return;

                const currentBounds = win.getBounds();
                const validBounds = validateWindowBounds(currentBounds);
                if (validBounds) {
                    win.setBounds({
                        x: validBounds.x,
                        y: validBounds.y,
                        width: validBounds.width,
                        height: validBounds.height
                    });
                }
            } catch (e) {
                console.error('[WindowBounds] Error handling display change:', e);
            }
        };

        electron_1.screen.on('display-metrics-changed', handleDisplayChange);
        electron_1.screen.on('display-removed', handleDisplayChange);

        win.on('closed', () => {
            electron_1.screen.removeListener('display-metrics-changed', handleDisplayChange);
            electron_1.screen.removeListener('display-removed', handleDisplayChange);
        });
    }

    // Zoom persistence — restore saved level and capture future changes.
    if (storageManager) {
        const ZOOM_LEVEL_KEY = 'zoomLevel';
        let isRestoringZoom = false;
        const applyStoredZoomLevel = async () => {
            const items = await storageManager.getItems();
            const stored = items[ZOOM_LEVEL_KEY];
            if (stored !== undefined) {
                const level = parseFloat(stored);
                if (!isNaN(level)) {
                    isRestoringZoom = true;
                    win.webContents.setZoomLevel(level);
                    isRestoringZoom = false;
                }
            }
        };
        win.webContents.on('did-finish-load', () => {
            void applyStoredZoomLevel();
        });
        // Capture zoom changes from native menu accelerators, trackpad
        // pinch-to-zoom, or Ctrl+scroll so they are also persisted.
        win.webContents.on('zoom-changed', (_event, _direction) => {
            if (isRestoringZoom) {
                return;
            }
            const currentLevel = win.webContents.getZoomLevel();
            void storageManager.updateItems({
                [ZOOM_LEVEL_KEY]: String(currentLevel),
            });
        });
    }
    void win.loadURL(url);
    return win;
}
/**
 * Focuses a window if it exists, or creates a new one.
 */
const showOrCreateWindow = (port) => {
    const wins = electron_1.BrowserWindow.getAllWindows();
    if (wins.length > 0) {
        wins[0].show();
        wins[0].focus();
    }
    else {
        createWindow(`${constants_1.WINDOW_ORIGIN}:${port}/`);
    }
};
exports.showOrCreateWindow = showOrCreateWindow;
/**
 * Manages the power save blocker to keep the computer awake.
 */
class SleepBlocker {
    constructor() {
        this.currentBlockerId = null;
    }
    static getInstance() {
        if (!SleepBlocker.instance) {
            SleepBlocker.instance = new SleepBlocker();
        }
        return SleepBlocker.instance;
    }
    shouldKeepComputerAwake(keep) {
        if (keep) {
            if (this.currentBlockerId === null) {
                this.currentBlockerId = electron_1.powerSaveBlocker.start('prevent-display-sleep');
                console.log('Power save blocker started:', this.currentBlockerId);
            }
        }
        else {
            if (this.currentBlockerId !== null) {
                electron_1.powerSaveBlocker.stop(this.currentBlockerId);
                console.log('Power save blocker stopped:', this.currentBlockerId);
                this.currentBlockerId = null;
            }
        }
    }
}
exports.SleepBlocker = SleepBlocker;
function getNodeWrapperPaths(envPath, os, isPackaged, userDataPath, baseDir) {
    const delimiter = os === 'win32' ? ';' : ':';
    if (!isPackaged) {
        const devBinPath = path_1.default.join(baseDir, '..', 'node_modules', '.bin');
        return {
            newEnvPath: `${devBinPath}${delimiter}${envPath || ''}`,
            nodeWrapperPath: undefined,
            binPath: undefined,
        };
    }
    const binPath = path_1.default.join(userDataPath, 'bin');
    const nodeWrapperPath = path_1.default.join(binPath, os === 'win32' ? 'agy-node.cmd' : 'agy-node');
    return {
        newEnvPath: `${binPath}${delimiter}${envPath || ''}`,
        nodeWrapperPath,
        binPath,
    };
}
/**
 * Sets up a wrapper script for Node.js that runs Electron as Node.
 * This allows running standard Node scripts using the Electron binary.
 */
function setupNodeWrapper(env) {
    const userDataPath = electron_1.app.isPackaged ? electron_1.app.getPath('userData') : '';
    const isWindows = process.platform === 'win32';
    const pathKey = isWindows
        ? Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH'
        : 'PATH';
    const { newEnvPath, nodeWrapperPath, binPath } = getNodeWrapperPaths(env[pathKey], process.platform, electron_1.app.isPackaged, userDataPath, __dirname);
    env[pathKey] = newEnvPath;
    if (!nodeWrapperPath || !binPath) {
        return;
    }
    if (!fs.existsSync(binPath)) {
        fs.mkdirSync(binPath, { recursive: true });
    }
    let nodeWrapperContent = '';
    switch (process.platform) {
        case 'win32':
            nodeWrapperContent = `@echo off\nset ELECTRON_RUN_AS_NODE=1\n"${process.execPath}" %*\n`;
            break;
        case 'darwin': {
            const appName = path_1.default.basename(process.execPath);
            let electronBinary = process.execPath;
            const helperPath = path_1.default.join(path_1.default.dirname(process.execPath), '..', 'Frameworks', `${appName} Helper.app`, 'Contents', 'MacOS', `${appName} Helper`);
            if (fs.existsSync(helperPath)) {
                electronBinary = helperPath;
            }
            nodeWrapperContent = `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${electronBinary}" "$@"\n`;
            break;
        }
        default: // linux, etc.
            nodeWrapperContent = `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "$@"\n`;
            break;
    }
    try {
        const existingContent = fs.existsSync(nodeWrapperPath)
            ? fs.readFileSync(nodeWrapperPath, 'utf-8')
            : '';
        if (existingContent !== nodeWrapperContent) {
            fs.writeFileSync(nodeWrapperPath, nodeWrapperContent);
            if (process.platform !== 'win32') {
                fs.chmodSync(nodeWrapperPath, 0o755);
            }
        }
    }
    catch (err) {
        console.error(`Failed to create node wrapper: ${err}`);
    }
}
