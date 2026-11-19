import { Card, Button, Input } from "@/shared/components";
import Modal from "@/shared/components/Modal";
import { cn } from "@/shared/utils/cn";
import { LOCALE_FLAGS } from "@/shared/constants/locales";

export default function LocalModeCard({
  theme,
  setTheme,
  locale,
  onOpenLanguage,
  dbLoading,
  dbStatus,
  dbAuth,
  setDbAuth,
  openExportAuthModal,
  closeDbAuthModal,
  handleDbAuthConfirm,
  handleImportDatabase,
  importFileRef,
}) {
  return (
    <>
      {/* Local Mode Info */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="size-10 sm:size-12 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-xl sm:text-2xl">computer</span>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold">Local Mode</h2>
              <p className="text-sm text-text-muted">Running on your machine</p>
            </div>
          </div>
          <div className="inline-flex p-1 rounded-lg bg-black/5 dark:bg-white/5 w-full sm:w-auto">
            {["light", "dark", "system"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTheme(option)}
                className={cn(
                  "flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-md font-medium transition-all flex-1 sm:flex-initial",
                  theme === option
                    ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                    : "text-text-muted hover:text-text-main"
                )}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {option === "light" ? "light_mode" : option === "dark" ? "dark_mode" : "contrast"}
                </span>
                <span className="capitalize text-xs sm:text-sm">{option}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 pt-4 border-t border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-lg bg-bg border border-border gap-2">
            <div>
              <p className="font-medium text-sm sm:text-base">Database Location</p>
              <p className="text-xs sm:text-sm text-text-muted font-mono break-all">~/.9router/db/data.sqlite</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="secondary"
              icon="download"
              onClick={openExportAuthModal}
              loading={dbLoading}
              className="w-full sm:w-auto"
            >
              Download Backup
            </Button>
            <Button
              variant="outline"
              icon="upload"
              onClick={() => importFileRef.current?.click()}
              disabled={dbLoading}
              className="w-full sm:w-auto"
            >
              Import Backup
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportDatabase}
            />
          </div>
          {dbStatus?.message && (
            <p className={`text-sm ${dbStatus.type === "error" ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
              {dbStatus.message}
            </p>
          )}
        </div>
      </Card>

      {/* Language */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">language</span>
          </div>
          <h3 className="text-base sm:text-lg font-semibold">Language</h3>
        </div>
        <button
          type="button"
          onClick={onOpenLanguage}
          className="flex items-center justify-between w-full p-3 rounded-lg bg-bg border border-border hover:border-primary/50 transition-colors"
          data-i18n-skip="true"
        >
          <span className="text-sm text-text-muted">Display language</span>
          <span className="text-2xl">{LOCALE_FLAGS[locale] || "🌐"}</span>
        </button>
      </Card>

      {/* Database Auth Modal */}
      {dbAuth && (
        <Modal
          isOpen={dbAuth.open}
          onClose={closeDbAuthModal}
          title="Confirm Password"
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={closeDbAuthModal} disabled={dbLoading}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleDbAuthConfirm} loading={dbLoading} disabled={!dbAuth.password}>
                Confirm
              </Button>
            </>
          }
        >
          <p className="text-text-muted mb-3 text-sm">
            Enter your current password to {dbAuth.mode === "export" ? "export" : "import"} the database.
          </p>
          <Input
            type="password"
            value={dbAuth.password}
            onChange={(e) => setDbAuth((s) => ({ ...s, password: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && dbAuth.password) handleDbAuthConfirm();
            }}
            placeholder="Current password"
            autoFocus
          />
        </Modal>
      )}
    </>
  );
}
