import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1"],
  distDir: process.env.CALI_BROWSER_TEST === "1" ? ".next-browser-tests" : ".next",
  ...(process.env.CALI_BROWSER_TEST === "1" ? { devIndicators: false as const } : {}),
};

export default nextConfig;
