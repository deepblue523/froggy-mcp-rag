const { EventEmitter } = require('events');
const express = require('express');
const { spawn } = require('child_process');

class MCPService extends EventEmitter {
  constructor(ragService) {
    super();
    this.ragService = ragService;
    this.server = null;
    this.restServer = null;
    this.restPort = null;
    this.logs = [];
    this.maxLogs = 1000;
  }

  log(level, message, data = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    this.emit('log', logEntry);
  }

  async start(port = 3000) {
    if (this.server) {
      throw new Error('MCP server is already running');
    }

    this.restPort = port;
    
    // Start REST server
    this.restServer = express();
    this.restServer.use(express.json());

    // CORS
    this.restServer.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // MCP Tools
    this.setupRESTTools();
    
    // MCP Protocol (JSON-RPC 2.0)
    this.setupMCPProtocol();

    return new Promise((resolve, reject) => {
      this.restServer.listen(port, () => {
        this.log('info', `MCP REST server started on port ${port}`);
        this.log('info', `MCP Protocol endpoint available at http://localhost:${port}/mcp`);
        resolve({ port, status: 'running' });
      });

      this.restServer.on('error', (error) => {
        this.log('error', `MCP REST server error: ${error.message}`);
        reject(error);
      });
    });
  }

  setupRESTTools() {
    // Health check
    this.restServer.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'froggy-rag-mcp' });
    });

    // Search tool
    this.restServer.post('/tools/search', async (req, res) => {
      try {
        const { query, limit = 10, algorithm = 'hybrid' } = req.body;
        if (!query) {
          return res.status(400).json({ error: 'Query is required' });
        }

        this.log('info', 'Search request', { query, limit, algorithm });
        const results = await this.ragService.search(query, limit, algorithm);
        
        res.json({
          results: results.map(r => ({
            chunkId: r.chunkId,
            documentId: r.documentId,
            content: r.content,
            score: r.score,
            similarity: r.similarity, // Keep for backward compatibility
            algorithm: r.algorithm,
            metadata: r.metadata
          }))
        });
      } catch (error) {
        this.log('error', 'Search error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Get documents tool
    this.restServer.get('/tools/documents', (req, res) => {
      try {
        const documents = this.ragService.getDocuments();
        res.json({ documents });
      } catch (error) {
        this.log('error', 'Get documents error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Get document chunks tool
    this.restServer.get('/tools/documents/:documentId/chunks', (req, res) => {
      try {
        const { documentId } = req.params;
        const chunks = this.ragService.getDocumentChunks(documentId);
        res.json({ chunks });
      } catch (error) {
        this.log('error', 'Get chunks error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Get chunk content tool
    this.restServer.get('/tools/chunks/:chunkId', (req, res) => {
      try {
        const { chunkId } = req.params;
        const chunk = this.ragService.getChunkContent(chunkId);
        if (!chunk) {
          return res.status(404).json({ error: 'Chunk not found' });
        }
        res.json({ chunk });
      } catch (error) {
        this.log('error', 'Get chunk error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Vector store stats tool
    this.restServer.get('/tools/stats', (req, res) => {
      try {
        const stats = this.ragService.getVectorStoreStats();
        res.json({ stats });
      } catch (error) {
        this.log('error', 'Get stats error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Ingest file tool
    this.restServer.post('/tools/ingest/file', async (req, res) => {
      try {
        const { filePath, watch = false } = req.body;
        if (!filePath) {
          return res.status(400).json({ error: 'filePath is required' });
        }

        this.log('info', 'Ingest file request', { filePath, watch });
        const result = await this.ragService.ingestFile(filePath, watch);
        res.json(result);
      } catch (error) {
        this.log('error', 'Ingest file error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Ingest directory tool
    this.restServer.post('/tools/ingest/directory', async (req, res) => {
      try {
        const { dirPath, recursive = false, watch = false } = req.body;
        if (!dirPath) {
          return res.status(400).json({ error: 'dirPath is required' });
        }

        this.log('info', 'Ingest directory request', { dirPath, recursive, watch });
        const result = await this.ragService.ingestDirectory(dirPath, recursive, watch);
        res.json(result);
      } catch (error) {
        this.log('error', 'Ingest directory error', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });
  }

  setupMCPProtocol() {
    // MCP Protocol endpoint (JSON-RPC 2.0)
    this.restServer.post('/mcp', async (req, res) => {
      try {
        const request = req.body;
        
        // Validate JSON-RPC 2.0 request
        if (!request.jsonrpc || request.jsonrpc !== '2.0') {
          return res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid Request',
              data: 'jsonrpc must be "2.0"'
            },
            id: request.id || null
          });
        }

        const { method, params, id } = request;
        
        this.log('info', 'MCP Protocol request', { method, id });

        let result = null;
        let error = null;

        try {
          switch (method) {
            case 'initialize':
              result = {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: {},
                  resources: {}
                },
                serverInfo: {
                  name: 'froggy-rag-mcp',
                  version: '1.0.0'
                }
              };
              break;

            case 'tools/list':
              result = {
                tools: [
                  {
                    name: 'search',
                    description: 'Search the vector store for similar content',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        query: { type: 'string', description: 'Search query' },
                        limit: { type: 'number', description: 'Maximum number of results', default: 10 },
                        algorithm: { 
                          type: 'string', 
                          description: 'Search algorithm: hybrid, bm25, tfidf, or vector',
                          enum: ['hybrid', 'bm25', 'tfidf', 'vector'],
                          default: 'hybrid'
                        }
                      },
                      required: ['query']
                    }
                  },
                  {
                    name: 'get_documents',
                    description: 'Get all documents in the vector store',
                    inputSchema: {
                      type: 'object',
                      properties: {}
                    }
                  },
                  {
                    name: 'get_document_chunks',
                    description: 'Get chunks for a specific document',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        documentId: { type: 'string', description: 'Document ID' }
                      },
                      required: ['documentId']
                    }
                  },
                  {
                    name: 'get_chunk',
                    description: 'Get chunk content by ID',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        chunkId: { type: 'string', description: 'Chunk ID' }
                      },
                      required: ['chunkId']
                    }
                  },
                  {
                    name: 'get_stats',
                    description: 'Get vector store statistics',
                    inputSchema: {
                      type: 'object',
                      properties: {}
                    }
                  },
                  {
                    name: 'ingest_file',
                    description: 'Ingest a file into the vector store',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        filePath: { type: 'string', description: 'Path to the file' },
                        watch: { type: 'boolean', description: 'Watch for file changes', default: false }
                      },
                      required: ['filePath']
                    }
                  },
                  {
                    name: 'ingest_directory',
                    description: 'Ingest a directory into the vector store',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        dirPath: { type: 'string', description: 'Path to the directory' },
                        recursive: { type: 'boolean', description: 'Recursively scan subdirectories', default: false },
                        watch: { type: 'boolean', description: 'Watch for file changes', default: false }
                      },
                      required: ['dirPath']
                    }
                  }
                ]
              };
              break;

            case 'tools/call':
              if (!params || !params.name) {
                error = {
                  code: -32602,
                  message: 'Invalid params',
                  data: 'Tool name is required'
                };
                break;
              }

              const toolName = params.name;
              const toolParams = params.arguments || {};

              switch (toolName) {
                case 'search':
                  if (!toolParams.query) {
                    error = { code: -32602, message: 'Invalid params', data: 'query is required' };
                    break;
                  }
                  const searchResults = await this.ragService.search(
                    toolParams.query, 
                    toolParams.limit || 10,
                    toolParams.algorithm || 'hybrid'
                  );
                  result = {
                    content: searchResults.map(r => ({
                      type: 'text',
                      text: JSON.stringify({
                        chunkId: r.chunkId,
                        documentId: r.documentId,
                        content: r.content,
                        score: r.score,
                        similarity: r.similarity, // Keep for backward compatibility
                        algorithm: r.algorithm,
                        metadata: r.metadata
                      }, null, 2)
                    }))
                  };
                  break;

                case 'get_documents':
                  const documents = this.ragService.getDocuments();
                  result = {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({ documents }, null, 2)
                    }]
                  };
                  break;

                case 'get_document_chunks':
                  if (!toolParams.documentId) {
                    error = { code: -32602, message: 'Invalid params', data: 'documentId is required' };
                    break;
                  }
                  const chunks = this.ragService.getDocumentChunks(toolParams.documentId);
                  result = {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({ chunks }, null, 2)
                    }]
                  };
                  break;

                case 'get_chunk':
                  if (!toolParams.chunkId) {
                    error = { code: -32602, message: 'Invalid params', data: 'chunkId is required' };
                    break;
                  }
                  const chunk = this.ragService.getChunkContent(toolParams.chunkId);
                  if (!chunk) {
                    error = { code: -404, message: 'Not Found', data: 'Chunk not found' };
                    break;
                  }
                  result = {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({ chunk }, null, 2)
                    }]
                  };
                  break;

                case 'get_stats':
                  const stats = this.ragService.getVectorStoreStats();
                  result = {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({ stats }, null, 2)
                    }]
                  };
                  break;

                case 'ingest_file':
                  if (!toolParams.filePath) {
                    error = { code: -32602, message: 'Invalid params', data: 'filePath is required' };
                    break;
                  }
                  const ingestFileResult = await this.ragService.ingestFile(toolParams.filePath, toolParams.watch || false);
                  result = {
                    content: [{
                      type: 'text',
                      text: JSON.stringify(ingestFileResult, null, 2)
                    }]
                  };
                  break;

                case 'ingest_directory':
                  if (!toolParams.dirPath) {
                    error = { code: -32602, message: 'Invalid params', data: 'dirPath is required' };
                    break;
                  }
                  const ingestDirResult = await this.ragService.ingestDirectory(
                    toolParams.dirPath,
                    toolParams.recursive || false,
                    toolParams.watch || false
                  );
                  result = {
                    content: [{
                      type: 'text',
                      text: JSON.stringify(ingestDirResult, null, 2)
                    }]
                  };
                  break;

                default:
                  error = {
                    code: -32601,
                    message: 'Method not found',
                    data: `Unknown tool: ${toolName}`
                  };
              }
              break;

            default:
              error = {
                code: -32601,
                message: 'Method not found',
                data: `Unknown method: ${method}`
              };
          }
        } catch (err) {
          this.log('error', 'MCP Protocol error', { method, error: err.message });
          error = {
            code: -32000,
            message: 'Server error',
            data: err.message
          };
        }

        const response = {
          jsonrpc: '2.0',
          id: id || null
        };

        if (error) {
          response.error = error;
        } else {
          response.result = result;
        }

        res.json(response);
      } catch (error) {
        this.log('error', 'MCP Protocol request error', { error: error.message });
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Server error',
            data: error.message
          },
          id: null
        });
      }
    });
  }

  stop() {
    if (this.restServer) {
      return new Promise((resolve) => {
        this.restServer.close(() => {
          this.log('info', 'MCP REST server stopped');
          this.restServer = null;
          this.restPort = null;
          resolve({ status: 'stopped' });
        });
      });
    }
    return Promise.resolve({ status: 'stopped' });
  }

  getStatus() {
    const baseUrl = this.restPort ? `http://localhost:${this.restPort}` : null;
    return {
      running: this.restServer !== null,
      port: this.restPort,
      restUrl: baseUrl,
      mcpUrl: baseUrl ? `${baseUrl}/mcp` : null,
      logsCount: this.logs.length
    };
  }

  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }
}

module.exports = { MCPService };


