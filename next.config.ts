import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

const localDevAddresses = Object.values(networkInterfaces()).flatMap(addresses =>
  (addresses ?? []).filter(address => address.family === "IPv4" && !address.internal).map(address => address.address),
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["127.0.0.1", ...localDevAddresses],
  distDir: process.env.CALI_BROWSER_TEST === "1" ? ".next-browser-tests" : ".next",
  ...(process.env.CALI_BROWSER_TEST === "1" ? { devIndicators: false as const } : {}),
};

export default nextConfig;
