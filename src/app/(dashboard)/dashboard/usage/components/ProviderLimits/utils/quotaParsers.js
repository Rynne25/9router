import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { calculatePercentage } from "./quotaFormatters";
import { parseAntigravityQuotas } from "./antigravityQuotaParser";

const CODEX_DISPLAY_NAMES = {
  spark_session: "Spark (5h)",
  spark_weekly: "Spark (Weekly)",
  session: "5h",
  weekly: "Weekly",
  review_session: "Review (5h)",
  review_weekly: "Review (Weekly)",
};

const QODER_BUCKET_NAMES = {
  user: "Personal",
  organization: "Organization",
  addOn: "Add-on",
};

const CLAUDE_QUOTA_ORDER = {
  "session (5h)": 0,
  "weekly (7d)": 1,
  "weekly fable (7d)": 2,
  "weekly opus (7d)": 3,
  "weekly sonnet (7d)": 4,
};

const ANTIGRAVITY_FAMILY_ORDER = {
  gemini: 0,
  gemini_session: 1,
  gemini_weekly: 2,
  g1pro_argon: 10,
  g1pro_argon_session: 11,
  g1pro_argon_weekly: 12,
  gemini_argon: 10,
  gemini_argon_session: 11,
  gemini_argon_weekly: 12,
  gemini_neon: 10,
  gemini_neon_session: 11,
  gemini_neon_weekly: 12,
  claude: 20,
  claude_gpt_session: 21,
  claude_gpt_weekly: 22,
};

const ANTIGRAVITY_ORDER_ANCHORS = {
  gemini_neon: "gemini-4-neon-extra",
  gemini_neon_session: "gemini-4-neon-extra",
  gemini_neon_weekly: "gemini-4-neon-extra",
  gemini_argon: "gemini-4-argon-high",
  gemini_argon_session: "gemini-4-argon-high",
  gemini_argon_weekly: "gemini-4-argon-high",
  g1pro_argon: "gemini-4-argon-high",
  g1pro_argon_session: "gemini-4-argon-high",
  g1pro_argon_weekly: "gemini-4-argon-high",
  gemini: "gemini-3.8-flash-high",
  gemini_session: "gemini-3.8-flash-high",
  gemini_weekly: "gemini-3.8-flash-high",
  claude: "claude-sonnet-4-6",
  claude_gpt_session: "claude-sonnet-4-6",
  claude_gpt_weekly: "claude-sonnet-4-6",
};

function mapBasicQuotas(quotas, includeRemainingPercentage = false) {
  if (!quotas) return [];
  return Object.entries(quotas).map(([name, quota]) => {
    const row = {
      name,
      used: quota.used || 0,
      total: quota.total || 0,
      resetAt: quota.resetAt || null,
    };
    if (includeRemainingPercentage) {
      row.remainingPercentage = quota.remainingPercentage;
    }
    return row;
  });
}

function parseCodexQuotas(quotas) {
  if (!quotas) return [];
  return Object.entries(quotas).map(([quotaType, quota]) => ({
    name: CODEX_DISPLAY_NAMES[quotaType] || quotaType,
    quotaType,
    used: quota.used || 0,
    total: quota.total || 0,
    remaining: quota.remaining,
    resetAt: quota.resetAt || null,
  }));
}

function parseQoderQuotas(quotas) {
  if (!quotas) return [];
  return Object.entries(quotas)
    .filter(([, quota]) => quota && (Number(quota.total) || 0) !== 0)
    .map(([quotaType, quota]) => ({
      name: QODER_BUCKET_NAMES[quotaType] || quotaType,
      used: quota.used || 0,
      total: quota.total || 0,
      unit: quota.unit,
      resetAt: quota.resetAt || null,
      neverExpires: quota.neverExpires === true,
      detailUrl: quota.detailUrl || null,
    }));
}

function parseClaudeQuotas(data) {
  if (data.message) {
    return [
      {
        name: "error",
        used: 0,
        total: 0,
        resetAt: null,
        message: data.message,
      },
    ];
  }
  if (!data.quotas) return [];
  return Object.entries(data.quotas).map(([name, quota]) => ({
    name,
    used: quota.used || 0,
    total: quota.total || 0,
    remaining:
      quota.remaining !== undefined
        ? quota.remaining
        : Math.max(0, (quota.total || 100) - (quota.used || 0)),
    remainingPercentage:
      quota.remainingPercentage !== undefined
        ? quota.remainingPercentage
        : calculatePercentage(quota.used, quota.total),
    resetAt: quota.resetAt || null,
  }));
}

/**
 * Parse provider-specific quota structures into normalized array
 * @param {string} provider - Provider name (github, antigravity, codex, kiro, claude)
 * @param {Object} data - Raw quota data from provider
 * @returns {Array<Object>} Normalized quota objects with { name, used, total, resetAt }
 */
