// --- API SCHLÜSSEL ---
const PIXABAY_KEY = '55407865-e0aa3f47b82bc64c318018f21';
const PEXELS_KEY = 'FDUpT5ntSabJvIIO72985ip5QvVULAtDTdYD3TXFQj7X5m1W74tb1Z38'; // <--- Füge deinen Pexels-Key hier zwischen die Anführungszeichen ein!

let videoDrehbuch = [];
let fertigeAudioDatei = null;

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

// --- TEIL 0: AUTO-SAVE (Indexed-DB) ---
function autoSave() {
    localforage.setItem('legeVideoProject', {
        drehbuch: videoDrehbuch,
        audioBlob: fertigeAudioDatei
    }).catch(err => console.log("Auto-Save Fehler:", err));
}

/// Prüft beim Start, ob ein Absturz/Reload passiert ist
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const savedData = await localforage.getItem('legeVideoProject');
        if (savedData && (savedData.drehbuch.length > 0 || savedData.audioBlob)) {
            if (confirm("💾 Es wurde ein ungespeicherter Fortschritt gefunden!\n\nMöchtest du genau dort weitermachen, wo du aufgehört hast?")) {
                videoDrehbuch = savedData.drehbuch || [];
                if (savedData.audioBlob) {
                    fertigeAudioDatei = savedData.audioBlob;
                    audioPlayback.src = URL.createObjectURL(fertigeAudioDatei);
                    actionButtons.style.display = 'flex';

                    // NEU: Zwingt den Browser, die Striche nachzuladen, sobald das Audio sicher bereit ist
                    setTimeout(zeichneTimelineNeu, 500);
                    setTimeout(zeichneTimelineNeu, 1500);
                }
                updateProtokoll();
                rekonstruiereLeinwand(0);
            } else {
                localforage.removeItem('legeVideoProject');
            }
        }
    } catch (e) { console.error("Fehler beim Laden des Auto-Saves", e); }
});

// --- TEIL 1: PROTOKOLL & TIMELINE NEU ZEICHNEN ---
function updateProtokoll() {
    const protocolList = document.getElementById('protocolList');
    protocolList.innerHTML = '';

    if (videoDrehbuch.length === 0) {
        protocolList.innerHTML = '<li style="justify-content: center; color: #999; font-style: italic;">Noch keine Aktionen...</li>';
        return;
    }

    const sortiertesDrehbuch = [...videoDrehbuch].sort((a, b) => a.zeit - b.zeit);

    sortiertesDrehbuch.forEach(aktion => {
        const li = document.createElement('li');
        let titel = ''; let icon = '';

        if (aktion.aktion === 'bild_hinzufuegen') { titel = 'Bild platziert'; icon = '🖼️'; }
        else if (aktion.aktion === 'text_hinzufuegen') { titel = 'Text: ' + (aktion.text.substring(0,8) + '...'); icon = '✍️'; }
        else if (aktion.aktion === 'alles_wischen') { titel = 'Alles wischen'; icon = '🧹'; }

        li.innerHTML = `
            <div>
                <span>${icon} ${titel}</span>
                <span class="time-badge">${aktion.zeit.toFixed(1)}s</span>
            </div>
            <button class="delete-action-btn" title="Aktion löschen" onclick="loescheAktionManuell('${aktion.id}')">❌</button>
        `;
        protocolList.appendChild(li);
    });
}

window.loescheAktionManuell = function(id) {
    autoPause();
    videoDrehbuch = videoDrehbuch.filter(item => item.id !== id);
    const markerDiv = document.querySelector(`.marker-div[data-id="${id}"]`);
    if (markerDiv) markerDiv.remove();

    const objectOnCanvas = canvas.getObjects().find(o => o.myId === id);
    if (objectOnCanvas) canvas.remove(objectOnCanvas);
    else rekonstruiereLeinwand(audioPlayback.currentTime || 0);

    updateProtokoll(); autoSave();
};

