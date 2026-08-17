let slides = [];
let currentIndex = 0;
let timer = null;
const SLIDE_DURATION = 5000;

async function startPlayer() {
    slides = await getAllMedia();
    if (slides.length === 0) {
        document.getElementById("slide-content").innerHTML = 
            `<h3 style="color:white;text-align:center;">Belum ada konten tersimpan.<br>Buka menu Admin & lakukan Sync Google Drive.</h3>`;
    } else {
        renderCurrentSlide();
    }

    checkAndAutoSync();
    
    const savedInterval = (await getSetting("sync_interval")) || 2;
    setInterval(checkAndAutoSync, savedInterval * 60 * 1000);
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

async function checkAndAutoSync() {
    if (!navigator.onLine) return;

    const apiKey = await getSetting("api_key");
    const folderId = await getSetting("folder_id");

    if (!apiKey || !folderId) return;

    try {
        const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,modifiedTime)&key=${apiKey}`;
        
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        if (!data.files) return;

        const localMedia = await getAllMedia();
        const driveFiles = data.files.filter(f => f.mimeType.startsWith("image/") || f.mimeType.startsWith("video/"));
        
        let needSync = false;

        if (driveFiles.length !== localMedia.length) {
            needSync = true;
        } else {
            for (let df of driveFiles) {
                const matchedLocal = localMedia.find(lm => lm.id === df.id);
                if (!matchedLocal || matchedLocal.modifiedTime !== df.modifiedTime) {
                    needSync = true;
                    break;
                }
            }
        }

        if (needSync) {
            console.log("Perubahan di Google Drive terdeteksi. Memulai Auto-Sync...");
            await performBackgroundSync(driveFiles, apiKey);
        }

    } catch (err) {
        console.warn("Auto-sync terhenti karena kendala koneksi.");
    }
}

async function performBackgroundSync(driveFiles, apiKey) {
    const downloadedMedia = [];

    for (let file of driveFiles) {
        try {
            const fileUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&key=${apiKey}`;
            const blobRes = await fetch(fileUrl);
            const blob = await blobRes.blob();

            downloadedMedia.push({
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

    await saveMediaFiles(downloadedMedia);
    slides = await getAllMedia();
    
    if (currentIndex >= slides.length) {
        currentIndex = 0;
    }

    console.log("✅ Auto-sync berhasil!");
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