# NOTES — WarungPintar (AI VIBEATHON 2026)

Dibangun 25 Nov 2026, ~12:09–12:45 WIB, oleh subagent (build + tes lokal saja).
Tenggat submit kualifikasi online: ~26 Nov 01:30 WIB.

## Yang dibangun

Aplikasi web satu halaman (mobile-first, Bahasa Indonesia, tanpa build step):

- `app/index.html` — struktur 3 tab (Kasir / Bon / Ringkasan), kartu suara, katalog, keranjang.
- `app/style.css` — nuansa warung hangat (krem + terakota + hijau daun), tombol besar, nav bawah.
- `app/app.js` — kasir, keranjang, checkout tunai/bon, utang turunan (bon − pembayaran),
  ringkasan hari ini, localStorage, data contoh, hook demo `?demo=` (seed/cart/bon/ringkasan/preview/flow).
- `app/parser.js` — parser lokal kalimat kasir (dipakai browser + Node untuk tes).
  Mengenali alias produk longgar ("susu q" → SusuQ, "telor" → Telur 1kg),
  bilangan kata ("dua", "tiga", "satu kilo", "setengah"), nama pelanggan
  ("Bu Euis", "Pak Darman"), dan pembayaran (bon/tunai).
- `server/parse_server.py` — backend stdlib-only: `POST /api/parse` (Gemini
  gemini-2.5-flash, system prompt ketat → JSON saja) dan `GET /api/health`.
  Kunci HANYA dari env `GEMINI_API_KEY`. CORS `*` agar dev lokal (port 8000 → 8901) jalan.
  Timeout Gemini 20 dtk; semua error → HTTP 502 `{"error": ...}` supaya frontend fallback.
- `tests/parser.test.js` — 12 kasus uji parser (Node, tanpa dependensi).

## Hasil tes (25 Nov 2026)

### 1. Parser lokal — 12/12 LOLOS
`node tests/parser.test.js` → `12/12 lolos` (exit 0).
Kasus termasuk: "Bu Euis bon SusuQ dua", "tiga indomie goreng tunai",
"Pak Darman bon beras satu kilo", "Mbak Sari bon gas satu sama gula dua kilo",
"aqua 5", "Bu Euis bon susu q tiga", "telur dua kilo tunai",
"Pak Darman bon indomie kuah empat sama kerupuk dua", "kopi".
Perbaikan selama tes: regex pelanggan sempat menangkap kata kunci ("Bu Euis Bon") —
diperbaiki dengan stopword, lalu 12/12.

### 2. Backend + Gemini asli — 2/2 BERHASIL
Server jalan dengan kunci dari `~/workspace/prize-runs/zyrelyx/.env` (dibaca saat run saja):
- `GET /api/health` → `{"ok": true}`
- `POST /api/parse {"text":"Bu Euis bon SusuQ dua"}` →
  `{"items":[{"product":"SusuQ","qty":2}],"customer":"Bu Euis","payment":"bon"}`
- `POST /api/parse {"text":"tiga indomie goreng sama dua aqua, tunai"}` →
  `{"items":[{"product":"Indomie Goreng","qty":3},{"product":"Aqua 600ml","qty":2}],"customer":null,"payment":"tunai"}`

### 3. Browser nyata (Chromium headless, 390×844 + 1280×900)
Server app `:8000` + backend `:8901` jalan bersamaan.
- DOM `?demo=cart`: total keranjang **Rp 13.000** (Kopi 5.000 + Aqua 2×4.000) ✓
- DOM: badge header **"AI: online"** (frontend berhasil memanggil backend) ✓
- DOM `?demo=ringkasan` (data contoh): omzet **Rp 106.000**, tunai **Rp 47.000**,
  bon **Rp 59.000** — cocok dengan hitungan manual data contoh ✓
- DOM `?demo=preview`: "Bu Euis bon SusuQ dua" → SusuQ ×2, Rp 12.000, pelanggan Bu Euis, Bon ✓
- **Uji alur klik sungguhan** (`?demo=flow`, di browser): tambah Kopi + 2 Aqua → klik
  Simpan Transaksi → buka tab Bon → klik Lunas untuk Bu Euis → ringkasan:
  `txs=8 revenue=Rp 119.000 tunai=Rp 60.000 bonToday=Rp 59.000 debt=Rp 47.000
  lunasName=Bu Euis bonCustomersLeft=2` — semua cocok dengan hitungan manual ✓
