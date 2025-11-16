# 🐸 Froggy RAG MCP - User Guide

> **🎯 The Complete RAG Solution - All-in-One, Zero Configuration**  
> 
> **Transform your documents into an intelligent knowledge base.** Froggy RAG MCP is the **ultimate one-stop shop** that brings everything you need into one integrated application:
> 
> - 📥 **Ingest** documents with drag-and-drop simplicity
> - 🗄️ **Manage** your entire document store with an intuitive interface
> - 🔍 **Search** semantically across all your documents
> - 🌐 **Run** a fully integrated MCP server for AI assistant integration
> 
> **No separate services to configure. No complex setup. No mess, no fuss.**  
> Just run the app and enjoy! Everything works together seamlessly out of the box.

---

## 🚀 Quick Start

### ⚡ Just Run and Enjoy!

**That's it!** No configuration files. No separate services to start. No database setup. Everything is integrated and ready to go.

| Mode | Command | Description |
|------|---------|-------------|
| 🛠️ **Development** | `npm run dev` | Launch with DevTools for debugging |
| 🎯 **Production** | `npm start` | Launch optimized production build |

```bash
# Development mode (with DevTools)
npm run dev

# Production mode
npm start
```

> 💡 **Everything is included:** Document ingestion, vector store management, semantic search, and MCP server - all running in one beautiful, integrated application.

---

## ✨ Core Features

**🎯 Everything You Need in One Place**

Froggy RAG MCP combines all the components of a complete RAG system into a single, integrated application. No need to manage separate services, databases, or APIs - it's all here, working together seamlessly.

### 📄 1. Document Ingestion

**Transform any document into searchable knowledge.** Froggy RAG MCP supports multiple file formats and ingestion methods, making it easy to build your knowledge base.

#### 📁 Adding Files

| Step | Action | Details |
|------|--------|---------|
| 1️⃣ | Navigate | Go to **Ingestion > Files** in the left sidebar |
| 2️⃣ | Add Files | Click **Add File** or drag & drop files onto the canvas |
| 3️⃣ | Auto-Process | Files are automatically processed and added to the vector store |
| 4️⃣ | Watch Mode | Enable **Watch** to automatically re-ingest when files change |

#### 📋 Supported File Formats

| Format | Extension | Use Cases |
|--------|-----------|-----------|
| 📝 **Microsoft Word** | `.docx` | Reports, documentation, articles |
| 📊 **Microsoft Excel** | `.xlsx` | Spreadsheets, data tables, analysis |
| 📑 **PDF** | `.pdf` | Research papers, manuals, forms |
| 📈 **CSV** | `.csv` | Data exports, structured information |
| 📄 **Plain Text** | `.txt` | Notes, logs, simple documents |

#### 📂 Adding Directories

**Batch process entire document collections with a single click.**

| Feature | Description |
|---------|-------------|
| 🔄 **Recursive** | Process subdirectories automatically |
| 👁️ **Watch Mode** | Monitor directories for changes and auto-re-ingest |
| 📊 **Tree View** | Expand directory paths to see individual files |
| ⚡ **Queue Processing** | Documents process in background, allowing you to continue working |

**How to add directories:**
1. Navigate to **Ingestion > Directories**
2. Click **Add Directory**
3. Select your directory
4. Configure options (Recursive, Watch)
5. Click on directory paths to expand and view files

---

### 🗄️ 2. Vector Store Management

**Your intelligent document repository.** View, manage, and configure your entire knowledge base from one central location.

#### 📊 Store Overview

Navigate to **Vector Store** to access:

- 📈 **Real-time Statistics**: Total documents, chunks, and storage size
- 🔍 **Document Browser**: View all ingested documents in a searchable table
- ⚙️ **Chunking Configuration**: Fine-tune how documents are processed
- 📑 **Chunk Inspector**: Deep dive into document chunks and metadata

#### ⚙️ Chunking Settings

**Optimize document processing for your use case.**

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| **Chunk Size** | 100-10,000 | 1,000 | Characters per chunk |
| **Overlap** | 0-5,000 | 200 | Overlapping characters between chunks |

> 💡 **Tip**: Click **Save Settings** to apply changes. New settings affect only newly ingested documents.

#### 🔍 Viewing Document Chunks

1. Click any document in the documents table
2. Chunks panel appears showing all chunks for that document
3. Click **View** on any chunk to see full content and metadata
4. Explore chunk relationships and context

---

### 🔎 3. Semantic Search

**Find exactly what you need, even when you don't know the exact words.** Our advanced search algorithms understand meaning, not just keywords.

