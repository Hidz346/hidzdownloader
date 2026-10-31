// api/cek.js
// Alat cek sementara: nunjukin server sumber YouTube bisa dijangkau dari Vercel atau engga.
// Buka https://<domain-kamu>/api/cek , lalu hapus file ini kalau sudah selesai dipakai.

const axios = require("axios");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const CHECKS = [
  {
    name: "convert1s (dipakai ytmp3gg & ytmp3)",
    run: () =>
      axios.post(
        "https://hub.convert1s.com/api/download",
        { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", os: "macos", output: { type: "audio", format: "mp3", quality: "" }, audio: { bitrate: "128k" } },
        { headers: { Origin: "https://media.ytmp3.gg", Referer: "https://media.ytmp3.gg/", "User-Agent": UA }, timeout: 10000, validateStatus: () => true }
      ),
  },
  {
    name: "ytmp3.mobi (cadangan ytmp3)",
    run: () =>
      axios.get("https://a.ymcdn.org/api/v1/init?p=y&23=1llum1n471&_=" + Math.random(), {
        headers: { Origin: "https://ytmp3.mobi", Referer: "https://ytmp3.mobi/en8/", "User-Agent": UA },
        timeout: 10000,
        validateStatus: () => true,
      }),
  },
  {
    name: "relay youtube (YT_RELAY_URL)",
    run: () => {
      const base = String(process.env.YT_RELAY_URL || "").trim().replace(/\/+$/, "");
      if (!base) return Promise.resolve({ status: null, data: "YT_RELAY_URL belum diisi di Vercel" });
      return axios.get(base + "/health", {
        headers: { "x-relay-key": process.env.YT_RELAY_KEY || "" },
        timeout: 8000,
        validateStatus: () => true,
      });
    },
  },
  {
    name: "youtube oembed (judul & thumbnail)",
    run: () =>
      axios.get("https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=json", {
        timeout: 8000,
        validateStatus: () => true,
      }),
  },
];

module.exports = async (req, res) => {
  const out = [];
  for (const check of CHECKS) {
    try {
      const r = await check.run();
      const body = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
      out.push({ sumber: check.name, status: r.status, isi: String(body).slice(0, 300) });
    } catch (err) {
      out.push({ sumber: check.name, status: null, error: err.code || err.message });
    }
  }
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(out);
};
