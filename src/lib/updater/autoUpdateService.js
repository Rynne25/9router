import { spawn, exec } from "child_process";
import path from "path";
import fs from "fs";
import { spawnUpdaterAndExit } from "@/lib/appUpdater";
import { UPDATER_CONFIG } from "@/shared/constants/config";

/**
 * Check if the current 9Router is running inside a Git clone repository.
 */
export function isGitRepository() {
  const root = process.cwd();
  return fs.existsSync(path.join(root, ".git")) || fs.existsSync(path.join(root, "..", ".git"));
}

/**
 * Run a shell command with a promise.
 */
function runCmd(command, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr?.trim() || stdout?.trim() || err.message));
      }
      resolve(stdout?.trim() || "");
    });
  });
}

let _isUpdateInProgress = false;

/**
 * Perform 1-Click Update with real-time SSE progress events.
 */
export async function executeAutoUpdate(sendEvent, targetPackage) {
  if (_isUpdateInProgress) {
    throw new Error("Quá trình cập nhật đang diễn ra, vui lòng chờ...");
  }
  _isUpdateInProgress = true;

  try {
    const isGit = isGitRepository();

    if (!isGit) {
      sendEvent({
        phase: "restarting",
        progress: 50,
        message: "Đang kích hoạt trình cập nhật độc lập qua NPM...",
      });
      const pkgToInstall = targetPackage || UPDATER_CONFIG.npmPackageName;
      spawnUpdaterAndExit(pkgToInstall);
      sendEvent({
        phase: "restarting",
        progress: 90,
        message: "Server đang khởi động lại phiên bản mới...",
      });
      return;
    }

    // --- GIT REPOSITORY MODE ---
    const appDir = fs.existsSync(path.join(process.cwd(), ".git"))
      ? process.cwd()
      : path.resolve(process.cwd(), "..");

    // Step 1: Pull latest code from GitHub
    sendEvent({
      phase: "pulling",
      progress: 20,
      message: "Đang kéo mã nguồn mới nhất từ GitHub (git pull origin master)...",
    });

    try {
      const pullOutput = await runCmd("git pull origin master", appDir);
      sendEvent({
        phase: "pulling",
        progress: 40,
        message: `Đã kéo code thành công: ${pullOutput.slice(0, 80)}`,
      });
    } catch (err) {
      throw new Error(`Lỗi khi kéo code từ GitHub: ${err.message}`);
    }

    // Step 2: Build CLI App
    sendEvent({
      phase: "building",
      progress: 50,
      message: "Đang đóng gói và biên dịch bản build mới...",
    });

    try {
      await runCmd(`"${process.execPath}" cli/scripts/build-cli.js`, appDir);
      sendEvent({
        phase: "building",
        progress: 85,
        message: "Biên dịch giao diện và backend thành công!",
      });
    } catch (err) {
      throw new Error(`Lỗi khi biên dịch: ${err.message}`);
    }

    // Step 3: Relaunch server in background and exit old process
    sendEvent({
      phase: "restarting",
      progress: 95,
      message: "Đang khởi động lại 9Router với phiên bản mới...",
    });

    const cliPath = path.join(appDir, "cli", "cli.js");
    const child = spawn(process.execPath, [cliPath, "--no-browser", "--skip-update"], {
      cwd: appDir,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();

    sendEvent({
      phase: "success",
      progress: 100,
      message: "Hoàn tất! Server đang nạp lại trang...",
    });

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  } finally {
    _isUpdateInProgress = false;
  }
}