function zeichneTimelineNeu() {
    const markersContainer = document.getElementById('markers');
    if (!markersContainer) return;
    markersContainer.innerHTML = '';

    // Abbruch, wenn das Audio noch gar nicht geladen ist
    if (!audioPlayback.duration || isNaN(audioPlayback.duration)) return;

    let duration = audioPlayback.duration;

    // FIX: Falls der Browser bei aufgenommenen Audios "Infinity" (unendlich) als Länge meldet
    if (!isFinite(duration)) {
        if (videoDrehbuch.length > 0) {
            // Wir nehmen einfach die Zeit des allerletzten Bildes + 3 Sekunden als Notfall-Länge
            const letzterEintrag = [...videoDrehbuch].sort((a, b) => a.zeit - b.zeit).pop();
            duration = letzterEintrag.zeit + 3;
        } else {
            return; // Noch keine Bilder da
        }
    }

    videoDrehbuch.forEach(aktion => {
        let color = aktion.aktion === 'alles_wischen' ? 'var(--warning)' : 'rgba(142,68,173,0.7)';
        const marker = document.createElement('div');
        marker.className = 'marker-div'; marker.dataset.id = aktion.id;
        marker.style.position = 'absolute';
        marker.style.left = (aktion.zeit / duration) * 100 + "%";
        marker.style.width = '4px'; marker.style.height = '100%'; marker.style.backgroundColor = color;
        markersContainer.appendChild(marker);
    });
}

const audioPlayback = document.getElementById('audioPlayback');
const actionButtons = document.getElementById('actionButtons');
audioPlayback.addEventListener('loadedmetadata', zeichneTimelineNeu);


// --- TEIL 2: AUDIO (AUFNAHME & UPLOAD) ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

const recordBtn = document.getElementById('recordBtn');
const audioUpload = document.getElementById('audioUpload');

recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                fertigeAudioDatei = audioBlob; audioPlayback.src = URL.createObjectURL(audioBlob);
                actionButtons.style.display = 'flex'; audioChunks = []; autoSave();
            };
            mediaRecorder.start(); isRecording = true;
            recordBtn.innerHTML = "⏹️ Stoppen"; recordBtn.classList.add("recording");
        } catch (err) { alert("Mikrofon-Zugriff verweigert!"); }
    } else {
        mediaRecorder.stop(); mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false; recordBtn.innerHTML = "🎙️ Aufnehmen"; recordBtn.classList.remove("recording");
        videoDrehbuch = []; document.getElementById('markers').innerHTML = ''; canvas.clear(); updateProtokoll(); autoSave();
    }
});

audioUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        fertigeAudioDatei = file; audioPlayback.src = URL.createObjectURL(file);
        actionButtons.style.display = 'flex';
        if (videoDrehbuch.length > 0) {
            if (!confirm("Du hast ein neues Audio hochgeladen.\nSoll dein bisheriges Lege-Video Projekt erhalten bleiben?")) {
                videoDrehbuch = []; canvas.clear(); updateProtokoll(); document.getElementById('markers').innerHTML = '';
            }
        }
        autoSave();
    }
    this.value = '';
});


// --- TEIL 3: SPEICHERN & LADEN (MANUELL) ---
document.getElementById('saveProjectBtn').addEventListener('click', () => {
    if (videoDrehbuch.length === 0 && !fertigeAudioDatei) { alert("Es gibt noch nichts zu speichern!"); return; }
    let projektDaten = { drehbuch: videoDrehbuch, audioData: null };
    if (fertigeAudioDatei) {
        const reader = new FileReader();
        reader.onloadend = () => { projektDaten.audioData = reader.result; downloadJson(projektDaten); };
        reader.readAsDataURL(fertigeAudioDatei);
    } else downloadJson(projektDaten);
});

function downloadJson(daten) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(daten));
    const a = document.createElement('a'); a.href = dataStr; a.download = "mein_legevideo_projekt.json";
    document.body.appendChild(a); a.click(); a.remove();
}

document.getElementById('loadProjectInput').addEventListener('change', function(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const parsedData = JSON.parse(e.target.result);
            videoDrehbuch = parsedData.drehbuch || parsedData;
            updateProtokoll(); rekonstruiereLeinwand(0);

            if (parsedData.audioData) {
                const res = await fetch(parsedData.audioData); const blob = await res.blob();
                fertigeAudioDatei = blob; audioPlayback.src = URL.createObjectURL(blob);
                actionButtons.style.display = 'flex';
                alert("✅ Projekt inkl. Audio erfolgreich geladen!");
            } else {
                zeichneTimelineNeu(); alert("✅ Projekt geladen (ohne Audio, bitte noch Ton hochladen).");
            }
            autoSave();
        } catch(err) { alert("Fehler beim Laden der Datei."); }
    };
    reader.readAsText(file); this.value = '';
});


