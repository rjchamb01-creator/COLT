"use client";

import { useEffect, useRef, useState } from "react";

type Role = "user" | "assistant";
type Message = { role: Role; content: string };

const GREETING =
  "I'm your COLT Coach. Ask me about drills, your next session, staying on top of your Heat — anything to sharpen up. What are we working on?";

// A few momentum-first prompts to get the conversation moving.
const SUGGESTIONS = [
  "Give me a 15-minute first-touch drill",
  "How do I keep my Heat alive?",
  "Tips before a big game",
];

export function CoachChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;

    // The history the model needs is everything except the local greeting.
    const history = messages.filter(
      (m, i) => !(i === 0 && m.role === "assistant"),
    );
    const next: Message[] = [...history, { role: "user", content: trimmed }];

    setMessages([...messages, { role: "user", content: trimmed }]);
    setInput("");
    setPending(true);

    // Add an empty assistant message we stream tokens into.
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      // Non-2xx (rate limit, auth, server) → the body is a friendly message;
      // show it verbatim instead of a generic error.
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "The coach hit a snag. Try again in a moment.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // Stream chunks into the last (assistant) message.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: copy[copy.length - 1].content + chunk,
          };
          return copy;
        });
      }
    } catch (e) {
      const text =
        e instanceof Error && e.message
          ? e.message
          : "The coach hit a snag. Catch your breath and try again.";
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: text };
        return copy;
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={scrollRef}
        className="flex h-[28rem] flex-col gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-4"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-signal text-ink"
                  : "border border-white/10 bg-white/[0.04] text-bone/90"
              }`}
            >
              {m.content || (
                <span className="inline-flex gap-1 text-steel">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse [animation-delay:150ms]">●</span>
                  <span className="animate-pulse [animation-delay:300ms]">●</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={pending}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-bone/75 transition-colors hover:border-signal/50 hover:text-signal disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          rows={1}
          placeholder="Ask your coach…"
          className="max-h-32 flex-1 resize-none rounded-2xl border border-white/15 bg-ink px-4 py-3 text-sm text-bone outline-none transition-colors placeholder:text-steel focus:border-signal"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-2xl bg-signal px-5 text-sm font-bold uppercase tracking-wide text-ink transition-transform hover:scale-[1.03] disabled:opacity-50 disabled:hover:scale-100"
        >
          {pending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
