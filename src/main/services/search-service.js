const { VectorStore } = require('./vector-store');
const natural = require('natural');

class SearchService {
  constructor(vectorStore) {
    this.vectorStore = vectorStore;
    // BM25 parameters
    this.k1 = 1.5; // Term frequency saturation parameter
    this.b = 0.75; // Length normalization parameter
    // Initialize tokenizer from natural library
    // WordTokenizer handles punctuation, acronyms, and various text patterns properly
    this.tokenizer = new natural.WordTokenizer();
  }

  /**
   * Tokenize text into words using natural library's WordTokenizer
   * This properly handles acronyms, punctuation, and various text patterns
   */
  tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    
    // Normalize Unicode whitespace characters first
    let normalized = text.replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');
    
    // Use natural's tokenizer to split into words
    // It handles punctuation, contractions, acronyms, etc. intelligently
    const tokens = this.tokenizer.tokenize(normalized) || [];
    
    // Lowercase and filter out empty strings
    return tokens
      .map(token => token.toLowerCase())
      .filter(word => word.length > 0);
  }

  /**
   * Calculate BM25 score for a document chunk
   */
  calculateBM25Score(queryTerms, chunkContent, avgDocLength, totalDocs, docFreqs) {
    const chunkTerms = this.tokenize(chunkContent);
    const chunkLength = chunkTerms.length;
    const termFreqs = {};
    
    // Count term frequencies in chunk
    chunkTerms.forEach(term => {
      termFreqs[term] = (termFreqs[term] || 0) + 1;
    });

    let score = 0;
    const uniqueQueryTerms = [...new Set(queryTerms)];

    uniqueQueryTerms.forEach(term => {
      const tf = termFreqs[term] || 0;
      const df = docFreqs[term] || 0;
      
      if (df === 0) return; // Term not in any document
      
      // Inverse document frequency (IDF)
      const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5));
      
      // BM25 formula
      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + this.b * (chunkLength / avgDocLength));
      
      score += idf * (numerator / denominator);
    });

    return score;
  }

  /**
   * Calculate TF-IDF score for a document chunk
   */
  calculateTFIDFScore(queryTerms, chunkContent, totalDocs, docFreqs) {
    const chunkTerms = this.tokenize(chunkContent);
    const termFreqs = {};
    
    // Count term frequencies in chunk
    chunkTerms.forEach(term => {
      termFreqs[term] = (termFreqs[term] || 0) + 1;
    });

    let score = 0;
    const uniqueQueryTerms = [...new Set(queryTerms)];

    uniqueQueryTerms.forEach(term => {
      const tf = termFreqs[term] || 0;
      const df = docFreqs[term] || 0;
      
      if (df === 0 || tf === 0) return;
      
      // Term frequency (normalized)
      const normalizedTF = tf / chunkTerms.length;
      
      // Inverse document frequency
      const idf = Math.log(totalDocs / df);
      
      score += normalizedTF * idf;
    });

    return score;
  }

  /**
   * Calculate cosine similarity for vector search
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
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

  /**
   * Build document frequency index for all chunks
   */
  buildDocumentFrequencyIndex(chunks) {
    const docFreqs = {};
    const chunkLengths = [];
    
    chunks.forEach(chunk => {
      const terms = this.tokenize(chunk.content);
      chunkLengths.push(terms.length);
      
      const uniqueTerms = new Set(terms);
      uniqueTerms.forEach(term => {
        docFreqs[term] = (docFreqs[term] || 0) + 1;
      });
    });
    
    const avgDocLength = chunkLengths.length > 0
      ? chunkLengths.reduce((a, b) => a + b, 0) / chunkLengths.length
      : 0;
    
    return { docFreqs, avgDocLength, totalDocs: chunks.length };
  }

  /**
   * Search using BM25 algorithm
   */
  searchBM25(query, chunks, limit = 10) {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];
    
    const { docFreqs, avgDocLength, totalDocs } = this.buildDocumentFrequencyIndex(chunks);
    
    const results = chunks.map(chunk => {
      const score = this.calculateBM25Score(queryTerms, chunk.content, avgDocLength, totalDocs, docFreqs);
      return {
        ...chunk,
        score,
        algorithm: 'BM25'
      };
    });
    
    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Search using TF-IDF algorithm
   */
  searchTFIDF(query, chunks, limit = 10) {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];
    
    const { docFreqs, totalDocs } = this.buildDocumentFrequencyIndex(chunks);
    
    const results = chunks.map(chunk => {
      const score = this.calculateTFIDFScore(queryTerms, chunk.content, totalDocs, docFreqs);
      return {
        ...chunk,
        score,
        algorithm: 'TF-IDF'
      };
    });
    
    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Search using vector similarity (existing method)
   */
  searchVector(queryEmbedding, chunks, limit = 10) {
    const results = chunks
      .filter(chunk => chunk.embedding && chunk.embedding.length > 0)
      .map(chunk => {
        const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
        return {
          ...chunk,
          score: similarity,
          algorithm: 'Vector'
        };
      });
    
    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Hybrid search combining BM25 and Vector search
   */
  searchHybrid(query, queryEmbedding, chunks, limit = 10, bm25Weight = 0.5, vectorWeight = 0.5) {
    // Get BM25 results
    const bm25Results = this.searchBM25(query, chunks, limit * 2);
    const bm25Map = new Map();
    bm25Results.forEach(r => {
      bm25Map.set(r.id, r.score);
    });
    
    // Get vector results
    const vectorResults = this.searchVector(queryEmbedding, chunks, limit * 2);
    const vectorMap = new Map();
    vectorResults.forEach(r => {
      vectorMap.set(r.id, r.score);
    });
    
    // Normalize scores to 0-1 range
    const normalizeScores = (results) => {
      if (results.length === 0) return new Map();
      const maxScore = Math.max(...results.map(r => r.score));
      const minScore = Math.min(...results.map(r => r.score));
      const range = maxScore - minScore || 1;
      
      const normalized = new Map();
      results.forEach(r => {
        normalized.set(r.id, (r.score - minScore) / range);
      });
      return normalized;
    };
    
    const normalizedBM25 = normalizeScores(bm25Results);
    const normalizedVector = normalizeScores(vectorResults);
    
    // Combine scores
    const combinedScores = new Map();
    const allChunkIds = new Set([...bm25Map.keys(), ...vectorMap.keys()]);
    
    allChunkIds.forEach(chunkId => {
      const bm25Score = normalizedBM25.get(chunkId) || 0;
      const vectorScore = normalizedVector.get(chunkId) || 0;
      const combinedScore = (bm25Score * bm25Weight) + (vectorScore * vectorWeight);
      combinedScores.set(chunkId, combinedScore);
    });
    
    // Get chunks and combine
    const chunkMap = new Map(chunks.map(c => [c.id, c]));
    const hybridResults = Array.from(combinedScores.entries())
      .map(([chunkId, score]) => {
        const chunk = chunkMap.get(chunkId);
        if (!chunk) return null;
        return {
          ...chunk,
          score,
          algorithm: 'Hybrid',
          bm25Score: normalizedBM25.get(chunkId) || 0,
          vectorScore: normalizedVector.get(chunkId) || 0
        };
      })
      .filter(r => r !== null && r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    return hybridResults;
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   */
  estimateTokenCount(text) {
    if (!text || typeof text !== 'string') return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate time decay factor for a chunk based on its creation timestamp
   * Uses exponential decay: decay_factor = 2^(-age_days / half_life_days)
   * @param {number} chunkCreatedAt - Timestamp when chunk was created (milliseconds)
   * @param {number} halfLifeDays - Number of days for half-life
   * @returns {number} Decay factor between 0 and 1
   */
  calculateTimeDecay(chunkCreatedAt, halfLifeDays) {
    if (!chunkCreatedAt || !halfLifeDays || halfLifeDays <= 0) {
      return 1.0; // No decay if invalid parameters
    }
    
    const now = Date.now();
    const ageMs = now - chunkCreatedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    
    // Exponential decay: 2^(-age/half_life)
    // This means after half_life days, the factor is 0.5
    // After 2*half_life days, the factor is 0.25, etc.
    const decayFactor = Math.pow(2, -ageDays / halfLifeDays);
    
    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, decayFactor));
  }

  /**
   * Apply time range filtering to chunks
   * Filters out chunks from documents that haven't been updated within the specified days
   * @param {Array} chunks - Array of chunks with document_id
   * @param {number} sinceDays - Number of days to look back (0 = no filter)
   * @param {Map} documentMap - Map of document_id -> document (with updated_at)
   * @returns {Array} Filtered chunks
   */
  applyTimeRangeFilter(chunks, sinceDays, documentMap) {
    if (!sinceDays || sinceDays <= 0) {
      return chunks; // No filtering if sinceDays is 0 or invalid
    }
    
    const cutoffTime = Date.now() - (sinceDays * 24 * 60 * 60 * 1000);
    
    return chunks.filter(chunk => {
      const doc = documentMap.get(chunk.document_id);
      if (!doc || !doc.updated_at) {
        return true; // Keep chunks if we can't determine document age
      }
      
      // Keep chunks from documents updated within the time range
      return doc.updated_at >= cutoffTime;
    });
  }

  /**
   * Apply time decay to search results
   * Multiplies similarity scores by time decay factor
   * @param {Array} results - Search results with chunks
   * @param {boolean} enabled - Whether time decay is enabled
   * @param {number} halfLifeDays - Half-life in days
   * @returns {Array} Results with decayed scores
   */
  applyTimeDecay(results, enabled, halfLifeDays) {
    if (!enabled || !halfLifeDays || halfLifeDays <= 0) {
      return results; // No decay if disabled or invalid
    }
    
    return results.map(result => {
      // Use chunk's created_at if available, otherwise use current time
      const chunkCreatedAt = result.created_at || Date.now();
      const decayFactor = this.calculateTimeDecay(chunkCreatedAt, halfLifeDays);
      
      return {
        ...result,
        score: result.score * decayFactor,
        originalScore: result.score, // Keep original for reference
        decayFactor: decayFactor
      };
    });
  }

  /**
   * Apply retrieval settings to search results
   */
  applyRetrievalSettings(results, settings = {}) {
    let filtered = [...results];
    
    // Apply score threshold
    if (settings.scoreThreshold && settings.scoreThreshold > 0) {
      filtered = filtered.filter(r => r.score >= settings.scoreThreshold);
    }
    
    // Apply max chunks per document
    if (settings.maxChunksPerDoc && settings.maxChunksPerDoc > 0) {
      const docChunkCounts = new Map();
      filtered = filtered.filter(r => {
        const docId = r.document_id;
        const count = docChunkCounts.get(docId) || 0;
        if (count < settings.maxChunksPerDoc) {
          docChunkCounts.set(docId, count + 1);
          return true;
        }
        return false;
      });
    }
    
    // Apply max context tokens (cap top_k dynamically)
    if (settings.maxContextTokens && settings.maxContextTokens > 0) {
      let totalTokens = 0;
      filtered = filtered.filter(r => {
        const chunkTokens = this.estimateTokenCount(r.content);
        if (totalTokens + chunkTokens <= settings.maxContextTokens) {
          totalTokens += chunkTokens;
          return true;
        }
        return false;
      });
    }
    
    // Group by document if enabled
    if (settings.groupByDoc) {
      const docGroups = new Map();
      filtered.forEach(r => {
        const docId = r.document_id;
        if (!docGroups.has(docId)) {
          docGroups.set(docId, []);
        }
        docGroups.get(docId).push(r);
      });
      
      // Return grouped results (one entry per document with all its chunks)
      filtered = Array.from(docGroups.entries()).map(([docId, chunks]) => {
        const firstChunk = chunks[0];
        return {
          id: firstChunk.id, // Keep first chunk ID for compatibility
          document_id: docId,
          content: firstChunk.content, // Keep first chunk content for compatibility
          chunks: chunks,
          score: Math.max(...chunks.map(c => c.score)), // Use max score for document
          algorithm: chunks[0]?.algorithm || 'Unknown',
          metadata: firstChunk.metadata || {}
        };
      });
    }
    
    // Return full documents if enabled (requires access to document store)
    // This is handled at the RAG service level since we need document info
    
    return filtered;
  }

  /**
   * Main search method - uses hybrid by default
   */
  async search(query, queryEmbedding, chunks, limit = 10, algorithm = 'hybrid', retrievalSettings = {}, metadataSettings = {}, documentMap = null) {
    let filteredChunks = chunks;
    
    // Apply time range filtering before search (if documentMap is provided)
    if (metadataSettings.sinceDays && documentMap) {
      filteredChunks = this.applyTimeRangeFilter(chunks, metadataSettings.sinceDays, documentMap);
    }
    
    // Perform search on filtered chunks
    let results;
    switch (algorithm.toLowerCase()) {
      case 'bm25':
        results = this.searchBM25(query, filteredChunks, limit);
        break;
      case 'tfidf':
      case 'tf-idf':
        results = this.searchTFIDF(query, filteredChunks, limit);
        break;
      case 'vector':
        results = this.searchVector(queryEmbedding, filteredChunks, limit);
        break;
      case 'hybrid':
      default:
        results = this.searchHybrid(query, queryEmbedding, filteredChunks, limit);
        break;
    }
    
    // Apply time decay to results (multiplies scores by decay factor)
    if (metadataSettings.timeDecayEnabled && metadataSettings.timeDecayHalfLifeDays) {
      results = this.applyTimeDecay(results, metadataSettings.timeDecayEnabled, metadataSettings.timeDecayHalfLifeDays);
      // Re-sort after applying decay (scores may have changed)
      results = results.sort((a, b) => b.score - a.score);
    }
    
    // Apply retrieval settings (score threshold, max chunks per doc, etc.)
    if (Object.keys(retrievalSettings).length > 0) {
      results = this.applyRetrievalSettings(results, retrievalSettings);
    }
    
    return results;
  }
}

module.exports = { SearchService };

