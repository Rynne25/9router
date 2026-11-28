"use client";

import { useState, useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { getStatusVariant as getConnectionStatusVariant } from "@/shared/utils/connectionStatus";
import { getAntigravityEffectiveTier, getTierBadgeLabel } from "@/shared/utils/antigravityTier";
import PropTypes from "prop-types";
import { Badge, Toggle, Tooltip, Modal, Button } from "@/shared/components";
import { cn } from "@/shared/utils/cn";
import CooldownTimer from "./CooldownTimer";

function ConnectionRow({
  connection,
  proxyPools,
  isOAuth,
  isFirst,
  isLast,
  isLongList = false,
  onMoveUp,
  onMoveDown,
  onToggleActive,
  onUpdateProxy,
  onEdit,
  onDelete,
  oneByOneStatus = null,
  autoPing = null,
  providerId = null,
  onRefresh = null,
  activeClients = null,
  onActiveClientsChange = null,
}) {
  const [showProxyDropdown, setShowProxyDropdown] = useState(false);
  const [updatingProxy, setUpdatingProxy] = useState(false);
  const proxyDropdownRef = useRef(null);
  const proxyBtnRef = useRef(null);
  const [proxyDropdownStyle, setProxyDropdownStyle] = useState(null);

  const proxyPoolMap = new Map((proxyPools || []).map((pool) => [pool.id, pool]));
  const boundProxyPoolId = connection.providerSpecificData?.proxyPoolId || null;
  const boundProxyPool = boundProxyPoolId ? proxyPoolMap.get(boundProxyPoolId) : null;
  const hasLegacyProxy =
    connection.providerSpecificData?.connectionProxyEnabled === true &&
    !!connection.providerSpecificData?.connectionProxyUrl;
  const hasAnyProxy = !!boundProxyPoolId || hasLegacyProxy;
  const proxyDisplayText = boundProxyPool
    ? `Pool: ${boundProxyPool.name}`
    : boundProxyPoolId
      ? `Pool: ${boundProxyPoolId} (tạm tắt / không tìm thấy)`
      : hasLegacyProxy
        ? `Legacy: ${connection.providerSpecificData?.connectionProxyUrl}`
        : "";

  const autoPingTooltip = (() => {
    if (!autoPing) return "";
    const activeModes = [];
    if (autoPing.reactiveOn) activeModes.push("Khi reset");
    if (autoPing.scheduleOn) activeModes.push(`Theo lịch (${autoPing.scheduleSummary || "đang bật"})`);
    if (activeModes.length > 0) {
      return `Auto-Ping đang bật: ${activeModes.join(" + ")}. Bấm để cấu hình.`;
    }
    return autoPing.provider === "codex"
      ? "Tự động mở cửa sổ Codex 5h tiếp theo sau khi reset hoặc theo lịch. Bấm để cấu hình."
      : "Tự động mở cửa sổ Quota mới khi reset hoặc theo lịch cố định. Bấm để cấu hình.";
  })();

  let maskedProxyUrl = "";
  if (boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl) {
    const rawProxyUrl = boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl;
    try {
      const parsed = new URL(rawProxyUrl);
      maskedProxyUrl = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
    } catch {
      maskedProxyUrl = rawProxyUrl;
    }
  }

  const noProxyText = boundProxyPool?.noProxy || connection.providerSpecificData?.connectionNoProxy || "";

  let proxyBadgeVariant = "default";
  if (boundProxyPool?.isActive === true) {
    proxyBadgeVariant = "success";
  } else if (boundProxyPoolId || hasLegacyProxy) {
    proxyBadgeVariant = "error";
  }

  // Render via portal + fixed positioning so ancestor overflow (scrollable
  // connections list) can't clip the dropdown
  const toggleProxyDropdown = () => {
    if (showProxyDropdown) {
      setShowProxyDropdown(false);
      return;
    }
    const rect = proxyBtnRef.current?.getBoundingClientRect();
    if (!rect) {
      setShowProxyDropdown(true);
      return;
    }
    const estimatedHeight = ((proxyPools?.length || 0) + 1) * 34 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    setProxyDropdownStyle({
      position: "fixed",
      right: window.innerWidth - rect.right,
      ...(flipUp
        ? { bottom: window.innerHeight - rect.top + 4, maxHeight: Math.max(rect.top - 8, 120) }
        : { top: rect.bottom + 4, maxHeight: Math.max(spaceBelow - 8, 120) }),
    });
    setShowProxyDropdown(true);
  };

  // Close dropdown when clicking outside, scrolling, or resizing
  useEffect(() => {
    if (!showProxyDropdown) return;
    const handleClick = (e) => {
      if (
        proxyDropdownRef.current?.contains(e.target) ||
        proxyBtnRef.current?.contains(e.target)
      ) {
        return;
      }
      setShowProxyDropdown(false);
    };
    const close = () => setShowProxyDropdown(false);
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [showProxyDropdown]);

  const handleSelectProxy = async (poolId) => {
    setUpdatingProxy(true);
    try {
      await onUpdateProxy(poolId === "__none__" ? null : poolId);
    } finally {
      setUpdatingProxy(false);
      setShowProxyDropdown(false);
    }
  };

  // Antigravity specific state & data
  const isAntigravity = providerId === "antigravity" || connection.provider === "antigravity";
  const effectiveTier = isAntigravity
    ? getAntigravityEffectiveTier(connection)
    : (connection.subscriptionTier || connection.providerSpecificData?.tier || "free").toLowerCase();
  const tier = getTierBadgeLabel(effectiveTier);

  const isValidationBlocked = Boolean(
    connection.validationBlocked ||
      connection.providerSpecificData?.validationBlocked ||
      connection.providerSpecificData?.isValidationBlocked
  );
  const validationReason =
    connection.validationReason ||
    connection.providerSpecificData?.validationReason ||
    "Tài khoản cần hoàn thành bước xác minh danh tính hoặc bị hạn chế bởi Google Cloud.";
  const validationUrl =
    connection.validationUrl ||
    connection.providerSpecificData?.validationUrl ||
    connection.providerSpecificData?.appealUrl ||
    null;

  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [copiedFixCmd, setCopiedFixCmd] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showRawReason, setShowRawReason] = useState(false);
  const [showQuickFix, setShowQuickFix] = useState(false);
  const [switchingTarget, setSwitchingTarget] = useState(null);
  const [warmingUp, setWarmingUp] = useState(false);
  const [actionToast, setActionToast] = useState(null);

  useEffect(() => {
    if (!actionToast) return;
    const timer = setTimeout(() => setActionToast(null), 3500);
    return () => clearTimeout(timer);
  }, [actionToast]);

  const handleCopyFixCmd = async () => {
    try {
      await navigator.clipboard.writeText("gcloud auth login --update-adc");
      setCopiedFixCmd(true);
      setTimeout(() => setCopiedFixCmd(false), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  const matchActiveClient = (connId, email) => {
    if (!isAntigravity) return false;
    if (connId) return connId === connection.id;
    if (!email) return false;
    const targetEmail = email.toLowerCase().trim();
    const connEmail = (connection.email || connection.name || "").toLowerCase().trim();
    return !!connEmail && connEmail === targetEmail;
  };

  const isActive20 = matchActiveClient(activeClients?.classicConnectionId, activeClients?.classicEmail);
  const isActiveIde = matchActiveClient(activeClients?.ideConnectionId, activeClients?.ideEmail);
  const isActiveCli = matchActiveClient(activeClients?.agyConnectionId, activeClients?.agyEmail);

  const handleSwitch = async (target) => {
    if (switchingTarget) return;
    setSwitchingTarget(target);
    setActionToast(null);
    try {
      const res = await fetch("/api/oauth/antigravity/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id, target }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionToast({ type: "error", text: data?.error || `Chuyển sang ${target} thất bại` });
      } else {
        if (data.activeClients && typeof onActiveClientsChange === "function") {
          onActiveClientsChange(data.activeClients);
        }
        let msg;
        if (target === "2.0" || target === "classic") {
          msg = data.hotSwitched
            ? "Đã chuyển Antigravity 2.0 thành công (Hot-reload language_server)!"
            : data.restarted
              ? "Đã chuyển Antigravity 2.0 và khởi động lại ứng dụng!"
              : "Đã nạp tài khoản cho Antigravity 2.0 (Keyring gemini:antigravity)!";
        } else if (target === "ide") {
          msg = data.restarted
            ? "Đã chuyển Antigravity IDE và khởi động lại IDE thành công!"
            : "Đã nạp tài khoản vào Antigravity IDE (state.vscdb + Keyring)!";
        } else {
          msg = "Đã chuyển Antigravity CLI (agy) và xác thực Keyring thành công!";
        }
        setActionToast({ type: "success", text: msg });
        if (typeof onRefresh === "function") {
          onRefresh();
        }
      }
    } catch (err) {
      setActionToast({ type: "error", text: err.message || "Lỗi khi chuyển tài khoản" });
    } finally {
      setSwitchingTarget(null);
    }
  };

  const handleWarmup = async () => {
    if (warmingUp) return;
    setWarmingUp(true);
    setActionToast(null);
    try {
      const res = await fetch("/api/oauth/antigravity/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: connection.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || data.result?.ok === false) {
        const errMsg = data?.error || data?.result?.error || "Làm nóng tài khoản thất bại";
        setActionToast({ type: "error", text: errMsg });
      } else {
        setActionToast({ type: "success", text: "Warmup thành công! Quota tuần đã kích hoạt." });
      }
      if (typeof onRefresh === "function") {
        onRefresh();
      }
    } catch (err) {
      setActionToast({ type: "error", text: err.message || "Lỗi mạng khi gọi Warmup" });
    } finally {
      setWarmingUp(false);
    }
  };

  const handleCopyLink = async () => {
    if (!validationUrl) return;
    try {
      await navigator.clipboard.writeText(validationUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // fallback
    }
  };

  const rowAuthType = connection.authType || (isOAuth ? "oauth" : "apikey");
  const isOAuthConnection = rowAuthType === "oauth";
  const isCookieConnection = rowAuthType === "cookie";
  const isLeaseConnection = rowAuthType === "mcode-lease";
  const authIcon = isLeaseConnection
    ? "desktop_windows"
    : isCookieConnection
      ? "cookie"
      : isOAuthConnection
        ? "lock"
        : "key";
  const authLabel = isLeaseConnection
    ? "Desktop Lease"
    : isOAuthConnection
      ? "OAuth"
      : isCookieConnection
        ? "Cookie"
        : "API Key";
  const displayName =
    connection.name?.trim() ||
    connection.email?.trim() ||
    connection.displayName?.trim() ||
    (isLeaseConnection
      ? "Desktop Lease"
      : isOAuthConnection
        ? "Tài khoản OAuth"
        : isCookieConnection
          ? "Tài khoản Cookie"
          : "API Key");
  const secondaryDisplayName =
    connection.name?.trim() && connection.email?.trim() && connection.name.trim() !== connection.email.trim()
      ? connection.email.trim()
      : connection.name?.trim() &&
          connection.displayName?.trim() &&
          connection.name.trim() !== connection.displayName.trim()
        ? connection.displayName.trim()
        : null;

  // Use useState + useEffect for impure Date.now() to avoid calling during render
  const [isCooldown, setIsCooldown] = useState(false);

  // Get earliest model lock timestamp (useEffect handles the Date.now() comparison)
  const modelLockUntil =
    Object.entries(connection)
      .filter(([k]) => k.startsWith("modelLock_"))
      .map(([, v]) => v)
      .filter((v) => !!v)
      .sort()[0] || null;

  useEffect(() => {
    const checkCooldown = () => {
      const until =
        Object.entries(connection)
          .filter(([k]) => k.startsWith("modelLock_"))
          .map(([, v]) => v)
          .filter((v) => v && new Date(v).getTime() > Date.now())
          .sort()[0] || null;
      setIsCooldown(!!until);
    };

    checkCooldown();
    const interval = modelLockUntil ? setInterval(checkCooldown, 1000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [modelLockUntil, connection]);

  // Determine effective status (override unavailable if cooldown expired)
  const isBlocked403 = isAntigravity && isValidationBlocked;
  const effectiveStatus =
    connection.testStatus === "unavailable" && !isCooldown ? "active" : connection.testStatus;

  const getStatusVariant = () => {
    if (isBlocked403) return "error";
    return getConnectionStatusVariant(connection.isActive, effectiveStatus);
  };

  const statusLabelMap = {
    active: "hoạt động",
    error: "lỗi",
    unavailable: "tạm khóa",
  };
  const statusDisplayLabel = isBlocked403
    ? "403"
    : connection.isActive === false
      ? "đã tắt"
      : statusLabelMap[effectiveStatus] || effectiveStatus || "chưa rõ";

  const getOneByOneVariant = () => {
    if (!oneByOneStatus) return "default";
    if (oneByOneStatus.state === "success") return "success";
    if (oneByOneStatus.state === "failed") return "error";
    if (oneByOneStatus.state === "testing") return "primary";
    return "default";
  };

  const getOneByOneLabel = () => {
    if (!oneByOneStatus) return null;
    if (oneByOneStatus.state === "queued") return "đang chờ";
    if (oneByOneStatus.state === "testing") return "đang test";
    if (oneByOneStatus.state === "success") return "thành công";
    if (oneByOneStatus.state === "failed") {
      return oneByOneStatus.error ? `thất bại: ${oneByOneStatus.error}` : "thất bại";
    }
    return null;
  };

  const getRailClass = () => {
    if (isBlocked403 || (connection.isActive !== false && (effectiveStatus === "error" || effectiveStatus === "unavailable"))) {
      return "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]";
    }
    if (connection.isActive === false) {
      return "bg-slate-400/50 dark:bg-slate-600/60";
    }
    if (isCooldown) {
      return "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.55)]";
    }
    if (isAntigravity) {
      if (effectiveTier === "ultra") return "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.55)]";
      if (effectiveTier === "pro") return "bg-purple-400 shadow-[0_0_10px_rgba(192,132,252,0.55)]";
      if (effectiveTier === "pro_jiro") return "bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.6)]";
      if (effectiveTier === "plus") return "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.55)]";
      if (effectiveTier === "enterprise") return "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]";
    }
    return "bg-emerald-500/85 shadow-[0_0_8px_rgba(16,185,129,0.45)]";
  };

  return (
    <div
      style={
        isLongList && !showProxyDropdown && !showBlockedModal
          ? { contentVisibility: "auto", containIntrinsicSize: "auto 76px" }
          : undefined
      }
      className={cn(
        "group relative flex min-w-0 flex-col gap-3 rounded-xl border border-transparent p-2.5 transition-all duration-200 sm:flex-row sm:items-center sm:justify-between",
        "hover:border-cyan-500/30 hover:bg-cyan-500/[0.03] dark:hover:border-cyan-400/30 dark:hover:bg-cyan-400/[0.04]",
        showProxyDropdown && "z-30",
        connection.isActive === false && "opacity-60"
      )}
    >
      {/* Subtle hover spotlight & top beam accent — isolated from focus-visible outlines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/[0.04] via-transparent to-transparent" />
      </div>

      <div className="relative z-10 flex min-w-0 flex-1 items-start gap-2.5 sm:items-center sm:gap-3">
        {/* Health / Tier vertical status rail */}
        <span
          aria-hidden="true"
          className={cn("w-1 self-stretch min-h-[2.25rem] shrink-0 rounded-full transition-colors", getRailClass())}
        />

        {/* Priority arrows */}
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label="Tăng độ ưu tiên (Priority)"
            title="Tăng Priority"
            className={cn(
              "rounded p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50",
              isFirst
                ? "cursor-not-allowed text-text-muted/30"
                : "text-text-muted hover:bg-sidebar hover:text-cyan-600 dark:hover:text-cyan-300"
            )}
          >
            <span className="material-symbols-outlined text-sm">keyboard_arrow_up</span>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label="Giảm độ ưu tiên (Priority)"
            title="Giảm Priority"
            className={cn(
              "rounded p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50",
              isLast
                ? "cursor-not-allowed text-text-muted/30"
                : "text-text-muted hover:bg-sidebar hover:text-cyan-600 dark:hover:text-cyan-300"
            )}
          >
            <span className="material-symbols-outlined text-sm">keyboard_arrow_down</span>
          </button>
        </div>

        <span className="material-symbols-outlined shrink-0 text-base text-text-muted">{authIcon}</span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayName}</p>
          {secondaryDisplayName && <p className="truncate text-xs text-text-muted">{secondaryDisplayName}</p>}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
            <Badge variant={getStatusVariant()} size="sm" dot>
              {statusDisplayLabel}
            </Badge>
            <Badge variant="default" size="sm">
              {authLabel}
            </Badge>
            {isAntigravity && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  effectiveTier === "pro" &&
                    "border border-purple-500/30 bg-gradient-to-r from-purple-500/15 to-pink-500/15 text-purple-600 dark:text-purple-400",
                  effectiveTier === "plus" &&
                    "border border-blue-500/30 bg-gradient-to-r from-blue-500/15 to-cyan-500/15 text-blue-600 dark:text-blue-400",
                  effectiveTier === "pro_jiro" &&
                    "border border-cyan-500/30 bg-gradient-to-r from-cyan-500/15 to-indigo-500/15 text-cyan-600 dark:text-cyan-400",
                  effectiveTier === "ultra" &&
                    "border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  effectiveTier === "enterprise" &&
                    "border border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                  effectiveTier === "free" &&
                    "border border-gray-500/20 bg-gray-500/15 text-gray-600 dark:text-gray-400"
                )}
              >
                {tier}
              </span>
            )}
            {isAntigravity && isValidationBlocked && (
              <button
                type="button"
                onClick={() => setShowBlockedModal(true)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 dark:text-red-400"
                title="Nhấp để xem lý do và cách khắc phục"
              >
                <span className="material-symbols-outlined text-[12px]">lock</span>
                <span>Bị cấm, bỏ qua tự động làm mới | Xem lý do</span>
              </button>
            )}
            {actionToast && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  actionToast.type === "success"
                    ? "border border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400"
                    : "border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
                )}
              >
                <span>{actionToast.type === "success" ? "✓" : "✗"}</span>
                <span>{actionToast.text}</span>
              </span>
            )}
            {hasAnyProxy && (
              <Badge variant={proxyBadgeVariant} size="sm">
                Proxy
              </Badge>
            )}
            {isCooldown && connection.isActive !== false && <CooldownTimer until={modelLockUntil} />}
            {connection.lastError && connection.isActive !== false && (
              <span className="max-w-full truncate text-xs text-red-500 sm:max-w-[300px]" title={connection.lastError}>
                {connection.lastError}
              </span>
            )}
            <span className="font-mono text-xs text-text-muted" title="Priority">
              #{connection.priority}
            </span>
            {connection.globalPriority && (
              <span className="font-mono text-xs text-text-muted">Auto: {connection.globalPriority}</span>
            )}
            {getOneByOneLabel() && (
              <Badge variant={getOneByOneVariant()} size="sm">
                {getOneByOneLabel()}
              </Badge>
            )}
          </div>
          {hasAnyProxy && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="max-w-full truncate text-[11px] text-text-muted sm:max-w-[420px]" title={proxyDisplayText}>
                {proxyDisplayText}
              </span>
              {maskedProxyUrl && (
                <code className="max-w-full truncate rounded bg-black/5 px-1 py-0.5 font-mono text-[10px] text-text-muted dark:bg-white/5 sm:max-w-[260px]">
                  {maskedProxyUrl}
                </code>
              )}
              {noProxyText && (
                <span className="max-w-full truncate text-[11px] text-text-muted sm:max-w-[320px]" title={noProxyText}>
                  no_proxy: {noProxyText}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
        {isAntigravity && (
          <div className="mr-1 flex items-center gap-1.5 border-r border-black/10 pr-2 dark:border-white/10">
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-black/10 bg-black/[0.03] p-0.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <Tooltip
                text={
                  isActive20
                    ? "Đang dùng trên Antigravity 2.0 (Bấm để nạp lại)"
                    : "Chuyển sang Antigravity 2.0 (Keyring + Hot reload)"
                }
              >
                <button
                  type="button"
                  onClick={() => handleSwitch("2.0")}
                  disabled={switchingTarget !== null}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:opacity-50",
                    isActive20
                      ? "border border-blue-500/30 bg-blue-500/15 font-semibold text-blue-600 dark:text-blue-400"
                      : "text-text-muted hover:bg-white hover:text-text-primary dark:hover:bg-white/10"
                  )}
                >
                  {switchingTarget === "2.0" || switchingTarget === "classic" ? "..." : "2.0"}
                </button>
              </Tooltip>

              <Tooltip
                text={
                  isActiveIde
                    ? "Đang dùng trên Antigravity IDE (Bấm để nạp lại)"
                    : "Chuyển sang Antigravity IDE (state.vscdb + Keyring)"
                }
              >
                <button
                  type="button"
                  onClick={() => handleSwitch("ide")}
                  disabled={switchingTarget !== null}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:opacity-50",
                    isActiveIde
                      ? "border border-sky-500/30 bg-sky-500/15 font-semibold text-sky-600 dark:text-sky-400"
                      : "text-text-muted hover:bg-white hover:text-text-primary dark:hover:bg-white/10"
                  )}
                >
                  {switchingTarget === "ide" ? "..." : "IDE"}
                </button>
              </Tooltip>

              <Tooltip
                text={
                  isActiveCli
                    ? "Đang dùng trên Antigravity CLI (Bấm để nạp lại)"
                    : "Chuyển sang Antigravity CLI (agy)"
                }
              >
                <button
                  type="button"
                  onClick={() => handleSwitch("agy")}
                  disabled={switchingTarget !== null}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 disabled:opacity-50",
                    isActiveCli
                      ? "border border-emerald-500/30 bg-emerald-500/15 font-semibold text-emerald-600 dark:text-emerald-400"
                      : "text-text-muted hover:bg-white hover:text-text-primary dark:hover:bg-white/10"
                  )}
                >
                  {switchingTarget === "agy" ? "..." : "CLI"}
                </button>
              </Tooltip>
            </div>

            <Tooltip text="Warmup kích hoạt Quota tuần">
              <button
                type="button"
                onClick={handleWarmup}
                disabled={warmingUp}
                aria-label="Warmup tài khoản"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-amber-500 transition-colors hover:bg-amber-500/10 hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:opacity-50"
              >
                <span className={cn("material-symbols-outlined text-[16px]", warmingUp && "animate-spin")}>
                  {warmingUp ? "progress_activity" : "local_fire_department"}
                </span>
              </button>
            </Tooltip>
          </div>
        )}

        <div className="grid flex-1 grid-cols-3 gap-1 sm:flex sm:flex-none">
          {/* Proxy button with inline dropdown */}
          {(proxyPools || []).length > 0 && (
            <div>
              <button
                ref={proxyBtnRef}
                type="button"
                onClick={toggleProxyDropdown}
                className={cn(
                  "flex w-full flex-col items-center rounded px-2 py-1 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 dark:hover:bg-white/5",
                  hasAnyProxy ? "text-cyan-600 dark:text-cyan-300" : "text-text-muted hover:text-cyan-600 dark:hover:text-cyan-300"
                )}
                disabled={updatingProxy}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {updatingProxy ? "progress_activity" : "lan"}
                </span>
                <span className="text-[10px] leading-tight">Proxy</span>
              </button>
              {showProxyDropdown &&
                createPortal(
                  <div
                    ref={proxyDropdownRef}
                    style={proxyDropdownStyle}
                    className="z-50 min-w-[160px] max-w-[78vw] overflow-y-auto rounded-lg border border-border bg-bg py-1 shadow-lg"
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectProxy("__none__")}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5",
                        !boundProxyPoolId ? "font-medium text-primary" : "text-text-main"
                      )}
                    >
                      Không dùng Proxy
                    </button>
                    {(proxyPools || []).map((pool) => (
                      <button
                        key={pool.id}
                        type="button"
                        onClick={() => handleSelectProxy(pool.id)}
                        className={cn(
                          "w-full px-3 py-1.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5",
                          boundProxyPoolId === pool.id ? "font-medium text-primary" : "text-text-main"
                        )}
                      >
                        {pool.name}
                      </button>
                    ))}
                  </div>,
                  document.body
                )}
            </div>
          )}

          {autoPing && (
            <Tooltip text={autoPingTooltip}>
              <button
                type="button"
                onClick={autoPing.onConfigure}
                className={cn(
                  "flex w-full flex-col items-center rounded px-2 py-1 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 dark:hover:bg-white/5",
                  autoPing.isActive ? "text-cyan-600 dark:text-cyan-300" : "text-text-muted hover:text-cyan-600 dark:hover:text-cyan-300"
                )}
              >
                <span className="material-symbols-outlined text-[18px]">bolt</span>
                <span className="text-[10px] leading-tight">Auto-Ping</span>
              </button>
            </Tooltip>
          )}

          <button
            type="button"
            onClick={onEdit}
            className="flex flex-col items-center rounded px-2 py-1 text-text-muted transition-colors hover:bg-black/5 hover:text-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 dark:hover:bg-white/5 dark:hover:text-cyan-300"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            <span className="text-[10px] leading-tight">Sửa</span>
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="flex flex-col items-center rounded px-2 py-1 text-rose-500 transition-colors hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
          >
            <span className="material-symbols-outlined text-[18px]">delete</span>
            <span className="text-[10px] leading-tight">Xóa</span>
          </button>
        </div>

        <Toggle
          size="sm"
          checked={connection.isActive ?? true}
          onChange={onToggleActive}
          title={(connection.isActive ?? true) ? "Tắt kết nối" : "Bật kết nối"}
        />
      </div>

      {showBlockedModal && (
        <Modal
          isOpen={showBlockedModal}
          onClose={() => setShowBlockedModal(false)}
          title="Chi tiết lỗi"
          size="md"
        >
          <div className="flex flex-col gap-3.5 text-xs">
            <div className="-mt-1 mb-1 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/15 text-red-500">
                <span className="material-symbols-outlined text-[28px]">cancel</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Tài khoản
              </label>
              <div className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-text-main">
                {displayName}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Trạng thái lỗi
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-500">
                  <span className="material-symbols-outlined text-[13px]">block</span>
                  Proxy bị vô hiệu hóa
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/15 px-2.5 py-1 text-[11px] font-medium text-yellow-400">
                  <span className="material-symbols-outlined text-[13px]">schedule</span>
                  Cần xác minh tài khoản
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  Lý do
                </label>
                <button
                  type="button"
                  onClick={() => setShowRawReason(!showRawReason)}
                  className="flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <span className="material-symbols-outlined text-[12px]">description</span>
                  {showRawReason ? "Thu gọn" : "Xem chi tiết"}
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-red-500/30 bg-[#0d1117] p-3 font-mono text-xs text-red-400">
                {showRawReason
                  ? connection.lastError || validationReason
                  : "Vui lòng xác minh tài khoản để tiếp tục."}
              </div>
            </div>

            {validationUrl && (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={validationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  <span>Nhấp để xác minh</span>
                </a>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={copiedLink ? "check" : "content_copy"}
                  onClick={handleCopyLink}
                >
                  {copiedLink ? "Đã sao chép link" : "Chép link xác minh"}
                </Button>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface-2">
              <button
                type="button"
                onClick={() => setShowQuickFix(!showQuickFix)}
                className="flex w-full cursor-pointer items-center justify-between p-2.5 text-xs font-medium text-text-main transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="flex items-center gap-1.5 text-primary">
                  <span className="material-symbols-outlined text-[14px]">terminal</span>
                  <span>Sửa nhanh qua Terminal (Xử lý lỗi 403 nội bộ)</span>
                </span>
                <span className="material-symbols-outlined text-[16px] text-text-muted">
                  {showQuickFix ? "expand_less" : "expand_more"}
                </span>
              </button>
              {showQuickFix && (
                <div className="flex flex-col gap-2 border-t border-border-subtle p-3 pt-1">
                  <div className="flex items-center justify-between rounded border border-white/5 bg-black/40 p-2 font-mono text-[11px]">
                    <code className="truncate text-primary">gcloud auth login --update-adc</code>
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={copiedFixCmd ? "check" : "content_copy"}
                      onClick={handleCopyFixCmd}
                    >
                      {copiedFixCmd ? "Đã chép" : "Chép"}
                    </Button>
                  </div>
                  <p className="text-[10px] text-text-muted">
                    Lệnh trên sẽ mở trình duyệt để xác thực lại Google Cloud Application Default Credentials (ADC).
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 text-[11px] text-text-muted">
              <span className="material-symbols-outlined text-[13px]">schedule</span>
              <span>
                Thời gian phát hiện:{" "}
                {connection.providerSpecificData?.lastVerificationDetectedAt
                  ? new Date(connection.providerSpecificData.lastVerificationDetectedAt).toLocaleString("vi-VN")
                  : new Date().toLocaleString("vi-VN")}
              </span>
            </div>

            <div className="pt-2">
              <Button onClick={() => setShowBlockedModal(false)} className="w-full py-2.5 font-medium" variant="primary">
                Đóng
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

ConnectionRow.propTypes = {
  connection: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
    displayName: PropTypes.string,
    authType: PropTypes.string,
    modelLockUntil: PropTypes.string,
    testStatus: PropTypes.string,
    isActive: PropTypes.bool,
    lastError: PropTypes.string,
    priority: PropTypes.number,
    globalPriority: PropTypes.number,
    provider: PropTypes.string,
    subscriptionTier: PropTypes.string,
    validationBlocked: PropTypes.bool,
    validationReason: PropTypes.string,
    validationUrl: PropTypes.string,
    providerSpecificData: PropTypes.object,
  }).isRequired,
  proxyPools: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      proxyUrl: PropTypes.string,
      noProxy: PropTypes.string,
      isActive: PropTypes.bool,
    })
  ),
  isOAuth: PropTypes.bool.isRequired,
  isFirst: PropTypes.bool.isRequired,
  isLast: PropTypes.bool.isRequired,
  isLongList: PropTypes.bool,
  onMoveUp: PropTypes.func.isRequired,
  onMoveDown: PropTypes.func.isRequired,
  onToggleActive: PropTypes.func.isRequired,
  onUpdateProxy: PropTypes.func,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  oneByOneStatus: PropTypes.shape({
    state: PropTypes.string,
    error: PropTypes.string,
  }),
  autoPing: PropTypes.shape({
    isActive: PropTypes.bool,
    provider: PropTypes.string,
    reactiveOn: PropTypes.bool,
    scheduleOn: PropTypes.bool,
    scheduleSummary: PropTypes.string,
    onConfigure: PropTypes.func,
  }),
  providerId: PropTypes.string,
  onRefresh: PropTypes.func,
  activeClients: PropTypes.shape({
    classicConnectionId: PropTypes.string,
    classicEmail: PropTypes.string,
    ideConnectionId: PropTypes.string,
    ideEmail: PropTypes.string,
    agyConnectionId: PropTypes.string,
    agyEmail: PropTypes.string,
  }),
  onActiveClientsChange: PropTypes.func,
};

function areConnectionRowPropsEqual(prev, next) {
  return (
    prev.connection === next.connection &&
    prev.rowIndex === next.rowIndex &&
    prev.isFirst === next.isFirst &&
    prev.isLast === next.isLast &&
    prev.isLongList === next.isLongList &&
    prev.isOAuth === next.isOAuth &&
    prev.proxyPools === next.proxyPools &&
    prev.providerId === next.providerId &&
    prev.activeClients === next.activeClients &&
    prev.onActiveClientsChange === next.onActiveClientsChange &&
    prev.oneByOneStatus === next.oneByOneStatus &&
    prev.autoPing?.isActive === next.autoPing?.isActive &&
    prev.autoPing?.reactiveOn === next.autoPing?.reactiveOn &&
    prev.autoPing?.scheduleOn === next.autoPing?.scheduleOn &&
    prev.autoPing?.provider === next.autoPing?.provider &&
    prev.autoPing?.scheduleSummary === next.autoPing?.scheduleSummary
  );
}

export default memo(ConnectionRow, areConnectionRowPropsEqual);