// --- TEIL 4: CANVAS & GRÖSSEN-FIX ---
const canvas = new fabric.Canvas('fabricCanvas', { selectionColor: 'rgba(142,68,173,0.1)', selectionLineWidth: 1 });
canvas.on('before:render', function() { const ctx = this.getContext(); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, this.width, this.height); });
canvas.requestRenderAll();

canvas.on('object:modified', function(e) {
    const obj = e.target;
    if (obj && obj.myId) {
        const eintrag = videoDrehbuch.find(item => item.id === obj.myId);
        if (eintrag) {
            eintrag.x = obj.left; eintrag.y = obj.top; eintrag.scaleX = obj.scaleX; eintrag.scaleY = obj.scaleY;
            if (obj.type === 'i-text') { eintrag.text = obj.text; updateProtokoll(); }
            autoSave();
        }
    }
});

function autoPause() { if (!audioPlayback.paused) togglePreview(); }

document.getElementById('addTextBtn').addEventListener('click', () => {
    if (!fertigeAudioDatei) return alert("Bitte zuerst Audio aufnehmen/hochladen!");
    autoPause(); const objId = generateId();
    const text = new fabric.IText('Tippe...', { left: 250, top: 200, fontFamily: 'Comic Sans MS, Arial', fill: '#333333', fontSize: 35, fontWeight: 'bold' });
    text.myId = objId; canvas.add(text); canvas.setActiveObject(text);
    const aktuelleZeit = audioPlayback.currentTime || 0;
    videoDrehbuch.push({ id: objId, zeit: aktuelleZeit, aktion: 'text_hinzufuegen', text: 'Tippe...', x: 250, y: 200, scaleX: 1, scaleY: 1 });
    addMarker(aktuelleZeit, objId, 'rgba(142,68,173,0.7)'); updateProtokoll(); autoSave();
});

document.getElementById('deleteBtn').addEventListener('click', () => {
    autoPause(); const activeObject = canvas.getActiveObject();
    if (activeObject) window.loescheAktionManuell(activeObject.myId);
});

// --- TEIL 5: ANIMIERTES WISCHEN ---
function spieleWischAnimation(sollLeinwandGeloeschtWerden) {
    const wipeArm = document.getElementById('wipeArm');
    wipeArm.style.transition = 'left 0.8s ease-in-out'; wipeArm.style.left = '0%';
    setTimeout(() => { if (sollLeinwandGeloeschtWerden) canvas.clear(); }, 400);
    setTimeout(() => { wipeArm.style.left = '100%'; }, 800);
    setTimeout(() => { wipeArm.style.transition = 'none'; wipeArm.style.left = '-100%'; }, 1600);
}

document.getElementById('clearBtn').addEventListener('click', () => {
    if (!fertigeAudioDatei) return alert("Bitte zuerst Audio aufnehmen/hochladen!");
    autoPause(); spieleWischAnimation(true); const aktuelleZeit = audioPlayback.currentTime || 0;
    const objId = generateId(); videoDrehbuch.push({ id: objId, zeit: aktuelleZeit, aktion: 'alles_wischen' });
    addMarker(aktuelleZeit, objId, 'var(--warning)'); updateProtokoll(); autoSave();
});


// --- TEIL 6: DOPPEL-BILDERSUCHE (Pixabay + Pexels) & DROP ---
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const dropZone = document.getElementById('dropZone');

