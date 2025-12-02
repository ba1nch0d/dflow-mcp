// Universal MCP Server with Multi-Endpoint Support
// Supports: /mcp/v2/bootstrap, /sse, /mcp, /api/mcp

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

// Server info for universal MCP protocol
const SERVER_INFO = {
  protocolVersion: '2025-06-18',
  capabilities: {
    tools: {
      listChanged: false
    },
    prompts: {},
    resources: {},
    sse: true,
    multi_endpoint: true
  },
  serverInfo: {
    name: 'dflow-universal-mcp-server',
    version: '1.0.0',
    description: 'Universal Prediction Market Metadata API server for DFlow platform with multi-endpoint support'
  }
};

// SSE Event formatter
function formatSSEEvent(type, data, id = null) {
  let event = '';
  if (id) event += `id: ${id}\n`;
  if (type) event += `event: ${type}\n`;
  event += `data: ${JSON.stringify(data)}\n\n`;
  return event;
}

// SSE Response helper
function createSSEResponse(events, requestId = null) {
  let response = '';
  
  events.forEach(event => {
    response += formatSSEEvent(event.type, event.data, requestId);
  });
  
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, Last-Event-ID',
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    },
    body: response
  };
}

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

// Universal bootstrap handler
async function handleBootstrap(request, endpoint) {
  const [serverUrl, nullParam] = request.args || [null, null];
  
  console.log(`🚀 UNIVERSAL MCP: Bootstrap requested at ${endpoint}`);
  console.log(`📡 URL: ${serverUrl}`);
  console.log(`🆔 Request ID: ${request.id}`);
  
  const response = {
    jsonrpc: "2.0",
    id: request.id || "bootstrap-response",
    result: {
      name: SERVER_INFO.serverInfo.name,
      version: SERVER_INFO.serverInfo.version,
      description: SERVER_INFO.serverInfo.description,
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
      server_url: serverUrl || "https://dflow.opensvm.com/mcp",
      status: "connected",
      timestamp: new Date().toISOString(),
      transport: "http_post_with_sse",
      implementation: "netlify-functions-universal-mcp",
      sse: {
        supported: true,
        endpoint: "/sse",
        keep_alive: true,
        retry_time: 3000
      },
      multi_endpoint: {
        supported: true,
        endpoints: {
          bootstrap: ["/mcp/v2/bootstrap", "/sse", "/mcp", "/api/mcp"],
          events: ["/sse", "/mcp/v2/events", "/mcp/events", "/api/mcp/events"],
          tools_list: ["/mcp/v2/tools/list", "/sse/tools", "/mcp/tools", "/api/mcp/tools/list"],
          tools_call: ["/mcp/v2/tools/call", "/sse/call", "/mcp/call", "/api/mcp/tools/call"]
        }
      },
      requested_endpoint: endpoint
    }
  };
  
  console.log(`✅ UNIVERSAL BOOTSTRAP: ${JSON.stringify(response, null, 2)}`);
  
  return response;
}

// Universal SSE events handler
async function handleSSEEvents(request, endpoint) {
  console.log(`📡 UNIVERSAL MCP: SSE stream requested at ${endpoint}`);
  
  const requestId = `sse-${Date.now()}`;
  const events = [
    {
      type: 'connected',
      data: {
        status: 'connected',
        server: SERVER_INFO.serverInfo.name,
        endpoint: endpoint,
        timestamp: new Date().toISOString()
      }
    },
    {
      type: 'tools_available',
      data: {
        tools: TOOLS,
        count: TOOLS.length,
        endpoints: ["/sse", "/mcp/v2/events", "/mcp/events", "/api/mcp/events"]
      }
    },
    {
      type: 'ready',
      data: {
        status: 'ready',
        capabilities: SERVER_INFO.capabilities,
        transport: 'sse',
        multi_endpoint: true
      }
    }
  ];
  
  return createSSEResponse(events, requestId);
}

// Universal tools list handler
async function handleToolsList(request, endpoint) {
  console.log(`🛠️ UNIVERSAL MCP: tools/list at ${endpoint}`);
  
  return {
    jsonrpc: "2.0",
    id: request.id,
    result: {
      tools: TOOLS,
      transport: "sse_supported",
      streaming: true,
      multi_endpoint: true,
      requested_endpoint: endpoint
    }
  };
}

// Universal tools call handler
async function handleToolsCall(request, endpoint) {
  const { name, arguments: args } = request.params;
  const toolArgs = args || {};

  console.log(`🔧 UNIVERSAL MCP: tools/call - ${name} at ${endpoint}`);
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
        ],
        transport: "sse_supported",
        requested_endpoint: endpoint
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
          arguments: toolArgs,
          requested_endpoint: endpoint
        }
      }
    };
  }
}

// Main universal handler
exports.handler = async function(event, context) {
  const { httpMethod, body, headers, requestContext } = event;
  const requestPath = requestContext.path || '';
  
  console.log(`🌟 UNIVERSAL MCP: ${httpMethod} ${requestPath}`);
  console.log(`📦 UNIVERSAL BODY: ${body}`);

  // Handle OPTIONS for CORS
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, Last-Event-ID',
        'Access-Control-Max-Age': '86400',
      }
    };
  }

  try {
    let request;
    
    // Parse request
    try {
      request = JSON.parse(body);
      console.log(`📋 UNIVERSAL PARSED: ${JSON.stringify(request, null, 2)}`);
    } catch (parseError) {
      console.log(`💥 UNIVERSAL PARSE ERROR: ${parseError.message}`);
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, Last-Event-ID',
      'Content-Type': 'application/json'
    };

    // Route based on endpoint
    let response;
    
    // Handle SSE endpoints (GET requests)
    if (httpMethod === 'GET' && (requestPath === '/sse' || requestPath === '/mcp' || requestPath.startsWith('/api/mcp') || requestPath.startsWith('/mcp/'))) {
      return await handleSSEEvents(request, requestPath);
    }
    
    // Handle bootstrap endpoints
    if (requestPath === '/mcp/v2/bootstrap' || requestPath === '/sse' || requestPath === '/mcp' || requestPath === '/api/mcp') {
      response = await handleBootstrap(request, requestPath);
    } else if (request.method === 'tools/list') {
      response = await handleToolsList(request, requestPath);
    } else if (request.method === 'tools/call') {
      response = await handleToolsCall(request, requestPath);
    } else {
      // Unknown method/endpoint
      response = {
        jsonrpc: "2.0",
        id: request.id,
        error: {
          code: -32601,
          message: 'Method not found',
          data: {
            requested_endpoint: requestPath,
            available_endpoints: {
              bootstrap: ["/mcp/v2/bootstrap", "/sse", "/mcp", "/api/mcp"],
              events: ["/sse", "/mcp/v2/events", "/mcp/events", "/api/mcp/events"],
              tools_list: ["/mcp/v2/tools/list", "/sse/tools", "/mcp/tools", "/api/mcp/tools/list"],
              tools_call: ["/mcp/v2/tools/call", "/sse/call", "/mcp/call", "/api/mcp/tools/call"]
            },
            formats_supported: ['mcp_v2', 'sse', 'universal'],
            multi_endpoint: true
          }
        }
      };
    }

    console.log(`📤 UNIVERSAL RESPONSE: ${JSON.stringify(response, null, 2)}`);
    
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify(response)
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
    
    console.log(`💥 UNIVERSAL INTERNAL ERROR: ${JSON.stringify(errorResponse, null, 2)}`);
    
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