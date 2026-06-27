const METERS_PER_SECOND_TO_MPH = 2.2369362921;
const METERS_PER_SECOND_TO_KPH = 3.6;

const els = {
  speed: document.querySelector("#speedValue"),
  unit: document.querySelector("#unitLabel"),
  unitButton: document.querySelector("#unitButton"),
  start: document.querySelector("#startButton"),
  reset: document.querySelector("#resetButton"),
  status: document.querySelector("#statusText"),
  dot: document.querySelector(".dot"),
  max: document.querySelector("#maxSpeed"),
  avg: document.querySelector("#avgSpeed"),
  accuracy: document.querySelector("#accuracy"),
  needle: document.querySelector("#needle")
};

const state = {
  watchId: null,
  unit: "mph",
  current: 0,
  max: 0,
  samples: [],
  lastPosition: null
};

function convert(metersPerSecond) {
  const factor = state.unit === "mph" ? METERS_PER_SECOND_TO_MPH : METERS_PER_SECOND_TO_KPH;
  return Math.max(0, metersPerSecond * factor);
}

function haversineMeters(a, b) {
  const radius = 6371000;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function fallbackSpeed(position) {
  if (!state.lastPosition) return 0;
  const seconds = (position.timestamp - state.lastPosition.timestamp) / 1000;
  if (seconds <= 0 || seconds > 8) return 0;
  const meters = haversineMeters(state.lastPosition.coords, position.coords);
  return meters / seconds;
}

function setStatus(text, mode) {
  els.status.textContent = text;
  els.dot.classList.toggle("live", mode === "live");
  els.dot.classList.toggle("error", mode === "error");
}

function render() {
  const displayValue = Math.round(state.current);
  const maxValue = Math.round(state.max);
  const avg = state.samples.length
    ? Math.round(state.samples.reduce((sum, value) => sum + value, 0) / state.samples.length)
    : 0;
  const maxScale = state.unit === "mph" ? 120 : 190;
  const ratio = Math.min(state.current / maxScale, 1);
  const angle = -130 + ratio * 260;

  els.speed.textContent = String(displayValue);
  els.unit.textContent = state.unit.toUpperCase();
  els.unitButton.textContent = state.unit.toUpperCase();
  els.max.textContent = String(maxValue);
  els.avg.textContent = String(avg);
  els.needle.style.transform = `translate(-50%, -100%) rotate(${angle}deg)`;
}

function updateFromPosition(position) {
  const rawSpeed = typeof position.coords.speed === "number" && position.coords.speed >= 0
    ? position.coords.speed
    : fallbackSpeed(position);

  state.current = convert(rawSpeed);
  state.max = Math.max(state.max, state.current);
  if (position.coords.accuracy) {
    els.accuracy.textContent = `${Math.round(position.coords.accuracy)}m`;
  }
  if (state.current > 1) {
    state.samples.push(state.current);
    state.samples = state.samples.slice(-120);
  }
  state.lastPosition = position;

  setStatus("GPS LIVE", "live");
  render();
}

function handleError(error) {
  const denied = error.code === error.PERMISSION_DENIED;
  setStatus(denied ? "GPS DENIED" : "GPS LOST", "error");
  els.start.disabled = false;
  els.start.textContent = "Start";
}

function startTracking() {
  if (!("geolocation" in navigator)) {
    setStatus("NO GPS", "error");
    return;
  }

  els.start.disabled = true;
  els.start.textContent = "Running";
  setStatus("GPS LOCK", "searching");

  state.watchId = navigator.geolocation.watchPosition(updateFromPosition, handleError, {
    enableHighAccuracy: true,
    maximumAge: 500,
    timeout: 12000
  });
}

function reset() {
  state.current = 0;
  state.max = 0;
  state.samples = [];
  state.lastPosition = null;
  els.accuracy.textContent = "--";
  render();
}

els.start.addEventListener("click", startTracking);
els.reset.addEventListener("click", reset);
els.unitButton.addEventListener("click", () => {
  state.unit = state.unit === "mph" ? "kph" : "mph";
  state.current = 0;
  state.max = 0;
  state.samples = [];
  render();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

render();
