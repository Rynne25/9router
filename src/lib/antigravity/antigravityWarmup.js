import { ANTIGRAVITY_IDE_USER_AGENT, ANTIGRAVITY_IDE_VERSION } from "../../../open-sse/providers/shared.js";
import { exchangeRefreshToken, checkErrorAndVerification } from "./antigravityOAuth.js";

const GENERATE_CONTENT_ENDPOINT = "https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent";

/**
 * 5. warmupAccount(connection)
 * Sends prompt 'Say hi' (maxOutputTokens: 10) to gemini-3.8-flash-tiered/high to activate 7-day Weekly Quota Timer.
 *
 * @param {object} connection - Provider connection object
 * @returns {Promise<{ ok: boolean, model: string, text: string, activated: boolean, verification?: object }>}
 */
export async function warmupAccount(connection) {
  if (!connection) {
    throw new Error("Connection is required for warmup");
  }

  // Ensure fresh accessToken
  let accessToken = connection.accessToken;
  if (!accessToken && connection.refreshToken) {
    const tokens = await exchangeRefreshToken(connection.refreshToken);
    accessToken = tokens.access_token;
  }

  if (!accessToken) {
    throw new Error("No access token or refresh token available for connection warmup");
  }

  const projectId = connection.projectId || "";
  const candidateModels = ["gemini-3.8-flash-tiered", "gemini-3.8-flash-high"];
  let lastError = null;

  for (const model of candidateModels) {
    try {
      const payload = {
        project: projectId,
        model,
        userAgent: "antigravity",
        request: {
          contents: [
            {
              role: "user",
              parts: [{ text: "Say hi" }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 10,
          },
        },
      };

      const response = await fetch(GENERATE_CONTENT_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "User-Agent": ANTIGRAVITY_IDE_USER_AGENT,
          "X-Client-Name": "antigravity",
          "X-Client-Version": ANTIGRAVITY_IDE_VERSION,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData = null;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          // Ignore
        }
        const err = new Error(`Warmup failed on ${model} (${response.status}): ${errorText}`);
        err.status = response.status;
        err.data = errorData;
        lastError = err;

        // If 404 / model not found, try next candidate model
        if (response.status === 404 || errorText.includes("not found")) {
          continue;
        }

        const verification = checkErrorAndVerification(err);
        if (verification.isVerificationRequired) {
          return {
            ok: false,
            model,
            text: "",
            activated: false,
            error: err.message,
            verification,
          };
        }
        continue;
      }

      const data = await response.json();
      const text =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        data.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        "OK";

      return {
        ok: true,
        model,
        text: text.trim(),
        activated: true,
      };
    } catch (err) {
      lastError = err;
    }
  }

  const verification = checkErrorAndVerification(lastError);
  return {
    ok: false,
    model: candidateModels[0],
    text: "",
    activated: false,
    error: lastError?.message || "Warmup failed on all candidate models",
    verification,
  };
}
