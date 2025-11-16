const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class VectorStore {
  constructor(dataDir) {
    this.dbPath = path.join(dataDir, 'vector_store.db');
    this.db = new Database(this.dbPath);
    this.initDatabase();
  }

  initDatabase() {
    // Documents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size INTEGER,
        ingested_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
      )
    `);

    // Chunks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding BLOB,
        chunk_index INTEGER NOT NULL,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
      CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
      CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);
    `);
  }

  addDocument(document) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents 
      (id, file_path, file_name, file_type, file_size, ingested_at, updated_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const now = Date.now();
    stmt.run(
      document.id,
      document.filePath,
      document.fileName,
      document.fileType,
      document.fileSize,
      document.ingestedAt || now,
      now,
      document.status || 'pending'
    );
  }

  updateDocumentStatus(documentId, status) {
    const stmt = this.db.prepare(`
      UPDATE documents SET status = ?, updated_at = ? WHERE id = ?
    `);
    stmt.run(status, Date.now(), documentId);
  }

  addChunks(chunks) {
    const stmt = this.db.prepare(`
      INSERT INTO chunks 
      (id, document_id, content, embedding, chunk_index, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((chunks) => {
      for (const chunk of chunks) {
        stmt.run(
          chunk.id,
          chunk.documentId,
          chunk.content,
          chunk.embedding ? Buffer.from(chunk.embedding) : null,
          chunk.chunkIndex,
          chunk.metadata ? JSON.stringify(chunk.metadata) : null,
          chunk.createdAt || Date.now()
        );
      }
    });

    insertMany(chunks);
  }

  deleteDocumentChunks(documentId) {
    const stmt = this.db.prepare('DELETE FROM chunks WHERE document_id = ?');
    stmt.run(documentId);
  }

  getDocuments() {
    const stmt = this.db.prepare('SELECT * FROM documents ORDER BY ingested_at DESC');
    return stmt.all();
  }

  getDocument(documentId) {
    const stmt = this.db.prepare('SELECT * FROM documents WHERE id = ?');
    return stmt.get(documentId);
  }

  getDocumentByFilePath(filePath) {
    const normalizedPath = path.resolve(filePath);
    // Query all documents and find by normalized path comparison
    // since file_path might be stored in different formats
    const stmt = this.db.prepare('SELECT * FROM documents');
    const docs = stmt.all();
    return docs.find(doc => path.resolve(doc.file_path) === normalizedPath);
  }

  getDocumentChunks(documentId) {
    const stmt = this.db.prepare(`
      SELECT * FROM chunks 
      WHERE document_id = ? 
      ORDER BY chunk_index ASC
    `);
    const chunks = stmt.all(documentId);
    return chunks.map(chunk => ({
      ...chunk,
      embedding: chunk.embedding ? Array.from(chunk.embedding) : null,
      metadata: chunk.metadata ? JSON.parse(chunk.metadata) : null
    }));
  }

  getChunk(chunkId) {
    const stmt = this.db.prepare('SELECT * FROM chunks WHERE id = ?');
    const chunk = stmt.get(chunkId);
    if (chunk) {
      return {
        ...chunk,
        embedding: chunk.embedding ? Array.from(chunk.embedding) : null,
        metadata: chunk.metadata ? JSON.parse(chunk.metadata) : null
      };
    }
    return null;
  }

  getAllChunks() {
    const stmt = this.db.prepare('SELECT * FROM chunks');
    const chunks = stmt.all();
    return chunks.map(chunk => ({
      ...chunk,
      embedding: chunk.embedding ? Array.from(chunk.embedding) : null,
      metadata: chunk.metadata ? JSON.parse(chunk.metadata) : null
    }));
  }

  searchSimilarChunks(queryEmbedding, limit = 10) {
    // Simple cosine similarity search
    // For production, consider using a proper vector similarity library
    const chunks = this.db.prepare('SELECT * FROM chunks WHERE embedding IS NOT NULL').all();
    
    const results = chunks.map(chunk => {
      const chunkEmbedding = Array.from(chunk.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
      return {
        ...chunk,
        similarity,
        embedding: chunkEmbedding,
        metadata: chunk.metadata ? JSON.parse(chunk.metadata) : null
      };
    });

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  getStats() {
    const docCount = this.db.prepare('SELECT COUNT(*) as count FROM documents').get();
    const chunkCount = this.db.prepare('SELECT COUNT(*) as count FROM chunks').get();
    const totalSize = this.db.prepare('SELECT SUM(file_size) as total FROM documents').get();
    
    return {
      documentCount: docCount.count,
      chunkCount: chunkCount.count,
      totalSize: totalSize.total || 0
    };
  }

  deleteDocument(documentId) {
    const deleteChunks = this.db.prepare('DELETE FROM chunks WHERE document_id = ?');
    const deleteDoc = this.db.prepare('DELETE FROM documents WHERE id = ?');
    
    this.db.transaction(() => {
      deleteChunks.run(documentId);
      deleteDoc.run(documentId);
    })();
  }

  clearStore() {
    // Delete all chunks first (due to foreign key constraint)
    const deleteAllChunks = this.db.prepare('DELETE FROM chunks');
    const deleteAllDocs = this.db.prepare('DELETE FROM documents');
    
    this.db.transaction(() => {
      deleteAllChunks.run();
      deleteAllDocs.run();
    })();
  }

  close() {
    this.db.close();
  }
}

module.exports = { VectorStore };


