// lib/normalize.js
// Hasil tiap scraper bentuknya beda-beda: ada yang ngisi `type` pake label,
// ada yang pake `quality`, ada yang naruh filename di luar daftar download.
// Di sini semuanya diseragamin supaya index.html cukup baca satu bentuk aja.

const KIND_BY_TYPE = {
  video: "video",
  audio: "audio",
  mp3: "audio",
  image: "image",
  photo: "image",
  cover: "image",
  file: "file",
  link: "link",
};

const KIND_LABEL = {
  video: "Video",
  audio: "Audio",
  image: "Gambar",
  file: "File",
  link: "Link",
};

// playlist YouTube bisa ratusan video, tampilin sebagian aja biar halaman ga berat
const MAX_ITEMS = 100;

function text(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function httpUrl(value) {
  if (typeof value !== "string") return "";
  let str = value.trim();
  if (str.startsWith("//")) str = "https:" + str;
  if (!/^https?:\/\//i.test(str)) return "";
  try {
    return new URL(str).hostname ? str : "";
  } catch {
    return "";
  }
}

// isi array dari scraper kadang ada yang kosong / bukan objek
function onlyObjects(list) {
  return Array.isArray(list) ? list.filter((x) => x && typeof x === "object") : [];
}

// Thumbnail dipaksa https biar ga diblokir browser (mixed content)
function thumbUrl(value) {
  const url = httpUrl(value);
  return url ? url.replace(/^http:\/\//i, "https://") : "";
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function guessKind(url, hint) {
  const probe = `${hint} ${url.split("?")[0]}`.toLowerCase();
  if (/cover|image|photo|gambar|\.(jpe?g|png|webp|gif|avif)\b/.test(probe)) return "image";
  if (/mp3|audio|m4a|\.(aac|flac|wav|ogg|opus)\b/.test(probe)) return "audio";
  if (/video|mp4|m3u8|\.(webm|mov|m4v|mkv)\b/.test(probe)) return "video";
  return "file";
}

function normalizeDownload(item) {
  const url = httpUrl(item && item.url);
  if (!url) return null;

  const rawType = text(item.type);
  const quality = text(item.quality);
  const filename = text(item.filename);
  const size = text(item.size);

  const knownKind = KIND_BY_TYPE[rawType.toLowerCase()];
  // beberapa scraper naruh label langsung di `type`, contoh "Download MP3 (128kb)"
  const typeIsLabel = Boolean(rawType) && !knownKind;
  const kind = knownKind || guessKind(url, rawType);

  let label;
  let note = "";

  if (filename) {
    label = filename;
    note = [quality, size].filter(Boolean).join(" · ");
  } else if (typeIsLabel) {
    label = rawType;
    note = size;
  } else {
    // jenisnya (video/audio) sudah ditandai di tombol, jadi label cukup kualitasnya
    label = quality || KIND_LABEL[kind];
    note = size;
  }

  if (kind === "link") note = url;

  return { label, note, url, kind };
}

function uniqueByUrl(list) {
  const seen = new Set();
  return list.filter((item) => {
    if (!item || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function authorName(value) {
  if (typeof value === "string") return text(value);
  return value && typeof value === "object" ? text(value.name) : "";
}

function buildSubtitle(r, title) {
  const artist = text(r.artist) || authorName(r.author);
  const album = text(r.album);
  const size = text(r.size);
  const lower = title.toLowerCase();

  const parts = [];
  if (artist && !lower.includes(artist.toLowerCase())) parts.push(artist);
  if (album && album.toLowerCase() !== lower && !lower.includes(album.toLowerCase())) parts.push(album);
  if (r.releaseYear) parts.push(String(r.releaseYear));
  if (size && size.toLowerCase() !== "unknown") parts.push(size);

  if (r.totalFiles > 1) parts.push(`${r.totalFiles} file`);
  else if (r.trackCount > 1) parts.push(`${r.trackCount} lagu`);
  else if (r.itemCount > 1) parts.push(`${r.itemCount} video`);

  return parts.join(" · ");
}

// Bandcamp album: tiap lagu punya link unduhan sendiri, ditampilin per kelompok
function buildTracks(r) {
  if (!Array.isArray(r.tracks)) return [];
  return onlyObjects(r.tracks)
    .map((track, index) => {
      const downloads = uniqueByUrl(onlyObjects(track.downloads).map(normalizeDownload));
      if (!downloads.length) return null;
      return {
        title: text(track.title) || `Lagu ${index + 1}`,
        subtitle: text(track.artist),
        downloads,
      };
    })
    .filter(Boolean);
}

// Playlist (YouTube / Spotify): daftar yang tinggal diklik buat diproses ulang satu-satu
function buildItems(r) {
  let source = [];
  if (Array.isArray(r.items)) source = onlyObjects(r.items);
  else if (Array.isArray(r.tracks)) source = onlyObjects(r.tracks).filter((t) => !Array.isArray(t.downloads));

  const items = source
    .map((entry) => ({
      title: text(entry.title),
      subtitle: text(entry.author) || text(entry.artist),
      thumbnail: thumbUrl(entry.thumbnail),
      url: httpUrl(entry.url || entry.track_url),
    }))
    .filter((entry) => entry.title && entry.url);

  return { items: items.slice(0, MAX_ITEMS), total: items.length };
}

// Ubah hasil mentah scraper jadi bentuk seragam. Balikin null kalau isinya kosong.
function normalizeResult(raw) {
  const r = raw && raw.result && typeof raw.result === "object" ? raw.result : null;
  if (!r) return null;

  const title = text(r.title) || text(r.filename) || "Media Ditemukan";
  let downloads = uniqueByUrl(onlyObjects(r.downloads).map(normalizeDownload));
  const tracks = buildTracks(r);
  const { items, total } = buildItems(r);

  // lagu pertama di playlist Spotify sudah di-resolve, kasih tau itu lagu yang mana
  const firstTrack = onlyObjects(r.tracks)[0];
  if (items.length && downloads.length && firstTrack) {
    const firstTitle = text(firstTrack.title);
    if (firstTitle) downloads = downloads.map((d) => ({ ...d, note: d.note || `Lagu 1 · ${firstTitle}` }));
  }

  if (tracks.length === 1 && !downloads.length) downloads = tracks[0].downloads;

  // kalau sudah dikelompokkan per lagu, daftar datar-nya ga perlu lagi
  if (tracks.length > 1) downloads = [];

  let itemsTitle = "Pilih salah satu";

  // hasil shortlink cuma berupa alamat tujuan, kasih jalan buat lanjut diproses
  // (misal ternyata tujuannya video TikTok atau file MediaFire)
  if (!items.length && downloads.length === 1 && downloads[0].kind === "link") {
    items.push({
      title: "Proses link tujuan",
      subtitle: hostOf(downloads[0].url),
      thumbnail: "",
      url: downloads[0].url,
    });
    itemsTitle = "Lanjutkan";
  }

  if (!downloads.length && !tracks.length && !items.length) return null;

  return {
    title,
    subtitle: buildSubtitle(r, title),
    thumbnail: thumbUrl(r.thumbnail || r.cover),
    type: text(r.type) || "media",
    downloads,
    tracks: tracks.length > 1 ? tracks : [],
    items,
    itemsTitle,
    moreItems: Math.max(0, total - Math.min(total, MAX_ITEMS)),
  };
}

module.exports = { normalizeResult };
