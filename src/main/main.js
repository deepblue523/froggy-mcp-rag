const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(os.homedir(), 'froggy-rag-mcp', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let mainWindow;
let tray = null;
let mcpServer = null;
let ragService = null;
let mcpService = null;
app.isQuitting = false;

// Window state persistence
const windowStateFile = path.join(dataDir, 'window-state.json');

// Settings file path (will be initialized after services)
let settingsPath = null;

function getWindowState() {
  try {
    if (fs.existsSync(windowStateFile)) {
      const data = fs.readFileSync(windowStateFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading window state:', error);
  }
  return null;
}

function saveWindowState() {
  if (!mainWindow) return;
  
  try {
    const bounds = mainWindow.getBounds();
    const state = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y
    };
    fs.writeFileSync(windowStateFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving window state:', error);
  }
}

function ensureWindowOnScreen(bounds) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea; // { x, y, width, height }
  let { x, y, width, height } = bounds;

  // Fallback for invalid or missing values
  const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!isNumber(width)) width = 1400;
  if (!isNumber(height)) height = 900;
  if (!isNumber(x)) x = workArea.x + 50;
  if (!isNumber(y)) y = workArea.y + 50;

  // Enforce reasonable min size
  const minWidth = 800;
  const minHeight = 600;
  width = Math.max(width, minWidth);
  height = Math.max(height, minHeight);

  // Do not exceed available work area
  width = Math.min(width, workArea.width);
  height = Math.min(height, workArea.height);

  // Clamp within work area so the title bar is always reachable (no off-screen top)
  const maxX = workArea.x + (workArea.width - width);
  const maxY = workArea.y + (workArea.height - height);
  x = Math.min(Math.max(x, workArea.x), maxX);
  y = Math.min(Math.max(y, workArea.y), maxY);

  return { x, y, width, height };
}

// Initialize services early
async function initializeServices() {
  if (!ragService) {
    try {
      const { RAGService } = require('./services/rag-service');
      const { MCPService } = require('./services/mcp-service');
      const setupIpcHandlers = require('./ipc-handlers');
      
      ragService = new RAGService(dataDir);
      mcpService = new MCPService(ragService);
      
      // Expose services to renderer via IPC (replaces handlers set up earlier)
      setupIpcHandlers(ipcMain, ragService, mcpService);
    } catch (error) {
      console.error('Error initializing services:', error);
      // If better-sqlite3 fails, we'll handle it gracefully
      if (error.message && error.message.includes('better_sqlite3')) {
        console.error('Please run: npm rebuild better-sqlite3');
      }
      throw error;
    }
  }
}

function getMinimizeToTraySetting() {
  try {
    // Try to get settings path from ragService first, then fallback to constructed path
    let pathToUse = settingsPath;
    if (!pathToUse && ragService && ragService.settingsPath) {
      pathToUse = ragService.settingsPath;
    }
    if (!pathToUse) {
      // Fallback: construct path directly
      pathToUse = path.join(dataDir, 'settings.json');
    }
    
    if (pathToUse && fs.existsSync(pathToUse)) {
      const settings = JSON.parse(fs.readFileSync(pathToUse, 'utf8'));
      return settings.minimizeToTray === true;
    }
  } catch (error) {
    console.error('Error reading minimizeToTray setting:', error);
  }
  return false; // Default to false
}

function createTray() {
  // Try to find an icon file, or use a default empty icon
  let trayIcon;
  const possibleIconPaths = [
    path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    path.join(__dirname, '..', '..', 'build', 'icon.png'),
    path.join(__dirname, '..', '..', 'icon.png')
  ];
  
  for (const iconPath of possibleIconPaths) {
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
      break;
    }
  }
  
  // If no icon found, create a simple empty icon (Electron will use app icon as fallback)
  if (!trayIcon || trayIcon.isEmpty()) {
    // Create a minimal 16x16 image
    trayIcon = nativeImage.createEmpty();
  }
  
  // Resize for system tray (typically 16x16 or 22x22 depending on OS)
  if (!trayIcon.isEmpty()) {
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  }
  
  tray = new Tray(trayIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Froggy RAG MCP');
  tray.setContextMenu(contextMenu);
  
  // Double-click to show window
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  // Get saved window state or use defaults
  const savedState = getWindowState();
  const defaultBounds = { width: 1400, height: 900, x: undefined, y: undefined };
  const bounds = savedState 
    ? ensureWindowOnScreen(savedState)
    : defaultBounds;

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Froggy RAG MCP',
    autoHideMenuBar: true
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Save window state on move/resize
  let saveTimeout;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveWindowState();
    }, 500); // Debounce to avoid excessive writes
  };

  mainWindow.on('moved', debouncedSave);
  mainWindow.on('resized', debouncedSave);

  // Handle window close event
  mainWindow.on('close', (event) => {
    const minimizeToTray = getMinimizeToTraySetting();
    if (minimizeToTray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      // Show notification on Windows (balloon is Windows-specific)
      if (tray && process.platform === 'win32' && typeof tray.displayBalloon === 'function') {
        tray.displayBalloon({
          title: 'Froggy RAG MCP',
          content: 'Application minimized to system tray. Click the tray icon to restore.',
          icon: null
        });
      }
    } else {
      saveWindowState();
    }
  });

  // Handle minimize event
  mainWindow.on('minimize', (event) => {
    const minimizeToTray = getMinimizeToTraySetting();
    if (minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      // Show notification on Windows (balloon is Windows-specific)
      if (tray && process.platform === 'win32' && typeof tray.displayBalloon === 'function') {
        tray.displayBalloon({
          title: 'Froggy RAG MCP',
          content: 'Application minimized to system tray. Click the tray icon to restore.',
          icon: null
        });
      }
    }
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  // Create system tray
  createTray();
  
  // Create window immediately - don't wait for services
  createWindow();
  
  // Set up IPC handlers immediately (they'll wait for services to be ready)
  const setupIpcHandlers = require('./ipc-handlers');
  setupIpcHandlers(ipcMain, null, null);
  
  // Initialize services in background (non-blocking)
  // This allows the window to show immediately while services initialize
  initializeServices().then(() => {
    // Get settings path from RAG service after initialization
    if (ragService && ragService.settingsPath) {
      settingsPath = ragService.settingsPath;
    }
  }).catch(error => {
    console.error('Failed to initialize services:', error);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  
  // Handle app quit
  app.on('before-quit', () => {
    app.isQuitting = true;
  });
});

app.on('window-all-closed', () => {
  // Don't quit if minimize to tray is enabled
  const minimizeToTray = getMinimizeToTraySetting();
  if (!minimizeToTray && process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle('get-data-dir', () => dataDir);

// Fallback for app-ready event (services should already be initialized)
ipcMain.on('app-ready', async () => {
  if (!ragService) {
    await initializeServices();
  }
});

