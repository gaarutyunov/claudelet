import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "../__tests__/utils";
import { MessageBubble, ChatMessageData } from "./ChatMessage";

describe("MessageBubble", () => {
  describe("User Messages", () => {
    const userMessage: ChatMessageData = {
      id: "msg-1",
      type: "user",
      content: "Hello, Claude!",
      timestamp: Date.now(),
    };

    it("should render user message content", () => {
      render(<MessageBubble message={userMessage} />);

      expect(screen.getByText("Hello, Claude!")).toBeInTheDocument();
    });

    it("should display timestamp", () => {
      render(<MessageBubble message={userMessage} />);

      // Check that time is displayed (format like "10:30 AM")
      const timePattern = /\d{1,2}:\d{2}/;
      const container = screen.getByText("Hello, Claude!").parentElement;
      expect(container?.textContent).toMatch(timePattern);
    });

    it("should align user messages to the right", () => {
      render(<MessageBubble message={userMessage} />);

      const container = screen.getByText("Hello, Claude!").closest("div");
      const parentContainer = container?.parentElement;
      expect(parentContainer).toHaveClass("justify-end");
    });

    it("should use blue background for user messages", () => {
      render(<MessageBubble message={userMessage} />);

      const bubble = screen.getByText("Hello, Claude!").closest('[class*="bg-blue"]');
      expect(bubble).toBeInTheDocument();
    });
  });

  describe("Assistant Messages", () => {
    const assistantMessage: ChatMessageData = {
      id: "msg-2",
      type: "assistant",
      content: "Hello! How can I help you today?",
      timestamp: Date.now(),
    };

    it("should render assistant message content", () => {
      render(<MessageBubble message={assistantMessage} />);

      expect(screen.getByText("Hello! How can I help you today?")).toBeInTheDocument();
    });

    it("should align assistant messages to the left", () => {
      render(<MessageBubble message={assistantMessage} />);

      const container = screen.getByText("Hello! How can I help you today?").closest("div");
      const parentContainer = container?.parentElement;
      expect(parentContainer).toHaveClass("justify-start");
    });

    it("should use neutral background for assistant messages", () => {
      render(<MessageBubble message={assistantMessage} />);

      const bubble = screen.getByText("Hello! How can I help you today?").closest('[class*="bg-neutral"]');
      expect(bubble).toBeInTheDocument();
    });
  });

  describe("System Messages", () => {
    const systemMessage: ChatMessageData = {
      id: "msg-3",
      type: "system",
      content: "Session started",
      timestamp: Date.now(),
    };

    it("should render system message with italic styling", () => {
      render(<MessageBubble message={systemMessage} />);

      const bubble = screen.getByText("Session started").closest("div");
      expect(bubble).toHaveClass("italic");
    });

    it("should use muted styling for system messages", () => {
      render(<MessageBubble message={systemMessage} />);

      const bubble = screen.getByText("Session started").closest('[class*="text-neutral-400"]');
      expect(bubble).toBeInTheDocument();
    });
  });

  describe("Error Messages", () => {
    const errorMessage: ChatMessageData = {
      id: "msg-4",
      type: "error",
      content: "An error occurred",
      timestamp: Date.now(),
    };

    it("should render error message", () => {
      render(<MessageBubble message={errorMessage} />);

      expect(screen.getByText("An error occurred")).toBeInTheDocument();
    });

    it("should use red styling for error messages", () => {
      render(<MessageBubble message={errorMessage} />);

      const bubble = screen.getByText("An error occurred").closest('[class*="bg-red"]');
      expect(bubble).toBeInTheDocument();
    });

    it("should have error border", () => {
      render(<MessageBubble message={errorMessage} />);

      const bubble = screen.getByText("An error occurred").closest('[class*="border-red"]');
      expect(bubble).toBeInTheDocument();
    });
  });

  describe("Tool Use Messages", () => {
    const toolUseMessage: ChatMessageData = {
      id: "msg-5",
      type: "tool_use",
      tool: "Read",
      toolId: "tool-123",
      params: { file_path: "/path/to/file.ts" },
      timestamp: Date.now(),
    };

    it("should render tool name", () => {
      render(<MessageBubble message={toolUseMessage} />);

      expect(screen.getByText("Read")).toBeInTheDocument();
    });

    it("should show file path in summary", () => {
      render(<MessageBubble message={toolUseMessage} />);

      expect(screen.getByText("/path/to/file.ts")).toBeInTheDocument();
    });

    it("should expand to show params when clicked", () => {
      render(<MessageBubble message={toolUseMessage} />);

      const button = screen.getByRole("button");
      fireEvent.click(button);

      // Check that params are displayed
      expect(screen.getByText(/"file_path"/)).toBeInTheDocument();
    });

    it("should collapse when clicked again", () => {
      render(<MessageBubble message={toolUseMessage} />);

      const button = screen.getByRole("button");
      fireEvent.click(button); // Expand
      fireEvent.click(button); // Collapse

      // Params should no longer be visible in expanded form
      expect(screen.queryByText(/"file_path": "\/path\/to\/file.ts"/)).not.toBeInTheDocument();
    });
  });

  describe("Tool Use - Different Tools", () => {
    it("should show command summary for Bash tool", () => {
      const bashMessage: ChatMessageData = {
        id: "msg-bash",
        type: "tool_use",
        tool: "Bash",
        toolId: "tool-bash",
        params: { command: "npm install" },
        timestamp: Date.now(),
      };

      render(<MessageBubble message={bashMessage} />);

      expect(screen.getByText("Bash")).toBeInTheDocument();
      expect(screen.getByText("npm install")).toBeInTheDocument();
    });

    it("should show pattern for Glob tool", () => {
      const globMessage: ChatMessageData = {
        id: "msg-glob",
        type: "tool_use",
        tool: "Glob",
        toolId: "tool-glob",
        params: { pattern: "**/*.ts" },
        timestamp: Date.now(),
      };

      render(<MessageBubble message={globMessage} />);

      expect(screen.getByText("Glob")).toBeInTheDocument();
      expect(screen.getByText("**/*.ts")).toBeInTheDocument();
    });

    it("should show pattern for Grep tool", () => {
      const grepMessage: ChatMessageData = {
        id: "msg-grep",
        type: "tool_use",
        tool: "Grep",
        toolId: "tool-grep",
        params: { pattern: "function.*" },
        timestamp: Date.now(),
      };

      render(<MessageBubble message={grepMessage} />);

      expect(screen.getByText("Grep")).toBeInTheDocument();
      expect(screen.getByText("function.*")).toBeInTheDocument();
    });
  });

  describe("Tool Result Messages", () => {
    const toolResultMessage: ChatMessageData = {
      id: "msg-6",
      type: "tool_result",
      toolId: "tool-123",
      result: "File content here",
      isError: false,
      timestamp: Date.now(),
    };

    it("should render successful result", () => {
      render(<MessageBubble message={toolResultMessage} />);

      expect(screen.getByText("File content here")).toBeInTheDocument();
      expect(screen.getByText("Result")).toBeInTheDocument();
    });

    it("should show success icon for successful result", () => {
      render(<MessageBubble message={toolResultMessage} />);

      // Look for the green checkmark path
      const successIndicator = screen.getByText("Result").closest("div");
      expect(successIndicator?.querySelector('[class*="text-green"]')).toBeInTheDocument();
    });

    it("should render error result with different styling", () => {
      const errorResult: ChatMessageData = {
        ...toolResultMessage,
        id: "msg-error-result",
        result: "File not found",
        isError: true,
      };

      render(<MessageBubble message={errorResult} />);

      expect(screen.getByText("Error")).toBeInTheDocument();
      expect(screen.getByText("File not found")).toBeInTheDocument();
    });

    it("should show error icon for error result", () => {
      const errorResult: ChatMessageData = {
        ...toolResultMessage,
        id: "msg-error-result",
        isError: true,
      };

      render(<MessageBubble message={errorResult} />);

      const errorIndicator = screen.getByText("Error").closest("div");
      expect(errorIndicator?.querySelector('[class*="text-red"]')).toBeInTheDocument();
    });

    it("should truncate long results", () => {
      const longResult: ChatMessageData = {
        ...toolResultMessage,
        id: "msg-long-result",
        result: "x".repeat(300),
      };

      render(<MessageBubble message={longResult} />);

      expect(screen.getByText(/\.\.\.$/)).toBeInTheDocument();
      expect(screen.getByText("Show more")).toBeInTheDocument();
    });

    it("should expand to show full result when clicking Show more", () => {
      const longResult: ChatMessageData = {
        ...toolResultMessage,
        id: "msg-long-result",
        result: "x".repeat(300),
      };

      render(<MessageBubble message={longResult} />);

      fireEvent.click(screen.getByText("Show more"));

      expect(screen.getByText("Show less")).toBeInTheDocument();
    });
  });

  describe("Multiline Content", () => {
    it("should preserve whitespace in messages", () => {
      const multilineMessage: ChatMessageData = {
        id: "msg-multiline",
        type: "assistant",
        content: "Line 1\nLine 2\nLine 3",
        timestamp: Date.now(),
      };

      render(<MessageBubble message={multilineMessage} />);

      const content = screen.getByText(/Line 1/);
      expect(content).toHaveClass("whitespace-pre-wrap");
    });
  });
});
