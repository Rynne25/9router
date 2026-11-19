import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const tracingRoot = projectRoot;
const proxyClientMaxBodySize = process.env.NINEROUTER_PROXY_CLIENT_MAX_BODY_SIZE || "128mb";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "sql.js", "node:sqlite", "bun:sqlite", "open", "@aws-sdk/credential-providers", "wreq-js", "undici"],
  turbopack: {
    root: tracingRoot
  },
  outputFileTracingRoot: tracingRoot,
  outputFileTracingIncludes: {
    "*": ["./node_modules/undici/**/*"]
  },
  outputFileTracingExcludes: {
    "*": [
      "./gitbook/**/*",
      "./.git/**/*",
      "./*.tgz",
      "./9router-*.tgz",
      "./cli/**",
      "./tests/**",
      "./docs/**",
      "./i18n/**",
      "./images/**",
      "./scripts/**",
      "./skills/**",
      "./node_modules/sql.js/dist/*.zip",
      "./node_modules/sql.js/dist/*debug*",
      "./node_modules/sql.js/dist/*asm*",
      "./node_modules/sql.js/dist/*browser*",
      "./node_modules/undici/docs/**",
      "./node_modules/undici/types/**",
      "./node_modules/undici/lib/mock/**"
    ]
  },
  images: {
    unoptimized: true
  },
  env: {},
  experimental: {
    // #1529/#1572: LLM clients can send long context or base64 image payloads through /v1 rewrites.
    proxyClientMaxBodySize,
    // Cache fetch responses across HMR refreshes for faster dev reloads.
    serverComponentsHmrCache: true,
    // Tree-shake heavy barrel imports to cut compile + bundle size
    optimizePackageImports: ["@xyflow/react", "@dnd-kit/core", "@dnd-kit/sortable", "material-symbols", "marked"],
    // Smart packaging memory optimizations (1 page at a time to prevent RAM spikes)
    webpackMemoryOptimizations: true,
    staticGenerationMaxConcurrency: 1,
  },
  webpack: (config, { isServer }) => {
    // Ignore fs/path modules in browser bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    // Exclude non-source dirs from watcher to reduce inotify load
    config.watchOptions = {
      ...config.watchOptions,
      aggregateTimeout: 300,
      ignored: /[\\/](node_modules|\.git|logs|\.next|\.next-cli-build|gitbook|cli|open-sse\.old|tests|docs)[\\/]/,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/v1/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1/v1",
        destination: "/api/v1"
      },
      {
        source: "/codex/:path*",
        destination: "/api/v1/responses"
      },
      {
        source: "/responses",
        destination: "/api/v1/responses"
      },
      {
        source: "/systemone",
        destination: "/api/v1/systemone"
      },
      {
        source: "/v1beta/:path*",
        destination: "/api/v1beta/:path*"
      },
      {
        source: "/v1beta",
        destination: "/api/v1beta"
      },
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1",
        destination: "/api/v1"
      }
    ];
  }
};

export default nextConfig;
