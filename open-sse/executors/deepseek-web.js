// DeepSeekWebExecutor — chat.deepseek.com web API (Bearer userToken, PoW-gated).
//
// The web endpoint (`/api/v0/chat/completion`) accepts only a flat `prompt` string
// guarded by a DeepSeekHashV1 proof-of-work header; auth is the `userToken` from
// DeepSeek localStorage exchanged for a short-lived access token via /users/current.
import { BaseExecutor } from "./base.js";
import { SSE_HEADERS_NO_BUFFER } from "../utils/sseConstants.js";
import {
  serializeDeepSeekToolPrompt,
  buildToolConversationPrompt,
} from "../translator/deepseekWebTools.js";
import { solvePow, getPowChallenge, sendPowCompletion } from "./deepseek-web/powSolver.js";
import {
  DEEPSEEK_WEB_BASE,
  COMPLETION_URL,
  FAKE_HEADERS,
  tokenCache,
  sessionCache,
  extractUserToken,
  acquireAccessToken,
  parseDeepSeekErrorPayload,
  createSession,
  deleteSessionOnDeepSeek,
  acquireSession,
  dropCachedSession,
  cacheSession,
  errorResponse,
  resolveModelOptions,
  messagesToPrompt,
} from "./deepseek-web/sessionAuth.js";
import {
  transformSSE,
  collectSSEContent,
  wrapStreamWithCleanup,
  handleToolCalls,
} from "./deepseek-web/sseParser.js";

// ── Executor ─────────────────────────────────────────────────────────────

export class DeepSeekWebExecutor extends BaseExecutor {
  constructor() {
    super("deepseek-web", { baseUrl: DEEPSEEK_WEB_BASE });
  }

  async testConnection(credentials, signal) {
    try {
      const userToken = extractUserToken(credentials);
      if (!userToken) return false;
      const accessToken = await acquireAccessToken(userToken, signal);
      return !!accessToken;
    } catch {
      return false;
    }
  }

