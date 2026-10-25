# Keputusan implementasi — Math Bee SMP

Tanggal: 25 Oktober 2026, Asia/Jakarta. Acuan: [PRD](prd.md) dan [spec review](code-review-spec.md).

## Keputusan tambahan yang dikonfirmasi pengguna

| Acuan | Keputusan | Bukti percakapan |
| --- | --- | --- |
| OD-01 | Bonus linear, dibulatkan ke integer terdekat: `100 + floor(20 × remainingRatio + 0.5)` untuk jawaban benar. | Pengguna menjawab “Ya, pakai bonus linear yang direkomendasikan”. |
| OD-02 | Pada satu soal penentuan, jawaban benar dalam selisih ≤100 ms dari waktu benar tercepat menjadi juara bersama. | Pengguna menjawab “Ya, selisih ≤100 milidetik dianggap seri”. |
| OD-03 | Setelah masa reconnect 60 detik habis, peserta forfeit, tidak berhak menjadi juara, histori skor tetap ada, late return menjadi penonton. | Pengguna menjawab “Ya, setelah 60 detik mengundurkan diri; kembali sebagai penonton”. |
| OD-04, bagian host | Host yang keluar diganti otomatis oleh anggota aktif terlama. | Pengguna menjawab “Ya, pindahkan host otomatis ke anggota aktif terlama”. |
| OD-06, provider | Hosting menggunakan Sites. | Pengguna menegaskan “just use Sites”. |

Keputusan tersebut melengkapi 25 keputusan wawancara; tidak menggantinya.

## Pilihan teknis dan lifecycle V1

- Proyek terisolasi di `math-bee-smp`; aplikasi SaasMath SD tidak diubah.
- Frontend React + Three.js r183. World dan ikon dibuat prosedural/lokal; tidak ada gambar, font eksternal, model AI, atau inference runtime yang wajib.
- Host memulai secara manual setelah 4–8 peserta tersambung. Roster dibekukan selama match; peserta baru tidak masuk di tengah match. Anggota yang sudah ada dapat reconnect dengan identitasnya.
- Peserta yang sengaja keluar dapat bergabung kembali sebagai penonton match yang sama, tanpa reset skor/nyawa atau pemulihan eligibility. Kembali di lobi memakai membership lama dan tetap dibatasi kapasitas delapan. Identitas lama yang tidak ikut roster match tidak dapat menyusup ke match aktif.
- Host dapat memulai rematch dari hasil; match ID, skor, nyawa, dan receipt ledger direset untuk peserta yang ikut. Tidak ada riwayat lintas perangkat.
- Urutan awal diacak server, kemudian dirotasi antar-ronde. Difficulty band sama pada ronde yang sama. Empat ronde memakai bilangan bulat, urutan operasi, pecahan, dan soal cerita pecahan.
- Bank awal mempunyai delapan family/template terversi. Nilai dan pembahasannya diperiksa dengan 800 variasi oracle independen. Ini belum merupakan validasi resmi kurikulum atau uji pedagogi siswa.
- Parser menerima integer, desimal koma/titik, pecahan dengan denominator positif, whitespace di tepi/sekitar slash, dan Unicode minus. Operand dibatasi 12 digit, input 64 karakter. Tidak menerima ekspresi, grouping ribuan, exponent, persen, satuan, atau mixed number. Format invalid tidak menghabiskan nyawa; timer berjalan.
- Jawaban hanya boleh dikunci sekali per giliran. Request ID mengikat pemain, nilai, dan turn ID; retry identik memulihkan hasil yang sama.
- Input yang lengkap diterima server sebelum deadline yang dapat diproses; batas tepat deadline ditolak. Timestamp aksi diambil sesudah seluruh body selesai diterima, sehingga streaming lambat tidak mempertahankan timestamp lama.
- Scene diberi fase transisi sekitar dua detik sebelum soal dibuka. Timer 30 detik baru dimulai ketika fase menjawab dibuka.
- Pada tiebreak, kandidat menerima soal sama dan menjawab bersama. Babak itu menentukan juara tanpa menambah ronde, skor utama, atau nyawa baru. Jika semua salah/tidak menjawab, kandidat eligible menjadi juara bersama.
- Polling snapshot tiap satu detik; movement dikirim paling cepat sekitar 600 ms, dibatasi posisi/kecepatan di server dan diinterpolasi client. Tidak ada klaim WebSocket atau Durable Objects.
- Kehilangan heartbeat dideteksi setelah sepuluh detik tanpa activity. Grace 60 detik dihitung dari timestamp deteksi putus, terpisah dari deadline soal. Durasi nyata sejak paket terakhir dapat mencakup delay deteksi tersebut.
- Jika seluruh peserta forfeit, hasil ditandai `aborted`, tanpa pemenang buatan. Deadline dan expiry diproses saat room dibaca/dimutasi; tidak ada klaim scheduler tanpa request.
- Data authoritative berupa JSON room pada shared D1 dengan version compare-and-swap. Snapshot memakai whitelist; expected answer, pembahasan sebelum waktunya, secret seed, dan jawaban privat tidak disiarkan.
- Cookie guest random HttpOnly, SameSite=Lax, Secure pada HTTPS; server menyimpan hash credential. Masa sesi 24 jam; room inactivity expiry enam jam. Cleanup fisik oportunistik saat traffic, sehingga expiry akses berbeda dari jaminan waktu penghapusan fisik.
- Semua layanan tetap Sites. Helper Vinext/source-workflow tidak tersedia pada image maupun resource yang dapat dibaca; fallback memakai bentuk artifact Worker ESM Sites yang terdokumentasi: `server/index.js` dan `.openai/hosting.json`, dengan seluruh frontend di-embed serta migration SQL diikutkan.
- Deklarasi D1 native, migrasi hosted, akses tamu pada URL Sites, dan source push tetap harus dibuktikan di deployment. Lulus SQLite lokal tidak sama dengan verifikasi D1 hosted.

## Pemulihan dependency dan versi

Registry npm dan host Git Sites mengembalikan proxy HTTP503 dengan body `VPN DNS or routing is unavailable`. Tidak ada percobaan bypass proxy/VPN atau penonaktifan TLS. Pengguna menyatakan akan memulihkan koneksi lingkungan.

Untuk menyelesaikan build lokal, paket React, esbuild, TypeScript, Drizzle, dan Playwright yang telah tersedia dipakai secara read-only; dependency aplikasi lama tidak dimodifikasi. Three.js r183 dan deklarasi aslinya diperoleh lewat connector GitHub yang berfungsi, lalu disimpan dengan lisensi/provenance di `vendor/three`. Tidak ada shim `any` untuk mengganti deklarasi Three.

Compiler yang diverifikasi adalah TypeScript 6.0.3, dengan lib.dom WebGPU bawaan. Lihat `vendor/three/source-provenance.md` untuk sumber persis dan adaptasi referensi tipe. Instalasi npm lengkap serta lockfile baru memerlukan koneksi registry yang pulih; jangan menganggap installer npm yang gagal sebagai check lulus.

## Status verifikasi

Lihat `artifacts/final-evidence.md` dan report terkait untuk hasil final per pemeriksaan. Build, test domain/store/API, browser, kapasitas, dan deployment adalah pemeriksaan terpisah; status salah satunya tidak otomatis membuktikan lainnya.
