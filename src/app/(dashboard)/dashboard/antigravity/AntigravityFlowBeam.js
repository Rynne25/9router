"use client";

import { useState } from "react";
import Link from "next/link";
import { FlowBeam, MagneticButton } from "@/shared/components/hud";
import { useHudPrefs } from "@/shared/hooks/useHudPrefs";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { playHudSound } from "@/shared/utils/hudAudio";
import { cn } from "@/shared/utils/cn";

function formatGatewayHost(mitmRouterBaseUrl) {
  const raw = (mitmRouterBaseUrl || "http://localhost:20128").trim().replace(/\/+$/, "");
  const cleanHost = raw.replace(/^https?:\/\//i, "");
  return {
    fullUrl: `${raw}/v1`,
    displayUrl: `${cleanHost}/v1`,
  };
}

export default function AntigravityFlowBeam({
  mitmStatus = {},
  mitmLoading = false,
  dnsBusy = false,
  dnsError = null,
  onToggleDns,
  agAccountsCount = 0,
  activeAgCount = 0,
  avgQuotaPct = null,
  healthyCount = 0,
  exhaustedCount = 0,
  tokenSaversCount = 0,
}) {
  const { motionPaused } = useHudPrefs();
  const { copied, copy } = useCopyToClipboard(1800);
  const [hoveredStep, setHoveredStep] = useState(null);

  const mitmRunning = Boolean(mitmStatus?.running);
  const certTrusted = Boolean(mitmStatus?.certTrusted);
  const dnsActive = Boolean(mitmStatus?.dnsStatus?.antigravity);
  const gateway = formatGatewayHost(mitmStatus?.mitmRouterBaseUrl);
  const poolOnline = activeAgCount > 0;
  const ideBeamActive = mitmRunning && dnsActive;
  const poolBeamActive = mitmRunning || poolOnline;

  const handleCopyGateway = () => {
    playHudSound("click");
    copy(gateway.fullUrl, "gateway-url");
  };

  return (
    <div className="relative flex flex-col gap-3">
      {/* Top topology bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "inline-flex size-2 shrink-0 rounded-full",
              ideBeamActive
                ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.85)]"
                : "bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]",
              !motionPaused && "animate-pulse"
            )}
          />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-text-main whitespace-nowrap">
            LUỒNG ĐỊNH TUYẾN ANTIGRAVITY
          </span>
          <span className="hidden sm:inline-flex items-center rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-700 dark:text-cyan-300 whitespace-nowrap">
            KHÔNG CẦN KHỞI ĐỘNG LẠI IDE
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted shrink-0">
          <span className="rounded border border-border-subtle bg-surface-2/70 px-2 py-0.5 whitespace-nowrap">
            {ideBeamActive
              ? "ĐANG CHẶN IDE -> POOL"
              : mitmRunning
                ? "SẴN SÀNG PASSTHROUGH"
                : "CHẾ ĐỘ GATEWAY TRỰC TIẾP"}
          </span>
        </div>
      </div>

      {/* Blueprint Dot-Matrix Canvas + 3-Node Horizontal / Responsive Vertical Flow */}
      <div className="hud-blueprint-canvas rounded-xl border border-border-subtle/70 p-2.5 sm:p-3">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_68px_minmax(0,1fr)_68px_minmax(0,1fr)] items-stretch gap-1 md:gap-0">
          {/* LEFT NODE: Antigravity IDE */}
          <div
            onMouseEnter={() => setHoveredStep(0)}
            onMouseLeave={() => setHoveredStep(null)}
            className={cn(
              "relative flex flex-col justify-between gap-2.5 rounded-xl border p-3.5 transition-all duration-200 min-w-0",
              "bg-gradient-to-br from-surface-2/95 via-surface-2/80 to-surface/70 backdrop-blur-md",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
              hoveredStep === 0 || hoveredStep === 1
                ? "border-cyan-400/75 ring-1 ring-cyan-400/35 shadow-[0_0_24px_rgba(34,211,238,0.22)]"
                : hoveredStep === 2
                  ? "opacity-75 border-border"
                  : ideBeamActive
                    ? "border-emerald-500/45 shadow-[0_0_22px_rgba(16,185,129,0.16),inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "border-border hover:border-cyan-500/35"
            )}
          >
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                    ideBeamActive
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                  )}
                >
                  <span className="material-symbols-outlined text-[19px]">terminal</span>
                </div>
                <div className="min-w-0">
                  <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-text-subtle truncate">
                    01 · TRÌNH SOẠN THẢO
                  </span>
                  <p className="text-xs font-bold text-text-main truncate">Antigravity IDE</p>
                  <p className="font-mono text-[10px] text-text-muted truncate">
                    daily-cloudcode-pa
                  </p>
                </div>
              </div>
            </div>

            {/* Live DNS Intercepted vs Smart Passthrough indicator */}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface/75 backdrop-blur-sm px-2.5 py-2 min-w-0">
              <div
                className="flex items-center gap-1.5 min-w-0"
                title={
                  ideBeamActive
                    ? "Đang chặn DNS Antigravity qua MITM"
                    : dnsActive
                      ? "DNS đang bật nhưng MITM cổng :443 đang tắt"
                      : "Chuyển tiếp thông minh qua Google Cloud"
                }
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    ideBeamActive
                      ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.9)]"
                      : dnsActive
                        ? "bg-amber-500"
                        : "bg-cyan-500/70",
                    ideBeamActive && !motionPaused && "animate-pulse"
                  )}
                />
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-text-main whitespace-nowrap truncate">
                  {ideBeamActive
                    ? "Đang chặn DNS"
                    : dnsActive
                      ? "DNS bật (MITM tắt)"
                      : "Passthrough"}
                </span>
              </div>

              {/* 1-Click Antigravity DNS Toggle */}
              <button
                type="button"
                role="switch"
                aria-checked={dnsActive}
                aria-label="Bật / Tắt chặn DNS cho Antigravity"
                data-cursor-target
                disabled={dnsBusy || mitmLoading || !mitmRunning}
                onClick={() => {
                  playHudSound("toggle");
                  onToggleDns?.();
                }}
                title={
                  !mitmRunning
                    ? "Hãy bật MITM Server cổng :443 ở trang Proxy MITM trước"
                    : dnsActive
                      ? "Tắt chặn DNS Antigravity (chuyển sang Passthrough)"
                      : "Bật chặn DNS Antigravity"
                }
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60",
                  dnsActive
                    ? "border-emerald-500/60 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                    : "border-border bg-surface-3",
                  !mitmRunning || dnsBusy || mitmLoading
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                )}
              >
                <span
                  className={cn(
                    "inline-block size-3.5 rounded-full bg-white shadow transition-transform duration-200",
                    dnsActive ? "translate-x-4" : "translate-x-0.5"
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] font-mono min-w-0">
              {!mitmRunning ? (
                <MagneticButton strength={3}>
                  <Link
                    href="/dashboard/mitm"
                    data-cursor-target
                    className="text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap"
                  >
                    Bật cổng :443 để gạt DNS →
                  </Link>
                </MagneticButton>
              ) : dnsError ? (
                <MagneticButton strength={3}>
                  <Link
                    href="/dashboard/mitm"
                    data-cursor-target
                    className="text-rose-600 dark:text-rose-400 hover:underline truncate"
                    title={dnsError}
                  >
                    {dnsError} (MITM →)
                  </Link>
                </MagneticButton>
              ) : (
                <span className="text-text-subtle truncate">
                  {dnsActive ? "Đang định tuyến IDE qua 9Router" : "Đang đi thẳng qua Google Cloud"}
                </span>
              )}
            </div>
          </div>

          {/* BEAM 1: IDE -> Orbital Core */}
          <FlowBeam
            active={ideBeamActive}
            paused={motionPaused}
            highlighted={hoveredStep === 0 || hoveredStep === 1}
            dimmed={hoveredStep === 2}
            accent={ideBeamActive ? "emerald" : "cyan"}
          />

          {/* CENTER NODE: 9Router Core */}
          <div
            onMouseEnter={() => setHoveredStep(1)}
            onMouseLeave={() => setHoveredStep(null)}
            className={cn(
              "relative flex flex-col justify-between gap-2.5 rounded-xl border p-3.5 transition-all duration-200 min-w-0",
              "bg-gradient-to-br from-surface-2/95 via-surface-2/80 to-surface/70 backdrop-blur-md",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
              hoveredStep !== null
                ? "border-cyan-400/75 ring-1 ring-cyan-400/35 shadow-[0_0_24px_rgba(34,211,238,0.22)]"
                : mitmRunning
                  ? "border-cyan-500/50 shadow-[0_0_24px_rgba(6,182,212,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "border-border hover:border-cyan-500/35"
            )}
          >
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
                    mitmRunning
                      ? "border-cyan-500/45 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400"
                      : "border-border bg-surface-3 text-text-muted"
                  )}
                >
                  <span className="material-symbols-outlined text-[19px]">hub</span>
                </div>
                <div className="min-w-0">
                  <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-text-subtle truncate">
                    02 · LÕI ĐỊNH TUYẾN
                  </span>
                  <p className="text-xs font-bold text-text-main truncate">Lõi định tuyến 9Router</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.2 font-mono text-[9.5px] font-bold uppercase border whitespace-nowrap",
                        mitmRunning
                          ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "border-border bg-surface-3 text-text-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          mitmRunning ? "bg-emerald-500" : "bg-text-subtle",
                          mitmRunning && !motionPaused && "animate-pulse"
                        )}
                      />
                      {mitmRunning ? ":443 ĐANG CHẠY" : ":443 ĐANG DỪNG"}
                    </span>
                    {certTrusted && (
                      <span className="font-mono text-[9.5px] font-semibold text-cyan-600 dark:text-cyan-400 whitespace-nowrap">
                        CA OK
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Gateway URL quick-copy */}
            <div className="flex items-center justify-between gap-1.5 rounded-lg border border-border-subtle bg-surface/80 backdrop-blur-sm px-2.5 py-1.5 min-w-0">
              <code className="font-mono text-[10.5px] text-text-main truncate">
                {gateway.displayUrl}
              </code>
              <MagneticButton strength={3}>
                <button
                  type="button"
                  data-cursor-target
                  onClick={handleCopyGateway}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/15 cursor-pointer shrink-0 whitespace-nowrap transition-colors"
                  title="Sao chép URL Gateway"
                >
                  <span className="material-symbols-outlined text-[13px]">
                    {copied === "gateway-url" ? "check" : "content_copy"}
                  </span>
                  <span>{copied === "gateway-url" ? "Đã chép" : "Chép"}</span>
                </button>
              </MagneticButton>
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] font-mono min-w-0">
              <span className="text-text-subtle truncate min-w-0" title="HTTP/2 Pool · Tự động chuyển mạch">
                H2 Pool · Tự chuyển
              </span>
              <MagneticButton strength={3} className="shrink-0">
                <Link
                  href="/dashboard/mitm"
                  data-cursor-target
                  onClick={() => playHudSound("click")}
                  className="inline-flex items-center gap-0.5 font-semibold text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap shrink-0"
                >
                  <span>Bảng MITM</span>
                  <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                </Link>
              </MagneticButton>
            </div>
          </div>

          {/* BEAM 2: Orbital Core -> Antigravity Pool */}
          <FlowBeam
            active={poolBeamActive}
            paused={motionPaused}
            highlighted={hoveredStep === 1 || hoveredStep === 2}
            dimmed={hoveredStep === 0}
            accent={avgQuotaPct !== null && avgQuotaPct >= 30 ? "emerald" : "cyan"}
          />

          {/* RIGHT NODE: Antigravity Pool */}
          <div
            onMouseEnter={() => setHoveredStep(2)}
            onMouseLeave={() => setHoveredStep(null)}
            className={cn(
              "relative flex flex-col justify-between gap-2.5 rounded-xl border p-3.5 transition-all duration-200 min-w-0",
              "bg-gradient-to-br from-surface-2/95 via-surface-2/80 to-surface/70 backdrop-blur-md",
              "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
              hoveredStep === 2 || hoveredStep === 1
                ? "border-cyan-400/75 ring-1 ring-cyan-400/35 shadow-[0_0_24px_rgba(34,211,238,0.22)]"
                : hoveredStep === 0
                  ? "opacity-75 border-border"
                  : poolOnline
                    ? "border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.14),inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "border-border hover:border-cyan-500/35"
            )}
          >
            <div className="flex items-start justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-cyan-500/35 bg-cyan-500/12 text-cyan-600 dark:text-cyan-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <span className="material-symbols-outlined text-[19px]">layers</span>
                </div>
                <div className="min-w-0">
                  <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-text-subtle truncate">
                    03 · CỤM TÀI KHOẢN
                  </span>
                  <p className="text-xs font-bold text-text-main truncate">Nhóm Antigravity</p>
                  <p className="font-mono text-[10px] text-text-muted hud-telemetry-num truncate">
                    {activeAgCount}/{agAccountsCount} tài khoản bật
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 font-mono text-xs font-bold hud-telemetry-num px-2 py-0.5 rounded border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] whitespace-nowrap",
                  avgQuotaPct === null
                    ? "border-border bg-surface text-text-muted"
                    : avgQuotaPct > 70
                      ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                      : avgQuotaPct >= 30
                        ? "border-amber-500/35 bg-amber-500/12 text-amber-600 dark:text-amber-400"
                        : "border-rose-500/35 bg-rose-500/12 text-rose-600 dark:text-rose-400"
                )}
              >
                {avgQuotaPct !== null ? `${avgQuotaPct}%` : "--"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
              <div className="flex items-center justify-between rounded-md border border-border-subtle bg-surface/75 backdrop-blur-sm px-2.5 py-1.5">
                <span className="text-text-muted truncate">Sẵn sàng</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 hud-telemetry-num">
                  {healthyCount}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border-subtle bg-surface/75 backdrop-blur-sm px-2.5 py-1.5">
                <span className="text-text-muted truncate">Cạn kiệt</span>
                <span
                  className={cn(
                    "font-bold hud-telemetry-num",
                    exhaustedCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-text-muted"
                  )}
                >
                  {exhaustedCount}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] font-mono min-w-0">
              <span className="text-text-subtle truncate min-w-0" title="Mô-đun tiết kiệm token đang bật">
                Nén Token: <strong className="text-cyan-600 dark:text-cyan-400">{tokenSaversCount}/4</strong>
              </span>
              <MagneticButton strength={3} className="shrink-0">
                <Link
                  href="/dashboard/quota?provider=antigravity"
                  data-cursor-target
                  onClick={() => playHudSound("click")}
                  className="inline-flex items-center gap-0.5 font-semibold text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap shrink-0"
                >
                  <span>Bảng Quota</span>
                  <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
                </Link>
              </MagneticButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
