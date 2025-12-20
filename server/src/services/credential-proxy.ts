import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { logUsage, User } from "../db/index.js";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string }>;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string;
  stream?: boolean;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{ type: string; text: string }>;
  model: string;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Rate limiting per user
const userRateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = userRateLimits.get(userId);

  if (!limit || now > limit.resetAt) {
    userRateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  limit.count++;
  return true;
}

export class CredentialProxy {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = config.anthropicApiKey;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  async proxyRequest(
    user: User,
    sessionId: string | null,
    request: AnthropicRequest
  ): Promise<AnthropicResponse> {
    if (!this.apiKey) {
      throw new Error("Anthropic API key not configured");
    }

    // Check rate limit
    if (!checkRateLimit(user.id)) {
      throw new Error("Rate limit exceeded. Please wait before making more requests.");
    }

    logger.info(
      { userId: user.id, model: request.model },
      "Proxying request to Anthropic"
    );

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error({ error, status: response.status }, "Anthropic API error");
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = (await response.json()) as AnthropicResponse;

    // Log usage
    const costPerInputToken = 0.000015; // Claude 3.5 Sonnet pricing
    const costPerOutputToken = 0.000075;
    const costUsd =
      data.usage.input_tokens * costPerInputToken +
      data.usage.output_tokens * costPerOutputToken;

    logUsage(
      user.id,
      sessionId,
      data.usage.input_tokens,
      data.usage.output_tokens,
      costUsd
    );

    logger.info(
      {
        userId: user.id,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        costUsd,
      },
      "Request completed"
    );

    return data;
  }

  async streamRequest(
    user: User,
    sessionId: string | null,
    request: AnthropicRequest,
    onChunk: (chunk: string) => void,
    onDone: (usage: { input_tokens: number; output_tokens: number }) => void
  ): Promise<void> {
    if (!this.apiKey) {
      throw new Error("Anthropic API key not configured");
    }

    if (!checkRateLimit(user.id)) {
      throw new Error("Rate limit exceeded");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ ...request, stream: true }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let usage = { input_tokens: 0, output_tokens: 0 };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);
            if (event.type === "content_block_delta") {
              onChunk(event.delta?.text || "");
            } else if (event.type === "message_delta") {
              usage = event.usage || usage;
            } else if (event.type === "message_start") {
              usage = event.message?.usage || usage;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    // Log usage
    const costPerInputToken = 0.000015;
    const costPerOutputToken = 0.000075;
    const costUsd =
      usage.input_tokens * costPerInputToken +
      usage.output_tokens * costPerOutputToken;

    logUsage(user.id, sessionId, usage.input_tokens, usage.output_tokens, costUsd);
    onDone(usage);
  }
}

export const credentialProxy = new CredentialProxy();
