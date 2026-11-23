import { platform as getOsPlatform } from "os";
import { execFile, spawn } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const KEYRING_TARGET = "gemini:antigravity";
export const KEYRING_USER = "antigravity";

/**
 * Executes a PowerShell script reliably via -EncodedCommand (UTF-16LE Base64).
 * Avoids Windows PowerShell 5.1 stdin buffering/quoting issues.
 */
export function runPowerShellScript(script) {
  const fullScript = `$ProgressPreference = 'SilentlyContinue'\n${script}`;
  const encoded = Buffer.from(fullScript, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-OutputFormat", "Text", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        const cleanErr = stderr
          .replace(/^#< CLIXML\s*/i, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/_x000D__x000A_/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        reject(new Error(cleanErr || `PowerShell exited with code ${code}`));
      }
    });
  });
}

/**
 * Writes Antigravity OAuth payload to the OS Keyring / Windows Credential Manager.
 * Matches Antigravity-Manager's write_to_system_keyring in integration.rs.
 */
export async function writeSystemKeyring({ accessToken, refreshToken, email, idToken, expiryTimestamp }) {
  const expirySecs = expiryTimestamp && expiryTimestamp > 10_000_000_000
    ? Math.floor(expiryTimestamp / 1000)
    : expiryTimestamp || Math.floor((Date.now() + 3600 * 1000) / 1000);
  const expiryDate = new Date(expirySecs * 1000);
  const expiryStr = expiryDate.toISOString().replace("Z", "000Z");

  const payload = {
    token: {
      access_token: accessToken || "",
      token_type: "Bearer",
      refresh_token: refreshToken,
      expiry: expiryStr,
      expires_in: 3599,
    },
    auth_method: "consumer",
    ...(email ? { id_token_email: email } : {}),
    ...(idToken ? { id_token: idToken } : {}),
  };

  const payloadJson = JSON.stringify(payload);
  const currentPlatform = getOsPlatform();

  if (currentPlatform === "win32") {
    const b64 = Buffer.from(payloadJson, "utf8").toString("base64");
    const psScript = [
      '$code = @"',
      'using System;',
      'using System.Diagnostics;',
      'using System.Runtime.InteropServices;',
      'using System.Text;',
      'public class WinCredWriter {',
      '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
      '  public struct FILETIME { public uint dwLowDateTime; public uint dwHighDateTime; }',
      '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
      '  public struct CREDENTIAL {',
      '    public uint Flags; public uint Type; public string TargetName; public string Comment;',
      '    public FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob;',
      '    public uint Persist; public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;',
      '  }',
      '  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]',
      '  public static extern bool CredWrite([In] ref CREDENTIAL credential, uint flags);',
      '  [DllImport("kernel32.dll", SetLastError = true)]',
      '  public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);',
      '  [DllImport("kernel32.dll", SetLastError = true)]',
      '  public static extern bool CloseHandle(IntPtr h);',
      '  [DllImport("advapi32.dll", SetLastError = true)]',
      '  public static extern bool OpenProcessToken(IntPtr proc, uint access, out IntPtr token);',
      '  [DllImport("advapi32.dll", SetLastError = true)]',
      '  public static extern bool DuplicateToken(IntPtr existing, int impLevel, out IntPtr dup);',
      '  [DllImport("advapi32.dll", SetLastError = true)]',
      '  public static extern bool ImpersonateLoggedOnUser(IntPtr token);',
      '  [DllImport("advapi32.dll", SetLastError = true)]',
      '  public static extern bool RevertToSelf();',
      '  public static int LastError = 0;',
      '  public static bool Write(string target, string userName, string secret) {',
      '    byte[] secretBytes = Encoding.UTF8.GetBytes(secret);',
      '    IntPtr blobPtr = Marshal.AllocHGlobal(secretBytes.Length);',
      '    try {',
      '      Marshal.Copy(secretBytes, 0, blobPtr, secretBytes.Length);',
      '      CREDENTIAL cred = new CREDENTIAL();',
      '      cred.Flags = 0; cred.Type = 1; cred.TargetName = target; cred.UserName = userName;',
      '      cred.CredentialBlob = blobPtr; cred.CredentialBlobSize = (uint)secretBytes.Length; cred.Persist = 2;',
      '      if (CredWrite(ref cred, 0)) { LastError = 0; return true; }',
      '      LastError = Marshal.GetLastWin32Error();',
      '      if (LastError == 1312) {',
      '        int sid = Process.GetCurrentProcess().SessionId;',
      '        foreach (Process p in Process.GetProcessesByName("explorer")) {',
      '          if (sid != 0 && p.SessionId != sid) continue;',
      '          IntPtr hProc = OpenProcess(0x1000, false, p.Id);',
      '          if (hProc == IntPtr.Zero) continue;',
      '          IntPtr hTok = IntPtr.Zero; IntPtr hDup = IntPtr.Zero;',
      '          try {',
      '            if (OpenProcessToken(hProc, 0x000A, out hTok) && DuplicateToken(hTok, 2, out hDup)) {',
      '              if (ImpersonateLoggedOnUser(hDup)) {',
      '                try {',
      '                  if (CredWrite(ref cred, 0)) { LastError = 0; return true; }',
      '                  LastError = Marshal.GetLastWin32Error();',
      '                } finally { RevertToSelf(); }',
      '              }',
      '            }',
      '          } finally {',
      '            if (hDup != IntPtr.Zero) CloseHandle(hDup);',
      '            if (hTok != IntPtr.Zero) CloseHandle(hTok);',
      '            CloseHandle(hProc);',
      '          }',
      '        }',
      '      }',
      '      return false;',
      '    } finally { Marshal.FreeHGlobal(blobPtr); }',
      '  }',
      '}',
      '"@',
      'Add-Type -TypeDefinition $code -Language CSharp',
      `$secret = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("${b64}"))`,
      `$ok = [WinCredWriter]::Write("${KEYRING_TARGET}", "${KEYRING_USER}", $secret)`,
      'if ($ok) { Write-Output "OK" } else { throw "CredWrite failed: $([WinCredWriter]::LastError)" }',
    ].join("\n");

    try {
      const stdout = await runPowerShellScript(psScript);
      if (!stdout.includes("OK")) {
        throw new Error(`PowerShell CredWrite unexpected output: ${stdout}`);
      }
    } catch (err) {
      if (String(err.message || "").includes("1312")) {
        throw new Error(
          "Không thể ghi Windows Credential Manager (lỗi 1312: ERROR_NO_SUCH_LOGON_SESSION). Tiến trình 9Router đang chạy trong phiên nền không có phiên đăng nhập Windows tương tác. Vui lòng tắt 9Router hiện tại và mở lại bằng lệnh `9router` trong CMD/PowerShell."
        );
      }
      throw err;
    }
    return true;
  }

  if (currentPlatform === "darwin") {
    const b64 = Buffer.from(payloadJson, "utf8").toString("base64");
    const fullVal = `go-keyring-base64:${b64}`;
    await execFileAsync("security", ["delete-generic-password", "-s", "gemini", "-a", KEYRING_USER]).catch(() => {});
    await execFileAsync("security", ["add-generic-password", "-s", "gemini", "-a", KEYRING_USER, "-w", fullVal, "-A"]);
    return true;
  }

  if (currentPlatform === "linux") {
    await new Promise((resolve, reject) => {
      const child = spawn("secret-tool", ["store", "--label=Antigravity", "service", "gemini", "username", KEYRING_USER], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (d) => { stderr += d.toString(); });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(true);
        else reject(new Error(stderr.trim() || `secret-tool exited with code ${code}`));
      });
      child.stdin.write(payloadJson);
      child.stdin.end();
    });
    return true;
  }

  return false;
}

