# Memory Optimizations for Vector Store Search

## Problem
The application was experiencing out-of-memory errors when searching against the vector store with large datasets (3100+ documents, tens of thousands of chunks). The main issues were:

1. **Loading all chunks into memory**: `getAllChunks()` was loading all chunks with embeddings at once
2. **Inefficient vector search**: `searchSimilarChunks()` loaded all chunks before processing
3. **No batching**: Search algorithms processed all chunks in a single pass
4. **Unnecessary embedding loading**: Text-based searches (BM25, TF-IDF) were loading embeddings they didn't need
5. **No streaming**: Even with batching, all chunks were loaded into memory first

## Solutions Implemented

### 1. Streaming Database Queries (NEW - Major Improvement)
- **Automatic streaming for large datasets**: When chunk count > 5000, search automatically uses streaming
- **`getChunksBatched()`**: Streams chunks directly from database in batches
- **`searchBM25FromDB()`**: Builds document frequency index and searches by streaming from database
- **`searchVectorFromDB()`**: Processes vector similarity by streaming chunks from database
- **`searchHybridFromDB()`**: Combines BM25 and vector search using streaming

### 2. Batch Processing in Vector Store
- **`searchSimilarChunks()`**: Now processes chunks in batches of 500, maintaining only the top N results in memory
- **`getAllChunksBatched()`**: Method for streaming chunks in batches
- **`getAllChunksWithoutEmbeddings()`**: Method that skips embedding conversion for text-based searches
- **`getChunksCount()`**: Quick count check to decide if streaming should be used

### 3. Lazy Embedding Loading
- **RAG Service**: Only loads embeddings when needed (vector/hybrid search)
- **Text-based searches** (BM25, TF-IDF) now use `getAllChunksWithoutEmbeddings()` to save memory
- **Streaming mode**: Embeddings only loaded in batches as needed

### 4. Batch Processing in Search Service
- **`searchBM25()`**: Processes chunks in batches of 1000, maintaining top results
- **`searchTFIDF()`**: Processes chunks in batches of 1000, maintaining top results  
- **`searchVector()`**: Processes chunks in batches of 500, maintaining top results
- **`buildDocumentFrequencyIndex()`**: Processes chunks in batches of 1000 to avoid memory spikes
- **`buildDocumentFrequencyIndexFromDB()`**: Builds index by streaming from database

### 5. Increased Node.js Heap Size
- Added `NODE_OPTIONS=--max-old-space-size=8192` to dev script (8GB heap)
- Added `cross-env` package for cross-platform environment variable support

## Memory Impact

### Before:
- Loading all chunks: ~3-4GB for 3000+ documents with embeddings
- Processing all at once: Additional 1-2GB during search
- **Total: 4-6GB+ (causing OOM)**

### After (Small Datasets < 5000 chunks):
- Text-based search: Only loads chunk content (~100-200MB)
- Vector search: Processes in batches, maintains only top results (~500MB-1GB peak)
- **Total: 500MB-1.5GB**

### After (Large Datasets > 5000 chunks - Streaming):
- **Text-based search**: Streams from database, never loads all chunks (~50-100MB peak)
- **Vector search**: Streams in batches of 500, maintains only top results (~200-500MB peak)
- **Hybrid search**: Streams both BM25 and vector, combines results (~300-600MB peak)
- **Total: 50MB-600MB (dramatically reduced)**

## Usage

The optimizations are automatic and transparent. The system automatically detects large datasets (>5000 chunks) and uses streaming.

### For Development:
```bash
npm run dev  # Now includes increased heap size
```

### For Production:
Consider setting `NODE_OPTIONS=--max-old-space-size=8192` in your environment or build process.

## How It Works

1. **Chunk Count Check**: Before search, system checks total chunk count
2. **Automatic Mode Selection**: 
   - < 5000 chunks: Uses in-memory processing (faster for small datasets)
   - > 5000 chunks: Uses streaming from database (memory efficient)
3. **Streaming Process**:
   - Document frequency index built by streaming chunks
   - Search processes chunks in batches (500-1000 at a time)
   - Only top N results kept in memory
   - Final results loaded only when needed

## Future Improvements

1. **SQLite-based vector similarity**: Use SQLite extensions for vector operations (e.g., sqlite-vss)
2. **Indexed vector search**: Implement approximate nearest neighbor (ANN) search
3. **Progressive result streaming**: Return results as they're found instead of all at once
4. **Embedding caching**: Cache frequently used embeddings in memory
5. **Configurable threshold**: Allow users to set streaming threshold

