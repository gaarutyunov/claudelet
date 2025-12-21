import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getChatWebSocketUrl, api } from "../lib/api";
import { MessageBubble, ChatMessageData } from "../components/ChatMessage";
import { ChatInput } from "../components/ChatInput";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface AuthStatus {
  loggedIn: boolean;
  userId: string;
}

interface SessionInfo {
  id: string;
  repo_name?: string;
  branch?: string;
  project_name?: string;
}

interface LoginResponse {
  loginUrl?: string;
  message?: string;
  success?: boolean;
  error?: string;
}

export function ChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<number>();

  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isClaudeLoggedIn, setIsClaudeLoggedIn] = useState<boolean | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Fetch session info and Claude auth status on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [authStatus, sessionData] = await Promise.all([
          api.get<AuthStatus>("/api/chat/auth-status"),
          sessionId ? api.get<{ session: SessionInfo }>(`/api/sessions/${sessionId}`) : null,
        ]);
        setIsClaudeLoggedIn(authStatus.loggedIn);
        if (sessionData) {
          setSessionInfo(sessionData.session);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        setIsClaudeLoggedIn(false);
      }
    };
    fetchData();
  }, [sessionId]);

  const handleClaudeLogin = useCallback(async () => {
    setIsLoggingIn(true);
    try {
      const response = await api.post<LoginResponse>("/api/chat/login");
      if (response.loginUrl) {
        // Open OAuth URL in new tab
        window.open(response.loginUrl, "_blank");
        // Add a message to guide the user
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: "system",
            content: "A new tab has been opened for Claude authentication. Complete the login there, then return here and send a message.",
            timestamp: Date.now(),
          },
        ]);
        // Check auth status after a delay
        setTimeout(async () => {
          const authStatus = await api.get<AuthStatus>("/api/chat/auth-status");
          setIsClaudeLoggedIn(authStatus.loggedIn);
          if (authStatus.loggedIn) {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                type: "system",
                content: "Successfully logged in to Claude! You can now start chatting.",
                timestamp: Date.now(),
              },
            ]);
          }
        }, 5000);
      } else if (response.success) {
        setIsClaudeLoggedIn(true);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: "system",
            content: "Already logged in to Claude!",
            timestamp: Date.now(),
          },
        ]);
      } else if (response.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            type: "error",
            content: `Login failed: ${response.error}`,
            timestamp: Date.now(),
          },
        ]);
      }
    } catch (error) {
      console.error("Login error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "error",
          content: `Failed to start login: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const connect = () => {
      const ws = new WebSocket(getChatWebSocketUrl(sessionId));
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch {
          console.error("Failed to parse message:", event.data);
        }
      };

      ws.onclose = (event) => {
        if (event.code === 4001) {
          setStatus("error");
          setTimeout(() => navigate("/login"), 2000);
        } else if (event.code !== 1000) {
          setStatus("disconnected");
          reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        setStatus("error");
      };
    };

    connect();

    // Ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      clearInterval(pingInterval);
      wsRef.current?.close();
    };
  }, [sessionId, navigate]);

  const handleMessage = useCallback((data: Record<string, unknown>) => {
    const msgType = data.type as string;

    switch (msgType) {
      case "status": {
        const status = data.status as string;
        setIsThinking(status === "thinking");
        break;
      }

      case "user":
      case "assistant":
      case "system":
      case "error": {
        const newMessage: ChatMessageData = {
          id: crypto.randomUUID(),
          type: msgType as ChatMessageData["type"],
          content: data.content as string,
          timestamp: (data.timestamp as number) || Date.now(),
        };
        setMessages((prev) => [...prev, newMessage]);
        break;
      }

      case "tool_use": {
        const newMessage: ChatMessageData = {
          id: crypto.randomUUID(),
          type: "tool_use",
          tool: data.tool as string,
          toolId: data.toolId as string,
          params: data.params as Record<string, unknown>,
          timestamp: (data.timestamp as number) || Date.now(),
        };
        setMessages((prev) => [...prev, newMessage]);
        break;
      }

      case "tool_result": {
        const newMessage: ChatMessageData = {
          id: crypto.randomUUID(),
          type: "tool_result",
          toolId: data.toolId as string,
          result: data.result as string,
          isError: data.isError as boolean,
          timestamp: (data.timestamp as number) || Date.now(),
        };
        setMessages((prev) => [...prev, newMessage]);
        break;
      }

      case "pong":
        // Ignore pong messages
        break;

      default:
        console.log("Unknown message type:", msgType, data);
    }
  }, []);

  const handleSend = useCallback((content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "user", content }));
    }
  }, []);

  const handleAbort = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "abort" }));
    }
  }, []);

  const statusColors = {
    connecting: "bg-yellow-500",
    connected: "bg-green-500",
    disconnected: "bg-neutral-500",
    error: "bg-red-500",
  };

  const statusLabels = {
    connecting: "Connecting...",
    connected: "Connected",
    disconnected: "Reconnecting...",
    error: "Error",
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-900">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-neutral-700 bg-neutral-900 safe-area-pt">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 -ml-2 text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-neutral-800"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-neutral-100">Claude</h1>
              {sessionInfo?.repo_name && sessionInfo?.branch && (
                <span className="px-2 py-0.5 text-xs bg-blue-900 text-blue-300 rounded-full">
                  {sessionInfo.repo_name}:{sessionInfo.branch}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${statusColors[status]}`} />
              <span className="text-xs text-neutral-500">{statusLabels[status]}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isThinking && (
            <div className="flex items-center gap-2 text-neutral-400">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <span className="text-xs">Thinking</span>
            </div>
          )}

          {isClaudeLoggedIn === false && (
            <button
              onClick={handleClaudeLogin}
              disabled={isLoggingIn}
              className="px-3 py-1.5 text-sm bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {isLoggingIn ? "..." : "Login"}
            </button>
          )}
          {isClaudeLoggedIn === true && (
            <div className="w-2 h-2 bg-green-500 rounded-full" title="Logged in to Claude" />
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 py-4">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && status === "connected" && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-800 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-neutral-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              {isClaudeLoggedIn === false ? (
                <>
                  <h2 className="text-lg font-medium text-neutral-300 mb-2">
                    Login to Claude
                  </h2>
                  <p className="text-sm text-neutral-500 max-w-sm mx-auto mb-4">
                    You need to authenticate with your Claude subscription to start chatting.
                  </p>
                  <button
                    onClick={handleClaudeLogin}
                    disabled={isLoggingIn}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                  >
                    {isLoggingIn ? "Starting login..." : "Login with Claude"}
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-medium text-neutral-300 mb-2">
                    Start a conversation
                  </h2>
                  <p className="text-sm text-neutral-500 max-w-sm mx-auto">
                    Ask Claude to help you with code, answer questions, or explore your workspace.
                  </p>
                </>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onAbort={handleAbort}
        disabled={status !== "connected"}
        isThinking={isThinking}
      />
    </div>
  );
}
