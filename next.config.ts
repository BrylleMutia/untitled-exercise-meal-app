import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.CALI_BROWSER_TEST === "1" ? ".next-browser-tests" : ".next",
  ...(process.env.CALI_BROWSER_TEST === "1" ? { devIndicators: false as const } : {}),
};

export default nextConfig;
