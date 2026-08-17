let slides = [];
let currentIndex = 0;
let timer = null;
const SLIDE_DURATION = 5000; // Durasi tampil gambar (5 detik)
const REALTIME_CHECK_INTERVAL = 10 * 1000; // Cek perubahan tiap 10 detik

async function startPlayer() {
    slides = await getAllMedia();
    
    if (slides.length === 0) {
        document.getElementById("slide-content").innerHTML = 
            `<h3 style="color:white;text-align:center;">Belum ada konten tersimpan.<br>Buka menu Admin & lakukan Sync Google Drive.</h3>`;
    } else {
        renderCurrentSlide();
    }

    // Jalankan pengecekan cepat secara berkala
    checkRealtimeChanges();
    setInterval(checkRealtimeChanges, REALTIME_CHECK_INTERVAL);
}

function renderCurrentSlide() {
    if (slides.length === 0) return;
    clearTimeout(timer);
    
    const container = document.getElementById("slide-content");
    const item = slides[currentIndex];
    
    // Revoke URL lokal lama untuk mencegah kebocoran memori (memory leak)
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
// PENGECEKAN REAL-TIME DI LATAR BELAKANG
// ==========================================
async function checkRealtimeChanges() {
    // Jika tidak ada koneksi internet, lewati (tetap jalan offline)
    if (!navigator.onLine) return;

    const apiKey = await getSetting("api_key");
    const folderId = await getSetting("folder_id");

    if (!apiKey || !folderId) return;

    try {
        // Panggil metadata ringan dari Google Drive (hanya butuh waktu < 1 detik)
        const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,modifiedTime)&key=${apiKey}`;
        
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        if (!data.files) return;

        const driveFiles = data.files.filter(f => f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/"));
        const localMedia = await getAllMedia();
        
        let hasChanges = false;

        // 1. Cek jika jumlah file berbeda
        if (driveFiles.length !== localMedia.length) {
            hasChanges = true;
        } else {
            // 2. Cek jika ada file yang diubah / diganti
            for (let df of driveFiles) {
                const matched = localMedia.find(lm => lm.id === df.id);
                if (!matched || matched.modifiedTime !== df.modifiedTime) {
                    hasChanges = true;
                    break;
                }
            }
        }

        // Jika terdeteksi ada perubahan di Drive, langsung update playlist!
        if (hasChanges) {
            console.log("⚡ Perubahan terdeteksi di Google Drive! Memperbarui slider...");
            await updatePlaylistInstantly(driveFiles, apiKey);
        }

    } catch (err) {
        console.warn("Pengecekan real-time terhenti:", err);
    }
}

async function updatePlaylistInstantly(driveFiles, apiKey) {
    const updatedMedia = [];

    for (let file of driveFiles) {
        try {
            const fileUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`;
            const blobRes = await fetch(fileUrl);
            const blob = await blobRes.blob();

            updatedMedia.push({
                id: file.id,
                name: file.name,
                type: file.mimeType.startsWith("video") ? "video" : "image",
                modifiedTime: file.modifiedTime,
                blob: blob
            });
        } catch (e) {
            console.error("Gagal mengunduh file:", file.name);
            return;
        }
    }

    // Simpan ke IndexedDB
    await saveMediaFiles(updatedMedia);
    
    // Perbarui array slides di memori
    slides = updatedMedia;

    // Koreksi index agar tidak out of bounds jika ada file yang dihapus
    if (currentIndex >= slides.length) {
        currentIndex = 0;
    }

    // Jika slider sebelumnya kosong, langsung tampilkan
    if (document.getElementById("slide-content").innerHTML.includes("Belum ada konten")) {
        renderCurrentSlide();
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