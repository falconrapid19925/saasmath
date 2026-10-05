import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Minimal on purpose: PWA service-worker wiring and offline caching land
  // with the drill-loop builder. All DB access stays at request time; nothing
  // here may import the database module.
};

export default nextConfig;
