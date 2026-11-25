# WarungPintar — Kasir Warung Pakai Suara

Prototipe untuk **AI VIBEATHON 2026** (PromptWars × Echo Engineers, Hack2Skill).
Kualifikasi online 25 Nov 2026.

## Masalah

Pemilik warung kecil di Indonesia mencatat jualan dan utang pelanggan ("bon")
di buku kertas — tercecer, tidak ada total, utang pelanggan sering lupa.
WarungPintar menggantinya dengan kasir HP yang bisa **diomongin**.

## Fitur (semua jalan, bukan mockup)

- **Katalog warung** — 16 produk khas warung dengan harga Rupiah realistis.
  Harga bisa diubah, produk baru bisa ditambah.
- **Kasir** — ketuk produk untuk masuk keranjang, atur jumlah (+/−), total
  otomatis, checkout **Tunai** atau **Bon** (pilih/tambah nama pelanggan).
- **Catat pakai suara** 🎙️ — tombol mikrofon (Web Speech API, `id-ID`).
  Contoh: *"Bu Euis bon SusuQ dua"* → diuraikan jadi transaksi, tampilkan
  pratinjau untuk diperiksa, lalu simpan. Ada kolom ketik sebagai cadangan
  kalau browser tidak mendukung mikrofon.
- **Parse pakai AI** — kalimat dikirim ke backend yang memanggil Gemini
  (`gemini-2.5-flash`) dan mengembalikan JSON terstruktur. Kalau backend
  mati / error / kuota habis, otomatis jatuh ke **parser lokal** (tanpa AI)
  dan indikator di header berubah jadi "AI: offline".
- **Bon pelanggan** — utang per pelanggan dihitung dari transaksi bon
  dikurangi pembayaran. Aksi **Lunas** dan **Bayar sebagian**, plus riwayat
  pembayaran.
- **Ringkasan hari ini** — omzet, tunai vs bon, jumlah transaksi, total bon
  belum lunas, produk paling laris, dan transaksi terakhir.
- **Data tersimpan di perangkat** (localStorage). Tombol **Isi data contoh**
  dan **Hapus semua data** untuk demo.

## Cara menjalankan (lokal)

```bash
# Backend AI (butuh GEMINI_API_KEY di environment)
GEMINI_API_KEY=... PORT=8901 python3 server/parse_server.py

# Frontend (di terminal lain)
cd app && python3 -m http.server 8000
# buka http://127.0.0.1:8000/
```

Tanpa backend pun aplikasi tetap jalan penuh — parser lokal yang bekerja,
dan indikator AI menampilkan "offline".

## Teknologi

- Frontend: HTML + CSS + JavaScript polos, tanpa build step, tanpa dependensi.
- Backend: Python **stdlib saja** (`http.server.ThreadingHTTPServer`),
  satu file `server/parse_server.py`.
- AI: Google Gemini `gemini-2.5-flash` via REST `generateContent`.
  Kunci API **hanya** dibaca dari environment variable `GEMINI_API_KEY`
  saat server jalan — tidak ada kunci di repo ini, di frontend, atau di file
  mana pun.

## Catatan AI (jujur)

- AI dipakai untuk **mengurai kalimat bebas** menjadi transaksi terstruktur
  (produk + jumlah + pelanggan + tunai/bon). AI tidak menyimpan apa pun dan
  tidak memutuskan harga — harga selalu dari katalog.
- Parser lokal (regex + kamus produk/bilangan Indonesia) adalah fallback yang
  sudah dites 12/12 kalimat. Semua hasil uraian — AI maupun lokal — selalu
  ditampilkan sebagai pratinjau yang bisa diubah sebelum disimpan.

## Struktur

```
app/            Frontend (index.html, style.css, app.js, parser.js)
server/         Backend parse (parse_server.py, stdlib saja)
tests/          Tes unit parser (node tests/parser.test.js)
shots/          Screenshot verifikasi (mobile + desktop)
README.md       File ini
NOTES.md        Catatan build, hasil tes, dan instruksi deploy
```
