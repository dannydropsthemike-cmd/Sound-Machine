
(() => {
  "use strict";

  // ELEMENTS

  const $ = id => document.getElementById(id);

  const playButton = $("playButton");
  const playIcon = $("playIcon");
  const playLabel = $("playLabel");
  const status = $("status");
  const orb = $("orb");

  const volume = $("volume");
  const volumeValue = $("volumeValue");
  const timer = $("timer");
  const timerState = $("timerState");

  const mainApp = $("mainApp");
  const standbyScreen = $("standbyScreen");
  const standbyButton = $("standbyButton");
  const exitStandby = $("exitStandby");

  const clock = $("clock");
  const clockDate = $("clockDate");

  const photoInput = $("photoInput");
  const uploadPhotos = $("uploadPhotos");
  const standbyPhoto = $("standbyPhoto");
  const emptyPhotos = $("emptyPhotos");

  const previousPhoto = $("previousPhoto");
  const nextPhoto = $("nextPhoto");

  // AUDIO

  let audioContext = null;
  let masterGain = null;
  let noiseSource = null;

  let playing = false;
  let timerInterval = null;
  let fadeTimeout = null;
  let timerEnd = 0;

  // BROWN NOISE GENERATOR

  function makeBrownNoiseBuffer(ctx, seconds = 20) {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * seconds);

    const buffer = ctx.createBuffer(
      1,
      length,
      sampleRate
    );

    const data = buffer.getChannelData(0);

    let lastOut = 0;
    let sum = 0;

    // Leaky integration of white noise produces
    // a brown-noise spectrum.

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;

      lastOut = (
        lastOut + 0.02 * white
      ) / 1.02;

      data[i] = lastOut;
      sum += lastOut;
    }

    // Remove DC offset.

    const mean = sum / length;
    let squareSum = 0;

    for (let i = 0; i < length; i++) {
      data[i] -= mean;
      squareSum += data[i] * data[i];
    }

    // Normalize RMS volume.

    const rms = Math.sqrt(squareSum / length);
    const scale = 0.22 / (rms || 1);

    for (let i = 0; i < length; i++) {
      data[i] = Math.max(
        -0.95,
        Math.min(0.95, data[i] * scale)
      );
    }

    return buffer;
  }

  async function startAudio() {
    try {
      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContextClass) {
        status.textContent = "Audio is not supported";
        return;
      }

      if (!audioContext) {
        audioContext = new AudioContextClass();
      }

      if (audioContext.state !== "running") {
        await audioContext.resume();
      }

      if (audioContext.state !== "running") {
        status.textContent = "Tap play to enable audio";
        return;
      }

      masterGain = audioContext.createGain();

      masterGain.gain.value =
        Number(volume.value) / 100 * 0.75;

      // Prevent extremely low frequencies from
      // consuming unnecessary speaker output.

      const highPass = audioContext.createBiquadFilter();
      highPass.type = "highpass";
      highPass.frequency.value = 20;
      highPass.Q.value = 0.707;

      noiseSource = audioContext.createBufferSource();

      noiseSource.buffer = makeBrownNoiseBuffer(
        audioContext,
        20
      );

      noiseSource.loop = true;

      noiseSource.connect(highPass);
      highPass.connect(masterGain);
      masterGain.connect(audioContext.destination);

      noiseSource.start();

      playing = true;

      playIcon.textContent = "Ⅱ";
      playLabel.textContent = "Pause brown noise";
      status.textContent = "Playing deep brown noise";

      orb.classList.add("playing");

      setMediaControls();
      setTimer();

    } catch (error) {
      console.error("Audio error:", error);
      status.textContent = "Unable to start audio";
    }
  }

  function setMediaControls() {
    if (!("mediaSession" in navigator)) return;
    if (!("MediaMetadata" in window)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
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

  function clearTimers() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    if (fadeTimeout) {
      clearTimeout(fadeTimeout);
      fadeTimeout = null;
    }
  }

  function stopAudio() {
    clearTimers();

    if (noiseSource) {
      try {
        noiseSource.stop();
      } catch (_) {}

      noiseSource.disconnect();
      noiseSource = null;
    }

    if (masterGain) {
      masterGain.disconnect();
      masterGain = null;
    }

    playing = false;

    playIcon.textContent = "▶";
    playLabel.textContent = "Play brown noise";

    status.textContent = "Ready when you are";
    orb.classList.remove("playing");

    timerState.textContent = "Off";
  }

  playButton.addEventListener("click", async () => {
    if (playing) {
      stopAudio();
    } else {
      await startAudio();
    }
  });

  // VOLUME

  volume.addEventListener("input", () => {
    const value = Number(volume.value);

    volumeValue.textContent = `${value}%`;

    if (masterGain && audioContext) {
      masterGain.gain.setTargetAtTime(
        value / 100 * 0.75,
        audioContext.currentTime,
        0.04
      );
    }
  });

  // SLEEP TIMER

  function setTimer() {
    clearTimers();

    if (!playing) {
      timerState.textContent = "Off";
      return;
    }

    const minutes = Number(timer.value);

    if (!minutes) {
      timerState.textContent = "Off";
      return;
    }

    timerEnd = Date.now() + minutes * 60000;

    timerInterval = setInterval(() => {
      const remaining = timerEnd - Date.now();

      if (remaining <= 10000) {
        clearInterval(timerInterval);
        timerInterval = null;

        if (masterGain && audioContext) {
          const now = audioContext.currentTime;

          masterGain.gain.cancelScheduledValues(now);

          masterGain.gain.setValueAtTime(
            masterGain.gain.value,
            now
          );

          masterGain.gain.linearRampToValueAtTime(
            0,
            now + 10
          );
        }

        status.textContent = "Fading out";

        fadeTimeout = setTimeout(stopAudio, 10100);

      } else {
        timerState.textContent =
          `${Math.ceil(remaining / 60000)} min left`;
      }
    }, 1000);

    timerState.textContent = `${minutes} min`;
  }

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

    clockDate.textContent = now.toLocaleDateString(
      undefined,
      {
        weekday: "long",
        month: "long",
        day: "numeric"
      }
    ).toUpperCase();
  }

  updateClock();
  setInterval(updateClock, 1000);

  // PHOTO DATABASE

  const DB_NAME = "BrownNoiseDatabase";
  const STORE_NAME = "photos";

  let photos = [];
  let currentPhoto = 0;
  let photoURL = null;

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

  async function savePhoto(file) {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readwrite"
      );

      const request = transaction.objectStore(
        STORE_NAME
      ).add({
        blob: file,
        name: file.name,
        created: Date.now()
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    });
  }

  async function loadPhotos() {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_NAME,
        "readonly"
      );

      const request = transaction.objectStore(
        STORE_NAME
      ).getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);

      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    });
  }

  function displayPhoto() {
    if (photoURL) {
      URL.revokeObjectURL(photoURL);
      photoURL = null;
    }

    if (!photos.length) {
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

      if (currentPhoto >= photos.length) {
        currentPhoto = 0;
      }

      displayPhoto();

    } catch (error) {
      console.error("Photo loading error:", error);
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
        await savePhoto(file);
      } catch (error) {
        console.error("Photo save error:", error);

        alert(
          "Unable to save the photo. Browser storage may be full."
        );

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

  // AUTOMATIC SLIDESHOW

  let slideshowInterval = null;

  function startSlideshow() {
    clearInterval(slideshowInterval);

    slideshowInterval = setInterval(() => {
      if (photos.length > 1) {
        currentPhoto = (currentPhoto + 1) % photos.length;
        displayPhoto();
      }
    }, 30000);
  }

  function stopSlideshow() {
    clearInterval(slideshowInterval);
    slideshowInterval = null;
  }

  // STANDBY / WAKE LOCK

  let wakeLock = null;
  let standbyActive = false;

  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;

    try {
      if (wakeLock) return;

      wakeLock = await navigator.wakeLock.request("screen");

      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });

    } catch (error) {
      console.warn("Wake lock unavailable:", error);
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;

    try {
      await wakeLock.release();
    } catch (_) {}

    wakeLock = null;
  }

  standbyButton.addEventListener("click", async () => {
    standbyActive = true;

    mainApp.hidden = true;
    standbyScreen.hidden = false;

    document.body.classList.add("standby-mode");

    await refreshPhotos();
    startSlideshow();
    await requestWakeLock();
  });

  exitStandby.addEventListener("click", async () => {
    standbyActive = false;

    stopSlideshow();
    await releaseWakeLock();

    standbyScreen.hidden = true;
    mainApp.hidden = false;

    document.body.classList.remove("standby-mode");
  });

  document.addEventListener("visibilitychange", async () => {
    if (
      document.visibilityState === "visible" &&
      standbyActive
    ) {
      await requestWakeLock();
    }
  });

  // INITIALIZATION

  refreshPhotos();

  // OFFLINE SUPPORT

  if ("serviceWorker" in navigator &&
      location.protocol.startsWith("http")) {

    window.addEventListener("load", () => {
      navigator.serviceWorker.register(
        "./service-worker.js"
      ).catch(error => {
        console.error("Service worker error:", error);
      });
    });
  }

})();
