import { 
    db, 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    updateDoc, 
    deleteDoc, 
    serverTimestamp 
} from "./firebase.js";

// ==========================================
// GITHUB STORAGE CONFIGURATION
// ==========================================
const GITHUB_USERNAME = "shivambhatt5451-collab";
const GITHUB_REPO = "musicspot";
const GITHUB_BRANCH = "main";
const GITHUB_TOKEN = "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";

// State Management
let songs = [];
let queue = [];
let currentSongIndex = -1;
let isPlaying = false;
let showOnlyFavorites = false;
let currentPitchSemitones = 0;
let currentPlaybackSpeed = 1.0;
let pitchModulationEnabled = false;

// Web Audio API Setup
const audioElement = document.getElementById("audioElement");
let audioCtx = null;
let sourceNode = null;

function initAudioEngine() {
    try {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
            sourceNode = audioCtx.createMediaElementSource(audioElement);
            sourceNode.connect(audioCtx.destination);
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    } catch (e) {
        console.warn("Web Audio API warning:", e);
    }
}

// DOM References
const splashScreen = document.getElementById("splash-screen");
const mainApp = document.getElementById("app");
const fileInput = document.getElementById("fileInput");
const songList = document.getElementById("songList");
const libraryCount = document.getElementById("library-count");
const searchInput = document.getElementById("searchInput");
const toast = document.getElementById("toast");

// Player DOM
const playerBar = document.getElementById("player-bar");
const playerTitle = document.getElementById("playerTitle");
const playerArtist = document.getElementById("playerArtist");
const playPauseBtn = document.getElementById("playPauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const progressBar = document.getElementById("progressBar");
const progressBarContainer = document.getElementById("progressBarContainer");

// Pitch & Speed DOM
const pitchSlider = document.getElementById("pitchSlider");
const pitchDisplay = document.getElementById("pitchDisplay");
const pitchToggle = document.getElementById("pitchToggle");
const customPitchInput = document.getElementById("customPitchInput");
const applyCustomPitchBtn = document.getElementById("applyCustomPitchBtn");
const speedDisplay = document.getElementById("speedDisplay");
const customSpeedInput = document.getElementById("customSpeedInput");
const applyCustomSpeedBtn = document.getElementById("applyCustomSpeedBtn");

// Modals & Navigation
const navQueue = document.getElementById("navQueue");
const navPitch = document.getElementById("navPitch");
const navSpeed = document.getElementById("navSpeed");
const navLibrary = document.getElementById("navLibrary");
const queueModal = document.getElementById("queueModal");
const pitchModal = document.getElementById("pitchModal");
const speedModal = document.getElementById("speedModal");
const queueList = document.getElementById("queueList");
const clearQueueBtn = document.getElementById("clearQueueBtn");
const filterFavoritesBtn = document.getElementById("filterFavoritesBtn");
const filterRecentBtn = document.getElementById("filterRecentBtn");

// 1. Splash Screen Dismissal
function dismissSplash() {
    if (splashScreen) splashScreen.classList.add("hidden");
    if (mainApp) mainApp.classList.remove("hidden");
}

setTimeout(() => {
    dismissSplash();
    fetchLibrary();
}, 3000);

// Toast Utility
function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.style.borderColor = isError ? "var(--danger)" : "var(--accent)";
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 3500);
}

// 2. Fetch Songs from Firestore
async function fetchLibrary() {
    if (!db) {
        showToast("Firebase Firestore not initialized.", true);
        return;
    }
    try {
        const querySnapshot = await getDocs(collection(db, "songs"));
        songs = [];
        querySnapshot.forEach((docSnapshot) => {
            songs.push({ id: docSnapshot.id, ...docSnapshot.data() });
        });
        renderLibrary();
    } catch (error) {
        console.error("Firestore retrieval error:", error);
        showToast("Failed to load library: " + error.message, true);
        renderLibrary();
    }
}

