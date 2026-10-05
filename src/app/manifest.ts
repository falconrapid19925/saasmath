import type { MetadataRoute } from "next";

/**
 * PWA manifest: installable, standalone, Bahasa Indonesia. A service worker
 * and offline-first caching land with the drill-loop builder (plan section 6).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SaasMath — Latihan matematika harian",
    short_name: "SaasMath",
    description:
      "Latihan matematika harian bergaya Kumon untuk siswa kelas 4-6 SD, dalam Bahasa Indonesia.",
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    categories: ["education", "kids"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
