"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import PropTypes from "prop-types";
import { Button, Modal, Badge, SegmentedControl } from "@/shared/components";
import { cn } from "@/shared/utils/cn";

const PLACEHOLDER_REFRESH_TOKEN = `# 1. Dán một hoặc nhiều Refresh Token (bắt đầu bằng 1//)
1//0gExampleRefreshToken1234567890abcdef-XYZ_123
1//0gAnotherRefreshToken9876543210fedcba-ZYX_456

# 2. Hoặc dán mảng JSON tài khoản:
[
  {
    "email": "user1@example.com",
    "refresh_token": "1//0gExampleRefreshToken1234567890abcdef-XYZ_123"
  }
]`;

const REFRESH_TOKEN_REGEX = /1\/\/[a-zA-Z0-9_\-\.]+/g;

/**
 * Parse input string to detect tokens, JSON accounts, or raw refresh tokens.
 */
function parseTokenInput(rawText) {
  const trimmed = (rawText || "").trim();
  if (!trimmed) {
    return {
      type: "empty",
      tokens: [],
      accounts: [],
      validCount: 0,
      error: null,
    };
  }

  // Check if it might be JSON
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.accounts)
          ? parsed.accounts
          : [parsed];

      const accounts = [];
      const tokens = [];

      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const rt = item.refresh_token || item.refreshToken || item.token;
        if (typeof rt === "string" && rt.trim()) {
          const cleanToken = rt.trim();
          tokens.push(cleanToken);
          accounts.push({
            email: item.email || null,
            refresh_token: cleanToken,
            tier: item.tier || item.subscriptionTier || null,
            projectId: item.projectId || item.enterpriseGcpProjectId || null,
          });
        }
      }

      if (tokens.length > 0) {
        return {
          type: "json",
          tokens,
          accounts,
          validCount: tokens.length,
          error: null,
        };
      }
    } catch {
      // If JSON parsing fails, fall back to regex token matching
    }
  }

  // Regex extract all 1//... patterns
  const matches = trimmed.match(REFRESH_TOKEN_REGEX) || [];
  const uniqueTokens = Array.from(new Set(matches));

  if (uniqueTokens.length > 0) {
    return {
      type: uniqueTokens.length === 1 ? "single_token" : "multiline_token",
      tokens: uniqueTokens,
      accounts: uniqueTokens.map((t) => ({ refresh_token: t })),
      validCount: uniqueTokens.length,
      error: null,
    };
  }

  return {
    type: "unknown",
    tokens: [],
    accounts: [],
    validCount: 0,
    error: "Chưa nhận diện được Refresh Token. Token của Antigravity/Google bắt buộc bắt đầu bằng 1//...",
  };
}

