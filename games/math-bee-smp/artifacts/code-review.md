# Code review implementasi — Math Bee SMP

Tanggal: 25 Oktober 2026. Acuan: `docs/prd.md`, `docs/code-review-spec.md`.

## Hasil

**APPROVE untuk scope kode aplikasi yang ditinjau.** Tidak ada P0/P1 terkonfirmasi yang masih terbuka pada penutupan review. Publikasi Sites, D1 hosted, dan akses anonim produksi tetap belum terverifikasi karena jaringan lingkungan.

## Temuan dan perbaikan

### F-001 — P1: timestamp submit diambil sebelum body selesai diterima

- Lokasi: `src/server/worker.ts`, fungsi `api`/`body` dan handler action.
- Pemicu: mulai mengirim body sebelum deadline, tahan stream, selesaikan sesudah deadline.
- Dampak: timestamp awal request berpotensi membuat jawaban terlambat dianggap tepat waktu.
- Perbaikan: timestamp aksi diambil setelah body lengkap; body dibatasi ukuran dan timeout. Test regresi streaming body membuktikan request terlambat ditolak dan timeout hanya mengurangi satu nyawa.
- Acuan: REQ-010, REQ-011, REQ-023.
- Status: diperbaiki dan diuji.

### F-002 — P1: host lobi yang putus koneksi tidak tergantikan

- Lokasi: `src/game/engine.ts`, `updatePresence`.
- Pemicu: host + empat peer di lobi; host berhenti mengirim heartbeat, peer tetap aktif hingga masa reconnect habis.
- Dampak: host lama tetap mempunyai hak start; peer lain terkena `HOST_ONLY` dan room macet.
- Perbaikan: host disconnected yang grace-nya habis diganti pada lobi/hasil maupun match aktif. Pilih anggota connected yang eligible dan paling lama bergabung. Nyawa/skor lobi tidak diubah.
- Verifikasi: regresi menjaga host lama sebelum expiry, mengganti host sesudah expiry, dan memungkinkan start/rematch. Review independen terbatas pada perbaikan menyatakan temuan ditutup.
- Acuan: REQ-004, REQ-020, keputusan host yang dikonfirmasi pengguna.
- Status: diperbaiki dan diuji.

### F-003 — P1: refresh dengan parameter room tidak memulihkan pertandingan

- Lokasi: `src/client/Game.tsx`, efek startup restore.
- Pemicu: masuk room yang menambahkan `?room=CODE`, kemudian refresh dengan cookie anggota yang sah.
- Dampak: client kembali ke landing karena restore sebelumnya hanya berjalan tanpa parameter invite.
- Perbaikan: probe snapshot terotorisasi untuk `invite || savedRoom`; anggota valid pulih, nonanggota tetap mendapat form join. Saved room lain tidak dihapus oleh invite yang berbeda.
- Verifikasi: browser regression lulus untuk refresh anggota dan membuka invite sebagai anggota yang sudah ada.
- Acuan: REQ-005, REQ-020, REQ-027.
- Status: diperbaiki dan diuji.

## Cakupan review

Parser/generator dan oracle independen, private snapshot, identitas guest/cookie, hak aksi, CAS/receipt, deadline, ronde/tiebreak, forfeit, host succession, submit/poll reconciliation, serta batas client/server asset bundle.

## Batas verifikasi

- Review tidak membuktikan kapasitas hosting D1 yang belum diterbitkan.
- Simulasi 16 session dan browser QA lokal dilaporkan sebagai pengujian lokal, bukan uji siswa atau 16 perangkat fisik.
- SwiftShader hanya memberi bukti render/fungsi, bukan FPS HP nyata.
- Waktu penghapusan fisik data mengikuti cleanup oportunistik; expiry akses bukan janji penghapusan tepat pada deadline.
