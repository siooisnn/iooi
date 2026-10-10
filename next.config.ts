import type { NextConfig } from "next";

const deploymentId = process.env.DEPLOYMENT_VERSION || "iooi-2026-07-22-chat-list-3";

const nextConfig: NextConfig = {
  deploymentId,
  // OAuth discovery for the iooi MCP lives at the site root, where connectors look for it.
  async rewrites() {
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/api/mcp/resource-metadata" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/mcp/resource-metadata" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/mcp/server-metadata" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/mcp/server-metadata" },
      { source: "/.well-known/openid-configuration", destination: "/api/mcp/server-metadata" },
    ];
  },
};

export default nextConfig;
