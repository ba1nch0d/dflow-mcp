const BASE_URL = 'https://api.llm.dflow.org';

// API client function
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

// Tool definitions with proper MCP schema
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

// Server info for MCP protocol
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

// WebSocket message handlers - also used for HTTP
const handlers = {
  getModels: async (request) => {
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
  },

  connectMCPServer: async (request) => {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        name: SERVER_INFO.serverInfo.name,
        version: SERVER_INFO.serverInfo.version,
        description: SERVER_INFO.serverInfo.description,
        capabilities: SERVER_INFO.capabilities,
        tools: TOOLS.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        })),
        connected: true,
        server_url: "https://dflow.opensvm.com/api/mcp",
        status: "connected",
        timestamp: new Date().toISOString(),
        transport: "http_post_supported"
      }
    };
  },

  initialize: async (request) => {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: SERVER_INFO
    };
  },

  'tools/list': async (request) => {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: TOOLS
      }
    };
  },

  'tools/call': async (request) => {
    const { name, arguments: args } = request.params;
    const toolArgs = args || {};

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
  },

  'tools/describe': async (request) => {
    const toolName = request.params.name;
    const tool = TOOLS.find(t => t.name === toolName);
    
    if (!tool) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32602,
          message: `Tool not found: ${toolName}`
        }
      };
    }

    return {
      jsonrpc: "2.0",
      id: request.id,
      result: tool
    };
  },

  'server/info': async (request) => {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: SERVER_INFO
    };
  },

  health: async (request) => {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: SERVER_INFO.serverInfo.version,
        methods: Object.keys(handlers),
        transport: "http_post_supported"
      }
    };
  }
};

// Main request handler - supports both HTTP POST and WebSocket upgrade detection
exports.handler = async function(event, context) {
  const { httpMethod, body, headers, requestContext } = event;

  // Handle OPTIONS for CORS
  if (httpMethod === 'OPTIONS') {
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

  // Handle WebSocket upgrade requests (inform about HTTP POST support)
  if (httpMethod === 'GET' && headers.upgrade?.toLowerCase() === 'websocket') {
    console.log('MCP WS: WebSocket upgrade requested');
    
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
          code: -32000,
          message: 'WebSocket upgrade not supported in Netlify Functions. Use HTTP POST transport instead.',
          data: {
            transport: 'http_post',
            endpoint: 'https://dflow.opensvm.com/api/mcp',
            claude_desktop_config: 'Claude Desktop may need to be configured for HTTP transport'
          }
        }
      })
    };
  }

  // Handle only POST requests for MCP
  if (httpMethod !== 'POST') {
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
    const request = JSON.parse(body);

    // Add CORS headers to all responses
    const responseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
      'Content-Type': 'application/json'
    };

    console.log(`MCP HTTP: ${request.method} request`);

    // Handle HTTP POST requests using unified handlers
    if (handlers[request.method]) {
      const response = await handlers[request.method](request);
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify(response)
      };
    }

    // Method not found
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32601,
          message: 'Method not found',
          data: {
            available_methods: Object.keys(handlers),
            transport: 'http_post_supported',
            claude_desktop_note: 'Claude Desktop may need to be configured for HTTP transport'
          }
        }
      })
    };

  } catch (error) {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: 'Parse error or internal error',
          data: error.message
        }
      })
    };
  }
};
