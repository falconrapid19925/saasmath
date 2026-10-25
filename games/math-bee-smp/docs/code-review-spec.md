# Spesifikasi Code Review — Math Bee SMP

| Metadata | Nilai |
| --- | --- |
| Versi | 0.2 |
| Tanggal | 25 Oktober 2026, Asia/Jakarta |
| Acuan produk | [prd.md](prd.md), versi 0.2 |
| Status | Spesifikasi review sebelum implementasi; belum merupakan hasil review kode atau bukti game lulus pengujian. |
| Tujuan | Menemukan cacat nyata, memastikan keputusan produk dipenuhi, dan mencegah perubahan scope tanpa jejak. |

## Navigasi

- [Mandat dan batas review](#1-mandat-reviewer)
- [Paket masukan](#2-paket-masukan-sebelum-review)
- [Prosedur](#3-prosedur-review)
- [Severity](#4-prioritas-dan-severity)
- [Matriks 32 requirement](#5-matriks-requirement-dan-bukti-review)
- [Pemeriksaan per domain](#6-pemeriksaan-per-domain)
- [Pengujian dan 36 kasus minimum](#7-strategi-pengujian-yang-bermakna)
- [Anti-drift](#8-anti-drift-pola-yang-harus-ditangkap-review)
- [Format temuan](#9-format-temuan-review)
- [Template laporan dan PR](#10-template-laporan-review-dan-perubahan)
- [Kriteria kelulusan](#11-kriteria-hasil-review-dan-kelulusan)
- [Prompt reviewer](#12-prompt-siap-pakai-untuk-reviewer-berikutnya)
- [Log perubahan](#13-log-perubahan)

## 1. Mandat reviewer

Review kode terhadap perilaku produk pada PRD, bukan terhadap preferensi framework atau estetika pribadi. Prioritas pemeriksaan: kebenaran matematika, aturan pertandingan, otoritas server, privasi jawaban, konsistensi multiplayer, penggunaan HP, lalu kualitas implementasi dan visual.

Pada v0.1 pekerjaan terbatas pada dokumentasi. Pengguna kemudian mengizinkan implementasi; hasil review aktual berada pada artifacts/code-review.md, terpisah dari spesifikasi ini. Deployment tetap dinyatakan sesuai bukti, bukan dianggap lulus oleh spesifikasi.

### 1.1 Empat hal yang wajib dibedakan

1. **Pelanggaran baseline:** kode bertentangan dengan K/REQ yang sudah jelas.
2. **Keputusan terbuka:** perilaku bergantung OD yang belum dipilih; minta keputusan produk, jangan menciptakan kebijakan diam-diam.
3. **Kegagalan yang terbukti:** ada jalur kode atau reproduksi konkret yang memperlihatkan hasil salah.
4. **Belum terverifikasi:** tidak cukup bukti untuk menyatakan pass/fail. Ini dapat menghalangi klaim rilis, tetapi bukan bukti otomatis bahwa kode rusak.

Contoh: bonus 30 poin melanggar K-11. Bonus linear dengan pembulatan tertentu belum melanggar K-11 selama 0–20, tetapi rumus tersebut belum menjadi baseline angka final sebelum OD-01 selesai. Tidak adanya bukti uji 16 klien berarti kapasitas belum terverifikasi, bukan bukti pasti kapasitas gagal.

### 1.2 Batas tindakan review

- Baca instruksi repository yang benar sebelum mereview atau mengubah kode.
- Mode review secara default menghasilkan laporan. Perbaikan kode mengikuti otorisasi pekerjaan yang sedang berlaku.
- Jangan memublikasikan komentar GitHub, membuka PR, mengubah akses Site, mengaktifkan layanan berbayar, atau mengirim pesan kepada pihak lain hanya karena dokumen ini menyebut review.
- File/proyek lain di workspace tidak otomatis termasuk scope. Aplikasi `saasmath` SD bukan baseline produk ini; lihat REQ-032.
- Jangan meminta persetujuan ulang untuk tindakan teknis rutin yang sudah diizinkan dan tidak mengubah produk/biaya. Sebaliknya, jangan menganggap skill atau scaffold memberi hak mengganti keputusan pengguna.

## 2. Paket masukan sebelum review

Untuk review perubahan, kumpulkan yang relevan:

- Versi PRD dan code-review-spec yang dipakai.
- Diff/base/head atau daftar file yang berubah, beserta masalah dan hasil yang dimaksud.
- ID requirement yang disentuh dan OD yang berkaitan.
- Keputusan teknis tentang transport, state bersama, waktu, sesi tamu, serta deployment.
- Dependency/lockfile dan lisensi source/aset yang ditambahkan.
- Perintah pemeriksaan yang benar untuk stack/repo aktual.
- Bukti unit/integration/browser/load yang sudah dijalankan, hasil, environment, serta keterbatasan.
- Konfigurasi uji tanpa secret: jumlah room, session, viewport, perangkat, browser, delay jaringan, dan jenis clock.

Review yang sempit tidak memerlukan pengujian ulang seluruh produk. Pilih pemeriksaan berdasarkan perilaku yang berubah. Review rilis pertama memerlukan cakupan menyeluruh karena seluruh gameplay merupakan perubahan baru.

## 3. Prosedur review

1. **Baca baseline.** Identifikasi K yang tidak boleh berubah, REQ terkait, dan OD yang belum selesai.
2. **Baca diff dan alur yang terdampak.** Ikuti input sampai state authoritative, persistence, event/snapshot, dan render hasil.
3. **Tentukan invariant.** Nyatakan kondisi yang harus selalu benar, lalu cari jalur yang melanggarnya.
4. **Periksa secara statis.** Cari kebocoran data, client trust, kesalahan matematika, urutan transisi, race, lifecycle, dan cleanup.
5. **Jalankan pemeriksaan terarah jika diizinkan dan tersedia.** Utamakan public seam serta skenario yang dapat membuktikan atau menolak dugaan.
6. **Periksa bukti pengalaman pengguna.** Screenshot, input nyata, browser terpisah, dan perangkat HP mempunyai fungsi yang berbeda; jangan saling menggantikan klaimnya.
7. **Laporkan hanya temuan yang dapat ditindaklanjuti.** Cantumkan lokasi, pemicu, dampak, requirement, dan bukti. Pisahkan saran, OD, dan keterbatasan verifikasi dari defect.
8. **Putuskan hasil review.** Gunakan kriteria bagian 11; jangan menyebut siap rilis ketika baseline atau bukti inti masih terbuka.

Tidak perlu mengulang check yang sudah lulus pada kode yang tidak berubah, kecuali ada failure baru, perubahan dependency/environment, atau risiko yang belum terjawab.

## 4. Prioritas dan severity

| Severity | Definisi operasional | Contoh relevan | Perlakuan |
| --- | --- | --- | --- |
| P0 | Merusak integritas inti, memberi kontrol tidak sah, atau mengekspos data/kunci yang seharusnya privat. | Client dapat menambah skor; peserta membaca jawaban penonton lain; double submit memberi dua skor; server salah menilai pecahan secara luas. | Blocker. Harus diperbaiki sebelum fitur/rilis dinyatakan memenuhi baseline. |
| P1 | Alur utama gagal atau baseline produk berubah secara material. | HP tidak bisa submit; bukan multiplayer nyata; timer restart memberi waktu baru; lebih dari satu tiebreak; game membutuhkan login padahal sesi tamu. | Blocker untuk alur yang terdampak dan rilis penuh. |
| P2 | Masalah nyata dengan dampak terbatas dan workaround layak. | Status koneksi kurang jelas pada kasus nonkritis; layout sekunder terpotong tanpa menghalangi jawaban. | Catat dampak dan tindak lanjut; nilai terhadap scope milestone. |
| P3 | Perbaikan kecil yang tidak mengubah fungsi atau menghalangi penggunaan. | Konsistensi label kecil atau cleanup yang aman. | Opsional; jangan mengalahkan pemeriksaan inti. |

Severity harus mengikuti dampak nyata, bukan nama kategori saja. Salah hitung satu family soal yang masuk pertandingan tetap bisa menjadi blocker meskipun implementasinya hanya satu baris. Target performa yang belum diukur dilaporkan sebagai belum terverifikasi, bukan FPS gagal yang dikarang.

## 5. Matriks requirement dan bukti review

| Requirement | Pertanyaan inti reviewer | Bukti minimum yang relevan |
| --- | --- | --- |
| REQ-001 | Apakah seluruh alur bisa dilakukan lewat sentuhan? | Browser mobile viewport, input keypad, alur masuk–hasil. |
| REQ-002 | Apakah konten kelas 7 dan sesuai scope? | Daftar template/topik serta contoh soal dan pembahasan. |
| REQ-003 | Apakah tamu bisa masuk tanpa akun dan tidak mengambil identitas orang lain? | Browser bersih dan pengujian otorisasi session. |
| REQ-004 | Apakah kapasitas/start/host benar? | Start <4, join >8, dua start bersamaan, aksi non-host. |
| REQ-005 | Apakah refresh/reconnect memakai identitas dan state yang sama? | Pemulihan sesi tanpa reset life/score atau slot ganda. |
| REQ-006 | Apakah avatar berjalan dan kontrol beralih saat giliran? | Input touch, rekaman/screenshot, observasi browser lain. |
| REQ-007 | Apakah tiap peserta mendapat giliran yang sah? | State machine dan log urutan ronde/giliran. |
| REQ-008 | Apakah soal/kunci mendatang tetap privat? | Audit payload, bundle boundary, snapshot/event. |
| REQ-009 | Apakah jawaban rasional setara dinilai tepat? | Test parser/normalizer/grader dengan oracle independen. |
| REQ-010 | Apakah deadline server tunggal dan stabil? | Uji batas waktu, background tab, perubahan jam client. |
| REQ-011 | Apakah submit dan retry hanya satu outcome? | Race answer/timeout, double click, response hilang. |
| REQ-012 | Apakah nyawa dan eliminasi sesuai aturan? | Salah/timeout tiga kali dan sesi penonton setelah gugur. |
| REQ-013 | Apakah skor 100–120 dan dihitung server? | Boundary angka bonus setelah OD-01 selesai, tampering test. |
| REQ-014 | Apakah band kesulitan sama dalam ronde? | Metadata family, parameter bounds, review variasi. |
| REQ-015 | Apakah latihan penonton privat dan tanpa efek kompetitif? | Dua penonton + pemain utama pada session terpisah. |
| REQ-016 | Apakah pembahasan benar dan lima detik? | Check timestamp fase dan contoh hasil tiga outcome. |
| REQ-017 | Apakah evaluasi akhir menunggu ronde lengkap? | Satu bertahan di tengah ronde, akhir ronde 1–4. |
| REQ-018 | Apakah hasil bisa dihitung ulang dari data sah? | Winner selection dan log outcome/eligibility. |
| REQ-019 | Apakah hanya satu penentuan seri dengan soal sama? | Skenario benar tercepat, semua salah, waktu seri. |
| REQ-020 | Apakah reconnect tidak pause atau menggandakan peserta? | Disconnect/reconnect di beberapa fase dan batas 60 detik. |
| REQ-021 | Apakah hanya preset/emote yang diizinkan? | Payload ilegal, flood, pembatasan fase soal. |
| REQ-022 | Apakah dua room/16 session benar-benar terisolasi? | Hasil uji paralel dan identifikasi session unik. |
| REQ-023 | Apakah client hanya mengirim intent? | Audit write path dan payload manipulasi. |
| REQ-024 | Apakah state konsisten pada concurrency/restart? | Test beberapa eksekutor dan persistence recovery. |
| REQ-025 | Apakah token/jawaban privat bebas dari broadcast/log yang salah? | Audit serialisasi, logging, dan batas membership. |
| REQ-026 | Apakah UI HP terbaca dan performa diukur jujur? | Viewport, perangkat/browser referensi, rekaman/metrik. |
| REQ-027 | Apakah error/retry memberi state yang benar? | Network failure, invalid input, expired turn, unsupported WebGL. |
| REQ-028 | Apakah layanan/dependency sesuai batas biaya? | Inventaris layanan, estimasi resource, catatan lisensi. |
| REQ-029 | Apakah generator dan pembahasan diverifikasi independen? | Test family/batas/seed dan review isi. |
| REQ-030 | Apakah klaim selesai sesuai bukti? | Manifest bukti pass/fail/not-run dengan versi dan environment. |
| REQ-031 | Apakah perubahan dapat dilacak ke baseline? | Requirement mapping, OD disposition, changelog produk. |
| REQ-032 | Apakah proyek lain dan scope SD tidak ikut berubah? | Diff scope, keputusan reuse/integrasi bila ada. |

## 6. Pemeriksaan per domain

### 6.1 Domain matematika dan generator

Periksa jalur dari parameter template sampai prompt, expected value, pembahasan, dan input yang diterima.

- Jawaban tepat menggunakan representasi rasional atau metode setara yang dibuktikan; jangan menerima selisih angka dengan epsilon generik tanpa alasan matematis.
- Normalisasi pecahan mempertahankan tanda, mengurangi dengan GCD secara benar, dan menangani nol. Jika menggunakan BigInt, serialisasi/persistence harus eksplisit dan tidak menyebabkan JSON error.
- Pemisah desimal yang didukung sesuai kontrak; `parseFloat` tidak boleh menerima sisa string seperti `1/2abc` sebagai angka sah.
- Batas panjang/magnitude input dan parameter mencegah operasi tak terbatas atau overflow. Format invalid tidak berubah menjadi `0`, jawaban benar, atau exception yang membuka jawaban.
- Angka random berada pada domain yang dijanjikan. Pengacakan denominator tidak menghasilkan nol; pemilihan soal tidak menghasilkan loop retry generator yang tidak berakhir.
- Solusi dan pembahasan benar untuk parameter yang benar-benar tampil, termasuk urutan operasi dan tanda negatif.
- Tingkat sulit tidak hanya berarti angka lebih panjang yang memakan waktu input. Panjang bacaan, langkah hitung, serta ukuran denominator harus ikut ditinjau.
- Tidak ada key model AI/inference yang diperlukan untuk membuat soal selama match.

**Bukti penting:** nilai referensi untuk contoh yang dihitung terpisah, seed batas, dan variasi lintas family. Test yang memanggil solver yang sama di sisi expected dan actual dapat lulus meskipun kedua sisi salah.

### 6.2 Parser dan kontrak input

Reviewer harus menemukan kontrak grammar tertulis, pesan error, dan perilaku pada batas waktu. Jangan menganggap usulan grammar pada PRD sudah disetujui seluruh detailnya.

Periksa setidaknya:

- `1/2`, `2/4`, `0,5`, `0.5` terhadap expected 1/2.
- Pecahan dan desimal negatif, `-0`, serta nol dengan numerator nol.
- Pecahan tak sederhana, improper fraction, dan desimal tepat.
- Kosong, whitespace, banyak separator, denominator nol, beberapa minus, exponent, satuan, mixed number, dan ekspresi aritmetika menurut grammar yang dipilih.
- Unicode minus dan karakter yang mirip angka bila didukung atau ditolak.
- Nilai sangat panjang dan payload bukan string.
- Nilai finite approximation untuk pecahan berulang, misalnya `0,3333` terhadap 1/3.

UI dan server boleh mempunyai validasi format yang sama, tetapi server tetap memvalidasi sendiri. Client tidak boleh menandai benar dengan memegang answer key sebelum waktunya.

### 6.3 State machine, ronde, dan hasil

- Urutan fase tersimpan dan transisi mempunyai precondition jelas.
- Hak giliran tidak berasal dari kamera, posisi avatar, atau urutan komponen UI.
- Roster ronde konsisten; satu peserta maksimal satu giliran utama per ronde.
- Elimination tidak menghapus histori sehingga total skor/urutan hasil berubah.
- Check akhir lebih awal dilakukan pada `ROUND_COMPLETE`, bukan pada setiap penurunan nyawa.
- Setelah ronde empat, tidak ada jalur ke ronde utama kelima.
- All-eliminated, last-survivor, cap-round, tie, leave, dan disconnect dibedakan.
- Pada kasus semua gugur, kandidat berdasarkan skor tidak hilang hanya karena `lives === 0`; mereka dapat mengikuti satu penentuan seri tanpa mendapat nyawa/giliran utama baru.
- Hasil final immutable/idempotent dan menyimpan alasan selesai.
- Logika eligibility yang belum dipilih melalui OD-03/OD-04 tidak disembunyikan dalam kondisi filter.

**Dugaan cacat yang perlu dicari:** penggunaan `players.filter(connected)` sebagai daftar peserta yang masih hidup; evaluasi juara sebelum peserta terakhir ronde menjawab; hasil dari array client yang stale; atau membuat tiebreak baru setiap kali skor tetap seri.

### 6.4 Timer dan fungsi bonus

- Sumber waktu authoritative jelas dan tersedia pada seluruh instance backend.
- `startsAt`, `deadlineAt`, dan `feedbackEndsAt` konsisten; unit detik/milidetik tidak tertukar.
- Timer soal tidak dimulai ketika avatar masih bergerak menuju panggung tanpa input siap.
- Penerimaan di batas deadline sama untuk HTTP, event channel, retry, dan scheduler.
- Client tidak dapat memperpanjang waktu lewat perubahan jam, background/resume, refresh, reconnect, atau timestamp palsu.
- Bonus memakai waktu server yang disepakati OD-01; hasil berada pada 0–20, deterministik, dan menurun ketika elapsed meningkat.
- Tidak ada bonus pada jawaban salah atau penonton.
- Latensi jaringan diukur dan dijelaskan. Jangan mengklaim ranking waktu bebas bias hanya karena timestamp dihitung server.
- Ketika backend pulih terlambat, jangan memulai soal baru dengan deadline yang telah lewat sebelum soal tersebut pernah dirilis ke pemain. Pemulihan deadline lama dan pembukaan giliran baru perlu dibedakan.

Timer in-memory bukan satu-satunya bukti correctness pada Worker yang dapat dihentikan. Reviewer harus melihat persistence/rekonsiliasi deadline dan uji scheduler ganda.

### 6.5 Submit, idempotency, dan concurrency

Ikuti satu request hingga seluruh efek finalnya.

- Validasi membership, match ID, turn ID, fase, role, deadline, dan payload dilakukan server-side.
- Satu constraint/operasi atomik mencegah dua jawaban utama atau dua outcome pada turn yang sama.
- Duplicate key dengan payload sama mengembalikan hasil yang sama; payload berbeda tidak menimpa jawaban terkunci.
- Timeout dan submit beradu dengan aturan pemenang transaksi yang jelas.
- Penulisan outcome, skor, nyawa, dan perpindahan fase tidak menghasilkan state setengah jadi yang terlihat sebagai final.
- Retry setelah response hilang tidak membuat turn baru, pemain baru, atau score event baru.
- Request lama tidak berlaku pada rematch hanya karena room code sama.
- Idempotency tidak bergantung pada satu process atau satu koneksi yang sama.

Gunakan uji dua handler/eksekutor pada public seam dengan shared store. Menguji dua callback berurutan dalam satu object tidak membuktikan penyelesaian race backend.

### 6.6 Latihan penonton dan privasi jawaban

- Role kompetitif ditentukan server, termasuk role khusus beberapa kandidat pada tiebreak.
- Submit penonton masuk namespace/record privat yang tepat.
- Penonton tidak dapat menutup turn, menambah skor, kehilangan nyawa, atau mengubah winner.
- Jawaban mentah, correctness, dan pembahasan tidak dibuka sebelum fase yang sesuai.
- Public broadcast memakai whitelist field; jangan mengirim seluruh row database atau seluruh domain object kemudian menyembunyikannya hanya melalui CSS.
- Hasil privat tidak ikut pada endpoint snapshot peserta lain atau room lain.
- Status “sudah menjawab” jika ditampilkan tidak membawa isi jawaban.
- Pada turn utama yang selesai cepat, penutupan latihan dan pembukaan pembahasan mengikuti satu state server.

Soal matematika dapat dihitung dengan alat lain di luar game. Review integritas tidak boleh mengklaim mencegah seluruh bentuk bantuan eksternal. Fokus pada kebocoran yang dibuat sistem dan hak aksi di dalam game.

### 6.7 Sesi tamu, membership, dan kontrol akses

- Room code dipakai untuk bergabung, bukan sebagai secret yang memberi hak menjadi setiap pemain.
- Guest credential dibuat dengan sumber random yang sesuai dan expiry yang jelas.
- Server tidak percaya `playerId`, `roomId`, `host=true`, atau `role` yang diajukan client tanpa pemeriksaan binding sesi.
- Cookie/token strategy cocok dengan deployment aktual. Jika memakai cookie, pertimbangkan SameSite, HttpOnly bila sesuai, CSRF, dan domain/path; jika token, pertimbangkan penyimpanan serta paparan melalui log/URL.
- Join/start/submit/movement/emote mempunyai validasi batas ukuran dan frekuensi. Rate limit tidak boleh memblokir satu kelompok siswa hanya karena mereka memakai IP/NAT yang sama tanpa mempertimbangkan session yang sah.
- Input nickname tidak dirender sebagai HTML tidak aman. Duplikasi nama tidak dipakai sebagai identity key.
- Tidak ada syarat login platform tersembunyi pada URL rilis yang dijanjikan menerima tamu.
- Tidak ada endpoint debug yang dapat mengganti jawaban, waktu, atau skor pada deployment publik.

Tidak perlu menambahkan sistem akun permanen untuk menyelesaikan masalah sesi tamu. Solusi teknis harus tetap memenuhi K-19.

### 6.8 Putus koneksi, leave, dan lifecycle

- Heartbeat timeout, `disconnectedAt`, dan `graceUntil` memiliki definisi yang konsisten.
- Nyawa, keanggotaan, koneksi, dan eligibility adalah state yang berbeda.
- Reconnect memulihkan session yang sama; koneksi lama tidak dapat menghidupkan kembali state kedaluwarsa.
- Grace period 60 detik tidak menambah jatah 30 detik pada giliran.
- Setiap missed turn yang benar-benar terjadi hanya memberi satu penalti.
- Setelah grace habis, gunakan kebijakan yang disetujui. Jika belum ada, laporkan OD-03 sebagai belum selesai, bukan menerima perilaku apa pun yang kebetulan ada.
- Host migration, roster freeze, late join, rematch, dan voluntary leave mengikuti OD-04 setelah ditetapkan.
- Saat semua pemain offline, tidak ada match hantu tanpa expiry atau pemenang yang diciptakan dari penghapusan record.
- Tutup socket/subscription, batalkan listener, dan bersihkan resource saat keluar; jangan bocorkan sesi room lama ke room berikutnya.

### 6.9 Real-time, state bersama, dan kapasitas

- State authoritative tidak hanya berada pada global `Map`, RAM satu server, atau localStorage.
- Instance backend berbeda melihat versi yang konsisten dan tidak mengklaim turn yang sama dua kali.
- Event sequence/version mencegah rollback client akibat pesan terlambat atau duplicate.
- Client dapat memperoleh snapshot yang benar setelah event gap dan network handover.
- Room A tidak dapat berlangganan/baca/tulis Room B dengan mengganti ID.
- Gerak avatar direplikasi dengan batching/interpolasi yang sesuai; tidak menciptakan request tanpa batas per frame.
- Slow client, reconnect, dan event queue tidak menahan seluruh pertandingan.
- Kemampuan WebSocket/SSE/Durable Objects harus dibuktikan pada deployment path yang dipakai. Dokumentasi umum provider saja tidak cukup.
- Ukur penggunaan resource untuk dua room penuh. Jangan menganggap polling banyak endpoint per frame gratis atau cukup hanya karena 16 pemain.

Untuk uji, bedakan 16 session API, 16 browser context, dan 16 perangkat fisik. Ketiganya memberi bukti yang berbeda. Klaim laporan harus memakai istilah yang tepat.

### 6.10 UI HP, kontrol, dan aksesibilitas

- Soal, timer, nyawa, keypad, dan tombol final submit terlihat dan dapat dipakai pada viewport target.
- Angka negatif, koma desimal, dan garis pecahan tidak ambigu atau terpotong.
- Touch target utama dan jarak tombol mengurangi salah tekan; input tanda minus/pecahan tidak membutuhkan keyboard tersembunyi.
- Fokus input tidak membuat halaman meloncat atau menutupi keypad. Enter/repeat key tidak menimbulkan double submit.
- Joystick/drag kamera tidak berkonflik dengan input jawaban; kontrol berpindah ketika pemain ke panggung.
- Status benar/salah, putus koneksi, dan submit pending tidak hanya ditandai warna.
- Elemen UI penting mempunyai label, fokus yang masuk akal, dan teks yang dapat dibaca. Keterbatasan aksesibilitas scene canvas dinyatakan secara spesifik.
- Tampilan portrait/landscape diuji sesuai cakupan yang telah ditetapkan; jangan mengklaim seluruh HP hanya dari satu ukuran desktop.
- Feedback lima detik berisi langkah singkat yang benar-benar dapat dibaca; bila tidak, laporkan masalah desain, bukan mengubah durasi diam-diam.

### 6.11 Visual 3D dan performa

- Arena benar-benar sesuai taman cerah dengan panggung, papan soal, dan penonton.
- Avatar bisa berjalan dan perpindahan panggung dapat diamati dari client lain.
- Tidak ada efek/transparansi/dekorasi yang menghalangi soal atau tombol.
- Geometri/material sesuai budget HP; instancing/texture/asset loading dipilih berdasarkan profil.
- Resource Three.js, geometry, material, texture, event listener, animation loop, dan stream dibersihkan saat lifecycle berubah.
- Hilangnya WebGL context tidak hanya menghasilkan layar hitam.
- Profil performa mencatat perangkat/browser, build, jumlah avatar, durasi, skenario gerak, serta FPS/frame-time yang diamati.
- Mengurangi efek grafis dapat menjadi solusi teknis. Menghilangkan avatar berjalan atau mengganti dunia dengan gambar statis adalah perubahan produk.

Target awal sekitar 30 FPS memerlukan perangkat referensi. Viewport emulation tidak meniru GPU/CPU HP dan tidak cukup untuk klaim performa hardware.

### 6.12 Biaya, lisensi, dan batas integrasi

- Tidak ada model inference runtime wajib untuk soal.
- Tidak ada credential pada source, bundle, source map publik, screenshot, log, atau `.env` yang dilacak.
- Dependency dan versi yang digunakan jelas; tangani perubahan API berdasarkan versi terpasang.
- Lisensi alat, runtime, aset, dan output diperiksa terpisah. AGPL pada alat tidak otomatis membuktikan game output harus AGPL; reviewer perlu bukti penggunaan/linkage sebelum membuat kesimpulan.
- Repo tanpa file lisensi yang jelas tidak dianggap boleh disalin hanya karena tersedia publik.
- Tidak ada integrasi monetisasi/Play.fun/iklan yang terbawa scaffold padahal scope tidak memintanya.
- Tidak ada perubahan schema/login/kurikulum aplikasi SD yang ikut terbawa tanpa keputusan integrasi.
- Estimasi kuota mencakup pembaruan avatar, polling/event, presence, state writes, serta cleanup.

## 7. Strategi pengujian yang bermakna

### 7.1 Lapisan bukti

| Lapisan | Tujuan | Contoh |
| --- | --- | --- |
| Domain/unit | Memeriksa aturan dan matematika secara deterministik. | Parser rasional, generator, bonus, nyawa, winner selection. |
| Seam/integration | Memeriksa penyambungan domain, store, otorisasi, dan konkurensi. | Request submit/timeout, join capacity, snapshot privat. |
| Browser end-to-end | Memeriksa alur yang benar-benar bisa dimainkan. | Tamu–room–turn–feedback–hasil melalui input. |
| Multi-session/load | Memeriksa isolasi, kapasitas, serta event/state paralel. | Dua room penuh, 16 identitas, reconnect di salah satu room. |
| Perangkat/visual | Memeriksa keterbacaan, kontrol touch, motion, dan performa. | HP nyata, viewport target, rekaman avatar menuju panggung. |

Gunakan fake clock untuk pengujian domain/deadline yang deterministik, sehingga test tidak perlu tidur 30 detik per kasus. Tetap perlu bukti bahwa batas 30 detik dan feedback 5 detik pada jalur browser sebenarnya mengikuti state server. Hook manipulasi waktu hanya boleh berada pada environment test yang terisolasi; jangan mengeksposnya ke deployment publik.

Jangan menambah test yang hanya mengulang konstanta di implementation tanpa menguji perilaku. Contoh buruk: memeriksa `MAX_LIVES === 3` saja. Contoh berguna: tiga outcome salah yang berbeda mengurangi nyawa menjadi nol, refresh tidak meresetnya, dan peserta tidak mendapat giliran berikutnya.

### 7.2 Set kasus minimum untuk rilis pertama

| ID | Pemicu/kasus | Oracle/hasil yang diperiksa | Acuan |
| --- | --- | --- | --- |
| TC-01 | Bentuk setara 1/2, 2/4, 0,5, 0.5 | Semua bernilai tepat sama dan benar. | REQ-009 |
| TC-02 | Pecahan negatif, nol, improper fraction | Nilai/tanda benar dan tidak overflow/crash. | REQ-009 |
| TC-03 | 0,3333 terhadap 1/3 | Tidak diterima sebagai nilai tepat. | REQ-009 |
| TC-04 | Input malformed/denominator nol/input panjang | Ditolak aman, timer tidak reset. | REQ-009, REQ-010 |
| TC-05 | Template seed normal dan batas | Domain valid, prompt/solver/steps cocok dengan oracle independen. | REQ-014, REQ-029 |
| TC-06 | Jawaban benar pada awal/tengah/akhir jendela | Base 100, bonus sesuai formula yang disetujui, tetap 0–20. | REQ-013, OD-01 |
| TC-07 | Jawaban salah dan timeout | Poin 0, tepat satu nyawa berkurang. | REQ-012, REQ-013 |
| TC-08 | Tiga kesalahan pada giliran berbeda | Gugur sekali dan bisa latihan sebagai penonton. | REQ-012, REQ-015 |
| TC-09 | Submit ulang/double click | Satu outcome/score event/penalti. | REQ-011 |
| TC-10 | Response hilang setelah server commit | Retry memulihkan hasil yang sama. | REQ-011, REQ-027 |
| TC-11 | Submit beradu timeout pada dua eksekutor | Hanya satu hasil sah menurut deadline. | REQ-010, REQ-024 |
| TC-12 | Submit tepat sebelum/pada/setelah deadline | Batas yang disepakati diterapkan konsisten. | REQ-010 |
| TC-13 | Client mengubah jam/elapsed/score/role | Tidak mendapat kontrol state authoritative. | REQ-010, REQ-023 |
| TC-14 | Penonton submit lebih cepat/benar/salah | Tidak mengubah skor/nyawa/giliran; input tetap privat. | REQ-015, REQ-025 |
| TC-15 | Pemain utama menjawab cepat | Turn latihan ditutup, pembahasan 5 detik, next turn belum overlap. | REQ-015, REQ-016 |
| TC-16 | Nyawa turun hingga tinggal satu di tengah ronde | Evaluasi akhir menunggu ronde lengkap. | REQ-017 |
| TC-17 | Satu bertahan setelah ronde lengkap | Juara tunggal dengan alasan benar. | REQ-018 |
| TC-18 | Semua gugur/lebih dari satu sampai ronde empat | Gunakan skor eligible; tidak ada ronde kelima utama. | REQ-017, REQ-018 |
| TC-19 | Dua atau lebih peserta skor tertinggi seri | Satu soal sama, mulai bersamaan, peserta lain tidak ikut menentukan. | REQ-019 |
| TC-20 | Penentuan semua salah atau tidak tunggal | Juara bersama, tidak ada penentuan kedua. | REQ-019 |
| TC-21 | Penentuan satu benar tercepat | Juara sesuai kebijakan waktu, tanpa kebocoran awal. | REQ-019, OD-02 |
| TC-22 | Disconnect saat menunggu/menjawab/feedback | Match tidak pause, timer dan hasil tetap benar. | REQ-020 |
| TC-23 | Reconnect sebelum batas grace | Identitas sama, tanpa tambahan waktu/slot/life. | REQ-005, REQ-020 |
| TC-24 | Reconnect sesudah batas/all offline/leave | Sesuai kebijakan yang disetujui; belum dianggap final selama OD terbuka. | OD-03, OD-04 |
| TC-25 | Start <4, join kesembilan, start ganda | Kapasitas/otorisasi benar, hanya satu match aktif. | REQ-004, REQ-024 |
| TC-26 | Dua room × delapan session bersamaan | Isolasi event, data privat, timer, skor, dan hasil. | REQ-022, REQ-025 |
| TC-27 | Membership/turn ID room lain dipakai | Akses ditolak, tidak ada side effect cross-room. | REQ-023, REQ-025 |
| TC-28 | Event duplicate/out-of-order/gap | Client tidak rollback; snapshot memulihkan versi terbaru. | REQ-024 |
| TC-29 | Backend restart setelah jawaban/deadline | Hasil tidak hilang/terduplikasi dan deadline tidak memberi keuntungan. | REQ-024 |
| TC-30 | Input dan gerak pada viewport HP | Keypad/soal/submit terbaca, kontrol tidak bentrok. | REQ-001, REQ-006, REQ-026 |
| TC-31 | Browser background dan resume | Fase/timer resync tanpa giliran tambahan. | REQ-010, REQ-020 |
| TC-32 | Nickname HTML dan pesan bebas palsu | Tidak dieksekusi/disiarkan sebagai chat. | REQ-021, REQ-025 |
| TC-33 | Banyak emote/movement/request invalid | Pembatasan bekerja tanpa memblokir penggunaan normal dua room. | REQ-021, REQ-022 |
| TC-34 | Inspect snapshot/bundle/log sebelum feedback | Tidak ada secret/kunci/pembahasan/privat yang belum berhak dibuka. | REQ-008, REQ-025 |
| TC-35 | Main tanpa model API key runtime | Soal dan seluruh alur pertandingan tetap bekerja. | REQ-028, REQ-029 |
| TC-36 | Ulang masuk/keluar/rematch sesuai kebijakan | Tidak ada state room lama, resource leak, atau skor terbawa keliru. | REQ-005, REQ-024, OD-04 |

Setiap TC yang bergantung OD tetap berstatus `BLOCKED_BY_DECISION` sampai kontraknya dipilih. Jangan mengisi expected result dengan implementasi yang sedang diuji lalu menyebutnya lulus requirement pengguna.

### 7.3 Bukti browser dan visual yang perlu dikumpulkan

Untuk rilis penuh, rekam fase berikut pada viewport HP dan fase utama pada laptop:

- Masuk tamu dan lobi room.
- Penonton bergerak dengan avatar; browser lain melihat perubahan.
- Pemain utama di panggung, soal dan keypad aktif.
- Penonton mengerjakan input privat yang berbeda.
- Hasil benar/salah/timeout dan pembahasan lima detik.
- Pemain gugur tetap ikut latihan.
- Reconnect dengan state terkini.
- Satu penentuan seri dan hasil tunggal/juara bersama.

Screenshot dapat membuktikan keterbacaan dan layout. Rekaman singkat/input/event log dibutuhkan untuk gerak, perpindahan kontrol, durasi, dan multiplayer. Artefak harus berasal dari versi yang direview.

### 7.4 Uji kapasitas awal

Konfigurasi minimum yang dicatat:

- Dua room berbeda, masing-masing delapan guest session unik.
- Jenis klien yang digunakan: API, browser context, atau perangkat fisik; sebutkan dengan tepat.
- Versi build, environment lokal/hosted, transport, store, dan konfigurasi waktu.
- Satu match penuh di setiap room dengan jawaban benar/salah yang memicu beberapa fase.
- Gangguan reconnect pada satu room tanpa memengaruhi room lain.
- Jumlah request/event/read/write, latensi submit/snapshot, error, penggunaan resource yang dapat diukur, serta estimasi kuota.

Jangan menurunkan timer produksi agar test cepat lalu mengklaim timer 30 detik sudah diperiksa tanpa pengujian terpisah. Domain test boleh dipercepat dengan fake time yang jelas.

## 8. Anti-drift: pola yang harus ditangkap review

| Perubahan yang ditemukan | Penilaian yang benar |
| --- | --- |
| Mengganti game menjadi pilihan ganda | Pelanggaran K-06/REQ-009. |
| Menambahkan bot agar room tampak penuh | Pelanggaran K-02/REQ-022 jika dipresentasikan sebagai manusia. Bot test harus jelas terisolasi. |
| Mewajibkan login platform untuk siswa | Pelanggaran K-19/REQ-003, walau hosting default bersifat privat. |
| Skor penonton masuk leaderboard utama | Pelanggaran K-07/REQ-015. |
| Nyawa reset saat refresh | Pelanggaran REQ-005/REQ-012. |
| Pause pertandingan ketika koneksi putus | Pelanggaran K-21/REQ-020. |
| Mengubah 30 detik menjadi 45 karena soal terlalu panjang | Perubahan produk; perbaiki soal atau bahas keputusan dengan pengguna. |
| Pembahasan hanya muncul pada jawaban salah | Pelanggaran K-15/REQ-016. |
| Mengakhiri match di tengah ronde saat tinggal satu | Pelanggaran K-20/REQ-017. |
| Mengulang sudden death hingga ada pemenang | Pelanggaran K-16/REQ-019. |
| Menetapkan detail forfeit tanpa menyebut OD | Keputusan produk disisipkan; OD-03/OD-04 harus dituntaskan. |
| Menganggap rekomendasi formula/100 ms sudah disetujui | Salah mengubah usulan OD menjadi baseline. |
| Mengambil fitur monetisasi dari scaffold | Scope dan batas biaya berubah; REQ-028/REQ-031. |
| Menyatakan localhost multiplayer sebagai hosting terverifikasi | Klaim melebihi bukti; REQ-030. |
| Menganggap provider mendukung fitur berarti Sites pasti mendukung | OD-06 belum dibuktikan. |
| Mengubah aplikasi SD yang ada menjadi SMP tanpa keputusan integrasi | Pelanggaran REQ-032. |
| Menghapus avatar berjalan demi demo cepat | Pelanggaran K-17/REQ-006 jika dipresentasikan sebagai hasil final. |

## 9. Format temuan review

Gunakan satu temuan untuk satu akar masalah yang dapat diperbaiki. Jangan membuat banyak temuan dari konsekuensi identik pada baris berbeda.

```markdown
### F-001 [P1] Judul singkat yang menyatakan cacat

- Requirement: REQ-xxx; keputusan K-xx bila relevan.
- Lokasi: path/to/file.ts:123 (rentang sekecil mungkin pada laporan kerja).
- Pemicu: keadaan dan tindakan yang membuat masalah terjadi.
- Perilaku aktual: hasil yang bisa dibuktikan dari kode/reproduksi.
- Perilaku yang diwajibkan: kutipan atau parafrasa tepat dari baseline.
- Dampak: siapa/apa yang terpengaruh dan mengapa penting.
- Bukti: test/reproduksi/log atau alur kode yang cukup kuat.
- Arah perbaikan: perubahan minimum yang memenuhi requirement.
- Verifikasi setelah perbaikan: skenario bermakna yang harus lulus.
- Keyakinan: tinggi/sedang, dengan batasnya bila ada.
```

Untuk bagian yang belum diputuskan, gunakan format terpisah:

```markdown
### D-001 — Open decision yang memengaruhi perubahan

- Acuan: OD-xx.
- Bagian implementasi yang bergantung: ...
- Pilihan/rekomendasi yang sudah tertulis: ...
- Dampak jika diasumsikan diam-diam: ...
- Status: menunggu keputusan produk / menunggu pembuktian teknis.
```

Untuk bukti yang belum tersedia:

```markdown
### V-001 — Batas verifikasi

- Klaim yang belum dapat dibuktikan: ...
- Pemeriksaan yang sudah dilakukan: ...
- Pemeriksaan yang belum dilakukan dan alasannya: ...
- Bukti berikutnya yang akan menyelesaikan ketidakpastian: ...
```

Jangan menyebut temuan defect jika hanya berupa preferensi struktur file, dugaan generik, atau skenario yang tidak mungkin terjadi menurut kontrak input yang benar-benar ditegakkan.

## 10. Template laporan review dan perubahan

### 10.1 Laporan review

```markdown
# Review Math Bee SMP

Versi kode/commit:
Versi PRD:
Scope perubahan:
Hasil review: APPROVE / REQUEST_CHANGES / NEEDS_PRODUCT_DECISION / VERIFICATION_INCOMPLETE

## Temuan

Temuan P0/P1 dahulu, kemudian temuan lain yang relevan.
Jika tidak ada defect terkonfirmasi, nyatakan secara langsung.

## Keputusan terbuka

OD yang memengaruhi scope ini dan statusnya.

## Verifikasi

| Check | Environment/konfigurasi | Hasil | Bukti/batas |
| --- | --- | --- | --- |
| ... | ... | PASS / FAIL / NOT_RUN / BLOCKED_BY_DECISION | ... |

## Cakupan requirement

REQ yang disentuh, terpenuhi/belum, dan buktinya.

## Risiko tersisa

Hanya risiko konkret yang belum diselesaikan, dengan dampak dan langkah berikutnya.
```

Review tanpa temuan tidak berarti tidak ada bug. Nyatakan cakupan dan batas verifikasi agar kesimpulan dapat dinilai.

### 10.2 Deskripsi perubahan/PR

```markdown
Masalah dan perilaku hasil:
Penjelasan singkat tentang pemicu, perubahan, dan hasil yang terlihat.

Requirement terkait:
- REQ-...

Keputusan dan scope:
- OD/keputusan produk yang relevan; tidak perlu menceritakan seluruh percakapan.

Validasi:
- Pemeriksaan yang benar-benar dijalankan dan hasilnya.

Keterbatasan:
- Yang belum terverifikasi atau berubah secara material.
```

Untuk perubahan kecil, gunakan satu atau dua paragraf dan validasi yang relevan. Untuk rilis pertama, sertakan matriks evidence yang memadai. Jangan mencantumkan daftar check yang tidak dijalankan sebagai hasil pass.

## 11. Kriteria hasil review dan kelulusan

### 11.1 Hasil review

- **REQUEST_CHANGES:** ada cacat P0/P1 terkonfirmasi atau perubahan baseline yang belum disetujui. Nyatakan lokasi dan tindakan perbaikan.
- **NEEDS_PRODUCT_DECISION:** tidak ada blocker defect yang lebih dulu menentukan hasil, tetapi scope bergantung pada OD produk yang belum selesai. Jangan membuat keputusan itu atas nama pengguna.
- **VERIFICATION_INCOMPLETE:** tidak ada blocker yang terbukti, tetapi bukti penting untuk scope/klaim belum tersedia, termasuk kemampuan hosting yang belum dibuktikan.
- **APPROVE:** scope memenuhi baseline yang relevan, OD yang memengaruhi perilaku sudah selesai, bukti cukup untuk klaim yang dibuat, dan tidak ada blocker terbuka.

Satu laporan boleh memiliki defect, OD, dan batas verifikasi sekaligus. Status utama harus membuat hambatan terpenting jelas; isi laporan tetap mempertahankan ketiganya. Ini status dokumen review, bukan instruksi otomatis mengirim review GitHub atau menerbitkan Site.

### 11.2 Kelulusan milestone

- Review milestone domain dapat lulus untuk matematika/state machine tanpa mengklaim visual atau deployment selesai.
- Review visual dapat lulus untuk layout tertentu tanpa mengklaim seluruh multiplayer terverifikasi.
- Rilis penuh baru dinyatakan memenuhi PRD ketika aturan inti, multiplayer dua room, akses tamu, kontrol HP, serta bukti yang relevan telah diperiksa.
- OD yang tidak menyentuh scope saat ini boleh tetap terbuka. OD yang menentukan hasil pertandingan, deadline/bonus, atau lifecycle terkait tidak boleh disembunyikan di balik label “polish nanti”.
- Usulan perubahan teknis rutin yang mempertahankan perilaku tidak perlu approval produk baru; catat alasan dan hasil validasinya.

### 11.3 Pemeriksaan akhir anti-klaim berlebihan

Sebelum laporan selesai, periksa kalimat berikut terhadap bukti:

- “Multiplayer sudah berfungsi”: harus ada session independen dengan state server bersama.
- “Mendukung 16 pemain”: harus ada uji kapasitas/isolasi yang sesuai, bukan hanya angka konfigurasi.
- “Nyaman di HP”: harus ada input dan layout mobile; klaim hardware memerlukan perangkat nyata.
- “Soalnya benar”: perlu verifikasi independen generator, grading, dan pembahasan.
- “Gratis”: harus dinyatakan sebagai kondisi paket/kuota yang diketahui, dengan batasnya; jangan menjanjikan operasional tanpa biaya selamanya.
- “Siap dipublikasikan”: akses anonim, hosting, resource, dan blocker harus sesuai scope serta otorisasi yang berlaku.
- “Tidak ada bug”: hindari klaim absolut; nyatakan tidak ada temuan terkonfirmasi dalam cakupan pemeriksaan.

## 12. Prompt siap pakai untuk reviewer berikutnya

```text
Review perubahan Math Bee SMP berdasarkan prd.md dan code-review-spec.md.

Mulai dengan instruksi repository dan versi dokumen yang berlaku. Pahami diff serta
public seam yang terdampak. Petakan perubahan ke REQ dan keputusan K. Bedakan
keputusan yang disepakati dari OD yang belum dipilih; jangan menjadikan rekomendasi
OD sebagai requirement pengguna yang sudah final.

Prioritaskan kebenaran matematika, state machine, deadline/scoring server,
idempotency dan race, identitas tamu, privasi latihan penonton, isolasi room,
reconnect, alur sentuh, dan bukti multiplayer nyata. Periksa biaya, dependency,
lisensi, dan batas scope ketika relevan terhadap diff.

Jalankan pemeriksaan yang bermakna dan tersedia untuk scope yang diotorisasi.
Jangan menambah pengujian yang hanya menyalin implementation, dan jangan
mengklaim check yang tidak dijalankan. Pisahkan defect, keputusan terbuka,
dan keterbatasan verifikasi. Hasil load simulasi bukan uji siswa/perangkat nyata.

Laporkan temuan yang dapat ditindaklanjuti dengan severity, file/baris, pemicu,
dampak, requirement, bukti, dan arah perbaikan. Dahulukan P0/P1. Hindari temuan
spekulatif atau preferensi gaya yang tidak mengubah correctness/maintainability.

Berikan hasil APPROVE, REQUEST_CHANGES, NEEDS_PRODUCT_DECISION, atau
VERIFICATION_INCOMPLETE sesuai dokumen. Jika tidak ada defect terkonfirmasi,
katakan langsung dan jelaskan batas pemeriksaannya. Jangan mengubah produk,
mengedit project lain, memublikasikan komentar, atau menerbitkan layanan
tanpa otorisasi pekerjaan yang berlaku.
```

## 13. Log perubahan

| Versi | Tanggal | Perubahan | Status |
| --- | --- | --- | --- |
| 0.1 | 2026-10-25 | Menetapkan matriks 32 requirement, domain review, 36 kasus uji, severity, format temuan, dan kriteria kelulusan. | Spec sebelum implementasi; belum ada review aplikasi. |
| 0.2 | 2026-10-25 | Mengikuti PRD v0.2 dan menunjuk hasil review implementasi terpisah. Kontrak review dan 32 requirement tetap berlaku. | Review aktual dicatat pada artifacts/code-review.md. |

Jika PRD berubah, perbarui matriks, test oracle, dan anti-drift yang terkait. Jangan mengubah expected result test hanya agar mengikuti bug implementation atau kebijakan produk yang belum dipilih.
