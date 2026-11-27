"use client";

import { FlowDeck, FlowNode, FlowBeam } from "@/shared/components/hud";
import { playHudSound } from "@/shared/utils/hudAudio";

/**
 * 4-stage Live Endpoint & Tunnel Access Map for /dashboard/endpoint.
 */
export default function EndpointFlowCircuit({
  baseUrl = "http://localhost:20128/v1",
  isRemoteHost = false,
  requireApiKey = false,
  onToggleRequireApiKey,
  activeKeysCount = 0,
  cloudflareEnabled = false,
  cloudflareReachable = false,
  tailscaleEnabled = false,
  tailscaleReachable = false,
  copied,
  onCopy,
}) {
  const cfLive = Boolean(cloudflareEnabled && cloudflareReachable);
  const tsLive = Boolean(tailscaleEnabled && tailscaleReachable);
  const tunnelLive = cfLive || tsLive;
  const tunnelLabel = cfLive
    ? "Cloudflare Tunnel"
    : tsLive
      ? "Tailscale Mesh"
      : cloudflareEnabled || tailscaleEnabled
        ? "Tunnel đang kết nối"
        : "Cục bộ (Localhost)";

  return (
    <FlowDeck
      storageKey="endpoint"
      title="SƠ ĐỒ KẾT NỐI ENDPOINT & TUNNEL"
      badge={tunnelLive ? "TUNNEL TRỰC TUYẾN" : "CỔNG NỘI BỘ"}
      statusLabel={requireApiKey ? `BẢO VỆ (${activeKeysCount} KHÓA)` : "CỔNG ĐANG MỞ"}
      statusAccent={requireApiKey ? "emerald" : "amber"}
      accent={tunnelLive ? "emerald" : "cyan"}
      borderBeam={tunnelLive}
    >
      {({ hoveredIndex, setHoveredIndex }) => {
        const isHighlighted = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) <= 1;
        const isDimmed = (idx) => hoveredIndex !== null && Math.abs(hoveredIndex - idx) > 1;

        return (
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1fr)_48px_minmax(0,1fr)] items-stretch gap-1 md:gap-0">
            <FlowNode
              step="01"
              eyebrow="ĐIỂM GỌI"
              title="IDE / CLI / Script"
              subtitle={isRemoteHost ? "Truy cập từ máy từ xa" : "Cục bộ & Mạng LAN"}
              icon="devices"
              status="standby"
              badge={isRemoteHost ? "REMOTE" : "LOCAL"}
              highlighted={isHighlighted(0)}
              dimmed={isDimmed(0)}
              onHoverStart={() => setHoveredIndex(0)}
              onHoverEnd={() => setHoveredIndex(null)}
              footer={<span className="text-text-subtle truncate">OpenAI / Anthropic / Gemini SDK</span>}
            />

            <FlowBeam
              compact
              active={true}
              highlighted={hoveredIndex === 0 || hoveredIndex === 1}
              dimmed={hoveredIndex !== null && hoveredIndex > 2}
              accent={tunnelLive ? "emerald" : "cyan"}
              label={tunnelLive ? "HTTPS" : "HTTP"}
            />

            <FlowNode
              step="02"
              eyebrow="ĐƯỜNG TRUYỀN"
              title={tunnelLabel}
              subtitle={
                cfLive
                  ? "Tên miền Cloudflare đang mở"
                  : tsLive
                    ? "Mạng riêng Tailscale sẵn sàng"
                    : "Kết nối trực tiếp cổng 20128"
              }
              icon={tunnelLive ? "cloud_done" : "lan"}
              status={tunnelLive ? "live" : cloudflareEnabled || tailscaleEnabled ? "warning" : "standby"}
              badge={tunnelLive ? "ONLINE" : "LAN"}
              highlighted={isHighlighted(1)}
              dimmed={isDimmed(1)}
              onHoverStart={() => setHoveredIndex(1)}
              onHoverEnd={() => setHoveredIndex(null)}
              footer={
                <span className="text-text-subtle truncate">
                  {tunnelLive ? "Mã hóa đầu cuối qua Tunnel" : "Độ trễ thấp nội bộ"}
                </span>
              }
            />

            <FlowBeam
              compact
              active={requireApiKey || activeKeysCount > 0}
              highlighted={hoveredIndex === 1 || hoveredIndex === 2}
              dimmed={hoveredIndex !== null && (hoveredIndex < 1 || hoveredIndex > 3)}
              accent={requireApiKey ? "emerald" : "amber"}
              label={requireApiKey ? "AUTH" : "MỞ"}
            />

            <FlowNode
              step="03"
              eyebrow="XÁC THỰC"
              title={requireApiKey ? "Yêu cầu Khóa API" : "Chế độ Truy cập Mở"}
              subtitle={`${activeKeysCount} khóa API đang hoạt động`}
              icon={requireApiKey ? "verified_user" : "lock_open"}
              status={requireApiKey ? "live" : "warning"}
              badge={requireApiKey ? "BẮT BUỘC" : "MỞ"}
              active={requireApiKey}
              highlighted={isHighlighted(2)}
              dimmed={isDimmed(2)}
              onHoverStart={() => setHoveredIndex(2)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => {
                playHudSound("toggle");
                onToggleRequireApiKey?.(!requireApiKey);
              }}
              footer={
                <span className="text-cyan-600 dark:text-cyan-400 font-semibold whitespace-nowrap">
                  {requireApiKey ? "Nhấp để tắt yêu cầu API Key" : "Nhấp để bật khóa bảo vệ"}
                </span>
              }
            />

            <FlowBeam
              compact
              active={true}
              highlighted={hoveredIndex === 2 || hoveredIndex === 3}
              dimmed={hoveredIndex !== null && hoveredIndex < 2}
              accent="emerald"
              label="/v1"
            />

            <FlowNode
              step="04"
              eyebrow="CỔNG GATEWAY"
              title="9Router API /v1"
              subtitle={baseUrl}
              icon="api"
              status="live"
              badge="SẴN SÀNG"
              highlighted={isHighlighted(3)}
              dimmed={isDimmed(3)}
              onHoverStart={() => setHoveredIndex(3)}
              onHoverEnd={() => setHoveredIndex(null)}
              footer={
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="text-text-subtle truncate">OpenAI Base URL</span>
                  <button
                    type="button"
                    data-cursor-target="true"
                    onClick={() => {
                      playHudSound("click");
                      onCopy?.(baseUrl, "endpoint-flow-url");
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {copied === "endpoint-flow-url" ? "check" : "content_copy"}
                    </span>
                    <span>{copied === "endpoint-flow-url" ? "Đã chép" : "Chép URL"}</span>
                  </button>
                </div>
              }
            />
          </div>
        );
      }}
    </FlowDeck>
  );
}
