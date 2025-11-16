// Global state
let currentCanvas = null;
let splitterPosition = 250;
let mruSearches = [];
let selectedDocumentId = null;
let selectedChunkId = null;
let expandedDirectories = new Set(); // Track which directories are expanded

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  await initializeApp();
  setupEventListeners();
  loadSettings();
});

async function initializeApp() {
  // Load settings
  const settings = await window.electronAPI.getSettings();
  if (settings.splitterPosition) {
    splitterPosition = settings.splitterPosition;
    document.getElementById('treePanel').style.width = `${splitterPosition}px`;
  }

  // Load MRU searches
  if (settings.mruSearches) {
    mruSearches = settings.mruSearches;
    updateMRUList();
  }

  // Setup splitter
  setupSplitter();

  // Setup tree navigation
  setupTreeNavigation();

  // Load initial data
  await refreshFiles();
  await refreshDirectories();
  await refreshVectorStore();
  await refreshServerStatus();
  
  // Auto-start server if enabled
  await checkAndAutoStartServer();

  // Setup event listeners for updates
  window.electronAPI.onIngestionUpdate(async (data) => {
    await refreshFiles();
    // Refresh directories but preserve expanded state
    const currentlyExpanded = Array.from(expandedDirectories);
    await refreshDirectories();
    // Re-expand directories that were expanded (refreshDirectories already does this, but ensure it's done)
    // The expandedDirectories set is maintained in refreshDirectories
    // Always refresh vector store when ingestion updates occur (file added/removed/changed)
    await refreshVectorStore();
  });

  window.electronAPI.onMCPServerLog((data) => {
    addServerLog(data);
  });
}

function setupEventListeners() {
  // File management
  document.getElementById('add-file-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('file-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      await window.electronAPI.ingestFile(file.path, false);
    }
    await refreshFiles();
    e.target.value = '';
  });

  // Directory management
  document.getElementById('add-directory-btn').addEventListener('click', async () => {
    const dirPath = await window.electronAPI.showDirectoryDialog();
    if (dirPath) {
      await window.electronAPI.ingestDirectory(dirPath, false, false);
      await refreshDirectories();
    }
  });

  // Search
  document.getElementById('search-btn').addEventListener('click', performSearch);
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
  
  // MRU dropdown functionality
  setupMRUDropdown();

  // Server controls
  document.getElementById('start-server-btn').addEventListener('click', async () => {
    const port = parseInt(document.getElementById('server-port').value) || 3000;
    try {
      await window.electronAPI.startMCPServer(port);
      // Save port for auto-start
      const settings = await window.electronAPI.getSettings();
      settings.serverPort = port;
      await window.electronAPI.saveSettings(settings);
      await refreshServerStatus();
    } catch (error) {
      alert(`Error starting server: ${error.message}`);
    }
  });

  document.getElementById('stop-server-btn').addEventListener('click', async () => {
    try {
      await window.electronAPI.stopMCPServer();
      await refreshServerStatus();
    } catch (error) {
      alert(`Error stopping server: ${error.message}`);
    }
  });

  document.getElementById('self-test-btn').addEventListener('click', async () => {
    await performSelfTest();
  });

  // Auto-start checkbox
  const autoStartCheckbox = document.getElementById('auto-start-server-checkbox');
  autoStartCheckbox.addEventListener('change', async (e) => {
    await saveAutoStartSetting(e.target.checked);
  });

  // Chunking settings
  const saveChunkingSettingsBtn = document.getElementById('save-chunking-settings-btn');
  if (saveChunkingSettingsBtn) {
    saveChunkingSettingsBtn.addEventListener('click', async () => {
      await saveChunkingSettings();
    });
  }

  // Drag and drop for files
  setupDragAndDrop();
}

