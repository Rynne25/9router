import { QUOTA_WINDOW_GROUPS } from "./constants";

export function getQuotaWindowGroup(quota) {
  if (!quota || typeof quota !== "object") return "standalone";
  const key = String(quota.modelKey || quota.quotaType || "").toLowerCase();
  const name = String(quota.name || "").toLowerCase();

  if (
    key.includes("image") ||
    key.includes("orchestrator") ||
    name.includes("orchestrator") ||
    name.includes("flash image")
  ) {
    return "standalone";
  }

  if (
    key.endsWith("_weekly") ||
    key === "weekly" ||
    /\bweekly\b|\(7d\)|\b7d\b|theo tuần/i.test(name)
  ) {
    return "weekly";
  }

  if (
    key.endsWith("_session") ||
    key === "session" ||
    key === "five_hour" ||
    key === "gemini" ||
    key === "claude" ||
    key === "gemini_argon" ||
    /\(5h\)|\b5h\b|session\s*\(5h\)|five.?hour|\bdaily\b|theo ngày|gemini \(flash \/ pro\)|gemini 4 argon|claude \(sonnet \/ opus\)/i.test(name)
  ) {
    return "daily_5h";
  }

  return "standalone";
}

export function groupQuotasByWindow(quotas = []) {
  if (!Array.isArray(quotas) || quotas.length === 0) return [];
  const buckets = new Map(QUOTA_WINDOW_GROUPS.map((g) => [g.id, []]));
  for (const quota of quotas) {
    const groupId = getQuotaWindowGroup(quota);
    buckets.get(groupId).push(quota);
  }
  return QUOTA_WINDOW_GROUPS
    .map((g) => ({ ...g, items: buckets.get(g.id) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Extract family identity and cycle type for smart Dual-Bar pairing.
 */
export function getQuotaFamilyInfo(quota) {
  if (!quota || typeof quota !== "object") {
    return { familyKey: "other", title: "", cycle: "standalone", badge: "Riêng" };
  }
  const key = String(quota.modelKey || quota.quotaType || "").toLowerCase();
  const rawName = String(quota.name || "").trim();
  const lowerName = rawName.toLowerCase();

  // 1. G1 Pro / Argon / Neon merger
  if (
    key.includes("orchestrator") ||
    lowerName.includes("orchestrator") ||
    key === "gemini_argon" ||
    key.startsWith("gemini_argon_") ||
    key === "gemini_neon" ||
    key.startsWith("gemini_neon_") ||
    key.startsWith("g1pro_argon") ||
    lowerName.includes("argon") ||
    lowerName.includes("neon") ||
    lowerName.includes("g1 pro") ||
    lowerName.includes("g1-pro")
  ) {
    const windowGroup = getQuotaWindowGroup(quota);
    const cycle = windowGroup === "weekly" ? "weekly" : windowGroup === "daily_5h" ? "daily_5h" : "weekly";
    const badge = cycle === "weekly" ? "Tuần" : "5h";
    return {
      familyKey: "g1pro_argon",
      title: "Argon",
      cycle,
      badge,
    };
  }

  if (key.includes("image") || lowerName.includes("flash image")) {
    return {
      familyKey: `standalone_${key || lowerName}`,
      title: rawName.replace(/\s*\((5h|weekly|7d|daily)\)\s*/i, "").trim() || "Gemini 3.1 Flash Image",
      cycle: "standalone",
      badge: "5h",
    };
  }

  const windowGroup = getQuotaWindowGroup(quota);
  const cycle = windowGroup === "weekly" ? "weekly" : windowGroup === "daily_5h" ? "daily_5h" : "standalone";
  const badge = cycle === "weekly" ? "Tuần" : cycle === "daily_5h" ? "5h" : "Riêng";

  if (key === "gemini" || key === "gemini_session" || key === "gemini_weekly" || /^gemini\s*\((5h|weekly|flash\s*\/\s*pro)\)$/i.test(rawName) || lowerName === "gemini") {
    return { familyKey: "gemini", title: "Gemini", cycle, badge };
  }
  if (key === "claude" || key.startsWith("claude_gpt_") || /^claude\s*(&\s*gpt|\(sonnet\s*\/\s*opus\))/i.test(rawName) || lowerName === "claude") {
    return { familyKey: "claude_gpt", title: "Claude", cycle, badge };
  }
  if (lowerName === "session (5h)" || lowerName === "weekly (7d)") {
    return { familyKey: "claude_session_weekly", title: "Claude", cycle, badge };
  }

  const strippedTitle = rawName.replace(/\s*\((5h|weekly|7d|daily)\)\s*$/i, "").trim();
  if (strippedTitle && strippedTitle.toLowerCase() !== lowerName && (cycle === "daily_5h" || cycle === "weekly")) {
    return {
      familyKey: `pair_${strippedTitle.toLowerCase()}`,
      title: strippedTitle,
      cycle,
      badge,
    };
  }

  return {
    familyKey: `single_${key || lowerName}`,
    title: strippedTitle || rawName,
    cycle,
    badge,
  };
}

const FAMILY_DISPLAY_PRIORITY = {
  gemini: 0,
  g1pro_argon: 1,
  claude_gpt: 2,
  claude_session_weekly: 2,
};

/**
 * Smartly pairs quotas that share the same model family across Daily/5h and Weekly windows
 * into a single Dual-Bar item, while keeping single-cycle/standalone models separate.
 * Also returns a unified `items` array preserving canonical family order (Gemini before Claude).
 */
export function pairQuotasByFamily(quotas = []) {
  if (!Array.isArray(quotas) || quotas.length === 0) {
    return { paired: [], singles: [], items: [] };
  }

  const familyMap = new Map();
  const orderKeys = [];

  for (const quota of quotas) {
    const info = getQuotaFamilyInfo(quota);
    if (!familyMap.has(info.familyKey)) {
      familyMap.set(info.familyKey, {
        familyKey: info.familyKey,
        title: info.title,
        daily: null,
        weekly: null,
        standalone: [],
      });
      orderKeys.push(info.familyKey);
    }
    const entry = familyMap.get(info.familyKey);
    if (info.cycle === "daily_5h" && !entry.daily) {
      entry.daily = { ...quota, cleanTitle: info.title, cycleBadge: "5h" };
    } else if (info.cycle === "weekly" && !entry.weekly) {
      entry.weekly = { ...quota, cleanTitle: info.title, cycleBadge: "Tuần" };
    } else if (info.familyKey === "g1pro_argon") {
      if (!entry.weekly) {
        entry.weekly = { ...quota, cleanTitle: info.title, cycleBadge: "Tuần" };
      }
    } else {
      entry.standalone.push({ ...quota, cleanTitle: info.title, cycleBadge: info.badge });
    }
  }

  const sortedOrderKeys = [...orderKeys].sort((a, b) => {
    const pa = FAMILY_DISPLAY_PRIORITY[a] ?? 50;
    const pb = FAMILY_DISPLAY_PRIORITY[b] ?? 50;
    if (pa !== pb) return pa - pb;
    return orderKeys.indexOf(a) - orderKeys.indexOf(b);
  });

  const paired = [];
  const singles = [];
  const items = [];

  for (const key of sortedOrderKeys) {
    const entry = familyMap.get(key);
    if (entry.daily && entry.weekly) {
      const pairItem = {
        familyKey: entry.familyKey,
        title: entry.title,
        daily: entry.daily,
        weekly: entry.weekly,
      };
      paired.push(pairItem);
      items.push({ kind: "paired", pair: pairItem });
      for (const s of entry.standalone) {
        singles.push(s);
        items.push({ kind: "single", quota: s });
      }
    } else {
      if (entry.daily) {
        singles.push(entry.daily);
        items.push({ kind: "single", quota: entry.daily });
      }
      if (entry.weekly) {
        singles.push(entry.weekly);
        items.push({ kind: "single", quota: entry.weekly });
      }
      for (const s of entry.standalone) {
        singles.push(s);
        items.push({ kind: "single", quota: s });
      }
    }
  }

  return { paired, singles, items };
}
