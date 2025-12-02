// Cloudflare Workers AI MCP Server Implementation
// Based on cloudflare/mcp-server-cloudflare patterns

const BASE_URL = 'https://api.llm.dflow.org';

// API client function (uses Cloudflare Workers fetch)
async function apiRequest(method, path, params) {
  const url = new URL(path, BASE_URL);
  if (params && method === 'GET') {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: method === 'POST' && params ? JSON.stringify(params) : undefined,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.json();
}

// Tool definitions with proper MCP schema (matching Cloudflare format)
const TOOLS = [
  {
    name: 'get_events',
    description: 'Get a paginated list of all events with optional filtering and sorting.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description: 'Maximum number of events to return (0-100)'
        },
        cursor: {
          type: 'integer',
          minimum: 0,
          description: 'Pagination cursor for fetching next page'
        }
      },
      required: []
    }
  },
  {
    name: 'get_markets',
    description: 'Get a paginated list of markets with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description: 'Number of markets to return (0-100)'
        },
        cursor: {
          type: 'integer',
          minimum: 0,
          description: 'Pagination cursor for fetching next page'
        }
      },
      required: []
    }
  },
  {
    name: 'get_trades',
    description: 'Get a paginated list of trades across markets with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 0,
          maximum: 100,
          description: 'Number of trades to return (0-100)'
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor for fetching next page'
        }
      },
      required: []
    }
  },
  {
    name: 'get_market_by_mint',
    description: 'Get market details by token mint address.',
    inputSchema: {
      type: 'object',
      properties: {
        mint: {
          type: 'string',
          description: 'Token mint address to look up market'
        }
      },
      required: ['mint']
    }
  },
  {
    name: 'get_live_data',
    description: 'Get live data for events and markets.',
    inputSchema: {
      type: 'object',
      properties: {
        event_ticker: {
          type: 'string',
          description: 'Event ticker for live data'
        },
        market_ticker: {
          type: 'string',
          description: 'Market ticker for live data'
        }
      },
      required: []
    }
  }
];

// Server info following MCP 2025-06-18 specification (Cloudflare style)
const SERVER_INFO = {
  protocolVersion: '2025-06-18',
  capabilities: {
    tools: {
      listChanged: false
    },
    prompts: {},
    resources: {}
  },
  serverInfo: {
    name: 'dflow-mcp-server',
    version: '1.0.0',
    description: 'Prediction Market Metadata API server for DFlow platform'
  }
};

// Claude Desktop connection handler (Cloudflare MCP style)
async function handleConnectMCPServer(request) {
  const [serverUrl, nullParam] = request.args;
  
  console.log(`🔗 CLOUDFLARE MCP: connectMCPServer`);
  console.log(`📡 URL: ${serverUrl}`);
  console.log(`🆔 Request ID: ${request.id}`);
  
  // Return Cloudflare-style MCP connection response
  const response = {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      name: SERVER_INFO.serverInfo.name,
      version: SERVER_INFO.serverInfo.version,
      protocolVersion: SERVER_INFO.protocolVersion,
      capabilities: SERVER_INFO.capabilities,
      serverInfo: SERVER_INFO.serverInfo,
      tools: TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      })),
      prompts: [],
      resources: [],
      connected: true,
      server_url: serverUrl || "https://dflow.opensvm.com/api/mcp",
      status: "connected",
      timestamp: new Date().toISOString(),
      transport: "http_post",
      implementation: "netlify-functions-cloudflare-style"
    }
  };
  
  console.log(`✅ CLOUDFLARE RESPONSE: ${JSON.stringify(response, null, 2)}`);
  
  return response;
}

// Tool list handler (Cloudflare style)
async function handleToolsList(request) {
  console.log(`🛠️ CLOUDFLARE MCP: tools/list`);
  
  return {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      tools: TOOLS
    }
  };
}

// Tool call handler (Cloudflare style)
async function handleToolsCall(request) {
  const { name, arguments: args } = request.params;
  const toolArgs = args || {};

  console.log(`🔧 CLOUDFLARE MCP: tools/call - ${name}`);
  console.log(`📝 Args: ${JSON.stringify(toolArgs)}`);

  let result;
  try {
    switch (name) {
      case 'get_events':
        result = await apiRequest('GET', '/api/v1/events', toolArgs);
        break;
      case 'get_markets':
        result = await apiRequest('GET', '/api/v1/markets', toolArgs);
        break;
      case 'get_trades':
        result = await apiRequest('GET', '/api/v1/trades', toolArgs);
        break;
      case 'get_market_by_mint':
        result = await apiRequest('GET', `/api/v1/markets/by-mint/${toolArgs.mint}`);
        break;
      case 'get_live_data':
        const path = toolArgs.event_ticker 
          ? `/api/v1/events/live-data/${toolArgs.event_ticker}`
          : toolArgs.market_ticker 
          ? `/api/v1/markets/live-data/${toolArgs.market_ticker}`
          : '/api/v1/live-data';
        result = await apiRequest('GET', path);
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      }
    };
  } catch (error) {
    console.log(`❌ TOOL ERROR: ${error.message}`);
    
    return {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32603,
        message: error.message,
        data: {
          tool: name,
          arguments: toolArgs
        }
      }
    };
  }
}