// 3. Render Library to UI
function renderLibrary() {
    if (!songList) return;
    const searchTerm = (searchInput ? searchInput.value : "").toLowerCase();
    let displaySongs = songs.filter(song => {
        const title = (song.title || "").toLowerCase();
        const artist = (song.artist || "").toLowerCase();
        const album = (song.album || "").toLowerCase();
        const matchesSearch = title.includes(searchTerm) || artist.includes(searchTerm) || album.includes(searchTerm);
        const matchesFav = showOnlyFavorites ? song.favorite === true : true;
        return matchesSearch && matchesFav;
    });

    if (libraryCount) libraryCount.textContent = `${displaySongs.length} Songs`;
    songList.innerHTML = "";

    if (displaySongs.length === 0) {
        songList.innerHTML = `<div style="text-align:center; color:#777; margin-top:2rem;">No audio tracks found.</div>`;
        return;
    }

    displaySongs.forEach((song) => {
        const card = document.createElement("div");
        card.className = "song-card";
        card.innerHTML = `
            <div class="song-art"><i class="fa-solid fa-music"></i></div>
            <div class="song-details">
                <div class="song-name">${song.title || 'Untitled'}</div>
                <div class="song-subtext">${song.artist || 'Unknown'} • ${formatTime(song.duration)}</div>
            </div>
            <div class="song-actions">
                <i class="fa-solid fa-heart ${song.favorite ? 'active' : ''}" data-fav="${song.id}"></i>
                <i class="fa-solid fa-trash" data-del="${song.id}"></i>
            </div>
        `;

        card.querySelector(".song-details").addEventListener("click", () => playSong(song));
        card.querySelector("[data-fav]").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(song.id, !song.favorite);
        });
        card.querySelector("[data-del]").addEventListener("click", (e) => {
            e.stopPropagation();
            deleteSong(song);
        });

        songList.appendChild(card);
    });
}

// 4. Safe Base64 Chunk Reader
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        reader.onload = () => {
            const bytes = new Uint8Array(reader.result);
            let binary = "";
            const chunkSize = 8192;
            for (let i = 0; i < bytes.byteLength; i += chunkSize) {
                const chunk = bytes.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, chunk);
            }
            resolve(btoa(binary));
        };
        reader.onerror = error => reject(error);
    });
}

// 5. File Upload Handler (GitHub API + Firestore Metadata)
if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith(".mp3") && !file.type.includes("audio")) {
            showToast("Invalid file. Please select an MP3 audio track.", true);
            return;
        }

        const uniqueId = "song_" + Date.now();
        const extension = file.name.split('.').pop() || "mp3";
        const safeFileName = `${uniqueId}.${extension}`;
        const filePath = `songs/${safeFileName}`;

        showToast("Encoding audio binary...");

        try {
            // Step 1: Base64 encode file
            const base64Content = await fileToBase64(file);

            showToast("Uploading MP3 to GitHub Repository...");

            // Step 2: Push binary to GitHub Repository
            const ghUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${filePath}`;
            const ghResponse = await fetch(ghUrl, {
                method: "PUT",
                headers: {
                    "Authorization": `Bearer ${GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github.v3+json",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: `Upload track: ${file.name}`,
                    content: base64Content,
                    branch: GITHUB_BRANCH
                })
            });

            const ghData = await ghResponse.json();

            if (!ghResponse.ok) {
                console.error("GitHub API Error:", ghData);
                alert(`GitHub Upload Failed (${ghResponse.status}):\n${ghData.message || JSON.stringify(ghData)}`);
                showToast("GitHub upload rejected.", true);
                return;
            }

            // Step 3: Streamable CDN URL via jsDelivr
            const streamAudioURL = `https://cdn.jsdelivr.net/gh/${GITHUB_USERNAME}/${GITHUB_REPO}@${GITHUB_BRANCH}/${filePath}`;

            // Step 4: Extract audio duration
            let duration = 0;
            try {
                const tempAudio = new Audio();
                tempAudio.src = URL.createObjectURL(file);
                await new Promise((resolve) => {
                    tempAudio.onloadedmetadata = () => {
                        duration = Math.round(tempAudio.duration) || 0;
                        resolve();
                    };
                    tempAudio.onerror = () => resolve();
                    setTimeout(resolve, 1500);
                });
            } catch (err) {
                console.warn("Duration extraction fallback applied:", err);
            }

            showToast("Saving metadata to Firestore...");

            // Step 5: Save metadata in Firestore
            const songDocData = {
                id: uniqueId,
                title: file.name.replace(/\.[^/.]+$/, ""),
                artist: "Unknown Artist",
                album: "My Music",
                duration: duration,
                audioURL: streamAudioURL,
                storagePath: filePath,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type || "audio/mpeg",
                favorite: false,
                createdAt: serverTimestamp()
            };

            await setDoc(doc(db, "songs", uniqueId), songDocData);

            showToast("Track uploaded successfully!");
            fileInput.value = "";
            fetchLibrary();

        } catch (error) {
            console.error("Upload Error:", error);
            alert("Upload Failed: " + error.message);
            showToast("Upload Error: " + error.message, true);
        }
    });
}

