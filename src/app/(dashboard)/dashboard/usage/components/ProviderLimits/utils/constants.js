export const QUOTA_CACHE_KEY = "quotaCacheData";
export const REFRESH_INTERVAL_MS = 60000;
// Claude usage/quota endpoint rate-limits; poll it less often than other providers
export const CLAUDE_REFRESH_INTERVAL_MS = 600000;
export const DEPLETED_QUOTA_THRESHOLD = 5;
export const AUTO_REFRESH_STORAGE_KEY = "quotaAutoRefresh";
export const CONNECTIONS_PAGE_SIZE = 50;
export const ACCOUNT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
export const ACCOUNT_PAGE_SIZE_MAX = 500;

export const ACCOUNT_FILTER_OPTIONS = [
  { value: "all", label: "Tất cả tài khoản" },
  { value: "active", label: "Đang bật" },
  { value: "inactive", label: "Đã tắt" },
];

export const QUOTA_SORT_OPTIONS = [
  { value: "default", label: "Thứ tự mặc định" },
  { value: "remaining-asc", label: "% còn lại: Thấp → Cao" },
  { value: "remaining-desc", label: "% còn lại: Cao → Thấp" },
];

export const QUOTA_WINDOW_GROUPS = [
  { id: "daily_5h", label: "Theo ngày / 5h", icon: "schedule" },
  { id: "weekly", label: "Theo tuần", icon: "date_range" },
  { id: "standalone", label: "Riêng biệt", icon: "layers" },
];
