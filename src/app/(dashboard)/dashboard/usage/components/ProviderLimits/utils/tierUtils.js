import { getAntigravityEffectiveTier, getTierBadgeLabel } from "@/shared/utils/antigravityTier";

export { getAntigravityEffectiveTier, getTierBadgeLabel };

export const ANTIGRAVITY_TIER_BADGE_CLASSES = {
  pro: "bg-gradient-to-r from-purple-500/15 to-pink-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30",
  pro_jiro: "bg-gradient-to-r from-cyan-500/15 to-indigo-500/15 text-cyan-600 dark:text-cyan-300 border-cyan-500/30",
  ultra: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  enterprise: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  free: "bg-gray-500/15 text-gray-500 dark:text-gray-400 border-gray-500/20",
};

export function getAntigravityTierBadgeClass(tier) {
  return ANTIGRAVITY_TIER_BADGE_CLASSES[tier] || ANTIGRAVITY_TIER_BADGE_CLASSES.free;
}
