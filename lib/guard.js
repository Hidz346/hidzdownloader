// lib/guard.js
// Cek URL sebelum server ngambil isinya. Tanpa ini endpoint resolver bisa dipake
// buat nembak alamat internal (localhost, jaringan lokal, metadata cloud, dll).

const dns = require("dns").promises;
const net = require("net");

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan"];

function isPrivateV4(ip) {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateV6(ip) {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;

  // ::ffff:127.0.0.1 atau bentuk hex-nya ::ffff:7f00:1
  const dotted = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateV4(dotted[1]);
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }

  // fc00::/7 (unique local), fe80::/10 (link local), plus bentuk terowongan/terjemahan
  // yang bisa nyelipin alamat IPv4 internal: NAT64 (64:ff9b::), 6to4 (2002::), Teredo (2001::)
  return /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^64:ff9b:/.test(v) || /^2002:/.test(v) || /^2001:0?:/.test(v);
}

function isPrivateIp(ip) {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind === 6) return isPrivateV6(ip);
  return true;
}

// Lempar error kalau URL bukan http(s) publik. Balikin objek URL kalau aman.
async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL tidak valid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Cuma link http/https yang didukung.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Port URL tidak diizinkan.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Alamat URL tidak diizinkan.");
    return url;
  }

  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new Error("Alamat URL tidak diizinkan.");
  }

  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new Error("Domain tidak ditemukan.");
  }
  if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error("Alamat URL tidak diizinkan.");
  }

  return url;
}

module.exports = { assertPublicUrl, isPrivateIp };