function setupSplitter() {
  const splitter = document.getElementById('splitter');
  const treePanel = document.getElementById('treePanel');
  let isDragging = false;

  splitter.addEventListener('mousedown', (e) => {
    isDragging = true;
    splitter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const newPosition = e.clientX;
    if (newPosition >= 200 && newPosition <= 600) {
      splitterPosition = newPosition;
      treePanel.style.width = `${newPosition}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      splitter.classList.remove('dragging');
      document.body.style.cursor = '';
      saveSettings();
    }
  });
}

function setupTreeNavigation() {
  const treeItems = document.querySelectorAll('.tree-item');
  
  treeItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const node = item.dataset.node;
      const hasExpander = item.querySelector('.tree-expander');
      
      // Toggle expansion for parent nodes
      if (hasExpander) {
        item.classList.toggle('expanded');
        // Don't show canvas for parent nodes - only for leaf nodes
        return;
      }
      
      // Set active state
      treeItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      // Show appropriate canvas for leaf nodes
      showCanvas(node);
    });
  });
}

function showCanvas(canvasName) {
  // Hide all canvases
  document.querySelectorAll('.canvas').forEach(canvas => {
    canvas.style.display = 'none';
  });

  // Show selected canvas
  currentCanvas = canvasName;
  
  switch(canvasName) {
    case 'files':
      document.getElementById('files-canvas').style.display = 'block';
      refreshFiles();
      break;
    case 'directories':
      document.getElementById('directories-canvas').style.display = 'block';
      refreshDirectories();
      break;
    case 'vector-store':
      document.getElementById('vector-store-canvas').style.display = 'block';
      refreshVectorStore();
      loadChunkingSettings();
      break;
    case 'search':
      document.getElementById('search-canvas').style.display = 'block';
      // Ensure MRU dropdown is set up
      if (!document.getElementById('mru-dropdown')) {
        setupMRUDropdown();
      }
      break;
    case 'server':
      document.getElementById('server-canvas').style.display = 'block';
      refreshServerStatus();
      refreshServerLogs();
      loadAutoStartSetting();
      break;
  }
}

async function refreshFiles() {
  const files = await window.electronAPI.getFiles();
  const tbody = document.getElementById('files-tbody');
  const status = await window.electronAPI.getIngestionStatus();
  
  tbody.innerHTML = '';
  
  files.forEach(file => {
    const row = document.createElement('tr');
    const queueItem = status.queue.find(q => q.filePath === file.path);
    const fileStatus = queueItem ? queueItem.status : 'completed';
    
    // Escape HTML and JavaScript in file path
    const escapedPath = file.path.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    row.innerHTML = `
      <td>${file.path}</td>
      <td><span class="status-badge status-${fileStatus}">${fileStatus}</span></td>
      <td><input type="checkbox" ${file.watch ? 'checked' : ''} 
          data-file-path="${escapedPath}" class="file-watch-checkbox" /></td>
      <td><button class="btn btn-danger remove-file-btn" data-file-path="${escapedPath}">Remove</button></td>
    `;
    
    // Add event listeners
    const checkbox = row.querySelector('.file-watch-checkbox');
    checkbox.addEventListener('change', async (e) => {
      await window.updateFileWatch(file.path, e.target.checked);
    });
    
    const removeBtn = row.querySelector('.remove-file-btn');
    removeBtn.addEventListener('click', async () => {
      await window.removeFile(file.path);
    });
    
    tbody.appendChild(row);
  });
}

async function refreshDirectories() {
  const directories = await window.electronAPI.getDirectories();
  const tbody = document.getElementById('directories-tbody');
  
  tbody.innerHTML = '';
  
  for (const dir of directories) {
    // Create directory row
    const row = document.createElement('tr');
    row.className = 'directory-row';
    row.dataset.dirPath = dir.path;
    
    // Escape path for use in HTML attributes
    const escapedPath = dir.path.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    
    // Create path cell with clickable link
    const pathCell = document.createElement('td');
    const pathLink = document.createElement('span');
    pathLink.className = 'directory-path-link';
    pathLink.textContent = dir.path;
    pathLink.style.cursor = 'pointer';
    pathLink.style.color = '#1976d2';
    pathLink.style.textDecoration = 'underline';
    pathLink.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleDirectoryFiles(dir.path, row);
    });
    pathCell.appendChild(pathLink);
    
    // Create other cells
    const recursiveCell = document.createElement('td');
    const recursiveCheckbox = document.createElement('input');
    recursiveCheckbox.type = 'checkbox';
    recursiveCheckbox.checked = dir.recursive || false;
    recursiveCheckbox.addEventListener('change', async () => {
      await window.updateDirectoryRecursive(dir.path, recursiveCheckbox.checked);
    });
    recursiveCell.appendChild(recursiveCheckbox);
    
    const watchCell = document.createElement('td');
    const watchCheckbox = document.createElement('input');
    watchCheckbox.type = 'checkbox';
    watchCheckbox.checked = dir.watch || false;
    watchCheckbox.addEventListener('change', async () => {
      await window.updateDirectoryWatch(dir.path, watchCheckbox.checked);
    });
    watchCell.appendChild(watchCheckbox);
    
    const actionsCell = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      await window.removeDirectory(dir.path);
    });
    actionsCell.appendChild(removeBtn);
    
    // Append all cells to row
    row.appendChild(pathCell);
    row.appendChild(recursiveCell);
    row.appendChild(watchCell);
    row.appendChild(actionsCell);
    
    tbody.appendChild(row);
    
    // If this directory was expanded, show its files
    if (expandedDirectories.has(dir.path)) {
      await showDirectoryFiles(dir.path, row);
    }
  }
}

async function toggleDirectoryFiles(dirPath, row) {
  if (expandedDirectories.has(dirPath)) {
    // Collapse: remove files row
    const filesRow = row.nextElementSibling;
    if (filesRow && filesRow.classList.contains('directory-files-row')) {
      filesRow.remove();
    }
    expandedDirectories.delete(dirPath);
  } else {
    // Expand: show files
    await showDirectoryFiles(dirPath, row);
    expandedDirectories.add(dirPath);
  }
}

async function showDirectoryFiles(dirPath, directoryRow) {
  // Check if files row already exists and remove it to refresh
  let filesRow = directoryRow.nextElementSibling;
  if (filesRow && filesRow.classList.contains('directory-files-row')) {
    filesRow.remove();
  }
  
  try {
    const files = await window.electronAPI.getDirectoryFiles(dirPath);
    
    // Create a new row for files
    filesRow = document.createElement('tr');
    filesRow.className = 'directory-files-row';
    
    const filesCell = document.createElement('td');
    filesCell.colSpan = 4; // Span all columns
    
    if (files.length === 0) {
      filesCell.innerHTML = '<div class="directory-files-empty">No files found in this directory</div>';
    } else {
      const filesTable = document.createElement('table');
      filesTable.className = 'directory-files-table';
      
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>File Name</th>
          <th>Status</th>
        </tr>
      `;
      filesTable.appendChild(thead);
      
      const tbody = document.createElement('tbody');
      files.forEach(file => {
        const fileRow = document.createElement('tr');
        const nameCell = document.createElement('td');
        nameCell.textContent = file.name;
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge status-${file.status}`;
        statusBadge.textContent = file.status;
        statusCell.appendChild(statusBadge);
        fileRow.appendChild(nameCell);
        fileRow.appendChild(statusCell);
        tbody.appendChild(fileRow);
      });
      filesTable.appendChild(tbody);
      
      filesCell.appendChild(filesTable);
    }
    
    filesRow.appendChild(filesCell);
    directoryRow.parentNode.insertBefore(filesRow, directoryRow.nextSibling);
  } catch (error) {
    console.error('Error loading directory files:', error);
    const errorRow = document.createElement('tr');
    errorRow.className = 'directory-files-row';
    errorRow.innerHTML = `
      <td colspan="4" style="color: #d32f2f; padding: 10px;">
        Error loading files: ${error.message}
      </td>
    `;
    directoryRow.parentNode.insertBefore(errorRow, directoryRow.nextSibling);
  }
}

async function refreshVectorStore() {
  const stats = await window.electronAPI.getVectorStoreStats();
  const documents = await window.electronAPI.getDocuments();
  
  // Update stats
  const statsBar = document.getElementById('vector-store-stats');
  statsBar.innerHTML = `
    <div class="stats-item">
      <div class="stats-label">Documents</div>
      <div class="stats-value">${stats.documentCount}</div>
    </div>
    <div class="stats-item">
      <div class="stats-label">Chunks</div>
      <div class="stats-value">${stats.chunkCount}</div>
    </div>
    <div class="stats-item">
      <div class="stats-label">Total Size</div>
      <div class="stats-value">${formatBytes(stats.totalSize)}</div>
    </div>
  `;
  
  // Update documents table
  const tbody = document.getElementById('documents-tbody');
  tbody.innerHTML = '';
  
  documents.forEach(doc => {
    const row = document.createElement('tr');
    row.dataset.documentId = doc.id;
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => showDocumentChunks(doc.id));
    
    // Format the last updated timestamp
    const lastUpdated = doc.updated_at 
      ? new Date(doc.updated_at).toLocaleString() 
      : 'N/A';
    
    row.innerHTML = `
      <td>${doc.file_name}</td>
      <td>${doc.file_type}</td>
      <td><span class="status-badge status-${doc.status}">${doc.status}</span></td>
      <td>${lastUpdated}</td>
      <td>-</td>
    `;
    tbody.appendChild(row);
  });
}

async function showDocumentChunks(documentId) {
  console.log('showDocumentChunks called with documentId:', documentId);
  selectedDocumentId = documentId;
  const chunks = await window.electronAPI.getDocumentChunks(documentId);
  console.log('Chunks retrieved:', chunks.length);
  
  // Fetch document info for updated_at timestamp
  let doc = null;
  try {
    doc = await window.electronAPI.getDocument(documentId);
    console.log('Document info retrieved:', doc);
  } catch (error) {
    console.error('Error fetching document info:', error);
  }
  
  const panel = document.getElementById('chunks-panel');
  const tbody = document.getElementById('chunks-tbody');
  
  console.log('Panel found:', panel !== null, 'TBody found:', tbody !== null);
  
  panel.style.display = 'block';
  tbody.innerHTML = '';
  
  // Update chunk count in documents table
  const docRows = document.querySelectorAll('#documents-tbody tr');
  docRows.forEach(row => {
    if (row.dataset.documentId === documentId) {
      const chunkCountCell = row.querySelector('td:nth-child(5)');
      if (chunkCountCell) {
        chunkCountCell.textContent = chunks.length;
      }
    }
  });
  
  // Format the last updated timestamp
  const lastUpdated = doc && doc.updated_at 
    ? new Date(doc.updated_at).toLocaleString() 
    : 'N/A';
  
  console.log('Last updated value:', lastUpdated);
  console.log('Processing', chunks.length, 'chunks');
  
  chunks.forEach((chunk, index) => {
    if (!chunk.id) {
      console.error('Chunk missing ID:', chunk);
      return;
    }
    
    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    const preview = chunk.content ? (chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : '')) : '';
    
    // Create button element directly instead of using innerHTML
    const indexCell = document.createElement('td');
    indexCell.textContent = chunk.chunk_index ?? '';
    
    const previewCell = document.createElement('td');
    previewCell.textContent = preview;
    
    const lastUpdatedCell = document.createElement('td');
    lastUpdatedCell.textContent = lastUpdated;
    
    const actionsCell = document.createElement('td');
    
    if (index === 0) {
      console.log('First chunk - cells created:', {
        indexCell: indexCell.textContent,
        previewCell: previewCell.textContent.substring(0, 20),
        lastUpdatedCell: lastUpdatedCell.textContent,
        hasActionsCell: !!actionsCell
      });
    }
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-secondary';
    viewBtn.textContent = 'View';
    viewBtn.type = 'button'; // Prevent form submission if inside a form
    viewBtn.setAttribute('data-chunk-id', chunk.id);
    
    // Add button click handler
    viewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        showChunkDetail(chunk.id);
      } catch (error) {
        console.error('Error showing chunk detail:', error);
        alert(`Error opening chunk: ${error.message}`);
      }
    });
    
    actionsCell.appendChild(viewBtn);
    
    row.appendChild(indexCell);
    row.appendChild(previewCell);
    row.appendChild(lastUpdatedCell);
    row.appendChild(actionsCell);
    
    // Add row click handler
    row.addEventListener('click', (e) => {
      // Don't trigger if clicking on the button
      if (e.target.closest('button')) return;
      try {
        showChunkDetail(chunk.id);
      } catch (error) {
        console.error('Error showing chunk detail:', error);
        alert(`Error opening chunk: ${error.message}`);
      }
    });
    
    tbody.appendChild(row);
  });
}

// Store event handlers for cleanup
let overlayClickHandler = null;
let escapeKeyHandler = null;

async function showChunkDetail(chunkId) {
  if (!chunkId) {
    console.error('showChunkDetail called with no chunkId');
    alert('Error: No chunk ID provided');
    return;
  }
  
  try {
    selectedChunkId = chunkId;
    const chunk = await window.electronAPI.getChunkContent(chunkId);
    if (!chunk) {
      alert('Chunk not found');
      return;
    }
  
  const overlay = document.getElementById('chunk-modal-overlay');
  const content = document.getElementById('chunk-content');
  const metadata = document.getElementById('chunk-metadata');
  
  // Set content
  content.textContent = chunk.content;
  
  // Format metadata
  metadata.innerHTML = '';
  const metadataItems = [
    { label: 'Chunk ID', value: String(chunk.id || '') },
    { label: 'Chunk Index', value: String(chunk.chunk_index ?? '') },
    { label: 'Document ID', value: String(chunk.document_id || '') },
    { label: 'Created At', value: chunk.created_at ? new Date(chunk.created_at).toLocaleString() : 'N/A' },
    { label: 'Content Length', value: `${chunk.content ? chunk.content.length : 0} characters` },
    { label: 'Has Embedding', value: chunk.embedding ? 'Yes' : 'No' }
  ];
  
  // Add metadata from chunk.metadata object if it exists
  if (chunk.metadata && typeof chunk.metadata === 'object') {
    Object.entries(chunk.metadata).forEach(([key, value]) => {
      let stringValue;
      if (value === null || value === undefined) {
        stringValue = 'N/A';
      } else if (typeof value === 'object') {
        stringValue = JSON.stringify(value, null, 2);
      } else {
        stringValue = String(value);
      }
      metadataItems.push({
        label: key,
        value: stringValue
      });
    });
  }
  
  // Render metadata items
  metadataItems.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'chunk-metadata-item';
    
    const label = document.createElement('div');
    label.className = 'chunk-metadata-label';
    label.textContent = item.label + ':';
    
    const value = document.createElement('div');
    value.className = 'chunk-metadata-value';
    // Ensure value is always a string
    const stringValue = String(item.value || '');
    if (stringValue.length > 100 || stringValue.includes('\n')) {
      const pre = document.createElement('pre');
      pre.textContent = stringValue;
      value.appendChild(pre);
    } else {
      value.textContent = stringValue;
    }
    
    itemDiv.appendChild(label);
    itemDiv.appendChild(value);
    metadata.appendChild(itemDiv);
  });
  
  // Clean up previous event handlers
  if (overlayClickHandler) {
    overlay.removeEventListener('click', overlayClickHandler);
  }
  if (escapeKeyHandler) {
    document.removeEventListener('keydown', escapeKeyHandler);
  }
  
  // Close on overlay click
  overlayClickHandler = (e) => {
    if (e.target === overlay) {
      closeChunkDetail();
    }
  };
  overlay.addEventListener('click', overlayClickHandler);
  
  // Close on Escape key
  escapeKeyHandler = (e) => {
    if (e.key === 'Escape') {
      closeChunkDetail();
    }
  };
  document.addEventListener('keydown', escapeKeyHandler);
  
  // Show modal
  overlay.style.display = 'flex';
  } catch (error) {
    console.error('Error in showChunkDetail:', error);
    alert(`Error loading chunk: ${error.message}`);
  }
}

window.closeChunkDetail = function() {
  document.getElementById('chunk-modal-overlay').style.display = 'none';
  
  // Clean up event handlers
  const overlay = document.getElementById('chunk-modal-overlay');
  if (overlayClickHandler) {
    overlay.removeEventListener('click', overlayClickHandler);
    overlayClickHandler = null;
  }
  if (escapeKeyHandler) {
    document.removeEventListener('keydown', escapeKeyHandler);
    escapeKeyHandler = null;
  }
};

async function performSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;
  
  // Get selected algorithm
  const algorithmSelect = document.getElementById('search-algorithm');
  const algorithm = algorithmSelect ? algorithmSelect.value : 'hybrid';
  
  // Add to MRU - move to top if exists, otherwise add to top
  const index = mruSearches.indexOf(query);
  if (index !== -1) {
    mruSearches.splice(index, 1);
  }
  mruSearches.unshift(query);
  if (mruSearches.length > 10) {
    mruSearches.pop();
  }
  updateMRUList();
  saveSettings();
  
  // Hide dropdown after search
  hideMRUDropdown();
  
  // Perform search
  const results = await window.electronAPI.search(query, 10, algorithm);
  const resultsDiv = document.getElementById('search-results');
  const tbody = document.getElementById('search-results-tbody');
  
  tbody.innerHTML = '';
  
  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No results found</td></tr>';
  } else {
    results.forEach((result, index) => {
      const row = document.createElement('tr');
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => showSearchChunkDetail(result.chunkId, result));
      const preview = result.content.substring(0, 100) + (result.content.length > 100 ? '...' : '');
      
      // Format score based on algorithm
      let scoreDisplay = '';
      if (result.score !== undefined && result.score !== null) {
        if (result.algorithm === 'Vector' || result.algorithm === 'Hybrid') {
          // For vector/hybrid, show as percentage
          scoreDisplay = `${(result.score * 100).toFixed(4)}%`;
        } else {
          // For BM25/TF-IDF, show raw score with 4 decimal places
          scoreDisplay = result.score.toFixed(4);
        }
      } else {
        scoreDisplay = 'N/A';
      }
      
      row.innerHTML = `
        <td><span class="similarity-score">${scoreDisplay}</span></td>
        <td><span class="algorithm-badge">${result.algorithm || 'Hybrid'}</span></td>
        <td>${result.metadata?.fileName || 'Unknown'}</td>
        <td>${preview}</td>
        <td><button class="btn btn-secondary" data-result-index="${index}">View</button></td>
      `;
      const viewBtn = row.querySelector('button');
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showSearchChunkDetail(result.chunkId, result);
      });
      tbody.appendChild(row);
    });
  }
  
  resultsDiv.style.display = 'block';
}

async function showSearchChunkDetail(chunkId, result) {
  const detail = document.getElementById('search-chunk-detail');
  const content = document.getElementById('search-chunk-content');
  const metadata = document.getElementById('search-chunk-metadata');
  
  // If result is provided, use it; otherwise fetch from API
  if (result) {
    content.textContent = result.content;
    metadata.textContent = JSON.stringify(result.metadata, null, 2);
  } else {
    const chunk = await window.electronAPI.getChunkContent(chunkId);
    if (chunk) {
      content.textContent = chunk.content;
      metadata.textContent = JSON.stringify(chunk.metadata, null, 2);
    }
  }
  detail.style.display = 'block';
}

window.closeSearchChunkDetail = function() {
  document.getElementById('search-chunk-detail').style.display = 'none';
};

function updateMRUList() {
  const list = document.getElementById('mru-list');
  list.innerHTML = '';
  
  mruSearches.forEach(query => {
    const item = document.createElement('div');
    item.className = 'mru-item';
    item.textContent = query;
    item.addEventListener('click', () => {
      document.getElementById('search-input').value = query;
      performSearch();
    });
    list.appendChild(item);
  });
  
  // Also update dropdown
  updateMRUDropdown();
}

function setupMRUDropdown() {
  const searchInput = document.getElementById('search-input');
  const searchBox = document.querySelector('.search-box');
  
  if (!searchInput || !searchBox) return;
  
  // Check if dropdown already exists
  if (document.getElementById('mru-dropdown')) {
    return;
  }
  
  // Create dropdown container
  const dropdown = document.createElement('div');
  dropdown.id = 'mru-dropdown';
  dropdown.className = 'mru-dropdown';
  searchBox.style.position = 'relative';
  searchBox.appendChild(dropdown);
  
  // Show dropdown on focus or when typing
  searchInput.addEventListener('focus', showMRUDropdown);
  searchInput.addEventListener('input', (e) => {
    if (e.target.value.trim() || mruSearches.length > 0) {
      showMRUDropdown();
    } else {
      hideMRUDropdown();
    }
  });
  
  // Hide dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchBox.contains(e.target)) {
      hideMRUDropdown();
    }
  });
  
  // Handle keyboard navigation
  let selectedIndex = -1;
  searchInput.addEventListener('keydown', (e) => {
    const dropdown = document.getElementById('mru-dropdown');
    if (dropdown.style.display === 'none' || dropdown.style.display === '') {
      selectedIndex = -1;
      return;
    }
    
    const items = dropdown.querySelectorAll('.mru-dropdown-item');
    if (items.length === 0) {
      selectedIndex = -1;
      return;
    }
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateDropdownSelection(items, selectedIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
      updateDropdownSelection(items, selectedIndex);
    } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < items.length) {
      e.preventDefault();
      items[selectedIndex].click();
      selectedIndex = -1;
    } else if (e.key === 'Escape') {
      hideMRUDropdown();
      selectedIndex = -1;
    } else {
      // Reset selection when typing other keys
      selectedIndex = -1;
      updateDropdownSelection(items, selectedIndex);
    }
  });
}

function updateDropdownSelection(items, index) {
  items.forEach((item, i) => {
    if (i === index) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

function showMRUDropdown() {
  const dropdown = document.getElementById('mru-dropdown');
  if (!dropdown) return;
  if (mruSearches.length > 0) {
    dropdown.style.display = 'block';
    updateMRUDropdown();
  }
}

function hideMRUDropdown() {
  const dropdown = document.getElementById('mru-dropdown');
  if (dropdown) {
    dropdown.style.display = 'none';
  }
}

function updateMRUDropdown() {
  const dropdown = document.getElementById('mru-dropdown');
  if (!dropdown) return;
  
  const searchInput = document.getElementById('search-input');
  if (!searchInput) return;
  
  const query = searchInput.value.trim().toLowerCase();
  
  dropdown.innerHTML = '';
  
  // Filter and show up to 10 matching items
  const filtered = mruSearches
    .filter(item => !query || item.toLowerCase().includes(query))
    .slice(0, 10);
  
  if (filtered.length === 0 && query && mruSearches.length > 0) {
    // If there's a query but no matches, show nothing
    return;
  } else if (filtered.length > 0) {
    // Show filtered results
    filtered.forEach(queryItem => {
      addDropdownItem(dropdown, queryItem);
    });
  } else if (mruSearches.length > 0) {
    // Show all MRU items if no query
    mruSearches.slice(0, 10).forEach(queryItem => {
      addDropdownItem(dropdown, queryItem);
    });
  }
}

function addDropdownItem(dropdown, query) {
  const item = document.createElement('div');
  item.className = 'mru-dropdown-item';
  item.textContent = query;
  item.addEventListener('click', () => {
    document.getElementById('search-input').value = query;
    performSearch();
  });
  dropdown.appendChild(item);
}

async function refreshServerStatus() {
  const status = await window.electronAPI.getMCPServerStatus();
  const statusText = document.getElementById('server-status-text');
  const startBtn = document.getElementById('start-server-btn');
  const stopBtn = document.getElementById('stop-server-btn');
  const endpointsSection = document.getElementById('server-endpoints');
  const restUrlSpan = document.getElementById('rest-url-value');
  const mcpUrlSpan = document.getElementById('mcp-url-value');
  const endpointsTbody = document.getElementById('endpoints-tbody');
  
  statusText.textContent = status.running ? `Running on port ${status.port}` : 'Stopped';
  startBtn.disabled = status.running;
  stopBtn.disabled = !status.running;
  const selfTestBtn = document.getElementById('self-test-btn');
  if (selfTestBtn) {
    selfTestBtn.disabled = !status.running;
  }
  
  // Show/hide endpoints section based on server status
  if (status.running && status.port) {
    endpointsSection.style.display = 'block';
    
    // Display URLs
    restUrlSpan.textContent = status.restUrl || `http://localhost:${status.port}`;
    mcpUrlSpan.textContent = status.mcpUrl || `http://localhost:${status.port}/mcp`;
    
    // Setup copy buttons
    setupCopyButtons();
    
    // Define available endpoints
    const endpoints = [
      { method: 'GET', path: '/health', description: 'Health check endpoint', requiresPayload: false, requiresParams: false },
      { method: 'GET', path: '/status', description: 'Check connection status', requiresPayload: false, requiresParams: false },
      { method: 'GET', path: '/tools', description: 'List all available tools', requiresPayload: false, requiresParams: false },
      { method: 'POST', path: '/tools/search', description: 'Search the vector store', requiresPayload: true, requiresParams: false },
      { method: 'GET', path: '/tools/documents', description: 'Get all documents', requiresPayload: false, requiresParams: false },
      { method: 'GET', path: '/tools/documents/:documentId/chunks', description: 'Get chunks for a document', requiresPayload: false, requiresParams: true, params: [{ name: 'documentId', label: 'Document ID', type: 'text' }] },
      { method: 'GET', path: '/tools/chunks/:chunkId', description: 'Get chunk content by ID', requiresPayload: false, requiresParams: true, params: [{ name: 'chunkId', label: 'Chunk ID', type: 'text' }] },
      { method: 'GET', path: '/tools/stats', description: 'Get vector store statistics', requiresPayload: false, requiresParams: false },
      { method: 'POST', path: '/tools/ingest/file', description: 'Ingest a file', requiresPayload: true, requiresParams: false },
      { method: 'POST', path: '/tools/ingest/directory', description: 'Ingest a directory', requiresPayload: true, requiresParams: false },
      { method: 'POST', path: '/tools/:toolId', description: 'Invoke a specific tool w/ args', requiresPayload: true, requiresParams: true, params: [{ name: 'toolId', label: 'Tool ID', type: 'text' }] },
      { method: 'POST', path: '/mcp', description: 'MCP Protocol (JSON-RPC 2.0)', requiresPayload: true, requiresParams: false }
    ];
    
    endpointsTbody.innerHTML = '';
    endpoints.forEach((endpoint, index) => {
      const row = document.createElement('tr');
      const methodCell = document.createElement('td');
      methodCell.className = `endpoint-method endpoint-method-${endpoint.method.toLowerCase()}`;
      methodCell.textContent = endpoint.method;
      
      const pathCell = document.createElement('td');
      pathCell.className = 'endpoint-path';
      pathCell.textContent = endpoint.path;
      
      const descCell = document.createElement('td');
      descCell.className = 'endpoint-description';
      descCell.textContent = endpoint.description;
      
      const actionsCell = document.createElement('td');
      const testBtn = document.createElement('button');
      testBtn.className = 'btn btn-secondary';
      testBtn.textContent = 'Test';
      testBtn.style.fontSize = '12px';
      testBtn.style.padding = '6px 12px';
      testBtn.addEventListener('click', () => openEndpointTestModal(endpoint, status.restUrl || `http://localhost:${status.port}`));
      actionsCell.appendChild(testBtn);
      
      row.appendChild(methodCell);
      row.appendChild(pathCell);
      row.appendChild(descCell);
      row.appendChild(actionsCell);
      endpointsTbody.appendChild(row);
    });
  } else {
    endpointsSection.style.display = 'none';
  }
}

function setupCopyButtons() {
  // Remove existing event listeners by cloning and replacing buttons
  const copyButtons = document.querySelectorAll('.btn-copy');
  copyButtons.forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const urlType = newBtn.getAttribute('data-url-type');
      let urlToCopy = '';
      
      if (urlType === 'rest') {
        urlToCopy = document.getElementById('rest-url-value').textContent;
      } else if (urlType === 'mcp') {
        urlToCopy = document.getElementById('mcp-url-value').textContent;
      }
      
      if (urlToCopy) {
        try {
          await window.electronAPI.copyToClipboard(urlToCopy);
          // Visual feedback
          const originalText = newBtn.textContent;
          newBtn.textContent = '✓ Copied!';
          newBtn.style.background = '#4caf50';
          setTimeout(() => {
            newBtn.textContent = originalText;
            newBtn.style.background = '';
          }, 2000);
        } catch (error) {
          console.error('Error copying to clipboard:', error);
          alert('Failed to copy to clipboard');
        }
      }
    });
  });
}

