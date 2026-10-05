import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

import "./globals.css";

export const metadata: Metadata = {
  title: "SaasMath — Latihan matematika harian",
  description:
    "Latihan matematika harian bergaya Kumon untuk siswa kelas 4-6 SD: soal dibuat otomatis, waktu SCT personal, dan pendekatan CPA dalam Bahasa Indonesia.",
  applicationName: "SaasMath",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "SaasMath", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