searchBtn.addEventListener('click', async () => {
    const query = document.getElementById('searchInput').value;
    if (!query) return;

    searchResults.innerHTML = '<i>Suche in Datenbanken läuft...</i>';
    let allResults = [];

    // 1. Pixabay Abfrage (Fokus auf Vektoren, Limit 40)
    try {
        const pixabayUrl = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=vector&per_page=40`;
        const res = await fetch(pixabayUrl);
        const data = await res.json();
        if (data.hits) {
            data.hits.forEach(hit => {
                allResults.push({ preview: hit.previewURL, full: hit.largeImageURL, source: 'Pixabay' });
            });
        }
    } catch (err) { console.error("Pixabay Fehler", err); }

    // 2. Pexels Abfrage (Heimlich "illustration" anhängen, Limit 40)
    try {
        if (PEXELS_KEY !== 'HIER_DEIN_PEXELS_KEY_EINTRAGEN' && PEXELS_KEY !== '') {
            const pexelsQuery = encodeURIComponent(query + " illustration");
            const pexelsUrl = `https://api.pexels.com/v1/search?query=${pexelsQuery}&per_page=40`;
            const res = await fetch(pexelsUrl, { headers: { Authorization: PEXELS_KEY } });
            const data = await res.json();
            if (data.photos) {
                data.photos.forEach(photo => {
                    allResults.push({ preview: photo.src.tiny, full: photo.src.large, source: 'Pexels' });
                });
            }
        }
    } catch (err) { console.error("Pexels Fehler", err); }

    // Ergebnisse rendern
    searchResults.innerHTML = '';
    if (allResults.length === 0) {
        searchResults.innerHTML = '<span style="color: #e74c3c;">Keine Bilder gefunden.</span>';
        return;
    }

    // Mischen, damit Pixabay und Pexels Bilder bunt gemischt erscheinen
    allResults.sort(() => Math.random() - 0.5);

    allResults.forEach(hit => {
        const img = document.createElement('img');
        img.src = hit.preview;
        img.title = "Quelle: " + hit.source; // Zeigt beim Drüberfahren an, woher das Bild kommt
        img.style.height = '60px'; img.style.cursor = 'pointer'; img.style.border = '2px solid #ccc'; img.style.borderRadius = '4px';

        img.draggable = true;
        img.addEventListener('dragstart', (e) => { e.dataTransfer.setData('bildUrl', hit.full); });

        img.addEventListener('click', () => {
            if (!fertigeAudioDatei) return alert("Bitte zuerst Audio aufnehmen/hochladen!");
            autoPause(); const objId = generateId();
            fabric.Image.fromURL(hit.full, function(fabricImg) {
                const x = 400 - (fabricImg.width * 0.3) / 2; const y = 225 - (fabricImg.height * 0.3) / 2;
                fabricImg.set({ left: x, top: y, scaleX: 0.3, scaleY: 0.3 });
                fabricImg.myId = objId; canvas.add(fabricImg); canvas.setActiveObject(fabricImg);

                const aktuelleZeit = audioPlayback.currentTime || 0;
                videoDrehbuch.push({ id: objId, zeit: aktuelleZeit, aktion: 'bild_hinzufuegen', url: hit.full, x: x, y: y, scaleX: 0.3, scaleY: 0.3 });
                addMarker(aktuelleZeit, objId, 'rgba(142,68,173,0.7)'); updateProtokoll(); autoSave();
            }, { crossOrigin: 'anonymous' });
        });
        searchResults.appendChild(img);
    });
});

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!fertigeAudioDatei) return alert("Bitte zuerst Audio aufnehmen/hochladen!");
    autoPause(); const bildUrl = e.dataTransfer.getData('bildUrl');
    if (bildUrl) {
        const rect = dropZone.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        const objId = generateId();
        fabric.Image.fromURL(bildUrl, function(fabricImg) {
            fabricImg.set({ left: x - (fabricImg.width * 0.3) / 2, top: y - (fabricImg.height * 0.3) / 2, scaleX: 0.3, scaleY: 0.3 });
            fabricImg.myId = objId; canvas.add(fabricImg); canvas.setActiveObject(fabricImg);
            const aktuelleZeit = audioPlayback.currentTime || 0;
            videoDrehbuch.push({ id: objId, zeit: aktuelleZeit, aktion: 'bild_hinzufuegen', url: bildUrl, x: x - (fabricImg.width * 0.3) / 2, y: y - (fabricImg.height * 0.3) / 2, scaleX: 0.3, scaleY: 0.3 });
            addMarker(aktuelleZeit, objId, 'rgba(142,68,173,0.7)'); updateProtokoll(); autoSave();
        }, { crossOrigin: 'anonymous' });
    }
});


// --- TEIL 7: TIMELINE & ZEITMASCHINE ---
const timelineContainer = document.getElementById('timeline-container');
const playhead = document.getElementById('playhead');
const markersContainer = document.getElementById('markers');