async function refreshServerLogs() {
  const logs = await window.electronAPI.getMCPServerLogs(100);
  const container = document.getElementById('log-container');
  
  container.innerHTML = '';
  logs.forEach(log => {
    addServerLog(log);
  });
}

function addServerLog(log) {
  const container = document.getElementById('log-container');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  
  const levelClass = `log-level-${log.level}`;
  entry.innerHTML = `
    <span class="log-timestamp">${new Date(log.timestamp).toLocaleTimeString()}</span>
    <span class="${levelClass}">[${log.level.toUpperCase()}]</span>
    <span class="log-message">${log.message}</span>
  `;
  
  container.appendChild(entry);
  container.scrollTop = container.scrollHeight;
}

// Global functions for inline handlers
window.removeFile = async function(filePath) {
  if (confirm(`Remove file ${filePath}?`)) {
    try {
      await window.electronAPI.removeFile(filePath);
      await refreshFiles();
      await refreshVectorStore();
    } catch (error) {
      console.error('Error removing file:', error);
      alert(`Error removing file: ${error.message}`);
    }
  }
};

window.removeDirectory = async function(dirPath) {
  if (confirm(`Remove directory ${dirPath}?`)) {
    await window.electronAPI.removeDirectory(dirPath);
    await refreshDirectories();
  }
};