// Get models handler (Claude Desktop discovery)
async function handleGetModels(request) {
  console.log(`📋 CLOUDFLARE MCP: getModels`);
  
  return {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      models: [
        {
          id: "dflow-prediction-markets",
          name: "DFlow Prediction Markets",
          description: "Access prediction market events, markets, trades, and live data",
          provider: "dflow-mcp-server",
          capabilities: ["tools", "text-generation"]
        }
      ]
    }
  };
}

// Initialize handler (MCP standard)
async function handleInitialize(request) {
  console.log(`🚀 CLOUDFLARE MCP: initialize`);
  
  return {
    jsonrpc: "2.0",
    id: request.id,
    result: SERVER_INFO
  };
}

// Health check handler
async function handleHealth(request) {
  console.log(`💓 CLOUDFLARE MCP: health`);
  
  return {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: SERVER_INFO.serverInfo.version,
      implementation: "netlify-functions-cloudflare-style",
      tools_available: TOOLS.length,
      protocols_supported: ["jsonrpc", "claude_desktop_rpc"]
    }
  };
}

// Main handler - Cloudflare MCP server style
exports.handler = async function(event, context) {
  const { httpMethod, body, headers, requestContext } = event;
  const requestPath = requestContext.path || '';
  
  console.log(`🌟 CLOUDFLARE MCP: ${httpMethod} ${requestPath}`);
  console.log(`📦 CLOUDFLARE BODY: ${body}`);

  // Handle OPTIONS preflight (CORS)
  if (httpMethod === 'OPTIONS') {
    console.log(`✈️ CLOUDFLARE MCP: CORS preflight`);
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
        'Access-Control-Max-Age': '86400',
      }
    };
  }

  // Only POST requests for MCP operations
  if (httpMethod !== 'POST') {
    console.log(`❌ CLOUDFLARE MCP: Method not allowed: ${httpMethod}`);
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: 'Method not allowed'
        }
      })
    };
  }

  try {
    let request;
    
    // Parse request body
    try {
      request = JSON.parse(body);
      console.log(`📋 CLOUDFLARE PARSED: ${JSON.stringify(request, null, 2)}`);
    } catch (parseError) {
      console.log(`💥 CLOUDFLARE PARSE ERROR: ${parseError.message}`);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: 'Parse error',
            data: parseError.message
          }
        })
      };
    }

    // Standard CORS headers
    const responseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
      'Content-Type': 'application/json'
    };

    // Route to appropriate handler
    let response;
    
    if (request.args && Array.isArray(request.args) && request.method && request.type === 'rpc') {
      // Claude Desktop format
      console.log(`🤖 CLOUDFLARE MCP: Claude Desktop format - ${request.method}`);
      
      switch (request.method) {
        case 'connectMCPServer':
          response = await handleConnectMCPServer(request);
          break;
        case 'getModels':
          response = await handleGetModels(request);
          break;
        case 'health':
          response = await handleHealth(request);
          break;
        default:
          console.log(`❌ CLOUDFLARE MCP: Unknown Claude Desktop method: ${request.method}`);
          response = {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32601,
              message: 'Method not found',
              data: {
                available_methods: ['connectMCPServer', 'getModels', 'health'],
                format: 'claude_desktop_rpc'
              }
            }
          };
          break;
      }
    } else if (request.jsonrpc && request.method && !request.type) {
      // Standard JSON-RPC format
      console.log(`📜 CLOUDFLARE MCP: Standard JSON-RPC format - ${request.method}`);
      
      switch (request.method) {
        case 'initialize':
          response = await handleInitialize(request);
          break;
        case 'tools/list':
          response = await handleToolsList(request);
          break;
        case 'tools/call':
          response = await handleToolsCall(request);
          break;
        case 'health':
          response = await handleHealth(request);
          break;
        default:
          console.log(`❌ CLOUDFLARE MCP: Unknown JSON-RPC method: ${request.method}`);
          response = {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32601,
              message: 'Method not found',
              data: {
                available_methods: ['initialize', 'tools/list', 'tools/call', 'health'],
                format: 'standard_jsonrpc'
              }
            }
          };
          break;
      }
    } else {
      // Unknown format
      console.log(`❌ CLOUDFLARE MCP: Unknown request format`);
      response = {
        jsonrpc: "2.0",
        id: request.id || null,
        error: {
          code: -32600,
          message: 'Invalid request format',
          data: {
            expected_formats: ['claude_desktop_rpc', 'standard_jsonrpc'],
            received_request: request
          }
        }
      };
    }

    console.log(`📤 CLOUDFLARE RESPONSE: ${JSON.stringify(response, null, 2)}`);
    
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.log(`💥 CLOUDFLARE INTERNAL ERROR: ${error.message}`);
    console.log(`📍 CLOUDFLARE STACK: ${error.stack}`);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message
        }
      })
    };
  }
};
