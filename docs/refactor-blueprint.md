# Kế Hoạch Tái Cấu Trúc Kiến Trúc 9Router (Refactor Blueprint)

> Tài liệu này tổng hợp kiến trúc chuẩn sau **Phase 1**, kiểm kê toàn bộ các god files (>800 dòng) còn lại trong `src/` và `open-sse/`, cùng lộ trình hành động chi tiết cho **Phase 2**.

---

## 1. Quy Tắc Chất Lượng & Quality Gate (`eslint.config.mjs`)

- **Lệnh kiểm tra toàn repo:** `npm run lint` (`eslint src open-sse`)
- **Các rule an toàn runtime bắt buộc (Error):**
  - `no-undef`: Chặn crash `ReferenceError` do thiếu import hoặc dùng biến ngoài block scope.
  - `no-use-before-define: ["error", { functions: false, classes: true, variables: true }]`: Chặn lỗi TDZ (Temporal Dead Zone) khi đọc `const`/`let` (hoặc `useMemo`/helper arrow function) trước khi khai báo.
  - `react-hooks/rules-of-hooks`: Đảm bảo thứ tự gọi Hooks luôn nhất quán.
  - `react-hooks/exhaustive-deps` (`warn`): Cảnh báo thiếu dependency trong Hooks.
- **Nguyên tắc phân rã (Decomposition Pattern):**
  - **UI Pages / Entry:** Thin Orchestrator `< 300 dòng`, không giữ fetch/business logic trực tiếp.
  - **Hooks (`hooks/use*.js`):** Tách state, side-effect, fetch API, handlers theo domain.
  - **Components (`components/*.js`):** Mỗi component `< 350 dòng`, nhận props rõ ràng, không trùng lặp logic.
  - **Pure Utils (`utils/*.js`):** Tách logic thuần (parser, formatter, filter, sort) ra ngoài React component để dễ unit test.
  - **Backward Compatibility:** Giữ nguyên đường dẫn import công khai (dùng barrel re-export nếu chia nhỏ module).

---

## 2. Kiến Trúc Chuẩn Đạt Được Ở Phase 1

Phase 1 đã xử lý 3 cụm UI god files lớn nhất và thiết lập ESLint gate:

| Mục tiêu Phase 1 | Trước | Sau (Thin Entry + Modular) | Cấu trúc đích |
| --- | --- | --- | --- |
| `providers/[id]/page.js` | 2,537 dòng | `page.js` (~180 dòng) | `utils/providerMeta.js`, 8 hooks (`useProviderConnections`, `useProviderSettings`, `useProviderModals`, `useOneByOneTest`, `useBulkProxy`, `useAntigravityActions`, `useModelCatalogs`, `useProviderModels`), 8 components (`ProviderDetailHeader`, `ConnectionsToolbar`, `AddConnectionActions`, `ConnectionsCard`, `ModelFamilyCard`, `ModelSeriesGroupList`, `ProviderModelsCard`, `ProviderTestModals`) |
| `ProviderLimits/index.js` & `utils.js` | 1,744 + 1,146 dòng | `index.js` (~243 dòng) + `utils.js` (barrel) | `utils/` (`constants`, `tierUtils`, `providerResetUtils`, `quotaFormatters`, `connectionFilterUtils`, `antigravityQuotaParser`, `quotaParsers`, `quotaFamilyUtils`), `hooks/` (`useProviderLimitsData`, `useQuotaAutoRefresh`, `useConnectionQuickActions`), `components/` (`QuotaEmptyState`, `QuotaRow`, `ProviderLimitCard`, `QuotaPaginationBar`, `ResetCreditsModal`, `QuotaFilterToolbar`, `ProviderLimitHeader`) |
| `combos/page.js` & `ModelSelectModal.js` | 1,450 + 1,040 dòng | `page.js` (~173 dòng) + `ModelSelectModal.js` (~231 dòng) | `combos/hooks/useCombosPage.js`, `combos/components/` (`ComboStrategyBar`, `ComboSelectionToolbar`, `ComboCard`, `CapacityAdapterSection`), tái sử dụng `src/shared/components/ComboFormModal.js`, `model-select/` (`useLiveProviderModels`, `useGroupedModels`, `modelTheme`, `ComboSelectSection`, `ModelGroupList`, `ModelSelectModalView`), single source `selectableModels.js` |
| **Lint & Runtime Gate** | Chưa có script `lint`, 4 lỗi `no-undef` & 87 `no-use-before-define` | `npm run lint` + 0 lỗi `no-undef`/`no-use-before-define` ngoài 3 target | Sửa 4 lỗi `ReferenceError` thật (`gemini-web.js`, `testUtils.js`, `accountService.js`) và toàn bộ TDZ/`no-use-before-define` ở `open-sse/`, `src/lib/`, `src/mitm/`, `cli-tools/components/*`, `EndpointPageClient.js`, `providers/page.js`, `TokenSaverClient.js`, v.v. |

