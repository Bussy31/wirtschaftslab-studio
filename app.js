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

recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            // Optimiert für bessere Audio-Qualität
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); // Klare Spezifikation
            mediaRecorder.ondataavailable = event => { audioChunks.push(event.data); };
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                fertigeAudioDatei = audioBlob;
                audioPlayback.src = URL.createObjectURL(audioBlob);
                audioPlayback.style.display = 'block';
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
        // Reset
        videoDrehbuch = [];
        document.getElementById('markers').innerHTML = '';
        forceWhiteBackground(); // Fix: Hintergrund sicherstellen
    }
});

// --- TEIL 2: CANVAS & HINTERGRUND-FIX ---
const canvas = new fabric.Canvas('fabricCanvas', { selectionColor: 'rgba(142,68,173,0.1)', selectionLineWidth: 1 });

// Hilfsfunktion: Zwingt die Leinwand zu einem weißen Hintergrund
function forceWhiteBackground() {
    canvas.clear();
    // Wichtig für den Renderer: Die Hintergrundfarbe MUSS explizit gesetzt werden
    canvas.setBackgroundColor('#ffffff', () => { canvas.requestRenderAll(); });
}

forceWhiteBackground(); // Initial aufrufen

document.getElementById('addTextBtn').addEventListener('click', () => {
    const objId = generateId();
    const text = new fabric.IText('Tippe...', {
        left: 250, top: 200, fontFamily: 'Comic Sans MS, Arial', fill: '#333333', fontSize: 35, fontWeight: 'bold'
    });
    text.myId = objId;
    canvas.add(text); canvas.setActiveObject(text);
    const aktuelleZeit = audioPlayback.currentTime || 0;
    videoDrehbuch.push({ id: objId, zeit: aktuelleZeit, aktion: 'text_hinzufuegen', text: 'Tippe...', x: 250, y: 200 });
    addMarker(aktuelleZeit, objId);
});

document.getElementById('deleteBtn').addEventListener('click', () => {
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
    setTimeout(() => {
        if (sollLeinwandGeloeschtWerden) {
            forceWhiteBackground(); // Fix: Sicherstellen, dass nach dem Wischen weiß ist
        }
    }, 400);
    setTimeout(() => { wipeArm.style.left = '100%'; }, 800);
    setTimeout(() => { wipeArm.style.transition = 'none'; wipeArm.style.left = '-100%'; }, 1600);
}

document.getElementById('clearBtn').addEventListener('click', () => {
    spieleWischAnimation(true);
    videoDrehbuch.push({ zeit: audioPlayback.currentTime || 0, aktion: 'alles_wischen' });
});

// --- TEIL 4: BILDERSUCHE & DRAG AND DROP ---
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const dropZone = document.getElementById('dropZone');

searchBtn.addEventListener('click', async () => {
    const query = document.getElementById('searchInput').value;
    if (!query) return;
    const url = `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=illustration&per_page=10`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        searchResults.innerHTML = '';
        data.hits.forEach(hit => {
            const img = document.createElement('img');
            img.src = hit.previewURL; img.title = hit.tags;
            img.style.height = '60px'; img.style.cursor = 'grab'; img.style.border = '2px solid #fff'; img.style.borderRadius = '4px'; img.style.transition = 'border-color 0.1s';
            img.onmouseover = function() { this.style.borderColor = '#8e44ad'; };
            img.onmouseout = function() { this.style.borderColor = '#fff'; };
            img.draggable = true;
            img.addEventListener('dragstart', (e) => { e.dataTransfer.setData('bildUrl', hit.largeImageURL); });
            searchResults.appendChild(img);
        });
    } catch (err) {}
});

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.boxShadow = '0px 0px 15px rgba(39,174,96,0.5)'; });
dropZone.addEventListener('dragleave', (e) => { dropZone.style.boxShadow = '0px 10px 25px rgba(0,0,0,0.1)'; });

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.boxShadow = '0px 10px 25px rgba(0,0,0,0.1)';
    const bildUrl = e.dataTransfer.getData('bildUrl');
    if (bildUrl) {
        const rect = dropZone.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        const objId = generateId();
        fabric.Image.fromURL(bildUrl, function(fabricImg) {
            fabricImg.scale(0.3);
            fabricImg.set({ left: x - (fabricImg.width * 0.3) / 2, top: y - (fabricImg.height * 0.3) / 2 });
            fabricImg.myId = objId;
            canvas.add(fabricImg); canvas.setActiveObject(fabricImg);
            const aktuelleZeit = audioPlayback.currentTime || 0;
            videoDrehbuch.push({ id: objId, zeit: aktuelleZeit, aktion: 'bild_hinzufuegen', url: bildUrl, x: x - (fabricImg.width * 0.3) / 2, y: y - (fabricImg.height * 0.3) / 2 });
            addMarker(aktuelleZeit, objId);
        }, { crossOrigin: 'anonymous' });
    }
});

