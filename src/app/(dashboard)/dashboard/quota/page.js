"use client";

import { Suspense } from "react";
import ProviderLimits from "../usage/components/ProviderLimits";
import QuotaSummaryBar from "../usage/components/ProviderLimits/components/QuotaSummaryBar";
import QuotaCardSkeleton from "../usage/components/ProviderLimits/components/QuotaCardSkeleton";

function QuotaPageFallback() {
  return (
    <div className="w-full space-y-3.5">
      <QuotaSummaryBar isInitialLoading />
      <div className="hud-frame hud-chamfer-sm px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="h-7 w-44 rounded-lg bg-cyan-500/12" />
          <div className="h-7 w-28 rounded-lg bg-cyan-500/10" />
          <div className="h-7 w-24 rounded-lg bg-cyan-500/10" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-24 rounded-lg bg-cyan-500/10" />
          <div className="h-7 w-28 rounded-lg bg-cyan-500/12" />
        </div>
      </div>
      <QuotaCardSkeleton
        count={6}
        gridClass="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5"
      />
    </div>
  );
}

export default function QuotaPage() {
  return (
    <div className="w-full">
      <Suspense fallback={<QuotaPageFallback />}>
        <ProviderLimits />
      </Suspense>
    </div>
  );
}
