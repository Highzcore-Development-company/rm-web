"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";

/**
 * HS-BOT-v4 §3 — Scora, connected.
 *
 * Replaces the shell whose input was disabled with the line "Scora answers
 * once the model is connected". It is connected now.
 *
 * STREAMS. A spinner for fifteen seconds feels broken, so the answer appears
 * as it is written. The text is appended to the live turn rather than
 * re-rendered from scratch, so the panel does not jump while it arrives.
 *
 * The conversation is stored server-side and the id travels on a response
 * header, so a refresh resumes rather than starting again.
 *
 * THE DISCLAIMER IS ALWAYS VISIBLE, not shown once and dismissed. It is the
 * sentence that keeps "Scora told me to buy" from being a reasonable reading
 * of this panel.
 */

type Turn = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What is EURUSD doing right now?",
  "Which markets is the bot watching?",
  "Explain what the trend state means",
];

export function ScoraChat({ name }: { name: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationId = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Follows the answer down as it streams, but only while it is streaming —
  // yanking the view while somebody is reading back is worse than not
  // scrolling at all.
  useEffect(() => {
    if (sending) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, sending]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || sending) return;

    setError(null);
    setQuestion("");
    setTurns((t) => [...t, { role: "user", content: q }, { role: "assistant", content: "" }]);
    setSending(true);

    try {
      const res = await fetch("/api/scora/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, conversationId: conversationId.current }),
      });

      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(messageFor(body.error, res.status));
        // The empty assistant turn is removed: an answer bubble that never
        // fills reads as Scora having nothing to say.
        setTurns((t) => t.slice(0, -1));
        return;
      }

      conversationId.current = res.headers.get("X-Conversation-Id") ?? conversationId.current;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setTurns((t) => {
          const next = [...t];
          next[next.length - 1] = {
            role: "assistant",
            content: next[next.length - 1].content + chunk,
          };
          return next;
        });
      }

      // A stream that ended with nothing in it is a failure, not an answer.
      setTurns((t) =>
        t[t.length - 1]?.content.trim() ? t : t.slice(0, -1),
      );
    } catch {
      setError("The connection dropped before Scora finished. Ask again.");
      setTurns((t) => t.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  const empty = turns.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-brand-fg">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-5 text-xl font-semibold">Welcome back.</p>
            <p className="mt-0.5 text-xs text-fg-subtle">{name}</p>
            <p className="mt-4 text-sm text-fg-muted">
              Ask about any market the bot follows.
            </p>

            <div className="mt-6 w-full max-w-sm space-y-2.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="w-full rounded-lg border border-border bg-bg-elevated px-4 py-3 text-left text-sm text-fg-muted transition-colors hover:border-brand hover:text-fg"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "text-right" : ""}>
                <div
                  className={`inline-block max-w-[92%] rounded-xl px-3.5 py-2.5 text-left text-sm leading-relaxed ${
                    t.role === "user"
                      ? "bg-brand/15 text-fg"
                      : "border border-border bg-bg-elevated text-fg-muted"
                  }`}
                >
                  {/* whitespace-pre-wrap: the model writes paragraphs and
                      lists, and collapsing them makes a long answer unreadable. */}
                  <p className="whitespace-pre-wrap">
                    {t.content}
                    {t.role === "assistant" && !t.content && sending && (
                      <span className="inline-block animate-pulse">▍</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs"
          >
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-4">
        <form
          className="flex items-center gap-2 rounded-xl border border-border bg-bg-elevated px-3 py-2.5 focus-within:border-brand"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={sending}
            placeholder={sending ? "Scora is answering…" : "Ask Scora…"}
            aria-label="Ask Scora"
            className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-fg-subtle focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !question.trim()}
            aria-label="Send"
            className="shrink-0 text-fg-subtle transition-colors hover:text-brand disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>

        {/* Always on screen. Scora describes a market; the person decides. */}
        <p className="mt-2 text-center text-[11px] text-fg-subtle">
          Scora describes what a market is doing. You make the decision. AI can
          make mistakes.
        </p>
      </div>
    </div>
  );
}

/** Provider wording never reaches a trader; these are ours. */
function messageFor(code: string | undefined, status: number): string {
  if (status === 402 || code === "not_subscribed") {
    return "Scora is part of the subscription. Start one to ask it anything.";
  }
  if (code === "not_configured") {
    return "Scora is not connected to its model yet.";
  }
  if (code === "too_long") return "That question is too long — try a shorter one.";
  if (status === 401) return "Your session has expired. Sign in again.";
  return "Scora could not answer just then. Try again.";
}
