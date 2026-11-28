export const WENYAN_LOCALES = ["zh-CN", "zh-TW"];

export const TUNNEL_BENEFITS = [
  { icon: "public", title: "Truy cập mọi nơi", desc: "Dùng API của bạn từ bất kỳ mạng nào" },
  { icon: "group", title: "Chia sẻ Endpoint", desc: "Chia sẻ URL trực tiếp với đồng đội" },
  { icon: "code", title: "Dùng trên Cursor/Cline", desc: "Kết nối công cụ AI từ xa" },
  { icon: "lock", title: "Mã hóa đầu cuối", desc: "TLS đầu cuối qua Cloudflare" },
];

export const TUNNEL_PING_INTERVAL_MS = 2000;
export const TUNNEL_PING_MAX_MS = 300000;
export const STATUS_POLL_FAST_MS = 5000;
export const STATUS_POLL_SLOW_MS = 30000;
export const REACHABLE_MISS_THRESHOLD = 5;
export const CLIENT_PING_FAST_MS = 10000;
export const CLIENT_PING_SLOW_MS = 60000;
export const CLIENT_PING_TIMEOUT_MS = 5000;

export const CAVEMAN_LEVELS = [
  { id: "lite", label: "Nhẹ", desc: "Bỏ từ thừa, giữ nguyên ngữ pháp" },
  { id: "full", label: "Đầy đủ", desc: "Lược bỏ mạo từ, viết gọn theo cụm" },
  { id: "ultra", label: "Tối đa", desc: "Siêu cô đọng, nén mức tối đa" },
  { id: "wenyan-lite", label: "文 Lite", desc: "Văn ngôn cổ điển, nén nhẹ", wenyan: true },
  { id: "wenyan", label: "文 Full", desc: "Văn ngôn cổ điển (cô đọng ký tự, giữ nguyên mã nguồn)", wenyan: true },
  { id: "wenyan-ultra", label: "文 Ultra", desc: "Văn ngôn cô đọng cực đại", wenyan: true },
];

export const PONYTAIL_LEVELS = [
  { id: "lite", label: "Nhẹ", desc: "Làm đúng phần được hỏi, gợi ý hướng gọn hơn" },
  { id: "full", label: "Đầy đủ", desc: "Ưu tiên thư viện chuẩn & API gốc trước" },
  { id: "ultra", label: "Tối đa", desc: "Phản biện phần thừa trước khi code, YAGNI triệt để" },
];

// Anthropic prompt-cache TTL for conversation breakpoints (system/tools stay 1h).
export const CLAUDE_CACHE_TTLS = [
  { id: "5m", label: "5 phút", desc: "Mặc định: ghi cache tốn 1.25× input" },
  { id: "1h", label: "1 giờ", desc: "Giữ lâu khi tạm nghỉ: ghi cache tốn 2× input" },
];
