import { BaseExecutor } from "./base.js";
import { PROVIDERS, PROVIDER_OAUTH } from "../config/providers.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import {
  AGENT_RUN_PATH,
  buildCursorExecutorHeaders,
  isAgentCapableRequest,
  buildAgentRunFrame,
  encodeKvClientMessage,
  tailOnlyCursorMessages,
} from "./cursor/wireFraming.js";
import {
  isHttp2Available,
  makeFetchRequest,
  makeHttp2Request,
  openAgentHttp2Stream,
} from "./cursor/h2Transport.js";
import { transformCursorRequest } from "./cursor/toolAdapter.js";
import {
  transformProtobufToJSON,
  transformProtobufToSSE,
  executeAgentSession,
} from "./cursor/streamParser.js";

export {
  isAgentCapableRequest,
  buildAgentRunFrame,
  encodeKvClientMessage,
  tailOnlyCursorMessages,
};

export class CursorExecutor extends BaseExecutor {
  constructor() {
    super("cursor", PROVIDERS.cursor);
  }

  buildUrl() {
    return `${this.config.baseUrl}${this.config.chatPath}`;
  }

  buildHeaders(credentials) {
    return buildCursorExecutorHeaders(credentials);
  }

  transformRequest(model, body, stream, credentials) {
    return transformCursorRequest(model, body, stream, credentials);
  }

  async makeFetchRequest(url, headers, body, signal, proxyOptions = null) {
    return makeFetchRequest(url, headers, body, signal, proxyOptions);
  }

  makeHttp2Request(url, headers, body, signal) {
    return makeHttp2Request(url, headers, body, signal);
  }

  openAgentHttp2Stream(url, headers, signal) {
    return openAgentHttp2Stream(url, headers, signal);
  }

  async executeAgent({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    return executeAgentSession(this, { model, body, stream, credentials, signal, log, proxyOptions });
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    if (isAgentCapableRequest(body)) {
      try {
        return await this.executeAgent({ model, body, stream, credentials, signal, log, proxyOptions });
      } catch (error) {
        return {
          response: new Response(JSON.stringify({
            error: { message: error.message, type: "connection_error", code: "" },
          }), { status: HTTP_STATUS.SERVER_ERROR, headers: { "Content-Type": "application/json" } }),
          url: `${PROVIDER_OAUTH.cursor?.agentEndpoint || ""}${AGENT_RUN_PATH}`,
          headers: {},
          transformedBody: body,
        };
      }
    }

    const url = this.buildUrl();
    const headers = this.buildHeaders(credentials);
    const transformedBody = this.transformRequest(model, body, stream, credentials);

    try {
      const shouldForceFetch = proxyOptions?.enabled === true || proxyOptions?.connectionProxyEnabled === true || !!proxyOptions?.vercelRelayUrl;
      const response = (isHttp2Available() && !shouldForceFetch)
        ? await this.makeHttp2Request(url, headers, transformedBody, signal)
        : await this.makeFetchRequest(url, headers, transformedBody, signal, proxyOptions);

      if (response.status !== 200) {
        const errorText = response.body?.toString() || "Unknown error";
        const errorResponse = new Response(JSON.stringify({
          error: {
            message: `[${response.status}]: ${errorText}`,
            type: "invalid_request_error",
            code: "",
          },
        }), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
        return { response: errorResponse, url, headers, transformedBody: body };
      }

      const transformedResponse = stream !== false
        ? this.transformProtobufToSSE(response.body, model, body)
        : this.transformProtobufToJSON(response.body, model, body);

      return { response: transformedResponse, url, headers, transformedBody: body };
    } catch (error) {
      const errorResponse = new Response(JSON.stringify({
        error: {
          message: error.message,
          type: "connection_error",
          code: "",
        },
      }), {
        status: HTTP_STATUS.SERVER_ERROR,
        headers: { "Content-Type": "application/json" },
      });
      return { response: errorResponse, url, headers, transformedBody: body };
    }
  }

  transformProtobufToJSON(buffer, model, body) {
    return transformProtobufToJSON(buffer, model, body);
  }

  transformProtobufToSSE(buffer, model, body) {
    return transformProtobufToSSE(buffer, model, body);
  }

  async refreshCredentials() {
    return null;
  }
}

export default CursorExecutor;