window.updateFileWatch = async function(filePath, watch) {
  await window.electronAPI.updateFileWatch(filePath, watch);
};

window.updateDirectoryWatch = async function(dirPath, watch) {
  const dir = (await window.electronAPI.getDirectories()).find(d => d.path === dirPath);
  await window.electronAPI.updateDirectoryWatch(dirPath, watch, dir?.recursive || false);
};

window.updateDirectoryRecursive = async function(dirPath, recursive) {
  const dir = (await window.electronAPI.getDirectories()).find(d => d.path === dirPath);
  await window.electronAPI.updateDirectoryWatch(dirPath, dir?.watch || false, recursive);
};

function setupDragAndDrop() {
  const filesCanvas = document.getElementById('files-canvas');
  const directoriesCanvas = document.getElementById('directories-canvas');
  
  [filesCanvas, directoriesCanvas].forEach(canvas => {
    if (!canvas) return;
    
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      canvas.style.backgroundColor = '#e3f2fd';
    });
    
    canvas.addEventListener('dragleave', () => {
      canvas.style.backgroundColor = '';
    });
    
    canvas.addEventListener('drop', async (e) => {
      e.preventDefault();
      canvas.style.backgroundColor = '';
      
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        if (canvas.id === 'files-canvas') {
          await window.electronAPI.ingestFile(file.path, false);
        } else if (canvas.id === 'directories-canvas') {
          // For directories, we'd need to handle this differently
          // For now, just show a message
          alert('Please use the Add Directory button to add directories');
        }
      }
      
      await refreshFiles();
      await refreshDirectories();
    });
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function saveSettings() {
  const settings = await window.electronAPI.getSettings();
  settings.splitterPosition = splitterPosition;
  settings.mruSearches = mruSearches;
  await window.electronAPI.saveSettings(settings);
}

