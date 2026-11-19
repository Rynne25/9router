export const AUTO_PING_SETTINGS_KEYS = {
  claude: "claudeAutoPing",
  codex: "codexAutoPing",
};

export const AUTO_PING_TOOLTIPS = {
  claude: "When your 5h quota runs out, auto-sends a request the moment it resets so a new window starts right away.",
  codex: "Auto-starts the next 5h Codex window after reset by sending a tiny request. Consumes a small amount of quota.",
};

export const CLAUDE_RESET_LIMIT_NAMES = {
  five_hour: "session",
  seven_day: "weekly",
  seven_day_overage_included: "weekly",
  seven_day_opus: "Opus weekly",
  seven_day_sonnet: "Sonnet weekly",
};

export function getCodexResetCreditCount(quota) {
  const value = quota?.raw?.resetCredits?.availableCount;
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

export function formatClaudeResetClears(clears) {
  const names = [...new Set((clears || []).map((c) => CLAUDE_RESET_LIMIT_NAMES[c]).filter(Boolean))];
  return names.length ? `${names.join(" + ")} limits` : "limits";
}

export function claudeGrantStatus(grant) {
  if (grant.resetsLeft <= 0) return "used";
  if (grant.paused) return "paused";
  if (grant.endsAt && new Date(grant.endsAt).getTime() <= Date.now()) return "expired";
  if (grant.usableNow) return "usable now";
  if (grant.startsAt && new Date(grant.startsAt).getTime() > Date.now()) return "not started";
  return grant.useRequiresLimit ? "at limit only" : "unavailable";
}
