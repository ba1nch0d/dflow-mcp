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

// Get tools from API
async function getTools() {
  const toolsUrl = 'https://raw.githubusercontent.com/openSVM/dflow-mcp/main/llms-dflow.json';
  const response = await fetch(toolsUrl);
  const data = await response.json();
  return data.tools || [];
}

// Server info
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

// Main handler
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

    // Handle initialize method
    if (request.method === 'initialize') {
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: SERVER_INFO
      };
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify(response)
      };
    }

    // Handle tools/list method
    if (request.method === 'tools/list') {
      const tools = await getTools();
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: tools
        }
      };
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify(response)
      };
    }

    // Handle tools/call method
    if (request.method === 'tools/call') {
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
            // Try to call any tool by name
            result = await apiRequest('GET', `/api/v1/${name.replace('get_', '')}`, toolArgs);
            break;
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
        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(response)
        };
      } catch (error) {
        const response = {
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
        return {
          statusCode: 200,
          headers: responseHeaders,
          body: JSON.stringify(response)
        };
      }
    }

    // Handle health check
    if (request.method === 'health') {
      const tools = await getTools();
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          status: "healthy",
          timestamp: new Date().toISOString(),
          version: SERVER_INFO.serverInfo.version,
          tools_count: tools.length,
          server: SERVER_INFO.serverInfo.name
        }
      };
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify(response)
      };
    }

    // Method not found
    const response = {
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32601,
        message: 'Method not found',
        data: {
          available_methods: ['initialize', 'tools/list', 'tools/call', 'health'],
          supported_protocols: ['jsonrpc: 2.0']
        }
      }
    };
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify(response)
    };

  } catch (error) {
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