async function saveAutoStartSetting(enabled) {
  const settings = await window.electronAPI.getSettings();
  settings.autoStartServer = enabled;
  await window.electronAPI.saveSettings(settings);
}

async function loadAutoStartSetting() {
  const settings = await window.electronAPI.getSettings();
  const checkbox = document.getElementById('auto-start-server-checkbox');
  if (checkbox) {
    checkbox.checked = settings.autoStartServer || false;
  }
  // Also load saved port if available
  const portInput = document.getElementById('server-port');
  if (portInput && settings.serverPort) {
    portInput.value = settings.serverPort;
  }
}

async function checkAndAutoStartServer() {
  const settings = await window.electronAPI.getSettings();
  if (settings.autoStartServer) {
    const status = await window.electronAPI.getMCPServerStatus();
    if (!status.running) {
      const port = settings.serverPort || 3000;
      try {
        await window.electronAPI.startMCPServer(port);
        // Update port input if it exists
        const portInput = document.getElementById('server-port');
        if (portInput) {
          portInput.value = port;
        }
        await refreshServerStatus();
      } catch (error) {
        console.error('Error auto-starting server:', error);
        // Don't show alert on auto-start failure, just log it
      }
    }
  }
}

async function loadSettings() {
  const settings = await window.electronAPI.getSettings();
  if (settings.splitterPosition) {
    splitterPosition = settings.splitterPosition;
    document.getElementById('treePanel').style.width = `${splitterPosition}px`;
  }
  if (settings.mruSearches) {
    mruSearches = settings.mruSearches;
    updateMRUList();
  }
}

