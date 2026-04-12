const PIXABAY_KEY = '55407865-e0aa3f47b82bc64c318018f21';

let videoDrehbuch = [];
let fertigeAudioDatei = null;

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

// --- TEIL 1: AUDIO AUFNAHME ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

const recordBtn = document.getElementById('recordBtn');
const audioPlayback = document.getElementById('audioPlayback');
const actionButtons = document.getElementById('actionButtons');

recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                fertigeAudioDatei = audioBlob;
                audioPlayback.src = URL.createObjectURL(audioBlob);
                actionButtons.style.display = 'flex';
                audioChunks = [];
            };
            mediaRecorder.start();
            isRecording = true;
            recordBtn.innerHTML = "⏹️ Stoppen";
            recordBtn.classList.add("recording");
        } catch (err) { alert("Mikrofon-Zugriff verweigert!"); }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
        recordBtn.innerHTML = "🎙️ Ton neu aufnehmen";
        recordBtn.classList.remove("recording");
        videoDrehbuch = [];
        document.getElementById('markers').innerHTML = '';
        canvas.clear();
    }
});

// --- TEIL 2: CANVAS & GRÖSSEN-FIX ---
const canvas = new fabric.Canvas('fabricCanvas', { selectionColor: 'rgba(142,68,173,0.1)', selectionLineWidth: 1 });

canvas.on('before:render', function() {
    const ctx = this.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.width, this.height);
});
canvas.requestRenderAll();

canvas.on('object:modified', function(e) {
    const obj = e.target;
    if (obj && obj.myId) {
        const eintrag = videoDrehbuch.find(item => item.id === obj.myId);
        if (eintrag) {
            eintrag.x = obj.left;
            eintrag.y = obj.top;
            eintrag.scaleX = obj.scaleX;
            eintrag.scaleY = obj.scaleY;
            if (obj.type === 'i-text') eintrag.text = obj.text;
        }
    }
});

// HILFSFUNKTION: Stoppt die Vorschau automatisch, wenn man etwas bearbeiten will
function autoPause() {
    if (!audioPlayback.paused) togglePreview();
}

document.getElementById('addTextBtn').addEventListener('click', () => {
    autoPause(); // Wenn Vorschau läuft -> Stopp!
    const objId = generateId();
    const text = new fabric.IText('Tippe...', {
        left: 250, top: 200, fontFamily: 'Comic Sans MS, Arial', fill: '#333333', fontSize: 35, fontWeight: 'bold'
    });
    text.myId = objId;
    canvas.add(text); canvas.setActiveObject(text);
    const aktuelleZeit = audioPlayback.currentTime || 0;
    videoDrehbuch.push({ id: objId, zeit: aktuelleZeit, aktion: 'text_hinzufuegen', text: 'Tippe...', x: 250, y: 200, scaleX: 1, scaleY: 1 });
    addMarker(aktuelleZeit, objId, 'rgba(142,68,173,0.7)');
});

document.getElementById('deleteBtn').addEventListener('click', () => {
    autoPause();
    const activeObject = canvas.getActiveObject();
    if (activeObject) {
        const idToRemove = activeObject.myId;
        canvas.remove(activeObject);
        videoDrehbuch = videoDrehbuch.filter(item => item.id !== idToRemove);
        const markerDiv = document.querySelector(`.marker-div[data-id="${idToRemove}"]`);
        if (markerDiv) markerDiv.remove();
    }
});

// --- TEIL 3: ANIMIERTES WISCHEN ---
function spieleWischAnimation(sollLeinwandGeloeschtWerden) {
    const wipeArm = document.getElementById('wipeArm');
    wipeArm.style.transition = 'left 0.8s ease-in-out';
    wipeArm.style.left = '0%';
    setTimeout(() => { if (sollLeinwandGeloeschtWerden) canvas.clear(); }, 400);
    setTimeout(() => { wipeArm.style.left = '100%'; }, 800);
    setTimeout(() => { wipeArm.style.transition = 'none'; wipeArm.style.left = '-100%'; }, 1600);
}

document.getElementById('clearBtn').addEventListener('click', () => {
    autoPause(); // Wenn Vorschau läuft -> Stopp!
    spieleWischAnimation(true);
    const aktuelleZeit = audioPlayback.currentTime || 0;
    const objId = generateId();
    videoDrehbuch.push({ id: objId, zeit: aktuelleZeit, aktion: 'alles_wischen' });
    addMarker(aktuelleZeit, objId, 'var(--warning)');
});

