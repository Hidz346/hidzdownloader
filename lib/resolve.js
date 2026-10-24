// api/resolve.js
// Jalur tambahan buat platform yang ga ketangkep downr.org (Apple Music, Bandcamp,
// Bilibili, Pixiv, RedNote, TeraBox, MediaFire, dll) plus Spotify dan playlist YouTube.
// Daftar platform dan urutan scraper-nya ada di lib/router.js.
//
// Satu function aja buat semua platform, biar ga ngabisin jatah function di Vercel.

const { resolve } = require("../lib/router");

module.exports = async (req, res) => {
  try {
    let input = (req.query && req.query.url) || (req.body && req.body.url);
    if (Array.isArray(input)) input = input[0];

    if (!input) {
      res.status(400).json({ Status: false, Error: "URL wajib diisi." });
      return;
    }

    const result = await resolve(String(input));

    if (result.Status) {
      res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=240");
    }
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ Status: false, Error: err.message || "Gagal memproses permintaan." });
  }
};
