import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { KIRO_ENDPOINT_FALLBACK_STATUSES } from "../config/kiroConstants.js";
import {
  buildAuthHeaders,
  getOrderedBaseUrls,
  refreshKiroCredentials
} from "./kiro/authHeaders.js";
import { transformKiroRequest } from "./kiro/requestBuilder.js";
import {
  attachIntegrityGate,
  runIntegrityRecovery,
  integrityFailureSSE,
  readRecoverableIntegrityAttempt,
  readIntegrityAttempt,
  transformEventStreamToSSE
} from "./kiro/eventStreamParser.js";

/**
 * KiroExecutor - Executor for Kiro AI (AWS CodeWhisperer)
 * Uses AWS CodeWhisperer streaming API with AWS EventStream binary format.
 * Facade class orchestrating auth, request transformation, eventStream parsing, and integrity recovery.
 */
export class KiroExecutor extends BaseExecutor {
  constructor() {
    super("kiro", PROVIDERS.kiro);
  }

  buildHeaders(credentials, stream = true, url = "") {
    return buildAuthHeaders(this.config.headers, credentials, stream, url);
  }

  /**
   * Auth-aware endpoint ordering.
   * API-key Kiro connections use the Amazon Q surface.
   */
  getOrderedBaseUrls(credentials) {
    return getOrderedBaseUrls(this.getBaseUrls(), credentials);
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    const baseUrls = this.getOrderedBaseUrls(credentials);
    return baseUrls[urlIndex] || baseUrls[0] || this.config.baseUrl;
  }

  // Retry only endpoint/auth-surface failures. Payload-invalid HTTP 400 must be
  // terminal: sending the same malformed body to every surface cannot repair it.
  shouldRetry(status, urlIndex) {
    const hasFallback = urlIndex + 1 < this.getFallbackCount();
    return super.shouldRetry(status, urlIndex)
      || (hasFallback && KIRO_ENDPOINT_FALLBACK_STATUSES.has(status));
  }

  transformRequest(model, body, stream, credentials) {
    return transformKiroRequest(model, body, stream, credentials);
  }

  /**
   * Kiro execute — delegate to BaseExecutor for endpoint fallback + retry, then
   * transform the binary AWS EventStream into OpenAI-shaped SSE on success.
   */
  async execute(args) {
    const result = await super.execute(args);
    if (result?.response?.ok) {
      // KIRO_INTEGRITY_GATE=off streams through, forfeiting the tool-call repair retry.
      if (process.env.KIRO_INTEGRITY_GATE === "off") {
        result.response = this.transformEventStreamToSSE(result.response, args.model, {
          toolSpecs: args.body?.conversationState?.currentMessage?.userInputMessage?.userInputMessageContext?.tools || []
        });
      } else {
        this.attachIntegrityGate(result, args);
      }
    }
    return result;
  }

  attachIntegrityGate(result, args) {
    return attachIntegrityGate(this, result, args);
  }

  runIntegrityRecovery(rawResponse, args, options) {
    return runIntegrityRecovery(this, rawResponse, args, options);
  }

  integrityFailureSSE(attempt) {
    return integrityFailureSSE(attempt);
  }

  readRecoverableIntegrityAttempt(rawResponse, model, options, attempt) {
    return readRecoverableIntegrityAttempt(this, rawResponse, model, options, attempt);
  }

  readIntegrityAttempt(rawResponse, model, options, attempt) {
    return readIntegrityAttempt(this, rawResponse, model, options, attempt);
  }

  transformEventStreamToSSE(response, model, options = {}) {
    return transformEventStreamToSSE(response, model, options);
  }

  async refreshCredentials(credentials, log, proxyOptions = null) {
    return refreshKiroCredentials(credentials, log, proxyOptions);
  }
}

export {
  buildAuthHeaders,
  getOrderedBaseUrls,
  refreshKiroCredentials,
  transformKiroRequest,
  attachIntegrityGate,
  runIntegrityRecovery,
  integrityFailureSSE,
  readRecoverableIntegrityAttempt,
  readIntegrityAttempt,
  transformEventStreamToSSE
};

export default KiroExecutor;