  async execute({ model, body, stream, credentials, signal, log }) {
    const bodyObj = body || {};

    const requestedTools = bodyObj.tools;
    const hasTools = Array.isArray(requestedTools) && requestedTools.length > 0;
    const toolSystemPrompt = hasTools ? serializeDeepSeekToolPrompt(requestedTools) : "";

    const messages = Array.isArray(bodyObj.messages) ? bodyObj.messages : [];
    const promptMessages = toolSystemPrompt
      ? [{ role: "system", content: toolSystemPrompt }, ...messages]
      : messages;
    const rawCreds = credentials ?? {};

    const userToken = extractUserToken(rawCreds);
    if (!userToken) {
      return {
        response: errorResponse(
          400,
          "Missing userToken — paste it from DeepSeek localStorage " +
            "(DevTools → Application → Local Storage → chat.deepseek.com → userToken)"
        ),
        url: COMPLETION_URL,
        headers: {},
        transformedBody: body,
      };
    }

    const { modelType, thinkingEnabled, searchEnabled } = resolveModelOptions(model, bodyObj);

    const psd = rawCreds.providerSpecificData ?? {};
    const persistSession = psd.persistSession === true;
    const historyWindow =
      typeof psd.historyWindow === "number" && psd.historyWindow > 0 ? psd.historyWindow : 0;

    try {
      let t0 = Date.now();
      const accessToken = await acquireAccessToken(userToken, signal, log);
      log?.info?.("DEEPSEEK-WEB", `Token acquired in ${Date.now() - t0}ms`);

      const prompt = hasTools
        ? buildToolConversationPrompt(messages, toolSystemPrompt)
        : messagesToPrompt(promptMessages, historyWindow);
      log?.info?.(
        "DEEPSEEK-WEB",
        `model_type=${modelType}, thinking=${thinkingEnabled}, search=${searchEnabled}, stream=${stream !== false}, persist=${persistSession}, window=${historyWindow}`
      );

      const performCompletion = (sid, completionPrompt = prompt) =>
        sendPowCompletion({
          accessToken,
          sessionId: sid,
          prompt: completionPrompt,
          modelType,
          thinkingEnabled,
          searchEnabled,
          refFileIds: bodyObj.ref_file_ids,
          signal,
        });

      t0 = Date.now();
      let { sessionId, reused: reusedSession } = await acquireSession({
        userToken,
        accessToken,
        persistSession,
        signal,
      });
      log?.info?.(
        "DEEPSEEK-WEB",
        `Session ${reusedSession ? "reused" : "created"} in ${Date.now() - t0}ms`
      );

      t0 = Date.now();
      log?.info?.("DEEPSEEK-WEB", `POST ${COMPLETION_URL}`);
      let { resp, reqHeaders, requestPayload } = await performCompletion(sessionId);
      log?.info?.(
        "DEEPSEEK-WEB",
        `Completion response in ${Date.now() - t0}ms, status=${resp.status}`
      );

      if (!resp.ok && persistSession && reusedSession) {
        log?.warn?.("DEEPSEEK-WEB", "Reused session failed — retrying with a fresh session");
        dropCachedSession(userToken);
        sessionId = await createSession(accessToken, signal);
        cacheSession(userToken, sessionId);
        reusedSession = false;
        ({ resp, reqHeaders, requestPayload } = await performCompletion(sessionId));
      }

      if (!resp.ok) {
        const status = resp.status;
        let errMsg = `DeepSeek API error (${status})`;
        if (status === 401 || status === 403) {
          tokenCache.delete(userToken);
          errMsg = "DeepSeek token expired — get a fresh userToken from localStorage.";
        } else if (status === 429) {
          errMsg = "DeepSeek rate limited. Wait and retry.";
        }
        log?.warn?.("DEEPSEEK-WEB", errMsg);

        try {
          const errBody = await resp.json();
          if (errBody?.code && errBody.code !== 0) {
            errMsg = `DeepSeek error ${errBody.code}: ${errBody.msg}`;
          }
        } catch {
          /* ignore */
        }

        if (persistSession) dropCachedSession(userToken);
        deleteSessionOnDeepSeek(accessToken, sessionId).catch(() => {});
        return {
          response: errorResponse(status, errMsg),
          url: COMPLETION_URL,
          headers: reqHeaders,
          transformedBody: requestPayload,
        };
      }

      const ct = resp.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try {
          const json = await resp.json();
          const parsed = parseDeepSeekErrorPayload(json);
          if (parsed) {
            const errMsg = `DeepSeek error ${parsed.code}: ${parsed.message}`;
            log?.warn?.("DEEPSEEK-WEB", errMsg);
            const status = parsed.code === 40003 ? 401 : parsed.code === 40002 ? 429 : 502;
            if (parsed.code === 40003) {
              tokenCache.delete(userToken);
            }
            if (persistSession) dropCachedSession(userToken);
            deleteSessionOnDeepSeek(accessToken, sessionId).catch(() => {});
            return {
              response: errorResponse(status, errMsg, parsed.code),
              url: COMPLETION_URL,
              headers: reqHeaders,
              transformedBody: requestPayload,
            };
          }
          if (!persistSession) deleteSessionOnDeepSeek(accessToken, sessionId).catch(() => {});
          return {
            response: new Response(JSON.stringify(json), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
            url: COMPLETION_URL,
            headers: reqHeaders,
            transformedBody: requestPayload,
          };
        } catch {
          /* not JSON, continue */
        }
      }

      const cleanupFn = persistSession
        ? async () => {}
        : () => deleteSessionOnDeepSeek(accessToken, sessionId);

      const clientModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-web";

      if (hasTools) {
        const createFreshSession = async () => {
          dropCachedSession(userToken);
          await deleteSessionOnDeepSeek(accessToken, sessionId).catch(() => {});
          const freshId = await createSession(accessToken, signal);
          if (persistSession) cacheSession(userToken, freshId);
          sessionId = freshId;
          return freshId;
        };

        return handleToolCalls({
          resp,
          clientModel,
          requestedTools,
          prompt,
          performCompletion,
          createFreshSession,
          cleanupFn,
          stream: stream !== false,
          reqHeaders,
          requestPayload,
          log,
        });
      }

      if (stream !== false) {
        const openaiStream = transformSSE(resp.body, clientModel);
        const wrappedStream = wrapStreamWithCleanup(openaiStream, cleanupFn);
        return {
          response: new Response(wrappedStream, {
            status: 200,
            headers: { ...SSE_HEADERS_NO_BUFFER },
          }),
          url: COMPLETION_URL,
          headers: reqHeaders,
          transformedBody: requestPayload,
        };
      }

      const { content, reasoningContent } = await collectSSEContent(resp.body, clientModel);
      await cleanupFn();
      const message = { role: "assistant", content };
      if (reasoningContent) message.reasoning_content = reasoningContent;
      const openaiResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: model || modelType,
        choices: [
          {
            index: 0,
            message,
            finish_reason: "stop",
            logprobs: null,
          },
        ],
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log?.error?.("DEEPSEEK-WEB", `Execute failed: ${msg}`);

      if (err instanceof Error && err.name === "AbortError") {
        return {
          response: errorResponse(499, "Request cancelled"),
          url: COMPLETION_URL,
          headers: {},
          transformedBody: body,
        };
      }

      return {
        response: errorResponse(502, `DeepSeek error: ${msg}`),
        url: COMPLETION_URL,
        headers: {},
        transformedBody: body,
      };
    }
  }
}

export const deepseekWebExecutor = new DeepSeekWebExecutor();

export {
  DEEPSEEK_WEB_BASE,
  extractUserToken,
  messagesToPrompt,
  acquireAccessToken,
  tokenCache,
  sessionCache,
  solvePow,
  getPowChallenge,
  FAKE_HEADERS,
};
