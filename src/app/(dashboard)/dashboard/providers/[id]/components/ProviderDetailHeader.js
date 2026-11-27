"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import PropTypes from "prop-types";
import { Button } from "@/shared/components";
import { HudFrame, NumberTicker, MagneticButton } from "@/shared/components/hud";
import { getProviderIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";

/**
 * Render provider detail page header, Cyber-Bento Pro telemetry Hero,
 * deprecation/notice banners, and compatible node details card.
 */
export default function ProviderDetailHeader({
  providerInfo,
  providerNode,
  connectionsCount,
  connections = [],
  isOpenAICompatible,
  isAnthropicCompatible,
  isCompatible,
  onOpenAddApiKey,
  onOpenEditNode,
  onDeleteNode,
}) {
  const [headerImgError, setHeaderImgError] = useState(false);

  const isAntigravity = providerInfo?.id === "antigravity";

  const getHeaderIconPath = () => {
    if (isOpenAICompatible && providerInfo.apiType) {
      return providerInfo.apiType === "responses" ? "/providers/oai-r.png" : "/providers/oai-cc.png";
    }
    if (isAnthropicCompatible) {
      return "/providers/anthropic-m.png";
    }
    return getProviderIconSrc(providerInfo.id);
  };

  const iconPath = getHeaderIconPath();

  const healthyCount = connections.filter(
    (c) =>
      c.isActive !== false &&
      !c.validationBlocked &&
      !c.providerSpecificData?.validationBlocked &&
      c.testStatus !== "error" &&
      c.testStatus !== "unavailable"
  ).length;

  const issueCount = connections.filter(
    (c) =>
      c.isActive !== false &&
      (c.validationBlocked ||
        c.providerSpecificData?.validationBlocked ||
        c.testStatus === "error" ||
        c.testStatus === "unavailable")
  ).length;

  return (
    <>
      <div className="min-w-0 flex flex-col gap-4">
        <Link
          href="/dashboard/providers"
          data-cursor-target
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:border-cyan-500/40 hover:text-cyan-600 dark:border-white/10 dark:bg-white/[0.03] dark:hover:text-cyan-300"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          <span>Quay lại Nhà cung cấp</span>
        </Link>

        <HudFrame
          chamfer="md"
          accent="cyan"
          borderBeam={isAntigravity}
          spotlight
          statusDot
          padding="md"
          className={isAntigravity ? "hud-glow-cyan" : ""}
          header={
            isAntigravity
              ? "ANTIGRAVITY TELEMETRY // TRUNG TÂM TÀI KHOẢN"
              : `HỒ SƠ NHÀ CUNG CẤP // ${String(providerInfo.id || "").toUpperCase()}`
          }
        >
          <div className="pointer-events-none absolute inset-0 hud-grid-overlay opacity-35" aria-hidden="true" />
          <div className="relative z-10 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
              <div
                className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-black/[0.03] shadow-inner dark:bg-slate-950/60"
                style={{
                  backgroundColor: `${providerInfo.color}18`,
                  boxShadow: `0 0 24px -8px ${providerInfo.color}66`,
                }}
              >
                {headerImgError || !iconPath ? (
                  <span className="font-mono text-base font-bold" style={{ color: providerInfo.color }}>
                    {providerInfo.textIcon || providerInfo.id.slice(0, 2).toUpperCase()}
                  </span>
                ) : (
                  <Image
                    src={iconPath}
                    alt={providerInfo.name}
                    width={48}
                    height={48}
                    className="max-h-11 max-w-11 rounded-lg object-contain"
                    sizes="48px"
                    onError={() => {
                      markProviderIconMissing(providerInfo.id);
                      setHeaderImgError(true);
                    }}
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                    {providerInfo.name}
                  </h1>
                  {(providerInfo.notice?.apiKeyUrl || providerInfo.notice?.signupUrl || providerInfo.website) && (
                    <a
                      href={providerInfo.notice?.apiKeyUrl || providerInfo.notice?.signupUrl || providerInfo.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-cursor-target
                      className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-700 transition-colors hover:bg-cyan-500/20 dark:text-cyan-300"
                    >
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                      <span>{providerInfo.notice?.apiKeyUrl ? "Lấy API Key" : "Đăng ký / Tìm hiểu thêm"}</span>
                    </a>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-black/[0.03] px-2.5 py-1 font-mono text-text-main dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="size-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                    <NumberTicker value={connectionsCount} className="font-bold text-cyan-600 dark:text-cyan-300" />
                    <span className="text-text-muted">kết nối</span>
                  </span>

                  {connections.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-emerald-700 dark:text-emerald-300">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      <NumberTicker value={healthyCount} className="font-bold" />
                      <span>sẵn sàng</span>
                    </span>
                  )}

                  {issueCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/35 bg-rose-500/10 px-2.5 py-1 font-mono text-rose-700 dark:text-rose-300">
                      <span className="size-1.5 rounded-full bg-rose-500" />
                      <NumberTicker value={issueCount} className="font-bold" />
                      <span>cảnh báo</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {isAntigravity && (
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <MagneticButton strength={4}>
                  <Link
                    href="/dashboard/quota?provider=antigravity"
                    data-cursor-target
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3.5 font-mono text-xs font-semibold text-emerald-700 shadow-[0_0_18px_-6px_rgba(16,185,129,0.5)] transition-colors hover:bg-emerald-500/25 dark:text-emerald-300"
                  >
                    <span className="material-symbols-outlined text-[16px]">data_usage</span>
                    <span>Bảng Quota</span>
                  </Link>
                </MagneticButton>
                <MagneticButton strength={4}>
                  <Link
                    href="/dashboard/mitm"
                    data-cursor-target
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3.5 font-mono text-xs font-semibold text-cyan-700 shadow-[0_0_18px_-6px_rgba(34,211,238,0.5)] transition-colors hover:bg-cyan-500/25 dark:text-cyan-200"
                  >
                    <span className="material-symbols-outlined text-[16px]">security</span>
                    <span>Proxy MITM</span>
                  </Link>
                </MagneticButton>
              </div>
            )}
          </div>
        </HudFrame>
      </div>

      {providerInfo.deprecated && (
        <div className="flex items-start gap-2.5 rounded-xl border border-yellow-500/35 bg-yellow-500/10 px-3.5 py-2.5 backdrop-blur-md">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[16px] text-yellow-500">warning</span>
          <p className="text-xs leading-relaxed text-red-600 dark:text-yellow-300">{providerInfo.deprecationNotice}</p>
        </div>
      )}

      {providerInfo.notice?.text && !providerInfo.deprecated && (
        <div className="flex flex-col gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.08] px-3.5 py-2.5 backdrop-blur-md sm:flex-row sm:items-center">
          <span className="material-symbols-outlined shrink-0 text-[16px] text-cyan-500">info</span>
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-cyan-700 dark:text-cyan-300">
            {providerInfo.notice.text}
          </p>
          {providerInfo.notice.apiKeyUrl && (
            <a
              href={providerInfo.notice.apiKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-cursor-target
              className="inline-flex justify-center rounded-md bg-cyan-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-cyan-500 sm:py-0.5"
            >
              Lấy API Key →
            </a>
          )}
        </div>
      )}

      {isCompatible && providerNode && (
        <HudFrame chamfer="sm" accent="cyan" padding="md" spotlight>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">
                {isAnthropicCompatible ? "Chi tiết Node Anthropic Compatible" : "Chi tiết Node OpenAI Compatible"}
              </h2>
              <p className="break-all font-mono text-xs text-text-muted mt-1">
                {isAnthropicCompatible
                  ? "Messages API"
                  : providerNode.apiType === "responses"
                    ? "Responses API"
                    : "Chat Completions"}{" "}
                · {(providerNode.baseUrl || "").replace(/\/$/, "")}/
                {isAnthropicCompatible ? "messages" : providerNode.apiType === "responses" ? "responses" : "chat/completions"}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
              <Button size="sm" icon="add" onClick={onOpenAddApiKey} data-cursor-target className="w-full sm:w-auto">
                Thêm API Key
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="edit"
                onClick={onOpenEditNode}
                data-cursor-target
                className="w-full sm:w-auto"
              >
                Sửa
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon="delete"
                onClick={onDeleteNode}
                data-cursor-target
                className="w-full sm:w-auto"
              >
                Xóa
              </Button>
            </div>
          </div>
        </HudFrame>
      )}
    </>
  );
}

ProviderDetailHeader.propTypes = {
  providerInfo: PropTypes.object.isRequired,
  providerNode: PropTypes.object,
  connectionsCount: PropTypes.number.isRequired,
  connections: PropTypes.array,
  isOpenAICompatible: PropTypes.bool.isRequired,
  isAnthropicCompatible: PropTypes.bool.isRequired,
  isCompatible: PropTypes.bool.isRequired,
  onOpenAddApiKey: PropTypes.func.isRequired,
  onOpenEditNode: PropTypes.func.isRequired,
  onDeleteNode: PropTypes.func.isRequired,
};