---

## 3. Kiểm Kê God Files Còn Lại (>800 dòng trong `src/` & `open-sse/`)

### Nhóm A — Trọng tâm Phase 2 (Ưu tiên cao)

| File | Số dòng | Vấn đề chính |
| --- | ---: | --- |
| `src/app/(dashboard)/dashboard/profile/page.js` | 1,703 | Gộp theme/language, DB backup/import, đổi mật khẩu, OIDC SSO, SAML SSO + hướng dẫn IdP, routing preferences, outbound proxy, observability & shutdown vào 1 file. |
| `open-sse/executors/cursor.js` | 1,461 | Trộn protobuf framing, HTTP/2 fallback transport, SSE chunk parsing, tool-call decoding, checksum/session headers và retry logic. |
| `src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js` | 1,337 | Trộn quản lý API keys, Cloudflare Tunnel polling, Tailscale install SSE stream + funnel polling, security warning banner và 6 modals. |
| `open-sse/executors/kiro.js` | 1,220 | Trộn AWS EventStream binary parsing, Kiro request translation, token/profile headers và streaming response adaptation. |
| `src/app/(dashboard)/dashboard/proxy-pools/page.js` | 1,211 | Trộn CRUD proxy pool, bulk selection, health check concurrency, batch import và 4 cloud relay deploy modals (Vercel, Cloudflare, Deno, Netlify). |
| `src/app/(dashboard)/dashboard/providers/page.js` | 1,157 | Trộn stats calculation, batch testing, remote sync receiver polling, 4 nhóm provider cards (`ProviderCard`, `ApiKeyProviderCard`, `ProviderTestResultsView`) và 2 modals. |
| `open-sse/executors/deepseek-web.js` | 1,124 | Trộn PoW challenge, session/cookie, Playwright/HTTP transport, thinking/search flags và SSE tool emulation. |
| `open-sse/executors/qoder.js` | 1,066 | Trộn PAT/job-token exchange, region routing (`intl`/`cn`), attachment upload, SSE chunk parser và retry handling. |
| `open-sse/executors/chatgpt-web/firstParty.js` | 989 | Trộn first-party ChatGPT session negotiation, sentinel/arkose token flow, SSE delta parsing và tool handling. |
| `open-sse/services/combo.js` | 920 | Trộn capability detection/reordering, tool history flattening, rotation/sticky routing, standard failover (`handleComboChat`) và fusion consensus/judge (`handleFusionChat`). |
| `open-sse/executors/devin-cli.js` | 848 | Trộn Devin CLI auth/session management, SSE streaming parser và tool/payload normalization. |

### Nhóm B — God Files khác (>800 dòng) cần đưa vào Backlog Phase 2.5

