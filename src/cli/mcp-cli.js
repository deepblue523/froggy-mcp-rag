#!/usr/bin/env node

/**
 * MCP CLI - Command-line interface for MCP server
 * Supports two modes:
 * 1. Stdio mode: MCP clients spawn as subprocess (default when no args)
 * 2. CLI tool mode: Direct command execution from terminal
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

// Initialize data directory (same as main app)
const dataDir = path.join(os.homedir(), 'froggy-rag-mcp', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize services
const { RAGService } = require('../main/services/rag-service');
const { MCPService } = require('../main/services/mcp-service');

async function main() {
  const args = process.argv.slice(2);
  
  // If no arguments, run in stdio mode (for MCP clients)
  if (args.length === 0) {
    await runStdioMode();
    return;
  }

  // Otherwise, run in CLI tool mode
  await runCLIToolMode(args);
}

async function runStdioMode() {
  try {
    // Initialize services
    const ragService = new RAGService(dataDir);
    const mcpService = new MCPService(ragService);
    
    // Start stdio transport
    await mcpService.startStdio();
    
    // Keep process alive - stdio mode runs until stdin closes
    process.stdin.on('end', () => {
      process.exit(0);
    });
    
    process.stdin.on('error', (error) => {
      console.error('Stdin error:', error);
      process.exit(1);
    });
  } catch (error) {
    console.error('Error starting stdio mode:', error);
    process.exit(1);
  }
}

async function runCLIToolMode(args) {
  try {
    // Initialize services
    const ragService = new RAGService(dataDir);
    const mcpService = new MCPService(ragService);
    
    const command = args[0];
    
    switch (command) {
      case 'tools':
        if (args[1] === 'list') {
          await listTools(mcpService);
        } else {
          console.error('Unknown tools command. Use: tools list');
          process.exit(1);
        }
        break;
        
      case 'call':
        if (args.length < 2) {
          console.error('Usage: call <tool-name> [--arg key=value] ...');
          process.exit(1);
        }
        await callTool(mcpService, args.slice(1));
        break;
        
      case 'search':
        if (args.length < 2) {
          console.error('Usage: search <query> [--limit N] [--algorithm hybrid|bm25|tfidf|vector]');
          process.exit(1);
        }
        await callSearchTool(mcpService, args.slice(1));
        break;
        
      case 'stats':
        await callStatsTool(mcpService);
        break;
        
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;
        
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Use --help for usage information');
        process.exit(1);
    }
    
    // Clean up and exit
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

async function listTools(mcpService) {
  const tools = await mcpService.listTools();
  console.log(JSON.stringify({ tools }, null, 2));
}

async function callTool(mcpService, args) {
  const toolName = args[0];
  const params = {};
  
  // Parse arguments in format: --arg key=value or --key value
  for (let i = 1; i < args.length; i++) {
    let key, value;
    
    if (args[i].startsWith('--')) {
      const arg = args[i].substring(2);
      if (arg.includes('=')) {
        [key, value] = arg.split('=', 2);
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        key = arg;
        value = args[++i];
      } else {
        // Boolean flag
        key = arg;
        value = true;
      }
      
      // Parse value types
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(value) && value !== '') value = Number(value);
      
      params[key] = value;
    }
  }
  
  const result = await mcpService.callTool(toolName, params);
  console.log(JSON.stringify(result, null, 2));
}

async function callSearchTool(mcpService, args) {
  const query = args[0];
  const params = { query };
  
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--limit' && i + 1 < args.length) {
      params.limit = parseInt(args[++i], 10);
    } else if (args[i] === '--algorithm' && i + 1 < args.length) {
      params.algorithm = args[++i];
    }
  }
  
  const result = await mcpService.callTool('search', params);
  console.log(JSON.stringify(result, null, 2));
}

async function callStatsTool(mcpService) {
  const result = await mcpService.callTool('get_stats', {});
  console.log(JSON.stringify(result, null, 2));
}

function printHelp() {
  console.log(`
MCP CLI - Command-line interface for MCP server

Usage:
  node src/cli/mcp-cli.js                    # Run in stdio mode (for MCP clients)
  node src/cli/mcp-cli.js <command>       # Run CLI tool mode

Commands:
  tools list                                  # List all available tools
  call <tool-name> [--arg key=value] ...     # Call a tool with parameters
  search <query> [--limit N] [--algorithm]   # Search the vector store
  stats                                       # Get vector store statistics
  help                                        # Show this help message

Examples:
  # List all tools
  node src/cli/mcp-cli.js tools list

  # Call search tool
  node src/cli/mcp-cli.js call search --query "example query" --limit 5

  # Search directly
  node src/cli/mcp-cli.js search "example query" --limit 10

  # Get statistics
  node src/cli/mcp-cli.js stats

  # Ingest a file
  node src/cli/mcp-cli.js call ingest_file --filePath "/path/to/file.pdf"

Modes:
  - Stdio mode (no args): MCP clients spawn as subprocess, communicate via stdin/stdout
  - CLI tool mode (with args): Direct command execution from terminal
`);
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

