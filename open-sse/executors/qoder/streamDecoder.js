import { v4 as uuidv4 } from "uuid";
import { createHash } from "crypto";

import { SSE_DONE } from "../../utils/sseConstants.js";
import { HTTP_STATUS } from "../../config/runtimeConfig.js";
import {
  QODER_CONTEXT_TIER_ENV,
  getQoderStaticModelConfig,
} from "../../shared/qoder/constants.js";
import { getQoderModelConfig, resolveQoderModels } from "../../services/qoderModels.js";
import { OPENAI_BLOCK, CLAUDE_BLOCK } from "../../translator/schema/blocks.js";
import { encodeDataUri } from "../../translator/concerns/image.js";
import { createQoderSseCoalescer } from "../../shared/qoder/sse.js";
import { rewriteQoderMessageAttachments } from "../../shared/qoder/attachments.js";
import { resolveQoderContextTier, applyQoderContextTier } from "../../shared/qoder/contextTier.js";

/**
 * Hoist role:"system" messages out of the messages array (Qoder rejects
 * system in messages) and flatten multipart content arrays — EXCEPT image
 * blocks, which are preserved (see normalizeContent).
 */
export function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: [], systemText: "" };
  }
  const systemParts = [];
  const out = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    if (msg.role === "system") {
      const text = extractText(msg.content);
      if (text) systemParts.push(text);
      continue;
    }
    const cloned = { ...msg };
    cloned.content = normalizeContent(msg.content);
    out.push(cloned);
  }
  return { messages: out, systemText: systemParts.join("\n\n") };
}

/**
 * Normalize one message's content for Qoder.
 */
export function normalizeContent(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (!Array.isArray(content)) return String(content);

  const blocks = [];
  const textParts = [];
  let hasImage = false;

  const pushText = (text) => {
    if (!text) return;
    if (hasImage || blocks.length) blocks.push({ type: OPENAI_BLOCK.TEXT, text });
    else textParts.push(text);
  };

  const imageUrlOf = (item) => {
    if (typeof item.image_url === "string" && item.image_url) return item.image_url;
    if (typeof item.image_url?.url === "string" && item.image_url.url) return item.image_url.url;
    return null;
  };

  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const imageUrl = item.type === OPENAI_BLOCK.IMAGE_URL ? imageUrlOf(item) : null;
    if (imageUrl) {
      blocks.push({ type: OPENAI_BLOCK.IMAGE_URL, image_url: { url: imageUrl } });
      hasImage = true;
    } else if (item.type === CLAUDE_BLOCK.IMAGE && item.source) {
      // Claude base64/url image → OpenAI image_url equivalent.
      const src = item.source;
      const url = src.type === "base64" && src.data
        ? encodeDataUri(src.media_type || "image/png", src.data)
        : typeof src.url === "string" && src.url ? src.url : null;
      if (url) {
        blocks.push({ type: OPENAI_BLOCK.IMAGE_URL, image_url: { url } });
        hasImage = true;
      }
    } else if (item.type === OPENAI_BLOCK.FILE) {
      const name = item.file?.filename || item.file?.name || "file";
      pushText(`[file omitted: ${name} — Qoder reads documents via its file API, not inlined bytes]`);
    } else if (item.type === CLAUDE_BLOCK.DOCUMENT) {
      const name = item.title || "document";
      pushText(`[file omitted: ${name} — Qoder reads documents via its file API, not inlined bytes]`);
    } else if (typeof item.text === "string" && item.text) {
      pushText(item.text);
    }
  }

  if (!hasImage) return textParts.join("\n");
  // Prepend any text collected before the first image block.
  if (textParts.length) blocks.unshift({ type: OPENAI_BLOCK.TEXT, text: textParts.join("\n") });
  return blocks;
}

export function extractText(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    const parts = [];
    for (const item of content) {
      if (item && typeof item === "object") {
        if (item.type === "text" && typeof item.text === "string") {
          parts.push(item.text);
        } else if (typeof item.text === "string") {
          parts.push(item.text);
        }
      }
    }
    return parts.join("\n");
  }
  return String(content);
}

export function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) return extractText(m.content);
  }
  return "";
}

