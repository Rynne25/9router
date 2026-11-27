"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RequestLogger, CardSkeleton, SegmentedControl } from "@/shared/components";
import { HudFrame, MagneticButton } from "@/shared/components/hud";
import UsageStats from "@/shared/components/UsageStats";
import RequestDetailsTab from "./components/RequestDetailsTab";

const PERIODS = [
  { value: "today", label: "Hôm nay" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 ngày" },
  { value: "30d", label: "30 ngày" },
  { value: "60d", label: "60 ngày" },
  { value: "all", label: "Tất cả" },
];

export default function UsagePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [period, setPeriod] = useState("today");

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl && ["overview", "logs", "details"].includes(tabFromUrl)
    ? tabFromUrl
    : "overview";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-5 px-1 sm:px-0">
      {/* Cyber-Bento Pro Telemetry Hero Banner */}
      <HudFrame
        chamfer="md"
        accent="cyan"
        padding="md"
        spotlight={true}
        borderBeam={activeTab === "overview"}
        className="border-cyan-500/30 dark:border-cyan-400/25 bg-gradient-to-r from-cyan-500/[0.08] via-sky-500/[0.03] to-transparent"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.85)]" />
                Telemetry Trực tiếp
              </span>
              <span className="hidden sm:inline-flex rounded border border-cyan-500/35 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                GIÁM SÁT LƯU LƯỢNG
              </span>
            </div>
            <h1 className="mt-1.5 text-xl font-extrabold tracking-tight text-text-main sm:text-2xl">
              Thống kê & Giám sát Lưu lượng
            </h1>
            <p className="mt-0.5 text-xs text-text-muted">
              Theo dõi khối lượng requests, tokens, tỷ lệ thành công và phân bổ định tuyến model
            </p>
          </div>

          {/* Global Period Selector when in Overview tab */}
          {activeTab === "overview" && (
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-cyan-500/25 bg-surface-2/70 p-1 backdrop-blur-md self-start sm:self-auto">
              {PERIODS.map((p) => {
                const isActive = period === p.value;
                return (
                  <MagneticButton key={p.value} strength={4}>
                    <button
                      type="button"
                      data-cursor-target="true"
                      aria-pressed={isActive}
                      onClick={() => setPeriod(p.value)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? "bg-primary text-white shadow-sm shadow-primary/25"
                          : "text-text-muted hover:bg-surface-3/60 hover:text-text-main"
                      }`}
                    >
                      {p.label}
                    </button>
                  </MagneticButton>
                );
              })}
            </div>
          )}
        </div>
      </HudFrame>

      {/* Main Tab Navigation */}
      <div className="flex items-center border-b border-border-subtle pb-1">
        <SegmentedControl
          options={[
            { value: "overview", label: "Tổng quan (Telemetry)" },
            { value: "details", label: "Chi tiết yêu cầu" },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          className="w-full sm:w-auto"
        />
      </div>

      {/* Tab Panels */}
      {activeTab === "overview" && (
        <Suspense fallback={<CardSkeleton />}>
          <UsageStats period={period} setPeriod={setPeriod} hidePeriodSelector />
        </Suspense>
      )}
      {activeTab === "logs" && <RequestLogger />}
      {activeTab === "details" && <RequestDetailsTab />}
    </div>
  );
}