#### 🎯 Performing a Search

| Step | Action |
|------|--------|
| 1️⃣ | Enter your search query in the search box |
| 2️⃣ | Select a search algorithm (see below) |
| 3️⃣ | Click **Search** or press Enter |
| 4️⃣ | Review results with relevance scores |
| 5️⃣ | Click any result to view full chunk content |

#### 🧠 Search Algorithms

| Algorithm | Best For | Description |
|-----------|---------|-------------|
| 🎯 **Hybrid (BM25 + Vector)** | ⭐ **Recommended** | Combines keyword and semantic matching for best results |
| 🔤 **BM25** | Exact keywords | Traditional keyword-based ranking |
| 📊 **TF-IDF** | Term frequency | Statistical term importance weighting |
| 🧬 **Vector Similarity** | Concepts & meaning | Pure semantic similarity search |

#### 📋 Search Results Display

Each result shows:
- ⭐ **Relevance Score**: How well the result matches your query
- 🔧 **Algorithm Used**: Which search method found this result
- 📄 **Source Document**: Original file name and path
- 👁️ **Content Preview**: Quick glimpse of the matching content

#### 🔄 Recent Searches (MRU)

**Never lose your search history.**

- ✅ Recent searches automatically saved
- 🔄 Click any recent search to instantly re-run it
- 🔽 Dropdown appears as you type, showing matching recent searches
- ⚡ Lightning-fast access to your most common queries

---

### 🌐 4. MCP Server

**🌐 Fully Integrated MCP Server - No Separate Setup Required**

**The MCP server is built right in!** No need to install or configure a separate service. The Model Context Protocol server is fully integrated into the application, providing multiple interfaces for seamless AI assistant integration.

#### 🚀 Starting the Server

| Step | Action |
|------|--------|
| 1️⃣ | Navigate to **Server** in the left sidebar |
| 2️⃣ | Enter port number (default: 3000) |
| 3️⃣ | Click **Start Server** |
| 4️⃣ | View server status and connection URLs |

#### 🎛️ Server Features

| Feature | Description |
|---------|-------------|
| 🔄 **Auto-start** | Automatically start server when app launches |
| 🧪 **Self Test** | Test server connection with sample requests |
| 🔧 **Endpoint Testing** | Click **Test** on any endpoint to try it with custom parameters |
| 📝 **Request Logging** | Real-time logs of all server requests and activities |
| 🔗 **Dual Interfaces** | Both REST API and stdio (MCP protocol) support |

#### 🔌 Available Endpoints

The server provides comprehensive REST API endpoints:

| Category | Endpoints |
|----------|-----------|
| 🏥 **Health** | Health checks, server status |
| 🔍 **Search** | Document search, semantic queries |
| 🗄️ **Vector Store** | Document and chunk retrieval, statistics |
| 📥 **Ingestion** | File and directory ingestion |
| 📊 **Analytics** | Statistics, metrics, and insights |

---

## 💡 Tips & Best Practices

### 📏 Chunking Settings Guide

**Choose the right chunk size for your content type.**

| Content Type | Recommended Chunk Size | Why |
|--------------|----------------------|-----|
| 📚 **Long-form documents** | 2,000-3,000 | Preserves context in technical docs |
| 📖 **Technical documentation** | 2,000-3,000 | Maintains code examples and explanations |
| 📰 **Articles & essays** | 2,000-3,000 | Keeps narrative flow intact |
| 📝 **Short documents** | 500-800 | Avoids unnecessary splitting |
| ❓ **FAQ-style content** | 500-800 | Each Q&A stays together |
| 💻 **Code snippets** | 500-800 | Preserves code block integrity |

#### 🔗 Overlap Strategy

| Overlap Percentage | Use Case | Trade-off |
|-------------------|----------|-----------|
| **10-20% of chunk size** | ⭐ **Recommended** | Good context preservation |
| **Higher overlap** | Complex documents | Better context, more storage |
| **Lower overlap** | Simple documents | Less storage, faster processing |

> 💡 **Pro Tip**: Use 10-20% of your chunk size as overlap. For a 1000-character chunk, use 100-200 characters of overlap.

### 🔍 Search Strategies

**Maximize your search effectiveness.**

| Strategy | When to Use | Algorithm |
|----------|-------------|-----------|
| 🎯 **General Search** | Most use cases | **Hybrid** (recommended) |
| 💭 **Conceptual Queries** | Finding ideas, not keywords | **Vector Similarity** |
| 🔤 **Exact Keywords** | Specific terms, names | **BM25** |
| 🧪 **Experiment** | Finding what works best | Try all algorithms |

