import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // esbuild (binaire natif) sert à minifier le bookmarklet côté serveur : il ne doit pas être bundlé.
  serverExternalPackages: ["esbuild"],
  experimental: {
    // Copier-coller d'annonces : texte accepté jusqu'au plafond de 2 Mo (IMPORT_LIMITS.maxBodyBytes),
    // plus la marge d'encodage de la server action.
    serverActions: { bodySizeLimit: "2.5mb" },
  },
};

export default nextConfig;
