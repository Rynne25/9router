"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RequestLogger, CardSkeleton, SegmentedControl } from "@/shared/components";
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
      {/* Page Header + Telemetry Status Badge */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold tracking-tight text-text-main sm:text-2xl">
              Thống kê & Giám sát Lưu lượng
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Telemetry
            </span>
          </div>
          <p className="mt-0.5 text-xs text-text-muted">
            Theo dõi khối lượng requests, tokens, tỷ lệ thành công và phân bổ định tuyến model
          </p>
        </div>

        {/* Global Period Selector when in Overview tab */}
        {activeTab === "overview" && (
          <div className="flex items-center rounded-xl border border-border/80 bg-surface-2/60 p-1 backdrop-blur-md self-start sm:self-auto">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  period === p.value
                    ? "bg-primary text-white shadow-sm shadow-primary/25"
                    : "text-text-muted hover:bg-surface-3/60 hover:text-text-main"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center border-b border-border-subtle pb-1">
        <SegmentedControl
          options={[
            { value: "overview", label: "Tổng quan (Bento Telemetry)" },
            { value: "details", label: "Chi tiết yêu cầu (Details)" },
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
