import { http, HttpResponse, delay } from "msw";

// Anthropic API handlers with SSE streaming support
export const anthropicHandlers = [
  // Health check
  http.get("http://localhost:4010/health", () => {
    return HttpResponse.json({ status: "ok" });
  }),

  // Non-streaming messages endpoint
  http.post("http://localhost:4010/v1/messages", async ({ request }) => {
    const body = await request.json() as { stream?: boolean; messages?: Array<{ content: string }> };

    if (body.stream) {
      // Return streaming SSE response
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          // message_start event
          controller.enqueue(
            encoder.encode(
              `event: message_start\ndata: ${JSON.stringify({
                type: "message_start",
                message: {
                  id: "msg_mock_" + Date.now(),
                  type: "message",
                  role: "assistant",
                  content: [],
                  model: "claude-sonnet-4-5-20250929",
                  stop_reason: null,
                  stop_sequence: null,
                  usage: { input_tokens: 10, output_tokens: 0 },
                },
              })}\n\n`
            )
          );

          await delay(50);

          // content_block_start
          controller.enqueue(
            encoder.encode(
              `event: content_block_start\ndata: ${JSON.stringify({
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "" },
              })}\n\n`
            )
          );

          // Stream text chunks
          const responseText = "Hello! I'm Claude, running in your Claudelet environment.";
          const chunks = responseText.match(/.{1,10}/g) || [];

          for (const chunk of chunks) {
            await delay(30);
            controller.enqueue(
              encoder.encode(
                `event: content_block_delta\ndata: ${JSON.stringify({
                  type: "content_block_delta",
                  index: 0,
                  delta: { type: "text_delta", text: chunk },
                })}\n\n`
              )
            );
          }

          // content_block_stop
          controller.enqueue(
            encoder.encode(
              `event: content_block_stop\ndata: ${JSON.stringify({
                type: "content_block_stop",
                index: 0,
              })}\n\n`
            )
          );

          // message_delta with final usage
          controller.enqueue(
            encoder.encode(
              `event: message_delta\ndata: ${JSON.stringify({
                type: "message_delta",
                delta: { stop_reason: "end_turn", stop_sequence: null },
                usage: { output_tokens: 25 },
              })}\n\n`
            )
          );

          // message_stop
          controller.enqueue(
            encoder.encode(
              `event: message_stop\ndata: ${JSON.stringify({
                type: "message_stop",
              })}\n\n`
            )
          );

          controller.close();
        },
      });

      return new HttpResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming response
    return HttpResponse.json({
      id: "msg_mock_" + Date.now(),
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Hello! I'm Claude, running in your Claudelet environment.",
        },
      ],
      model: "claude-sonnet-4-5-20250929",
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 10,
        output_tokens: 25,
      },
    });
  }),
];

// Mock responses for different test scenarios
export const createMockResponse = (text: string, tokens = { input: 10, output: 20 }) => ({
  id: "msg_mock_" + Date.now(),
  type: "message",
  role: "assistant",
  content: [{ type: "text", text }],
  model: "claude-sonnet-4-5-20250929",
  stop_reason: "end_turn",
  usage: { input_tokens: tokens.input, output_tokens: tokens.output },
});

export const handlers = [...anthropicHandlers];