- Screenshot diperiksa visual (lihat `shots/`): kasir, katalog 16 produk, keranjang,
  pratinjau uraian, bon (Bu Euis Rp 7.000 = 12.000−5.000 bayar sebagian ✓),
  ringkasan. Tiga masalah tampilan ditemukan dan diperbaiki: baris ketik
  suara yang sempit, input nominal bon yang terpotong, angka "Rp 20.000" yang
  terbelah baris — semua sudah diperbaiki dan di-screenshot ulang.

### Yang TIDAK sempat dites di browser nyata
- Mikrofon Web Speech API (tidak ada mic/perizinan di headless Chromium).
  UI sudah menangani ketiadaan API dengan pesan fallback + kolom ketik.
  **Wajib dites di HP/Chrome sungguhan sebelum demo ke juri.**
- Lunas / bayar sebagian hanya dites lewat klik simulasi `?demo=flow` (berhasil),
  bukan klik tangan manusia.

## File

```
prize-runs/vibeathon-warungpintar/
├── app/index.html, app/style.css, app/app.js, app/parser.js
├── server/parse_server.py
├── tests/parser.test.js
├── shots/mobile-kasir.png, mobile-cart-tall.png, mobile-preview.png,
│       mobile-bon.png, mobile-ringkasan.png, desktop-kasir.png
├── README.md
└── NOTES.md (file ini)
```

## Instruksi deploy (untuk main session — JANGAN dilakukan subagent)

### 1. GitHub repo (untuk submission)
- Buat repo publik `Gemmahadi/warungpintar` (via browser).
- Push isi workdir ini (app/, server/, tests/, README.md, NOTES.md, shots/ opsional).
- **Periksa dulu tidak ada kunci di repo**: `grep -ri 'AIza' .` harus kosong.
  Kunci Gemini TIDAK PERNAH ditulis ke file mana pun di workdir ini.
- Push butuh PAT GitHub (tidak ada di VM) — buat lewat browser, atau upload via web UI.

### 2. Demo live → https://gemmaworks.web.id/warungpintar/
- Static: `scp -r app/*` ke folder web VPS di bawah `warungpintar/`
  (pola sama seperti `farming-m1-preview/`). Pastikan `index.html` terlayani di
  `https://gemmaworks.web.id/warungpintar/`.
- Backend: salin `server/parse_server.py` ke VPS, misal `/opt/warungpintar/`.
  Jalankan sebagai service (systemd atau nohup) dengan environment:
  - `GEMINI_API_KEY` — ambil nilainya dari `~/workspace/prize-runs/zyrelyx/.env`
    (mode 600, JANGAN dicetak/di-commit). Di VPS simpan di file env mode 600,
    misal `/opt/warungpintar/.env`, dan muat saat start service.
  - `PORT=8901`, bind `127.0.0.1` saja.
- Nginx: tambah `location /warungpintar/api/ { proxy_pass http://127.0.0.1:8901/; }`
  (trailing slash penting: `/warungpintar/api/parse` → `/api/parse`).
  Frontend otomatis memakai path relatif `/warungpintar/api` kalau hostname
  bukan localhost.
- Verifikasi pasca-deploy: buka demo, badge header harus "AI: online";
  ketik "Bu Euis bon SusuQ dua" → Parse pakai AI → pratinjau muncul.
  Kalau badge "AI: offline", demo tetap jalan via parser lokal (sebutkan ke juri
  kalau perlu), tapi perbaiki backend dulu bila sempat.

### 3. Submit (Hack2Skill)
- Dashboard event AI VIBEATHON 2026 → submission: link repo GitHub + link demo live.
- Solo (tim 1 orang) — form team formation TIDAK perlu diisi.
- Tenggat: ~26 Nov 01:30 WIB. Jangan tunggu mepet: submit begitu demo live terverifikasi.

## Batasan / kejujuran
- Suara (Web Speech API) belum dites dengan mic sungguhan — hanya fallback ketik yang terverifikasi.
- Gemini free tier punya kuota harian; kalau juri mengklik berkali-kali dan kuota habis,
  aplikasi otomatis fallback ke parser lokal (status berubah "AI: offline") — demo tetap jalan.
- Harga produk adalah harga contoh realistis, bukan survei pasar.