function addMarker(zeit, id, color) {
    if (audioPlayback.duration) {
        const marker = document.createElement('div'); marker.className = 'marker-div'; marker.dataset.id = id;
        marker.style.position = 'absolute'; marker.style.left = (zeit / audioPlayback.duration) * 100 + "%";
        marker.style.width = '4px'; marker.style.height = '100%'; marker.style.backgroundColor = color;
        markersContainer.appendChild(marker);
    }
}

timelineContainer.addEventListener('click', (e) => {
    if (!audioPlayback.duration) return;
    if (!audioPlayback.paused) togglePreview();

    const rect = timelineContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const targetTime = (clickX / rect.width) * audioPlayback.duration;

    audioPlayback.currentTime = targetTime;
    playhead.style.left = (targetTime / audioPlayback.duration) * 100 + "%";
    rekonstruiereLeinwand(targetTime);
});

function rekonstruiereLeinwand(zielZeit) {
    canvas.clear();
    let vergangeneAktionen = videoDrehbuch.filter(a => a.zeit <= zielZeit);
    vergangeneAktionen.sort((a, b) => a.zeit - b.zeit);

    let letzterWischIndex = -1;
    for (let i = vergangeneAktionen.length - 1; i >= 0; i--) {
        if (vergangeneAktionen[i].aktion === 'alles_wischen') { letzterWischIndex = i; break; }
    }

    let relevanteAktionen = vergangeneAktionen.slice(letzterWischIndex + 1);

    relevanteAktionen.forEach(aktion => {
        if (aktion.aktion === 'bild_hinzufuegen') {
            fabric.Image.fromURL(aktion.url, function(img) {
                img.set({ left: aktion.x, top: aktion.y, scaleX: aktion.scaleX || 0.3, scaleY: aktion.scaleY || 0.3, selectable: true, evented: true });
                img.myId = aktion.id; canvas.add(img);
            }, { crossOrigin: 'anonymous' });
        }
        else if (aktion.aktion === 'text_hinzufuegen') {
            const text = new fabric.IText(aktion.text, { left: aktion.x, top: aktion.y, fontFamily: 'Comic Sans MS, Arial', fill: '#333333', fontSize: 35, fontWeight: 'bold', selectable: true, evented: true });
            text.scaleX = aktion.scaleX || 1; text.scaleY = aktion.scaleY || 1; text.myId = aktion.id; canvas.add(text);
        }
    });
}


// --- TEIL 8: VORSCHAU-SYSTEM ---
const previewBtn = document.getElementById('previewBtn');
let previewDrehbuch = [];

function togglePreview() {
    if (!fertigeAudioDatei) return;

    if (audioPlayback.paused) {
        if (audioPlayback.currentTime >= audioPlayback.duration) { audioPlayback.currentTime = 0; }

        rekonstruiereLeinwand(audioPlayback.currentTime);
        canvas.discardActiveObject();
        canvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; });
        canvas.requestRenderAll();

        audioPlayback.play();
        previewBtn.innerHTML = "⏸️ Vorschau pausieren"; previewBtn.style.backgroundColor = "#e74c3c";

        previewDrehbuch = videoDrehbuch.filter(a => a.zeit > audioPlayback.currentTime);
        previewDrehbuch.sort((a, b) => a.zeit - b.zeit);
    } else {
        audioPlayback.pause();
        previewBtn.innerHTML = "▶️ Live-Vorschau starten"; previewBtn.style.backgroundColor = "var(--info)";
        rekonstruiereLeinwand(audioPlayback.currentTime);
    }
}

previewBtn.addEventListener('click', togglePreview);

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && !canvas.getActiveObject()?.isEditing) {
        e.preventDefault(); togglePreview();
    }
});

