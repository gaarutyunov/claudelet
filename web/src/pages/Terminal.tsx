import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { getWebSocketUrl } from "../lib/api";
import "@xterm/xterm/css/xterm.css";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const reconnectTimeoutRef = useRef<number>();

  useEffect(() => {
    if (!sessionId || !terminalRef.current) return;

    // Create terminal
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 14,
      fontFamily: "JetBrains Mono, Fira Code, monospace",
      theme: {
        background: "#1a1b26",
        foreground: "#c0caf5",
        cursor: "#c0caf5",
        cursorAccent: "#1a1b26",
        selectionBackground: "#33467c",
        black: "#15161e",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#a9b1d6",
        brightBlack: "#414868",
        brightRed: "#f7768e",
        brightGreen: "#9ece6a",
        brightYellow: "#e0af68",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#c0caf5",
      },
      allowProposedApi: true,
    });

    // Addons
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const unicodeAddon = new Unicode11Addon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(unicodeAddon);
    terminal.unicode.activeVersion = "11";

    terminal.open(terminalRef.current);
    fitAddon.fit();

    terminalInstance.current = terminal;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    const connect = () => {
      const ws = new WebSocket(getWebSocketUrl(sessionId));
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        terminal.focus();

        // Send initial resize
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case "output":
              terminal.write(message.data);
              break;
            case "connected":
              terminal.writeln("\x1b[32mConnected to Claudelet terminal\x1b[0m");
              terminal.writeln("Type 'claude' to start Claude Code\n");
              break;
            case "exit":
              terminal.writeln(`\n\x1b[33mProcess exited with code ${message.exitCode}\x1b[0m`);
              break;
            case "error":
              terminal.writeln(`\n\x1b[31mError: ${message.message}\x1b[0m`);
              break;
          }
        } catch {
          // Binary data - write directly
          terminal.write(event.data);
        }
      };

      ws.onclose = (event) => {
        if (event.code === 4001) {
          setStatus("error");
          terminal.writeln("\n\x1b[31mAuthentication failed. Please log in again.\x1b[0m");
          setTimeout(() => navigate("/login"), 2000);
        } else {
          setStatus("disconnected");
          terminal.writeln("\n\x1b[33mDisconnected. Reconnecting...\x1b[0m");
          reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        setStatus("error");
      };
    };

    connect();

    // Handle terminal input
    terminal.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
      }
    };

    window.addEventListener("resize", handleResize);

    // Ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      clearInterval(pingInterval);
      window.removeEventListener("resize", handleResize);
      wsRef.current?.close();
      terminal.dispose();
    };
  }, [sessionId, navigate]);

  const statusColors = {
    connecting: "bg-yellow-500",
    connected: "bg-green-500",
    disconnected: "bg-neutral-500",
    error: "bg-red-500",
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-neutral-700 bg-neutral-900">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="text-neutral-400 hover:text-white transition-colors"
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
          <h1 className="font-medium">Session {sessionId?.slice(0, 8)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
          <span className="text-sm text-neutral-400 capitalize">{status}</span>
        </div>
      </header>

      {/* Terminal */}
      <div ref={terminalRef} className="flex-1 bg-terminal-bg" />
    </div>
  );
}
