# PRD — Math Bee SMP

| Metadata | Nilai |
| --- | --- |
| Nama kerja | Math Bee SMP; nama produk final belum diputuskan |
| Versi dokumen | 0.2 — baseline wawancara, implementasi, dan keputusan lanjutan |
| Tanggal | 25 Oktober 2026, Asia/Jakarta |
| Bahasa produk yang diusulkan | Bahasa Indonesia |
| Pemilik keputusan produk | Pengguna / product owner |
| Dokumen pendamping | [code-review-spec.md](code-review-spec.md) |
| Status pekerjaan saat dokumen dibuat | Implementasi dan validasi lokal berjalan; publikasi Sites belum terverifikasi. |

## Navigasi

- [Tujuan dan sumber kebenaran](#1-tujuan-dan-batas-otorisasi)
- [Masalah dan pengguna](#2-masalah-pengguna-dan-hasil-yang-diinginkan)
- [25 keputusan wawancara](#3-register-keputusan-wawancara)
- [Scope versi pertama](#4-scope-versi-pertama)
- [Requirement pengalaman dan akses](#5-requirement-pengalaman-dan-akses)
- [Requirement pertandingan](#6-requirement-pertandingan-dan-penilaian)
- [Requirement sistem dan kualitas](#7-requirement-sistem-dan-kualitas)
- [Alur dan state machine](#8-alur-pengguna-dan-state-machine)
- [Model data dan komunikasi](#9-model-data-dan-kontrak-komunikasi-konseptual)
- [Konten dan parser](#10-konten-dan-parser-spesifikasi-awal)
- [Arsitektur dan hosting](#11-arsitektur-yang-direkomendasikan-dan-pembuktian-hosting)
- [Keputusan yang masih terbuka](#12-open-decisions-dan-asumsi-yang-belum-disetujui)
- [Skenario penerimaan](#13-contoh-skenario-penerimaan-lintas-fitur)
- [Tahapan implementasi](#14-tahapan-implementasi-yang-diusulkan)
- [Definisi selesai](#15-definisi-selesai-dan-batas-klaim)
- [Audit 20 repo OSS](#16-lampiran-riset-repo-oss)
- [Log perubahan](#17-log-perubahan-dan-format-pembaruan)

## 1. Tujuan dan batas otorisasi

Membangun game kompetisi matematika kelas 7 SMP yang terasa seperti Spelling Bee di dunia 3D bergaya Roblox, dapat dimainkan langsung melalui webapp, dengan room privat berisi 4–8 pemain manusia. Pemain bergiliran maju ke panggung, membaca soal, dan mengetik jawaban matematika. Pemain lain tetap terlibat melalui latihan privat pada soal yang sama.

Dokumen ini mencatat 25 keputusan wawancara agar implementasi tidak berubah menjadi aplikasi latihan SD, kuis pilihan ganda, game solo dengan bot, pengalaman yang hanya berjalan di Roblox, atau platform pembuat game umum.

Setelah PRD v0.1 ditulis, pengguna meminta implementasi game dan menegaskan penggunaan Sites. Implementasi kini diizinkan. Empat rincian kebijakan dikonfirmasi kemudian: rumus bonus linear, toleransi seri 100 ms, expiry reconnect menjadi forfeit/penonton, dan pergantian host otomatis. Lihat [implementation-decisions.md](implementation-decisions.md). Tidak ada otorisasi menambah layanan berbayar atau mengubah aplikasi SD.

### 1.1 Cara membaca tingkat kepastian

- **K — keputusan pengguna:** dipilih secara eksplisit dalam wawancara. Baseline produk yang harus dipertahankan.
- **REQ — requirement:** perilaku atau batas yang dapat diperiksa. Requirement mencantumkan keputusan asal jika ada.
- **T — turunan teknis:** diperlukan agar perilaku yang dipilih benar, misalnya server memeriksa skor dan penanganan request ganda. Implementer boleh memilih solusi yang setara berdasarkan bukti.
- **OD — open decision:** detail produk belum diputuskan atau kemampuan platform belum dibuktikan. Rekomendasi pada bagian ini belum menjadi keputusan pengguna.
- **Target:** sasaran pengujian, bukan klaim bahwa aplikasi atau hosting sudah memenuhi sasaran tersebut.

Jika requirement merujuk OD, bagian yang bergantung pada OD tersebut belum boleh dilaporkan final. Keputusan teknis rutin tidak perlu dimintakan persetujuan baru jika memenuhi baseline, tidak menambah biaya, dan tidak mengubah perilaku produk. Perubahan keputusan produk tetap dibahas satu per satu dengan pengguna.

### 1.2 Urutan sumber kebenaran

1. Instruksi terbaru pengguna yang relevan terhadap produk atau pekerjaan saat itu.
2. Keputusan K pada PRD ini beserta perubahan yang kemudian disetujui.
3. Requirement dan acceptance criteria PRD ini.
4. Catatan keputusan teknis yang menjelaskan cara memenuhi requirement.
5. Panduan repo, skill, scaffold, dan preferensi implementer.

Panduan OSS tidak boleh mengganti batas umur, materi, format pertandingan, kebutuhan multiplayer, atau biaya yang dipilih pengguna. Perubahan yang disetujui harus dicatat ke PRD dan spesifikasi review; jangan hanya dibiarkan dalam percakapan atau kode.

## 2. Masalah, pengguna, dan hasil yang diinginkan

### 2.1 Masalah yang diselesaikan

Kompetisi matematika perlu terasa seperti bermain bersama, sambil memberi kesempatan menghitung, menjawab, melihat kesalahan, dan memahami langkah penyelesaiannya. Sistem harus menghindari waktu tunggu pasif yang panjang pada permainan bergiliran. Antarmuka harus dapat digunakan melalui layar sentuh dan mampu menerima pecahan secara tepat.

### 2.2 Pengguna utama

- Siswa kelas 7 SMP yang bermain bersama teman melalui HP.
- Pemain yang membuat room dan bertindak sebagai host sesi.
- Pemain yang sedang menunggu giliran atau sudah gugur, tetapi tetap mengikuti latihan privat.

Peran guru, akun orang tua, dashboard sekolah, dan administrasi kelas belum dipilih sebagai kebutuhan versi pertama.

### 2.3 Hasil yang harus dapat didemonstrasikan

1. Beberapa browser independen masuk ke room yang sama dan melihat pertandingan yang sama.
2. Pemain utama menjawab soal dengan keypad, menerima skor dan konsekuensi yang benar, lalu giliran berpindah.
3. Penonton mengerjakan soal tanpa mengubah hasil kompetisi dan tanpa membocorkan jawabannya ke peserta lain.
4. Pembahasan benar secara matematika, relevan dengan soal, dan terbaca di HP.
5. Pertandingan selesai dengan pemenang atau juara bersama sesuai aturan.
6. Koneksi putus dan request ganda tidak menghasilkan skor atau nyawa yang tidak konsisten.
7. Dunia 3D memiliki avatar yang dapat digerakkan dan perpindahan ke panggung, serta tidak menghalangi input matematika.

Belum ada target peningkatan nilai belajar, retensi pengguna, atau konversi yang terbukti. Klaim efektivitas pendidikan membutuhkan evaluasi tersendiri.

## 3. Register keputusan wawancara

Nomor K mengikuti nomor pertanyaan wawancara. Pilihan A/B merujuk pilihan pada pertanyaan terkait, sehingga K-10 memang memilih B.

| ID | Pilihan | Keputusan yang dicatat |
| --- | --- | --- |
| K-01 | A | Pemain bergiliran maju ke panggung; pemain lain menonton. |
| K-02 | A | Room privat berisi 4–8 teman/pemain manusia, masuk melalui kode. |
| K-03 | A | HP adalah perangkat utama; laptop tetap didukung. |
| K-04 | A | Sasaran materi versi pertama kelas 7 SMP. |
| K-05 | A | Materi bilangan bulat dan pecahan, termasuk negatif, urutan operasi, dan soal cerita pendek. |
| K-06 | A | Jawaban akhir diketik melalui keypad; pecahan yang bernilai setara diterima. |
| K-07 | A | Penonton ikut mengerjakan soal yang sama secara privat; hasilnya tidak mengurangi nyawa atau menentukan juara. |
| K-08 | A | Masing-masing pemain mempunyai 3 nyawa. Salah atau waktu habis mengurangi satu nyawa; pemain gugur tetap bisa latihan. |
| K-09 | A | Pertandingan memakai jumlah ronde yang ditentukan; diperjelas menjadi maksimum 4 ronde oleh K-13 dan K-20. |
| K-10 | B | Jawaban benar mendapat bonus kecepatan. |
| K-11 | A | Jawaban benar bernilai 100 poin dengan bonus maksimal 20; salah bernilai 0 dan kehilangan satu nyawa. |
| K-12 | A | Kesulitan setara antarpemain dalam ronde yang sama, kemudian meningkat bersama. Angka/soal dapat berbeda. |
| K-13 | A | Maksimal 4 ronde; maksimal empat giliran utama per pemain yang tetap aktif. |
| K-14 | A | Batas satu giliran 30 detik, termasuk mengetik jawaban. |
| K-15 | A | Setelah setiap giliran, tampil jawaban benar dan langkah singkat selama 5 detik. |
| K-16 | A | Skor tertinggi seri diselesaikan dengan satu soal penentuan bersama, 30 detik; benar tercepat menang, tanpa pemenang tunggal berarti juara bersama. |
| K-17 | A | Arena 3D kecil; avatar dapat berjalan di lobi dan penonton, otomatis ke panggung ketika mendapat giliran, lalu kontrol berpindah ke keypad. |
| K-18 | A | Komunikasi melalui emote dan pesan siap pakai, dibatasi saat soal berlangsung. |
| K-19 | A | Tidak perlu akun: nama panggilan dan avatar. Skor untuk sesi; tidak ada riwayat belajar lintas perangkat pada versi pertama. |
| K-20 | A | Evaluasi akhir dilakukan setelah ronde lengkap. Jika tinggal satu yang bertahan, dia menang; jika semuanya gugur, gunakan skor tertinggi. Empat ronde adalah batas maksimum. |
| K-21 | A | Putus koneksi tidak menjeda pertandingan; kesempatan kembali 60 detik. Timer giliran tetap berjalan dan timeout mengurangi nyawa. |
| K-22 | A | Target uji awal sampai 16 pemain, terbagi dalam 2 room. |
| K-23 | A | Utamakan layanan tersedia dan opsi tanpa biaya tambahan. Bahas kebutuhan layanan berbayar sebelum dipakai; tidak ada jaminan seluruh operasional gratis. |
| K-24 | A | Taman kompetisi cerah, avatar bergaya balok, panggung, papan soal besar, tribun kecil, dan dekorasi matematika. |
| K-25 | A | Soal dari pola terverifikasi dengan variasi angka; tidak memanggil AI saat mengeluarkan soal dalam permainan. |

## 4. Scope versi pertama

### 4.1 Termasuk

- Webapp dengan gameplay 3D dan UI matematika berbasis elemen antarmuka yang terbaca.
- Sesi tamu, membuat/bergabung ke room berkode, lobi, pertandingan, pembahasan, dan hasil akhir.
- Multiplayer manusia dengan state pertandingan bersama yang diperiksa server.
- Dua room terisolasi sebagai target uji kapasitas awal.
- Soal bilangan bulat dan pecahan dengan jawaban numerik tepat, termasuk variasi soal cerita pendek.
- Giliran, timer, skor, nyawa, eliminasi, latihan penonton, satu penentuan seri, dan reconnect.
- Avatar dan arena dengan kontrol sentuh serta dukungan laptop.
- Emote/pesan preset terbatas dan status koneksi.
- Bukti pengujian matematika, aturan pertandingan, multiplayer, mobile, dan build yang sesuai stack terpilih.

### 4.2 Di luar scope yang sudah dipilih

- Output `.rbxl`, kebutuhan Roblox Studio pada perangkat pemain, atau login Roblox.
- Game generator untuk membuat banyak jenis game dari prompt.
- Materi SD kelas 4–6, kelas 8–9, aljabar, geometri, dan seluruh silabus SMP.
- Kuis pilihan ganda sebagai jalur jawaban utama.
- Bot yang ditampilkan seolah-olah pemain manusia atau multiplayer yang hanya berjalan pada satu browser.
- Matchmaking publik, direktori room publik, chat bebas, dan voice chat.
- Login email/Google/ChatGPT sebagai syarat bermain, profil permanen, dan riwayat lintas perangkat.
- Monetisasi, iklan, pembayaran, langganan, loot box, battle pass, dan ekonomi kosmetik.
- Dashboard guru/orang tua, administrasi sekolah, rapor permanen, serta integrasi LMS.
- Pembangkitan soal dengan LLM saat game berjalan, aset wajib berbayar, dan penyimpanan API key di browser.
- Mode offline yang mengklaim tetap menjalankan pertandingan multiplayer sinkron.

Pengembangan scope tersebut memerlukan keputusan produk baru. Audio sederhana, efek visual tambahan, atau pilihan kosmetik tidak boleh menunda penyelesaian alur inti maupun memunculkan ketergantungan berbayar.

## 5. Requirement pengalaman dan akses

### REQ-001 — Webapp dan perangkat utama

**Sumber:** K-03, K-06, K-17.

Game dibuka melalui browser di HP, juga mendukung laptop. Pemain tidak perlu memasang Roblox Studio atau aplikasi game native. Alur utama harus bisa diselesaikan dengan sentuhan: bergabung, bergerak, membaca soal, mengetik pecahan, mengunci jawaban, membaca pembahasan, dan melihat hasil.

UI matematika harus tetap jelas ketika canvas 3D aktif. Fokus input, scrolling halaman, area aman layar, dan keyboard tidak boleh membuat tombol jawaban atau timer menghilang. Keypad dalam game harus menyediakan angka, minus, pecahan, desimal, hapus, dan submit. Dukungan keyboard fisik mengikuti kemampuan jawaban yang sama.

**Acceptance:** sesi lengkap dapat diselesaikan dari viewport HP; input tidak bergantung pada hover, tombol keyboard khusus, atau mouse lock.

### REQ-002 — Kelas dan cakupan belajar

**Sumber:** K-04, K-05.

Materi versi pertama untuk kelas 7 SMP: operasi bilangan bulat, tanda negatif, urutan operasi, pecahan, dan soal cerita pendek terkait materi tersebut. Kompleksitas soal harus mempertimbangkan waktu 30 detik yang mencakup membaca dan mengetik.

Kecocokan materi kelas 7 adalah sasaran konten. Jangan mengklaim pemetaan resmi terhadap kurikulum atau buku tertentu tanpa pemeriksaan sumber dan review isi yang sesuai. Soal panjang dengan banyak informasi tidak otomatis cocok hanya karena memakai angka sederhana.

**Acceptance:** setiap template mempunyai topik dan alasan kecocokan usia; tidak ada materi di luar scope yang masuk melalui generator.

### REQ-003 — Akses tamu dan room privat

**Sumber:** K-02, K-19; T keamanan sesi.

Pemain masuk dengan nama panggilan dan avatar, kemudian membuat room atau memasukkan kode. Kode digunakan untuk menemukan dan bergabung ke room; kode bukan identitas pemain dan tidak memberi hak mengubah skor atau mengendalikan host.

Sistem harus membedakan session ID, player ID, room ID, dan kode room. Identitas yang memberi hak melakukan aksi dibuat server dan tidak boleh dapat dipalsukan dengan mengganti `playerId` dalam payload.

Halaman game harus bisa menerima tamu tanpa login platform. Jika hosting awal bersifat owner-private, status tersebut belum memenuhi kebutuhan akses siswa. Akses anonim harus diverifikasi setelah konfigurasi hosting yang sesuai diotorisasi.

**Acceptance:** browser bersih dapat bergabung tanpa akun; browser lain tidak bisa mengambil alih pemain hanya dengan mengetahui nama atau kode room.

### REQ-004 — Kapasitas lobi dan kontrol host

**Sumber:** K-02; detail host adalah usulan pada OD-04.

Room pertandingan berisi 4–8 pemain manusia. Jangan diam-diam menurunkan minimum menjadi dua pemain untuk mempermudah demo. Test harness boleh membuat klien otomatis, tetapi hasilnya harus disebut simulasi.

Usulan alur: pembuat room menjadi host dan memulai pertandingan setelah jumlah pemain valid serta aset/UI pemain siap. Jumlah peserta dibekukan pada awal pertandingan. Kebijakan peserta yang datang terlambat, host keluar, dan perubahan susunan pemain harus ditetapkan melalui OD-04.

**Acceptance:** pemain kesembilan tidak masuk sebagai peserta pertandingan; memulai dengan kurang dari empat ditolak pada jalur produk biasa; aksi start hanya sah bagi peran yang berhak.

### REQ-005 — Sesi dan data lintas pertandingan

**Sumber:** K-19; T pemulihan koneksi.

Tidak ada kewajiban membuat akun atau riwayat belajar lintas perangkat. Sesi tamu tetap memerlukan identitas sementara agar reconnect dapat kembali ke pemain yang sama dalam jendela yang diizinkan.

Penyimpanan preferensi perangkat seperti mute, nama panggilan, atau pilihan avatar boleh memakai browser storage bila sesuai. Penyimpanan tersebut bukan profil sekolah dan tidak boleh menjadi sumber kebenaran skor. Refresh tidak boleh menciptakan pemain kedua atau memberikan tiga nyawa baru pada pertandingan yang sedang berjalan.

Room, pertandingan, dan log operasional sementara memerlukan kebijakan kedaluwarsa. Durasi retensi harus dinyatakan sebelum rilis; jangan menyimpan riwayat pribadi tanpa batas dengan alasan tidak memakai akun.

**Acceptance:** reconnect/refresh dengan sesi yang sah memulihkan state server yang sama; perangkat baru tidak dijanjikan memperoleh progres perangkat lama.

### REQ-006 — Arena, avatar, dan perpindahan kontrol

**Sumber:** K-17, K-24.

Visual berupa taman kompetisi cerah: panggung, papan soal besar, tribun kecil, dekorasi matematika, dan avatar bergaya balok. Aset harus memiliki identitas visual sendiri dan asal/lisensi yang tercatat. Ukuran arena kecil, sehingga pemain bisa memahami lokasi panggung dan area penonton dengan cepat.

Avatar dapat berjalan pada area yang diizinkan. Saat mendapat giliran, avatar menuju panggung secara otomatis; kontrol gerak beralih ke kontrol menjawab. Input angka atau tombol submit tidak boleh sekaligus menggerakkan avatar. Kamera harus menjaga soal dan keypad tetap terbaca; animasi panggung tidak boleh memakan waktu dari timer yang sedang berjalan tanpa aturan yang jelas.

Pemain lain perlu melihat representasi anggota room yang benar. Sinkronisasi posisi dan animasi adalah bagian dari uji kelayakan transport, bukan bukti yang boleh digantikan avatar dekoratif statis.

**Acceptance:** dari HP, avatar bisa berjalan di area penonton dan berpindah ke panggung pada giliran yang benar; penonton pada browser berbeda melihat pemain utama yang sama.

## 6. Requirement pertandingan dan penilaian

### REQ-007 — Struktur giliran dan ronde

**Sumber:** K-01, K-09, K-13, K-20.

Pertandingan memiliki maksimal empat ronde utama. Dalam setiap ronde, masing-masing pemain yang masih berhak ikut mendapat maksimal satu giliran utama. Jumlah giliran tidak selalu 32: 32 adalah batas ketika delapan pemain tetap aktif selama empat ronde.

Sistem menyimpan urutan giliran dan daftar peserta ronde, bukan menebaknya dari urutan render atau koneksi jaringan. Jadwal harus konsisten pada semua klien. Pemain gugur tidak mendapatkan giliran kompetitif pada ronde berikutnya.

Kebijakan pengacakan/rotasi urutan belum dipilih; rekomendasinya ada di OD-05. Jangan menjanjikan keadilan penuh hanya dengan menyamakan rentang angka, sebab posisi giliran dan pembahasan sebelumnya juga memberi pengalaman berbeda.

**Acceptance:** tidak ada pemain memperoleh dua giliran utama dalam ronde yang sama, dan tidak ada perpindahan giliran ganda akibat dua worker memproses deadline yang sama.

### REQ-008 — Instance soal dan batas informasi

**Sumber:** K-05, K-12, K-25; T integritas pertandingan.

Setiap giliran mempunyai instance soal yang dihasilkan dari template terversi, parameter, dan seed server. Instance menyimpan jawaban tepat dan pembahasan untuk server, serta representasi soal yang boleh dikirim ke pemain.

Soal penonton sama dengan soal pemain utama pada giliran itu. Soal giliran berikutnya tidak ditampilkan atau dikirim sebelum waktunya. Soal boleh memiliki angka berbeda antarpemain, dengan kompleksitas yang sebanding pada ronde yang sama.

Jangan mengirim `correctAnswer`, seluruh seed yang mengungkap soal mendatang, pembahasan, atau seluruh bank jawaban melalui snapshot publik, bundle client, source map, atau event sebelum giliran selesai. Kode tampilan boleh mengenal struktur soal, tetapi grading authoritative tetap berlangsung di server.

**Acceptance:** payload yang diterima peserta sebelum giliran selesai tidak mengandung kunci atau pembahasan yang belum waktunya dibuka.

### REQ-009 — Bentuk jawaban dan kesetaraan numerik

**Sumber:** K-06, K-25; T ketepatan matematika.

Jawaban akhir berupa nilai numerik. Minimal mendukung bilangan bulat, negatif, pecahan biasa, dan desimal dengan representasi yang jelas. Nilai setara harus diterima: `1/2`, `2/4`, `0,5`, dan `0.5` mempunyai nilai yang sama; `-1/2` setara dengan `-0,5`.

Grading menggunakan bilangan rasional tepat atau metode setara yang terbukti aman. Jangan mengandalkan kesamaan string atau toleransi floating point umum. Pembulatan tidak otomatis menjadi jawaban tepat: `0,3333` tidak setara dengan `1/3` kecuali suatu soal secara eksplisit meminta pembulatan; soal pembulatan belum termasuk scope awal.

Aturan penulisan yang diusulkan: spasi di tepi dibuang; koma dan titik diterima sebagai pemisah desimal, tanpa pemisah ribuan; pecahan dapat ditulis belum sederhana. Ekspresi seperti `1+1`, eksponen, persen, satuan, dan pecahan campuran seperti `1 1/2` bukan jalur input awal. Usulan grammar dan batas input perlu dicatat sebagai kontrak sebelum parser dibuat.

Input kosong, malformed, atau denominator nol merupakan kesalahan format: beri petunjuk untuk memperbaiki, dengan timer tetap berjalan. Menghukum format sebagai jawaban salah belum dipilih pengguna; default yang direkomendasikan adalah tidak menghabiskan nyawa sampai ada submit nilai valid atau timeout.

**Acceptance:** pecahan setara dinilai benar; tanda negatif dan nilai nol ditangani benar; `NaN`, `Infinity`, pembagian nol, input sangat panjang, dan kode JavaScript tidak pernah dieksekusi atau menyebabkan crash.

### REQ-010 — Timer giliran 30 detik

**Sumber:** K-14, K-21; T sumber waktu.

Satu giliran memberi maksimal 30 detik untuk membaca, menghitung, dan mengetik. Waktu authoritative berasal dari server melalui `startsAt` dan `deadlineAt`. Jam, refresh, background tab, atau animasi client tidak dapat menambah waktu.

Timer dimulai pada fase menjawab yang telah siap, bukan saat transisi berjalan menuju panggung. Server harus memiliki aturan eksplisit kapan soal dirilis dan kapan jawaban diterima. Usulan batas teknis: `receivedAt < deadlineAt` diterima; tepat pada atau setelah deadline diproses sebagai terlambat. Aturan ini harus sama pada semua jalur transport.

Client menghitung tampilan sisa waktu berdasarkan offset waktu server dan melakukan resync saat kembali dari background. Countdown tidak boleh tampak berhenti padahal waktu server sudah lewat. Putus koneksi tidak menjeda timer.

**Acceptance:** mengubah jam HP atau menahan timer UI tidak memberi keuntungan; submit pada batas deadline mempunyai hasil konsisten dan tidak beradu menjadi dua hasil.

### REQ-011 — Submit final dan transaksi hasil

**Sumber:** K-06, K-08, K-11; T integritas transaksi.

Setelah jawaban bernilai valid dikunci, giliran pemain utama selesai: server menilai tepat/salah dan membuat satu hasil final. UI perlu membuat sifat final tombol tersebut jelas. Detail submit final ini merupakan turunan dari konsekuensi salah yang langsung mengurangi nyawa, bukan kesempatan mencoba tanpa batas dalam 30 detik.

Menekan submit berulang, retry setelah jaringan gagal, dan replay request yang sama harus idempotent. Satu giliran kompetitif hanya menghasilkan satu perubahan skor dan paling banyak satu pengurangan nyawa. Server memeriksa session, room, match, turn, peran, deadline, dan state version. Payload client tidak boleh menentukan `correct`, skor, bonus, atau jumlah nyawa.

Jika response hilang, client menanyakan state atau mengirim ulang request dengan idempotency key yang sama. Jangan membuka jawaban kedua hanya karena request pertama belum mendapat response.

**Acceptance:** jawaban dan timeout yang diproses bersamaan tetap menghasilkan satu outcome; payload berbeda dengan idempotency key yang sudah dipakai tidak mengganti jawaban sebelumnya.

### REQ-012 — Nyawa dan eliminasi

**Sumber:** K-08, K-11.

Pemain memulai pertandingan baru dengan tiga nyawa. Jawaban valid yang salah atau waktu giliran habis mengurangi tepat satu nyawa. Jawaban benar tidak menambah atau mengurangi nyawa. Nyawa tidak boleh negatif atau kembali penuh karena refresh.

Nyawa nol mengubah pemain menjadi gugur dari persaingan utama. Dia tetap berada dalam pengalaman room dan dapat mengerjakan latihan privat. Hasil latihan tidak menghidupkan kembali pemain dan tidak mengubah hasil kompetisi.

Pengunduran diri atau koneksi habis masa tenggang tidak boleh disamakan dengan kehilangan seluruh nyawa tanpa keputusan kebijakan pada OD-03/OD-04.

**Acceptance:** tiga kesalahan pada tiga giliran berbeda menghasilkan eliminasi tepat sekali; kesalahan penonton tidak mengubah nyawa siapa pun.

### REQ-013 — Skor dan bonus kecepatan

**Sumber:** K-10, K-11; rumus rinci pada OD-01.

Jawaban benar menghasilkan 100 poin ditambah bonus kecepatan dalam rentang 0–20. Jawaban salah/timeout menghasilkan nol poin untuk giliran itu, dengan pengurangan nyawa sesuai REQ-012. Skor total adalah jumlah score event sah pemain tersebut pada match itu.

Bonus harus dihitung server, monoton terhadap waktu menjawab, deterministik, dan tidak bergantung pada kecepatan render, angka yang dikirim client, atau waktu animasi. Latihan penonton tidak menghasilkan skor kompetitif.

Rumus bonus linear dengan pembulatan ke integer terdekat sudah dikonfirmasi pengguna; lihat OD-01 dan catatan implementasi. Bonus 20 bukan alasan menjamin pemain tercepat pada jaringan berbeda selalu terukur tanpa bias latensi.

**Acceptance:** satu giliran benar memberi 100–120 poin; tidak ada bonus di luar rentang, bonus pada jawaban salah, poin penonton, atau penambahan karena retry.

### REQ-014 — Kesulitan setara dan meningkat

**Sumber:** K-12, K-25.

Setiap ronde memakai level kesulitan bersama. Variasi antarpemain harus mempertahankan jumlah langkah, jenis operasi, ukuran angka, kompleksitas pecahan, panjang bacaan, dan kompleksitas penulisan jawaban yang sebanding.

Jangan memberikan soal lebih mudah secara diam-diam kepada pemain yang tertinggal. Adaptasi personal belum dipilih dan akan mengganggu perbandingan skor. Kesulitan meningkat antar-ronde melalui template yang tervalidasi, bukan melalui angka acak tanpa batas.

Pemetaan ronde dan batas angka pada OD-05 adalah rancangan awal. Sebelum dipakai, setiap family perlu diperiksa untuk keterbacaan dan kelayakan 30 detik.

**Acceptance:** seluruh peserta pada ronde yang sama berasal dari difficulty band yang sama; tidak ada seed yang menghasilkan pembagian nol, soal ambigu, atau jawaban yang tidak bisa dimasukkan lewat keypad.

### REQ-015 — Latihan privat penonton

**Sumber:** K-07, K-08.

Pemain yang belum mendapat giliran dan pemain gugur dapat mengerjakan soal yang sedang berlangsung melalui input privat mereka sendiri. Pemain utama mempunyai input kompetitif; peran ini ditentukan server.

Jawaban penonton tidak dipublikasikan, tidak ditampilkan sebagai petunjuk, tidak menutup giliran, dan tidak memengaruhi skor, bonus, atau nyawa pertandingan. Penonton melihat hasil latihannya sendiri ketika pembahasan dibuka, sesuai pembatasan informasi REQ-008.

Konsekuensi dari alur yang dipilih: jendela latihan penonton berakhir ketika giliran pemain utama selesai, meskipun belum mencapai 30 detik. Ini mengikuti aturan pembahasan setelah setiap giliran. Memberi waktu tambahan kepada penonton setelah kunci dibuka akan menjadi perubahan aturan dan belum dipilih.

**Acceptance:** dua penonton dapat mengirim jawaban berbeda tanpa saling melihat; jawaban penonton tercepat tidak menyelesaikan giliran utama.

### REQ-016 — Pembahasan lima detik

**Sumber:** K-15.

Setelah pemain utama menjawab atau timeout, tampil jawaban benar dan langkah singkat selama lima detik. Berlaku juga jika pemain utama menjawab benar. Ronde/giliran berikutnya tidak boleh dimulai sementara fase pembahasan masih aktif menurut server.

Pembahasan harus dihitung dari instance soal yang sama dan menunjukkan operasi yang relevan. Rumus umum yang tidak cocok dengan angka soal tidak memenuhi requirement. Desain isi harus cukup singkat untuk dibaca dalam lima detik dan dapat memperlihatkan hasil latihan privat tanpa mengumumkan jawaban privat peserta lain.

Review pembahasan lengkap sesudah match belum menjadi fitur yang disetujui. Jika lima detik ternyata tidak cukup secara uji pengguna, catat temuan dan bahas perubahan durasi/perilaku; jangan diam-diam memperpanjangnya.

**Acceptance:** pada jawaban benar, salah, dan timeout, pembahasan yang sesuai tetap muncul; fase berlangsung lima detik menurut deadline server.

### REQ-017 — Penyelesaian ronde dan akhir lebih awal

**Sumber:** K-09, K-13, K-20.

Evaluasi apakah pertandingan berakhir dilakukan setelah ronde lengkap selesai beserta pembahasan yang wajib. Jangan memberi kemenangan ketika pemain lain gugur di tengah ronde sementara ada peserta yang belum memperoleh giliran ronde itu.

Pada checkpoint akhir ronde:

1. Jika tersisa tepat satu peserta yang masih bertahan, dia menang dan match selesai.
2. Jika semua peserta gugur, match selesai dan skor menentukan hasil sesuai REQ-018/REQ-019.
3. Jika masih ada lebih dari satu dan ronde belum mencapai empat, lanjutkan ke ronde berikutnya.
4. Setelah ronde keempat, hentikan ronde utama dan tentukan hasil.

Peserta yang masih bertahan berarti belum gugur dan belum berstatus keluar/forfeit sesuai kebijakan yang nanti dipilih. Koneksi terputus sementara tidak langsung berarti gugur.

**Acceptance:** skenario tinggal satu di tengah ronde tetap menyelesaikan hak giliran peserta ronde; tidak ada ronde kelima utama.

### REQ-018 — Penentuan hasil utama

**Sumber:** K-09, K-11, K-20.

Pemain terakhir yang bertahan pada checkpoint ronde menjadi juara. Bila semua gugur, gunakan skor tertinggi peserta yang memenuhi syarat. Bila beberapa pemain bertahan sampai batas empat ronde, gunakan skor tertinggi sesuai keputusan pertandingan berbasis hasil yang dipilih dalam wawancara.

Pada kasus semua gugur, pemain dengan nyawa nol tetap dapat menjadi kandidat berdasarkan skor dan mengikuti penentuan seri bila diperlukan. Ini konsekuensi aturan all-eliminated, bukan pemberian nyawa baru atau giliran utama tambahan. Jangan memfilter seluruh kandidat hanya karena nyawa mereka nol.

Eligibility pemain yang sengaja keluar atau habis masa reconnect masih OD-03/OD-04. Jangan menghilangkan peserta dari sejarah ronde atau menjadikan pemain keluar sebagai pemenang hanya karena record dihapus.

Hasil akhir harus menyatakan alasan selesai: batas ronde, satu bertahan, semua gugur, atau penyelesaian penentuan seri. Penentuan hasil tidak dilakukan dengan urutan array client atau nilai leaderboard yang belum diperbarui.

**Acceptance:** penentuan hasil sama pada semua browser dan dapat dihitung kembali dari hasil giliran sah serta kebijakan eligibility yang terversi.

### REQ-019 — Satu soal penentuan seri

**Sumber:** K-16.

Jika skor tertinggi yang relevan seri, hanya peserta seri tersebut mengikuti satu soal penentuan. Mereka mendapat soal yang sama dan menjawab secara bersamaan, maksimal 30 detik. Jawaban benar tercepat menang. Jika tidak ada pemenang tunggal, hasilnya juara bersama.

Jangan membuka loop sudden death tanpa batas, mengadakan ronde utama kelima, atau memakai soal berbeda untuk peserta penentuan. Peserta lain tetap penonton dan jawabannya tidak memengaruhi hasil.

Ambang waktu yang dianggap seri, penyelesaian bila peserta penentuan putus koneksi, serta apakah angka skor/nyawa utama tetap ditampilkan tanpa perubahan perlu dipertegas sebelum bagian ini final; lihat OD-02 dan OD-03. Penentuan seri tidak boleh diubah menjadi adu cepat request tanpa mempertimbangkan aturan waktu dan latensi yang dinyatakan.

**Acceptance:** tidak lebih dari satu soal penentuan; semua salah berakhir juara bersama; pemenang tunggal mensyaratkan jawaban benar dan waktu tercepat yang sah.

### REQ-020 — Putus koneksi dan reconnect

**Sumber:** K-21; T pemulihan identitas.

Pertandingan tidak dijeda ketika satu pemain putus koneksi. Kesempatan tersambung kembali adalah 60 detik. Timer giliran yang sedang berjalan tetap 30 detik; jika habis tanpa jawaban sah, kehilangan satu nyawa.

Reconnect yang sah mengembalikan identitas pemain, skor, nyawa, role, dan snapshot terbaru. Jangan memutar ulang animasi atau countdown lama sebagai state pertandingan aktif. Refresh dan perubahan tab perlu memakai logika rekonsiliasi yang sama.

Deteksi heartbeat, grace period, dan deadline giliran adalah konsep yang berbeda. Jangan menghitung 60 detik dari timeout soal bila disconnect sebenarnya terjadi pada waktu lain. Usulan deteksi, perlakuan setelah 60 detik, dan kasus semua pemain offline dicatat pada OD-03.

**Acceptance:** reconnect dalam jendela yang diizinkan tidak menciptakan slot baru; jawaban yang sudah diterima sebelum putus tidak hilang atau dinilai dua kali; grace period tidak memberi tambahan waktu soal.

### REQ-021 — Emote dan pesan preset

**Sumber:** K-18.

Komunikasi memakai daftar emote/pesan yang ditentukan produk, misalnya “Semangat!”, “Mantap!”, dan “Main lagi?”. Tidak ada input chat bebas atau voice chat pada versi pertama.

Saat soal aktif, komunikasi dibatasi agar tidak mengganggu atau menjadi saluran jawaban. Usulan paling sederhana: nonaktifkan pesan teks preset dan emote yang mengandung informasi jawaban selama fase menjawab; gunakan reaksi noninformatif hanya jika tidak menutupi UI. Detail katalog dapat dipilih saat desain selama memenuhi batas ini.

Event emote harus terikat anggota room, dibatasi frekuensinya, dan tidak menerima string pesan sembarang dari client.

**Acceptance:** mengirim payload pesan bebas tidak membuat teks tersebut muncul pada browser peserta lain; spam emote tidak menghalangi soal atau submit.

## 7. Requirement sistem dan kualitas

### REQ-022 — Multiplayer nyata dan kapasitas awal

**Sumber:** K-02, K-22.

Target uji adalah dua room masing-masing delapan peserta bersamaan. Kedua room harus terisolasi: pertanyaan, timer, urutan, skor, nyawa, emote, jawaban privat, dan hasil tidak menyeberang room.

Multiplayer berarti browser/session independen berbagi state server. Avatar tambahan dekoratif, delapan tab yang mengandalkan satu localStorage, atau bot yang diberi label manusia tidak memenuhi requirement.

Uji 16 klien otomatis adalah bukti fungsional/beban terkontrol, bukan bukti bahwa 16 siswa nyata sudah mencoba. Uji perangkat nyata dan pengamatan kegunaan dilaporkan terpisah.

**Acceptance:** dua pertandingan lengkap dapat diselesaikan secara bersamaan dengan 16 session terpisah dan hasil konsisten, termasuk ketika satu room mengalami reconnect atau penentuan seri.

### REQ-023 — Server sebagai otoritas

**Sumber:** T untuk K-02, K-08, K-11, K-14, K-21.

Server menjadi otoritas untuk membership, hak host, fase pertandingan, urutan giliran, soal, jawaban benar, timestamp, grading, skor, nyawa, eligibility, dan pemenang. Client hanya mengirim intent, menampilkan state, dan melakukan prediksi visual yang dapat dikoreksi.

Gerak avatar dapat memakai interpolasi dan prediksi lokal dengan batas arena. Gerak tidak memberi hak menjawab, tidak mengubah skor, dan tidak menentukan pemain utama. Posisi visual avatar tidak boleh menjadi kontrol akses.

**Acceptance:** modifikasi payload untuk skor, timestamp, role, nyawa, room ID, atau turn ID tidak dapat menghasilkan perubahan state yang tidak sah.

### REQ-024 — State bersama, konsistensi, dan pemulihan

**Sumber:** T untuk multiplayer dan reconnect.

State authoritative harus tersedia bagi semua instance server yang melayani room tersebut. Map/global variable pada satu process/Worker atau localStorage saja tidak cukup untuk hosting dengan beberapa isolate atau restart.

Setiap transisi penting memerlukan mekanisme atomik atau concurrency control yang terbukti. Hasil answer, timeout, pengurangan nyawa, skor, dan perpindahan fase tidak boleh terpisah menjadi pembaruan yang dapat beradu tanpa rekonsiliasi.

Deadline disimpan sebagai timestamp yang dapat dipulihkan. `setTimeout` in-memory boleh membantu scheduling, tetapi bukan satu-satunya sumber kebenaran. Rancangan harus menjelaskan apa yang terjadi ketika process restart, koneksi event putus, atau server bangun setelah deadline.

**Acceptance:** dua eksekutor yang menerima submit/timeout bersamaan tidak menambah hasil ganda; restart tidak mengembalikan waktu, mengulang pertanyaan, atau menghapus identitas match secara diam-diam.

### REQ-025 — Privasi sesi dan pembatasan data

**Sumber:** K-07, K-19; T perlindungan data dan integritas.

Kumpulkan hanya data yang diperlukan untuk sesi tamu. Tidak perlu email, nomor telepon, nama sekolah, tanggal lahir, atau identitas orang tua. Nama panggilan merupakan teks tidak tepercaya dan harus ditampilkan secara aman.

Jawaban privat penonton hanya bisa diakses pemiliknya dan server yang memprosesnya, lalu hasil terkait ditampilkan sesuai fase. Snapshot anggota lain tidak membawa token sesi, answer draft, nilai input privat, atau data operasional sensitif.

Kode room tidak menggantikan autentikasi aksi. Token reconnect/member tidak boleh dicatat sebagai data biasa dalam log, disisipkan ke URL publik, atau dikirim kepada semua anggota room. Retensi log dan room harus dibatasi serta dijelaskan.

**Acceptance:** pemeriksaan payload, log, dan browser lain tidak menemukan token atau jawaban privat yang bukan haknya.

### REQ-026 — Keterbacaan, aksesibilitas, dan performa

**Sumber:** K-03, K-06, K-24; angka berikut adalah target teknis awal.

Target viewport QA minimum: 360×640, 390×844, dan laptop 1366×768 CSS px. Uji area aman dan tampilan ketika ukuran layar berubah. Portrait adalah rancangan awal yang direkomendasikan; cakupan orientation final dicatat sebelum rilis.

Target kontrol sentuh utama minimal 44×44 CSS px. Teks, tanda minus, garis pecahan, timer, nyawa, dan tombol submit harus terbaca; status benar/salah tidak hanya memakai warna. UI penting memakai semantik yang sesuai agar dapat difokuskan/dibaca, dengan keterbatasan canvas dijelaskan secara jujur.

Target performa awal: frame rate stabil sekurang-kurangnya sekitar 30 FPS pada perangkat Android referensi yang kemudian ditetapkan, input tidak tertahan oleh render, dan tidak ada penurunan memori terus-menerus ketika berganti pertandingan. Catat model perangkat, browser, scene, durasi, serta metode ukur; angka FPS tanpa konteks bukan bukti.

Gunakan geometri dan material yang sesuai HP, batasi draw call serta efek, dan bersihkan resource saat unmount/keluar room. Jangan mengganti avatar berjalan menjadi gambar diam semata-mata untuk memenuhi target performa tanpa membahas perubahan produk.

**Acceptance:** tidak ada tumpang tindih UI yang menghalangi alur inti pada viewport target; keterbatasan hardware atau browser dilaporkan bersama bukti.

### REQ-027 — Error, retry, dan state yang bisa dipahami

**Sumber:** T untuk akses, submit, dan koneksi.

UI perlu membedakan kode room tidak ditemukan, room penuh, sesi tidak sah, belum cukup pemain, soal belum aktif, input belum valid, submit sedang diproses, jawaban sudah terkunci, koneksi mencoba kembali, dan match sudah selesai.

Respons error tidak boleh membuat client menganggap skor berhasil ditulis ketika server menolak. Tombol retry tidak boleh membuat room/session/answer ganda. Hilangnya WebGL perlu ditampilkan sebagai keterbatasan kemampuan perangkat, bukan layar kosong atau klaim game sedang berjalan.

Jika server tidak bisa dihubungi, tampilkan status dan upaya pemulihan; jangan mengganti pertandingan menjadi simulasi lokal sambil tetap mengklaim online.

**Acceptance:** pemain mengetahui apakah jawaban sudah diterima, sedang dikonfirmasi, atau terlambat; retry mengikuti identitas request yang benar.

### REQ-028 — Biaya dan ketergantungan

**Sumber:** K-23, K-25.

Utamakan layanan yang telah tersedia dan opsi tanpa biaya tambahan. Jangan memakai API LLM, generator model berbayar, paket aset berbayar, atau langganan baru tanpa pembahasan kebutuhan dan biaya sebelumnya.

Pilihan free tier bukan bukti biaya nol untuk selamanya. Sebelum memilih transport, estimasikan jumlah koneksi, request, read/write state, bandwidth, penyimpanan, dan cleanup pada dua room penuh serta durasi match maksimum. Polling dan sinkronisasi gerak dapat menghabiskan kuota walaupun kapasitas pemain kecil.

Gameplay dan generation soal tidak boleh membutuhkan key AI di browser. Versi dependency, lisensi, sumber aset, dan build yang dipakai dicatat agar audit dapat diulang.

**Acceptance:** game dapat memainkan match tanpa API inference runtime; layanan tambahan berbayar tidak diaktifkan diam-diam; keterbatasan kuota/hosting dinyatakan.

### REQ-029 — Validasi konten matematika

**Sumber:** K-05, K-12, K-25.

Setiap template menyimpan ID, versi, topik, difficulty band, rentang parameter, kondisi valid, format prompt, perhitungan jawaban tepat, dan pembahasan. Template harus mempunyai contoh normal, batas, dan contoh input setara.

Generator tidak boleh menghasilkan pembagian nol, denominator nol, jawaban di luar kemampuan input, teks ambigu, atau langkah pembahasan yang tidak sesuai hasil. Seed tidak boleh mengubah difficulty band di luar kontrak template. Variasi angka bukan jaminan unik atau seimbang; kedua aspek perlu diperiksa.

Lakukan pemeriksaan matematis independen terhadap fungsi generator/solver. Test yang membandingkan hasil dengan fungsi solver yang sama tidak cukup untuk membuktikan kebenaran.

**Acceptance:** family lolos pemeriksaan nilai tepat, pembahasan, seed batas, dan keterbacaan. Penggunaan LLM untuk membantu menulis draft template tidak menggantikan verifikasi sebelum template masuk game.

### REQ-030 — Bukti sebelum klaim selesai

**Sumber:** T untuk hasil yang diminta dan target K-22.

Klaim game selesai memerlukan build/check yang sesuai stack, pengujian aturan dan matematika, alur multiplayer browser independen, bukti mobile, screenshot fase yang relevan, serta uji dua room. Screenshot saja tidak membuktikan multiplayer, dan build yang berhasil tidak membuktikan gameplay.

Bukti diberi tanggal, versi/commit, konfigurasi, serta status pass/fail/not-run. Jika preview atau browser QA tidak tersedia, nyatakan batas verifikasinya; jangan mengubah not-run menjadi pass atau mengklaim perangkat nyata diuji melalui emulasi viewport saja.

**Acceptance:** reviewer dapat mereproduksi setidaknya alur inti dari petunjuk dan artefak yang diberikan. Rincian pemeriksaan berada pada [code-review-spec.md](code-review-spec.md).

### REQ-031 — Pencegahan drift dan ketertelusuran

**Sumber:** permintaan pengguna untuk PRD rinci dan spec code review.

Setiap perubahan substansial mencantumkan requirement yang disentuh, perilaku sebelum/sesudah, serta bukti yang relevan. Jangan menandai semua requirement sebagai selesai hanya karena satu scaffold berhasil dibuka.

Perubahan K memerlukan catatan persetujuan produk. Perubahan solusi teknis yang tetap memenuhi K/REQ dapat dipilih implementer dan dicatat beserta alasan serta validasinya. Jangan menyamakan usulan OD dengan keputusan yang sudah disetujui.

**Acceptance:** reviewer dapat memetakan perubahan kode ke requirement; setiap pengecualian perilaku terlihat dalam dokumen, bukan tersembunyi sebagai TODO.

### REQ-032 — Batas proyek dan reuse

**Sumber:** tujuan produk dan scope; observasi workspace.

Workspace yang diperiksa mempunyai proyek `saasmath` dengan AGENTS yang mendeskripsikan PWA latihan matematika kelas 4–6 SD. Produk itu berbeda dari Math Bee SMP yang diminta. Dokumen ini tidak mengotorisasi perubahan kurikulum, login, database, atau flow aplikasi tersebut.

Rekomendasi awal adalah mengisolasi proyek Math Bee SMP. Reuse modul yang terbukti sesuai dapat dinilai kemudian, dengan tetap mempertahankan scope SMP dan aturan multiplayer. Pilihan integrasi ke aplikasi lama belum dibuat.

**Acceptance:** implementasi tidak merombak aplikasi SD atau menjadikannya baseline produk ini tanpa keputusan integrasi yang jelas.

## 8. Alur pengguna dan state machine

### 8.1 Alur pemain

1. Buka webapp dan periksa kesiapan grafis/koneksi.
2. Isi nama panggilan, pilih avatar, buat room atau masukkan kode.
3. Masuk lobi; lihat peserta dan status kesiapan.
4. Pertandingan dimulai setelah jumlah peserta dan syarat start valid.
5. Tunggu giliran sambil bergerak pada area penonton dan mengikuti latihan privat.
6. Saat giliran, avatar menuju panggung dan input menjawab menjadi fokus.
7. Baca soal dan kunci jawaban dalam 30 detik.
8. Lihat hasil utama, hasil latihan privat sendiri, dan pembahasan selama 5 detik.
9. Lanjut giliran/ronde sesuai state server; pemain gugur tetap ikut latihan.
10. Selesaikan match atau satu soal penentuan bila diperlukan.
11. Lihat hasil sesi. Opsi rematch merupakan usulan alur OD-04, bukan progres permanen.

### 8.2 State authoritative yang direkomendasikan

```text
LOBBY
  -> MATCH_PREPARING
  -> ROUND_PREPARING
  -> TURN_TRANSITION
  -> TURN_OPEN (maksimal 30 detik)
  -> TURN_RESOLVED
  -> FEEDBACK (5 detik)
  -> [TURN_TRANSITION untuk peserta berikutnya]
  -> ROUND_COMPLETE
      -> ROUND_PREPARING jika lanjut
      -> TIEBREAK_OPEN jika hasil tertinggi seri
      -> RESULTS jika pemenang sudah tunggal

TIEBREAK_OPEN (satu soal, maksimal 30 detik)
  -> TIEBREAK_RESOLVED
  -> RESULTS (satu juara atau juara bersama)
```

`MATCH_PREPARING` dan `TURN_TRANSITION` menyiapkan scene/input. Keduanya tidak boleh mencuri jatah 30 detik. Durasi animasi bukan aturan kompetisi. State `ABORTED` diperlukan untuk kegagalan yang tidak memungkinkan pertandingan diteruskan; alasan dan eligibility hasilnya ditentukan sebelum rilis.

UI client boleh mempunyai state tambahan seperti loading, submitting, reconnecting, dan reduced motion. State UI tersebut tidak menggantikan fase pertandingan server.

### 8.3 Invariant yang harus selalu benar

1. Satu room mempunyai paling banyak satu match aktif.
2. Pada giliran utama, tepat satu peserta mempunyai hak submit kompetitif.
3. Penentuan seri mempunyai beberapa peserta kompetitif, tetapi hanya satu instance soal bersama.
4. Pada ronde utama, giliran dan penentuan seri tidak aktif bersamaan.
5. Nyawa berada dalam 0–3; setiap penalti terkait satu outcome yang dapat ditelusuri.
6. Skor hanya berasal dari outcome kompetitif sah; satu jawaban benar bernilai 100–120.
7. Jawaban privat penonton tidak memengaruhi invariant 5–6.
8. Question instance dan outcome yang sudah final tidak berubah karena retry.
9. Tidak ada ronde utama kelima atau penentuan seri kedua.
10. Semua klien yang sudah merekonsiliasi versi sama melihat fase, giliran, dan hasil publik yang sama.
11. Koneksi putus tidak mengubah deadline giliran.
12. Room lain tidak dapat membaca atau mengubah state room ini.

## 9. Model data dan kontrak komunikasi konseptual

Bagian ini mendeskripsikan tanggung jawab data. Nama tabel, URL endpoint, framework, dan transport belum merupakan pilihan final.

### 9.1 Entitas minimum

| Entitas | Field/tanggung jawab minimum | Batas publikasi |
| --- | --- | --- |
| GuestSession | identitas opaque, expiry, credential/session binding | Credential rahasia; bukan bagian snapshot publik. |
| Room | ID, kode, host, fase lobi, kapasitas, version | Anggota hanya melihat room yang berhak diakses. |
| Membership | player ID, nickname, avatar, role, join order | Nickname/avatar/status dapat terlihat oleh anggota. |
| Match | ID, participants, maxRounds=4, policyVersion, status, result | Hasil/fase publik; state internal dibatasi. |
| Round | index, difficultyBand, roster, turn order | Jangan memublikasikan soal berikutnya. |
| Turn | actor, question ID, startsAt, deadlineAt, outcome, feedbackEndsAt | Kunci dan pembahasan dibuka sesuai fase. |
| QuestionInstance | template/version, parameter, prompt, expected rational, steps | Expected value dan steps privat sampai waktunya. |
| Submission | actor, role, raw/normalized value, server time, request key | Input penonton privat; batasi log data mentah. |
| ScoreEvent | match/player/turn, base, bonus, reason, policy version | Dapat dihitung ulang dan tidak ditulis client. |
| Presence | lastSeen/disconnectedAt/graceUntil | Jangan disamakan dengan life count. |
| Tiebreak | candidate IDs, shared question, timing, result | Satu babak; privasi jawaban mengikuti fase. |
| Result | reason, winners, ranks/scores, completion timestamp | Final berdasarkan server dan eligible roster. |

### 9.2 Intent client yang dibutuhkan

- Membuat room, bergabung, meninggalkan room, dan memperoleh snapshot yang berhak diakses.
- Memulai match oleh peran yang sah.
- Mengirim jawaban dengan match/turn ID dan idempotency key.
- Mengirim jawaban latihan privat; server tetap menentukan apakah pengirim pemain utama atau penonton.
- Memperbarui presence/reconnect dan gerak avatar yang dibatasi.
- Mengirim ID emote/pesan preset yang diizinkan.

Client tidak mengirim kebenaran soal, jumlah skor yang harus ditambahkan, nyawa baru, status menang, atau timestamp yang harus dipercaya sebagai waktu submit.

### 9.3 Event dan rekonsiliasi

Event penting sekurang-kurangnya meliputi membership/presence berubah, match dimulai, ronde dimulai, giliran dibuka, submit diakui, giliran diselesaikan, pembahasan dibuka, ronde selesai, penentuan seri dibuka/diselesaikan, serta hasil akhir.

Envelope event membawa `roomId`, `matchId` bila relevan, ID/sequence/version, jenis event, dan timestamp server. Klien mengabaikan event lama/ganda dan meminta snapshot ketika menemukan gap. Snapshot publik dan hasil privat harus memiliki batas serialisasi yang terpisah.

Event submit sebelum giliran ditutup boleh mengabarkan status telah terkunci jika diperlukan, tetapi tidak membocorkan nilai jawaban atau kebenarannya. Hasil privat tidak disiarkan melalui room broadcast.

### 9.4 Operasi atomik penting

- Join dan pemeriksaan kapasitas.
- Start match dan pembekuan roster.
- Penerimaan submit, finalisasi outcome, skor/penalti, serta fase feedback.
- Timeout yang beradu dengan submit.
- Menyelesaikan ronde dan memutuskan ronde berikutnya/hasil.
- Menentukan penentuan seri serta hasil final.
- Mengembalikan sesi yang reconnect tanpa menggandakan membership.

Pilihan transaksi, compare-and-swap, event log, atau coordinator harus dibuktikan pada hosting yang dipakai. Menggunakan database tidak otomatis membuat rangkaian operasi ini atomik.

## 10. Konten dan parser: spesifikasi awal

### 10.1 Usulan progression empat ronde — belum keputusan final

| Ronde | Family yang direkomendasikan | Batas desain |
| --- | --- | --- |
| 1 | Bilangan bulat, operasi langsung dan tanda sederhana | Bacaan pendek; hindari beban mengetik berlebihan. |
| 2 | Bilangan negatif dan urutan operasi singkat | Bandingkan jumlah langkah dan kompleksitas tanda. |
| 3 | Pecahan dengan denominator yang dapat dihitung siswa | Jawaban tepat dapat diketik sebagai pecahan/desimal tepat. |
| 4 | Kombinasi materi atau soal cerita pendek | Tetap layak 30 detik; peningkatan kesulitan terkontrol. |

Tabel merupakan rekomendasi OD-05. Jumlah template, rentang angka, dan pemetaan topik perlu ditetapkan setelah contoh dan uji keterbacaan; jangan mengklaim bank sudah tersedia.

### 10.2 Contoh pemeriksaan numerik wajib

| Expected | Input | Hasil yang diharapkan |
| --- | --- | --- |
| 1/2 | `2/4`, `0,5`, `0.5` | Benar. |
| -1/2 | `-2/4`, `-0,5` | Benar. |
| 0 | `0`, `0/7`, `0,0` | Benar. |
| 3/2 | `3/2`, `1,5` | Benar. |
| 1/3 | `0,3333` | Salah sebagai nilai tepat; tidak dianggap pembulatan sah. |
| Nilai apa pun | kosong, `1/0`, `NaN`, `Infinity`, script | Format ditolak secara aman; timer tetap berjalan. |
| 2 | `1+1` | Ditolak sebagai ekspresi bila grammar awal disetujui. |

Grammar final harus menjelaskan minus Unicode, whitespace, sign pada denominator, leading zero, batas panjang, dan banyak digit desimal. Itu kontrak implementasi yang harus tertulis dan diuji; jangan membiarkan perilakunya bergantung pada kebetulan `parseFloat`.

### 10.3 Pemeriksaan pembahasan

- Nilai akhir sama dengan expected rational yang diverifikasi independen.
- Langkah tidak mengubah tanda operasi, denominator, atau urutan operasi dari soal.
- Pecahan dapat disederhanakan dengan benar, termasuk kasus nol dan negatif.
- Kalimat soal cerita mempunyai satu interpretasi dan informasi yang cukup.
- Panjang pembahasan sesuai fase lima detik; notasi tidak terpotong di HP.
- Angka ditampilkan konsisten dengan format UI Bahasa Indonesia yang diusulkan.

## 11. Arsitektur yang direkomendasikan dan pembuktian hosting

### 11.1 Pilihan awal

- Bantuan pengembangan utama: **Three.js Game Skills**, berlisensi MIT pada snapshot riset.
- Client: TypeScript, Three.js, dan UI HTML/DOM untuk input serta informasi penting; Vite merupakan kandidat scaffold, bukan kewajiban hosting.
- Server: aturan pertandingan terpisah dari render, parser, dan transport. Identitas tamu, grading, scoring, dan coordinator room berjalan server-side.
- State bersama: penyimpanan/coordinator yang benar-benar tersedia pada hosting terpilih, dengan concurrency control dan deadline persisten.
- Makone dapat dijadikan referensi visual/pengujian tambahan bila berguna; tidak wajib menggabungkan beberapa harness atau menyalin seluruh repo.
- Godogen merupakan alternatif pengembangan yang relevan bila ada hambatan nyata pada pilihan utama; perubahan alat tidak boleh mengubah keputusan produk.

Belum dipilih: transport final, framework server final, provider state/coordinator, skema database, dan layanan deployment yang telah terverifikasi memenuhi multiplayer. Menetapkan stack karena nama repo populer saja tidak cukup.

### 11.2 Fakta platform yang sudah diperiksa

Panduan Sites yang dibaca menyebut server Cloudflare Workers, 128 MB per isolate, koneksi eksternal HTTP, serta resource D1/R2 yang dideklarasikan. Panduan identitas menyebut Site publik dapat menerima request anonim, sedangkan Site privat mewajibkan autentikasi.

Informasi tersebut tidak membuktikan bahwa WebSocket, SSE jangka panjang, Durable Objects, timer persisten, maupun binding tambahan tersedia melalui pipeline Sites yang dipilih. Jangan menyamakan kemampuan umum Cloudflare dengan dukungan yang sudah diperiksa pada Sites.

### 11.3 Spike kelayakan sebelum implementasi luas

Ketika pekerjaan implementasi kemudian diizinkan, lakukan pembuktian kecil terlebih dahulu:

1. Akses browser tamu tanpa login platform pada lingkungan yang sesuai.
2. Dua browser independen membaca state room bersama dan melakukan mutasi yang konsisten.
3. Deadline dan transisi tetap benar setelah request bersamaan dan restart yang dapat diuji.
4. Transport dapat membawa perubahan giliran, submit, presence, dan gerak avatar pada latensi yang layak.
5. Dua room terisolasi bekerja dengan 16 session dan estimasi penggunaan resource yang tercatat.
6. Ketergantungan dan biaya sesuai K-23.

Jika real-time channel tersedia, pilih mekanisme yang efisien untuk event dan gerak. Jika hanya HTTP polling yang terverifikasi, ukur latensi serta read/write/request aktual. Jangan memutuskan free tier cukup tanpa menghitung beban.

Jika hosting gagal memenuhi baseline, laporkan hambatan dan opsi. Tidak boleh mengganti multiplayer dengan bot, mewajibkan akun, menghapus gerak avatar, atau menambah layanan berbayar sebagai jalan pintas tanpa keputusan produk yang sesuai.

## 12. Open decisions dan asumsi yang belum disetujui

Bagian ini sengaja mempertahankan ketidakpastian. **Rekomendasi bukan keputusan K.** Pertanyaan produk berikutnya tetap diajukan satu per satu ketika pengguna melanjutkan penetapan detail.

### OD-01 — Rumus bonus kecepatan

**Status v0.2: disetujui pengguna.** Rumus linear di bawah menjadi kontrak final. Uraian ketidakpastian berikut mencatat keadaan saat v0.1; status ini menggantikannya.

- **Sudah pasti:** benar 100 poin; bonus kecepatan 0–20; dihitung server.
- **Belum pasti:** fungsi penurunan, pembulatan, dan presisi waktu.
- **Rekomendasi:** bonus linear dengan pembulatan ke bilangan bulat terdekat, dihitung dari elapsed yang diukur server.

```text
elapsedMs = acceptedAtServer - startsAt
remainingRatio = clamp((30_000 - elapsedMs) / 30_000, 0, 1)
bonus = floor(20 * remainingRatio + 0.5)
scoreForCorrect = 100 + bonus
```

Contoh usulan: elapsed 0 ms -> 120; 7.500 ms -> 115; 15.000 ms -> 110; 22.500 ms -> 105; 29.999 ms -> 100. Ini tidak mengizinkan input pada atau setelah deadline. Jawaban salah/timeout tetap 0.

- **Harus selesai sebelum:** scoring dinyatakan final dan test angka bonus dianggap kontrak produk.

### OD-02 — Definisi waktu seri dan detail penentuan

**Status v0.2: toleransi ≤100 ms disetujui pengguna.** Penentuan satu kali memakai waktu server dan kandidat eligible; jawaban benar dalam jendela 100 ms dari yang tercepat berbagi juara. Rincian V1 lainnya ada di catatan implementasi. Uraian historis di bawah bukan lagi penanda bahwa toleransi belum dipilih.

- **Sudah pasti:** satu soal bersama, serentak, 30 detik; benar tercepat; jika tidak tunggal, juara bersama.
- **Belum pasti:** toleransi kesamaan waktu dan kebijakan peserta penentuan yang offline.
- **Rekomendasi untuk dibahas:** waktu server dengan jendela seri kecil yang dinyatakan, misalnya 100 ms, guna menghindari klaim beda sangat kecil yang tidak stabil. Nominal 100 ms belum dipilih dan belum menjamin bebas bias jaringan.
- **Usulan tambahan:** penentuan hanya memutuskan pemenang, tanpa menambah ronde utama atau mengubah sejarah skor/nyawa utama. Tunggu semua kandidat selesai atau deadline sebelum membuka pembahasan.
- **Harus selesai sebelum:** penentuan seri diterima sebagai fitur final.

### OD-03 — Expiry reconnect dan semua pemain offline

**Status v0.2: expiry 60 detik menjadi forfeit disetujui pengguna.** Tidak eligible juara; histori skor tetap; late return sebagai penonton. Semua forfeit menghasilkan aborted tanpa juara. Deteksi heartbeat dan cleanup teknis dijelaskan di catatan implementasi.

- **Sudah pasti:** tidak pause; kembali dalam 60 detik; timer giliran 30 detik tetap berlaku.
- **Belum pasti:** deteksi disconnect, eligibility setelah 60 detik, partisipasi ronde berikutnya, late return, dan hasil jika semua offline.
- **Rekomendasi untuk dibahas:** setelah grace habis, tandai forfeit tanpa menghapus histori; late return menjadi penonton. Tentukan secara eksplisit apakah forfeit masih berhak menjadi juara ketika semua peserta habis nyawa. Untuk semua offline, gunakan expiry/abort yang terdokumentasi dan jangan mengarang pemenang.
- **Catatan:** tidak boleh memotong tiga nyawa sekaligus atau memberi giliran tambahan hanya karena memilih rekomendasi forfeit.
- **Harus selesai sebelum:** reconnect/keluar dan hasil pertandingan diklaim lengkap.

### OD-04 — Lifecycle room, host, dan rematch

**Status v0.2: host otomatis ke anggota aktif terlama disetujui pengguna.** Pilihan lifecycle V1 lainnya merupakan detail implementasi yang dicatat eksplisit: start manual, roster frozen, join baru ditolak saat match, rematch reset untuk peserta yang ikut.

- **Sudah pasti:** room berkode, 4–8 manusia, tanpa akun, skor sesi.
- **Belum pasti:** siapa berhak start, host keluar, join di tengah match, keluar sukarela, dan rematch.
- **Rekomendasi untuk dibahas:** pembuat room adalah host; start manual setelah valid; roster dibekukan; peserta baru menunggu match berikutnya; host yang keluar diganti anggota yang memenuhi syarat dengan aturan deterministik; rematch membuat match ID baru dan mereset skor/nyawa semua peserta yang ikut.
- **Harus selesai sebelum:** alur lobi/lifecycle dinyatakan final. Perilaku yang dipilih harus konsisten dengan minimum empat peserta dan eligibility hasil.

### OD-05 — Bank soal dan urutan pemain

**Status v0.2: bank awal V1 diimplementasikan.** Delapan family sesuai progression empat ronde diperiksa dengan 800 variasi oracle independen; urutan awal shuffle lalu rotasi. Validasi resmi kurikulum dan uji keterbacaan dengan siswa belum dilakukan. Rentang angka dapat dibaca pada source generator.

- **Sudah pasti:** materi kelas 7 bilangan bulat/pecahan, setara per ronde, meningkat bersama, maksimal 30 detik termasuk input.
- **Belum pasti:** jumlah template awal, batas parameter, mapping empat ronde, dan pengacakan/rotasi urutan.
- **Rekomendasi untuk dibahas:** progression pada bagian 10; beberapa family terverifikasi per band; urutan awal diacak server dan dirotasi antar-ronde. Hindari pengulangan soal identik dalam satu match jika variasi yang valid mencukupi.
- **Batas klaim:** rotasi empat ronde untuk delapan peserta tidak membuat semua pemain mengalami seluruh posisi; pembahasan sebelumnya tetap dapat memberi keuntungan belajar bagi giliran belakangan.
- **Harus selesai sebelum:** bank soal dan klaim keseimbangan dinyatakan siap untuk siswa.

### OD-06 — Transport, state, dan deployment

**Status v0.2: Sites dipilih eksplisit oleh pengguna.** Client React/Three, Worker ESM, D1 CAS, dan polling HTTP telah diimplementasikan serta diuji dengan SQLite lokal. Source push, deklarasi/migrasi D1 hosted, dan akses tamu produksi masih terhalang proxy/VPN dan belum terverifikasi.

- **Jenis:** ketidakpastian teknis yang dapat diselesaikan lewat pembuktian; keputusan pengguna baru diperlukan jika alternatif mengubah biaya, akses, atau gameplay.
- **Belum pasti:** dukungan aktual real-time channel/coordinator, strategi deadline, batas kuota, dan konfigurasi akses anonim.
- **Rekomendasi:** jalankan spike bagian 11.3 ketika implementasi diizinkan; simpan hasil dan alasan pilihan.
- **Harus selesai sebelum:** arsitektur hosting dan klaim multiplayer terpublikasi dianggap terverifikasi.

### OD-07 — Kontrak UX/perangkat dan retensi teknis

**Status v0.2: kontrak V1 dicatat pada implementation-decisions.md.** Viewport emulasi HP telah diuji; perangkat HP fisik dan FPS GPU hardware belum diuji. Retensi adalah expiry logis dengan cleanup oportunistik, bukan penghapusan fisik terjadwal yang dijamin.

- **Jenis:** detail yang dapat dirancang/diukur tanpa mengubah baseline, lalu dicatat sebagai kontrak QA.
- **Belum pasti:** model HP referensi, browser/version target, orientation coverage, gesture kamera/joystick, batas input, timeout membership/room, dan retensi log.
- **Rekomendasi:** jadikan portrait dan kontrol sentuh prioritas; tetapkan perangkat nyata yang tersedia, grammar input yang aman, dan retensi minimum yang cukup untuk pemulihan/debug sesi.
- **Harus selesai sebelum:** klaim performa, dukungan browser, dan kesiapan rilis.

## 13. Contoh skenario penerimaan lintas fitur

| ID | Skenario | Hasil yang wajib diperiksa | Requirement |
| --- | --- | --- | --- |
| AC-01 | Empat tamu bergabung dan host memulai | Empat identitas berbeda; satu match bersama. | REQ-003, REQ-004, REQ-022 |
| AC-02 | Tamu kesembilan bergabung sebagai peserta | Kapasitas kompetitif tidak melewati delapan. | REQ-004 |
| AC-03 | Tiga peserta mencoba start | Start jalur produk ditolak; tidak diam-diam dibantu bot. | REQ-004 |
| AC-04 | Pemain menjawab `2/4` untuk hasil 1/2 | Benar, satu score event, tidak kehilangan nyawa. | REQ-009, REQ-011, REQ-013 |
| AC-05 | Pemain mengirim jawaban numerik yang salah | Nol poin, satu nyawa berkurang, lanjut pembahasan. | REQ-012, REQ-016 |
| AC-06 | Waktu habis tanpa jawaban | Satu penalti, tidak dua akibat retry scheduler. | REQ-010, REQ-011, REQ-012 |
| AC-07 | Submit dan timeout beradu | Tepat satu outcome sesuai aturan deadline. | REQ-010, REQ-011, REQ-024 |
| AC-08 | Request submit yang sama diulang | Tidak ada skor/nyawa/feedback tambahan. | REQ-011 |
| AC-09 | Penonton menjawab lebih dahulu | Giliran utama tetap aktif, jawaban privat, skor utama tetap. | REQ-015, REQ-025 |
| AC-10 | Pemain utama menjawab benar dengan cepat | Latihan penonton ditutup bersama giliran; pembahasan 5 detik. | REQ-015, REQ-016 |
| AC-11 | Pemain kehilangan nyawa ketiga | Menjadi penonton latihan; tidak mendapat giliran utama berikutnya. | REQ-007, REQ-012 |
| AC-12 | Satu bertahan di tengah ronde | Hak giliran ronde diselesaikan sebelum evaluasi akhir. | REQ-017 |
| AC-13 | Satu bertahan setelah ronde lengkap | Juara dan alasan selesai konsisten pada seluruh klien. | REQ-017, REQ-018 |
| AC-14 | Semua peserta gugur | Gunakan skor eligible; seri mengikuti penentuan satu kali. | REQ-018, REQ-019 |
| AC-15 | Beberapa bertahan setelah ronde empat | Tidak ada ronde utama kelima; gunakan skor. | REQ-017, REQ-018 |
| AC-16 | Kandidat seri sama-sama salah dalam penentuan | Juara bersama; tidak mengulang soal penentuan. | REQ-019 |
| AC-17 | Satu kandidat benar dan tercepat sah | Juara tunggal menurut kebijakan waktu yang disepakati. | REQ-019, OD-02 |
| AC-18 | Putus lalu kembali sebelum 60 detik | Identitas, skor, nyawa, dan fase server pulih. | REQ-005, REQ-020 |
| AC-19 | Putus saat giliran lalu deadline lewat | Timer tidak pause; timeout hanya sekali. | REQ-010, REQ-020 |
| AC-20 | Putus lebih dari 60 detik | Sesuai kebijakan yang nanti dipilih; belum boleh dianggap terjawab. | REQ-020, OD-03 |
| AC-21 | Dua room penuh berjalan serentak | State publik dan privat terisolasi; match selesai konsisten. | REQ-022, REQ-025 |
| AC-22 | Client mengganti room/player/turn ID | Aksi tidak sah ditolak; tidak memengaruhi room lain. | REQ-023, REQ-025 |
| AC-23 | Browser kembali dari background | Timer/fase resync; tidak mendapat waktu atau giliran tambahan. | REQ-010, REQ-020 |
| AC-24 | Backend restart setelah submit | Outcome tidak hilang, terulang, atau memberikan waktu baru. | REQ-024 |
| AC-25 | Bermain melalui HP portrait | Keypad, soal, timer, nyawa, dan submit dapat dipakai. | REQ-001, REQ-026 |
| AC-26 | Melihat bundle/payload sebelum feedback | Tidak menemukan kunci soal atau input privat orang lain. | REQ-008, REQ-025 |
| AC-27 | Memakai emote/pesan payload ilegal | Pesan bebas tidak disiarkan; fase soal tetap terbaca. | REQ-021 |
| AC-28 | Memainkan match tanpa key model AI | Konten dan grading tetap bekerja. | REQ-028, REQ-029 |

## 14. Tahapan implementasi yang diusulkan

Ini urutan pekerjaan setelah pengguna mengizinkan implementasi, bukan klaim sudah dikerjakan.

1. **M0 — Dokumen dan keputusan:** simpan baseline, selesaikan OD produk yang menghalangi bagian berikutnya, siapkan daftar contoh soal dan kontrak input.
2. **M1 — Pembuktian multiplayer/hosting:** akses tamu, dua client, state authoritative, deadline, konkurensi, isolasi room, serta estimasi biaya.
3. **M2 — Domain pertandingan:** generator terverifikasi, parser rasional, score/life state machine, penentuan hasil, dan uji race/idempotency.
4. **M3 — Alur yang dapat dimainkan:** lobi, satu pertandingan lengkap, keypad, latihan penonton, pembahasan, dan hasil.
5. **M4 — Dunia dan kontrol 3D:** arena cerah, gerak avatar, perpindahan panggung, input touch, kamera, dan sinkronisasi visual.
6. **M5 — Pemulihan dan kapasitas:** reconnect, background tab, restart, dua room/16 session, serta profil performa/resource.
7. **M6 — Review dan handoff:** jalankan code review berdasarkan dokumen pendamping, perbaiki blocker, catat bukti dan batas verifikasi, lalu publikasi hanya sesuai instruksi pekerjaan yang berlaku.

Jangan menghabiskan tahap awal pada landing page pemasaran, toko kosmetik, atau aset dekoratif besar sementara multiplayer, penilaian, dan alur pertandingan belum terbukti.

## 15. Definisi selesai dan batas klaim

Versi pertama dapat dinyatakan memenuhi PRD jika requirement dalam scope mempunyai bukti yang memadai, OD yang memengaruhi perilaku telah diselesaikan, tidak ada temuan review blocker terbuka, dan alur multiplayer serta mobile benar-benar diuji sesuai kemampuan lingkungan.

Untuk delapan peserta yang semuanya memakai waktu penuh, 32 giliran × (30 detik menjawab + 5 detik pembahasan) = **18 menit 40 detik**, sebelum transisi. Ini batas perhitungan fase utama, bukan target durasi yang dijanjikan. Penentuan seri menambah maksimal 30 detik waktu menjawab beserta penutupan yang dirancang. Eliminasi dan jawaban cepat dapat mempersingkat pertandingan.

Target 16 pemain, akses anonim, performa HP, dan biaya operasional harus dilaporkan sesuai hasil pengujian nyata. Pada v0.1 semuanya merupakan target. Hasil implementasi dan pengujian v0.2 tercatat pada artifacts/final-evidence.md; hosting dan perangkat fisik tetap memerlukan bukti tersendiri.

## 16. Lampiran riset repo OSS

### 16.1 Metode dan keterbatasan

Snapshot diperiksa pada 25 Oktober 2026 melalui metadata GitHub, README, dan commit terakhir pada branch default. `pushed_at` tidak sama dengan commit terakhir branch default: push bisa berkaitan dengan branch/tag lain. Aktivitas terakhir tidak membuktikan kompatibilitas atau kualitas gameplay.

Untuk triase ini, **stale** berarti lebih dari 90 hari tanpa commit branch default. Itu indikator pemeliharaan yang perlu ditindaklanjuti, bukan bukti bahwa repo sudah obsolete. Tidak ada dari 20 repo yang terdeteksi archived pada snapshot ini. Demo belum dijalankan dan klaim kualitas belum diverifikasi melalui eksekusi.

### 16.2 Urutan kandidat sesuai tujuan produk

| Rank | Repo | Commit default terakhir | Lisensi metadata / catatan | Penilaian |
| --- | --- | --- | --- | --- |
| 1 | [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills) | 2026-09-28 | MIT | Kandidat utama: browser 3D, scaffold, panduan gameplay dan QA. |
| 2 | [htdt/godogen](https://github.com/htdt/godogen) | 2026-10-16 | MIT | Alternatif aktif; Three.js/Babylon.js selain Godot/Bevy. |
| 3 | [wormholeportal/Makone](https://github.com/wormholeportal/Makone) | 2026-09-05 | MIT | Referensi dunia prosedural dan pemeriksaan visual. |
| 4 | [OpenDCAI/GameFactory-3A](https://github.com/OpenDCAI/GameFactory-3A) | 2026-10-23 | Apache-2.0 | Framework skill/aset luas; opsional untuk kebutuhan yang terbukti. |
| 5 | [WhiteTowerAI/ohmygame](https://github.com/WhiteTowerAI/ohmygame) | 2026-10-23 | Apache-2.0 | Studio beta BYOK; menambah lapisan aplikasi/tooling. |
| 6 | [leigest519/OpenGame](https://github.com/leigest519/OpenGame) | 2026-09-03 | Apache-2.0 | Framework/rangkaian riset agentic web game. |
| 7 | [nacloos/clawblox](https://github.com/nacloos/clawblox) | 2026-10-07 | MIT | Dunia simulasi untuk embodied agents; kurang langsung untuk siswa. |
| 8 | [satelliteoflove/godot-mcp](https://github.com/satelliteoflove/godot-mcp) | 2026-09-16 | MIT | Relevan jika memakai Godot; bukan jalur utama Three.js. |
| 9 | [tettethu/VibeGame](https://github.com/tettethu/VibeGame) | 2026-10-13 | Apache-2.0 | Fokus 2D/Phaser, kurang sesuai arena 3D yang dipilih. |
| 10 | [takeshijuan/arcade-relay](https://github.com/takeshijuan/arcade-relay) | 2026-09-07 | MIT | Eksperimental; browser default 2D, 3D melalui Unity/Unreal. |
| 11 | [Roblox/roblox-studio-agent-plugin](https://github.com/Roblox/roblox-studio-agent-plugin) | 2026-10-15 | MIT | Plugin resmi untuk pengalaman di Roblox Studio. |
| 12 | [S4US/Roqer](https://github.com/S4US/Roqer) | 2026-10-23 | AGPL-3.0 metadata; README menyebut or-later | Aktif, tetapi sasaran Roblox Studio. Lisensi alat bukan otomatis lisensi output game. |
| 13 | [princeofscale/bloxforge](https://github.com/princeofscale/bloxforge) | 2026-09-01 | MIT | Toolkit Studio; push Oktober tidak berarti branch utama berubah Oktober. |
| 14 | [Astrablox/astrablox](https://github.com/Astrablox/astrablox) | 2026-09-08 | MIT | Studio agen untuk Roblox; proyek muda. |
| 15 | [Meganugger/roblox-studio-mcp](https://github.com/Meganugger/roblox-studio-mcp) | 2026-08-02 | MIT | MCP Roblox Studio; bukan runtime webapp mandiri. |
| 16 | [opedrolinux/roblox-game-factory](https://github.com/opedrolinux/roblox-game-factory) | 2026-08-08 | Tidak terdeteksi; listing root tanpa file lisensi | Factory Roblox/Claude. Hak reuse perlu diperjelas sebelum menyalin kode. |
| 17 | [meharbsinghs/RBLX_OPERATOR-](https://github.com/meharbsinghs/RBLX_OPERATOR-) | 2026-08-13 | MIT | Fokus output Roblox. |
| 18 | [PlayableIntelligence/game-creator](https://github.com/PlayableIntelligence/game-creator) | 2026-05-25 | Metadata tidak mendeteksi; README menyebut MIT, listing root tanpa file lisensi | Stale sekitar 5 bulan. README juga mencatat implikasi AGPL untuk audio @strudel/web. |
| 19 | [Claudeblox/claudeblox](https://github.com/Claudeblox/claudeblox) | 2026-02-26 | MIT | Stale sekitar 8 bulan; sasaran Roblox Studio. |
| 20 | [roushou/gox](https://github.com/roushou/gox) | 2026-02-21 | MIT | Stale sekitar 8 bulan; runtime MCP Studio. |

Peringkat adalah kecocokan terhadap Math Bee SMP, bukan peringkat kualitas universal. Metadata lisensi tidak menggantikan pemeriksaan file lisensi dan dependency pada versi yang benar-benar diadopsi. Source aset dan output generator memiliki ketentuan tersendiri.

### 16.3 Alasan pemilihan utama

Three.js Game Skills paling langsung mendukung browser 3D, input/UI, scaffold TypeScript, dan pengujian berbasis browser. Repo tersebut membantu proses pengembangan; aturan pendidikan, server pertandingan, identitas tamu, dan kebijakan hasil tetap perlu dibangun sesuai PRD ini. Godogen menyediakan jalur alternatif yang relevan. Makone berguna sebagai referensi visual, tetapi bukan sistem pertandingan siap pakai.

### 16.4 Referensi commit kandidat utama

Berikut commit branch default pada snapshot riset, agar dasar pemilihan dapat ditelusuri walaupun branch bergerak. Ini referensi riset, bukan klaim bahwa source sudah diinstal, diaudit menyeluruh, atau dipin sebagai dependency proyek.

| Kandidat | Commit yang diperiksa metadatanya |
| --- | --- |
| Three.js Game Skills | [8286774b22a2566bf894dbc825825c16921866af](https://github.com/majidmanzarpour/threejs-game-skills/commit/8286774b22a2566bf894dbc825825c16921866af) |
| Godogen | [40542b6c8efbdc40112c2b004fbaa6d67141846d](https://github.com/htdt/godogen/commit/40542b6c8efbdc40112c2b004fbaa6d67141846d) |
| Makone | [167d6811835b0ba82d3be8527a0e9fff3155b536](https://github.com/wormholeportal/Makone/commit/167d6811835b0ba82d3be8527a0e9fff3155b536) |

## 17. Log perubahan dan format pembaruan

| Versi | Tanggal | Perubahan | Status |
| --- | --- | --- | --- |
| 0.1 | 2026-10-25 | Mencatat 25 keputusan, requirement, OD, acceptance criteria, arsitektur usulan, dan snapshot riset OSS. | Dokumen awal; belum ada implementasi. |
| 0.2 | 2026-10-25 | Mencatat izin implementasi/Sites, empat keputusan lanjutan, dan status OD serta validasi. Baseline 25 keputusan dipertahankan. | Implementasi lokal; hosting belum terverifikasi. |

Setiap pembaruan berikutnya mencatat: requirement/K yang berubah, alasan, perilaku sebelum/sesudah, sumber keputusan pengguna bila relevan, pengaruh terhadap test/review, dan versi kebijakan yang dipakai match baru. Jangan mengubah aturan di tengah match aktif tanpa rancangan migrasi yang eksplisit.