| File | Số dòng | Hướng tách đề xuất |
| --- | ---: | --- |
| `open-sse/utils/cursorProtobuf.js` | 1,124 | Tách `wireCodec.js`, `messageEncoder.js`, `responseDecoder.js` |
| `src/app/(dashboard)/dashboard/token-saver/TokenSaverClient.js` | 1,081 | Tách `useHeadroomController.js`, `RtkSection.js`, `CavemanSection.js`, `HeadroomCard.js` |
| `src/app/api/providers/[id]/test/testUtils.js` | 1,048 | Tách theo nhóm provider (`oauthTesters.js`, `apiKeyTesters.js`, `webCookieTesters.js`, `proxyFetch.js`) |
| `open-sse/translator/deepseekWebTools.js` | 1,034 | Tách schema prompt builder & `<tool>` parser khỏi stream adapter |
| `src/shared/components/OAuthModal.js` | 1,014 | Tách từng flow (`DeviceCodeFlow.js`, `AuthCodePkceFlow.js`, `ManualCallbackModal.js`) |
| `src/lib/oauth/utils/server.js` | 974 | Tách callback HTML templates, local HTTP server lifecycle, token exchange helpers |
| `src/app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js` | 968 | Tách `useChatStream.js`, `ChatSidebar.js`, `MessageList.js`, `ChatComposer.js` |
| `open-sse/providers/capabilities.js` | 889 | Tách capability matrix theo họ model/provider (`capabilities/claude.js`, `gemini.js`, `openai.js`, `others.js`) |
| `src/mitm/manager.js` | 884 | Tách `processSupervisor.js`, `certManager.js`, `dnsOrchestrator.js`, `settingsBridge.js` |
| `src/lib/tunnel/tailscale/tailscale.js` | 860 | Tách `tailscaleInstall.js`, `tailscaleDaemon.js`, `tailscaleFunnel.js` |
| `open-sse/services/tokenRefresh/providers.js` | 854 | Tách mỗi provider refresh strategy thành map/registry module nhỏ |
| `src/app/(dashboard)/dashboard/cli-tools/components/MitmToolCard.js` | 830 | Tách `useMitmToolConfig.js`, `AliasMappingList.js`, `SudoPasswordModal.js` |
| `src/lib/db/repos/usageRepo.js` | 816 | Tách `usageWriter.js`, `usageAggregator.js`, `usageQuery.js` |

*(Ghi chú: Trong `open-sse/executors/`, các file tiệm cận ngưỡng 600–800 dòng như `gemini-web.js` (796), `antigravity.js` (699), `muse-web.js` (677), `grok-web.js` (618) đã bắt đầu tách sub-modules như `gemini-web/*`, `chatgpt-web/*` — tiếp tục giữ chuẩn `<500` dòng/file khi mở rộng.)*

---

## 4. Lộ Trình Chi Tiết Phase 2

### 4.1. `src/app/(dashboard)/dashboard/profile/page.js` (1,703 → ~220 dòng)
- **Hooks:**
  - `hooks/useProfileSettings.js`: fetch/patch `/api/settings`, routing preferences, outbound proxy, observability.
  - `hooks/useSsoConfig.js`: toàn bộ state + test/save/upload metadata & cert cho OIDC & SAML.
  - `hooks/useDatabaseBackup.js`: export/import backup + modal xác thực mật khẩu.
- **Components:**
  - `components/LocalModeCard.js` (theme switcher + DB backup/import)
  - `components/SecurityCard.js` (require login + đổi mật khẩu)
  - `components/SsoSettingsCard.js` + `components/SamlGuideDrawer.js` + `components/OidcForm.js` + `components/SamlForm.js`
  - `components/RoutingPreferencesCard.js` & `components/OutboundProxyCard.js` & `components/ObservabilityCard.js`

### 4.2. `src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js` (1,337 → ~250 dòng)
- **Hooks:**
  - `hooks/useApiKeys.js`: CRUD API keys, auto-provision default key, toggle visibility & key access.
  - `hooks/useCloudflareTunnel.js`: status sync, client ping health, enable/disable modal state.
  - `hooks/useTailscaleTunnel.js`: kiểm tra cài đặt, SSE install log stream, login/funnel polling, enable/disable.
- **Components:**
  - `components/TunnelEndpointSection.js` (Local + Cloudflare + Tailscale rows + `SecurityWarning`)
  - `components/ApiKeysCard.js` (danh sách key + `KeyAccessControls`)
  - `components/TunnelModals.js` (Enable/Disable Cloudflare, Tailscale Install/Connect/Disable, Add/Created Key)

### 4.3. `src/app/(dashboard)/dashboard/proxy-pools/page.js` (1,211 → ~240 dòng)
- **Hooks:**
  - `hooks/useProxyPools.js`: fetch, filter, shift/ctrl multi-selection, CRUD, single test, bulk toggle/delete.
  - `hooks/useProxyHealthCheck.js`: batch health check với progress `{ current, total }`.
  - `hooks/useRelayDeploy.js`: state + submit handler cho 4 cloud relay platforms (Vercel, Cloudflare, Deno, Netlify) dùng chung config table thay vì 4 hàm lặp lại.
