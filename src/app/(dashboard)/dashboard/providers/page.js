"use client";

import Link from "next/link";
import { CardSkeleton, Button } from "@/shared/components";
import { HudFrame, NumberTicker } from "@/shared/components/hud";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { OAUTH_PROVIDERS } from "@/shared/constants/config";
import { STATUS_FILTER_OPTIONS } from "./utils";
import { dualAuthTypes } from "./utils/providerStats";
import { useProvidersOverview } from "./hooks/useProvidersOverview";
import { useRemoteSyncReceiver } from "./hooks/useRemoteSyncReceiver";
import ProviderCard from "./components/ProviderCard";
import ApiKeyProviderCard from "./components/ApiKeyProviderCard";
import ProviderTestResultsModal from "./components/ProviderTestResultsModal";
import ModelAvailabilityBadge from "./components/ModelAvailabilityBadge";
import AddCompatibleModal from "./components/AddCompatibleModal";
import RemoteSyncModal from "./components/RemoteSyncModal";
import BatchTestButton from "./components/BatchTestButton";

export default function ProvidersPage() {
  const ov = useProvidersOverview();
  const sync = useRemoteSyncReceiver({ onConnectionsUpdated: ov.setConnections });

  if (ov.loading) {
    return (
      <div className="flex flex-col gap-8"><CardSkeleton /><CardSkeleton /></div>
    );
  }

  const agAuthTypes = dualAuthTypes(OAUTH_PROVIDERS?.antigravity, "antigravity");
  const agStats = ov.getProviderStats("antigravity", agAuthTypes);

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Pinned Antigravity Flagship Banner */}
      <HudFrame
        chamfer="md"
        accent="cyan"
        padding="sm"
        spotlight={true}
        className="border-cyan-500/35 dark:border-cyan-400/30 bg-gradient-to-r from-cyan-500/[0.08] via-sky-500/[0.04] to-transparent"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="size-10 shrink-0 rounded-xl border border-cyan-500/35 bg-cyan-500/12 flex items-center justify-center shadow-[0_0_16px_rgba(6,182,212,0.2)]">
              <ProviderIcon
                src="/providers/antigravity.png"
                alt="Antigravity"
                size={24}
                className="size-6 rounded object-contain"
                fallbackText="AG"
              />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                  <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  ƯU TIÊN CHÍNH
                </span>
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-text-main">
                  Nhóm tài khoản Antigravity
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums">
                <span className="inline-flex items-center gap-1 rounded-md border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-2 py-0.5 text-text-muted">
                  TỔNG
                  <NumberTicker value={agStats.total} className="font-bold text-text-main" />
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  ĐÃ KẾT NỐI
                  <NumberTicker value={agStats.connected} className="font-bold" />
                </span>
                {agStats.error > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-2 py-0.5 text-rose-700 dark:text-rose-300">
                    <span className="size-1.5 rounded-full bg-rose-500" />
                    LỖI
                    <NumberTicker value={agStats.error} className="font-bold" />
                    {agStats.errorCode ? `(${agStats.errorCode})` : ""}
                  </span>
                )}
                {agStats.allDisabled && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                    ĐANG TẮT
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/dashboard/providers/antigravity"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cyan-500/45 bg-cyan-500/15 px-3 font-mono text-xs font-semibold text-cyan-700 dark:text-cyan-200 hover:bg-cyan-500/25 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">manage_accounts</span>
              <span>Quản lý tài khoản</span>
            </Link>
            <Link
              href="/dashboard/quota?provider=antigravity"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">data_usage</span>
              <span>Bảng Quota</span>
            </Link>
            <Link
              href="/dashboard/mitm"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-black/15 dark:border-white/15 bg-black/[0.03] dark:bg-white/[0.04] px-3 font-mono text-xs font-semibold text-text-main hover:border-cyan-500/45 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
            >
              <span className="material-symbols-outlined text-[15px]">security</span>
              <span>Proxy MITM</span>
            </Link>
          </div>
        </div>
      </HudFrame>

      <div className={`flex flex-wrap items-center gap-2 ${sync.isSyncReceiver ? "justify-between" : "justify-end"}`}>
        {sync.isSyncReceiver && (
          <button
            type="button"
            onClick={() => sync.setShowRemoteSyncModal(true)}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.14] px-3 text-xs font-medium text-emerald-600 dark:text-emerald-400 transition-all cursor-pointer"
            title="Cấu hình nhận tài khoản 1 chiều từ các máy nguồn"
          >
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="material-symbols-outlined text-[15px]">cloud_download</span>
            <span>Đồng bộ 1 chiều</span>
          </button>
        )}
        <select
          value={ov.statusFilter}
          onChange={(e) => ov.setStatusFilter(e.target.value)}
          className="h-8 rounded-lg border border-cyan-500/25 bg-black/[0.02] px-2.5 font-mono text-xs text-text-primary outline-none transition-colors hover:border-cyan-500/50 hover:bg-black/5 dark:bg-white/[0.03] dark:hover:bg-white/10"
          aria-label="Lọc nhà cung cấp theo trạng thái kết nối"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {!ov.hasAnyResult && (
        <div className="text-center py-8 border border-dashed border-border rounded-xl">
          <span className="material-symbols-outlined text-[32px] text-text-muted mb-2">search_off</span>
          <p className="text-text-muted text-sm">Không có nhà cung cấp nào khớp với từ khóa hoặc bộ lọc</p>
        </div>
      )}

      {/* Custom Providers (OpenAI/Anthropic Compatible) — dynamic */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 leading-tight">
            Nhà cung cấp tùy chỉnh (OpenAI / Anthropic Compatible){" "}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:w-auto">
            <Button size="sm" icon="add" onClick={() => ov.setShowAddAnthropicCompatibleModal(true)} className="w-full sm:w-auto">
              Thêm Anthropic Compatible
            </Button>
            <Button size="sm" variant="secondary" icon="add" onClick={() => ov.setShowAddCompatibleModal(true)} className="w-full !bg-white !text-black hover:!bg-gray-100 sm:w-auto">
              Thêm OpenAI Compatible
            </Button>
          </div>
        </div>
        {ov.compatibleProviders.length === 0 && ov.anthropicCompatibleProviders.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-xl text-text-muted text-sm">
            <span className="material-symbols-outlined text-[18px]">extension</span>
            <span>Chưa có nhà cung cấp tùy chỉnh — dùng các nút trên để thêm endpoint tương thích OpenAI / Anthropic</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {[...ov.compatibleProviders, ...ov.anthropicCompatibleProviders].map((info) => (
              <ApiKeyProviderCard
                key={info.id}
                providerId={info.id}
                provider={info}
                stats={ov.getProviderStats(info.id, "apikey")}
                authType="compatible"
                onToggle={(active) => ov.handleToggleProvider(info.id, "apikey", active)}
              />
            ))}
          </div>
        )}
      </div>

      {/* OAuth Providers */}
      {ov.oauthEntries.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 leading-tight">Nhà cung cấp OAuth</h2>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <ModelAvailabilityBadge />
              <BatchTestButton mode="oauth" testingMode={ov.testingMode} onTest={ov.handleBatchTest} label="OAuth" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {ov.oauthEntries.map(([key, info]) => (
              <ProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={ov.getProviderStats(key, dualAuthTypes(info, key))}
                authType="oauth"
                onToggle={(active) => ov.handleToggleProvider(key, dualAuthTypes(info, key), active)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Free Tier Providers */}
      {(ov.freeEntries.length > 0 || ov.freeTierEntries.length > 0) && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 leading-tight">Nhà cung cấp Miễn phí</h2>
            <BatchTestButton mode="free" testingMode={ov.testingMode} onTest={ov.handleBatchTest} label="Free" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {ov.freeEntries.map(([key, info]) => (
              <ProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={ov.getProviderStats(key, dualAuthTypes(info, key))}
                authType="free"
                onToggle={(active) => ov.handleToggleProvider(key, dualAuthTypes(info, key), active)}
              />
            ))}
            {ov.freeTierEntries.map(([key, info]) => {
              const types = dualAuthTypes(info, key);
              return (
                <ApiKeyProviderCard
                  key={key}
                  providerId={key}
                  provider={info}
                  stats={ov.getProviderStats(key, types)}
                  authType={Array.isArray(types) ? (types[0] ?? "apikey") : types}
                  onToggle={(active) => ov.handleToggleProvider(key, types, active)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* API Key Providers — fixed list */}
      {ov.apikeyEntries.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 leading-tight">Nhà cung cấp API Key </h2>
            <BatchTestButton mode="apikey" testingMode={ov.testingMode} onTest={ov.handleBatchTest} label="API Key" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {ov.visibleApikeyEntries.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={ov.getProviderStats(key, "apikey")}
                authType="apikey"
                onToggle={(active) => ov.handleToggleProvider(key, "apikey", active)}
              />
            ))}
            {ov.webCookieEntries.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={ov.getProviderStats(key, "cookie")}
                authType="cookie"
                onToggle={(active) => ov.handleToggleProvider(key, "cookie", active)}
              />
            ))}
          </div>
          {!ov.isApikeySearching && !ov.showAllApikey && ov.hiddenApikeyCount > 0 && (
            <button
              onClick={() => ov.setShowAllApikey(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
              Hiển thị toàn bộ {ov.apikeyEntries.length} nhà cung cấp
            </button>
          )}
        </div>
      )}

      <AddCompatibleModal
        variant="openai"
        isOpen={ov.showAddCompatibleModal}
        onClose={() => ov.setShowAddCompatibleModal(false)}
        onCreated={(node) => { ov.handleAddProviderNode(node); ov.setShowAddCompatibleModal(false); }}
      />
      <AddCompatibleModal
        variant="anthropic"
        isOpen={ov.showAddAnthropicCompatibleModal}
        onClose={() => ov.setShowAddAnthropicCompatibleModal(false)}
        onCreated={(node) => { ov.handleAddProviderNode(node); ov.setShowAddAnthropicCompatibleModal(false); }}
      />

      {sync.isSyncReceiver && (
        <RemoteSyncModal
          isOpen={sync.showRemoteSyncModal}
          onClose={() => sync.setShowRemoteSyncModal(false)}
          onSyncComplete={sync.handleSyncComplete}
        />
      )}

      <ProviderTestResultsModal results={ov.testResults} onClose={() => ov.setTestResults(null)} />
    </div>
  );
}
