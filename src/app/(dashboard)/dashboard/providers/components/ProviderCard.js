"use client";

import { memo } from "react";
import Link from "next/link";
import PropTypes from "prop-types";
import { Badge, Toggle } from "@/shared/components";
import { HudFrame } from "@/shared/components/hud";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { cn } from "@/shared/utils/cn";
import { getStatusDisplay } from "../utils/providerStats";

function ProviderCard({
  providerId,
  provider,
  stats,
  authType,
  onToggle,
}) {
  const { connected, error, errorCode, errorTime, allDisabled } = stats;
  const isNoAuth = !!provider.noAuth;
  const isAntigravity = providerId === "antigravity";

  return (
    <Link
      href={`/dashboard/providers/${providerId}`}
      className="group min-w-0 block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
    >
      <HudFrame
        chamfer="sm"
        accent="cyan"
        padding="xs"
        spotlight={true}
        className={cn(
          "h-full cursor-pointer transition-all duration-200 [&>div:last-child]:h-full",
          isAntigravity
            ? "[&>.hud-frame]:border-cyan-500/45 hover:[&>.hud-frame]:border-cyan-400/80 dark:[&>.hud-frame]:border-cyan-400/40 dark:hover:[&>.hud-frame]:border-cyan-300/80"
            : "[&>.hud-frame]:border-black/10 dark:[&>.hud-frame]:border-white/10 hover:[&>.hud-frame]:border-cyan-500/60 dark:hover:[&>.hud-frame]:border-cyan-400/60",
          allDisabled && "opacity-55",
        )}
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "size-9 shrink-0 rounded-xl flex items-center justify-center border",
                isAntigravity
                  ? "border-cyan-500/35"
                  : "border-black/10 dark:border-white/10",
              )}
              style={{
                backgroundColor: `${provider.color?.length > 7 ? provider.color : provider.color + "15"}`,
              }}
            >
              <ProviderIcon
                src={`/providers/${provider.id}.png`}
                alt={provider.name}
                size={28}
                className="object-contain rounded-lg max-w-[30px] max-h-[30px]"
                fallbackText={
                  provider.textIcon || provider.id.slice(0, 2).toUpperCase()
                }
                fallbackColor={provider.color}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="truncate font-semibold text-text-main group-hover:text-cyan-700 dark:group-hover:text-cyan-300 transition-colors">
                  {provider.name}
                </h3>
                {isAntigravity && (
                  <span className="shrink-0 rounded border border-cyan-500/40 bg-cyan-500/15 px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                    PRIORITY
                  </span>
                )}
              </div>
              <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] flex-wrap">
                {allDisabled ? (
                  <Badge variant="default" size="sm" className="font-mono">
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">
                        pause_circle
                      </span>
                      Disabled
                    </span>
                  </Badge>
                ) : isNoAuth ? (
                  <Badge variant="success" size="sm" dot className="font-mono">
                    Ready
                  </Badge>
                ) : (
                  <>
                    {getStatusDisplay(connected, error, errorCode)}
                    {errorTime && (
                      <span className="font-mono text-[10.5px] text-text-muted">{errorTime}</span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {authType && (
              <span className="hidden xl:inline-flex rounded border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-muted group-hover:hidden">
                {authType}
              </span>
            )}
            {stats.total > 0 && (
              <div
                className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onToggle) onToggle(!allDisabled ? false : true);
                }}
              >
                <Toggle
                  size="sm"
                  checked={!allDisabled}
                  onChange={() => {}}
                  title={allDisabled ? "Enable provider" : "Disable provider"}
                />
              </div>
            )}
          </div>
        </div>
      </HudFrame>
    </Link>
  );
}

ProviderCard.propTypes = {
  providerId: PropTypes.string.isRequired,
  provider: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    color: PropTypes.string,
    textIcon: PropTypes.string,
    noAuth: PropTypes.bool,
  }).isRequired,
  stats: PropTypes.shape({
    connected: PropTypes.number,
    error: PropTypes.number,
    errorCode: PropTypes.string,
    errorTime: PropTypes.string,
    total: PropTypes.number,
    allDisabled: PropTypes.bool,
  }).isRequired,
  authType: PropTypes.string,
  onToggle: PropTypes.func,
};

export default memo(ProviderCard);
