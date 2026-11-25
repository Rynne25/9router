const WEEKLY_KEYS = new Set(["gemini_weekly", "claude_gpt_weekly", "gemini_argon_weekly"]);
const SESSION_KEYS = new Set(["gemini_session", "claude_gpt_session", "gemini_argon_session"]);
const SUMMARY_KEYS = new Set([...WEEKLY_KEYS, ...SESSION_KEYS]);

function toQuotaRow(name, modelKey, quota) {
  return {
    name,
    modelKey,
    used: quota.used || 0,
    total: quota.total || 0,
    resetAt: quota.resetAt || null,
    remainingPercentage: quota.remainingPercentage,
  };
}

function pickMinRemainingQuota(models) {
  return models.reduce((min, cur) =>
    (cur[1].remainingPercentage ?? 100) < (min[1].remainingPercentage ?? 100) ? cur : min
  )[1];
}

/**
 * Normalize Antigravity provider quotas into family & standalone rows.
 * @param {Record<string, Object>} quotas
 * @returns {Array<Object>}
 */
export function parseAntigravityQuotas(quotas) {
  if (!quotas || typeof quotas !== "object") return [];

  const normalizedQuotas = [];
  const entries = Object.entries(quotas);
  const argonModels = entries.filter(
    ([k]) => k.startsWith("gemini-") && (k.includes("argon") || k.includes("neon")),
  );
  const geminiModels = entries.filter(
    ([k]) =>
      k.startsWith("gemini-") &&
      !k.includes("image") &&
      !k.includes("argon") &&
      !k.includes("neon") &&
      !k.includes("orchestrator"),
  );
  const claudeModels = entries.filter(([k]) => k.startsWith("claude-"));
  const standaloneModels = entries.filter(([k]) => k.includes("image") || k.includes("orchestrator"));
  const summaryModels = entries.filter(([k]) => SUMMARY_KEYS.has(k));
  const otherModels = entries.filter(
    ([k]) =>
      !k.startsWith("gemini-") &&
      !k.startsWith("claude-") &&
      !k.includes("image") &&
      !k.includes("orchestrator") &&
      !SUMMARY_KEYS.has(k),
  );

  const hasGeminiWeekly = Boolean(quotas.gemini_weekly);
  const hasGeminiSession = Boolean(quotas.gemini_session);
  const hasArgonWeekly = Boolean(quotas.gemini_argon_weekly);
  const hasArgonSession = Boolean(quotas.gemini_argon_session);
  const hasClaudeWeekly = Boolean(quotas.claude_gpt_weekly);
  const hasClaudeSession = Boolean(quotas.claude_gpt_session);

  // 1. Gemini Family (Argon, Neon, Hydrogen, Carbon & Gemini Pro all merged into Gemini)
  const effectiveGeminiSession = quotas.gemini_session || quotas.gemini_argon_session;
  const effectiveGeminiWeekly = quotas.gemini_weekly || quotas.gemini_argon_weekly;

  if (effectiveGeminiSession) {
    normalizedQuotas.push(toQuotaRow("Gemini", "gemini_session", effectiveGeminiSession));
  } else if (geminiModels.length > 0) {
    const rep = pickMinRemainingQuota(geminiModels);
    const weeklyResetAt = effectiveGeminiWeekly?.resetAt;
    const isDuplicateOfWeekly =
      Boolean(effectiveGeminiWeekly) && rep.resetAt === weeklyResetAt && (rep.remainingPercentage ?? 0) === 0;

    if (!isDuplicateOfWeekly) {
      normalizedQuotas.push(toQuotaRow("Gemini", "gemini", rep));
    }
  }

  if (effectiveGeminiWeekly) {
    normalizedQuotas.push(toQuotaRow("Gemini", "gemini_weekly", effectiveGeminiWeekly));
  }

  // 2. Claude Family
  if (hasClaudeSession) {
    summaryModels
      .filter(([k]) => k === "claude_gpt_session")
      .forEach(([modelKey, quota]) => normalizedQuotas.push(toQuotaRow("Claude", modelKey, quota)));
  } else if (claudeModels.length > 0) {
    const rep = pickMinRemainingQuota(claudeModels);
    const weeklyResetAt = quotas.claude_gpt_weekly?.resetAt;
    const isDuplicateOfWeekly =
      hasClaudeWeekly && rep.resetAt === weeklyResetAt && (rep.remainingPercentage ?? 0) === 0;

    if (!isDuplicateOfWeekly) {
      normalizedQuotas.push(toQuotaRow("Claude", "claude", rep));
    }
  }

  if (hasClaudeWeekly) {
    summaryModels
      .filter(([k]) => k === "claude_gpt_weekly")
      .forEach(([modelKey, quota]) => normalizedQuotas.push(toQuotaRow("Claude", modelKey, quota)));
  }

  // 3. Standalone Models (Orchestrator covered under Gemini)

  standaloneModels
    .filter(([k]) => !k.includes("orchestrator"))
    .forEach(([modelKey, quota]) => {
      normalizedQuotas.push(toQuotaRow(quota.displayName || modelKey, modelKey, quota));
    });

  // 4. Other models (GPT-OSS is already covered when Claude & GPT summary rows exist)
  if (!hasClaudeWeekly && !hasClaudeSession) {
    otherModels.forEach(([modelKey, quota]) => {
      normalizedQuotas.push(toQuotaRow(quota.displayName || modelKey, modelKey, quota));
    });
  }

  return normalizedQuotas;
}
