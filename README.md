# Froggy RAG MCP

A turnkey, integrated RAG (Retrieval Augmented Generation) system with MCP (Model Context Protocol) server and modern UI. This is a self-contained Electron application that provides a complete solution for document ingestion, vector storage, semantic search, and MCP server integration.

## Features

### 🔍 RAG System
- **Vector Store**: Built on SQLite, stored in `~/froggy-rag-mcp/data`
- **World-Class Chunking**: Supports `.docx`, `.xlsx`, `.pdf`, `.csv`, and `.txt` files
- **Queue-Based Processing**: Documents are processed in a queue, allowing semi-offline ingestion and chunking
- **Ingestion Status Tracking**: Real-time status monitoring for each document in the ingestion queue

### 📚 Document Management
- **File Ingestion**: Add individual files via drag-and-drop or file picker
- **Directory Ingestion**: Add entire directories for batch processing
- **File Watching**: Monitor files and directories for changes with automatic re-ingestion
- **Recursive Directory Watching**: Option to watch directories recursively

### 🔎 Search & Retrieval
- **Semantic Search**: World-class matching based on input queries and vector store
- **MRU (Most Recently Used)**: Quick access to recent searches
- **Chunk Inspection**: View content and metadata for retrieved chunks

### 🌐 MCP Server
- **Dual Interfaces**: Both stdio and REST API interfaces
- **RAG Tools**: Specialized tools for RAG operations
- **Server Management**: Start/stop server with configurable port
- **Request Logging**: Comprehensive logging of server requests and activities

### 🎨 User Interface
- **Modern Design**: Clean, intuitive interface with resizable panels
- **Tree Navigation**: Organized navigation with four main sections:
  - **Ingestion**: Manage files and directories
  - **Vector Store**: View documents, chunks, and metadata
  - **Search**: Perform semantic searches with MRU support
  - **Server**: Control MCP server and view logs
- **Persistent Settings**: Window state, splitter positions, and preferences are saved

## Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd froggy-nobs-mcp-rag
```

2. Install dependencies:
```bash
npm install
```

3. The `postinstall` script will automatically rebuild `better-sqlite3` for your platform.

## Usage

### Starting the Application

**Development mode** (with DevTools):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

### Building for Distribution

```bash
npm run build
```

This will create distributable packages in the `dist` directory using electron-builder.

## Application Structure

```
froggy-nobs-mcp-rag/
├── src/
│   ├── main/              # Electron main process
│   │   ├── main.js        # Main entry point
│   │   ├── preload.js     # Preload script
│   │   ├── ipc-handlers.js # IPC communication handlers
│   │   └── services/      # Core services
│   │       ├── rag-service.js        # RAG orchestration
│   │       ├── mcp-service.js        # MCP server implementation
│   │       ├── vector-store.js       # SQLite vector store
│   │       ├── document-processor.js # Document parsing & chunking
│   │       └── search-service.js     # Semantic search
│   └── renderer/          # Electron renderer process (UI)
│       ├── index.html     # Main HTML
│       ├── app.js         # UI logic
│       └── styles.css     # Styling
├── docs/                  # Documentation
└── package.json
```

## Data Storage

All application data is stored in:
```
~/froggy-rag-mcp/data/
```

This includes:
- Vector store database (SQLite)
- Settings and preferences
- Window state
- Watched files and directories configuration

## Supported File Formats

- **Microsoft Word**: `.docx`
- **Microsoft Excel**: `.xlsx`
- **PDF**: `.pdf`
- **CSV**: `.csv`
- **Plain Text**: `.txt`

## MCP Server

The MCP server provides both stdio and REST interfaces for integration with external applications.

### REST API

The REST server runs on a configurable port (default: 3000) and provides endpoints for:
- Document search
- Vector store operations
- RAG queries

### Server Management

- Start/stop the server from the UI
- Configure the server port
- View real-time logs of server activity

## Development

### Key Technologies

- **Electron**: Desktop application framework
- **@xenova/transformers**: Embedding model (Xenova/all-MiniLM-L6-v2)
- **better-sqlite3**: Vector store database
- **Express**: REST API server
- **chokidar**: File system watching
- **pdf-parse, mammoth, exceljs, docx**: Document parsing libraries

### Architecture

- **Main Process**: Handles file system operations, database access, and service orchestration
- **Renderer Process**: UI rendering and user interaction
- **IPC Communication**: Secure communication between main and renderer processes
- **Service Layer**: Modular services for RAG, MCP, vector storage, and search

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues, questions, or feature requests, please open an issue on the repository.
