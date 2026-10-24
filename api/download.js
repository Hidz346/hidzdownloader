// api/download.js
// Proxy universal downloader, diambil & disesuaikan dari project MediaDownloader (lib/downr.ts)
// biar HidzDownloader bisa narik media dari platform yang jauh lebih banyak
// (TikTok, Douyin, Threads, IG, FB, Pinterest, Reddit, Twitter/X, YouTube, SoundCloud, dll)
// lewat downr.org, ga cuma ngandelin 1 API doang kayak sebelumnya.
//
// Jalan sebagai Vercel Serverless Function biasa (bukan Next.js), taruh file ini di api/download.js.

const BASE = "https://downr.org";
const ANALYTICS_ENDPOINT = `${BASE}/.netlify/functions/analytics`;
const DOWNLOAD_ENDPOINT = `${BASE}/.netlify/functions/download`;
const NYT_ENDPOINT = `${BASE}/.netlify/functions/nyt`;

// Ganti-ganti User-Agent tiap request biar ga gampang keblokir
const USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36"
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Cache kecil-kecilan di memory biar link yang berulang kali diminta ga fetch ulang mulu
const cache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 10; // 10 menit

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of cache.entries()) {
    if (now > val.expiresAt) cache.delete(key);
  }
}, 1000 * 60 * 5).unref();

// Biar 2 request bareng buat url yang sama ga numpuk fetch dobel
const pendingRequests = new Map();

function buildHeaders(cookie) {
  return {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    cookie: cookie || "",
    origin: BASE,
    referer: `${BASE}/`,
    "user-agent": randomUA()
  };
}

function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function parseBody(raw) {
  if (typeof raw !== "string") return raw;
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isResultOk(status, data) {
  const isObject = data && typeof data === "object";
  if (status < 200 || status >= 300) return false;
  if (data === null || data === undefined || data === "") return false;
  if (data === "error" || data === "failed" || data === "user_retry_required") return false;
  if (isObject && (data.error === true || data.status === false || data.success === false)) return false;
  return true;
}

function extractError(data, status) {
  if (typeof data === "string") return data || `HTTP ${status}`;
  if (data && typeof data === "object") return data.message || data.error || data.status || data.reason || `HTTP ${status}`;
  return `HTTP ${status}`;
}

async function getSessionCookie(retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchWithTimeout(ANALYTICS_ENDPOINT, { headers: buildHeaders() }, 10000);
      if (typeof res.headers.getSetCookie === "function") {
        const cookies = res.headers.getSetCookie();
        if (cookies && cookies.length) {
          return cookies.map((c) => c.split(";")[0]).join("; ");
        }
      }
      return "";
    } catch (err) {
      if (i === retries - 1) return "";
    }
  }
  return "";
}

async function hitEndpoint(endpoint, url, cookie) {
  try {
    const res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: buildHeaders(cookie),
      body: JSON.stringify({ url })
    }, 25000);
    const raw = await res.text();
    return { endpoint, status: res.status, data: parseBody(raw) };
  } catch (err) {
    return { endpoint, status: 500, data: null };
  }
}

async function resolveMedia(url) {
  let cookie = await getSessionCookie();
  let result = await hitEndpoint(DOWNLOAD_ENDPOINT, url, cookie);
  if (isResultOk(result.status, result.data)) return result;

  // Cookie lama kemungkinan basi, coba ambil yang baru terus ulang sekali lagi
  cookie = await getSessionCookie();
  result = await hitEndpoint(DOWNLOAD_ENDPOINT, url, cookie);
  if (isResultOk(result.status, result.data)) return result;

  // Endpoint utama tetep ga mau, coba lewat jalur cadangan
  return hitEndpoint(NYT_ENDPOINT, url, cookie);
}

async function downloadMedia(targetUrl) {
  if (!targetUrl || !/^https?:\/\//i.test(targetUrl)) {
    return { Status: false, Code: 400, Input: targetUrl || null, Endpoint: null, Result: null, Error: "URL tidak valid." };
  }

  const cached = cache.get(targetUrl);
  if (cached) {
    if (Date.now() < cached.expiresAt) return cached.data;
    cache.delete(targetUrl);
  }

  if (pendingRequests.has(targetUrl)) {
    return pendingRequests.get(targetUrl);
  }

  const task = (async () => {
    const result = await resolveMedia(targetUrl);
    const ok = isResultOk(result.status, result.data);

    const output = {
      Status: ok,
      Code: result.status,
      Input: targetUrl,
      Endpoint: result.endpoint,
      Result: ok ? result.data : null,
      Error: ok ? null : extractError(result.data, result.status)
    };

    if (ok) {
      cache.set(targetUrl, { data: output, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return output;
  })();

  pendingRequests.set(targetUrl, task);
  try {
    return await task;
  } finally {
    pendingRequests.delete(targetUrl);
  }
}

module.exports = async (req, res) => {
  try {
    let targetUrl = (req.query && req.query.url) || (req.body && req.body.url);
    // ?url=a&url=b kebaca sebagai array, ambil yang pertama aja
    if (Array.isArray(targetUrl)) targetUrl = targetUrl[0];

    if (!targetUrl) {
      res.status(400).json({ Status: false, Error: "URL wajib diisi." });
      return;
    }

    const result = await downloadMedia(targetUrl);

    if (result.Status) {
      res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=300");
    }
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ Status: false, Error: err.message || "Gagal memproses permintaan." });
  }
};