export function stableHash(prefix, ...parts) {
  const h = createHash("sha256");
  h.update(prefix);
  for (const p of parts) {
    h.update("\0");
    h.update(String(p ?? ""));
  }
  return h.digest("hex").slice(0, 16);
}

export function stableChatRecordId(model, messages, tools, maxTokens) {
  const h = createHash("sha256");
  h.update("qoder-record\0");
  h.update(String(model));
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    if (m.role) { h.update("\0"); h.update(m.role); }
    if (typeof m.content === "string" && m.content) {
      h.update("\0"); h.update(m.content);
    } else if (Array.isArray(m.content)) {
      h.update("\0");
      try { h.update(JSON.stringify(m.content)); } catch {}
    }
  }
  if (tools) {
    h.update("\0");
    try { h.update(JSON.stringify(tools)); } catch {}
  }
  h.update(`\0mt=${maxTokens}`);
  return h.digest("hex").slice(0, 16);
}

/**
 * Sleep that aborts with the caller's signal, so a client hanging up during a
 * long queue wait releases the request instead of holding it for the budget.
 */
export function sleep(ms, signal) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    let timer = null;
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

export function truncate(s, n) {
  return s && s.length > n ? `${s.slice(0, n)}...` : s || "";
}

/**
 * Map the OpenAI-style request body into the exact shape Qoder expects.
 */
