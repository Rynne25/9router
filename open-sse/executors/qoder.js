/**
 * QoderExecutor — sends OpenAI-format chat requests to Qoder's COSY-signed
 * inference endpoint at api3.qoder.sh, then unwraps Qoder's `{statusCodeValue,
 * body}` SSE envelope back into plain OpenAI SSE for the rest of the pipeline.
 */

import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { proxyAwareFetch } from "../utils/proxyFetch.js";
import { FETCH_CONNECT_TIMEOUT_MS, HTTP_STATUS } from "../config/runtimeConfig.js";
import { qoderEncodeBody } from "../shared/qoder/encoding.js";
import { buildCosyHeaders, deriveMachineId } from "../shared/qoder/cosy.js";
import {
  computeQoderQueueDelayMs,
  parseQoderQueueInfo,
  qoderQueueMaxWaitMs,
} from "../shared/qoder/queue.js";
import {
  resolveQoderRegion,
  buildQoderUrl,
  exchangeQoderPatIfNeeded,
  fetchQueueStatus,
} from "./qoder/jobTokenClient.js";
import {
  normalizeMessages,
  wrapQoderSSE,
  buildQoderRequestBody,
  isBillingBlock,
  peekFirstQoderFrame,
  reconstructStreamFromPeek,
  sleep,
} from "./qoder/streamDecoder.js";

export class QoderExecutor extends BaseExecutor {
  constructor(provider = "qoder") {
    super(provider, PROVIDERS[provider]);
    this.region = resolveQoderRegion(provider);
  }

  buildUrl(credentials) {
    return buildQoderUrl(credentials, this.region);
  }

