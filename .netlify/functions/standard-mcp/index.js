// Standard MCP Server Protocol Implementation
// Handles standard JSON-RPC 2.0 MCP protocol (not Claude Desktop RPC)

const BASE_URL = 'https://api.llm.dflow.org';

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

// Server info for standard MCP protocol
const SERVER_INFO = {
  protocolVersion: '2025-06-18',
  capabilities: {
    tools: {
      listChanged: false
    },
    prompts: {},
    resources: {},
    logging: {}
  },
  serverInfo: {
    name: 'dflow-mcp-server',
    version: '1.0.0',
    description: 'Prediction Market Metadata API server for DFlow platform'
  }
};

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

// Standard MCP handlers
const mcpHandlers = {
  initialize: async (request) => {
    console.log(`🚀 MCP STANDARD: initialize request`);
    console.log(`📋 Client info:`, request.params?.clientInfo);
    
    const response = {
      jsonrpc: "2.0",
      id: request.id,
      result: SERVER_INFO
    };
    
    console.log(`✅ MCP INITIALIZE RESPONSE: ${JSON.stringify(response, null, 2)}`);
    
    return response;
  },

  'tools/list': async (request) => {
    console.log(`🛠️ MCP STANDARD: tools/list request`);
    
    const response = {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        tools: TOOLS
      }
    };
    
    console.log(`✅ MCP TOOLS/LIST RESPONSE: ${JSON.stringify(response, null, 2)}`);
    
    return response;
  },

  'tools/call': async (request) => {
    const { name, arguments: args } = request.params;
    const toolArgs = args || {};

    console.log(`🔧 MCP STANDARD: tools/call - ${name}`);
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

      const response = {
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
      
      console.log(`✅ MCP TOOLS/CALL RESPONSE: ${JSON.stringify(response, null, 2)}`);
      
      return response;
    } catch (error) {
      console.log(`❌ TOOL ERROR: ${error.message}`);
      
      const errorResponse = {
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
      
      console.log(`❌ MCP ERROR RESPONSE: ${JSON.stringify(errorResponse, null, 2)}`);
      
      return errorResponse;
    }
  },

  // Health check for debugging
  health: async (request) => {
    console.log(`💓 MCP STANDARD: health check`);
    
    const response = {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: SERVER_INFO.serverInfo.version,
        methods: Object.keys(mcpHandlers),
        tools_count: TOOLS.length,
        protocol: "standard_mcp_jsonrpc"
      }
    };
    
    console.log(`✅ MCP HEALTH RESPONSE: ${JSON.stringify(response, null, 2)}`);
    
    return response;
  },

  // Notifications (no response expected)
  'notifications/prompts/list': async (request) => {
    console.log(`📢 MCP STANDARD: notifications/prompts/list`);
    // No response for notifications
    return null;
  },

  'notifications/resources/list': async (request) => {
    console.log(`📢 MCP STANDARD: notifications/resources/list`);
    // No response for notifications
    return null;
  },

  'notifications/tools/list_changed': async (request) => {
    console.log(`📢 MCP STANDARD: notifications/tools/list_changed`);
    // No response for notifications
    return null;
  }
};

// Main standard MCP handler
exports.handler = async function(event, context) {
  const { httpMethod, body, headers, requestContext } = event;
  const requestPath = requestContext.path || '';
  
  console.log(`🌟 MCP STANDARD: ${httpMethod} ${requestPath}`);
  console.log(`📦 MCP STANDARD BODY: ${body}`);

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
    let request;
    
    // Parse request
    try {
      request = JSON.parse(body);
      console.log(`📋 MCP STANDARD PARSED: ${JSON.stringify(request, null, 2)}`);
    } catch (parseError) {
      console.log(`💥 MCP STANDARD PARSE ERROR: ${parseError.message}`);
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

    // Add CORS headers to all responses
    const responseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
      'Content-Type': 'application/json'
    };

    // Handle notifications (no response expected)
    if (request.method && request.method.startsWith('notifications/')) {
      console.log(`📢 MCP STANDARD: Notification - ${request.method}`);
      const handler = mcpHandlers[request.method];
      if (handler) {
        await handler(request);
        // Return 200 OK for notifications (no content)
        return {
          statusCode: 200,
          headers: responseHeaders,
          body: ''
        };
      }
    }

    // Handle standard JSON-RPC methods
    if (request.jsonrpc === '2.0' && request.method && !request.type) {
      console.log(`📜 MCP STANDARD: JSON-RPC method - ${request.method}`);
      
      const methodName = request.method;
      const handler = mcpHandlers[methodName];
      
      if (handler) {
        const response = await handler(request);
        
        // Don't respond to notifications
        if (response === null) {
          return {
            statusCode: 200,
            headers: responseHeaders,
            body: ''
          };
        }
        
        console.log(`📤 MCP STANDARD RESPONSE: ${JSON.stringify(response, null, 2)}`);
        
        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(response)
        };
      }
    }

    // Method not found - provide helpful error
    const errorResponse = {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32601,
        message: 'Method not found',
        data: {
          available_methods: Object.keys(mcpHandlers),
          request_method: request.method,
          protocol: "standard_mcp_jsonrpc",
          supported_formats: ["jsonrpc: 2.0"],
          examples: {
            initialize: {
              method: "initialize",
              params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: {...} },
              jsonrpc: "2.0",
              id: 0
            },
            tools_list: {
              method: "tools/list",
              jsonrpc: "2.0",
              id: 1
            },
            tools_call: {
              method: "tools/call",
              params: { name: "get_events", arguments: { limit: 10 } },
              jsonrpc: "2.0",
              id: 2
            }
          }
        }
      }
    };
    
    console.log(`❌ MCP STANDARD ERROR RESPONSE: ${JSON.stringify(errorResponse, null, 2)}`);
    
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify(errorResponse)
    };

  } catch (error) {
    const errorResponse = {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message
      }
    };
    
    console.log(`💥 MCP STANDARD INTERNAL ERROR: ${JSON.stringify(errorResponse, null, 2)}`);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(errorResponse)
    };
  }
};