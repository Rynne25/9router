import { Card, Button, Toggle, Input } from "@/shared/components";

export default function SecurityCard({
  requireLogin,
  hasPassword,
  loading,
  onToggleRequireLogin,
  passwords,
  setPasswords,
  passLoading,
  passStatus,
  onPasswordChange,
}) {
  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
          <span className="material-symbols-outlined text-[20px]">shield</span>
        </div>
        <h3 className="text-base sm:text-lg font-semibold">Security</h3>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex items-start sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm sm:text-base">Require login</p>
            <p className="text-xs sm:text-sm text-text-muted">
              When ON, dashboard requires password. When OFF, access without login.
            </p>
          </div>
          <Toggle
            checked={requireLogin === true}
            onChange={onToggleRequireLogin}
            disabled={loading}
          />
        </div>
        {requireLogin === true && (
          <form onSubmit={onPasswordChange} className="flex flex-col gap-4 pt-4 border-t border-border/50">
            {hasPassword && (
              <div className="flex flex-col gap-2">
                <label className="text-xs sm:text-sm font-medium">Current Password</label>
                <Input
                  type="password"
                  placeholder="Enter current password"
                  value={passwords.current}
                  onChange={(e) => setPasswords((prev) => ({ ...prev, current: e.target.value }))}
                  required
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs sm:text-sm font-medium">New Password</label>
                <Input
                  type="password"
                  placeholder="Enter new password"
                  value={passwords.new}
                  onChange={(e) => setPasswords((prev) => ({ ...prev, new: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs sm:text-sm font-medium">Confirm New Password</label>
                <Input
                  type="password"
                  placeholder="Confirm new password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords((prev) => ({ ...prev, confirm: e.target.value }))}
                  required
                />
              </div>
            </div>

            {passStatus?.message && (
              <p className={`text-xs sm:text-sm ${passStatus.type === "error" ? "text-red-500" : "text-green-500"}`}>
                {passStatus.message}
              </p>
            )}

            <div className="pt-2">
              <Button type="submit" variant="primary" loading={passLoading} className="w-full sm:w-auto">
                {hasPassword ? "Update Password" : "Set Password"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
