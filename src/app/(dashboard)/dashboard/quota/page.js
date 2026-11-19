"use client";

import { Suspense } from "react";
import ProviderLimits from "../usage/components/ProviderLimits";
import QuotaSummaryBar from "../usage/components/ProviderLimits/components/QuotaSummaryBar";
import QuotaCardSkeleton from "../usage/components/ProviderLimits/components/QuotaCardSkeleton";

function QuotaPageFallback() {
  return (
    <div className="space-y-3.5">
      <QuotaSummaryBar isInitialLoading />
      <QuotaCardSkeleton count={6} />
    </div>
  );
}

export default function QuotaPage() {
  return (
    <Suspense fallback={<QuotaPageFallback />}>
      <ProviderLimits />
    </Suspense>
  );
}
