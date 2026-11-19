import { SSE_DONE, SSE_HEADERS_NO_BUFFER } from "../../utils/sseConstants.js";
import { sseChunk } from "../../utils/sse.js";
import {
  parseDeepSeekToolCalls,
  hasMalformedDeepSeekToolIntent,
  hasMalformedDeepSeekToolMarkup,
} from "../../translator/deepseekWebTools.js";
import {
  isThinkingModel,
  isSearchModel,
  formatStreamContent,
  appendSearchCitations,
} from "./stream-format.js";
import {
  createFinishOnceGuard,
  createFinishedDrainScheduler,
} from "../deepseek-web-done-terminator.js";
import { COMPLETION_URL, errorResponse } from "./sessionAuth.js";

// ── SSE Transform (DeepSeek → OpenAI) ───────────────────────────────────

export function transformSSE(deepseekStream, model) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const streamModel = model || "deepseek-web";
  const id = `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created = Math.floor(Date.now() / 1000);
  let emittedRole = false;
  let currentPath = "";
  const thinkingModel = isThinkingModel(streamModel);
  const searchResults = [];

  return new ReadableStream(
    {
      async start(controller) {
        const reader = deepseekStream.getReader();
        let buffer = "";

        const chunk = (delta, finish) => {
          controller.enqueue(
            encoder.encode(
              sseChunk({
                id,
                object: "chat.completion.chunk",
                created,
                model: streamModel,
                system_fingerprint: null,
                choices: [{ index: 0, delta, finish_reason: finish ?? null, logprobs: null }],
              })
            )
          );
        };

        const ensureRole = () => {
          if (!emittedRole) {
            emittedRole = true;
            chunk({ role: "assistant", content: "" });
          }
        };

        const { finishOnce: finishStream, hasFinished } = createFinishOnceGuard(() => {
          const citations = appendSearchCitations(searchResults, streamModel);
          if (citations) {
            ensureRole();
            chunk({ content: `\n\n${citations}` });
          }
          ensureRole();
          chunk({}, "stop");
          controller.enqueue(encoder.encode(SSE_DONE));
          controller.close();
        });

        // Do not close *immediately* on FINISHED — DeepSeek may still send
        // search_results afterward. Drain briefly, then always emit
        // stop + [DONE] so clients do not hang if the upstream body stays open.
        const { scheduleFinishAfterDrain, clearFinishedDrain, isDrainPending } =
          createFinishedDrainScheduler(finishStream);

        const sendByPath = (raw) => {
          const text = formatStreamContent(raw, streamModel);
          if (!text) return;
          ensureRole();
          let path = currentPath;
          if (!path && thinkingModel) path = "thinking";
          else if (!path && isSearchModel(streamModel)) path = "content";
          if (path === "thinking") {
            chunk({ reasoning_content: text });
          } else {
            chunk({ content: text });
          }
        };

        const applyFragmentType = (frag) => {
          const type = String(frag?.type || "").toUpperCase();
          if (type === "THINK") currentPath = "thinking";
          else if (type === "ANSWER" || type === "RESPONSE") currentPath = "content";
        };

        const handleFragment = (frag, setPathFromType = false) => {
          if (setPathFromType) applyFragmentType(frag);
          if (typeof frag?.content !== "string" || frag.content.length === 0) return;
          if (!setPathFromType) {
            const type = String(frag?.type || "").toUpperCase();
            if (type === "THINK") currentPath = "thinking";
            else if (type === "ANSWER" || type === "RESPONSE") currentPath = "content";
          }
          sendByPath(frag.content);
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ") && !line.startsWith("data:")) continue;
              const payload = line.replace(/^data:\s*/, "").trim();

              if (payload === "[DONE]") {
                finishStream();
                return;
              }

              let data;
              try {
                data = JSON.parse(payload);
              } catch {
                continue;
              }

              const p = data?.p;
              const o = data?.o;
              const v = data?.v;

              if (v && typeof v === "object" && v.response) {
                if (v.response.thinking_enabled === true) currentPath = "thinking";
                else if (v.response.thinking_enabled === false) currentPath = "content";
                const fragments = v.response.fragments;
                if (Array.isArray(fragments)) {
                  for (const frag of fragments) handleFragment(frag, false);
                }
              }

              if (p === "response/fragments") {
                if (Array.isArray(v)) {
                  for (const frag of v) handleFragment(frag, true);
                } else if (v && typeof v === "object") {
                  handleFragment(v, true);
                }
              }

              if (p === "response" && Array.isArray(v)) {
                for (const entry of v) {
                  if (entry?.p === "response" && entry?.v?.thinking_enabled === true) {
                    currentPath = "thinking";
                  }
                }
              }

              if (p === "response/search_status") continue;

              if (p === "response/search_results" && Array.isArray(v)) {
                if (o !== "BATCH") {
                  searchResults.length = 0;
                  searchResults.push(...v);
                } else {
                  for (const op of v) {
                    const match = String(op?.p || "").match(/^(\d+)\/cite_index$/);
                    if (match) {
                      const index = parseInt(match[1], 10);
                      if (searchResults[index]) searchResults[index].cite_index = op.v;
                    }
                  }
                }
                continue;
              }

              if (typeof v === "string") {
                sendByPath(v);
              } else if (Array.isArray(v) && p === "response") {
                for (const entry of v) {
                  if (Array.isArray(entry?.v)) {
                    const joined = entry.v.map((item) => item?.content || "").join("");
                    if (joined) sendByPath(joined);
                  }
                }
              }

              if (p === "response/status" && v === "FINISHED") {
                scheduleFinishAfterDrain();
                continue;
              }

              // Any other post-FINISHED payload extends the drain window so we
              // still capture late search_results before closing.
              if (isDrainPending()) {
                scheduleFinishAfterDrain();
              }
            }
          }
        } catch (err) {
          clearFinishedDrain();
          if (!hasFinished()) {
            controller.error(err);
          }
          return;
        }

        finishStream();
      },
      cancel() {
        // Best-effort: the controller is already cancelled; nothing to finish.
      },
    },
    { highWaterMark: 16384 }
  );
}

export async function collectSSEContent(deepseekStream, model) {
  const decoder = new TextDecoder();
  const reader = deepseekStream.getReader();
  let buffer = "";
  let content = "";
  let reasoningContent = "";
  let currentPath = "";
  // Track whether DeepSeek actually signalled completion (`response/status: "FINISHED"`).
  // Without this, an upstream session drop (expired cookie, anti-bot challenge, network
  // hiccup) mid-stream was silently reported as a normal "stop" completion with whatever
  // partial content had arrived so far.
  let sawFinished = false;
  const streamModel = model || "deepseek-web";
  const thinkingModel = isThinkingModel(streamModel);
  const searchResults = [];

  const appendByPath = (raw) => {
    const text = formatStreamContent(raw, streamModel);
    if (!text) return;
    let path = currentPath;
    if (!path && thinkingModel) path = "thinking";
    else if (!path && isSearchModel(streamModel)) path = "content";
    if (path === "thinking") reasoningContent += text;
    else content += text;
  };

  const applyFragmentType = (frag) => {
    const type = String(frag?.type || "").toUpperCase();
    if (type === "THINK") currentPath = "thinking";
    else if (type === "ANSWER" || type === "RESPONSE") currentPath = "content";
  };

  const handleFragment = (frag, setPathFromType = false) => {
    if (setPathFromType) applyFragmentType(frag);
    if (typeof frag?.content !== "string" || frag.content.length === 0) return;
    if (!setPathFromType) {
      const type = String(frag?.type || "").toUpperCase();
      if (type === "THINK") currentPath = "thinking";
      else if (type === "ANSWER" || type === "RESPONSE") currentPath = "content";
    }
    appendByPath(frag.content);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ") && !line.startsWith("data:")) continue;
      const payload = line.replace(/^data:\s*/, "").trim();
      try {
        const data = JSON.parse(payload);
        const p = data?.p;
        const v = data?.v;

        if (p === "response/status" && v === "FINISHED") sawFinished = true;

        if (v && typeof v === "object" && v.response) {
          if (v.response.thinking_enabled === true) currentPath = "thinking";
          else if (v.response.thinking_enabled === false) currentPath = "content";
          if (Array.isArray(v.response.fragments)) {
            for (const frag of v.response.fragments) handleFragment(frag, false);
          }
        }

        if (p === "response/fragments") {
          if (Array.isArray(v)) {
            for (const frag of v) handleFragment(frag, true);
          } else if (v && typeof v === "object") {
            handleFragment(v, true);
          }
        }

        if (p === "response" && Array.isArray(v)) {
          for (const entry of v) {
            if (entry?.p === "response" && entry?.v?.thinking_enabled === true) {
              currentPath = "thinking";
            }
          }
        }

        if (p === "response/search_status") continue;

        if (p === "response/search_results" && Array.isArray(v)) {
          if (data?.o !== "BATCH") {
            searchResults.length = 0;
            searchResults.push(...v);
          } else {
            for (const op of v) {
              const match = String(op?.p || "").match(/^(\d+)\/cite_index$/);
              if (match) {
                const index = parseInt(match[1], 10);
                if (searchResults[index]) searchResults[index].cite_index = op.v;
              }
            }
          }
          continue;
        }

        if (typeof v === "string") {
          appendByPath(v);
        } else if (Array.isArray(v) && p === "response") {
          for (const entry of v) {
            if (Array.isArray(entry?.v)) {
              const joined = entry.v.map((item) => item?.content || "").join("");
              if (joined) appendByPath(joined);
            }
          }
        }
      } catch {
        // skip
      }
    }
  }

  const citations = appendSearchCitations(searchResults, streamModel);
  if (citations) content += `\n\n${citations}`;

  // The upstream HTTP body closed without ever sending `response/status: "FINISHED"`.
  // That means the DeepSeek web session was cut off mid-generation (expired cookie,
  // anti-bot challenge, network drop, etc.) rather than genuinely completing. Surface
  // this as an error (caught by execute()'s try/catch -> 502) instead of returning the
  // partial stub as a successful "stop" response.
  if (!sawFinished) {
    throw new Error(
      "DeepSeek web session ended before completion (no FINISHED signal received) — " +
        "likely a dropped cookie session or network interruption upstream. Retry the request."
    );
  }

  return { content, reasoningContent };
}

export function wrapStreamWithCleanup(responseStream, cleanup) {
  const reader = responseStream.getReader();
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        cleanup().catch(() => {});
        return;
      }
      controller.enqueue(value);
    },
    cancel() {
      reader.cancel();
      cleanup().catch(() => {});
    },
  });
}

/**
 * Build the executor result for a tool-translated reply. Emits OpenAI `tool_calls`
 * with `finish_reason: "tool_calls"` when tool calls were parsed, otherwise plain
 * content. Supports both streaming (synthetic SSE) and non-streaming clients.
 */
export function buildToolAwareOpenAIResult(opts) {
  const { stream, clientModel, content, reasoningContent, toolCalls, reqHeaders, requestPayload } =
    opts;
  const hasCalls = !!toolCalls && toolCalls.length > 0;
  const finishReason = hasCalls ? "tool_calls" : "stop";
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);

  if (stream) {
    const encoder = new TextEncoder();
    const emit = (controller, delta, finish) => {
      controller.enqueue(
        encoder.encode(
          sseChunk({
            id,
            object: "chat.completion.chunk",
            created,
            model: clientModel,
            system_fingerprint: null,
            choices: [{ index: 0, delta, finish_reason: finish, logprobs: null }],
          })
        )
      );
    };
    const sse = new ReadableStream({
      start(controller) {
        emit(controller, { role: "assistant", content: "" }, null);
        // Surrounding natural-language text (and reasoning) is emitted before the tool_calls
        // so a model reply that interleaves a plan with a call still reaches the client.
        if (reasoningContent) emit(controller, { reasoning_content: reasoningContent }, null);
        if (content) emit(controller, { content }, null);
        if (hasCalls) {
          emit(
            controller,
            {
              tool_calls: toolCalls.map((tc, i) => ({
                index: i,
                id: tc.id,
                type: "function",
                function: { name: tc.function.name, arguments: tc.function.arguments },
              })),
            },
            null
          );
        }
        emit(controller, {}, finishReason);
        controller.enqueue(encoder.encode(SSE_DONE));
        controller.close();
      },
    });
    return {
      response: new Response(sse, { status: 200, headers: { ...SSE_HEADERS_NO_BUFFER } }),
      url: COMPLETION_URL,
      headers: reqHeaders,
      transformedBody: requestPayload,
    };
  }

  const message = { role: "assistant", content: content || "" };
  if (reasoningContent) message.reasoning_content = reasoningContent;
  if (hasCalls) {
    message.tool_calls = toolCalls;
    if (!content) message.content = null;
  }
  const openaiResponse = {
    id,
    object: "chat.completion",
    created,
    model: clientModel,
    choices: [{ index: 0, message, finish_reason: finishReason, logprobs: null }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
  return {
    response: new Response(JSON.stringify(openaiResponse), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    url: COMPLETION_URL,
    headers: reqHeaders,
    transformedBody: requestPayload,
  };
}

/**
 * Handle tool calls parsing, DSML / malformed intent repair, and response serialization.
 */
export async function handleToolCalls({
  resp,
  clientModel,
  requestedTools,
  prompt,
  performCompletion,
  createFreshSession,
  cleanupFn,
  stream,
  reqHeaders,
  requestPayload,
  log,
}) {
  let { content, reasoningContent } = await collectSSEContent(resp.body, clientModel);
  let parsed = parseDeepSeekToolCalls(content, `call-${Date.now()}`, requestedTools);

  // DSML / malformed envelopes are explicit tool intent, not plain answers: retry once in a
  // fresh session. The reply goes through the same parser (fork DSML dialects stay nonce-
  // and schema-bound; the canonical <tool> envelope keeps the shared nonce policy).
  if (hasMalformedDeepSeekToolIntent(parsed.content, requestedTools)) {
    log?.warn?.("DEEPSEEK-WEB", "Malformed tool envelope — retrying once with nonce binding");
    const sessionId = await createFreshSession();
    const repairPrompt = [
      prompt,
      "Your previous response used an invalid tool envelope and was rejected.",
      "Retry the requested next action from scratch. Follow the client tool contract exactly, " +
        "including its _nonce binding and argument schema. Do not emit bare JSON or unbound DSML.",
    ].join("\n\n");
    const retry = await performCompletion(sessionId, repairPrompt);
    resp = retry.resp;
    reqHeaders = retry.reqHeaders;
    requestPayload = retry.requestPayload;
    if (!resp.ok) {
      await cleanupFn();
      return {
        response: errorResponse(502, "DeepSeek tool-call repair request failed."),
        url: COMPLETION_URL,
        headers: reqHeaders,
        transformedBody: requestPayload,
      };
    }
    ({ content, reasoningContent } = await collectSSEContent(resp.body, clientModel));
    parsed = parseDeepSeekToolCalls(content, `call-${Date.now()}`, requestedTools);
    if (hasMalformedDeepSeekToolMarkup(parsed.content)) {
      await cleanupFn();
      return {
        response: errorResponse(502, "DeepSeek emitted an invalid tool call after repair."),
        url: COMPLETION_URL,
        headers: reqHeaders,
        transformedBody: requestPayload,
      };
    }
  }

  await cleanupFn();
  return buildToolAwareOpenAIResult({
    stream,
    clientModel,
    content: parsed.content,
    reasoningContent,
    toolCalls: parsed.toolCalls,
    reqHeaders,
    requestPayload,
  });
}
