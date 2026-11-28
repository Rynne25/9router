# 🚀 Hướng Dẫn Cài Đặt Nhanh & Tự Động Nhận Bản Cập Nhật 9Router

> Bản phân phối 9Router tùy chỉnh được tích hợp tính năng **Chuyển đổi tài khoản Antigravity 2.0 / IDE / CLI** trực tiếp qua Windows Credential Manager (`gemini:antigravity`), nạp lại hot-reload `language_server`, SQLite Multi-runtime và tối ưu proxy.

---

## ⚡ Phần 1: Cài Đặt Lên Máy Khác (Nhanh Nhất - Dưới 1 Phút)

Người bạn của bạn **không cần cài Git**, **không cần build mã nguồn Next.js**, chỉ cần máy đã cài sẵn **Node.js (phiên bản >= 20.18)**.

### 🌟 Cách 1: Cài đặt trực tiếp qua 1 dòng lệnh (Khuyên dùng)
Mở **PowerShell** hoặc **Command Prompt (CMD)** và dán lệnh sau:

```bash
npm install -g https://github.com/Rynne25/9router/releases/download/v0.5.137/9router-0.5.137.tgz
```

Sau khi cài đặt xong, gõ lệnh để khởi động:
```bash
9router
```
*(Giao diện Web Dashboard và biểu tượng khay hệ thống sẽ tự động khởi động).*

---

### 📦 Cách 2: Cài đặt từ file `.tgz` gửi trực tiếp (Zalo, Telegram, Google Drive)
1. Bạn gửi file `9router-0.5.137.tgz` cho bạn của bạn.
2. Bạn của bạn tải file về máy (ví dụ lưu tại thư mục `Downloads`).
3. Mở Terminal / PowerShell tại thư mục chứa file và chạy:
   ```bash
   npm install -g ./9router-0.5.137.tgz
   ```
4. Khởi chạy ứng dụng:
   ```bash
   9router
   ```

---

### 💡 Lưu ý nhỏ trên Windows:
Nếu PowerShell báo lỗi chặn script (`cannot be loaded because running scripts is disabled`):
Chạy lệnh này một lần trong PowerShell:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

---

## 🔔 Phần 2: Cơ Chế Tự Động Thông Báo Khi Có Bản Cập Nhật Mới

Hệ thống đã được lập trình để **tự động kiểm tra phiên bản mới nhất** từ kho GitHub `https://github.com/Rynne25/9router`:

### 1. Trên giao diện Web Dashboard:
- Mỗi khi bạn của bạn mở Web Dashboard hoặc làm việc, hệ thống sẽ tự động so sánh phiên bản đang chạy với phiên bản mới nhất trên GitHub của bạn.
- Khi có bản mới, menu bên trái (Sidebar) sẽ xuất hiện biểu tượng huy hiệu nổi bật:  
  **`v0.5.x available`**
- Bấm vào biểu tượng sẽ hiện cửa sổ cập nhật: Người dùng có thể xem phiên bản mới và bấm **Cập nhật** để tự động nâng cấp mà không bị mất dữ liệu tài khoản hay cấu hình cũ.

### 2. Trên giao diện dòng lệnh (CLI):
- Mỗi lần gõ lệnh `9router`, menu lựa chọn sẽ tự động quét và đưa lựa chọn cập nhật lên đầu tiên:
  ```text
  ⬆  Update to v0.5.120 (current: v0.5.119)
  🌐 Web UI (Open in Browser)
  💻 Terminal UI (Interactive CLI)
  🔔 Hide to Tray (Background)
  ```
- Nếu chọn `Update`, terminal sẽ hiển thị ngay lệnh cập nhật tương ứng để chạy.

---

## 🛡️ Phần 3: Cấu Hình Tự Động Chạy Quyền Administrator (Windows)

Để tính năng MITM Proxy (port 443) và cấu hình DNS tự động can thiệp file `hosts` mà **không bao giờ bị hỏi popup UAC** mỗi khi bật máy hay chạy lệnh:

