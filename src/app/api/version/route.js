import https from "https";
import pkg from "../../../../package.json" with { type: "json" };
import { GITHUB_CONFIG } from "@/shared/constants/config";

const GITHUB_REPO = GITHUB_CONFIG.repo || "Rynne3825/9router";
const GITHUB_RAW_PACKAGE = GITHUB_CONFIG.rawPackageUrl || `https://raw.githubusercontent.com/${GITHUB_REPO}/master/package.json`;
const VERSION_CACHE_TTL_MS = 60000; // cache lookup for 1 min so updates appear quickly

// Survive hot reload; one cache per process
const versionCache = (global.__npmVersionCache ??= { value: null, fetchedAt: 0, details: null });

function fetchJson(url, timeoutMs = 3500) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "9Router-App",
          Accept: "application/json",
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function compareVersions(a, b) {
  if (!a || !b) return 0;
  const pa = String(a).replace(/^v/, "").split(".").map(Number);
  const pb = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = Number.isNaN(pa[i]) ? 0 : pa[i];
    const nb = Number.isNaN(pb[i]) ? 0 : pb[i];
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// Fetch latest version from GitHub repository Rynne3825/9router
async function fetchLatestVersion() {
  // 1. Check raw package.json on master branch
  const rawData = await fetchJson(GITHUB_RAW_PACKAGE);
  if (rawData?.version) {
    return {
      version: rawData.version,
      source: "github-master",
      description: rawData.description,
    };
  }

  // 2. Fallback to GitHub Releases API
  const releaseData = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
  if (releaseData?.tag_name) {
    return {
      version: releaseData.tag_name.replace(/^v/, ""),
      source: "github-release",
      name: releaseData.name,
      body: releaseData.body,
    };
  }

  // 3. Fallback to npm registry
  const npmData = await fetchJson(`https://registry.npmjs.org/9router/latest`);
  if (npmData?.version) {
    return {
      version: npmData.version,
      source: "npm",
    };
  }

  return null;
}

async function getLatestVersionCached() {
  if (versionCache.value && Date.now() - versionCache.fetchedAt < VERSION_CACHE_TTL_MS) {
    return versionCache;
  }
  const info = await fetchLatestVersion();
  if (info?.version) {
    versionCache.value = info.version;
    versionCache.details = info;
    versionCache.fetchedAt = Date.now();
  }
  return versionCache;
}

export async function GET() {
  const cached = await getLatestVersionCached();
  const latestVersion = cached.value;
  const currentVersion = pkg.version;
  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
  const tarballUrl = latestVersion
    ? `https://github.com/${GITHUB_REPO}/releases/download/v${latestVersion}/9router-${latestVersion}.tgz`
    : null;

  return Response.json({
    currentVersion,
    latestVersion,
    hasUpdate,
    source: cached.details?.source || "unknown",
    downloadUrl: tarballUrl,
    releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
    installCmd: tarballUrl ? `npm install -g ${tarballUrl}` : `npm install -g 9router`,
  });
}
