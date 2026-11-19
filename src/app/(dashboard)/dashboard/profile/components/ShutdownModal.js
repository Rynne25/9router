import { useState } from "react";
import { ConfirmModal } from "@/shared/components/Modal";

export default function ShutdownModal({ isOpen, onClose }) {
  const [isShuttingDown, setIsShuttingDown] = useState(false);

  const handleShutdown = async () => {
    setIsShuttingDown(true);
    try {
      await fetch("/api/version/shutdown", { method: "POST" });
    } catch {
      // Expected to fail as server shuts down; ignore error
    }
    setIsShuttingDown(false);
    onClose?.();
  };

  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleShutdown}
      title="Close Proxy"
      message="Are you sure you want to close the proxy server?"
      confirmText="Close"
      cancelText="Cancel"
      variant="danger"
      loading={isShuttingDown}
    />
  );
}
