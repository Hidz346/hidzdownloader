// relay/server.js
// Relay kecil buat YouTube. Converter YouTube (ytmp3 / ytmp3gg) nolak IP datacenter, termasuk
// Vercel, jadi link YouTube dikerjain di sini (jaringan rumahan / HP lewat Termux) pakai scraper
// yang sama, lalu hasilnya dibalikin ke /api/resolve di Vercel.
//
// Jalanin:   RELAY_KEY=kunci-rahasia node relay/server.js
// Di Vercel: YT_RELAY_URL = alamat tunnel, YT_RELAY_KEY = isinya sama kayak RELAY_KEY

const http = require("http");
const crypto = require("crypto");

// relay ga boleh nerusin permintaan ke relay lagi
delete process.env.YT_RELAY_URL;

const { resolve, detectPlatform, extractUrl } = require("../lib/router");
const { assertPublicUrl } = require("../lib/guard");

const PORT = Number(process.env.PORT) || 8787;
const KEY = process.env.RELAY_KEY || "";

if (KEY.length < 16) {
  console.error("RELAY_KEY wajib diisi, minimal 16 karakter.");
  process.exit(1);
}

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function isAuthorized(req) {
  const given = Buffer.from(String(req.headers["x-relay-key"] || ""));
  const wanted = Buffer.from(KEY);
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}

// Relay cuma buat video YouTube, biar ga bisa dipake sebagai proxy platform lain
async function isYoutube(input) {
  try {
    const url = await assertPublicUrl(extractUrl(input));
    const platform = detectPlatform(url);
    return Boolean(platform && platform.id === "youtube");
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (!isAuthorized(req)) return send(res, 401, { Status: false, Error: "Kunci relay salah." });

    const { pathname, searchParams } = new URL(req.url, "http://localhost");
    if (pathname === "/health") return send(res, 200, { ok: true });
    if (pathname !== "/resolve") return send(res, 404, { Status: false, Error: "Endpoint tidak ada." });

    const input = searchParams.get("url") || "";
    if (!(await isYoutube(input))) {
      return send(res, 400, { Status: false, Error: "Relay cuma melayani link video YouTube." });
    }

    const result = await resolve(input);
    console.log(`[${new Date().toISOString()}] ${result.Status ? "ok" : "gagal"} ${result.Provider || result.Error || ""}`);
    send(res, 200, result);
  } catch (err) {
    send(res, 500, { Status: false, Error: err.message || "Relay gagal memproses permintaan." });
  }
});

// cuma dengerin localhost, tunnel yang nyambungin ke luar
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Relay YouTube jalan di http://127.0.0.1:${PORT}`);
});