export function parseQuotaData(provider, data) {
  if (!data || typeof data !== "object") return [];

  let normalizedQuotas = [];

  try {
    switch (provider.toLowerCase()) {
      case "github":
      case "kiro":
      case "groq":
        normalizedQuotas = mapBasicQuotas(data.quotas, false);
        break;

      case "antigravity":
        normalizedQuotas = parseAntigravityQuotas(data.quotas);
        break;

      case "codex":
        normalizedQuotas = parseCodexQuotas(data.quotas);
        break;

      case "qoder":
      case "qoder-cn":
        normalizedQuotas = parseQoderQuotas(data.quotas);
        break;

      case "claude":
        normalizedQuotas = parseClaudeQuotas(data);
        break;

      case "vercel-ai-gateway":
      case "grok-cli":
      case "kimi":
      case "cursor":
      case "clinepass":
        normalizedQuotas = mapBasicQuotas(data.quotas, true);
        break;

      case "codebuddy-cn":
      case "codebuddy-intl":
        if (data.quotas) {
          normalizedQuotas = Object.entries(data.quotas).map(([name, quota]) => ({
            name,
            used: quota.used || 0,
            total: quota.total || 0,
            resetAt: quota.resetAt || null,
            recurring: quota.recurring !== false,
          }));
        }
        break;

      case "deepseek":
        if (data.quotas) {
          normalizedQuotas = Object.entries(data.quotas).map(([name, quota]) => ({
            name,
            used: quota.used || 0,
            total: quota.total || 0,
            resetAt: quota.resetAt || null,
            remainingPercentage: quota.remainingPercentage,
            isCreditBalance: quota.isCreditBalance ?? true,
            currency:
              quota.currency ||
              (name.includes("(") ? name.slice(name.indexOf("(") + 1, name.indexOf(")")) : "USD"),
          }));
        }
        break;

      case "ollama":
        if (data.quotas) {
          normalizedQuotas = Object.entries(data.quotas).map(([name, quota]) => ({
            name,
            used: quota.used || 0,
            total: quota.total || 0,
            resetAt: quota.resetAt || null,
            remainingPercentage: quota.remainingPercentage,
            isCreditBalance: quota.isCreditBalance,
            currency: quota.currency,
            unit: quota.unit,
            unlimited: quota.unlimited,
          }));
        }
        break;

      case "zed":
        if (data.quotas) {
          normalizedQuotas = Object.entries(data.quotas).map(([name, quota]) => ({
            name,
            used: quota.used || 0,
            total: quota.total || 0,
            resetAt: quota.resetAt || null,
            remainingPercentage: quota.remainingPercentage,
            unlimited: quota.unlimited,
          }));
        }
        break;

      case "minimax-code":
      case "minimax-code-global":
        if (data.quotas) {
          normalizedQuotas = Object.entries(data.quotas).map(([name, quota]) => ({
            name,
            used: quota.used || 0,
            total: quota.total || 0,
            remaining: quota.remaining,
            remainingPercentage: quota.remainingPercentage,
            resetAt: quota.resetAt || null,
            message: quota.message,
            isCreditBalance: quota.isCreditBalance,
            currency: quota.currency,
          }));
        }
        break;

      default:
        if (data.quotas) {
          normalizedQuotas = Object.entries(data.quotas).map(([name, quota]) => ({
            name: quota.name || name,
            used: quota.used || 0,
            total: quota.total || 0,
            percentage: quota.percentage,
            colorPercentage: quota.colorPercentage,
            percentageIsUsed: quota.percentageIsUsed === true,
            resetAt: quota.resetAt || null,
            emptyMessage: quota.emptyMessage || null,
          }));
        }
    }
  } catch (error) {
    console.error(`Error parsing quota data for ${provider}:`, error);
    return [];
  }

  if (provider?.toLowerCase() === "claude") {
    normalizedQuotas.sort(
      (a, b) => (CLAUDE_QUOTA_ORDER[a.name] ?? 99) - (CLAUDE_QUOTA_ORDER[b.name] ?? 99),
    );
    return normalizedQuotas;
  }

  if (provider?.toLowerCase() === "antigravity") {
    const modelOrder = getModelsByProviderId(provider);
    const orderMap = new Map(modelOrder.map((m, i) => [m.id, i]));
    normalizedQuotas.sort((a, b) => {
      const rawA = String(a.modelKey || a.name || "").toLowerCase();
      const rawB = String(b.modelKey || b.name || "").toLowerCase();
      const famA = ANTIGRAVITY_FAMILY_ORDER[rawA];
      const famB = ANTIGRAVITY_FAMILY_ORDER[rawB];
      if (famA !== undefined || famB !== undefined) {
        if ((famA ?? 99) !== (famB ?? 99)) return (famA ?? 99) - (famB ?? 99);
      }
      const keyA = ANTIGRAVITY_ORDER_ANCHORS[rawA] || a.modelKey || a.name;
      const keyB = ANTIGRAVITY_ORDER_ANCHORS[rawB] || b.modelKey || b.name;
      return (orderMap.get(keyA) ?? 999) - (orderMap.get(keyB) ?? 999);
    });
    return normalizedQuotas;
  }

  // Sort quotas according to PROVIDER_MODELS order
  const modelOrder = getModelsByProviderId(provider);
  if (modelOrder.length > 0) {
    const orderMap = new Map(modelOrder.map((m, i) => [m.id, i]));
    normalizedQuotas.sort((a, b) => {
      const rawA = a.modelKey || a.name;
      const rawB = b.modelKey || b.name;
      const keyA = ANTIGRAVITY_ORDER_ANCHORS[rawA] || rawA;
      const keyB = ANTIGRAVITY_ORDER_ANCHORS[rawB] || rawB;
      return (orderMap.get(keyA) ?? 999) - (orderMap.get(keyB) ?? 999);
    });
  }

  return normalizedQuotas;
}
