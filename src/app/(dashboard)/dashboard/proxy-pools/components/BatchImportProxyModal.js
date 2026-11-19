"use client";

import { useState } from "react";
import { Button, Modal } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

export function parseProxyLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.includes("://")) {
    const parsed = new URL(trimmed);
    const hostLabel = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    return {
      proxyUrl: parsed.toString(),
      name: `Imported ${hostLabel}`,
    };
  }

  const parts = trimmed.split(":");
  if (parts.length === 4) {
    const [host, port, username, password] = parts;
    if (!host || !port || !username || !password) {
      throw new Error("Invalid host:port:user:pass format");
    }

    const proxyUrl = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
    const parsed = new URL(proxyUrl);
    return {
      proxyUrl: parsed.toString(),
      name: `Imported ${host}:${port}`,
    };
  }

  throw new Error("Unsupported format");
}

export default function BatchImportProxyModal({
  isOpen = false,
  onClose,
  proxyPools = [],
  onSuccess,
}) {
  const [batchImportText, setBatchImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const notify = useNotificationStore();

  const handleClose = () => {
    if (importing) return;
    setBatchImportText("");
    onClose?.();
  };

  const handleBatchImport = async () => {
    const lines = batchImportText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      notify.warning("Please paste at least one proxy line.");
      return;
    }

    const parsedEntries = [];
    const invalidLines = [];

    lines.forEach((line, index) => {
      try {
        const parsed = parseProxyLine(line);
        if (parsed) {
          parsedEntries.push({
            ...parsed,
            lineNumber: index + 1,
          });
        }
      } catch (error) {
        invalidLines.push(`Line ${index + 1}: ${error.message}`);
      }
    });

    if (invalidLines.length > 0) {
      notify.error(`Invalid proxy format:\n${invalidLines.join("\n")}`);
      return;
    }

    setImporting(true);
    try {
      const existingKeys = new Set(
        proxyPools.map((pool) => `${(pool.proxyUrl || "").trim()}|||${(pool.noProxy || "").trim()}`)
      );

      let created = 0;
      let skipped = 0;
      let failed = 0;

      for (const entry of parsedEntries) {
        const dedupeKey = `${entry.proxyUrl}|||`;
        if (existingKeys.has(dedupeKey)) {
          skipped += 1;
          continue;
        }

        const res = await fetch("/api/proxy-pools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: entry.name,
            proxyUrl: entry.proxyUrl,
            noProxy: "",
            isActive: true,
          }),
        });

        if (res.ok) {
          created += 1;
          existingKeys.add(dedupeKey);
        } else {
          failed += 1;
        }
      }

      await onSuccess?.();
      handleClose();
      notify.success(
        `Batch import completed: Created ${created}, Skipped ${skipped}, Failed ${failed}`
      );
    } catch (error) {
      console.log("Error batch importing proxies:", error);
      notify.error("Batch import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} title="Batch Import Proxies" onClose={handleClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-text-main">
            Paste Proxy List (One per line)
          </label>
          <textarea
            value={batchImportText}
            onChange={(e) => setBatchImportText(e.target.value)}
            placeholder={"http://user:pass@127.0.0.1:7897\n127.0.0.1:7897:user:pass"}
            className="min-h-[180px] w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-text-main transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/30 focus:outline-none dark:border-white/10 dark:bg-white/5"
          />
          <p className="mt-1 text-xs text-text-muted">
            Supported formats: protocol://user:pass@host:port, host:port:user:pass
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            fullWidth
            onClick={handleBatchImport}
            disabled={!batchImportText.trim() || importing}
          >
            {importing ? "Importing..." : "Import"}
          </Button>
          <Button fullWidth variant="ghost" onClick={handleClose} disabled={importing}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
