// lib/router.js
// Nentuin link masuk ke platform mana, lalu jalanin scraper-nya satu-satu
// (kalau yang pertama gagal lanjut ke cadangan) dan rapihin hasilnya.
// Scraper di lib/scrapers diambil dari project scrapr (coflyn, MIT).

const axios = require("axios");
const { assertPublicUrl } = require("./guard");
const { normalizeResult } = require("./normalize");

const spotify = require("./scrapers/spotify");
const applemusic = require("./scrapers/applemusic");
const bilibili = require("./scrapers/bilibili");
const bandcamp = require("./scrapers/bandcamp");
const pixiv = require("./scrapers/pixiv");
const rednote = require("./scrapers/rednote");
const terabox = require("./scrapers/terabox");
const youtube = require("./scrapers/youtube");
const resolver = require("./scrapers/resolver");

// request yang ga punya timeout sendiri jangan sampai nunggu selamanya
axios.defaults.timeout = 30000;

const DEFAULT_TIMEOUT_MS = 25000;
// harus di bawah maxDuration di vercel.json (60 detik)
const TOTAL_BUDGET_MS = 55000;

const hostIs = (host, ...domains) => domains.some((d) => host === d || host.endsWith(`.${d}`));

const SHORTENERS = [
  "bit.ly", "tinyurl.com", "t.co", "is.gd", "v.gd", "cutt.ly", "rb.gy", "rebrand.ly",
  "ow.ly", "buff.ly", "shorturl.at", "s.id", "dub.sh", "dub.co", "aka.ms", "t.ly",
  "tiny.cc", "lnkd.in", "goo.gl",
];

const TERABOX_DOMAINS = [
  "terabox.com", "teraboxapp.com", "terabox.app", "1024terabox.com", "1024tera.com",
  "4funbox.com", "mirrobox.com", "nephobox.com", "momerybox.com", "tibibox.com",
  "terasharefile.com", "teraboxlink.com", "freeterabox.com",
];

// Urutan penting: yang spesifik di atas, unshorten (paling umum) di paling bawah
const PLATFORMS = [
  {
    id: "spotify",
    name: "Spotify",
    match: (u, host) => hostIs(host, "spotify.com", "spotify.link"),
    providers: [
      { name: "spotmate", run: spotify.spotmate },
      { name: "spotidown", run: spotify.spotidown },
    ],
  },
  {
    id: "applemusic",
    name: "Apple Music",
    match: (u, host) => hostIs(host, "music.apple.com", "itunes.apple.com"),
    providers: [{ name: "aplmate", run: applemusic.aplmate, timeout: 40000 }],
  },
  {
    id: "bilibili",
    name: "Bilibili",
    match: (u, host) => hostIs(host, "bilibili.com", "bilibili.tv", "b23.tv"),
    // b23.tv itu link pendek, ID videonya baru ketahuan setelah di-redirect
    expand: (u, host) => host === "b23.tv",
    providers: [{ name: "direct", run: bilibili.direct }],
  },
  {
    id: "bandcamp",
    name: "Bandcamp",
    match: (u, host) => hostIs(host, "bandcamp.com"),
    providers: [
      { name: "direct", run: bandcamp.direct },
      { name: "bandcampdownloader", run: bandcamp.bandcampdownloader, timeout: 40000 },
    ],
  },
  {
    id: "pixiv",
    name: "Pixiv",
    match: (u, host) => hostIs(host, "pixiv.net"),
    providers: [{ name: "ajax", run: pixiv.ajax }],
  },
  {
    id: "rednote",
    name: "RedNote",
    match: (u, host) => hostIs(host, "xiaohongshu.com", "xhslink.com", "xhslink.cn", "rednote.com"),
    providers: [{ name: "direct", run: rednote.direct, timeout: 40000 }],
  },
  {
    id: "terabox",
    name: "TeraBox",
    match: (u, host) => hostIs(host, ...TERABOX_DOMAINS),
    providers: [{ name: "sechno", run: terabox.sechno, timeout: 35000 }],
  },
  {
    id: "ytplaylist",
    name: "YouTube Playlist",
    match: (u, host) =>
      hostIs(host, "youtube.com") && u.pathname.replace(/\/$/, "") === "/playlist" && u.searchParams.has("list"),
    providers: [{ name: "playlist", run: youtube.playlist }],
  },
  {
    id: "mediafire",
    name: "MediaFire",
    match: (u, host) => hostIs(host, "mediafire.com"),
    providers: [{ name: "mediafire", run: resolver.mediafire }],
  },
  {
    id: "sfile",
    name: "Sfile",
    match: (u, host) => hostIs(host, "sfile.co", "sfile.mobi"),
    providers: [{ name: "sfile", run: resolver.sfile }],
  },
  {
    id: "pixeldrain",
    name: "Pixeldrain",
    match: (u, host) => hostIs(host, "pixeldrain.com"),
    providers: [{ name: "pixeldrain", run: resolver.pixeldrain }],
  },
  {
    id: "catbox",
    name: "Catbox",
    match: (u, host) => hostIs(host, "catbox.moe"),
    providers: [{ name: "catbox", run: resolver.catbox }],
  },
  {
    id: "gdrive",
    name: "Google Drive",
    match: (u, host) => hostIs(host, "drive.google.com", "docs.google.com"),
    providers: [{ name: "gdrive", run: resolver.gdrive }],
  },
  {
    id: "krakenfiles",
    name: "Krakenfiles",
    match: (u, host) => hostIs(host, "krakenfiles.com"),
    providers: [{ name: "krakenfiles", run: resolver.krakenfiles }],
  },
  {
    id: "doodstream",
    name: "Doodstream",
    match: (u, host) => /(^|\.)(dood(stream)?|doods|ds2play|playmogo)\.[a-z]{2,}$/.test(host),
    providers: [{ name: "doodstream", run: resolver.doodstream }],
  },
  {
    id: "sub2unlock",
    name: "Sub2Unlock",
    match: (u, host) => /(^|\.)sub[24]unlock\.[a-z]{2,}$/.test(host),
    providers: [{ name: "sub2unlock", run: resolver.sub2unlock, timeout: 40000 }],
  },
  {
    id: "rekonise",
    name: "Rekonise",
    match: (u, host) => hostIs(host, "rekonise.com"),
    // scraper-nya sengaja nunggu ~11 detik sesuai timer dari server Rekonise
    providers: [{ name: "rekonise", run: resolver.rekonise, timeout: 50000 }],
  },
  {
    id: "safelinku",
    name: "Safelinku",
    match: (u, host) => hostIs(host, "safelinku.com", "sfl.gl", "semawur.com", "khaddavi.net"),
    providers: [{ name: "safelinku", run: resolver.safelinku, timeout: 50000 }],
  },
  {
    id: "unshorten",
    name: "Unshorten",
    match: (u, host) => hostIs(host, ...SHORTENERS),
    providers: [{ name: "unshorten", run: resolver.unshorten, timeout: 30000 }],
  },
];

