import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // esbuild (binaire natif) sert à minifier le bookmarklet côté serveur : il ne doit pas être bundlé.
  serverExternalPackages: ["esbuild"],
};

export default nextConfig;
