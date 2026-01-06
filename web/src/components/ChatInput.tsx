import { useState, useRef, useEffect } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onAbort: () => void;
  disabled?: boolean;
  isThinking?: boolean;
}

export function ChatInput({
  onSend,
  onAbort,
  disabled,
  isThinking,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [message]);

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setMessage("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-neutral-700 bg-neutral-900 px-4 py-3 safe-area-pb">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isThinking ? "Claude is thinking..." : "Message Claude..."}
            disabled={disabled || isThinking}
            rows={1}
            className="w-full resize-none rounded-2xl bg-neutral-800 border border-neutral-700
                       px-4 py-3 pr-12 text-neutral-100 placeholder-neutral-500
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       disabled:opacity-50 disabled:cursor-not-allowed
                       text-[16px] leading-relaxed"
            style={{ minHeight: "48px" }}
          />
        </div>

        {isThinking ? (
          <button
            onClick={onAbort}
            className="flex-shrink-0 w-12 h-12 rounded-full bg-red-600 hover:bg-red-500
                       text-white flex items-center justify-center transition-colors"
            aria-label="Stop"
          >
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || disabled}
            className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500
                       text-white flex items-center justify-center transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
            aria-label="Send"
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
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
