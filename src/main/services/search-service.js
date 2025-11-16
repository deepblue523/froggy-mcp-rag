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
   * Main search method - uses hybrid by default
   */
  async search(query, queryEmbedding, chunks, limit = 10, algorithm = 'hybrid') {
    switch (algorithm.toLowerCase()) {
      case 'bm25':
        return this.searchBM25(query, chunks, limit);
      case 'tfidf':
      case 'tf-idf':
        return this.searchTFIDF(query, chunks, limit);
      case 'vector':
        return this.searchVector(queryEmbedding, chunks, limit);
      case 'hybrid':
      default:
        return this.searchHybrid(query, queryEmbedding, chunks, limit);
    }
  }
}

module.exports = { SearchService };

