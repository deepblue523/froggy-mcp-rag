const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(os.homedir(), 'froggy-rag-mcp', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let mainWindow;
let mcpServer = null;
let ragService = null;
let mcpService = null;

// Window state persistence
const windowStateFile = path.join(dataDir, 'window-state.json');

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
      
      ragService = new RAGService(dataDir);
      mcpService = new MCPService(ragService);
      
      // Expose services to renderer via IPC
      require('./ipc-handlers')(ipcMain, ragService, mcpService);
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
    title: 'Froggy RAG MCP'
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

  // Save state when window is closed
  mainWindow.on('close', () => {
    saveWindowState();
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  // Initialize services before creating window
  try {
    await initializeServices();
  } catch (error) {
    console.error('Failed to initialize services:', error);
  }
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
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

