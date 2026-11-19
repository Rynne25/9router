import { solveDeepSeekPowAsync } from "../../lib/deepseek-pow.js";
import { requestDeepSeekPowChallenge } from "./pow.js";
import { FAKE_HEADERS, COMPLETION_URL, generateFakeCookie } from "./sessionAuth.js";

export { requestDeepSeekPowChallenge };

/**
 * Solve a DeepSeekHashV1 challenge and return base64-encoded PoW response.
 */
export async function solvePow(challenge, signal) {
  const answer = await solveDeepSeekPowAsync(
    challenge.algorithm,
    challenge.challenge,
    challenge.salt,
    challenge.difficulty,
    challenge.expire_at,
    { signal }
  );
  if (answer < 0) throw new Error("PoW solver failed");
  return Buffer.from(
    JSON.stringify({
      algorithm: challenge.algorithm,
      challenge: challenge.challenge,
      salt: challenge.salt,
      answer,
      signature: challenge.signature,
      target_path: challenge.target_path,
    })
  ).toString("base64");
}

export async function getPowChallenge(accessToken, signal, targetPath = "/api/v0/chat/completion") {
  return requestDeepSeekPowChallenge({ accessToken, headers: FAKE_HEADERS, signal, targetPath });
}

export async function sendPowCompletion({
  accessToken,
  sessionId,
  prompt,
  modelType,
  thinkingEnabled,
  searchEnabled,
  refFileIds = [],
  signal,
}) {
  const powChallenge = await getPowChallenge(accessToken, signal);
  const powAnswer = await solvePow(powChallenge, signal);
  const reqHeaders = {
    ...FAKE_HEADERS,
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-Ds-Pow-Response": powAnswer,
    "X-Client-Timezone-Offset": String(new Date().getTimezoneOffset() * -60),
    Cookie: generateFakeCookie(),
  };
  const requestPayload = {
    chat_session_id: sessionId,
    parent_message_id: null,
    model_type: modelType,
    prompt,
    ref_file_ids: Array.isArray(refFileIds) ? refFileIds : [],
    thinking_enabled: thinkingEnabled,
    search_enabled: searchEnabled,
    preempt: false,
  };
  const resp = await fetch(COMPLETION_URL, {
    method: "POST",
    headers: reqHeaders,
    body: JSON.stringify(requestPayload),
    signal: signal ?? undefined,
  });
  return { resp, reqHeaders, requestPayload };
}