audioPlayback.addEventListener('timeupdate', () => {
    if (audioPlayback.duration) { playhead.style.left = (audioPlayback.currentTime / audioPlayback.duration) * 100 + "%"; }

    if (!audioPlayback.paused) {
        let changeDetected = false;
        while (previewDrehbuch.length > 0 && previewDrehbuch[0].zeit <= audioPlayback.currentTime) {
            const aktion = previewDrehbuch.shift(); changeDetected = true;
            if (aktion.aktion === 'bild_hinzufuegen') {
                fabric.Image.fromURL(aktion.url, function(img) {
                    img.set({ left: aktion.x, top: aktion.y, scaleX: aktion.scaleX || 0.3, scaleY: aktion.scaleY || 0.3, selectable: false, evented: false });
                    canvas.add(img); canvas.requestRenderAll();
                }, { crossOrigin: 'anonymous' });
            }
            else if (aktion.aktion === 'text_hinzufuegen') {
                const text = new fabric.IText(aktion.text, { left: aktion.x, top: aktion.y, fontFamily: 'Comic Sans MS, Arial', fill: '#333333', fontSize: 35, fontWeight: 'bold', selectable: false, evented: false });
                text.scaleX = aktion.scaleX || 1; text.scaleY = aktion.scaleY || 1; canvas.add(text);
            }
            else if (aktion.aktion === 'alles_wischen') { spieleWischAnimation(true); }
        }
        if (changeDetected) canvas.requestRenderAll();
    }
});

audioPlayback.addEventListener('ended', () => {
    previewBtn.innerHTML = "▶️ Live-Vorschau starten"; previewBtn.style.backgroundColor = "var(--info)";
});


// --- TEIL 9: VIDEO RENDERER ---
document.getElementById('exportBtn').addEventListener('click', async () => {
    if (!fertigeAudioDatei) { alert("Bitte nimm zuerst eine Tonspur auf!"); return; }
    if (!audioPlayback.paused) togglePreview();
    if (!confirm("🎬 Video-Erstellung starten?\n\nBitte bewege die Maus nicht über die Leinwand während des Vorgangs.")) return;

    canvas.clear();
    let drehbuchKopie = JSON.parse(JSON.stringify(videoDrehbuch));
    drehbuchKopie.sort((a, b) => a.zeit - b.zeit);

    const htmlCanvas = document.getElementById('fabricCanvas');
    canvas.requestRenderAll();

    const canvasStream = htmlCanvas.captureStream(30);
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    const renderAudio = new Audio(URL.createObjectURL(fertigeAudioDatei));
    const source = audioCtx.createMediaElementSource(renderAudio);
    source.connect(dest);

    const combinedStream = new MediaStream([ ...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks() ]);
    let options = { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8000000 };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) { options = { mimeType: 'video/webm', videoBitsPerSecond: 5000000 }; }

    const recorder = new MediaRecorder(combinedStream, options);
    let recordedChunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };

    const forceFrameInterval = setInterval(() => { canvas.requestRenderAll(); }, 1000 / 30);

    recorder.onstop = () => {
        clearInterval(forceFrameInterval);
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mein_legevideo.webm'; a.click();
        alert("✅ Video erfolgreich heruntergeladen!");
    };

    recorder.start();

    renderAudio.addEventListener('timeupdate', () => {
        const currentTime = renderAudio.currentTime;
        let changeDetected = false;
        while (drehbuchKopie.length > 0 && drehbuchKopie[0].zeit <= currentTime) {
            const aktion = drehbuchKopie.shift(); changeDetected = true;
            if (aktion.aktion === 'bild_hinzufuegen') {
                fabric.Image.fromURL(aktion.url, function(img) {
                    img.set({ left: aktion.x, top: aktion.y, scaleX: aktion.scaleX || 0.3, scaleY: aktion.scaleY || 0.3, selectable: false, evented: false });
                    canvas.add(img); canvas.requestRenderAll();
                }, { crossOrigin: 'anonymous' });
            }
            else if (aktion.aktion === 'text_hinzufuegen') {
                const text = new fabric.IText(aktion.text, { left: aktion.x, top: aktion.y, fontFamily: 'Comic Sans MS, Arial', fill: '#333333', fontSize: 35, fontWeight: 'bold', selectable: false, evented: false });
                text.scaleX = aktion.scaleX || 1; text.scaleY = aktion.scaleY || 1; canvas.add(text);
            }
            else if (aktion.aktion === 'alles_wischen') { spieleWischAnimation(true); }
        }
        if (changeDetected) canvas.requestRenderAll();
    });

    renderAudio.play();
    renderAudio.onended = () => { recorder.stop(); audioCtx.close(); };
});