### 🚀 Cách thiết lập 1 click:
Mở PowerShell tại thư mục repo và chạy:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-admin-task.ps1
```
*(Chỉ cần bấm Yes xác nhận UAC 1 lần duy nhất lúc đăng ký).*

Sau khi chạy xong:
1. **Khởi động cùng Windows:** 9Router sẽ tự động chạy ngầm ở khay hệ thống (System Tray) với quyền Administrator cao nhất mỗi khi bạn đăng nhập Windows.
2. **Icon Desktop:** Xuất hiện shortcut **`9Router (Admin)`** ngoài màn hình chính — click là chạy ngay quyền admin không hỏi UAC.
3. **Lệnh gõ nhanh trong terminal:** Gõ `9router-admin` ở bất kỳ cửa sổ CMD/PowerShell nào để bật dịch vụ.
4. **Khi cập nhật phiên bản mới:** Chạy `npm install -g 9router` bình thường. Lịch trình Admin và shortcut vẫn tự động trỏ đến phiên bản mới nhất mà không cần cài đặt lại!

---

## 🛠️ Phần 4: Quy Trình Phát Hành Bản Mới (Dành Cho Chủ Repo)

Mỗi khi bạn bổ sung tính năng mới hoặc sửa lỗi và muốn bạn bè nhận được thông báo cập nhật, bạn chỉ cần thực hiện 4 bước đơn giản:

1. **Tăng số phiên bản** trong file `package.json` (ví dụ từ `0.5.136` lên `0.5.137`).
2. **Đóng gói bản build mới**:
   ```bash
   npm run cli:pack
   ```
   *(Lệnh này sẽ tự động tạo file `9router-0.5.137.tgz` dung lượng ~17MB).*
3. **Commit và đẩy code lên GitHub**:
   ```bash
   git add .
   git commit -m "feat: release version 0.5.137"
   git push origin master
   ```
4. **Tạo Release trên GitHub**:
   - Truy cập: `https://github.com/Rynne25/9router/releases/new`
   - Đặt Tag và Tên release: `v0.5.137`
   - Kéo thả file `9router-0.5.137.tgz` vào ô đính kèm (**Attach binaries by dropping them here**).
   - Nhấn **Publish release**.

> 🎉 **Ngay sau khi bạn Publish Release**, tất cả máy bạn bè đang chạy 9Router sẽ tự động nhận được thông báo cập nhật phiên bản mới!

---

## ⚡ Phần 5: Bộ Siêu Tiết Kiệm Token 2 Tầng (9Router + Antigravity)

Từ phiên bản `0.5.137`, 9Router tích hợp kiến trúc tiết kiệm token **2 tầng** chạy tự động, an toàn tuyệt đối (fail-open) và giữ nguyên Prompt Cache:

### 🔹 Tầng 1: Bộ lọc tích hợp sẵn trong Proxy 9Router (0 dependency ngoài)
Hoạt động trực tiếp trên luồng request trước khi gửi tới model (tương thích Antigravity, Claude, OpenAI, Kiro):
1. **RTK Filter**: Lọc và nén output lệnh terminal (`git`, `grep`, `ls`, `pytest`, `cargo`, `logs`...) giúp giảm ~60–90% token đầu vào.
2. **TOON (Tabular JSON Compressor)**: Tự động phát hiện các mảng JSON đồng nhất trong kết quả tool (từ 3 phần tử trở lên) và nén sang định dạng bảng `[TOON]` cô đọng, giảm ~30–60% token JSON.
3. **Tool Dedup (SHA-256)**: Khử trùng lặp các lần đọc file hoặc output tool giống hệt nhau bằng tham chiếu ngắn SHA-256. Hỗ trợ 2 chế độ:
   - **Cache-Safe (Mặc định)**: Giữ nguyên lần đọc đầu tiên để bảo toàn Prompt Cache prefix, chỉ thay thế các lần lặp lại phía sau.
   - **Recency**: Giữ kết quả mới nhất ở cuối hội thoại và thay thế các bản cũ hơn.
4. **Headroom + Caveman + Ponytail**: Nén ngữ cảnh hội thoại dài qua sidecar Headroom và định hướng model trả lời súc tích, viết code tối giản.
5. **3 Smart Presets** trên trang `/dashboard/token-saver`:
   - `Cân bằng & Giữ Cache` (`balanced`) — khuyên dùng hàng ngày.
   - `Tiết kiệm tối đa` (`max`) — nén sâu tối đa với Dedup Recency & Caveman Ultra.
   - `An toàn tuyệt đối` (`lossless`) — chỉ nén dữ liệu tool tầng 1, giữ 100% văn phong gốc của model.

### 🔹 Tầng 2: Trung tâm Plugin Antigravity (Cài đặt 1-Click)
Tự động nhận diện môi trường **Node.js / Python** trên máy bạn, cài đặt gói plugin + MCP server tối ưu cho Antigravity IDE và tự động xử lý xung đột giữa các plugin:
- **Node >= 22.16**: Tự động chọn Smart Pack **`agy-dart` + `codegraph`** (`agy-dart` thay thế trọn vẹn `agy-fast` và `context-mode` mà không xung đột).
- **Node 20.x**: Tự động chọn Smart Pack **`agy-fast` + `context-mode` + `codegraph`**.

#### Cách cài đặt nhanh 1-Click:
1. **Qua Web Dashboard**: Mở **Tiết kiệm Token → Trung tâm Plugin Antigravity** (`/dashboard/token-saver#antigravity-plugins`) và bấm **`⚡ Cài trọn gói thông minh (1-Click)`**.
2. **Qua dòng lệnh CLI**:
   ```bash
   9router setup-saver --yes
   ```
   Các tùy chọn hữu ích khác:
   - Xem trạng thái & kiểm tra xung đột: `9router setup-saver --status`
   - Cài riêng từng plugin: `9router setup-saver --plugin agy-dart`
   - Gỡ plugin: `9router setup-saver --uninstall agy-dart`
