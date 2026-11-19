"use client";

import { useState, useEffect } from "react";
import { CardSkeleton } from "@/shared/components";
import { CLI_TOOLS, MITM_TOOLS } from "@/shared/constants/cliTools";
import { getCachedData, fetchWithCache, fetchJson } from "@/shared/utils/swrCache";
import { MitmLinkCard } from "./components";
import ToolSummaryCard from "./components/ToolSummaryCard";

const ALL_STATUSES_URL = "/api/cli-tools/all-statuses";
const ALL_STATUSES_TTL_MS = 15000;

export default function CLIToolsPageClient({ machineId: _machineId = "" }) {
  const cachedStatuses = getCachedData(ALL_STATUSES_URL);
  const [loading, setLoading] = useState(() => cachedStatuses === undefined);
  const [toolStatuses, setToolStatuses] = useState(() => cachedStatuses || {});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await fetchWithCache(
          ALL_STATUSES_URL,
          () => fetchJson(ALL_STATUSES_URL),
          { ttlMs: ALL_STATUSES_TTL_MS }
        );
        if (data && mounted) setToolStatuses(data);
      } catch (error) {
        console.log("Error fetching tool statuses:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const regularTools = Object.entries(CLI_TOOLS);
  const mitmTools = Object.entries(MITM_TOOLS);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex items-center gap-2 px-1">
          <span className="material-symbols-outlined text-[18px] text-primary">security</span>
          <h2 className="text-sm font-semibold text-text-main">MITM Tools</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {mitmTools.map(([toolId, tool]) => (
            <MitmLinkCard key={toolId} tool={tool} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {regularTools.map(([toolId, tool]) => (
          <ToolSummaryCard key={toolId} toolId={toolId} tool={tool} status={toolStatuses[toolId]} />
        ))}
      </div>
    </div>
  );
}
