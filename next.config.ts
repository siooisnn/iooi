import type { NextConfig } from "next";

const deploymentId = process.env.DEPLOYMENT_VERSION || "iooi-2026-07-22-chat-list-3";

const nextConfig: NextConfig = {
  deploymentId,
};

export default nextConfig;
