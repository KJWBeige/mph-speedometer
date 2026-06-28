const METERS_PER_SECOND_TO_MPH = 2.2369362921;
const GAUGE_MAX_MPH = 30;
const GAUGE_SWEEP_DEGREES = 260;
const GAUGE_START_DEGREES = -130;
const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

const els = {
  speed: document.querySelector("#speedValue"),
  unit: document.querySelector("#unitLabel"),
  start: document.querySelector("#startButton"),
  reset: document.querySelector("#resetButton"),
  status: document.querySelector("#statusText"),
  dot: document.querySelector(".dot"),
  max: document.querySelector("#maxSpeed"),
  avg: document.querySelector("#avgSpeed"),
  accuracy: document.querySelector("#accuracy"),
  needle: document.querySelector("#needle"),
  dialTicks: document.querySelector("#dialTicks"),
  compassNeedle: document.querySelector("#compassNeedle"),
  headingText: document.querySelector("#headingText")
};

const state = {
  watchId: null,
  current: 0,
  max: 0,
  samples: [],
  lastPosition: null,
  heading: null
};

function convert(metersPerSecond) {
  return Math.max(0, metersPerSecond * METERS_PER_SECOND_TO_MPH);
}

function speedToAngle(speed) {
  const ratio = Math.min(Math.max(speed / GAUGE_MAX_MPH, 0), 1);
  return GAUGE_START_DEGREES + ratio * GAUGE_SWEEP_DEGREES;
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

function bearingDegrees(a, b) {
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
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

function directionLabel(heading) {
  if (heading === null) return "--";
  const index = Math.round(heading / 45) % DIRECTIONS.length;
  return DIRECTIONS[index];
}

function renderCompass() {
  if (state.heading === null) {
    els.headingText.textContent = "--";
    return;
  }

  els.headingText.textContent = `${directionLabel(state.heading)} ${Math.round(state.heading)} deg`;
  els.compassNeedle.style.transform = `translate(-50%, -50%) rotate(${state.heading}deg)`;
}

function render() {
  const displayValue = Math.round(state.current);
  const maxValue = Math.round(state.max);
  const avg = state.samples.length
    ? Math.round(state.samples.reduce((sum, value) => sum + value, 0) / state.samples.length)
    : 0;
  const angle = speedToAngle(state.current);

  els.speed.textContent = String(displayValue);
  els.unit.textContent = "MPH";
  els.max.textContent = String(maxValue);
  els.avg.textContent = String(avg);
  els.needle.style.transform = `translate(-50%, -100%) rotate(${angle}deg)`;
  renderCompass();
}

function updateHeading(position) {
  const gpsHeading = position.coords.heading;
  if (typeof gpsHeading === "number" && !Number.isNaN(gpsHeading)) {
    state.heading = gpsHeading;
    return;
  }

  if (!state.lastPosition) return;
  const meters = haversineMeters(state.lastPosition.coords, position.coords);
  if (meters >= 3) {
    state.heading = bearingDegrees(state.lastPosition.coords, position.coords);
  }
}

function updateFromPosition(position) {
  const rawSpeed = typeof position.coords.speed === "number" && position.coords.speed >= 0
    ? position.coords.speed
    : fallbackSpeed(position);

  state.current = convert(rawSpeed);
  state.max = Math.max(state.max, state.current);
  updateHeading(position);
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
  state.heading = null;
  els.accuracy.textContent = "--";
  render();
}

function buildDial() {
  const tickRadius = 43;
  const labelRadius = 63;
  const fragment = document.createDocumentFragment();

  for (let mph = 0; mph <= GAUGE_MAX_MPH; mph += 1) {
    const angle = speedToAngle(mph);
    const radians = (angle - 90) * Math.PI / 180;
    const tickX = 50 + Math.cos(radians) * tickRadius;
    const tickY = 50 + Math.sin(radians) * tickRadius;
    const tick = document.createElement("span");
    tick.className = mph % 5 === 0 ? "tick major" : "tick";
    tick.style.left = `${tickX}%`;
    tick.style.top = `${tickY}%`;
    tick.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    fragment.appendChild(tick);

    if (mph % 5 === 0) {
      const labelX = 50 + Math.cos(radians) * labelRadius;
      const labelY = 50 + Math.sin(radians) * labelRadius;
      const label = document.createElement("span");
      label.className = "tick-label";
      label.textContent = String(mph);
      label.style.left = `${labelX}%`;
      label.style.top = `${labelY}%`;
      label.style.transform = "translate(-50%, -50%)";
      fragment.appendChild(label);
    }
  }

  els.dialTicks.appendChild(fragment);
}

els.start.addEventListener("click", startTracking);
els.reset.addEventListener("click", reset);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

buildDial();
render();