function extractUrl(input) {
  const str = String(input || "").trim();
  if (!str || str.length > 2048) return "";
  const found = str.match(/https?:\/\/[^\s]+/i);
  if (found) return found[0];
  // link tanpa https:// (misal "mediafire.com/file/...")
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(str) ? `https://${str}` : "";
}

function detectPlatform(url) {
  const host = url.hostname.toLowerCase();
  return PLATFORMS.find((p) => p.match(url, host)) || null;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Waktu habis, server sumber terlalu lama merespons.")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Ikuti redirect link pendek (b23.tv dll) sampai ketemu alamat aslinya
async function expandShortLink(platform, url) {
  try {
    const res = await resolver.unshorten(url.href, { autoResolve: false });
    const dest = res && res.status && res.result && res.result.destinationUrl;
    if (!dest) return url;
    const next = await assertPublicUrl(dest);
    return platform.match(next, next.hostname.toLowerCase()) ? next : url;
  } catch {
    return url;
  }
}

async function runProviders(platform, url) {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError = "";

  for (const provider of platform.providers) {
    const left = deadline - Date.now();
    if (left < 2500) break;

    try {
      const raw = await withTimeout(
        Promise.resolve(provider.run(url)),
        Math.min(provider.timeout || DEFAULT_TIMEOUT_MS, left)
      );

      if (raw && raw.status) {
        const result = normalizeResult(raw);
        if (result) return { provider: provider.name, result };
        lastError = "Tidak ada link unduhan yang ditemukan.";
      } else if (raw && raw.message) {
        lastError = raw.message;
      }
    } catch (err) {
      lastError = err.message || lastError;
    }
  }

  return { error: lastError || "Gagal mengambil data dari sumber." };
}

function fail(input, code, error, platform) {
  return {
    Status: false,
    Code: code,
    Input: input || null,
    Platform: platform ? platform.id : null,
    Provider: null,
    Result: null,
    Error: error,
  };
}

async function resolve(rawInput) {
  const cleaned = extractUrl(rawInput);
  if (!cleaned) return fail(null, 400, "URL tidak valid.");

  let url;
  try {
    url = await assertPublicUrl(cleaned);
  } catch (err) {
    return fail(cleaned, 400, err.message);
  }

  const platform = detectPlatform(url);
  if (!platform) return fail(cleaned, 404, "Link ini belum didukung.");

  if (platform.expand && platform.expand(url, url.hostname.toLowerCase())) {
    url = await expandShortLink(platform, url);
  }

  const outcome = await runProviders(platform, url.href);
  if (outcome.error) return fail(cleaned, 502, outcome.error, platform);

  return {
    Status: true,
    Code: 200,
    Input: cleaned,
    Platform: platform.id,
    Provider: outcome.provider,
    Result: outcome.result,
    Error: null,
  };
}

module.exports = { resolve, detectPlatform, extractUrl };