// 6. Playback Controller
function playSong(song) {
    initAudioEngine();
    
    currentSongIndex = songs.findIndex(s => s.id === song.id);
    audioElement.src = song.audioURL;
    
    applyPitchAndSpeed();
    
    audioElement.play()
        .then(() => {
            isPlaying = true;
            if (playerTitle) playerTitle.textContent = song.title;
            if (playerArtist) playerArtist.textContent = song.artist;
            if (playPauseBtn) playPauseBtn.innerHTML = `<i class="fa-solid fa-pause"></i>`;
            if (playerBar) playerBar.classList.remove("hidden");
        })
        .catch(err => {
            console.error("Playback error:", err);
            showToast("Streaming audio failed: " + err.message, true);
        });
}

function togglePlay() {
    if (!audioElement.src) return;
    initAudioEngine();
    if (isPlaying) {
        audioElement.pause();
        if (playPauseBtn) playPauseBtn.innerHTML = `<i class="fa-solid fa-play"></i>`;
        isPlaying = false;
    } else {
        audioElement.play();
        if (playPauseBtn) playPauseBtn.innerHTML = `<i class="fa-solid fa-pause"></i>`;
        isPlaying = true;
    }
}

// 7. Pitch & Speed Architecture
function applyPitchAndSpeed() {
    let effectiveRate = currentPlaybackSpeed;
    if (pitchModulationEnabled) {
        const semitoneMultiplier = Math.pow(2, currentPitchSemitones / 12);
        effectiveRate = currentPlaybackSpeed * semitoneMultiplier;
    }
    audioElement.playbackRate = Math.min(Math.max(effectiveRate, 0.25), 4.0);
    audioElement.preservesPitch = !pitchModulationEnabled;
}

if (pitchToggle) {
    pitchToggle.addEventListener("change", (e) => {
        pitchModulationEnabled = e.target.checked;
        applyPitchAndSpeed();
    });
}

if (pitchSlider) {
    pitchSlider.addEventListener("input", (e) => {
        currentPitchSemitones = parseFloat(e.target.value);
        if (pitchDisplay) pitchDisplay.textContent = (currentPitchSemitones > 0 ? "+" : "") + currentPitchSemitones;
        applyPitchAndSpeed();
    });
}

document.querySelectorAll(".chip[data-pitch]").forEach(btn => {
    btn.addEventListener("click", () => {
        currentPitchSemitones = parseFloat(btn.dataset.pitch);
        if (pitchSlider) pitchSlider.value = currentPitchSemitones;
        if (pitchDisplay) pitchDisplay.textContent = (currentPitchSemitones > 0 ? "+" : "") + currentPitchSemitones;
        applyPitchAndSpeed();
    });
});

if (applyCustomPitchBtn) {
    applyCustomPitchBtn.addEventListener("click", () => {
        const val = parseFloat(customPitchInput.value);
        if (!isNaN(val) && val >= -12 && val <= 12) {
            currentPitchSemitones = val;
            if (pitchSlider) pitchSlider.value = val;
            if (pitchDisplay) pitchDisplay.textContent = (val > 0 ? "+" : "") + val;
            applyPitchAndSpeed();
        }
    });
}

document.querySelectorAll(".speed-chip").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".speed-chip").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        currentPlaybackSpeed = parseFloat(btn.dataset.speed);
        if (speedDisplay) speedDisplay.textContent = currentPlaybackSpeed.toFixed(2);
        applyPitchAndSpeed();
    });
});

if (applyCustomSpeedBtn) {
    applyCustomSpeedBtn.addEventListener("click", () => {
        const val = parseFloat(customSpeedInput.value);
        if (!isNaN(val) && val >= 0.25 && val <= 4.0) {
            currentPlaybackSpeed = val;
            if (speedDisplay) speedDisplay.textContent = val.toFixed(2);
            applyPitchAndSpeed();
        }
    });
}

// 8. Progress Bar & Seeking
audioElement.addEventListener("timeupdate", () => {
    if (audioElement.duration && progressBar) {
        const pct = (audioElement.currentTime / audioElement.duration) * 100;
        progressBar.style.width = `${pct}%`;
    }
});

if (progressBarContainer) {
    progressBarContainer.addEventListener("click", (e) => {
        if (!audioElement.duration) return;
        const rect = progressBarContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const targetTime = (clickX / rect.width) * audioElement.duration;
        audioElement.currentTime = targetTime;
    });
}

// 9. Track Navigation
function playNext() {
    if (queue.length > 0) {
        const nextTrack = queue.shift();
        renderQueue();
        playSong(nextTrack);
    } else if (songs.length > 0 && currentSongIndex < songs.length - 1) {
        playSong(songs[currentSongIndex + 1]);
    }
}

function playPrev() {
    if (songs.length > 0 && currentSongIndex > 0) {
        playSong(songs[currentSongIndex - 1]);
    }
}

audioElement.addEventListener("ended", playNext);
if (playPauseBtn) playPauseBtn.addEventListener("click", togglePlay);
if (nextBtn) nextBtn.addEventListener("click", playNext);
if (prevBtn) prevBtn.addEventListener("click", playPrev);

