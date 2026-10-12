import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getInvestor } from "@/lib/investors";
import { getScoraContext, renderContext } from "@/lib/scora/context";
import { SCORA_SYSTEM_PROMPT, titleFrom } from "@/lib/scora/prompt";
import { envOr } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * HS-BOT-v4 §3 — Scora's server route.
 *
 * THE KEY STAYS HERE. It is read from the server environment, never prefixed
 * NEXT_PUBLIC_, and never sent to the browser — "not even once, not even in
 * development". The browser talks to this route; this route talks to Qwen.
 *
 * STREAMS, because a spinner for fifteen seconds feels broken. The answer is
 * forwarded token by token and only written to the database once it is
 * complete — a half-answer saved as though it were whole would be a transcript
 * that misquotes us.
 *
 * GATED TWICE, on purpose: can_use_scora() is checked here before a single
 * token is bought, and the same function guards every row through RLS. A URL
 * anybody can POST to needs the first check; the second is what makes it true
 * rather than merely enforced.
 */

/** Alibaba's OpenAI-compatible endpoint. Overridable for the Singapore region. */
const QWEN_BASE = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus";

/** Turns kept as history. Enough to follow a thread, bounded so cost cannot run. */
const HISTORY_TURNS = 10;
const MAX_QUESTION = 2_000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "signed_out" }, { status: 401 });
  }

  const apiKey = envOr(process.env.QWEN_API_KEY, "");
  if (!apiKey) {
    // Said plainly rather than failing oddly: the panel tells people Scora
    // answers once the model is connected, and this is that state.
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    question?: string;
    conversationId?: string;
  } | null;

  const question = (body?.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (question.length > MAX_QUESTION) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }

  // THE GATE, before anything is bought. The same function the RLS policies
  // call, so a change to one cannot leave the other behind.
  const { data: allowed } = await supabase.rpc("can_use_scora");
  if (allowed !== true) {
    return NextResponse.json({ error: "not_subscribed" }, { status: 402 });
  }

  const investor = await getInvestor(supabase);
  if (!investor) {
    return NextResponse.json({ error: "no_account" }, { status: 403 });
  }

  // ---- the thread -------------------------------------------------------

  let conversationId = body?.conversationId ?? null;

  if (conversationId) {
    // Confirm it is theirs. RLS would refuse the insert anyway, but failing
    // here gives a real answer instead of a write that quietly does nothing.
    const { data: owned } = await supabase
      .from("scora_conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!owned) conversationId = null;
  }

  if (!conversationId) {
    const { data: created, error } = await supabase
      .from("scora_conversations")
      .insert({ investor_id: investor.id, title: titleFrom(question) })
      .select("id")
      .maybeSingle();

    if (error || !created) {
      console.error("[scora] could not start a conversation:", error?.message);
      return NextResponse.json({ error: "generic" }, { status: 500 });
    }
    conversationId = created.id as string;
  }

  const { data: history } = await supabase
    .from("scora_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS);

  // The question is recorded BEFORE the model is called. If the call fails,
  // what they asked is still in the thread — losing their question because our
  // provider was down would be ours to explain and theirs to retype.
  await supabase
    .from("scora_messages")
    .insert({ conversation_id: conversationId, role: "user", content: question });

  // ---- the call ---------------------------------------------------------

  const ctx = await getScoraContext();
  const model = envOr(process.env.QWEN_MODEL, DEFAULT_MODEL);

  const messages = [
    { role: "system", content: SCORA_SYSTEM_PROMPT },
    { role: "system", content: renderContext(ctx, question) },
    ...(history ?? [])
      .slice()
      .reverse()
      .map((m) => ({ role: m.role as string, content: m.content as string })),
    { role: "user", content: question },
  ];

  let upstream: Response;
  try {
    upstream = await fetch(`${envOr(process.env.QWEN_API_BASE, QWEN_BASE)}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        // Usage arrives on the final chunk only when asked for. Without this
        // we would be guessing what a subscriber costs, which is the thing
        // the brief says to measure before finding out the expensive way.
        stream_options: { include_usage: true },
        temperature: 0.3,
      }),
    });
  } catch (err) {
    console.error("[scora] upstream unreachable:", err);
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    // The provider's own message is logged, never forwarded: it can contain
    // account details and it is not written for a trader to read.
    console.error("[scora] upstream refused:", upstream.status, await upstream.text().catch(() => ""));
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }

  // ---- stream it out, and bank it at the end ----------------------------

  const service = createServiceClient();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let answer = "";
      let promptTokens: number | null = null;
      let completionTokens: number | null = null;
      let buffer = "";

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // SSE frames are separated by a blank line and can split across
          // chunks — parsing per chunk drops tokens at the boundary.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta) {
                answer += delta;
                controller.enqueue(encoder.encode(delta));
              }
              if (json.usage) {
                promptTokens = json.usage.prompt_tokens ?? null;
                completionTokens = json.usage.completion_tokens ?? null;
              }
            } catch {
              // One malformed frame must not end a good answer mid-sentence.
            }
          }
        }
      } catch (err) {
        console.error("[scora] stream broke:", err);
      } finally {
        controller.close();

        // Written with the service client: the user's own session cannot
        // insert an assistant turn, and it should not be able to — a
        // transcript the reader can write is not evidence of anything.
        if (answer.trim()) {
          await service.from("scora_messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: answer,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            model,
          });
          await service
            .from("scora_conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", conversationId);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": conversationId,
    },
  });
}
