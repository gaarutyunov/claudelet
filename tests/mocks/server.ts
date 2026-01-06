import { createServer } from "http";
import { OAuth2Server } from "oauth2-mock-server";

// Simple mock API server combining Anthropic mocks and OAuth
const PORT = 4010;
const OAUTH_PORT = 8080;

// Anthropic mock responses
function createSSEStream(text: string): string {
  const messageId = `msg_mock_${Date.now()}`;
  const chunks = text.match(/.{1,10}/g) || [text];

  let sse = "";

  // message_start
  sse += `event: message_start\ndata: ${JSON.stringify({
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      content: [],
      model: "claude-sonnet-4-5-20250929",
      usage: { input_tokens: 10, output_tokens: 0 },
    },
  })}\n\n`;

  // content_block_start
  sse += `event: content_block_start\ndata: ${JSON.stringify({
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  })}\n\n`;

  // content deltas
  for (const chunk of chunks) {
    sse += `event: content_block_delta\ndata: ${JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: chunk },
    })}\n\n`;
  }

  // content_block_stop
  sse += `event: content_block_stop\ndata: ${JSON.stringify({
    type: "content_block_stop",
    index: 0,
  })}\n\n`;

  // message_delta
  sse += `event: message_delta\ndata: ${JSON.stringify({
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: chunks.length * 3 },
  })}\n\n`;

  // message_stop
  sse += `event: message_stop\ndata: ${JSON.stringify({
    type: "message_stop",
  })}\n\n`;

  return sse;
}

// Create HTTP server for Anthropic API mock
const server = createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, anthropic-version");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "claudelet-mock-api" }));
    return;
  }

  // Messages endpoint
  if (req.url === "/v1/messages" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const responseText = "Hello! I'm Claude, running in your Claudelet test environment. How can I help you today?";

        if (data.stream) {
          // Streaming response
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });

          const sse = createSSEStream(responseText);
          const lines = sse.split("\n");
          let index = 0;

          const sendLine = () => {
            if (index < lines.length) {
              res.write(lines[index] + "\n");
              index++;
              setTimeout(sendLine, 20);
            } else {
              res.end();
            }
          };

          sendLine();
        } else {
          // Non-streaming response
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              id: `msg_mock_${Date.now()}`,
              type: "message",
              role: "assistant",
              content: [{ type: "text", text: responseText }],
              model: "claude-sonnet-4-5-20250929",
              stop_reason: "end_turn",
              usage: { input_tokens: 10, output_tokens: 30 },
            })
          );
        }
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request body" }));
      }
    });
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// Start OAuth2 mock server
async function startOAuthServer() {
  const oauthServer = new OAuth2Server();
  await oauthServer.issuer.keys.generate("RS256");

  // Customize token generation
  oauthServer.service.on("beforeTokenSigning", (token) => {
    token.payload.email = "test@claudelet.dev";
    token.payload.name = "Test User";
    token.payload.picture = "https://example.com/avatar.png";
    token.payload.sub = "test-user-id";
  });

  await oauthServer.start(OAUTH_PORT, "localhost");
  console.log(`OAuth2 mock server running at http://localhost:${OAUTH_PORT}`);
  console.log(`  Discovery: http://localhost:${OAUTH_PORT}/.well-known/openid-configuration`);

  return oauthServer;
}

// Start servers
async function main() {
  server.listen(PORT, () => {
    console.log(`Anthropic mock API running at http://localhost:${PORT}`);
    console.log(`  Health: http://localhost:${PORT}/health`);
    console.log(`  Messages: http://localhost:${PORT}/v1/messages`);
  });

  await startOAuthServer();

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down mock servers...");
    server.close();
    process.exit(0);
  });
}

main().catch(console.error);
