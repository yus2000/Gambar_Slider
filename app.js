let slides = [];
let currentIndex = 0;
let timer = null;
const SLIDE_DURATION = 5000; // Durasi gambar (5 detik)
const REALTIME_CHECK_INTERVAL = 10 * 1000; // Cek tiap 10 detik

async function startPlayer() {
    slides = await getAllMedia();
    
    if (slides.length === 0) {
        document.getElementById("slide-content").innerHTML = 
            `<h3 style="color:white;text-align:center;">Belum ada konten tersimpan.<br>Buka menu Admin & lakukan Sync Google Drive.</h3>`;
    } else {
        renderCurrentSlide();
    }

    // Jalankan Pengecekan Cepat
    checkRealtimeChanges();
    setInterval(checkRealtimeChanges, REALTIME_CHECK_INTERVAL);
}

function renderCurrentSlide() {
    if (slides.length === 0) return;
    clearTimeout(timer);
    
    const container = document.getElementById("slide-content");
    const item = slides[currentIndex];
    
    if (container.dataset.blobUrl) {
        URL.revokeObjectURL(container.dataset.blobUrl);
    }
    
    const blobUrl = URL.createObjectURL(item.blob);
    container.dataset.blobUrl = blobUrl;

    if (item.type === "image") {
        container.innerHTML = `<img src="${blobUrl}">`;
        timer = setTimeout(nextSlide, SLIDE_DURATION);
    } else if (item.type === "video") {
        container.innerHTML = `<video src="${blobUrl}" autoplay muted onended="nextSlide()"></video>`;
    }
}

function nextSlide() {
    if (slides.length === 0) return;
    currentIndex = (currentIndex + 1) % slides.length;
    renderCurrentSlide();
}

// ==========================================
// PENGECEKAN REAL-TIME DENGAN ANTI-CACHE
// ==========================================
async function checkRealtimeChanges() {
    if (!navigator.onLine) return;

    const apiKey = await getSetting("api_key");
    const folderId = await getSetting("folder_id");

    if (!apiKey || !folderId) return;

    try {
        // PERBAIKAN 1: Tambahkan &_t=${Date.now()} untuk MENCEGAH BROWSER CACHING
        const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,modifiedTime)&key=${apiKey}&_t=${Date.now()}`;
        
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();

        if (!data.files) return;

        const driveFiles = data.files.filter(f => f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/"));
        const localMedia = await getAllMedia();
        
        let hasChanges = false;

        // Bandingkan jumlah atau ID/waktu modifikasi
        if (driveFiles.length !== localMedia.length) {
            hasChanges = true;
        } else {
            for (let df of driveFiles) {
                const matched = localMedia.find(lm => lm.id === df.id);
                if (!matched || matched.modifiedTime !== df.modifiedTime) {
                    hasChanges = true;
                    break;
                }
            }
        }

        if (hasChanges) {
            console.log("⚡ Ada perubahan di Drive! Mengunduh ulang...");
            await updatePlaylistInstantly(driveFiles, apiKey);
        }

    } catch (err) {
        console.warn("Gagal mengecek update Drive:", err);
    }
}

async function updatePlaylistInstantly(driveFiles, apiKey) {
    const updatedMedia = [];

    for (let file of driveFiles) {
        try {
            // Anti-cache juga pada saat download file fisik
            const fileUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}&_t=${Date.now()}`;
            const blobRes = await fetch(fileUrl, { cache: "no-store" });
            const blob = await blobRes.blob();

            updatedMedia.push({
                id: file.id,
                name: file.name,
                type: file.mimeType.startsWith("video") ? "video" : "image",
                modifiedTime: file.modifiedTime,
                blob: blob
            });
        } catch (e) {
            console.error("Gagal unduh file:", file.name);
            return;
        }
    }

    // PERBAIKAN 2: Simpan data baru
    await saveMediaFiles(updatedMedia);
    
    // Perbarui variabel slides di memori lokal
    slides = await getAllMedia();

    if (currentIndex >= slides.length) {
        currentIndex = 0;
    }

    // Jika slider sedang menampilkan pesan kosong, putar langsung
    if (document.getElementById("slide-content").innerText.includes("Belum ada konten")) {
        renderCurrentSlide();
    } else {
        // Tampilkan slide terbaru pada putaran berikutnya
        console.log("✅ Playlist berhasil diperbarui untuk putaran berikutnya!");
    }
}

function toggleFullScreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

if (document.getElementById("slide-content")) {
    window.onload = startPlayer;
}