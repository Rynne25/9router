import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import {
  QODER_CHAT_SIG_PATH,
  qoderInferenceBase,
} from "../../shared/qoder/constants.js";
import { isQoderPat, resolveQoderCredentials } from "../../services/qoderModels.js";
import { buildCosyHeaders, deriveMachineId } from "../../shared/qoder/cosy.js";
import {
  parseQoderQueueStatus,
  qoderQueueStatusUrl,
} from "../../shared/qoder/queue.js";

/**
 * Resolve provider region ("cn" or "intl").
 */
export function resolveQoderRegion(provider) {
  return provider === "qoder-cn" ? "cn" : "intl";
}

/**
 * Build signed inference chat URL.
 */
export function buildQoderUrl(credentials, region = "intl") {
  return `${qoderInferenceBase(credentials, region)}/algo${QODER_CHAT_SIG_PATH}?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1`;
}

/**
 * PAT (pt-...) → exchange for short-lived job token + resolve userId so
 * downstream COSY signing + catalog fetch work. Device tokens (dt-...) and
 * job tokens (jt-...) skip this and are returned directly.
 */
export async function exchangeQoderPatIfNeeded(credentials, proxyOptions, signal, region, log) {
  const rawToken = credentials?.apiKey || credentials?.accessToken;
  if (isQoderPat(rawToken)) {
    try {
      return await resolveQoderCredentials(credentials, proxyOptions, signal, region);
    } catch (err) {
      log?.error?.("QODER", `PAT exchange failed: ${err.message}`);
      throw err;
    }
  }
  return credentials;
}

/**
 * Poll the model-queue status endpoint qodercli uses. Returns
 * `{ endpointOk, info }`; endpointOk=false means "fall back to timed
 * replays" (endpoint missing, erroring, or answering an unknown shape).
 */
export async function fetchQueueStatus(credentials, region, psd, modelKey, queueType, requestSetId, requestId, sessionId, proxyOptions, signal) {
  const statusUrl = qoderQueueStatusUrl(qoderInferenceBase(credentials, region), {
    requestSetId,
    modelKey,
    queueType,
  });
  try {
    const statusResponse = await proxyAwareFetch(
      statusUrl,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "identity",
          // qodercli correlates the poll with the original inference.
          "X-Request-ID": requestId,
          "X-Session-ID": sessionId || "",
          ...buildCosyHeaders(Buffer.alloc(0), statusUrl, {
            userId: psd.userId,
            authToken: credentials.accessToken,
            name: credentials.displayName || "",
            email: credentials.email || "",
            machineId: psd.machineId || deriveMachineId(psd.userId),
          }),
        },
        signal,
      },
      proxyOptions,
    );
    if (!statusResponse.ok) return { endpointOk: false, info: null };
    const info = parseQoderQueueStatus(await statusResponse.text().catch(() => ""));
    return info ? { endpointOk: true, info } : { endpointOk: false, info: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { endpointOk: false, info: null };
  }
}
