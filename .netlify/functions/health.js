export default async function handler(event, context) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: 'ok',
      service: 'dflow-mcp',
      version: '1.0.0',
      tools: 23,
      timestamp: new Date().toISOString()
    })
  };
}