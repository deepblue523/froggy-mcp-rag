const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

module.exports = function setupIpcHandlers(ipcMain, ragService, mcpService) {
  // RAG Service handlers
  ipcMain.handle('ingest-file', async (_, filePath, watch) => {
    return await ragService.ingestFile(filePath, watch);
  });

  ipcMain.handle('ingest-directory', async (_, dirPath, recursive, watch) => {
    return await ragService.ingestDirectory(dirPath, recursive, watch);
  });

  ipcMain.handle('get-ingestion-status', () => {
    return ragService.getIngestionStatus();
  });

  ipcMain.handle('get-files', () => {
    return ragService.getFiles();
  });

  ipcMain.handle('get-directories', () => {
    return ragService.getDirectories();
  });

  ipcMain.handle('get-directory-files', (_, dirPath) => {
    return ragService.getDirectoryFiles(dirPath);
  });

  ipcMain.handle('remove-file', (_, filePath) => {
    return ragService.removeFile(filePath);
  });

  ipcMain.handle('remove-directory', (_, dirPath) => {
    return ragService.removeDirectory(dirPath);
  });

  ipcMain.handle('update-file-watch', (_, filePath, watch) => {
    return ragService.updateFileWatch(filePath, watch);
  });

  ipcMain.handle('update-directory-watch', (_, dirPath, watch, recursive) => {
    return ragService.updateDirectoryWatch(dirPath, watch, recursive);
  });

  // Vector Store handlers
  ipcMain.handle('get-documents', () => {
    return ragService.getDocuments();
  });

  ipcMain.handle('get-document', (_, documentId) => {
    return ragService.getDocument(documentId);
  });

  ipcMain.handle('get-document-chunks', (_, documentId) => {
    return ragService.getDocumentChunks(documentId);
  });

  ipcMain.handle('get-chunk-content', (_, chunkId) => {
    return ragService.getChunkContent(chunkId);
  });

  ipcMain.handle('get-vector-store-stats', () => {
    return ragService.getVectorStoreStats();
  });

  ipcMain.handle('regenerate-vector-store', async () => {
    return await ragService.regenerateVectorStore();
  });

  // Search handlers
  ipcMain.handle('search', async (_, query, limit = 10, algorithm = 'hybrid') => {
    return await ragService.search(query, limit, algorithm);
  });

  // MCP Server handlers
  ipcMain.handle('start-mcp-server', async (_, port = 3000) => {
    return await mcpService.start(port);
  });

  ipcMain.handle('stop-mcp-server', () => {
    return mcpService.stop();
  });

  ipcMain.handle('get-mcp-server-status', () => {
    return mcpService.getStatus();
  });

  ipcMain.handle('get-mcp-server-logs', () => {
    return mcpService.getLogs();
  });

  // Settings handlers
  ipcMain.handle('get-settings', () => {
    return ragService.getSettings();
  });

  ipcMain.handle('save-settings', (_, settings) => {
    return ragService.saveSettings(settings);
  });

  // Clipboard handlers
  ipcMain.handle('copy-to-clipboard', async (_, text) => {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
    return true;
  });

  // Dialog handlers
  ipcMain.handle('show-directory-dialog', async () => {
    const { dialog, BrowserWindow } = require('electron');
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return null;
    
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  // File reading handlers
  ipcMain.handle('read-usage-file', async () => {
    try {
      const usagePath = path.join(__dirname, '..', '..', 'USAGE.md');
      const content = fs.readFileSync(usagePath, 'utf8');
      return content;
    } catch (error) {
      console.error('Error reading USAGE.md:', error);
      return null;
    }
  });

  // Setup event forwarding
  ragService.on('ingestion-update', (data) => {
    const window = require('electron').BrowserWindow.getAllWindows()[0];
    if (window) {
      window.webContents.send('ingestion-update', data);
    }
  });

  mcpService.on('log', (data) => {
    const window = require('electron').BrowserWindow.getAllWindows()[0];
    if (window) {
      window.webContents.send('mcp-server-log', data);
    }
  });
};

