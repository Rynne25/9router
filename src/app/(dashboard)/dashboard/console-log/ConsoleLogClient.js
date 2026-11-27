"use client";

import { memo, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { HudFrame, NumberTicker } from "@/shared/components/hud";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import {
  parseLogLine,
  formatMetaChips,
  HTTP_LOG_RE,
  matchesCategory,
} from "./logParser";

const CATEGORY_FILTERS = [
  { id: "all", label: "Tất cả", icon: "list_alt" },
  { id: "error", label: "Lỗi & Cảnh báo", icon: "error" },
  { id: "request", label: "Request & Model", icon: "bolt" },
  { id: "mitm", label: "Proxy & MITM", icon: "security" },
  { id: "token", label: "Token & Auth", icon: "vpn_key" },
];

const LEVEL_STYLES = {
  ERROR: {
    badge: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/35",
    row: "bg-red-500/[0.06] dark:bg-red-500/[0.05] hover:bg-red-500/[0.11] dark:hover:bg-red-500/[0.09] border-l-2 border-l-red-500",
    text: "text-red-900 dark:text-red-200",
    dot: "bg-red-500",
  },
  WARN: {
    badge: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/35",
    row: "bg-amber-500/[0.05] dark:bg-amber-500/[0.04] hover:bg-amber-500/[0.1] dark:hover:bg-amber-500/[0.08] border-l-2 border-l-amber-500",
    text: "text-amber-950 dark:text-amber-100",
    dot: "bg-amber-500 dark:bg-amber-400",
  },
  INFO: {
    badge: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/35",
    row: "hover:bg-cyan-500/[0.05] dark:hover:bg-white/[0.035] border-l-2 border-l-cyan-500/60",
    text: "text-slate-800 dark:text-slate-200",
    dot: "bg-cyan-500 dark:bg-cyan-400",
  },
  DEBUG: {
    badge: "bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-500/35",
    row: "hover:bg-cyan-500/[0.05] dark:hover:bg-white/[0.035] border-l-2 border-l-purple-500/60",
    text: "text-slate-700 dark:text-slate-300",
    dot: "bg-purple-500 dark:bg-purple-400",
  },
  LOG: {
    badge: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/35",
    row: "hover:bg-cyan-500/[0.05] dark:hover:bg-white/[0.035] border-l-2 border-l-emerald-500/50",
    text: "text-slate-800 dark:text-slate-200",
    dot: "bg-emerald-500 dark:bg-emerald-400",
  },
};

const TAG_COLORS = {
  TOKEN_REFRESH: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  BG_TOKEN_REFRESH: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  TOKEN: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  ProxyFetch: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  Proxy: "bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border-cyan-500/40 font-semibold",
  MITM: "bg-purple-500/20 text-purple-800 dark:text-purple-300 border-purple-500/45 font-bold shadow-xs",
  FAILOVER: "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/45 font-bold",
  "Antigravity Usage": "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/30",
  Combo: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30",
  GEMINI_NATIVE: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  QODER: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
  AutoPing: "bg-lime-500/15 text-lime-800 dark:text-lime-300 border-lime-500/30",
  Tunnel: "bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/30",
  Tailscale: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500/30",
};

const METHOD_COLORS = {
  GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  POST: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  PUT: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  PATCH: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  DELETE: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
};

function getHttpStatusTone(status) {
  if (!status) return "";
  if (status >= 500) return "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/40";
  if (status >= 400) return "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40";
  if (status >= 300) return "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30";
  return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
}

const HighlightedText = memo(function HighlightedText({ text, regex, queryLower }) {
  if (!regex || !queryLower || !text) return text;
  const parts = String(text).split(regex);
  if (parts.length === 1) return text;

  return parts.map((part, idx) =>
    part.toLowerCase() === queryLower ? (
      <mark key={idx} className="bg-amber-300/50 text-slate-950 dark:bg-amber-400/30 dark:text-amber-100 rounded px-0.5">
        {part}
      </mark>
    ) : (
      <span key={idx}>{part}</span>
    )
  );
});

let cachedConsoleEntries = [];
let cachedConsoleNextId = 1;

export default function ConsoleLogClient() {
  const [entries, setEntries] = useState(() => cachedConsoleEntries);
  const [connected, setConnected] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupDuplicates, setGroupDuplicates] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [wrapLines, setWrapLines] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());
  const [copiedId, setCopiedId] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const logRef = useRef(null);
  const nextIdRef = useRef(cachedConsoleNextId);
  const copyTimerRef = useRef(null);
  const copyAllTimerRef = useRef(null);
  const pendingQueueRef = useRef([]);
  const batchFlushTimeoutRef = useRef(null);

  const flushPendingLogs = useCallback(() => {
    batchFlushTimeoutRef.current = null;
    if (pendingQueueRef.current.length === 0) return;
    const incoming = pendingQueueRef.current;
    pendingQueueRef.current = [];
    setEntries((prev) => {
      const next = [...prev, ...incoming];
      return next.length > CONSOLE_LOG_CONFIG.maxLines
        ? next.slice(-CONSOLE_LOG_CONFIG.maxLines)
        : next;
    });
  }, []);

  const queueIncomingLog = useCallback((entry) => {
    pendingQueueRef.current.push(entry);
    if (!batchFlushTimeoutRef.current) {
      batchFlushTimeoutRef.current = setTimeout(flushPendingLogs, 60);
    }
  }, [flushPendingLogs]);

  const queueIncomingLogs = useCallback((entryList) => {
    pendingQueueRef.current.push(...entryList);
    if (!batchFlushTimeoutRef.current) {
      batchFlushTimeoutRef.current = setTimeout(flushPendingLogs, 60);
    }
  }, [flushPendingLogs]);

  useEffect(() => {
    return () => {
      clearTimeout(copyTimerRef.current);
      clearTimeout(copyAllTimerRef.current);
      if (batchFlushTimeoutRef.current) clearTimeout(batchFlushTimeoutRef.current);
    };
  }, []);

  const toParsedEntry = useCallback((rawLine) => {
    const id = nextIdRef.current++;
    cachedConsoleNextId = nextIdRef.current;
    return { ...parseLogLine(rawLine), id, rowKey: String(id) };
  }, []);

  useEffect(() => {
    cachedConsoleEntries = entries;
  }, [entries]);

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      setExpandedKeys(new Set());
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "init" && Array.isArray(msg.logs)) {
          if (batchFlushTimeoutRef.current) clearTimeout(batchFlushTimeoutRef.current);
          pendingQueueRef.current = [];
          const initial = msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines).map(toParsedEntry);
          setEntries(initial);
          setExpandedKeys(new Set());
        } else if (msg.type === "line" && typeof msg.line === "string") {
          const entry = toParsedEntry(msg.line);
          queueIncomingLog(entry);
        } else if (msg.type === "lines" && Array.isArray(msg.lines)) {
          const incoming = msg.lines.map(toParsedEntry);
          queueIncomingLogs(incoming);
        } else if (msg.type === "clear") {
          if (batchFlushTimeoutRef.current) clearTimeout(batchFlushTimeoutRef.current);
          pendingQueueRef.current = [];
          setEntries([]);
          setExpandedKeys(new Set());
        }
      } catch {
        /* ignore heartbeat or non-JSON messages */
      }
    };

    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      if (batchFlushTimeoutRef.current) clearTimeout(batchFlushTimeoutRef.current);
    };
  }, [toParsedEntry, queueIncomingLog, queueIncomingLogs]);

  const counts = useMemo(() => {
    const c = { all: entries.length, error: 0, warn: 0, request: 0, mitm: 0, token: 0 };
    for (const item of entries) {
      if (item.level === "ERROR") c.error += 1;
      if (item.level === "WARN") c.warn += 1;
      if (matchesCategory(item, "request")) c.request += 1;
      if (matchesCategory(item, "mitm")) c.mitm += 1;
      if (matchesCategory(item, "token")) c.token += 1;
    }
    return { ...c, errorAndWarn: c.error + c.warn };
  }, [entries]);

  const trimmedQuery = searchQuery.trim();
  const queryLower = trimmedQuery.toLowerCase();

  const searchRegex = useMemo(() => {
    if (!trimmedQuery) return null;
    const escaped = trimmedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(${escaped})`, "i");
  }, [trimmedQuery]);

  const filteredEntries = useMemo(() => {
    const list = entries.filter((item) => {
      if (!matchesCategory(item, categoryFilter)) return false;
      if (queryLower && !item.raw.toLowerCase().includes(queryLower)) return false;
      return true;
    });

    if (!groupDuplicates) {
      return list.map((item) => ({ ...item, count: 1 }));
    }

    const grouped = [];
    for (const item of list) {
      const prev = grouped[grouped.length - 1];
      if (prev && prev.dedupKey === item.dedupKey) {
        prev.count += 1;
        if (item.time) prev.time = item.time;
      } else {
        grouped.push({ ...item, count: 1 });
      }
    }
    return grouped;
  }, [entries, categoryFilter, queryLower, groupDuplicates]);

  const scrollToBottom = useCallback(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    scrollToBottom();
  }, [filteredEntries, autoScroll, scrollToBottom]);

  const toggleExpand = (rowKey) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const handleRowKeyDown = (e, rowKey) => {
    if (e.target.closest("button")) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleExpand(rowKey);
    }
  };

  const handleCopySingle = async (e, entry) => {
    e.stopPropagation();
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    const text = entry.count > 1 ? `${entry.raw} (×${entry.count})` : entry.raw;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(entry.rowKey);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedId((cur) => (cur === entry.rowKey ? null : cur));
      }, 1500);
    } catch (err) {
      console.error("Failed to copy log line:", err);
    }
  };

  const handleCopyAll = async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard?.writeText ||
      !filteredEntries.length
    ) {
      return;
    }
    const text = filteredEntries
      .map((item) => (item.count > 1 ? `${item.raw} (×${item.count})` : item.raw))
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      clearTimeout(copyAllTimerRef.current);
      copyAllTimerRef.current = setTimeout(() => setCopiedAll(false), 1800);
    } catch (err) {
      console.error("Failed to copy all logs:", err);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden h-[calc(100vh-175px)] max-h-[880px]">
      {/* Orbital Live Telemetry Header & Filter Controls */}
      <HudFrame
        chamfer="sm"
        accent="cyan"
        padding="none"
        spotlight={false}
        className="shrink-0 border-cyan-500/30 dark:border-cyan-400/25 bg-gradient-to-r from-cyan-500/[0.08] via-sky-500/[0.03] to-transparent"
      >
        <div className="px-3 py-2 flex flex-col gap-2">
          {/* Top Row: Live Beacon + Title + Quick Metrics + Primary Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2">
                <span className="relative flex size-2.5 shrink-0 items-center justify-center">
                  {connected && (
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  )}
                  <span
                    className={`relative inline-flex size-2 rounded-full ${
                      connected
                        ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.85)]"
                        : "bg-red-500"
                    }`}
                  />
                </span>
                <span className="hidden sm:inline-flex rounded border border-cyan-500/35 bg-cyan-500/12 px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">
                  TELEMETRY
                </span>
                <h2 className="text-xs sm:text-sm font-bold text-text-main tracking-tight">
                  Nhật ký Console
                </h2>
              </div>

              <span
                className={`hidden sm:inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
                  connected
                    ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-red-500/35 bg-red-500/10 text-red-700 dark:text-red-300"
                }`}
              >
                {connected ? "LIVE SSE" : "OFFLINE"}
              </span>

              {/* Level Summary Counters */}
              <div className="hidden md:flex items-center gap-1.5 pl-2 border-l border-cyan-500/20 font-mono text-[10.5px] tabular-nums">
                <span className="inline-flex items-center gap-1 rounded-md border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-1.5 py-0.5 text-text-muted">
                  Tổng
                  <NumberTicker value={counts.all} className="font-bold text-text-main" />
                </span>
                {counts.error > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-500/12 border border-red-500/30 px-1.5 py-0.5 text-red-700 dark:text-red-300 font-semibold">
                    <span className="size-1.5 rounded-full bg-red-500" />
                    <NumberTicker value={counts.error} /> Lỗi
                  </span>
                )}
                {counts.warn > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/12 border border-amber-500/30 px-1.5 py-0.5 text-amber-800 dark:text-amber-300 font-semibold">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    <NumberTicker value={counts.warn} /> Cảnh báo
                  </span>
                )}
              </div>
            </div>

            {/* Action Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setWrapLines((v) => !v)}
                aria-pressed={wrapLines}
                aria-label="Ngắt dòng tự động"
                title={wrapLines ? "Đang xuống dòng tự động" : "Đang hiển thị gọn 1 dòng"}
                className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 font-mono text-[11px] font-semibold transition-all cursor-pointer ${
                  wrapLines
                    ? "border-cyan-500/45 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                    : "border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] text-text-muted hover:text-text-main hover:border-cyan-500/30"
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">wrap_text</span>
                <span className="hidden sm:inline">Ngắt dòng</span>
              </button>

              <button
                type="button"
                onClick={() => setGroupDuplicates((v) => !v)}
                aria-pressed={groupDuplicates}
                aria-label="Gộp các dòng log trùng"
                title="Tự động gộp các dòng log trùng nhau liên tiếp thành ×N"
                className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 font-mono text-[11px] font-semibold transition-all cursor-pointer ${
                  groupDuplicates
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] text-text-muted hover:text-text-main hover:border-cyan-500/30"
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">filter_none</span>
                <span className="hidden sm:inline">Gộp trùng</span>
              </button>

              <button
                type="button"
                onClick={() => setAutoScroll((v) => !v)}
                aria-pressed={autoScroll}
                aria-label={autoScroll ? "Tạm dừng tự cuộn" : "Bật tự cuộn"}
                title={autoScroll ? "Đang tự cuộn xuống dòng mới nhất" : "Đã tạm dừng tự cuộn"}
                className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 font-mono text-[11px] font-semibold transition-all cursor-pointer ${
                  autoScroll
                    ? "border-cyan-500/45 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300"
                    : "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
                }`}
              >
                <span className="material-symbols-outlined text-[13px]">
                  {autoScroll ? "vertical_align_bottom" : "pause"}
                </span>
                <span className="hidden sm:inline">{autoScroll ? "Tự cuộn" : "Tạm dừng"}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyAll}
                aria-label="Sao chép toàn bộ log đang hiển thị"
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] px-2 font-mono text-[11px] font-medium text-text-muted hover:text-text-main hover:border-cyan-500/30 transition-all cursor-pointer"
                title="Sao chép toàn bộ log đang hiển thị"
              >
                <span className="material-symbols-outlined text-[13px]">
                  {copiedAll ? "check" : "content_copy"}
                </span>
                <span className="hidden sm:inline">{copiedAll ? "Đã chép" : "Chép"}</span>
              </button>

              <button
                type="button"
                onClick={handleClear}
                aria-label="Xóa toàn bộ nhật ký"
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-500/35 bg-red-500/10 px-2.5 font-mono text-[11px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-500/20 transition-all cursor-pointer"
                title="Xóa toàn bộ nhật ký"
              >
                <span className="material-symbols-outlined text-[13px]">delete</span>
                <span>Xóa</span>
              </button>
            </div>
          </div>

          {/* Bottom Row: Category Filter Chips + Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1.5 border-t border-cyan-500/15">
            <div className="flex flex-wrap items-center gap-1.5">
              {CATEGORY_FILTERS.map((f) => {
                const active = categoryFilter === f.id;
                const count = f.id === "error" ? counts.errorAndWarn : (counts[f.id] ?? 0);
                const isErrorTab = f.id === "error" && count > 0;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategoryFilter(f.id)}
                    className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold transition-all cursor-pointer ${
                      active
                        ? isErrorTab
                          ? "border-red-500/50 bg-red-500/15 text-red-700 dark:text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.18)]"
                          : "border-cyan-500/50 bg-cyan-500/15 text-cyan-800 dark:text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.18)]"
                        : "border-black/10 dark:border-white/10 bg-white/55 dark:bg-white/[0.03] text-text-muted hover:text-text-main hover:border-cyan-500/30"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">{f.icon}</span>
                    <span>{f.label}</span>
                    <span
                      className={`rounded-full px-1.5 font-mono text-[9.5px] tabular-nums ${
                        active
                          ? "bg-black/10 dark:bg-white/15 text-current"
                          : isErrorTab
                            ? "bg-red-500/20 text-red-700 dark:text-red-300"
                            : "bg-black/5 dark:bg-white/5 text-text-muted"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative w-full sm:w-64">
              <span className="material-symbols-outlined text-[14px] text-cyan-600 dark:text-cyan-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Tìm kiếm trong nhật ký console"
                placeholder="Tìm email, model, endpoint, lỗi..."
                className="w-full h-7 pl-8 pr-7 rounded-lg border border-cyan-500/25 bg-white/80 dark:bg-[#050a14]/70 font-mono text-[11px] text-text-main placeholder:text-text-muted/60 focus:outline-none focus:border-cyan-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main cursor-pointer"
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </HudFrame>

      {/* Orbital Live Telemetry Terminal Viewport */}
      <HudFrame
        chamfer="sm"
        accent="cyan"
        padding="none"
        spotlight={false}
        className="flex-1 min-h-0 flex flex-col overflow-hidden shadow-sm [&>.hud-frame]:border-cyan-500/30 dark:[&>.hud-frame]:border-cyan-400/25 [&>div:last-child]:flex-1 [&>div:last-child]:min-h-0 [&>div:last-child]:flex [&>div:last-child]:flex-col"
      >
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Table Column Header */}
          <div className="hidden md:grid md:grid-cols-[74px_58px_130px_1fr_auto] items-center gap-2 px-3 py-1.5 bg-cyan-50/90 dark:bg-[#081120] border-b border-cyan-500/20 font-mono text-[9.5px] font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-300/80 shrink-0 select-none">
            <span>Thời gian</span>
            <span className="text-center">Mức độ</span>
            <span>Nguồn / Tag</span>
            <span>Nội dung chi tiết</span>
            <span className="text-right pr-6">Thông số</span>
          </div>

          {/* Log Stream Body — crisp light & dark readable monospace well */}
          <div
            ref={logRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar bg-slate-50/95 dark:bg-[#050a14]/95 text-[11px] font-mono divide-y divide-slate-900/[0.06] dark:divide-cyan-400/[0.06]"
          >
            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-text-muted gap-2 font-sans">
                <span className="material-symbols-outlined text-[36px] text-cyan-500/40">terminal</span>
                <span className="text-xs font-mono">
                  {entries.length === 0
                    ? "Chưa có nhật ký nào được ghi nhận."
                    : "Không có dòng nhật ký nào khớp với bộ lọc hiện tại."}
                </span>
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const lvl = LEVEL_STYLES[entry.level] || LEVEL_STYLES.LOG;
                const tagTone =
                  TAG_COLORS[entry.tag] ||
                  "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
                const chips = formatMetaChips(entry.meta);
                const isExpanded = expandedKeys.has(entry.rowKey);
                const hasDetails =
                  Boolean(entry.meta) ||
                  entry.subTags.length > 0 ||
                  entry.message.length > 90 ||
                  entry.raw.includes("\n");
                const extraHttpMessage = entry.http
                  ? entry.message.replace(HTTP_LOG_RE, "").trim()
                  : "";

                return (
                  <div key={entry.rowKey} className={`group transition-colors ${lvl.row}`}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpand(entry.rowKey)}
                      onKeyDown={(e) => handleRowKeyDown(e, entry.rowKey)}
                      className="flex flex-col md:grid md:grid-cols-[74px_58px_130px_1fr_auto] md:items-center gap-1 md:gap-2 px-3 py-1.5 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/60"
                    >
                      {/* Col 1 & 2 & 3 on mobile grouped, separate columns on md+ */}
                      <div className="flex items-center gap-2 md:contents">
                        {/* Timestamp */}
                        <span className="inline-flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                          <span className={`size-1.5 rounded-full shrink-0 ${lvl.dot}`} />
                          <span>{entry.time || "--:--:--"}</span>
                        </span>

                        {/* Level Badge */}
                        <div className="flex md:justify-center shrink-0">
                          <span
                            className={`inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider w-[48px] text-center leading-none ${lvl.badge}`}
                          >
                            {entry.level}
                          </span>
                        </div>

                        {/* Source Tag + SubTags */}
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none truncate max-w-[136px] ${tagTone}`}
                            title={entry.tag}
                          >
                            {entry.tag}
                          </span>
                          {entry.subTags.length > 0 && (
                            <span className="hidden lg:inline-flex items-center rounded bg-slate-900/[0.06] dark:bg-white/[0.06] px-1 py-0.5 text-[9.5px] text-slate-600 dark:text-slate-400 truncate max-w-[70px]">
                              {entry.subTags[0]}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Col 4: Message & Structured HTTP Pill */}
                      <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 min-w-0">
                        {entry.http ? (
                          <>
                            <div className="inline-flex flex-wrap items-center gap-1 min-w-0 max-w-full">
                              <span
                                className={`rounded border px-1 py-0.5 text-[9.5px] font-bold leading-none shrink-0 ${
                                  METHOD_COLORS[entry.http.method] ||
                                  "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30"
                                }`}
                              >
                                {entry.http.method}
                              </span>
                              <code className="rounded bg-slate-900/[0.06] dark:bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-slate-900 dark:text-slate-100 truncate max-w-[200px] sm:max-w-[260px]">
                                <HighlightedText
                                  text={entry.http.path}
                                  regex={searchRegex}
                                  queryLower={queryLower}
                                />
                              </code>
                              {entry.http.status && (
                                <span
                                  className={`rounded border px-1 py-0.5 text-[9.5px] font-bold leading-none tabular-nums shrink-0 ${getHttpStatusTone(
                                    entry.http.status
                                  )}`}
                                >
                                  {entry.http.status}
                                </span>
                              )}
                              {entry.http.duration && (
                                <span className="rounded bg-cyan-500/12 border border-cyan-500/30 px-1 py-0.5 text-[9.5px] text-cyan-800 dark:text-cyan-300 leading-none tabular-nums shrink-0">
                                  {entry.http.duration}
                                </span>
                              )}
                            </div>
                            {extraHttpMessage && (
                              <span
                                className={`min-w-0 flex-1 ${
                                  wrapLines || isExpanded ? "whitespace-pre-wrap break-words" : "truncate"
                                } ${lvl.text}`}
                                title={entry.message}
                              >
                                <HighlightedText
                                  text={extraHttpMessage}
                                  regex={searchRegex}
                                  queryLower={queryLower}
                                />
                              </span>
                            )}
                          </>
                        ) : (
                          <span
                            className={`min-w-0 flex-1 ${
                              wrapLines || isExpanded ? "whitespace-pre-wrap break-words" : "truncate"
                            } ${lvl.text}`}
                            title={entry.message}
                          >
                            <HighlightedText
                              text={entry.message}
                              regex={searchRegex}
                              queryLower={queryLower}
                            />
                          </span>
                        )}

                        {entry.count > 1 && (
                          <span className="inline-flex items-center rounded-full bg-cyan-500/20 border border-cyan-500/40 px-1.5 py-0.5 text-[9.5px] font-bold text-cyan-800 dark:text-cyan-300 shrink-0 leading-none tabular-nums">
                            ×{entry.count}
                          </span>
                        )}
                      </div>

                      {/* Col 5: Metadata Chips + Hover Actions */}
                      <div className="flex items-center justify-between md:justify-end gap-1.5 min-w-0 max-w-full">
                        {chips.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 min-w-0 max-w-full">
                            {chips.map((chip) => {
                              const icon =
                                chip.key === "model"
                                  ? "psychology"
                                  : chip.key === "email"
                                    ? "person"
                                    : chip.key === "provider"
                                      ? "dns"
                                      : chip.key === "host"
                                        ? "language"
                                        : chip.key === "tool"
                                          ? "build"
                                          : null;
                              return (
                                <span
                                  key={chip.key}
                                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-medium leading-none truncate max-w-[170px] ${chip.tone}`}
                                >
                                  {icon && (
                                    <span className="material-symbols-outlined text-[11px] shrink-0 opacity-80">
                                      {icon}
                                    </span>
                                  )}
                                  <span className="truncate">
                                    <HighlightedText
                                      text={chip.label}
                                      regex={searchRegex}
                                      queryLower={queryLower}
                                    />
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleCopySingle(e, entry)}
                            aria-label="Sao chép dòng log này"
                            title="Sao chép dòng log này"
                            className="p-1 rounded hover:bg-slate-900/10 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 opacity-70 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {copiedId === entry.rowKey ? "check" : "content_copy"}
                            </span>
                          </button>
                          <span
                            className={`material-symbols-outlined text-[15px] text-slate-500 transition-transform ${
                              isExpanded ? "rotate-180 text-cyan-700 dark:text-cyan-300" : ""
                            } ${hasDetails ? "opacity-80" : "opacity-30"}`}
                          >
                            expand_more
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Detail Inspector */}
                    {isExpanded && (
                      <div className="bg-slate-100/90 dark:bg-black/45 border-t border-cyan-500/15 px-4 py-2.5 text-[11px] space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-600 dark:text-slate-400 font-sans">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              Chi tiết dòng log
                            </span>
                            {entry.subTags.length > 0 && (
                              <span>
                                Sub-tags:{" "}
                                <code className="text-cyan-700 dark:text-cyan-300">
                                  {entry.subTags.join(" / ")}
                                </code>
                              </span>
                            )}
                            <span>
                              Phân loại:{" "}
                              <code className="text-cyan-700 dark:text-cyan-300">
                                {entry.category}
                              </code>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleCopySingle(e, entry)}
                            className="inline-flex items-center gap-1 rounded border border-cyan-500/30 bg-white/80 dark:bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-slate-800 dark:text-slate-200 hover:bg-cyan-500/10 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[12px]">
                              {copiedId === entry.rowKey ? "check" : "content_copy"}
                            </span>
                            <span>{copiedId === entry.rowKey ? "Đã sao chép" : "Chép Raw"}</span>
                          </button>
                        </div>

                        <div className="rounded-lg bg-white dark:bg-[#04070d] border border-cyan-500/20 p-2.5 text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all select-text leading-relaxed">
                          {entry.raw}
                        </div>

                        {entry.meta && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pt-0.5">
                            {Object.entries(entry.meta).map(([k, v]) => (
                              <div
                                key={k}
                                className="flex items-start justify-between gap-2 rounded-md bg-white/80 dark:bg-white/[0.03] border border-slate-900/10 dark:border-white/[0.08] px-2.5 py-1"
                              >
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                                  {k}
                                </span>
                                <span className="text-[10.5px] text-slate-800 dark:text-slate-200 break-all text-right">
                                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Compact Terminal Footer */}
          <div className="shrink-0 bg-cyan-50/90 dark:bg-[#081120] border-t border-cyan-500/20 px-3.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-600 dark:text-slate-400 font-mono">
            <div className="flex items-center gap-3 tabular-nums">
              <span>
                Hiển thị <strong className="text-slate-900 dark:text-slate-100">{filteredEntries.length}</strong> /{" "}
                {entries.length} dòng
              </span>
              {trimmedQuery && (
                <span className="text-amber-700 dark:text-amber-300">
                  Lọc: &ldquo;{trimmedQuery}&rdquo;
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 hidden sm:inline font-sans">
                Nhấn vào dòng để xem chi tiết
              </span>
              {!autoScroll && (
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-800 dark:text-cyan-300 hover:bg-cyan-500/25 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[12px]">arrow_downward</span>
                  <span>Cuộn xuống cuối</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </HudFrame>
    </div>
  );
}
