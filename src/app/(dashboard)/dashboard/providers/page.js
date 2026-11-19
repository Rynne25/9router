"use client";

import { CardSkeleton, Button } from "@/shared/components";
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

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
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
          className="h-8 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-text-primary outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
          aria-label="Filter providers by connection status"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {!ov.hasAnyResult && (
        <div className="text-center py-8 border border-dashed border-border rounded-xl">
          <span className="material-symbols-outlined text-[32px] text-text-muted mb-2">search_off</span>
          <p className="text-text-muted text-sm">No providers match your search or filters</p>
        </div>
      )}

      {/* Custom Providers (OpenAI/Anthropic Compatible) — dynamic */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 leading-tight">
            Custom Providers (OpenAI/Anthropic Compatible){" "}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:w-auto">
            <Button size="sm" icon="add" onClick={() => ov.setShowAddAnthropicCompatibleModal(true)} className="w-full sm:w-auto">
              Add Anthropic Compatible
            </Button>
            <Button size="sm" variant="secondary" icon="add" onClick={() => ov.setShowAddCompatibleModal(true)} className="w-full !bg-white !text-black hover:!bg-gray-100 sm:w-auto">
              Add OpenAI Compatible
            </Button>
          </div>
        </div>
        {ov.compatibleProviders.length === 0 && ov.anthropicCompatibleProviders.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-xl text-text-muted text-sm">
            <span className="material-symbols-outlined text-[18px]">extension</span>
            <span>No custom providers — use buttons above to add OpenAI/Anthropic compatible endpoints</span>
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
            <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 leading-tight">OAuth Providers</h2>
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
            <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 leading-tight">Free Tier Providers</h2>
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
            <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 leading-tight">API Key Providers </h2>
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
              Show all {ov.apikeyEntries.length} providers
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