/**
 * Reads Antigravity OAuth payload from the OS Keyring / Windows Credential Manager.
 * Returns { email, refreshToken, accessToken } or null if unavailable.
 */
export async function readSystemKeyring() {
  const currentPlatform = getOsPlatform();
  let rawJson = null;

  try {
    if (currentPlatform === "win32") {
      const psScript = [
        '$code = @"',
        'using System;',
        'using System.Diagnostics;',
        'using System.Runtime.InteropServices;',
        'using System.Text;',
        'public class WinCredReader {',
        '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
        '  public struct FILETIME { public uint dwLowDateTime; public uint dwHighDateTime; }',
        '  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]',
        '  public struct CREDENTIAL {',
        '    public uint Flags; public uint Type; public string TargetName; public string Comment;',
        '    public FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob;',
        '    public uint Persist; public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;',
        '  }',
        '  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]',
        '  public static extern bool CredRead(string target, uint type, uint reservedFlag, out IntPtr credentialPtr);',
        '  [DllImport("advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]',
        '  public static extern void CredFree(IntPtr credentialPtr);',
        '  [DllImport("kernel32.dll", SetLastError = true)]',
        '  public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);',
        '  [DllImport("kernel32.dll", SetLastError = true)]',
        '  public static extern bool CloseHandle(IntPtr h);',
        '  [DllImport("advapi32.dll", SetLastError = true)]',
        '  public static extern bool OpenProcessToken(IntPtr proc, uint access, out IntPtr token);',
        '  [DllImport("advapi32.dll", SetLastError = true)]',
        '  public static extern bool DuplicateToken(IntPtr existing, int impLevel, out IntPtr dup);',
        '  [DllImport("advapi32.dll", SetLastError = true)]',
        '  public static extern bool ImpersonateLoggedOnUser(IntPtr token);',
        '  [DllImport("advapi32.dll", SetLastError = true)]',
        '  public static extern bool RevertToSelf();',
        '  private static string ReadPtr(IntPtr credPtr) {',
        '    try {',
        '      CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));',
        '      byte[] bytes = new byte[cred.CredentialBlobSize];',
        '      Marshal.Copy(cred.CredentialBlob, bytes, 0, (int)cred.CredentialBlobSize);',
        '      return Encoding.UTF8.GetString(bytes);',
        '    } finally { CredFree(credPtr); }',
        '  }',
        '  public static string Read(string target) {',
        '    IntPtr credPtr;',
        '    if (CredRead(target, 1, 0, out credPtr)) return ReadPtr(credPtr);',
        '    if (Marshal.GetLastWin32Error() == 1312) {',
        '      int sid = Process.GetCurrentProcess().SessionId;',
        '      foreach (Process p in Process.GetProcessesByName("explorer")) {',
        '        if (sid != 0 && p.SessionId != sid) continue;',
        '        IntPtr hProc = OpenProcess(0x1000, false, p.Id);',
        '        if (hProc == IntPtr.Zero) continue;',
        '        IntPtr hTok = IntPtr.Zero; IntPtr hDup = IntPtr.Zero;',
        '        try {',
        '          if (OpenProcessToken(hProc, 0x000A, out hTok) && DuplicateToken(hTok, 2, out hDup)) {',
        '            if (ImpersonateLoggedOnUser(hDup)) {',
        '              try {',
        '                if (CredRead(target, 1, 0, out credPtr)) return ReadPtr(credPtr);',
        '              } finally { RevertToSelf(); }',
        '            }',
        '          }',
        '        } finally {',
        '          if (hDup != IntPtr.Zero) CloseHandle(hDup);',
        '          if (hTok != IntPtr.Zero) CloseHandle(hTok);',
        '          CloseHandle(hProc);',
        '        }',
        '      }',
        '    }',
        '    return "";',
        '  }',
        '}',
        '"@',
        'Add-Type -TypeDefinition $code -Language CSharp',
        `Write-Output ([WinCredReader]::Read("${KEYRING_TARGET}"))`,
      ].join("\n");

      rawJson = (await runPowerShellScript(psScript)) || null;
    } else if (currentPlatform === "darwin") {
      const { stdout } = await execFileAsync("security", ["find-generic-password", "-s", "gemini", "-a", KEYRING_USER, "-w"]);
      const trimmed = stdout.trim();
      if (trimmed.startsWith("go-keyring-base64:")) {
        rawJson = Buffer.from(trimmed.slice("go-keyring-base64:".length), "base64").toString("utf8");
      } else {
        rawJson = trimmed;
      }
    } else if (currentPlatform === "linux") {
      const { stdout } = await execFileAsync("secret-tool", ["lookup", "service", "gemini", "username", KEYRING_USER]);
      rawJson = stdout.trim();
    }
  } catch {
    return null;
  }

  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    const refreshToken = parsed?.token?.refresh_token || parsed?.refresh_token || null;
    const accessToken = parsed?.token?.access_token || parsed?.access_token || null;
    const email = parsed?.id_token_email || parsed?.email || null;
    if (!refreshToken && !email) return null;
    return { refreshToken, accessToken, email };
  } catch {
    return null;
  }
}
