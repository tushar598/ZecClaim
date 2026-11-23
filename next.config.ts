import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ZecClaim is strict non-custodial: disallow caching or server telemetry of crypto primitives
  poweredByHeader: false,
};

export default nextConfig;