async function loadChunkingSettings() {
  const settings = await window.electronAPI.getSettings();
  const chunkSizeInput = document.getElementById('chunk-size-input');
  const chunkOverlapInput = document.getElementById('chunk-overlap-input');
  
  if (chunkSizeInput) {
    chunkSizeInput.value = settings.chunkSize || 1000;
  }
  if (chunkOverlapInput) {
    chunkOverlapInput.value = settings.chunkOverlap || 200;
  }
}

async function saveChunkingSettings() {
  const chunkSizeInput = document.getElementById('chunk-size-input');
  const chunkOverlapInput = document.getElementById('chunk-overlap-input');
  
  if (!chunkSizeInput || !chunkOverlapInput) {
    return;
  }
  
  const chunkSize = parseInt(chunkSizeInput.value) || 1000;
  const chunkOverlap = parseInt(chunkOverlapInput.value) || 200;
  
  // Validate values
  if (chunkSize < 100 || chunkSize > 10000) {
    alert('Chunk size must be between 100 and 10000 characters');
    return;
  }
  
  if (chunkOverlap < 0 || chunkOverlap > 5000) {
    alert('Overlap must be between 0 and 5000 characters');
    return;
  }
  
  if (chunkOverlap >= chunkSize) {
    alert('Overlap must be less than chunk size');
    return;
  }
  
  const settings = await window.electronAPI.getSettings();
  settings.chunkSize = chunkSize;
  settings.chunkOverlap = chunkOverlap;
  await window.electronAPI.saveSettings(settings);
  
  // Show confirmation
  const btn = document.getElementById('save-chunking-settings-btn');
  const originalText = btn.textContent;
  btn.textContent = '✓ Saved!';
  btn.style.background = '#4caf50';
  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
  }, 2000);
}

async function performSelfTest() {
  const selfTestBtn = document.getElementById('self-test-btn');
  if (!selfTestBtn) return;
  
  const status = await window.electronAPI.getMCPServerStatus();
  if (!status.running || !status.port) {
    alert('Server is not running');
    return;
  }
  
  const restUrl = status.restUrl || `http://localhost:${status.port}`;
  const testUrl = `${restUrl}/tools/documents`;
  
  try {
    // Disable button during test
    selfTestBtn.disabled = true;
    const originalText = selfTestBtn.textContent;
    selfTestBtn.textContent = 'Testing...';
    
    // Make REST call
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Show success message with results
    const toolCount = data.documents ? data.documents.length : 0;
    alert(`Self Test Successful!\n\nRetrieved ${toolCount} document(s) from the server.\n\nEndpoint: ${testUrl}`);
    
    // Restore button
    selfTestBtn.textContent = originalText;
    selfTestBtn.disabled = false;
  } catch (error) {
    console.error('Self test error:', error);
    alert(`Self Test Failed!\n\nError: ${error.message}\n\nEndpoint: ${testUrl}`);
    
    // Restore button
    const originalText = selfTestBtn.textContent.replace('Testing...', 'Self Test');
    selfTestBtn.textContent = originalText;
    selfTestBtn.disabled = false;
  }
}

let currentTestEndpoint = null;
let currentTestBaseUrl = null;
// Store event handler for cleanup
let endpointTestOverlayClickHandler = null;
let endpointTestEscapeKeyHandler = null;

// Helper functions for persistent test payloads
async function getEndpointTestPayloads() {
  const settings = await window.electronAPI.getSettings();
  return settings.endpointTestPayloads || {};
}

async function saveEndpointTestPayload(endpointPath, payload, params) {
  const settings = await window.electronAPI.getSettings();
  if (!settings.endpointTestPayloads) {
    settings.endpointTestPayloads = {};
  }
  settings.endpointTestPayloads[endpointPath] = {
    payload: payload,
    params: params
  };
  await window.electronAPI.saveSettings(settings);
}

