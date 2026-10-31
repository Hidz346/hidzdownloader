# hidzdownloader

Downloader media dan resolver link, jalan di Vercel (static `index.html` + serverless function).

## Struktur

```
index.html            halaman utama (UI, semua logic sisi browser)
api/download.js       proxy ke downr.org: TikTok, Douyin, Threads, IG, FB, Pinterest,
                      Reddit, X, YouTube, Vimeo, SoundCloud, dll
api/resolve.js        jalur tambahan, satu function buat semua platform di bawah
lib/router.js         daftar platform + urutan scraper (kalau satu gagal lanjut ke cadangan)
lib/normalize.js      nyeragamin bentuk hasil tiap scraper buat index.html
lib/guard.js          nolak alamat internal (localhost, jaringan lokal) sebelum diambil server
lib/scrapers/         scraper per platform
relay/server.js       relay YouTube buat dijalanin di HP / jaringan rumahan (opsional, lihat di bawah)
api/cek.js            alat cek sementara (server sumber bisa dijangkau dari Vercel atau engga), hapus kalau sudah ga dipake
vercel.json           batas waktu function (60 detik)
```

## Platform lewat `/api/resolve`

| Kelompok | Platform |
| --- | --- |
| YouTube | Video MP4 + audio MP3 (link video, Shorts, youtu.be, YouTube Music) |
| Musik | Spotify, Apple Music, Bandcamp, playlist YouTube |
| Video & gambar | Bilibili, Pixiv, RedNote |
| File host | TeraBox, MediaFire, Sfile, Pixeldrain, Catbox, Google Drive, Krakenfiles, Doodstream |
| Link & unlock | Sub2Unlock, Rekonise, Safelinku, shortlink (bit.ly, tinyurl, aka.ms, dll) |

Alurnya di `handleDownload()` (index.html): link dicek dulu cocok ke platform di atas atau engga.
Kalau cocok lewat `/api/resolve`, kalau engga lewat jalur lama (`/api/download` lalu RapidAPI).
Bilibili, Bandcamp, dan RedNote kalau gagal masih lanjut ke jalur lama.

YouTube sengaja ga lewat downr.org / RapidAPI: link googlevideo dari sana terikat ke IP server
yang minta, jadi ditolak (403) waktu dibuka di browser. Di resolver, video dan audionya dikonversi lewat
ytmp3 / ytmp3gg dan link-nya bisa langsung diunduh.

TikTok, Douyin, Instagram, Facebook, X, Threads, Pinterest, Reddit, dan SoundCloud tetap lewat downr.org dulu.
Kalau downr gagal, baru dicoba scraper cadangan di `/api/resolve`, terakhir RapidAPI.

Tiap tombol unduh ditandai VIDEO / AUDIO / GAMBAR / FILE (`kindOf()` di index.html), dan kalau hasilnya
campuran urutannya video dulu, lalu audio, gambar, file.

Hasil album/playlist (Spotify, YouTube) tampil sebagai daftar, klik salah satu buat diproses.

## YouTube lewat relay (kalau converter nolak IP Vercel)

Converter YouTube (ytmp3 / ytmp3gg) kadang nolak IP datacenter, termasuk Vercel. Tandanya di `/api/cek`:
`convert1s` status 403 dan `ytmp3.mobi` balas `ERR_UNSUPPORTED_PROXY`. Kalau begitu, link YouTube bisa
dikerjain lewat relay yang jalan di jaringan lain (misal HP lewat Termux), pakai scraper yang sama.

Di HP (Termux), dua sesi:

```
# sesi 1: relay
cd hidzdownloader && npm install
termux-wake-lock
RELAY_KEY=isi-kunci-rahasia-minimal-16-karakter node relay/server.js

# sesi 2: tunnel ke internet
pkg install cloudflared
cloudflared tunnel --url http://127.0.0.1:8787
```

Tunnel nampilin alamat `https://xxxx.trycloudflare.com`. Isi dua env di Vercel (Settings > Environment
Variables), terus redeploy:

| Env | Isi |
| --- | --- |
| `YT_RELAY_URL` | alamat tunnel tadi |
| `YT_RELAY_KEY` | sama persis kayak `RELAY_KEY` |

Cek lewat `/api/cek`, baris "relay youtube" harus status 200. Alamat tunnel cepat (`trycloudflare.com`)
berubah tiap tunnel dimulai ulang, jadi env `YT_RELAY_URL` perlu diganti lagi. Buat alamat tetap pakai
named tunnel Cloudflare.

Kalau `YT_RELAY_URL` kosong, semuanya jalan seperti biasa. Kalau diisi tapi relay mati, link YouTube tetap
dicoba lewat jalur langsung. Relay cuma mau melayani link video YouTube dan nolak permintaan tanpa kunci.

## Nambah platform

1. Taruh scraper di `lib/scrapers/<platform>/<metode>/index.js`, return `{ status, result }`.
2. Daftarin di `PLATFORMS` (`lib/router.js`).
3. Daftarin domain yang sama di `EXTRA_TOOLS` (`index.html`) biar link-nya terdeteksi dan chip contohnya muncul.

## Deploy

`package.json` cuma butuh `axios` dan `cheerio`, Vercel install otomatis waktu deploy.
Satu function buat semua platform sengaja, biar ga ngabisin jatah function di plan Hobby.

## Credit

Scraper di `lib/scrapers` diambil dari [scrapr](https://github.com/coflyn/scrapr) (MIT, coflyn),
lisensinya ada di `lib/scrapers/LICENSE`.