  // Override execute entirely — Qoder needs:
  //   - body built from translated chat completion payload
  //   - body encoded with QoderEncodeBody before signing
  //   - COSY headers built from the *encoded* body bytes
  //   - response stream re-wrapped from {statusCodeValue, body} to OpenAI SSE
  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    try {
      credentials = await exchangeQoderPatIfNeeded(credentials, proxyOptions, signal, this.region, log);
    } catch (err) {
      const fakeResp = new Response(
        JSON.stringify({ error: { message: `qoder PAT exchange failed: ${err.message}` } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
      return { response: fakeResp, url: this.buildUrl(credentials), headers: {}, transformedBody: body };
    }

    const url = this.buildUrl(credentials);
    const psd = credentials?.providerSpecificData || {};
    if (!psd.userId) {
      const fakeResp = new Response(
        JSON.stringify({ error: { message: "qoder credential is missing userId; reconnect the account" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }
    if (!credentials?.accessToken) {
      const fakeResp = new Response(
        JSON.stringify({ error: { message: "qoder credential is missing accessToken; reconnect the account" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }

    let qoderKey;
    let payload;
    try {
      ({ qoderKey, payload } = await buildQoderRequestBody({ model, body, credentials, log, proxyOptions, signal, region: this.region }));
    } catch (err) {
      const fakeResp = new Response(
        JSON.stringify({ error: { message: err.message } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
      return { response: fakeResp, url, headers: {}, transformedBody: body };
    }

    const label = `${this.provider}/${qoderKey}`;

    /**
     * One signed attempt. COSY signs the body, so every replay needs a fresh
     * signature — reusing one reuses its requestId and upstream answers
     * 403/code 103.
     */
    const sendOnce = async (attemptPayload) => {
      const attemptPlain = Buffer.from(JSON.stringify(attemptPayload), "utf8");
      const attemptEncoded = Buffer.from(qoderEncodeBody(attemptPlain), "latin1");

      let attemptHeaders;
      try {
        attemptHeaders = buildCosyHeaders(attemptEncoded, url, {
          userId: psd.userId,
          authToken: credentials.accessToken,
          name: credentials.displayName || "",
          email: credentials.email || "",
          machineId: psd.machineId || deriveMachineId(psd.userId),
        });
      } catch (err) {
        const fakeResp = new Response(
          JSON.stringify({ error: { message: `qoder cosy signing failed: ${err.message}` } }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
        return { error: fakeResp, url, headers: {}, transformedBody: body };
      }

      const attemptHeadersFull = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Model-Key": qoderKey,
        "X-Model-Source": (attemptPayload.model_config && attemptPayload.model_config.source) || "system",
        "Accept-Encoding": "identity",
        ...attemptHeaders,
      };

      const timeoutMs = this.config?.timeoutMs || FETCH_CONNECT_TIMEOUT_MS;
      const connectCtrl = new AbortController();
      const connectTimer = setTimeout(() => connectCtrl.abort(new Error("fetch connect timeout")), timeoutMs);
      const mergedSignal = signal ? AbortSignal.any([signal, connectCtrl.signal]) : connectCtrl.signal;

      let response;
      try {
        response = await proxyAwareFetch(
          url,
          { method: "POST", headers: attemptHeadersFull, body: attemptEncoded, signal: mergedSignal },
          { ...proxyOptions, strictProxy: true },
        );
      } catch (err) {
        if (mergedSignal.aborted) throw mergedSignal.reason;
        throw err;
      } finally {
        clearTimeout(connectTimer);
      }

      return { response, url, headers: attemptHeadersFull, transformedBody: attemptPayload };
    };

    const maxQueueWaitMs = qoderQueueMaxWaitMs();
    const waitStartedAt = Date.now();
    let lastQueueInfo = null;
    let statusPollsEnabled = true;
    let readyReplayUsed = false;
    let attemptPayload = payload;

    for (;;) {
      const sent = await sendOnce(attemptPayload);
      if (sent.error) return { response: sent.error, url: sent.url, headers: sent.headers, transformedBody: sent.transformedBody };
      if (!sent.response.ok) {
        return { response: sent.response, url: sent.url, headers: sent.headers, transformedBody: sent.transformedBody };
      }

      const reader = sent.response.body.getReader();
      const decoder = new TextDecoder();
      const peek = await peekFirstQoderFrame(reader, decoder);

      const queueInfo = peek.isError
        ? parseQoderQueueInfo(peek.message || "")
        : null;

      if (!queueInfo) {
        if (peek.isError) {
          const status = peek.isBilling ? HTTP_STATUS.FORBIDDEN
            : Number.isInteger(peek.statusVal) && peek.statusVal >= 400 && peek.statusVal <= 599
              ? peek.statusVal : HTTP_STATUS.BAD_GATEWAY;
          return {
            response: new Response(
              JSON.stringify({ error: { message: peek.message || "qoder upstream error", code: peek.statusVal } }),
              { status, headers: { "Content-Type": "application/json" } },
            ),
            url: sent.url,
            headers: sent.headers,
            transformedBody: sent.transformedBody,
          };
        }
        const reconstructed = reconstructStreamFromPeek(sent, peek, reader);
        const wrapped = await wrapQoderSSE(reconstructed, label, log);
        return { response: wrapped, url: sent.url, headers: sent.headers, transformedBody: sent.transformedBody };
      }

      lastQueueInfo = queueInfo;
      const waitedMs = Date.now() - waitStartedAt;
      if (waitedMs >= maxQueueWaitMs) {
        log?.warn?.(
          "QODER",
          `model queue wait timed out after ${Math.round(waitedMs / 1000)}s for ${label} ` +
            `(queueType=${lastQueueInfo.queueType || "?"}, waitTime=${lastQueueInfo.waitTime ?? "?"}s)`,
        );
        const budgetResp = new Response(
          JSON.stringify({
            error: {
              message: `qoder model "${qoderKey}" is still queued after ${Math.round(waitedMs / 1000)}s ` +
                `(queueType=${lastQueueInfo.queueType || "?"}); retry shortly`,
              code: "qoder_model_queued",
              type: "rate_limit_error",
            },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
        return { response: budgetResp, url: sent.url, headers: sent.headers, transformedBody: sent.transformedBody };
      }

      let delayMs = computeQoderQueueDelayMs(queueInfo);

      if (statusPollsEnabled) {
        const requestSetId = attemptPayload.request_set_id;
        const polled = await fetchQueueStatus(
          credentials,
          this.region,
          psd,
          queueInfo.modelKey || qoderKey,
          queueInfo.queueType,
          requestSetId,
          attemptPayload.request_id,
          attemptPayload.session_id,
          proxyOptions,
          signal,
        );
        if (!polled.endpointOk) {
          statusPollsEnabled = false;
        } else if (polled.info.isQueued === false) {
          if (readyReplayUsed) {
            statusPollsEnabled = false;
            log?.info?.(
              "QODER",
              `queue status claims ready but "${qoderKey}" is still refused; falling back to timed replays`,
            );
          } else {
            readyReplayUsed = true;
            log?.info?.(
              "QODER",
              `model "${qoderKey}" reported ready (queueType=${polled.info.queueType || "?"}); replaying`,
            );
            delayMs = 0;
          }
        } else {
          delayMs = computeQoderQueueDelayMs(polled.info, { fromStatus: true });
          log?.info?.(
            "QODER",
            `model "${qoderKey}" still queued (queueType=${polled.info.queueType || "?"}, ` +
              `queueCount=${polled.info.queueCount ?? "?"}); rechecking in ${Math.round(delayMs / 1000)}s`,
          );
        }
      }

      if (delayMs > 0) await sleep(delayMs, signal);
    }
  }

  // Qoder device tokens don't refresh through OAuth — the upstream returns
  // 403 for our flow. Surfacing failure via 401-on-chat is enough; the
  // dashboard tells users to re-login when their token expires (~30 days).
  async refreshCredentials() {
    return null;
  }

  needsRefresh() {
    return false;
  }
}

export default QoderExecutor;

// Internals exposed for unit tests. Not part of the public API — callers
// should import QoderExecutor and use its public methods.
export const __test__ = {
  normalizeMessages,
  wrapQoderSSE,
  buildQoderRequestBody,
  isBillingBlock,
};