async function getDefaultPayload(endpointPath) {
  let defaultPayload = {};
  if (endpointPath === '/tools/search') {
    defaultPayload = { query: 'test query', limit: 10, algorithm: 'hybrid' };
  } else if (endpointPath === '/tools/ingest/file') {
    defaultPayload = { filePath: '', watch: false };
  } else if (endpointPath === '/tools/ingest/directory') {
    defaultPayload = { dirPath: '', recursive: false, watch: false };
  } else if (endpointPath === '/tools/:toolId') {
    defaultPayload = { query: 'test query', limit: 10 };
  } else if (endpointPath === '/mcp') {
    defaultPayload = {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {},
      id: 1
    };
  }
  return defaultPayload;
}

async function openEndpointTestModal(endpoint, baseUrl) {
  currentTestEndpoint = endpoint;
  currentTestBaseUrl = baseUrl;
  
  const modal = document.getElementById('endpoint-test-modal');
  const titleElement = document.getElementById('test-modal-title');
  const requestView = document.getElementById('test-modal-request-view');
  const responseView = document.getElementById('test-modal-response-view');
  const methodSpan = document.getElementById('test-modal-method');
  const endpointSpan = document.getElementById('test-modal-endpoint');
  const previewSection = document.getElementById('test-modal-preview-section');
  const previewContent = document.getElementById('test-modal-preview-content');
  const paramsSection = document.getElementById('test-modal-params-section');
  const paramsInputs = document.getElementById('test-modal-params-inputs');
  const payloadSection = document.getElementById('test-modal-payload-section');
  const payloadTextarea = document.getElementById('test-modal-payload');
  const sendBtn = document.getElementById('test-endpoint-send-btn');
  const cancelBtn = document.getElementById('test-endpoint-cancel-btn');
  
  // Show request view, hide response view
  requestView.style.display = 'block';
  responseView.style.display = 'none';
  
  // Set title and buttons
  titleElement.textContent = 'Send Request';
  sendBtn.style.display = 'inline-block';
  sendBtn.textContent = 'Send';
  sendBtn.disabled = false;
  cancelBtn.textContent = 'Cancel';
  
  // Set method and endpoint
  methodSpan.textContent = endpoint.method;
  endpointSpan.textContent = endpoint.path;
  
  // Load saved payloads and params
  const savedPayloads = await getEndpointTestPayloads();
  const savedData = savedPayloads[endpoint.path] || {};
  
  // Handle parameters (URL path params)
  if (endpoint.requiresParams && endpoint.params) {
    paramsSection.style.display = 'block';
    paramsInputs.innerHTML = '';
    
    const paramsResetSection = document.getElementById('test-modal-params-reset-section');
    paramsResetSection.style.display = 'block';
    
    endpoint.params.forEach(param => {
      const inputGroup = document.createElement('div');
      inputGroup.style.marginBottom = '10px';
      
      const label = document.createElement('label');
      label.textContent = `${param.label}:`;
      label.style.display = 'block';
      label.style.marginBottom = '5px';
      label.style.fontWeight = '500';
      
      const input = document.createElement('input');
      input.type = param.type || 'text';
      input.id = `test-param-${param.name}`;
      input.style.width = '100%';
      input.style.padding = '8px';
      input.style.border = '1px solid #ccc';
      input.style.borderRadius = '4px';
      input.placeholder = param.placeholder || `Enter ${param.label.toLowerCase()}`;
      
      // Load saved parameter value if exists
      if (savedData.params && savedData.params[param.name] !== undefined) {
        input.value = savedData.params[param.name];
      }
      
      // Save on blur (when user leaves the field)
      input.addEventListener('blur', async () => {
        await saveCurrentTestPayload();
      });
      
      inputGroup.appendChild(label);
      inputGroup.appendChild(input);
      paramsInputs.appendChild(inputGroup);
    });
  } else {
    paramsSection.style.display = 'none';
    document.getElementById('test-modal-params-reset-section').style.display = 'none';
  }
  
  // Handle request payload
  if (endpoint.requiresPayload) {
    payloadSection.style.display = 'block';
    
    // Load saved payload or use default
    let payloadToUse;
    if (savedData.payload) {
      try {
        payloadToUse = typeof savedData.payload === 'string' ? JSON.parse(savedData.payload) : savedData.payload;
      } catch (e) {
        // If saved payload is invalid JSON, use default
        payloadToUse = await getDefaultPayload(endpoint.path);
      }
    } else {
      payloadToUse = await getDefaultPayload(endpoint.path);
    }
    
    payloadTextarea.value = JSON.stringify(payloadToUse, null, 2);
    
    // Save on blur (when user leaves the textarea) - avoid saving on every keystroke
    payloadTextarea.addEventListener('blur', async () => {
      // Validate JSON before saving
      const text = payloadTextarea.value.trim();
      if (text) {
        try {
          JSON.parse(text);
          await saveCurrentTestPayload();
          updateRequestPreview(); // Update preview when payload changes
        } catch (e) {
          // Don't save invalid JSON, but don't show error either
          // User can fix it and it will save on next blur
        }
      }
    });
  } else {
    payloadSection.style.display = 'none';
  }
  
  // Update request preview
  updateRequestPreview();
  
  // Add input listeners to update preview
  if (endpoint.requiresParams && endpoint.params) {
    endpoint.params.forEach(param => {
      const input = document.getElementById(`test-param-${param.name}`);
      if (input) {
        input.addEventListener('input', updateRequestPreview);
        input.addEventListener('change', updateRequestPreview);
      }
    });
  }
  if (payloadTextarea) {
    payloadTextarea.addEventListener('input', updateRequestPreview);
  }
  
  // Clean up previous event handlers
  if (endpointTestOverlayClickHandler) {
    modal.removeEventListener('click', endpointTestOverlayClickHandler);
  }
  if (endpointTestEscapeKeyHandler) {
    document.removeEventListener('keydown', endpointTestEscapeKeyHandler);
  }
  
  // Close on overlay click
  endpointTestOverlayClickHandler = (e) => {
    if (e.target === modal) {
      closeEndpointTestModal();
    }
  };
  modal.addEventListener('click', endpointTestOverlayClickHandler);
  
  // Close on Escape key
  endpointTestEscapeKeyHandler = (e) => {
    if (e.key === 'Escape') {
      closeEndpointTestModal();
    }
  };
  document.addEventListener('keydown', endpointTestEscapeKeyHandler);
  
  modal.style.display = 'flex';
}

