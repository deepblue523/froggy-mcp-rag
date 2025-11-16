const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const chokidar = require('chokidar');
const { VectorStore } = require('./vector-store');
const { DocumentProcessor } = require('./document-processor');
const { SearchService } = require('./search-service');

class RAGService extends EventEmitter {
  constructor(dataDir) {
    super();
    this.dataDir = dataDir;
    this.settingsPath = path.join(dataDir, 'settings.json');
    this.vectorStore = new VectorStore(dataDir);
    this.searchService = new SearchService(this.vectorStore);
    
    // Initialize embedding model (lazy load)
    this.embeddingModel = null;
    this.loadEmbeddingModel();
    
    this.documentProcessor = new DocumentProcessor(this.embeddingModel);
    
    // Ingestion queue
    this.ingestionQueue = [];
    this.processing = false;
    
    // File watchers
    this.fileWatchers = new Map();
    this.directoryWatchers = new Map();
    
    // Settings
    this.settings = this.loadSettings();
    
    // Start processing queue
    this.startQueueProcessor();
    
    // Restore watched files/directories
    this.restoreWatchers();
    
    // Sync watched files/directories with vector store on startup
    this.syncWatchedFilesWithVectorStore();
  }

  async loadEmbeddingModel() {
    try {
      // Use a lightweight embedding model
      const { pipeline } = await import('@xenova/transformers');
      this.embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      this.documentProcessor.embeddingModel = this.embeddingModel;
    } catch (error) {
      console.error('Error loading embedding model:', error);
      // Continue without model - will use fallback
    }
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        return JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
    return {
      files: [],
      directories: [],
      splitterPosition: 250,
      chunkSize: 1000,
      chunkOverlap: 200
    };
  }

  _saveSettingsToDisk() {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  getSettings() {
    return this.settings;
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this._saveSettingsToDisk();
    return this.settings;
  }

  async ingestFile(filePath, watch = false) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileId = this.getFileId(filePath);
    
    // Add to settings if not exists
    const fileEntry = this.settings.files.find(f => f.path === filePath);
    if (!fileEntry) {
      this.settings.files.push({
        path: filePath,
        watch: watch,
        id: fileId
      });
      this._saveSettingsToDisk();
    }

    // Add to queue
    this.addToQueue(filePath, 'file');
    
    // Set up file watcher if requested
    if (watch) {
      this.watchFile(filePath);
    }

    return { fileId, status: 'queued' };
  }

  async ingestDirectory(dirPath, recursive = false, watch = false) {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    // Add to settings if not exists
    const dirEntry = this.settings.directories.find(d => d.path === dirPath);
    if (!dirEntry) {
      this.settings.directories.push({
        path: dirPath,
        watch: watch,
        recursive: recursive,
        id: uuidv4()
      });
      this._saveSettingsToDisk();
    }

    // Find all supported files
    const files = this.findSupportedFiles(dirPath, recursive);
    
    // Add all files to queue
    for (const file of files) {
      this.addToQueue(file, 'file');
    }

    // Set up directory watcher if requested
    if (watch) {
      this.watchDirectory(dirPath, recursive);
    }

    return { fileCount: files.length, status: 'queued' };
  }

