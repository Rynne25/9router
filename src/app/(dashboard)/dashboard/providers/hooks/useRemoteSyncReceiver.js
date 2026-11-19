"use client";

import { useState, useEffect, useCallback } from "react";
import { useNotificationStore } from "@/store/notificationStore";

export function useRemoteSyncReceiver({ onConnectionsUpdated } = {}) {
  const [isSyncReceiver, setIsSyncReceiver] = useState(false);
  const [showRemoteSyncModal, setShowRemoteSyncModal] = useState(false);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const reloadConnections = useCallback(async () => {
    try {
      const r = await fetch("/api/providers");
      if (r.ok) {
        const d = await r.json();
        if (d?.connections && onConnectionsUpdated) {
          onConnectionsUpdated(d.connections);
        }
      }
    } catch {
      /* ignore */
    }
  }, [onConnectionsUpdated]);

  // Check if this machine is the designated 1-way Master Receiver
  // Source machines get isReceiver=false and never see any sync UI or notifications
  useEffect(() => {
    let active = true;
    fetch("/api/sync/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!active || !cfg?.isReceiver) return;
        setIsSyncReceiver(true);

        if (cfg.syncOnPageLoad !== false) {
          fetch("/api/sync/peers", { method: "POST" })
            .then((r) => (r.ok ? r.json() : null))
            .then((res) => {
              if (!active) return;
              const addedCount = res?.result?.syncResult?.addedCount;
              const peerName = res?.result?.peer?.hostname || "máy nguồn";
              if (addedCount > 0) {
                addNotification({
                  type: "success",
                  title: "Đã nhận tài khoản mới",
                  message: `Tự động thêm ${addedCount} tài khoản từ "${peerName}"`,
                });
                reloadConnections();
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [addNotification, reloadConnections]);

  // Real-time Cloud Buffer & Universal Sync events polling (Master Receiver only)
  useEffect(() => {
    if (!isSyncReceiver) return;

    const checkSyncEvents = async () => {
      try {
        const res = await fetch("/api/sync/events?check=true");
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.notifications) && data.notifications.length > 0) {
          for (const notif of data.notifications) {
            addNotification({
              type: "success",
              title: "Đã nhận tài khoản mới",
              message: `Tự động nạp ${notif.accountIdentifier} (${notif.provider})`,
            });
          }
          reloadConnections();
        }
      } catch {
        /* ignore */
      }
    };

    checkSyncEvents();
    const interval = setInterval(checkSyncEvents, 8000);
    return () => clearInterval(interval);
  }, [isSyncReceiver, addNotification, reloadConnections]);

  return {
    isSyncReceiver,
    showRemoteSyncModal,
    setShowRemoteSyncModal,
    handleSyncComplete: reloadConnections,
  };
}

export default useRemoteSyncReceiver;
