"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components";
import LanguageSwitcher from "@/shared/components/LanguageSwitcher";
import { useTheme } from "@/shared/hooks/useTheme";
import { APP_CONFIG } from "@/shared/constants/config";
import { LOCALE_COOKIE, normalizeLocale } from "@/i18n/config";

import { useProfileSettings } from "./hooks/useProfileSettings";
import { useSsoConfig } from "./hooks/useSsoConfig";
import { useDatabaseBackup } from "./hooks/useDatabaseBackup";
import { usePasswordChange } from "./hooks/usePasswordChange";

import LocalModeCard from "./components/LocalModeCard";
import SecurityCard from "./components/SecurityCard";
import SsoSettingsCard from "./components/SsoSettingsCard";
import RoutingPreferencesCard from "./components/RoutingPreferencesCard";
import ShutdownModal from "./components/ShutdownModal";

function getLocaleFromCookie() {
  if (typeof document === "undefined") return "en";
  const cookie = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${LOCALE_COOKIE}=`));
  const value = cookie ? decodeURIComponent(cookie.split("=")[1]) : "en";
  return normalizeLocale(value);
}

function subscribeToHost() {
  return () => {};
}

function getHostSnapshot() {
  return !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function getServerHostSnapshot() {
  return false;
}

export default function ProfilePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [locale, setLocale] = useState(() => getLocaleFromCookie());
  const [langOpen, setLangOpen] = useState(false);
  const [shutdownOpen, setShutdownOpen] = useState(false);

  const isRemoteHost = useSyncExternalStore(subscribeToHost, getHostSnapshot, getServerHostSnapshot);

  const profileSettings = useProfileSettings();
  const ssoConfig = useSsoConfig({
    settings: profileSettings.settings,
    setSettings: profileSettings.setSettings,
    loading: profileSettings.loading,
  });
  const dbBackup = useDatabaseBackup({
    onImportSuccess: profileSettings.reloadSettings,
  });
  const passwordChange = usePasswordChange();

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        router.push("/login");
      }
    } catch (err) {
      console.error("Failed to logout:", err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-0">
      <div className="flex flex-col gap-6">
        <LocalModeCard
          theme={theme}
          setTheme={setTheme}
          locale={locale}
          onOpenLanguage={() => setLangOpen(true)}
          dbLoading={dbBackup.dbLoading}
          dbStatus={dbBackup.dbStatus}
          dbAuth={dbBackup.dbAuth}
          setDbAuth={dbBackup.setDbAuth}
          openExportAuthModal={dbBackup.openExportAuthModal}
          closeDbAuthModal={dbBackup.closeDbAuthModal}
          handleDbAuthConfirm={dbBackup.handleDbAuthConfirm}
          handleImportDatabase={dbBackup.handleImportDatabase}
          importFileRef={dbBackup.importFileRef}
        />

        <SecurityCard
          requireLogin={profileSettings.settings.requireLogin === true}
          hasPassword={profileSettings.settings.hasPassword}
          loading={profileSettings.loading}
          onToggleRequireLogin={() =>
            profileSettings.updateRequireLogin(!profileSettings.settings.requireLogin)
          }
          passwords={passwordChange.passwords}
          setPasswords={passwordChange.setPasswords}
          passLoading={passwordChange.passLoading}
          passStatus={passwordChange.passStatus}
          onPasswordChange={passwordChange.handlePasswordChange}
        />

        <SsoSettingsCard
          settings={profileSettings.settings}
          loading={profileSettings.loading}
          ssoConfig={ssoConfig}
        />

        <RoutingPreferencesCard
          settings={profileSettings.settings}
          loading={profileSettings.loading}
          updateFallbackStrategy={profileSettings.updateFallbackStrategy}
          updateComboStrategy={profileSettings.updateComboStrategy}
          updateStickyLimit={profileSettings.updateStickyLimit}
          updateComboStickyLimit={profileSettings.updateComboStickyLimit}
          proxyForm={profileSettings.proxyForm}
          setProxyForm={profileSettings.setProxyForm}
          proxyStatus={profileSettings.proxyStatus}
          proxyLoading={profileSettings.proxyLoading}
          proxyTestLoading={profileSettings.proxyTestLoading}
          updateOutboundProxy={profileSettings.updateOutboundProxy}
          testOutboundProxy={profileSettings.testOutboundProxy}
          updateOutboundProxyEnabled={profileSettings.updateOutboundProxyEnabled}
          updateObservabilityEnabled={profileSettings.updateObservabilityEnabled}
        />

        {/* Account actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            fullWidth
            icon="power_settings_new"
            onClick={() => setShutdownOpen(true)}
            className="text-red-500 border-red-200 hover:bg-red-50 hover:border-red-300"
          >
            Shutdown
          </Button>
          <Button
            variant="outline"
            fullWidth
            icon="logout"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </div>

        {/* App Info */}
        <div className="text-center text-xs sm:text-sm text-text-muted py-4">
          <p>{APP_CONFIG.name} v{APP_CONFIG.version}</p>
          <p className="mt-1">{isRemoteHost ? "Remote Mode" : "Local Mode - All data stored on your machine"}</p>
        </div>
      </div>

      <LanguageSwitcher
        hideTrigger
        isOpen={langOpen}
        onClose={(next) => {
          setLangOpen(false);
          setLocale(next);
        }}
      />

      <ShutdownModal
        isOpen={shutdownOpen}
        onClose={() => setShutdownOpen(false)}
      />
    </div>
  );
}
