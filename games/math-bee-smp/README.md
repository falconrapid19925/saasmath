# Math Bee SMP

Game matematika multiplayer kelas 7 SMP, dengan taman 3D, avatar yang dapat berjalan, dan giliran menjawab di panggung. Main bersama **4–8 manusia** melalui browser; tidak ada bot pengisi room, akun wajib, chat bebas, atau panggilan model AI saat bermain.

Paket lengkap yang sudah dibangun dapat dipreview dengan Node.js 24.13+ tanpa mengunduh dependency lagi:

```sh
node scripts/dev.mjs
```

Jalankan dari folder paket yang berisi `dist/` dan `drizzle/`. Alamat preview lokal adalah `http://127.0.0.1:8787`; akses teman melalui internet memerlukan publikasi Sites yang berhasil.

## Aturan

- Bilangan bulat dan pecahan; jawaban diketik melalui keypad.
- 30 detik per giliran, tiga nyawa, maksimal empat ronde.
- Benar: 100 poin + bonus linear sampai 20. Salah/timeout: kehilangan satu nyawa.
- Penonton ikut latihan secara privat tanpa mengubah skor kompetitif.
- Pembahasan lima detik setelah giliran, satu soal penentuan jika skor tertinggi seri.
- Reconnect 60 detik setelah disconnect terdeteksi; setelah itu forfeit dan bisa kembali menonton.

Baseline lengkap: [docs/prd.md](docs/prd.md). Keputusan tambahan dan batas teknis: [docs/implementation-decisions.md](docs/implementation-decisions.md). Review: [docs/code-review-spec.md](docs/code-review-spec.md).

## Menjalankan source

Butuh Node.js 24.13+ (native TypeScript test runner dan SQLite), npm, serta akses registry pada instalasi pertama.

```sh
npm install
npm test
npm run typecheck
npm run dev
```

`npm run dev` membangun bundle produksi dan menjalankan preview pada `http://127.0.0.1:8787`. Empat browser/session independen diperlukan untuk memulai pertandingan. Untuk mencoba sendiri, pakai empat profil/context browser yang berbeda; jangan menganggapnya empat pemain manusia nyata.

Preview menyimpan SQLite di `.sites-runtime/game.sqlite` dan menerapkan migration yang belum terpasang saat startup. Jangan commit database atau cookie/token sesi. Preview memakai adapter kecil untuk subset D1 yang digunakan aplikasi; production menerima binding D1 `DB` dari Sites.

Tidak ada credential yang perlu ditaruh dalam browser. Kode room hanya untuk bergabung dan tidak memberikan kontrol terhadap identitas peserta lain.

## Build Sites

```sh
npm run build
```

Output deployable:

```text
dist/
  .openai/hosting.json
  server/index.js
  drizzle/
```

`server/index.js` adalah Worker ESM yang mengekspor `default.fetch`. JavaScript/CSS frontend di-embed sebagai static responses; tidak ada CDN runtime. Source sudah mengandung ID Site yang dibuat pada sesi ini; gunakan Site tersebut, jangan membuat Site kedua untuk source yang sama.

Publikasi harus mengikuti Sites: push source persis, kemas artifact dari commit itu, simpan versi, lalu deploy versi tersebut dengan audience yang sesuai. Jangan menyatakan URL live hanya dari `expected_url`. Migrasi schema dijalankan melalui pipeline deployment; handler request tidak membuat tabel.

## Pemeriksaan

- `npm test`: matematika eksak, generator, aturan, idempotency, deadline race, SQLite CAS, privasi, serta Worker API.
- `npm run typecheck`: source dan public contracts TypeScript.
- `npm run build`: browser bundle + Worker ESM artifact.
- `node scripts/qa-multiplayer.mjs`: dua room, 16 guest session HTTP, empat ronde sebenarnya. Preview harus berjalan. Ini simulasi klien otomatis, bukan uji siswa/perangkat fisik.
- `node scripts/qa-browser.mjs`: Chromium UI, touch, capture desktop/HP, dan refresh. Sesuaikan `CHROMIUM_PATH`; video memerlukan ffmpeg yang tersedia untuk Playwright.

Report, batas verifikasi, dan hambatan deployment ditulis pada [artifacts/final-evidence.md](artifacts/final-evidence.md). FPS headless SwiftShader bukan ukuran performa HP nyata.

## Struktur

```text
src/client/        React UI, keypad, world Three.js, kontrol, dan ikon lokal
src/game/          generator, parser rasional, tipe, dan state machine
src/server/        guest authentication, API Worker, shared-state CAS
db/                schema Drizzle
drizzle/           migration SQL dan metadata
test/              test domain, store, dan API
scripts/           build, preview lokal, dan QA
vendor/three/      runtime/tipe asli Three r183, lisensi dan provenance
docs/              PRD, review spec, dan keputusan implementasi
```

Tidak ada file aplikasi SaasMath SD yang diubah untuk membangun game ini.