- **Components:**
  - `components/ProxyPoolsToolbar.js` (filter tabs, bulk actions, health check, relay dropdown menu)
  - `components/ProxyPoolTable.js` (hoặc `ProxyPoolCardList.js`)
  - `components/ProxyPoolFormModal.js` & `components/BatchImportProxyModal.js`
  - `components/RelayDeployModal.js` (1 modal config-driven cho 4 nền tảng Vercel/Cloudflare/Deno/Netlify)

### 4.4. `src/app/(dashboard)/dashboard/providers/page.js` (1,157 → ~230 dòng)
- **Hooks:**
  - `hooks/useProvidersOverview.js`: fetch `/api/providers` & `/api/provider-nodes`, `getProviderStats`, batch test, toggle provider.
  - `hooks/useRemoteSyncReceiver.js`: tách hoàn toàn polling `/api/sync/config`, `/api/sync/peers`, `/api/sync/events`.
- **Utils:**
  - `utils/providerStats.js`: đưa `getStatusDisplay`, `getConnectionErrorTag`, `computeProviderStats` ra pure helpers.
- **Components:**
  - `components/ProviderCard.js`, `components/ApiKeyProviderCard.js`, `components/ProviderTestResultsModal.js` (tách khỏi `page.js`).

### 4.5. `open-sse/executors/*` (Chuẩn hóa kiến trúc thư mục theo mẫu `chatgpt-web/` & `gemini-web/`)
Các executor >800 dòng nên giữ file gốc làm facade/orchestrator (`<350 dòng`) và tách thành thư mục con:
1. `open-sse/executors/cursor.js` (1,461) → `cursor/` (`h2Transport.js`, `headers.js`, `streamParser.js`, `toolAdapter.js`), giữ `CursorExecutor` ở `cursor.js`.
2. `open-sse/executors/kiro.js` (1,220) → `kiro/` (`eventStreamParser.js`, `requestBuilder.js`, `authHeaders.js`), giữ `KiroExecutor` ở `kiro.js`.
3. `open-sse/executors/deepseek-web.js` (1,124) → `deepseek-web/` (`sessionAuth.js`, `powSolver.js`, `sseParser.js`, `toolAdapter.js`).
4. `open-sse/executors/qoder.js` (1,066) → `qoder/` (`jobTokenClient.js`, `requestBuilder.js`, `streamDecoder.js`).
5. `open-sse/executors/chatgpt-web/firstParty.js` (989) → tách `sentinelAuth.js`, `sseEventDecoder.js`, `turnExecutor.js`.
6. `open-sse/executors/devin-cli.js` (848) → `devin-cli/` (`sessionClient.js`, `streamAdapter.js`).

### 4.6. `open-sse/services/combo.js` (920 → ~260 dòng)
Tách thành cụm `open-sse/services/combo/` và giữ `open-sse/services/combo.js` re-export đầy đủ các hàm public (`reorderByCapabilities`, `detectRequiredCapabilities`, `getRotatedModels`, `resetComboRotation`, `getComboModelsFromData`, `isZeroContentResponse`, `handleComboChat`, `handleFusionChat`):
- `combo/capabilities.js`: `HARD_CAPS`, `reorderByCapabilities`, `detectRequiredCapabilities`, `trailingUserItems`.
- `combo/rotation.js`: `comboRotationState`, `getRotatedModels`, `resetComboRotation`, `getComboModelsFromData`.
- `combo/fusion.js`: `flattenToolHistory`, `extractPanelText`, `buildJudgePrompt`, `collectPanel`, `handleFusionChat`.
- `combo/failover.js`: `peekComboResponse`, `isZeroContentResponse`, `handleComboChat`.

---

## 5. Thứ Tự Triển Khai Đề Xuất Cho Phase 2

1. **Bước 1 (Backend Core — không đụng UI):** Tách `open-sse/services/combo.js` và `open-sse/executors/{cursor,kiro,deepseek-web,qoder}.js`, chạy unit test `tests/unit/*` sau mỗi module.
2. **Bước 2 (Dashboard Pages):** Tách song song `profile/page.js`, `endpoint/EndpointPageClient.js`, `proxy-pools/page.js`, `providers/page.js` (mỗi trang 1 worktree độc lập như Phase 1).
3. **Bước 3 (Quality Gate CI):** Yêu cầu mọi PR/commit vượt qua `npm run lint` với `0` lỗi `no-undef`, `0` lỗi `no-use-before-define`, và từng bước giảm warning `react-hooks/exhaustive-deps` + lỗi React Compiler (`set-state-in-effect`, `immutability`).
