const DB_NAME = "GDriveSliderDB";
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("media")) {
                db.createObjectStore("media", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("settings")) {
                db.createObjectStore("settings", { keyPath: "key" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function setSetting(key, val) {
    const db = await openDB();
    const tx = db.transaction("settings", "readwrite");
    tx.objectStore("settings").put({ key, val });
}

async function getSetting(key) {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("settings", "readonly");
        const req = tx.objectStore("settings").get(key);
        req.onsuccess = () => resolve(req.result ? req.result.val : null);
    });
}

async function saveMediaFiles(fileList) {
    const db = await openDB();
    const tx = db.transaction("media", "readwrite");
    const store = tx.objectStore("media");
    store.clear();
    fileList.forEach(item => store.put(item));
}

async function getAllMedia() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction("media", "readonly");
        const req = tx.objectStore("media").getAll();
        req.onsuccess = () => resolve(req.result || []);
    });
}