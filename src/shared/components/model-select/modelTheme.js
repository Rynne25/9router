/**
 * Visual theme tokens and Antigravity series subgrouping for ModelSelectModal cards.
 */

const MODEL_THEME_RULES = [
  {
    match: (str) => str.includes("gemini-4"),
    theme: () => ({
      icon: "auto_awesome",
      iconColor: "text-cyan-400",
      badgeText: "Gemini 4",
      badge: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border border-cyan-500/40 font-bold",
      card: "border-cyan-500/40 bg-white/85 dark:bg-zinc-900/90 hover:border-cyan-400 hover:bg-cyan-500/10 shadow-xs ring-1 ring-cyan-500/15",
    }),
  },
  {
    match: (str) => str.includes("gemini-3") || str.includes("flash"),
    theme: (str) => ({
      icon: "bolt",
      iconColor: "text-sky-400",
      badgeText: str.includes("lite") ? "Lite" : str.includes("image") ? "Image" : "Flash",
      badge: "bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/40 font-bold",
      card: "border-sky-500/40 bg-white/85 dark:bg-zinc-900/90 hover:border-sky-400 hover:bg-sky-500/10 shadow-xs ring-1 ring-sky-500/15",
    }),
  },
  {
    match: (str) => str.includes("orchestrator") || str.includes("g1-pro"),
    theme: () => ({
      icon: "hub",
      iconColor: "text-purple-400",
      badgeText: "Orchestrator",
      badge: "bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/40 font-bold",
      card: "border-purple-500/40 bg-white/85 dark:bg-zinc-900/90 hover:border-purple-400 hover:bg-purple-500/10 shadow-xs ring-1 ring-purple-500/15",
    }),
  },
  {
    match: (str) => str.includes("claude") || str.includes("opus") || str.includes("sonnet"),
    theme: (str) => ({
      icon: "psychology",
      iconColor: "text-orange-400",
      badgeText: str.includes("opus") ? "Opus" : str.includes("sonnet") ? "Sonnet" : "Claude",
      badge: "bg-orange-500/20 text-orange-600 dark:text-orange-300 border border-orange-500/40 font-bold",
      card: "border-orange-500/40 bg-white/85 dark:bg-zinc-900/90 hover:border-orange-400 hover:bg-orange-500/10 shadow-xs ring-1 ring-orange-500/15",
    }),
  },
  {
    match: (str) => str.includes("gpt") || str.includes("openai") || str.includes("o1") || str.includes("o3"),
    theme: () => ({
      icon: "smart_toy",
      iconColor: "text-emerald-400",
      badgeText: "OpenAI",
      badge: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/40 font-bold",
      card: "border-emerald-500/40 bg-white/85 dark:bg-zinc-900/90 hover:border-emerald-400 hover:bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/15",
    }),
  },
  {
    match: (str) => str.includes("deepseek"),
    theme: () => ({
      icon: "neurology",
      iconColor: "text-blue-400",
      badgeText: "DeepSeek",
      badge: "bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-500/40 font-bold",
      card: "border-blue-500/40 bg-white/85 dark:bg-zinc-900/90 hover:border-blue-400 hover:bg-blue-500/10 shadow-xs ring-1 ring-blue-500/15",
    }),
  },
];

const DEFAULT_MODEL_THEME = {
  icon: "token",
  iconColor: "text-primary",
  badgeText: "LLM",
  badge: "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700 font-bold",
  card: "border-black/15 dark:border-white/15 bg-white/85 dark:bg-zinc-900/90 hover:border-primary/60 hover:bg-primary/10 shadow-xs ring-1 ring-black/5 dark:ring-white/5",
};

export function getModelTheme(model) {
  const str = `${model?.id || ""} ${model?.value || ""} ${model?.name || ""}`.toLowerCase();
  const rule = MODEL_THEME_RULES.find((entry) => entry.match(str));
  return rule ? rule.theme(str) : DEFAULT_MODEL_THEME;
}

const ANTIGRAVITY_SUBGROUP_DEFS = [
  {
    key: "g1pro",
    label: "Gemini Pro & Orchestrator (G1 Pro)",
    dotColor: "bg-purple-500",
    match: (m) =>
      (m.id || "").includes("orchestrator") ||
      (m.id || "").includes("g1-pro") ||
      (m.value || "").includes("orchestrator") ||
      (m.value || "").includes("g1-pro"),
  },
  {
    key: "g4",
    label: "Gemini 4 Series (Argon & Hydrogen)",
    dotColor: "bg-cyan-500",
    match: (m) => (m.id || "").startsWith("gemini-4") || (m.value || "").includes("gemini-4"),
  },
  {
    key: "g3",
    label: "Gemini 3.x Series (Flash, Lite & Image)",
    dotColor: "bg-sky-500",
    match: (m) => (m.id || "").startsWith("gemini-3") || (m.value || "").includes("gemini-3"),
  },
  {
    key: "cl",
    label: "Claude Series (Opus & Sonnet)",
    dotColor: "bg-orange-500",
    match: (m) => (m.id || "").startsWith("claude") || (m.value || "").includes("claude"),
  },
];

export function getAntigravitySubGroups(models) {
  const groups = ANTIGRAVITY_SUBGROUP_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    dotColor: def.dotColor,
    models: models.filter(def.match),
  }));

  const otherModels = models.filter((m) => !ANTIGRAVITY_SUBGROUP_DEFS.some((def) => def.match(m)));
  groups.push({
    key: "other",
    label: "Other Models",
    dotColor: "bg-primary",
    models: otherModels,
  });

  return groups.filter((sg) => sg.models.length > 0);
}
