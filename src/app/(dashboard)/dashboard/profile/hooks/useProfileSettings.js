import { useState, useEffect, useCallback } from "react";
import useSettingsStore from "@/store/settingsStore";

export function useProfileSettings(options = {}) {
  const { onSettingsLoaded } = options;
  const cachedSettings = useSettingsStore.getState().settings;
  const [settings, setSettings] = useState(() => cachedSettings || { fallbackStrategy: "fill-first" });
  const [loading, setLoading] = useState(() => !cachedSettings);

  const [proxyForm, setProxyForm] = useState(() => ({
    outboundProxyEnabled: cachedSettings?.outboundProxyEnabled === true,
    outboundProxyUrl: cachedSettings?.outboundProxyUrl || "",
    outboundNoProxy: cachedSettings?.outboundNoProxy || "",
  }));
  const [proxyStatus, setProxyStatus] = useState({ type: "", message: "" });
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyTestLoading, setProxyTestLoading] = useState(false);

  const reloadSettings = useCallback(async () => {
    try {
      const data = await useSettingsStore.getState().fetchSettings({ force: true });
      if (!data) return null;
      setSettings(data);
      setProxyForm({
        outboundProxyEnabled: data?.outboundProxyEnabled === true,
        outboundProxyUrl: data?.outboundProxyUrl || "",
        outboundNoProxy: data?.outboundNoProxy || "",
      });
      return data;
    } catch (err) {
      console.error("Failed to reload settings:", err);
      return null;
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    useSettingsStore
      .getState()
      .fetchSettings()
      .then((data) => {
        if (ignore || !data) {
          setLoading(false);
          return;
        }
        setSettings(data);
        setProxyForm({
          outboundProxyEnabled: data?.outboundProxyEnabled === true,
          outboundProxyUrl: data?.outboundProxyUrl || "",
          outboundNoProxy: data?.outboundNoProxy || "",
        });
        setLoading(false);
        onSettingsLoaded?.(data);
      })
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [onSettingsLoaded]);

  const updateOutboundProxy = async (e) => {
    e?.preventDefault?.();
    if (settings.outboundProxyEnabled !== true) return;
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundProxyUrl: proxyForm.outboundProxyUrl,
          outboundNoProxy: proxyForm.outboundNoProxy,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyStatus({ type: "success", message: "Proxy settings applied" });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const testOutboundProxy = async () => {
    if (settings.outboundProxyEnabled !== true) return;

    const proxyUrl = (proxyForm.outboundProxyUrl || "").trim();
    if (!proxyUrl) {
      setProxyStatus({ type: "error", message: "Please enter a Proxy URL to test" });
      return;
    }

    setProxyTestLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings/proxy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyUrl }),
      });

      const data = await res.json();
      if (res.ok && data?.ok) {
        setProxyStatus({
          type: "success",
          message: `Proxy test OK (${data.status}) in ${data.elapsedMs}ms`,
        });
      } else {
        setProxyStatus({
          type: "error",
          message: data?.error || "Proxy test failed",
        });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyTestLoading(false);
    }
  };

  const updateOutboundProxyEnabled = async (outboundProxyEnabled) => {
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outboundProxyEnabled }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyForm((prev) => ({ ...prev, outboundProxyEnabled: data?.outboundProxyEnabled === true }));
        setProxyStatus({
          type: "success",
          message: outboundProxyEnabled ? "Proxy enabled" : "Proxy disabled",
        });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const updateFallbackStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallbackStrategy: strategy }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, fallbackStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  const updateComboStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStrategy: strategy }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, comboStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update combo strategy:", err);
    }
  };

  const updateStickyLimit = async (limit) => {
    const numLimit = parseInt(limit, 10);
    if (isNaN(numLimit) || numLimit < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stickyRoundRobinLimit: numLimit }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, stickyRoundRobinLimit: numLimit }));
      }
    } catch (err) {
      console.error("Failed to update sticky limit:", err);
    }
  };

  const updateComboStickyLimit = async (limit) => {
    const numLimit = parseInt(limit, 10);
    if (isNaN(numLimit) || numLimit < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStickyRoundRobinLimit: numLimit }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, comboStickyRoundRobinLimit: numLimit }));
      }
    } catch (err) {
      console.error("Failed to update combo sticky limit:", err);
    }
  };

  const updateRequireLogin = async (requireLogin) => {
    try {
      const updated = await useSettingsStore.getState().patchSettings({ requireLogin });
      if (updated) {
        setSettings((prev) => ({ ...prev, requireLogin }));
      }
    } catch (err) {
      console.error("Failed to update require login:", err);
    }
  };

  const updateObservabilityEnabled = async (enabled) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enableObservability: enabled }),
      });
      if (res.ok) {
        setSettings((prev) => ({ ...prev, enableObservability: enabled }));
      }
    } catch (err) {
      console.error("Failed to update enableObservability:", err);
    }
  };

  return {
    settings,
    setSettings,
    loading,
    reloadSettings,
    updateFallbackStrategy,
    updateComboStrategy,
    updateStickyLimit,
    updateComboStickyLimit,
    updateRequireLogin,
    updateObservabilityEnabled,
    proxyForm,
    setProxyForm,
    proxyStatus,
    setProxyStatus,
    proxyLoading,
    proxyTestLoading,
    updateOutboundProxy,
    testOutboundProxy,
    updateOutboundProxyEnabled,
  };
}