  findSupportedFiles(dirPath, recursive) {
    const supportedExts = ['.txt', '.pdf', '.docx', '.xlsx', '.csv'];
    const files = [];

    const scanDir = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (supportedExts.includes(ext)) {
              files.push(fullPath);
            }
          } else if (entry.isDirectory() && recursive) {
            scanDir(fullPath);
          }
        }
      } catch (error) {
        console.error(`Error scanning directory ${dir}:`, error);
      }
    };

    scanDir(dirPath);
    return files;
  }

  addToQueue(filePath, type) {
    const queueItem = {
      id: uuidv4(),
      filePath,
      type,
      status: 'pending',
      addedAt: Date.now()
    };
    
    this.ingestionQueue.push(queueItem);
    this.emit('ingestion-update', { type: 'queued', item: queueItem });
  }

  async startQueueProcessor() {
    if (this.processing) return;
    this.processing = true;

    while (true) {
      if (this.ingestionQueue.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      const item = this.ingestionQueue.shift();
      await this.processQueueItem(item);
    }
  }

  async processQueueItem(item) {
    try {
      item.status = 'processing';
      this.emit('ingestion-update', { type: 'processing', item });

      const filePath = item.filePath;
      const fileId = this.getFileId(filePath);
      
      // Check if document exists
      const existingDoc = this.vectorStore.getDocument(fileId);
      
      // Process file
      const { content, metadata } = await this.documentProcessor.processFile(filePath);
      
      // Get chunking settings from settings
      const chunkSize = this.settings.chunkSize || 1000;
      const chunkOverlap = this.settings.chunkOverlap || 200;
      
      // Chunk content
      const chunks = await this.documentProcessor.chunkContent(content, metadata, chunkSize, chunkOverlap);
      
      // Update document in vector store
      this.vectorStore.addDocument({
        id: fileId,
        filePath,
        fileName: path.basename(filePath),
        fileType: path.extname(filePath).toLowerCase(),
        fileSize: metadata.fileSize,
        ingestedAt: existingDoc ? existingDoc.ingested_at : Date.now(),
        status: 'processing'
      });

      // Delete old chunks
      this.vectorStore.deleteDocumentChunks(fileId);

      // Add new chunks with document ID
      const chunksWithDocId = chunks.map(chunk => ({
        ...chunk,
        documentId: fileId,
        createdAt: Date.now()
      }));

      this.vectorStore.addChunks(chunksWithDocId);

      // Update document status
      this.vectorStore.updateDocumentStatus(fileId, 'completed');

      item.status = 'completed';
      this.emit('ingestion-update', { type: 'completed', item });
    } catch (error) {
      console.error('Error processing queue item:', error);
      item.status = 'error';
      item.error = error.message;
      this.emit('ingestion-update', { type: 'error', item });
    }
  }

  getFileId(filePath) {
    // Use file path as ID (normalized)
    return path.resolve(filePath);
  }

  getIngestionStatus() {
    return {
      queueLength: this.ingestionQueue.length,
      processing: this.processing,
      queue: this.ingestionQueue.map(item => ({
        id: item.id,
        filePath: item.filePath,
        status: item.status
      }))
    };
  }

  getFiles() {
    return this.settings.files || [];
  }

  getDirectories() {
    return this.settings.directories || [];
  }

  getDirectoryFiles(dirPath) {
    // Normalize directory path for comparison
    const normalizedDirPath = path.resolve(dirPath);
    
    // Find the directory entry to get recursive setting
    const dirEntry = this.settings.directories.find(d => {
      const normalized = path.resolve(d.path);
      return normalized === normalizedDirPath;
    });
    if (!dirEntry) {
      return [];
    }

    // Find all supported files in the directory
    const files = this.findSupportedFiles(dirPath, dirEntry.recursive || false);
    
    // Get ingestion status
    const ingestionStatus = this.getIngestionStatus();
    const statusMap = new Map();
    ingestionStatus.queue.forEach(item => {
      const normalized = path.resolve(item.filePath);
      statusMap.set(normalized, item.status);
    });
    
    // Get document status from vector store
    const documents = this.vectorStore.getDocuments();
    const docStatusMap = new Map();
    documents.forEach(doc => {
      const normalized = path.resolve(doc.file_path);
      docStatusMap.set(normalized, doc.status);
    });

    // Combine file info with status
    return files.map(filePath => {
      const normalizedFilePath = path.resolve(filePath);
      const fileId = this.getFileId(filePath);
      const queueStatus = statusMap.get(normalizedFilePath);
      const docStatus = docStatusMap.get(normalizedFilePath);
      
      // Determine overall status: queue status takes precedence, then doc status, then 'not-ingested'
      let status = 'not-ingested';
      if (queueStatus) {
        status = queueStatus;
      } else if (docStatus) {
        status = docStatus;
      }

      return {
        path: filePath,
        name: path.basename(filePath),
        status: status
      };
    });
  }

  removeFile(filePath) {
    // Normalize paths for comparison
    const normalizedPath = path.resolve(filePath);
    
    // Find the file entry (might be stored with different path format)
    const fileEntry = this.settings.files.find(f => {
      const storedPath = path.resolve(f.path);
      return storedPath === normalizedPath;
    });
    
    if (fileEntry) {
      // Remove from settings using the stored path format
      this.settings.files = this.settings.files.filter(f => {
        const storedPath = path.resolve(f.path);
        return storedPath !== normalizedPath;
      });
      this.saveSettings();
      
      // Stop watching (use stored path)
      this.unwatchFile(fileEntry.path);
    }
    
    // Remove from vector store
    const fileId = this.getFileId(filePath);
    this.vectorStore.deleteDocument(fileId);
    
    // Emit event to notify UI of vector store change
    this.emit('ingestion-update', { type: 'removed', filePath });
  }

  removeDirectory(dirPath) {
    // Normalize paths for comparison
    const normalizedDirPath = path.resolve(dirPath);
    
    // Find the directory entry (might be stored with different path format)
    const dirEntry = this.settings.directories.find(d => {
      const storedPath = path.resolve(d.path);
      return storedPath === normalizedDirPath;
    });
    
    if (dirEntry) {
      // Remove from settings using the stored path format
      this.settings.directories = this.settings.directories.filter(d => {
        const storedPath = path.resolve(d.path);
        return storedPath !== normalizedDirPath;
      });
      this.saveSettings();
      
      // Stop watching (use stored path)
      this.unwatchDirectory(dirEntry.path);
    }
    
    // Remove all files from this directory in the vector store
    const allDocuments = this.vectorStore.getDocuments();
    const normalizedDirPathWithSep = normalizedDirPath + path.sep;
    
    for (const doc of allDocuments) {
      const normalizedDocPath = path.resolve(doc.file_path);
      // Check if document is within the directory being removed
      if (normalizedDocPath.startsWith(normalizedDirPathWithSep) || normalizedDocPath === normalizedDirPath) {
        this.vectorStore.deleteDocument(doc.id);
      }
    }
    
    // Emit event to notify UI of vector store change
    this.emit('ingestion-update', { type: 'removed', dirPath });
  }

  updateFileWatch(filePath, watch) {
    const file = this.settings.files.find(f => f.path === filePath);
    if (file) {
      file.watch = watch;
      this._saveSettingsToDisk();
      
      if (watch) {
        this.watchFile(filePath);
      } else {
        this.unwatchFile(filePath);
      }
    }
  }

  updateDirectoryWatch(dirPath, watch, recursive) {
    const dir = this.settings.directories.find(d => d.path === dirPath);
    if (dir) {
      dir.watch = watch;
      dir.recursive = recursive;
      this._saveSettingsToDisk();
      
      if (watch) {
        this.watchDirectory(dirPath, recursive);
      } else {
        this.unwatchDirectory(dirPath);
      }
    }
  }

  watchFile(filePath) {
    if (this.fileWatchers.has(filePath)) {
      return;
    }

    const watcher = chokidar.watch(filePath);
    watcher.on('change', () => {
      this.addToQueue(filePath, 'file');
    });

    watcher.on('unlink', () => {
      // File was deleted, remove from vector store
      const fileId = this.getFileId(filePath);
      this.vectorStore.deleteDocument(fileId);
      // Emit event to notify UI of vector store change
      this.emit('ingestion-update', { type: 'removed', filePath });
    });

    this.fileWatchers.set(filePath, watcher);
  }

  unwatchFile(filePath) {
    const watcher = this.fileWatchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.fileWatchers.delete(filePath);
    }
  }

  watchDirectory(dirPath, recursive) {
    if (this.directoryWatchers.has(dirPath)) {
      return;
    }

    const pattern = recursive ? `${dirPath}/**/*` : `${dirPath}/*`;
    const watcher = chokidar.watch(pattern, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true
    });

    watcher.on('add', (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (['.txt', '.pdf', '.docx', '.xlsx', '.csv'].includes(ext)) {
        this.addToQueue(filePath, 'file');
      }
    });

    watcher.on('change', (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (['.txt', '.pdf', '.docx', '.xlsx', '.csv'].includes(ext)) {
        this.addToQueue(filePath, 'file');
      }
    });

    watcher.on('unlink', (filePath) => {
      // File was deleted from watched directory, remove from vector store
      const ext = path.extname(filePath).toLowerCase();
      if (['.txt', '.pdf', '.docx', '.xlsx', '.csv'].includes(ext)) {
        const fileId = this.getFileId(filePath);
        this.vectorStore.deleteDocument(fileId);
        // Emit event to notify UI of vector store change
        this.emit('ingestion-update', { type: 'removed', filePath });
      }
    });

    this.directoryWatchers.set(dirPath, watcher);
  }

  unwatchDirectory(dirPath) {
    const watcher = this.directoryWatchers.get(dirPath);
    if (watcher) {
      watcher.close();
      this.directoryWatchers.delete(dirPath);
    }
  }

  restoreWatchers() {
    // Restore file watchers
    for (const file of this.settings.files || []) {
      if (file.watch && fs.existsSync(file.path)) {
        this.watchFile(file.path);
      }
    }

    // Restore directory watchers
    for (const dir of this.settings.directories || []) {
      if (dir.watch && fs.existsSync(dir.path)) {
        this.watchDirectory(dir.path, dir.recursive);
      }
    }
  }

  getDocuments() {
    return this.vectorStore.getDocuments();
  }

  getDocument(documentId) {
    return this.vectorStore.getDocument(documentId);
  }

  getDocumentChunks(documentId) {
    return this.vectorStore.getDocumentChunks(documentId);
  }

  getChunkContent(chunkId) {
    return this.vectorStore.getChunk(chunkId);
  }

  getVectorStoreStats() {
    return this.vectorStore.getStats();
  }

  async search(query, limit = 10, algorithm = 'hybrid') {
    // Generate embedding for query (needed for vector and hybrid search)
    let queryEmbedding = null;
    if (algorithm === 'vector' || algorithm === 'hybrid') {
      if (this.embeddingModel) {
        try {
          const output = await this.embeddingModel(query);
          queryEmbedding = Array.from(output.data);
        } catch (error) {
          console.error('Error generating query embedding:', error);
          queryEmbedding = this.documentProcessor.simpleEmbedding(query);
        }
      } else {
        queryEmbedding = this.documentProcessor.simpleEmbedding(query);
      }
    }

    // Get all chunks for search
    const allChunks = this.vectorStore.getAllChunks();
    
    // Use search service to perform search
    const results = await this.searchService.search(query, queryEmbedding, allChunks, limit, algorithm);
    
    // Get document info for each result
    const documents = this.vectorStore.getDocuments();
    const docMap = new Map(documents.map(doc => [doc.id, doc]));
    
    return results.map(result => {
      const doc = docMap.get(result.document_id);
      return {
        chunkId: result.id,
        documentId: result.document_id,
        content: result.content,
        score: result.score,
        similarity: result.score, // Keep for backward compatibility
        algorithm: result.algorithm,
        metadata: {
          ...result.metadata,
          fileName: doc ? doc.file_name : 'Unknown',
          filePath: doc ? doc.file_path : 'Unknown'
        }
      };
    });
  }

  syncWatchedFilesWithVectorStore() {
    console.log('Syncing watched files/directories with vector store...');
    
    const watchedFilePaths = new Set();
    const watchedDirectories = new Set();
    
    // Collect all watched files
    for (const fileEntry of this.settings.files || []) {
      if (fs.existsSync(fileEntry.path)) {
        watchedFilePaths.add(path.resolve(fileEntry.path));
      }
    }
    
    // Collect all files from watched directories
    for (const dirEntry of this.settings.directories || []) {
      if (fs.existsSync(dirEntry.path)) {
        watchedDirectories.add(path.resolve(dirEntry.path));
        const files = this.findSupportedFiles(dirEntry.path, dirEntry.recursive || false);
        files.forEach(file => watchedFilePaths.add(path.resolve(file)));
      }
    }
    
    // Get all documents from vector store
    const allDocuments = this.vectorStore.getDocuments();
    const documentsByPath = new Map();
    allDocuments.forEach(doc => {
      const normalizedPath = path.resolve(doc.file_path);
      documentsByPath.set(normalizedPath, doc);
    });
    
    // Track paths that are watched (for orphan detection)
    const watchedPathsSet = new Set(watchedFilePaths);
    
    // 1. Process watched files that exist on disk
    let processedCount = 0;
    let updatedCount = 0;
    let addedCount = 0;
    let removedCount = 0;
    
    for (const filePath of watchedFilePaths) {
      try {
        if (!fs.existsSync(filePath)) {
          // File doesn't exist, remove from vector store if present
          const doc = documentsByPath.get(filePath);
          if (doc) {
            console.log(`Removing deleted file from vector store: ${filePath}`);
            this.vectorStore.deleteDocument(doc.id);
            removedCount++;
          }
          continue;
        }
        
        const stats = fs.statSync(filePath);
        const doc = documentsByPath.get(filePath);
        
        if (!doc) {
          // File not in vector store, queue for ingestion
          console.log(`Queueing new file for ingestion: ${filePath}`);
          this.addToQueue(filePath, 'file');
          addedCount++;
        } else if (stats.mtimeMs > doc.updated_at) {
          // File has been modified since last update, queue for re-processing
          console.log(`Queueing modified file for re-processing: ${filePath}`);
          this.addToQueue(filePath, 'file');
          updatedCount++;
        }
        
        processedCount++;
      } catch (error) {
        console.error(`Error syncing file ${filePath}:`, error);
      }
    }
    
    // 2. Remove orphaned documents (in vector store from watched paths but files no longer exist)
    // This handles the case where files were deleted between app sessions
    for (const [filePath, doc] of documentsByPath.entries()) {
      // Check if this document is from a watched path
      let isFromWatchedPath = watchedPathsSet.has(filePath);
      
      // If not directly watched, check if it's within a watched directory
      if (!isFromWatchedPath) {
        const normalizedDocPath = path.resolve(filePath);
        for (const watchedDir of watchedDirectories) {
          const normalizedDir = path.resolve(watchedDir);
          if (normalizedDocPath.startsWith(normalizedDir + path.sep) || normalizedDocPath === normalizedDir) {
            isFromWatchedPath = true;
            break;
          }
        }
      }
      
      // If from watched path but file no longer exists, remove it
      if (isFromWatchedPath && !fs.existsSync(filePath)) {
        console.log(`Removing orphaned document from vector store: ${filePath}`);
        this.vectorStore.deleteDocument(doc.id);
        removedCount++;
      }
    }
    
    console.log(`Sync complete: ${processedCount} processed, ${addedCount} added, ${updatedCount} updated, ${removedCount} removed`);
    
    if (addedCount > 0 || updatedCount > 0 || removedCount > 0) {
      this.emit('ingestion-update', { 
        type: 'sync-complete', 
        added: addedCount, 
        updated: updatedCount, 
        removed: removedCount 
      });
    }
  }

  async regenerateVectorStore() {
    console.log('Regenerating vector store...');
    
    // Clear the entire vector store
    this.vectorStore.clearStore();
    console.log('Vector store cleared');
    
    // Collect all files from current settings
    const allFilePaths = new Set();
    
    // Add files from files list
    for (const fileEntry of this.settings.files || []) {
      if (fs.existsSync(fileEntry.path)) {
        allFilePaths.add(path.resolve(fileEntry.path));
      }
    }
    
    // Add files from directories
    for (const dirEntry of this.settings.directories || []) {
      if (fs.existsSync(dirEntry.path)) {
        const files = this.findSupportedFiles(dirEntry.path, dirEntry.recursive || false);
        files.forEach(file => allFilePaths.add(path.resolve(file)));
      }
    }
    
    // Queue all files for re-indexing
    let queuedCount = 0;
    for (const filePath of allFilePaths) {
      try {
        if (fs.existsSync(filePath)) {
          this.addToQueue(filePath, 'file');
          queuedCount++;
        }
      } catch (error) {
        console.error(`Error queueing file ${filePath}:`, error);
      }
    }
    
    console.log(`Regeneration queued ${queuedCount} files`);
    
    // Emit event to notify UI
    this.emit('ingestion-update', { 
      type: 'regenerate-complete', 
      queued: queuedCount 
    });
    
    return { queued: queuedCount };
  }
}

module.exports = { RAGService };