export async function buildQoderRequestBody({ model, body, credentials, log, proxyOptions, signal, uploadFn = null, region = "intl" }) {
  const qoderKey = String(model || "").replace(/^qoder\//, "");

  let modelConfig = await getQoderModelConfig(credentials, qoderKey, { log, proxyOptions, signal, region });
  if (!modelConfig) {
    const refreshed = await resolveQoderModels(credentials, { forceRefresh: true, log, proxyOptions, signal, region });
    const retried = refreshed?.rawConfigs.get(qoderKey);
    if (retried) {
      modelConfig = { ...retried, key: qoderKey };
    } else {
      modelConfig = getQoderStaticModelConfig(qoderKey);
      if (!modelConfig) {
        throw new Error(
          `qoder: model_config for "${qoderKey}" not yet known (run a model list fetch or check upstream connectivity)`,
        );
      }
      log?.info?.("QODER", `using static model_config for "${qoderKey}" (absent from the account catalog)`);
    }
  }

  const incoming = Array.isArray(body.messages)
    ? body.messages.map((m) => {
      if (!m || typeof m !== "object") return m;
      return {
        ...m,
        content: Array.isArray(m.content)
          ? m.content.map((b) => (b && typeof b === "object" ? { ...b } : b))
          : m.content,
      };
    })
    : [];
  try {
    await rewriteQoderMessageAttachments(incoming, {
      credentials,
      log,
      proxyOptions,
      signal,
      uploadFn,
    });
  } catch (err) {
    log?.warn?.("QODER", `attachment rewrite failed: ${err.message}`);
  }

  const { messages, systemText } = normalizeMessages(incoming);
  const tools = body.tools;
  const isReasoning = !!modelConfig.is_reasoning;
  const maxOutputTokens = Number(modelConfig.max_output_tokens) || 0;

  let maxTokens = 32_768;
  if (maxOutputTokens > 0) maxTokens = maxOutputTokens;
  if (typeof body.max_tokens === "number" && body.max_tokens > 0 && body.max_tokens < maxTokens) {
    maxTokens = body.max_tokens;
  }
  if (typeof body.max_completion_tokens === "number" && body.max_completion_tokens > 0 && body.max_completion_tokens < maxTokens) {
    maxTokens = body.max_completion_tokens;
  }

  const lastUser = lastUserText(messages);
  const psd = credentials.providerSpecificData || {};
  const sessionId = stableHash("qoder-session", psd.userId, qoderKey);
  const recordId = stableChatRecordId(qoderKey, messages, tools, maxTokens);

  const tierChoice = resolveQoderContextTier(
    modelConfig,
    { system: systemText, messages, tools },
    { preference: process.env[QODER_CONTEXT_TIER_ENV] },
  );
  if (tierChoice) {
    log?.info?.(
      "QODER",
      `context tier ${tierChoice.tier.name} (${tierChoice.tier.tokenCount} tokens, ${tierChoice.reason}) for ~${tierChoice.estimatedTokens} prompt tokens`,
    );
  }

  const built = {
    qoderKey,
    payload: {
      request_id: uuidv4(),
      request_set_id: recordId,
      chat_record_id: recordId,
      session_id: sessionId,
      stream: true,
      chat_task: "FREE_INPUT",
      is_reply: true,
      is_retry: false,
      source: 1,
      version: "3",
      session_type: "qodercli",
      agent_id: "agent_common",
      task_id: "common",
      code_language: "",
      chat_prompt: "",
      image_urls: null,
      aliyun_user_type: "",
      system: systemText,
      messages,
      tools: Array.isArray(tools) ? tools : [],
      parameters: { max_tokens: maxTokens },
      chat_context: {
        chatPrompt: "",
        imageUrls: null,
        extra: {
          context: [],
          modelConfig: { key: qoderKey, is_reasoning: isReasoning },
          originalContent: lastUser,
        },
        features: [],
        text: lastUser,
      },
      model_config: modelConfig,
      business: {
        product: "cli",
        version: "1.0.0",
        type: "agent",
        stage: "start",
        id: uuidv4(),
        name: truncate(lastUser, 30),
        begin_at: Date.now(),
      },
    },
    modelConfig,
  };
  if (tierChoice) applyQoderContextTier(built.payload, tierChoice.tier);
  return built;
}

/**
 * Check if a qoder error message indicates a billing/quota block.
 */
export function isBillingBlock(inner) {
  if (!inner || typeof inner !== "string") return false;
  const lowerMsg = inner.toLowerCase();
  if (lowerMsg.includes("pricingurl")) return true;
  try {
    const parsed = JSON.parse(inner);
    const code = String(parsed?.code ?? "");
    if (code === "110" || code === "112") return true;
  } catch { /* not JSON — fall through to legacy shape match */ }
  return /"code"\s*:\s*"112"/.test(inner);
}

/**
 * Peek the first SSE data line to detect upstream errors before piping.
 */
export async function peekFirstQoderFrame(reader, decoder) {
  let consumed = "";
  let offset = 0;
  let upstreamDone = false;
  while (true) {
    let nl = consumed.indexOf("\n", offset);
    if (nl === -1 && !upstreamDone) {
      const { done, value } = await reader.read();
      upstreamDone = done;
      consumed += done ? decoder.decode() : decoder.decode(value, { stream: true });
      continue;
    }
    if (offset >= consumed.length) return { isError: false, consumed, upstreamDone };
    if (nl === -1) nl = consumed.length;

    const line = consumed.slice(offset, nl).replace(/\r$/, "").trim();
    offset = nl + 1;
    if (!line.startsWith("data:")) continue;

    const data = line.slice(5).trimStart();
    if (data === "[DONE]") return { isError: false, consumed, upstreamDone };

    let envelope;
    try { envelope = JSON.parse(data); } catch { return { isError: false, consumed, upstreamDone }; }

    const raw = Number(envelope?.statusCodeValue);
    const statusVal = Number.isNaN(raw) ? 200 : raw;
    const inner = typeof envelope?.body === "string"
      ? envelope.body
      : envelope?.body != null ? JSON.stringify(envelope.body) : "";

    if (statusVal !== 200) {
      return { isError: true, isBilling: isBillingBlock(inner), statusVal, message: inner || `upstream status ${statusVal}` };
    }
    return { isError: false, consumed, upstreamDone };
  }
}

/**
 * Wrap the upstream's `{statusCodeValue, body}` SSE envelope into plain
 * OpenAI SSE chunks the rest of the chatCore pipeline understands.
 */
export async function wrapQoderSSE(response, model, log = null) {
  if (!response.ok || !response.body) return response;

  const decoder = new TextDecoder();
  const reader = response.body.getReader();

  const peek = await peekFirstQoderFrame(reader, decoder);
  if (peek.isError) {
    await reader.cancel().catch(() => {});
    const status = peek.isBilling
      ? HTTP_STATUS.FORBIDDEN
      : Number.isInteger(peek.statusVal) && peek.statusVal >= HTTP_STATUS.BAD_REQUEST && peek.statusVal <= 599
        ? peek.statusVal : HTTP_STATUS.BAD_GATEWAY;
    return new Response(
      JSON.stringify({ error: { message: peek.message, code: peek.statusVal } }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }

  let buffer = peek.consumed || "";
  const upstreamDrained = peek.upstreamDone === true;
  const encoder = new TextEncoder();
  let doneEmitted = false;
  const coalescer = createQoderSseCoalescer({ model, encoder, sseDone: SSE_DONE });

  const syncDone = () => {
    if (coalescer.doneEmitted) doneEmitted = true;
  };

  const processLine = (line, controller) => {
    const trimmed = line.replace(/\r$/, "").trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("data:")) return;
    if (doneEmitted) return;

    const data = trimmed.slice(5).trimStart();
    if (data === "[DONE]") {
      coalescer.flush(controller);
      syncDone();
      return;
    }

    let envelope;
    try { envelope = JSON.parse(data); } catch { return; }
    const statusVal = Number(envelope.statusCodeValue) || 200;
    const inner = typeof envelope.body === "string"
      ? envelope.body
      : envelope.body != null ? JSON.stringify(envelope.body) : "";
    if (statusVal !== 200) {
      try {
        console.error(`[QODER] error envelope status=${statusVal} statusType=${typeof envelope.statusCodeValue} bodyType=${typeof envelope.body} body=${truncate(inner, 300)}`);
      } catch { /* logging must not break the stream */ }
      if (isBillingBlock(inner)) {
        const errObj = JSON.stringify({
          error: {
            message: inner || `qoder billing block (${statusVal})`,
            code: "qoder_billing_block",
            status: 403,
            type: "quota_error",
          },
        });
        controller.enqueue(encoder.encode(`data: ${errObj}\n\n`));
        controller.enqueue(encoder.encode(SSE_DONE));
        doneEmitted = true;
        return;
      }
      const msg = inner || `upstream status ${statusVal}`;
      const errChunk = JSON.stringify({
        id: `qoder-error-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: { content: `\n[qoder error ${statusVal}: ${truncate(msg, 200)}]` }, finish_reason: "stop" }],
      });
      controller.enqueue(encoder.encode(`data: ${errChunk}\n\n`));
      controller.enqueue(encoder.encode(SSE_DONE));
      doneEmitted = true;
      return;
    }
    if (!inner) return;
    coalescer.handleInner(inner, controller);
    syncDone();
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let nlSeed;
        while ((nlSeed = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nlSeed);
          buffer = buffer.slice(nlSeed + 1);
          processLine(line, controller);
          if (doneEmitted) {
            await reader.cancel().catch(() => {});
            controller.close();
            return;
          }
        }
        if (upstreamDrained) {
          buffer += decoder.decode();
          if (buffer.length > 0) {
            processLine(buffer, controller);
            buffer = "";
          }
        }

        while (!doneEmitted && !upstreamDrained) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            if (buffer.length > 0) {
              processLine(buffer, controller);
              buffer = "";
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            processLine(line, controller);
            if (doneEmitted) {
              await reader.cancel().catch(() => {});
              controller.close();
              return;
            }
          }
        }
      } catch {
        // fall through to terminal [DONE] + close
      } finally {
        if (!doneEmitted) {
          try {
            coalescer.flush(controller);
            doneEmitted = true;
          } catch { /* already closed */ }
        }
        try { controller.close(); } catch { /* already closed */ }
        await reader.cancel().catch(() => {});
      }
    },
    cancel() {
      return reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Reconstruct response stream from peeked bytes without resending the request.
 */
export function reconstructStreamFromPeek(sent, peek, reader) {
  return new Response(
    new ReadableStream({
      start(controller) {
        let closed = false;
        const finish = () => {
          if (closed) return;
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        };
        const push = (chunk) => {
          if (closed) return false;
          try {
            controller.enqueue(chunk);
            return true;
          } catch {
            closed = true;
            return false;
          }
        };

        const enc = new TextEncoder();
        if (peek.consumed && !push(enc.encode(peek.consumed))) return;
        if (peek.upstreamDone) {
          finish();
          return;
        }
        const pump = () => {
          if (closed) return;
          reader.read().then(({ done, value }) => {
            if (done) { finish(); return; }
            if (!push(value)) return;
            pump();
          }).catch(() => finish());
        };
        pump();
      },
      cancel() {
        return reader.cancel().catch(() => {});
      },
    }),
    { status: sent.response.status, statusText: sent.response.statusText, headers: sent.response.headers },
  );
}