// 10. Queue Handlers
function renderQueue() {
    if (!queueList) return;
    queueList.innerHTML = "";
    if (queue.length === 0) {
        queueList.innerHTML = `<div style="text-align:center; color:#777; margin: 1rem 0;">Queue is empty</div>`;
        return;
    }
    queue.forEach((song, idx) => {
        const qItem = document.createElement("div");
        qItem.className = "song-card";
        qItem.innerHTML = `
            <div class="song-details">
                <div class="song-name">${song.title}</div>
                <div class="song-subtext">${song.artist}</div>
            </div>
            <div class="song-actions">
                <i class="fa-solid fa-xmark" data-remove="${idx}"></i>
            </div>
        `;
        qItem.querySelector("[data-remove]").addEventListener("click", () => {
            queue.splice(idx, 1);
            renderQueue();
        });
        queueList.appendChild(qItem);
    });
}

if (clearQueueBtn) {
    clearQueueBtn.addEventListener("click", () => {
        queue = [];
        renderQueue();
    });
}

// 11. Favorites Toggle
async function toggleFavorite(songId, status) {
    try {
        await updateDoc(doc(db, "songs", songId), { favorite: status });
        const songObj = songs.find(s => s.id === songId);
        if (songObj) songObj.favorite = status;
        renderLibrary();
    } catch (err) {
        console.error("Failed to update favorite status:", err);
        showToast("Error updating favorite: " + err.message, true);
    }
}

// 12. Delete Flow
async function deleteSong(song) {
    if (!confirm(`Are you sure you want to delete "${song.title}"?`)) return;

    try {
        // Step 1: Query GitHub for file SHA
        const ghFileUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${song.storagePath}`;
        const fileRes = await fetch(ghFileUrl, {
            headers: { "Authorization": `Bearer ${GITHUB_TOKEN}` }
        });

        if (fileRes.ok) {
            const fileData = await fileRes.json();
            // Step 2: Delete binary from GitHub
            await fetch(ghFileUrl, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${GITHUB_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: `Delete track: ${song.title}`,
                    sha: fileData.sha,
                    branch: GITHUB_BRANCH
                })
            });
        }

        // Step 3: Delete Firestore document
        await deleteDoc(doc(db, "songs", song.id));

        if (audioElement.src === song.audioURL) {
            audioElement.pause();
            audioElement.src = "";
            if (playerBar) playerBar.classList.add("hidden");
            isPlaying = false;
        }

        songs = songs.filter(s => s.id !== song.id);
        queue = queue.filter(s => s.id !== song.id);
        renderLibrary();
        renderQueue();

        showToast("Song deleted permanently.");
    } catch (error) {
        console.error("Delete operation failed:", error);
        showToast("Delete failed: " + error.message, true);
    }
}

// Modal Toggle Navigation
if (navQueue) {
    navQueue.addEventListener("click", () => {
        renderQueue();
        queueModal.classList.toggle("hidden");
        pitchModal.classList.add("hidden");
        speedModal.classList.add("hidden");
    });
}

if (navPitch) {
    navPitch.addEventListener("click", () => {
        pitchModal.classList.toggle("hidden");
        queueModal.classList.add("hidden");
        speedModal.classList.add("hidden");
    });
}

if (navSpeed) {
    navSpeed.addEventListener("click", () => {
        speedModal.classList.toggle("hidden");
        pitchModal.classList.add("hidden");
        queueModal.classList.add("hidden");
    });
}

if (navLibrary) {
    navLibrary.addEventListener("click", () => {
        queueModal.classList.add("hidden");
        pitchModal.classList.add("hidden");
        speedModal.classList.add("hidden");
    });
}

document.querySelectorAll(".modal-close").forEach(btn => {
    btn.addEventListener("click", () => {
        const target = document.getElementById(btn.dataset.close);
        if (target) target.classList.add("hidden");
    });
});

if (filterFavoritesBtn) {
    filterFavoritesBtn.addEventListener("click", () => {
        showOnlyFavorites = true;
        filterFavoritesBtn.classList.add("active");
        if (filterRecentBtn) filterRecentBtn.classList.remove("active");
        renderLibrary();
    });
}

if (filterRecentBtn) {
    filterRecentBtn.addEventListener("click", () => {
        showOnlyFavorites = false;
        filterRecentBtn.classList.add("active");
        if (filterFavoritesBtn) filterFavoritesBtn.classList.remove("active");
        renderLibrary();
    });
}

if (searchInput) {
    searchInput.addEventListener("input", renderLibrary);
}

function formatTime(secs) {
    if (isNaN(secs) || secs === undefined) return "0:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}