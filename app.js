
(() => {
  // AUDIO ELEMENTS
  const playButton = document.getElementById("playButton");
  const playIcon = document.getElementById("playIcon");
  const playLabel = document.getElementById("playLabel");
  const status = document.getElementById("status");
  const orb = document.getElementById("orb");

  const volume = document.getElementById("volume");
  const volumeValue = document.getElementById("volumeValue");
  const timer = document.getElementById("timer");
  const timerState = document.getElementById("timerState");

  // STANDBY ELEMENTS
  const standbyButton = document.getElementById("standbyButton");
  const standbyScreen = document.getElementById("standbyScreen");
  const mainApp = document.getElementById("mainApp");

  const clock = document.getElementById("clock");
  const clockDate = document.getElementById("clockDate");

  const photoInput = document.getElementById("photoInput");
  const uploadPhotos = document.getElementById("uploadPhotos");
  const standbyPhoto = document.getElementById("standbyPhoto");
  const emptyPhotos = document.getElementById("emptyPhotos");

  const previousPhoto = document.getElementById("previousPhoto");
  const nextPhoto = document.getElementById("nextPhoto");
  const exitStandby = document.getElementById("exitStandby");

  // AUDIO STATE
  let audioContext = null;
  let gainNode = null;
  let noiseNode = null;

  let timerId = null;
  let fadeId = null;
  let stopAt = 0;
  let playing = false;

  // STANDBY STATE
  let wakeLock = null;
  let standbyActive = false;
  let photos = [];
  let currentPhoto = 0;
  let photoURL = null;

  // DATABASE
  const DB_NAME = "BrownNoiseDatabase";
  const STORE_NAME = "photos";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true
          });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function savePhoto(blob, name) {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readwrite"
      );

      const request = transaction
        .objectStore(STORE_NAME)
        .add({
          blob,
          name,
          created: Date.now()
        });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
    });
  }

  async function loadPhotos() {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readonly"
      );

      const request = transaction
        .objectStore(STORE_NAME)
        .getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
    });
  }

  async function deletePhoto(id) {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readwrite"
      );

      const request = transaction
        .objectStore(STORE_NAME)
        .delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
    });
  }

  // BROWN NOISE GENERATOR

  function makeBrownNoiseBuffer(ctx, seconds = 8) {
    const length = Math.floor(
      ctx.sampleRate * seconds
    );

    const buffer = ctx.createBuffer(
      1,
      length,
      ctx.sampleRate
    );

    const data = buffer.getChannelData(0);
    let lastOut = 0;

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;

      lastOut = (
        lastOut + 0.02 * white
      ) / 1.02;

      data[i] = lastOut * 3.5;
    }

    return buffer;
  }

  async function startAudio() {
    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      status.textContent = "Audio unsupported";
      return;
    }

    audioContext =
      audioContext || new AudioContextClass();

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    gainNode = audioContext.createGain();

    gainNode.gain.value =
      Number(volume.value) / 100 * 0.75;

    gainNode.connect(audioContext.destination);

    noiseNode = audioContext.createBufferSource();

    noiseNode.buffer = makeBrownNoiseBuffer(
      audioContext
    );

    noiseNode.loop = true;
    noiseNode.connect(gainNode);
    noiseNode.start();

    playing = true;

    playIcon.textContent = "Ⅱ";
    playLabel.textContent = "Pause brown noise";

    status.textContent = "Playing deep brown noise";

    orb.classList.add("playing");

    if ("mediaSession" in navigator &&
        "MediaMetadata" in window) {

      navigator.mediaSession.metadata =
        new MediaMetadata({
          title: "Brown noise",
          artist: "Sound Machine"
        });

      try {
        navigator.mediaSession.setActionHandler(
          "play",
          () => {
            if (!playing) startAudio();
          }
        );

        navigator.mediaSession.setActionHandler(
          "pause",
          () => {
            if (playing) stopAudio();
          }
        );
      } catch (_) {}
    }

    setTimer();
  }

  function clearTimers() {
    if (timerId) clearInterval(timerId);
    if (fadeId) clearTimeout(fadeId);

    timerId = null;
    fadeId = null;
  }

  function stopAudio() {
    clearTimers();

    if (noiseNode) {
      try {
        noiseNode.stop();
      } catch (_) {}

      noiseNode.disconnect();
      noiseNode = null;
    }

    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }

    playing = false;

    playIcon.textContent = "▶";
    playLabel.textContent = "Play brown noise";

    status.textContent = "Ready when you are";

    orb.classList.remove("playing");

    timerState.textContent = "Off";
  }

  function setTimer() {
    clearTimers();

    const minutes = Number(timer.value);

    if (!minutes || !playing) {
      timerState.textContent = "Off";
      return;
    }

    stopAt = Date.now() + minutes * 60000;

    timerState.textContent = `${minutes} min`;

    timerId = setInterval(() => {
      const remaining = stopAt - Date.now();

      if (remaining <= 10000) {
        clearInterval(timerId);
        timerId = null;

        if (gainNode && audioContext) {
          const now = audioContext.currentTime;

          gainNode.gain.cancelScheduledValues(now);

          gainNode.gain.setValueAtTime(
            gainNode.gain.value,
            now
          );

          gainNode.gain.linearRampToValueAtTime(
            0,
            now + 10
          );
        }

        status.textContent = "Fading out…";

        fadeId = setTimeout(stopAudio, 10100);

      } else {
        timerState.textContent =
          `${Math.ceil(remaining / 60000)} min left`;
      }
    }, 1000);
  }

  playButton.addEventListener("click", async () => {
    if (playing) {
      stopAudio();
    } else {
      await startAudio();
    }
  });

  volume.addEventListener("input", () => {
    volumeValue.textContent = `${volume.value}%`;

    if (gainNode && audioContext) {
      gainNode.gain.setTargetAtTime(
        Number(volume.value) / 100 * 0.75,
        audioContext.currentTime,
        0.04
      );
    }
  });

  timer.addEventListener("change", setTimer);

  // CLOCK

  function updateClock() {
    const now = new Date();

    clock.textContent = now.toLocaleTimeString(
      undefined,
      {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      }
    );

    clockDate.textContent = now
      .toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric"
      })
      .toUpperCase();
  }

  updateClock();
  setInterval(updateClock, 1000);

  // PHOTO DISPLAY

  function displayPhoto() {
    if (photoURL) {
      URL.revokeObjectURL(photoURL);
      photoURL = null;
    }

    if (photos.length === 0) {
      standbyPhoto.hidden = true;
      emptyPhotos.hidden = false;
      return;
    }

    const photo = photos[currentPhoto];

    photoURL = URL.createObjectURL(photo.blob);

    standbyPhoto.src = photoURL;
    standbyPhoto.hidden = false;
    emptyPhotos.hidden = true;
  }

  async function refreshPhotos() {
    try {
      photos = await loadPhotos();
      displayPhoto();
    } catch (error) {
      console.error("Could not load photos:", error);
    }
  }

  uploadPhotos.addEventListener("click", () => {
    photoInput.click();
  });

  photoInput.addEventListener("change", async () => {
    const files = Array.from(photoInput.files || []);

    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;

      try {
        await savePhoto(file, file.name);
      } catch (error) {
        console.error("Could not save photo:", error);
        alert("Could not save this photo. Storage may be full.");
        break;
      }
    }

    photoInput.value = "";

    await refreshPhotos();
  });

  previousPhoto.addEventListener("click", () => {
    if (photos.length < 2) return;

    currentPhoto =
      (currentPhoto - 1 + photos.length) % photos.length;

    displayPhoto();
  });

  nextPhoto.addEventListener("click", () => {
    if (photos.length < 2) return;

    currentPhoto =
      (currentPhoto + 1) % photos.length;

    displayPhoto();
  });

  // SCREEN WAKE LOCK

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) {
      return;
    }

    try {
      wakeLock = await navigator.wakeLock.request("screen");

      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });

    } catch (error) {
      console.warn("Wake lock unavailable:", error);
    }
  }

  async function releaseWakeLock() {
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch (_) {}

      wakeLock = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" &&
        standbyActive) {
      requestWakeLock();
    }
  });

  // ENTER STANDBY

  standbyButton.addEventListener("click", async () => {
    standbyActive = true;

    mainApp.hidden = true;
    standbyScreen.hidden = false;

    document.body.classList.add("standby-mode");

    await refreshPhotos();
    await requestWakeLock();
  });

  // EXIT STANDBY

  exitStandby.addEventListener("click", async () => {
    standbyActive = false;

    standbyScreen.hidden = true;
    mainApp.hidden = false;

    document.body.classList.remove("standby-mode");

    await releaseWakeLock();
  });

  // INITIALIZATION

  refreshPhotos();

  if ("serviceWorker" in navigator &&
      location.protocol.startsWith("http")) {

    window.addEventListener("load", () => {
      navigator.serviceWorker.register(
        "./service-worker.js"
      ).catch(console.error);
    });
  }

})();
