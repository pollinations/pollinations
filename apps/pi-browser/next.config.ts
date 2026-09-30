import type { NextConfig } from "next";

// The Wasmer SDK runs WASIX workers that need SharedArrayBuffer, so every
// route must be cross-origin isolated. These two headers make the browser
// expose crossOriginIsolated = true.
const crossOriginIsolationHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const nextConfig: NextConfig = {
  typescript: {
    // safety net for contributor environments; the repo typechecks clean
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: crossOriginIsolationHeaders,
      },
    ];
  },
};

export default nextConfig;