function updateRequestPreview() {
  if (!currentTestEndpoint || !currentTestBaseUrl) return;
  
  const previewContent = document.getElementById('test-modal-preview-content');
  if (!previewContent) return;
  
  // Build URL with path parameters
  let url = currentTestBaseUrl + currentTestEndpoint.path;
  const params = {};
  
  if (currentTestEndpoint.requiresParams && currentTestEndpoint.params) {
    currentTestEndpoint.params.forEach(param => {
      const input = document.getElementById(`test-param-${param.name}`);
      if (input) {
        const value = input.value.trim();
        params[param.name] = value;
        if (value) {
          url = url.replace(`:${param.name}`, encodeURIComponent(value));
        }
      }
    });
  }
  
  let previewHTML = `<div style="margin-bottom: 8px;"><strong>URL:</strong> <span style="color: #1976d2;">${url}</span></div>`;
  
  if (currentTestEndpoint.method === 'POST' && currentTestEndpoint.requiresPayload) {
    const payloadTextarea = document.getElementById('test-modal-payload');
    if (payloadTextarea) {
      const payloadText = payloadTextarea.value.trim();
      if (payloadText) {
        try {
          const payload = JSON.parse(payloadText);
          previewHTML += `<div><strong>Body:</strong></div>`;
          previewHTML += `<pre style="margin: 4px 0 0 0; padding: 8px; background: white; border: 1px solid #e0e0e0; border-radius: 4px; overflow-x: auto; font-size: 11px;">${JSON.stringify(payload, null, 2)}</pre>`;
        } catch (e) {
          previewHTML += `<div style="color: #d32f2f; font-size: 11px; margin-top: 4px;">⚠ Invalid JSON in payload</div>`;
        }
      }
    }
  }
  
  previewContent.innerHTML = previewHTML;
}

async function saveCurrentTestPayload() {
  if (!currentTestEndpoint) return;
  
  const payloadTextarea = document.getElementById('test-modal-payload');
  const params = {};
  
  // Collect parameter values
  if (currentTestEndpoint.requiresParams && currentTestEndpoint.params) {
    currentTestEndpoint.params.forEach(param => {
      const input = document.getElementById(`test-param-${param.name}`);
      if (input) {
        params[param.name] = input.value;
      }
    });
  }
  
  // Get payload value
  let payload = null;
  if (currentTestEndpoint.requiresPayload && payloadTextarea) {
    payload = payloadTextarea.value.trim();
  }
  
  await saveEndpointTestPayload(currentTestEndpoint.path, payload, params);
}

window.resetEndpointTestPayload = async function() {
  if (!currentTestEndpoint) return;
  
  const payloadTextarea = document.getElementById('test-modal-payload');
  if (!payloadTextarea) return;
  
  const defaultPayload = await getDefaultPayload(currentTestEndpoint.path);
  payloadTextarea.value = JSON.stringify(defaultPayload, null, 2);
  
  // Save the reset
  await saveCurrentTestPayload();
};

window.resetEndpointTestParams = async function() {
  if (!currentTestEndpoint || !currentTestEndpoint.requiresParams) return;
  
  if (currentTestEndpoint.params) {
    currentTestEndpoint.params.forEach(param => {
      const input = document.getElementById(`test-param-${param.name}`);
      if (input) {
        input.value = '';
      }
    });
  }
  
  // Save the reset
  await saveCurrentTestPayload();
};

window.closeEndpointTestModal = function() {
  const modal = document.getElementById('endpoint-test-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  
  // Clean up event handlers
  if (endpointTestOverlayClickHandler) {
    modal.removeEventListener('click', endpointTestOverlayClickHandler);
    endpointTestOverlayClickHandler = null;
  }
  if (endpointTestEscapeKeyHandler) {
    document.removeEventListener('keydown', endpointTestEscapeKeyHandler);
    endpointTestEscapeKeyHandler = null;
  }
  
  currentTestEndpoint = null;
  currentTestBaseUrl = null;
};

window.sendEndpointTest = async function() {
  if (!currentTestEndpoint || !currentTestBaseUrl) return;
  
  const sendBtn = document.getElementById('test-endpoint-send-btn');
  const requestView = document.getElementById('test-modal-request-view');
  const responseView = document.getElementById('test-modal-response-view');
  const titleElement = document.getElementById('test-modal-title');
  const resultContent = document.getElementById('test-modal-result-content');
  const responseMethodSpan = document.getElementById('test-modal-response-method');
  const responseEndpointSpan = document.getElementById('test-modal-response-endpoint');
  
  try {
    // Disable button during request
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    
    // Build URL with path parameters
    let url = currentTestBaseUrl + currentTestEndpoint.path;
    if (currentTestEndpoint.requiresParams && currentTestEndpoint.params) {
      currentTestEndpoint.params.forEach(param => {
        const input = document.getElementById(`test-param-${param.name}`);
        const value = input ? input.value.trim() : '';
        if (!value) {
          throw new Error(`${param.label} is required`);
        }
        url = url.replace(`:${param.name}`, encodeURIComponent(value));
      });
    }
    
    // Prepare request options
    const options = {
      method: currentTestEndpoint.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    // Add body for POST requests with payload
    if (currentTestEndpoint.requiresPayload && currentTestEndpoint.method === 'POST') {
      const payloadTextarea = document.getElementById('test-modal-payload');
      const payloadText = payloadTextarea.value.trim();
      
      if (!payloadText) {
        throw new Error('Request payload is required');
      }
      
      try {
        options.body = payloadText;
        // Validate JSON
        JSON.parse(payloadText);
      } catch (e) {
        throw new Error('Invalid JSON payload: ' + e.message);
      }
    }
    
    // Make the request
    const response = await fetch(url, options);
    
    // Parse response
    let responseData;
    const contentType = response.headers.get('content-type');
    try {
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
    } catch (parseError) {
      responseData = await response.text();
    }
    
    // Switch to response view
    requestView.style.display = 'none';
    responseView.style.display = 'block';
    titleElement.textContent = 'Response';
    
    // Hide Send button, rename Cancel to Close
    sendBtn.style.display = 'none';
    const cancelBtn = document.getElementById('test-endpoint-cancel-btn');
    cancelBtn.textContent = 'Close';
    
    // Set response details
    responseMethodSpan.textContent = currentTestEndpoint.method;
    responseEndpointSpan.textContent = url;
    
    // Display result
    const statusColor = response.ok ? '#2e7d32' : '#d32f2f';
    const statusText = response.ok ? 'Success' : 'Error';
    resultContent.innerHTML = `<strong style="color: ${statusColor};">Status:</strong> ${response.status} ${response.statusText} (${statusText})\n\n<strong>Response:</strong>\n${typeof responseData === 'string' ? responseData : JSON.stringify(responseData, null, 2)}`;
    resultContent.scrollTop = 0;
    
    // Save payload and params after successful test
    await saveCurrentTestPayload();
    
  } catch (error) {
    console.error('Endpoint test error:', error);
    
    // Switch to response view even on error
    requestView.style.display = 'none';
    responseView.style.display = 'block';
    titleElement.textContent = 'Response';
    
    // Hide Send button, rename Cancel to Close
    sendBtn.style.display = 'none';
    const cancelBtn = document.getElementById('test-endpoint-cancel-btn');
    cancelBtn.textContent = 'Close';
    
    // Set response details
    responseMethodSpan.textContent = currentTestEndpoint.method;
    const url = currentTestBaseUrl + currentTestEndpoint.path;
    responseEndpointSpan.textContent = url;
    
    // Display error
    resultContent.innerHTML = `<strong style="color: #d32f2f;">Error:</strong>\n${error.message}`;
    resultContent.scrollTop = 0;
  }
};