// --- TEIL 5: TIMELINE ---
const playhead = document.getElementById('playhead');
const markersContainer = document.getElementById('markers');

audioPlayback.addEventListener('timeupdate', () => {
    if (audioPlayback.duration) { playhead.style.left = (audioPlayback.currentTime / audioPlayback.duration) * 100 + "%"; }
});

function addMarker(zeit, id) {
    if (audioPlayback.duration) {
        const marker = document.createElement('div'); marker.className = 'marker-div'; marker.dataset.id = id;
        marker.style.position = 'absolute'; marker.style.left = (zeit / audioPlayback.duration) * 100 + "%"; marker.style.width = '4px'; marker.style.height = '100%'; marker.style.backgroundColor = 'rgba(142,68,173,0.7)'; marker.style.borderRadius = '2px';
        markersContainer.appendChild(marker);
    }
}

// --- TEIL 6: OPTIMIERTER VIDEO-RENDERER (HINTERGRUND & QUALITÄT) ---
document.getElementById('exportBtn').addEventListener('click', async () => {
    if (!fertigeAudioDatei) { alert("Bitte nimm zuerst eine Tonspur auf!"); return; }

    const confirmRender = confirm("🎬 Video-Erstellung starten?\n\nDas Video wird in Echtzeit gerendert (so lange wie das Audio dauert).\n\nBitte lasse den Tab geöffnet und bewege die Maus nicht über die Leinwand während des Vorgangs, um Bildfehler zu vermeiden.");
    if (!confirmRender) return;

    // 1. Vorbereitung Leinwand & Drehbuch
    forceWhiteBackground(); // Fix: Sicherstellen, dass Rendering weiß startet
    let drehbuchKopie = JSON.parse(JSON.stringify(videoDrehbuch));
    drehbuchKopie.sort((a, b) => a.zeit - b.zeit);

    const htmlCanvas = document.getElementById('fabricCanvas');

    // Fix: Damit captureStream sauber funktioniert, muss der Canvas explizit gerendert sein
    canvas.requestRenderAll();

    // QUALITÄTS BOOST: 30 FPS Video
    const canvasStream = htmlCanvas.captureStream(30);

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioCtx.createMediaStreamDestination();
    const renderAudio = new Audio(URL.createObjectURL(fertigeAudioDatei));
    const source = audioCtx.createMediaElementSource(renderAudio);
    source.connect(dest);
    // source.connect(audioCtx.destination); // Zum Stummschalten beim Rendern auskommentieren

    const combinedStream = new MediaStream([ ...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks() ]);

    // QUALITÄTS BOOST & HINTERGRUND-FIX OPTIONEN
    let options = {
        mimeType: 'video/webm;codecs=vp9', // Moderner Codec (falls unterstützt)
        videoBitsPerSecond: 8000000 // Hohe Bitrate (8 Mbps) für gute Qualität
    };

    // Prüfen, ob VP9 unterstützt wird, sonst fallback
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm', videoBitsPerSecond: 5000000 }; // 5 Mbps fallback
    }

    const recorder = new MediaRecorder(combinedStream, options);
    let recordedChunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };

    recorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mein_legevideo.webm'; a.click();
        alert("✅ Dein optimiertes Video wurde heruntergeladen!");
    };

    recorder.start();
    renderAudio.play();

    // Der Autopilot mit expliziter Hintergrundauffrischung
    renderAudio.addEventListener('timeupdate', () => {
        const currentTime = renderAudio.currentTime;
        let changeDetected = false;

        while (drehbuchKopie.length > 0 && drehbuchKopie[0].zeit <= currentTime) {
            const aktion = drehbuchKopie.shift();
            changeDetected = true;

            if (aktion.aktion === 'bild_hinzufuegen') {
                fabric.Image.fromURL(aktion.url, function(img) {
                    img.scale(0.3); img.set({ left: aktion.x, top: aktion.y });
                    canvas.add(img); canvas.requestRenderAll();
                }, { crossOrigin: 'anonymous' });
            }
            else if (aktion.aktion === 'text_hinzufuegen') {
                canvas.add(new fabric.IText(aktion.text, {
                    left: aktion.x, top: aktion.y, fontFamily: 'Comic Sans MS, Arial', fill: '#333333', fontSize: 35, fontWeight: 'bold'
                }));
            }
            else if (aktion.aktion === 'alles_wischen') {
                spieleWischAnimation(true);
            }
        }

        if (changeDetected) {
            canvas.requestRenderAll();
        }
    });

    renderAudio.onended = () => { recorder.stop(); audioCtx.close(); };
});