// --- TEIL 4: BILDERSUCHE & DROP ---
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const dropZone = document.getElementById('dropZone');

searchBtn.addEventListener('click', async () => {
    const query = document.getElementById('searchInput').value;
    if (!query) return;
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=illustration&per_page=10`;

    searchResults.innerHTML = '<i>Suche läuft...</i>';
    try {
        const response = await fetch(url);
        const data = await response.json();
        searchResults.innerHTML = '';
        if (data.hits.length === 0) {
            searchResults.innerHTML = '<span style="color: #e74c3c;">Keine Bilder gefunden. Tippfehler?</span>';
            return;
        }

        data.hits.forEach(hit => {
            const img = document.createElement('img');
            img.src = hit.previewURL;
            img.style.height = '60px'; img.style.cursor = 'pointer'; img.style.border = '2px solid #fff'; img.style.borderRadius = '4px';

            img.draggable = true;
            img.addEventListener('dragstart', (e) => { e.dataTransfer.setData('bildUrl', hit.largeImageURL); });

            img.addEventListener('click', () => {
                autoPause(); // Wenn Vorschau läuft -> Stopp!
                const objId = generateId();
                fabric.Image.fromURL(hit.largeImageURL, function(fabricImg) {
                    const x = 400 - (fabricImg.width * 0.3) / 2;
                    const y = 225 - (fabricImg.height * 0.3) / 2;
                    fabricImg.set({ left: x, top: y, scaleX: 0.3, scaleY: 0.3 });
                    fabricImg.myId = objId;
                    canvas.add(fabricImg); canvas.setActiveObject(fabricImg);

                    const aktuelleZeit = audioPlayback.currentTime || 0;
                    videoDrehbuch.push({ id: objId, zeit: aktuelleZeit, aktion: 'bild_hinzufuegen', url: hit.largeImageURL, x: x, y: y, scaleX: 0.3, scaleY: 0.3 });
                    addMarker(aktuelleZeit, objId, 'rgba(142,68,173,0.7)');
                }, { crossOrigin: 'anonymous' });
            });
            searchResults.appendChild(img);
        });
    } catch (err) { searchResults.innerHTML = '<span style="color: #e74c3c;">Fehler bei der Suche!</span>'; }
});

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    autoPause(); // Wenn Vorschau läuft -> Stopp!

    const bildUrl = e.dataTransfer.getData('bildUrl');
    if (bildUrl) {
        const rect = dropZone.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        const objId = generateId();
        fabric.Image.fromURL(bildUrl, function(fabricImg) {
            fabricImg.set({ left: x - (fabricImg.width * 0.3) / 2, top: y - (fabricImg.height * 0.3) / 2, scaleX: 0.3, scaleY: 0.3 });
            fabricImg.myId = objId;
            canvas.add(fabricImg); canvas.setActiveObject(fabricImg);
            const aktuelleZeit = audioPlayback.currentTime || 0;
            videoDrehbuch.push({ id: objId, zeit: aktuelleZeit, aktion: 'bild_hinzufuegen', url: bildUrl, x: x - (fabricImg.width * 0.3) / 2, y: y - (fabricImg.height * 0.3) / 2, scaleX: 0.3, scaleY: 0.3 });
            addMarker(aktuelleZeit, objId, 'rgba(142,68,173,0.7)');
        }, { crossOrigin: 'anonymous' });
    }
});

// --- TEIL 5: TIMELINE & ZEITMASCHINE ---
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
        if (vergangeneAktionen[i].aktion === 'alles_wischen') {
            letzterWischIndex = i; break;
        }
    }

    let relevanteAktionen = vergangeneAktionen.slice(letzterWischIndex + 1);

    relevanteAktionen.forEach(aktion => {
        if (aktion.aktion === 'bild_hinzufuegen') {
            fabric.Image.fromURL(aktion.url, function(img) {
                // WICHTIG: selectable: true stellt sicher, dass man es nach dem Springen wieder bewegen kann
                img.set({ left: aktion.x, top: aktion.y, scaleX: aktion.scaleX || 0.3, scaleY: aktion.scaleY || 0.3, selectable: true, evented: true });
                img.myId = aktion.id;
                canvas.add(img);
            }, { crossOrigin: 'anonymous' });
        }
        else if (aktion.aktion === 'text_hinzufuegen') {
            const text = new fabric.IText(aktion.text, {
                left: aktion.x, top: aktion.y, fontFamily: 'Comic Sans MS, Arial', fill: '#333333', fontSize: 35, fontWeight: 'bold', selectable: true, evented: true
            });
            text.scaleX = aktion.scaleX || 1; text.scaleY = aktion.scaleY || 1;
            text.myId = aktion.id;
            canvas.add(text);
        }
    });
}


// --- TEIL 6: NEUES VORSCHAU-SYSTEM MIT SCHUTZSCHILD ---
const previewBtn = document.getElementById('previewBtn');
let previewDrehbuch = [];

function togglePreview() {
    if (!fertigeAudioDatei) return;

    if (audioPlayback.paused) {
        // --- FILM-MODUS STARTEN ---
        // 1. Wir heben alle Markierungen auf
        canvas.discardActiveObject();

        // 2. Wir sperren alle aktuellen Objekte auf der Leinwand! (Kein Anfassen mehr)
        canvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; });
        canvas.requestRenderAll();

        audioPlayback.play();
        previewBtn.innerHTML = "⏸️ Vorschau pausieren";
        previewBtn.style.backgroundColor = "#e74c3c";

        previewDrehbuch = videoDrehbuch.filter(a => a.zeit > audioPlayback.currentTime);
        previewDrehbuch.sort((a, b) => a.zeit - b.zeit);
    } else {
        // --- BEARBEITUNGS-MODUS STARTEN ---
        audioPlayback.pause();
        previewBtn.innerHTML = "▶️ Live-Vorschau starten";
        previewBtn.style.backgroundColor = "var(--info)";

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
    if (audioPlayback.duration) {
        playhead.style.left = (audioPlayback.currentTime / audioPlayback.duration) * 100 + "%";
    }

    if (!audioPlayback.paused) {
        let changeDetected = false;

        while (previewDrehbuch.length > 0 && previewDrehbuch[0].zeit <= audioPlayback.currentTime) {
            const aktion = previewDrehbuch.shift();
            changeDetected = true;

            if (aktion.aktion === 'bild_hinzufuegen') {
                fabric.Image.fromURL(aktion.url, function(img) {
                    // SCHUTZSCHILD: Bilder, die während des Films erscheinen, sind gesperrt!
                    img.set({ left: aktion.x, top: aktion.y, scaleX: aktion.scaleX || 0.3, scaleY: aktion.scaleY || 0.3, selectable: false, evented: false });
                    canvas.add(img); canvas.requestRenderAll();
                }, { crossOrigin: 'anonymous' });
            }
            else if (aktion.aktion === 'text_hinzufuegen') {
                const text = new fabric.IText(aktion.text, { left: aktion.x, top: aktion.y, fontFamily: 'Comic Sans MS, Arial', fill: '#333333', fontSize: 35, fontWeight: 'bold', selectable: false, evented: false });
                text.scaleX = aktion.scaleX || 1; text.scaleY = aktion.scaleY || 1;
                canvas.add(text);
            }
            else if (aktion.aktion === 'alles_wischen') {
                spieleWischAnimation(true);
            }
        }
        if (changeDetected) canvas.requestRenderAll();
    }
});

audioPlayback.addEventListener('ended', () => {
    previewBtn.innerHTML = "▶️ Live-Vorschau starten";
    previewBtn.style.backgroundColor = "var(--info)";
});


// --- TEIL 7: VIDEO RENDERER (Auch hier greift das Schutzschild) ---
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
            const aktion = drehbuchKopie.shift();
            changeDetected = true;
            if (aktion.aktion === 'bild_hinzufuegen') {
                fabric.Image.fromURL(aktion.url, function(img) {
                    img.set({ left: aktion.x, top: aktion.y, scaleX: aktion.scaleX || 0.3, scaleY: aktion.scaleY || 0.3, selectable: false, evented: false });
                    canvas.add(img); canvas.requestRenderAll();
                }, { crossOrigin: 'anonymous' });
            }
            else if (aktion.aktion === 'text_hinzufuegen') {
                const text = new fabric.IText(aktion.text, { left: aktion.x, top: aktion.y, fontFamily: 'Comic Sans MS, Arial', fill: '#333333', fontSize: 35, fontWeight: 'bold', selectable: false, evented: false });
                text.scaleX = aktion.scaleX || 1; text.scaleY = aktion.scaleY || 1;
                canvas.add(text);
            }
            else if (aktion.aktion === 'alles_wischen') { spieleWischAnimation(true); }
        }
        if (changeDetected) canvas.requestRenderAll();
    });

    renderAudio.play();
    renderAudio.onended = () => { recorder.stop(); audioCtx.close(); };
});