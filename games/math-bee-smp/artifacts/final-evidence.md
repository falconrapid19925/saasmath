# Bukti implementasi Math Bee SMP

Tanggal: 25 Oktober 2026, Asia/Jakarta.

## Hasil utama

Game sudah diimplementasikan dan dapat dimainkan pada preview produksi lokal: room privat 4–8 tamu, avatar berjalan di arena 3D, giliran panggung, keypad bilangan/pecahan, timer 30 detik, tiga nyawa, skor 100 + bonus linear hingga 20, latihan privat penonton, pembahasan lima detik, maksimal empat ronde, satu penentuan seri, reconnect/forfeit, host succession, dan rematch.

**Publikasi Sites belum berhasil.** Site telah dibuat, tetapi source push gagal sebelum autentikasi Git karena proxy lingkungan mengembalikan HTTP503. Body diagnosis melalui jalur proxy yang diwajibkan: `VPN DNS or routing is unavailable`. Native Sites version/deploy tidak dijalankan karena source belum dapat dipush dengan benar. Tidak ada URL produksi yang dinyatakan live.

## Build dan tests

| Pemeriksaan | Hasil | Bukti / batas |
| --- | --- | --- |
| `npm test` | PASS — 39 tests | Domain, matematika, SQLite store, Worker API, concurrency, dan regresi. |
| Oracle generator | PASS — 800 variasi | Delapan family diperiksa terhadap perhitungan rasional independen; bukan uji siswa. |
| `npm run typecheck` | PASS | TypeScript 6.0.3; source domain/server/client/test. |
| Deklarasi vendor Three | PASS | Deklarasi upstream sebenarnya, strict dengan skipLibCheck=false; provenance/lisensi disertakan. |
| `npm run build` | PASS | Client hash `287fa4b35b65`; Worker ESM + frontend embed + migration SQL. |
| Browser desktop/HP | PASS | Chromium 154.0.8037.57, `qa-browser-03`; 1440×1000, 390×844, 360×640. |
| Dua room/16 session HTTP | PASS | 5.394 request, 272.829 ms, 32 giliran per room dan satu tiebreak per room. |
| Render delapan avatar | PASS untuk budget grafis terukur | 390×844, 61 draw calls, 36.653 triangles, 48 geometries, 12 textures. |
| Review independen kode aplikasi | APPROVE untuk scope yang diperiksa | Temuan host lobi ditutup setelah regresi; lihat code-review.md. |
| Paket unduh tanpa install | PASS | Diekstrak ke folder baru tanpa node_modules: migration, empat guest, start, soal, skor, dan feedback berjalan. |
| Source Git Sites | BLOCKED | HTTPS CONNECT503; bukan penolakan kode atau bukti autentikasi salah. |
| Hosted D1/migration/binding | NOT VERIFIED | Memerlukan source push dan deployment Sites yang berhasil. |
| Akses tamu pada URL produksi | NOT VERIFIED | Tidak ada deployment publik yang berhasil. |
| Performa HP fisik | NOT VERIFIED | Browser memakai SwiftShader software rendering, bukan GPU HP. |

## Perilaku yang benar-benar dijalankan

- Guest session dengan cookie server; membuat room melalui UI.
- Start membutuhkan empat session; peserta baru ditolak setelah match berjalan.
- Joystick melalui input touch Chrome mengubah posisi authoritative avatar.
- Soal/keypad dan latihan privat terlihat pada viewport HP.
- Jawaban diikuti hasil dan pembahasan server.
- Refresh dan invite milik anggota sah memulihkan room yang sama.
- Tidak ada horizontal overflow pada viewport mobile yang diperiksa.
- Tidak ada page error atau request-failed pada run browser final.
- Enam belas identitas HTTP pada dua room menyelesaikan seluruh progression bilangan bulat sampai soal cerita pecahan secara paralel.
- Setiap room mempunyai skor independen, tiga nyawa tetap pada jawaban benar, satu tiebreak, dan hasil akhir yang konsisten.
- Retry jawaban, timeout race, payload skor/role palsu, membership salah, dan streaming body terlambat diperiksa pada seam test.

## Artefak mesin

