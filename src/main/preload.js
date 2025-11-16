const { contextBridge, ipcRenderer } = require('electron');

// Import marked safely
let marked;
try {
  marked = require('marked');
  // Configure marked for v17 API
  if (marked) {
    // In marked v4+, use marked.use() for configuration
    if (typeof marked.use === 'function') {
      marked.use({
        breaks: true,
        gfm: true
      });
    } else if (typeof marked.setOptions === 'function') {
      // Fallback for older API
      marked.setOptions({
        breaks: true,
        gfm: true
      });
    }
  }
} catch (error) {
  console.error('Error loading marked:', error);
  // Fallback: create a simple marked-like function
  marked = {
    parse: (text) => {
      return text ? `<p>${text.replace(/\n/g, '<br>')}</p>` : '<p>No content</p>';
    },
    use: () => {},
    setOptions: () => {}
  };
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Data directory
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  
  // RAG Service
  ingestFile: (filePath, watch) => ipcRenderer.invoke('ingest-file', filePath, watch),
  ingestDirectory: (dirPath, recursive, watch) => ipcRenderer.invoke('ingest-directory', dirPath, recursive, watch),
  getIngestionStatus: () => ipcRenderer.invoke('get-ingestion-status'),
  getFiles: () => ipcRenderer.invoke('get-files'),
  getDirectories: () => ipcRenderer.invoke('get-directories'),
  getDirectoryFiles: (dirPath) => ipcRenderer.invoke('get-directory-files', dirPath),
  removeFile: (filePath) => ipcRenderer.invoke('remove-file', filePath),
  removeDirectory: (dirPath) => ipcRenderer.invoke('remove-directory', dirPath),
  updateFileWatch: (filePath, watch) => ipcRenderer.invoke('update-file-watch', filePath, watch),
  updateDirectoryWatch: (dirPath, watch, recursive) => ipcRenderer.invoke('update-directory-watch', dirPath, watch, recursive),
  
  // Vector Store
  getDocuments: () => ipcRenderer.invoke('get-documents'),
  getDocument: (documentId) => ipcRenderer.invoke('get-document', documentId),
  getDocumentChunks: (documentId) => ipcRenderer.invoke('get-document-chunks', documentId),
  getChunkContent: (chunkId) => ipcRenderer.invoke('get-chunk-content', chunkId),
  getVectorStoreStats: () => ipcRenderer.invoke('get-vector-store-stats'),
  regenerateVectorStore: () => ipcRenderer.invoke('regenerate-vector-store'),
  
  // Search
  search: (query, limit) => ipcRenderer.invoke('search', query, limit),
  
  // MCP Server
  startMCPServer: (port) => ipcRenderer.invoke('start-mcp-server', port),
  stopMCPServer: () => ipcRenderer.invoke('stop-mcp-server'),
  getMCPServerStatus: () => ipcRenderer.invoke('get-mcp-server-status'),
  getMCPServerLogs: () => ipcRenderer.invoke('get-mcp-server-logs'),
  
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  // Clipboard
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  
  // Dialogs
  showDirectoryDialog: () => ipcRenderer.invoke('show-directory-dialog'),
  
  // File reading
  readUsageFile: () => ipcRenderer.invoke('read-usage-file'),
  
  // Path checking
  isDirectory: (filePath) => ipcRenderer.invoke('is-directory', filePath),
  
  // Markdown rendering
  renderMarkdown: (markdown) => {
    try {
      if (!markdown) {
        return '<p>No content available</p>';
      }
      // Ensure marked is available and has parse method
      if (!marked || typeof marked.parse !== 'function') {
        console.error('Marked library not available or parse method missing');
        // Basic fallback: escape HTML and convert newlines to <br>
        return '<p>' + String(markdown).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
      }
      const html = marked.parse(markdown);
      // Verify we got HTML, not plain text
      if (typeof html !== 'string' || html === markdown) {
        console.error('Marked parse did not convert markdown to HTML');
        return '<p>' + String(markdown).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
      }
      return html;
    } catch (error) {
      console.error('Error rendering markdown:', error);
      return `<p>Error rendering markdown: ${error.message}</p>`;
    }
  },
  
  // Events
  onIngestionUpdate: (callback) => {
    ipcRenderer.on('ingestion-update', (_, data) => callback(data));
  },
  onMCPServerLog: (callback) => {
    ipcRenderer.on('mcp-server-log', (_, data) => callback(data));
  }
});

// Notify main process that renderer is ready
window.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('app-ready');
});

