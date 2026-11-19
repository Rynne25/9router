"use client";

import { useCallback, useState } from "react";
import { RELAY_PROVIDERS } from "../components/RelayDeployModal";

export function useRelayDeploy({ onSuccess, notify } = {}) {
  const [activeProvider, setActiveProvider] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [relayForms, setRelayForms] = useState(() => ({
    vercel: { ...RELAY_PROVIDERS.vercel.initialForm },
    cloudflare: { ...RELAY_PROVIDERS.cloudflare.initialForm },
    deno: { ...RELAY_PROVIDERS.deno.initialForm },
    netlify: { ...RELAY_PROVIDERS.netlify.initialForm },
  }));

  const openDeployModal = useCallback((providerKey) => {
    if (RELAY_PROVIDERS[providerKey]) {
      setActiveProvider(providerKey);
    }
  }, []);

  const closeDeployModal = useCallback(() => {
    if (deploying) return;
    setActiveProvider(null);
  }, [deploying]);

  const updateFormField = useCallback((field, value) => {
    setActiveProvider((currentProvider) => {
      if (currentProvider) {
        setRelayForms((prev) => ({
          ...prev,
          [currentProvider]: {
            ...prev[currentProvider],
            [field]: value,
          },
        }));
      }
      return currentProvider;
    });
  }, []);

  const handleDeploy = useCallback(
    async (providerKey) => {
      const targetProvider = providerKey || activeProvider;
      const config = targetProvider ? RELAY_PROVIDERS[targetProvider] : null;
      if (!config) return;

      const form = relayForms[targetProvider];
      if (!config.isValid(form)) return;

      setDeploying(true);
      try {
        const res = await fetch(config.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (res.ok) {
          await onSuccess?.();
          setActiveProvider(null);
          notify?.success?.(`Deployed: ${data.deployUrl}`);
        } else {
          notify?.error?.(data.error || "Deploy failed");
        }
      } catch (error) {
        console.log(`Error deploying ${config.name} relay:`, error);
        notify?.error?.("Deploy failed");
      } finally {
        setDeploying(false);
      }
    },
    [activeProvider, relayForms, onSuccess, notify]
  );

  return {
    activeProvider,
    deploying,
    relayForms,
    currentForm: activeProvider ? relayForms[activeProvider] : {},
    openDeployModal,
    closeDeployModal,
    updateFormField,
    handleDeploy,
  };
}