- `browser-report.json`: tujuh capture dan diagnostic renderer, daftar checks serta error.
- `multiplayer-report.json`: jumlah session/request, durasi, giliran, tiebreak, skor dan pemenang.
- `render-report.json`: delapan avatar pada viewport mobile dan budget renderer.
- `package-smoke-report.json`: paket hasil ekstraksi berjalan dengan Node built-ins tanpa instalasi dependency.
- `pixel-report.json`: variance screenshot nonblank; ini bukan metrik canvas terisolasi atau skor estetika.
- `code-review.md`: tiga temuan penting dan perbaikan/regresinya.
- `qa-browser-03/`: capture mentah dan video UI dari run final, bila disertakan pada paket bukti.

## Cakupan dan keterbatasan bukti

Browser final memakai client hash yang sama dengan paket akhir. Perbaikan terakhir pada backend menyangkut host yang putus koneksi di lobi/hasil dan mantan peserta yang kembali sebagai penonton; jalur tersebut diuji dengan regresi khusus sesudah uji match paralel. Seluruh 39 tests dan typecheck dijalankan kembali setelah perbaikan itu. Uji browser dan kapasitas tidak diklaim sebagai uji deployment hosted.

Render memakai ANGLE/SwiftShader. FPS software yang teramati tidak digunakan untuk mengklaim target 30 FPS pada HP nyata. Budget geometry/draw call/texture adalah pengamatan yang sah untuk scene yang ditangkap, tetapi throughput GPU dan konsumsi baterai masih memerlukan perangkat nyata.

Pengujian otomatis bukan peserta manusia. Belum ada uji kelas, review guru, klaim peningkatan nilai, validasi resmi kurikulum, atau bukti keterbacaan 30 detik pada siswa nyata.

Harness visual memakai input dan state live, screenshot, video, serta diagnostic; belum memakai baseline pixel regression yang stabil untuk session/seed room acak. Tidak ada hook publik untuk mengubah skor, waktu, atau kunci soal.

## Batas hosting dan data

Artifact mengikuti bentuk Worker ESM yang didokumentasikan Sites. Deklarasi D1 dan migration native masih harus divalidasi oleh pipeline Sites; keberhasilan SQLite lokal tidak menggantikannya. Server tidak mempunyai fallback memory-only ketika binding D1 hilang: ia memberi error penyimpanan yang jelas.

Expiry akses guest 24 jam dan room enam jam diterapkan oleh query. Cleanup fisik oportunistik bergantung traffic dan bukan jaminan penghapusan tepat waktu. Tidak ada akun, email, profil sekolah, atau data siswa nyata pada pengujian.

## Menjalankan paket tanpa instalasi dependency

Paket lengkap menyertakan `dist/`, `drizzle/`, dan preview adapter yang memakai Node built-ins. Dengan Node.js 24.13+:

```sh
node scripts/dev.mjs
```

Buka `http://127.0.0.1:8787`. Gunakan empat session/browser context berbeda untuk memulai match. Source lengkap serta test tersedia; perubahan source memerlukan dependency build yang tercantum pada package.json.

## Langkah publikasi berikutnya setelah koneksi pulih

1. Pakai project_id Sites yang sudah ada pada `.openai/hosting.json`; jangan membuat Site baru.
2. Peroleh credential source baru bila kedaluwarsa, lewat native Sites tool. Jangan simpan token dalam file atau source.
3. Push source final dan catat SHA yang benar-benar berhasil dipush.
4. Build dari source itu dan kemas artifact tanpa mengubahnya setelah disimpan sebagai versi.
5. Validasi manifest D1 serta migration dengan native pipeline; perbaiki jika platform menolak bentuk binding.
6. Terapkan akses tamu/publik yang dibutuhkan produk melalui kontrol Sites yang sesuai, tanpa mengundang atau mengirim pesan kepada siapa pun.
7. Deploy saved version, verifikasi hasil native, lalu smoke-test session, dua browser, akses anonim, dan shared hosted D1 sebelum mengklaim URL dapat dimainkan teman.

Tidak ada perubahan audience atau deployment yang dipakai sebagai pengganti source push yang gagal.
