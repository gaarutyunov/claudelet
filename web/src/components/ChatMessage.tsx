import { useState } from "react";

export interface ChatMessageData {
  id: string;
  type: "user" | "assistant" | "tool_use" | "tool_result" | "error" | "system";
  content?: string;
  tool?: string;
  toolId?: string;
  params?: Record<string, unknown>;
  result?: string;
  isError?: boolean;
  timestamp: number;
}

interface MessageBubbleProps {
  message: ChatMessageData;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.type === "user";
  const isSystem = message.type === "system";
  const isError = message.type === "error";

  if (message.type === "tool_use") {
    return <ToolUseBlock message={message} />;
  }

  if (message.type === "tool_result") {
    return <ToolResultBlock message={message} />;
  }

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          isUser
            ? "bg-blue-600 text-white rounded-br-md"
            : isError
            ? "bg-red-900/50 text-red-200 border border-red-700"
            : isSystem
            ? "bg-neutral-800/50 text-neutral-400 text-sm italic"
            : "bg-neutral-800 text-neutral-100 rounded-bl-md"
        }`}
      >
        <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          {message.content}
        </div>
        <div
          className={`text-[11px] mt-1 ${
            isUser ? "text-blue-200" : "text-neutral-500"
          }`}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

interface ToolBlockProps {
  message: ChatMessageData;
}

function ToolUseBlock({ message }: ToolBlockProps) {
  const [expanded, setExpanded] = useState(false);

  const toolIcon = getToolIcon(message.tool || "");
  const toolColor = getToolColor(message.tool || "");

  return (
    <div className="mb-3 mx-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full text-left rounded-xl border ${toolColor} transition-all`}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-neutral-900/50 flex items-center justify-center">
            {toolIcon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-neutral-100">
              {formatToolName(message.tool || "")}
            </div>
            <div className="text-xs text-neutral-400 truncate">
              {getToolSummary(message.tool || "", message.params)}
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-neutral-500 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {expanded && message.params && (
        <div className="mt-1 mx-2 p-3 rounded-lg bg-neutral-900/80 border border-neutral-800">
          <pre className="text-xs text-neutral-400 overflow-x-auto">
            {JSON.stringify(message.params, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolResultBlock({ message }: ToolBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const hasLongResult = (message.result?.length || 0) > 200;
  const displayResult = expanded
    ? message.result
    : message.result?.slice(0, 200) + (hasLongResult ? "..." : "");

  return (
    <div className="mb-3 mx-2">
      <div
        className={`rounded-xl border ${
          message.isError
            ? "border-red-800 bg-red-950/30"
            : "border-neutral-700 bg-neutral-850"
        }`}
      >
        <div className="px-4 py-2 border-b border-neutral-700/50 flex items-center gap-2">
          {message.isError ? (
            <svg
              className="w-4 h-4 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ) : (
            <svg
              className="w-4 h-4 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
          <span className="text-xs font-medium text-neutral-400">
            {message.isError ? "Error" : "Result"}
          </span>
        </div>
        <div className="p-3">
          <pre
            className={`text-xs overflow-x-auto whitespace-pre-wrap break-words ${
              message.isError ? "text-red-300" : "text-neutral-300"
            }`}
          >
            {displayResult}
          </pre>
          {hasLongResult && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatToolName(tool: string): string {
  return tool
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function getToolSummary(
  tool: string,
  params?: Record<string, unknown>
): string {
  if (!params) return "";

  switch (tool.toLowerCase()) {
    case "read":
      return params.file_path as string || "";
    case "write":
    case "edit":
      return params.file_path as string || "";
    case "bash":
      return (params.command as string)?.slice(0, 50) || "";
    case "glob":
      return params.pattern as string || "";
    case "grep":
      return params.pattern as string || "";
    case "webfetch":
      return params.url as string || "";
    default:
      return Object.values(params)[0]?.toString().slice(0, 40) || "";
  }
}

function getToolIcon(tool: string): JSX.Element {
  const iconClass = "w-4 h-4";

  switch (tool.toLowerCase()) {
    case "read":
      return (
        <svg
          className={`${iconClass} text-blue-400`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    case "write":
      return (
        <svg
          className={`${iconClass} text-green-400`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      );
    case "edit":
      return (
        <svg
          className={`${iconClass} text-yellow-400`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      );
    case "bash":
      return (
        <svg
          className={`${iconClass} text-purple-400`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      );
    case "glob":
    case "grep":
      return (
        <svg
          className={`${iconClass} text-cyan-400`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      );
    case "webfetch":
    case "websearch":
      return (
        <svg
          className={`${iconClass} text-orange-400`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
          />
        </svg>
      );
    default:
      return (
        <svg
          className={`${iconClass} text-neutral-400`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      );
  }
}

function getToolColor(tool: string): string {
  switch (tool.toLowerCase()) {
    case "read":
      return "border-blue-800/50 bg-blue-950/30";
    case "write":
      return "border-green-800/50 bg-green-950/30";
    case "edit":
      return "border-yellow-800/50 bg-yellow-950/30";
    case "bash":
      return "border-purple-800/50 bg-purple-950/30";
    case "glob":
    case "grep":
      return "border-cyan-800/50 bg-cyan-950/30";
    case "webfetch":
    case "websearch":
      return "border-orange-800/50 bg-orange-950/30";
    default:
      return "border-neutral-700 bg-neutral-800/50";
  }
}