export default function BulkImportAntigravityModal({ isOpen, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState("token"); // "token" | "ide"
  const [rawText, setRawText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [importResult, setImportResult] = useState(null);

  // Tab 2: Scan DB IDE State
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [detectedAccounts, setDetectedAccounts] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());

  // Real-time parsing analysis for Tab 1
  const parseInfo = useMemo(() => parseTokenInput(rawText), [rawText]);

  // Reset modal state on close
  const handleClose = useCallback(() => {
    if (submitting) return;
    setRawText("");
    setErrorMessage("");
    setImportResult(null);
    setSubmitProgress("");
    onClose();
  }, [submitting, onClose]);

  // Fetch local accounts from DB IDE (Tab 2)
  const fetchScannedAccounts = useCallback(async () => {
    setScanning(true);
    setScanError("");
    setImportResult(null);
    try {
      const res = await fetch("/api/oauth/antigravity/scan-db");
      const data = await res.json();
      if (!res.ok) {
        setScanError(data?.error || `Không thể quét DB: mã lỗi ${res.status}`);
        setDetectedAccounts([]);
        setSelectedIndices(new Set());
        return;
      }

      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.accounts)
          ? data.accounts
          : [];

      setDetectedAccounts(list);
      // Default: select all detected accounts
      setSelectedIndices(new Set(list.map((_, idx) => idx)));
    } catch (err) {
      setScanError(err.message || "Lỗi kết nối khi quét cơ sở dữ liệu Antigravity");
      setDetectedAccounts([]);
      setSelectedIndices(new Set());
    } finally {
      setScanning(false);
    }
  }, []);

  // When switching to 'ide' tab or modal opens on 'ide', scan automatically
  useEffect(() => {
    let cancelled = false;

    if (isOpen && activeTab === "ide" && detectedAccounts.length === 0 && !scanning && !scanError) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          fetchScannedAccounts();
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, detectedAccounts.length, scanning, scanError, fetchScannedAccounts]);

  // Tab 1 Submit: Import from text / JSON
  const handleSubmitTokens = async () => {
    setErrorMessage("");
    setImportResult(null);

    if (parseInfo.validCount === 0) {
      setErrorMessage(parseInfo.error || "Vui lòng nhập ít nhất một Refresh Token hợp lệ");
      return;
    }

    setSubmitting(true);
    setSubmitProgress(`Đang xử lý và kích hoạt ${parseInfo.validCount} tài khoản...`);

    try {
      const payload = {
        input: rawText.trim(),
        tokens: parseInfo.tokens,
        accounts: parseInfo.accounts,
      };

      const res = await fetch("/api/oauth/antigravity/import-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data?.error || data?.message || `Lỗi nhập token: ${res.status}`);
        return;
      }

      setImportResult(data);
      const successCount = data.success ?? data.imported ?? (data.results ? data.results.filter((r) => r.ok).length : 0);
      if (successCount > 0 && typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (err) {
      setErrorMessage(err.message || "Lỗi mạng khi nhập token");
    } finally {
      setSubmitting(false);
      setSubmitProgress("");
    }
  };

  // Tab 2 Submit: Import selected accounts from DB scan
  const handleImportScannedAccounts = async (accountsToImport) => {
    if (!accountsToImport || accountsToImport.length === 0) {
      setScanError("Vui lòng chọn ít nhất một tài khoản để nhập");
      return;
    }

    setSubmitting(true);
    setScanError("");
    setImportResult(null);
    setSubmitProgress(`Đang nhập ${accountsToImport.length} tài khoản từ IDE...`);

    try {
      const payload = {
        accounts: accountsToImport,
        tokens: accountsToImport.map((acc) => acc.refreshToken || acc.refresh_token).filter(Boolean),
      };

      const res = await fetch("/api/oauth/antigravity/import-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setScanError(data?.error || data?.message || `Lỗi nhập tài khoản: ${res.status}`);
        return;
      }

      setImportResult(data);
      const successCount = data.success ?? data.imported ?? (data.results ? data.results.filter((r) => r.ok).length : 0);
      if (successCount > 0 && typeof onSuccess === "function") {
        onSuccess();
      }
    } catch (err) {
      setScanError(err.message || "Lỗi khi nhập tài khoản từ DB");
    } finally {
      setSubmitting(false);
      setSubmitProgress("");
    }
  };

  // Tab 2: Toggle select all
  const toggleSelectAll = () => {
    if (selectedIndices.size === detectedAccounts.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(detectedAccounts.map((_, idx) => idx)));
    }
  };

  // Tab 2: Toggle individual row
  const toggleSelectRow = (index) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Find the primary / currently active account in IDE
  const currentActiveAccount = useMemo(() => {
    return detectedAccounts.find((acc) => acc.isCurrent || acc.active) || detectedAccounts[0] || null;
  }, [detectedAccounts]);

  const failedItems = importResult?.results?.filter((r) => !r.ok) || importResult?.errors || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Nhập tài khoản Antigravity"
      size="xl"
    >
      <div className="flex flex-col gap-4">
        {/* Tab Selection */}
        <div className="flex justify-center border-b border-border-subtle pb-3">
          <SegmentedControl
            value={activeTab}
            onChange={(val) => {
              setActiveTab(val);
              setErrorMessage("");
              setScanError("");
              setImportResult(null);
            }}
            options={[
              { label: "Refresh Token", value: "token", icon: "key" },
              { label: "Nhập từ DB IDE", value: "ide", icon: "database" },
            ]}
          />
        </div>

        {/* Tab 1: Refresh Token */}
        {activeTab === "token" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-text-muted">
                Hỗ trợ nhập trực tiếp token dạng chuỗi <code className="text-primary font-mono">1//...</code>, dán nhiều dòng hoặc mảng JSON tài khoản.
              </p>
            </div>

            <textarea
              className="w-full rounded-lg border border-border-subtle bg-surface-2 p-3 text-xs font-mono resize-y min-h-[200px] text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              placeholder={PLACEHOLDER_REFRESH_TOKEN}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={submitting}
              spellCheck={false}
            />

            {/* Live Parsing Status */}
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                {parseInfo.type === "empty" ? (
                  <span className="text-text-muted">Chưa có dữ liệu</span>
                ) : parseInfo.validCount > 0 ? (
                  <Badge variant="success" size="sm" icon="check_circle">
                    Phát hiện {parseInfo.validCount} token hợp lệ ({parseInfo.type === "json" ? "JSON Array" : parseInfo.type === "single_token" ? "Đơn" : "Nhiều dòng"})
                  </Badge>
                ) : (
                  <Badge variant="warning" size="sm" icon="warning">
                    Chưa nhận diện được token 1//...
                  </Badge>
                )}
              </div>
              {rawText && (
                <button
                  type="button"
                  onClick={() => setRawText("")}
                  className="text-text-muted hover:text-text-main text-xs underline"
                  disabled={submitting}
                >
                  Xóa nội dung
                </button>
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-xs text-red-500 dark:text-red-400 flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">error</span>
                <span className="break-words">{errorMessage}</span>
              </div>
            )}

            {/* Progress status */}
            {submitting && submitProgress && (
              <div className="flex items-center gap-2 text-xs text-primary animate-pulse py-1">
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                <span>{submitProgress}</span>
              </div>
            )}

            {/* Result Summary */}
            {importResult && (
              <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 border border-border-subtle">
                <div
                  className={cn(
                    "text-xs font-semibold flex items-center gap-1.5",
                    (importResult.failed ?? 0) > 0 ? "text-yellow-500 dark:text-yellow-400" : "text-green-500 dark:text-green-400"
                  )}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {(importResult.failed ?? 0) > 0 ? "info" : "check_circle"}
                  </span>
                  <span>
                    Đã nhập: {importResult.success ?? importResult.imported ?? 0} thành công
                    {(importResult.failed ?? 0) > 0 ? `, ${importResult.failed} thất bại` : ""}
                  </span>
                </div>
                {failedItems.length > 0 && (
                  <ul className="rounded border border-red-500/20 bg-red-500/5 p-2 text-[11px] font-mono max-h-32 overflow-y-auto divide-y divide-red-500/10">
                    {failedItems.map((item, idx) => (
                      <li key={idx} className="py-1 text-red-400 flex items-center gap-1.5">
                        <span className="font-semibold">[{item.index ?? idx + 1}]</span>
                        <span>{item.error || item.message || JSON.stringify(item)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-border-subtle">
              <Button
                onClick={handleSubmitTokens}
                fullWidth
                disabled={submitting || parseInfo.validCount === 0}
                loading={submitting}
                icon="download"
              >
                {submitting ? "Đang nhập..." : `Nhập ${parseInfo.validCount > 0 ? `${parseInfo.validCount} Token` : "Tất cả"}`}
              </Button>
              <Button onClick={handleClose} variant="ghost" fullWidth disabled={submitting}>
                Đóng
              </Button>
            </div>
          </div>
        )}

        {/* Tab 2: Scan DB IDE */}
        {activeTab === "ide" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-text-muted">
                Tự động quét token từ <code className="text-primary font-mono">state.vscdb</code> của Antigravity IDE, CLI agy và cấu hình JetSki.
              </p>
              <Button
                size="sm"
                variant="ghost"
                icon="refresh"
                onClick={fetchScannedAccounts}
                disabled={scanning || submitting}
              >
                {scanning ? "Đang quét..." : "Quét lại"}
              </Button>
            </div>

            {/* Scan Error */}
            {scanError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-xs text-red-500 dark:text-red-400 flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">error</span>
                <span className="break-words">{scanError}</span>
              </div>
            )}

            {/* Scanning Skeleton or List */}
            {scanning ? (
              <div className="flex flex-col items-center justify-center p-8 gap-3 text-text-muted">
                <span className="material-symbols-outlined text-3xl animate-spin text-primary">progress_activity</span>
                <p className="text-xs">Đang quét cơ sở dữ liệu SQLite cục bộ...</p>
              </div>
            ) : detectedAccounts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border-subtle p-8 text-center text-text-muted flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-3xl text-text-muted/50">search_off</span>
                <p className="text-xs">Không tìm thấy tài khoản nào trong SQLite DB của Antigravity IDE trên máy tính này.</p>
                <p className="text-[11px] text-text-muted/70">
                  Hãy thử đăng nhập vào Antigravity IDE hoặc sử dụng tab <strong>Refresh Token</strong> để dán token thủ công.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between border-b border-border-subtle pb-2 px-1 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-text-main">
                    <input
                      type="checkbox"
                      checked={selectedIndices.size === detectedAccounts.length}
                      onChange={toggleSelectAll}
                      disabled={submitting}
                      className="h-3.5 w-3.5 rounded border-border-subtle text-primary focus:ring-primary"
                    />
                    <span>Chọn tất cả ({detectedAccounts.length})</span>
                  </label>
                  <span className="text-text-muted text-[11px]">Đã chọn: {selectedIndices.size}</span>
                </div>

                <div className="flex flex-col divide-y divide-border-subtle max-h-56 overflow-y-auto pr-1 rounded-lg border border-border-subtle bg-surface-2/50">
                  {detectedAccounts.map((account, idx) => {
                    const isSelected = selectedIndices.has(idx);
                    const isCurrent = account.isCurrent || account.active;
                    const tier = (account.tier || account.subscriptionTier || "free").toUpperCase();

                    return (
                      <div
                        key={idx}
                        onClick={() => toggleSelectRow(idx)}
                        className={cn(
                          "flex items-center justify-between gap-3 p-2.5 text-xs transition-colors cursor-pointer hover:bg-surface-2",
                          isSelected && "bg-primary/5"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Controlled by row click
                            className="h-3.5 w-3.5 rounded border-border-subtle text-primary focus:ring-primary shrink-0"
                          />
                          <span className="material-symbols-outlined text-base text-text-muted shrink-0">
                            {account.source === "cli" ? "terminal" : account.source === "classic" ? "sync" : "desktop_windows"}
                          </span>
                          <div className="min-w-0 flex flex-col">
                            <span className="font-medium text-text-main truncate">
                              {account.email || account.name || `Tài khoản #${idx + 1}`}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-text-muted">
                                Nguồn: {account.source || "state.vscdb"}
                              </span>
                              {account.projectId && (
                                <span className="text-[10px] text-text-muted font-mono truncate max-w-[140px]">
                                  • {account.projectId}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isCurrent && (
                            <Badge variant="primary" size="sm">
                              Hiện tại
                            </Badge>
                          )}
                          <Badge
                            size="sm"
                            className={cn(
                              tier === "PRO" && "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20",
                              tier === "PLUS" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
                              tier === "PRO JIRO" && "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20",
                              tier === "ULTRA" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
                              tier === "ENTERPRISE" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
                              tier === "FREE" && "bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20"
                            )}
                          >
                            {tier}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Submit progress */}
            {submitting && submitProgress && (
              <div className="flex items-center gap-2 text-xs text-primary animate-pulse py-1">
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                <span>{submitProgress}</span>
              </div>
            )}

            {/* Result Summary */}
            {importResult && (
              <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3 border border-border-subtle">
                <div
                  className={cn(
                    "text-xs font-semibold flex items-center gap-1.5",
                    (importResult.failed ?? 0) > 0 ? "text-yellow-500 dark:text-yellow-400" : "text-green-500 dark:text-green-400"
                  )}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {(importResult.failed ?? 0) > 0 ? "info" : "check_circle"}
                  </span>
                  <span>
                    Đã nhập: {importResult.success ?? importResult.imported ?? 0} thành công
                    {(importResult.failed ?? 0) > 0 ? `, ${importResult.failed} thất bại` : ""}
                  </span>
                </div>
              </div>
            )}

            {/* Actions for Tab 2 */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border-subtle">
              {currentActiveAccount && (
                <Button
                  onClick={() => handleImportScannedAccounts([currentActiveAccount])}
                  variant="secondary"
                  fullWidth
                  disabled={submitting}
                  icon="bolt"
                >
                  Nhập tài khoản hiện tại
                </Button>
              )}
              <Button
                onClick={() => {
                  const selected = detectedAccounts.filter((_, idx) => selectedIndices.has(idx));
                  handleImportScannedAccounts(selected);
                }}
                fullWidth
                disabled={submitting || selectedIndices.size === 0}
                loading={submitting}
                icon="download"
              >
                {submitting ? "Đang nhập..." : `Nhập đã chọn (${selectedIndices.size})`}
              </Button>
              <Button onClick={handleClose} variant="ghost" fullWidth disabled={submitting}>
                Đóng
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

BulkImportAntigravityModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
};