> 💡 **Pro Tip**: Start with Hybrid algorithm, then experiment with others to see which works best for your specific content.

### 👁️ File Watching

**Keep your knowledge base up-to-date automatically.**

| Scenario | Recommendation |
|----------|----------------|
| 📝 **Frequently updated files** | Enable Watch mode |
| 📚 **Active document collections** | Use directory watching |
| 🔄 **Auto-sync workflows** | Combine recursive + watch |
| 💾 **Static archives** | Disable watching to save resources |

---

## 💾 Data Storage

All application data is stored securely in:

```
~/froggy-rag-mcp/data/
```

### 📦 Storage Contents

| Data Type | Description |
|-----------|-------------|
| 🗄️ **Vector Store** | SQLite database with embeddings |
| ⚙️ **Settings** | User preferences and configuration |
| 🪟 **Window State** | UI layout and splitter positions |
| 👁️ **Watch Configuration** | Monitored files and directories |

---

## 🔧 Troubleshooting

### ❌ Common Issues & Solutions

#### 🚫 Server Won't Start

| Problem | Solution |
|---------|----------|
| Port in use | Try a different port number |
| Permission denied | Check firewall settings |
| Error messages | Review server logs in the UI |

#### 📄 Documents Not Appearing

| Check | Action |
|------|--------|
| ✅ Ingestion status | View Files/Directories for status badges |
| ✅ Error badges | Look for red error indicators |
| ✅ File format | Ensure format is supported |
| ✅ Server logs | Check for processing errors |

#### 🔍 Search Returns No Results

| Issue | Fix |
|------|-----|
| No documents ingested | Verify documents in Vector Store |
| Wrong algorithm | Try different search algorithms |
| Empty vector store | Check Vector Store statistics |
| Query too specific | Broaden your search terms |

#### ⚡ Performance Issues

| Symptom | Solution |
|---------|----------|
| Slow processing | Large files take time - be patient |
| Processing lag | Reduce chunk size |
| High resource usage | Disable file watching if not needed |
| App unresponsive | Close and reopen the application |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Execute search (when search box focused) |
| `Escape` | Close modals and dropdowns |
| `↑↓` Arrow Keys | Navigate MRU dropdown (when visible) |

---

## 🆘 Need More Help?

### 📚 Additional Resources

| Resource | Description |
|----------|-------------|
| 📖 **README.md** | Technical details, API documentation, development info |
| 🐛 **GitHub Issues** | Report bugs, ask questions, request features |
| 💬 **Community** | Connect with other users and developers |

### 🎯 Getting Support

- 🐛 **Found a bug?** Open an issue on the repository
- 💡 **Have a feature request?** Share your ideas
- ❓ **Need help?** Check the README or open a discussion

---

## 🌟 Why Choose Froggy RAG MCP?

### 🎯 The One-Stop Shop Advantage

**Everything integrated. Zero configuration. Maximum simplicity.**

| Feature | Benefit |
|---------|---------|
| 🏪 **One-Stop Shop** | **Ingest, manage, search, and serve** - all in one integrated application |
| ⚡ **Zero Configuration** | No setup, no configuration files, no separate services - just run and enjoy! |
| 🔗 **Fully Integrated** | Document store, vector database, search engine, and MCP server all work together seamlessly |
| 🚫 **No Mess, No Fuss** | No need to manage multiple services, databases, or APIs - it's all handled for you |
| 🔒 **Local & Private** | All data stays on your machine - complete control and privacy |
| ⚡ **Fast & Efficient** | Optimized for performance with everything running in one process |
| 🔌 **Built-in MCP Server** | MCP server integrated directly - no separate installation or configuration |
| 🎨 **Modern UI** | Intuitive, beautiful interface for managing everything |
| 📊 **Complete Solution** | From document ingestion to AI integration - the full RAG pipeline in one app |

### 🎁 What You Get Out of the Box

✅ **Document Ingestion System** - Drag, drop, and process  
✅ **Vector Store Database** - SQLite-based, automatically managed  
✅ **Semantic Search Engine** - Multiple algorithms, ready to use  
✅ **MCP Server** - Fully integrated, no separate setup  
✅ **Beautiful UI** - Modern interface for everything  
✅ **File Watching** - Automatic updates when documents change  
✅ **Statistics & Analytics** - Track your knowledge base  

---

**🚀 Ready to transform your documents into an intelligent knowledge base?**  

**Just run the app, add your documents, and start searching!** No mess, no fuss - everything you need is right here. 🎉
