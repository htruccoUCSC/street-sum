// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css"; // supporting style for Leaflet
import "./style.css"; // student-controlled page style

// Fix missing marker images
import "./_leafletWorkaround.ts"; // fixes for missing Leaflet images

// Import our luck function
import luck from "./_luck.ts";

// Create basic UI elements

const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

// Movement mode switch UI (toggle)
const movementModeDiv = document.createElement("div");
movementModeDiv.className = "movement-mode";
const movementModeLabel = document.createElement("label");
movementModeLabel.htmlFor = "movementModeToggle";
movementModeLabel.textContent = "Use geolocation:";
const movementModeToggle = document.createElement("input");
movementModeToggle.type = "checkbox";
movementModeToggle.id = "movementModeToggle";
movementModeToggle.setAttribute("aria-label", "Toggle geolocation movement");
movementModeDiv.append(movementModeLabel, movementModeToggle);
controlPanelDiv.append(movementModeDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

// Movement controls (non-functional UI for now) — will live bottom-center
const movementControls = document.createElement("div");
movementControls.id = "movementControls";
// Layout: up button, then left/right row, then down button
const btnUp = document.createElement("button");
btnUp.className = "move-btn";
btnUp.setAttribute("data-dir", "north");
btnUp.setAttribute("aria-label", "Move north");
btnUp.textContent = "▲";

const midRow = document.createElement("div");
midRow.className = "movement-row";
const btnLeft = document.createElement("button");
btnLeft.className = "move-btn";
btnLeft.setAttribute("data-dir", "west");
btnLeft.setAttribute("aria-label", "Move west");
btnLeft.textContent = "◀";
const btnRight = document.createElement("button");
btnRight.className = "move-btn";
btnRight.setAttribute("data-dir", "east");
btnRight.setAttribute("aria-label", "Move east");
btnRight.textContent = "▶";
midRow.append(btnLeft, btnRight);

const btnDown = document.createElement("button");
btnDown.className = "move-btn";
btnDown.setAttribute("data-dir", "south");
btnDown.setAttribute("aria-label", "Move south");
btnDown.textContent = "▼";

movementControls.append(btnUp, midRow, btnDown);
document.body.append(movementControls);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);
// status area: a stable status text and a separate container for transient messages
const statusTextDiv = document.createElement("div");
statusTextDiv.id = "statusText";
statusTextDiv.textContent = "Holding: none";
statusPanelDiv.append(statusTextDiv);

const statusMessagesDiv = document.createElement("div");
statusMessagesDiv.id = "statusMessages";
statusPanelDiv.append(statusMessagesDiv);

// What token the player is currently holding (null = empty-handed)
let playerHeldToken: number | null = null;
// Track tokens on tiles by their i,j key -> { marker, value }
const tokenMap = new Map<string, { marker: leaflet.Marker; value: number }>();
// Record player-driven changes so they can be inspected or persisted.
const changedCells = new Map<string, { value: number | null }>();
// (No global rect tracking — rectangles are created and removed per-render)

// Movement mode: 'button' = use the on-screen buttons; 'geolocation' = use device location
// Default to geolocation movement mode; the startup flow will request the user's location and fall back to buttons if unavailable.
let movementMode: "button" | "geolocation" = "geolocation";

// Enable/disable movement buttons based on current movementMode
function updateMovementButtons() {
  const disabled = movementMode !== "button";
  btnUp.disabled = disabled;
  btnDown.disabled = disabled;
  btnLeft.disabled = disabled;
  btnRight.disabled = disabled;
}

// Initialize button disabled state
updateMovementButtons();

// Helper: show a short transient status message
function showTransientStatus(text: string, ms = 3000) {
  const msg = document.createElement("div");
  msg.textContent = text;
  msg.className = "status-message";
  statusMessagesDiv.append(msg);
  setTimeout(() => msg.remove(), ms);
}

// LocalStorage session key
const SESSION_KEY = "cmpm121-session";

// Save current minimal session state to localStorage.
function saveSession() {
  try {
    const changedObj: Record<string, number | null> = {};
    changedCells.forEach((v, k) => {
      changedObj[k] = v.value;
    });
    const payload: Record<string, unknown> = {
      movementMode,
      playerHeldToken: playerHeldToken === null ? null : playerHeldToken,
      changedCells: changedObj,
    };
    if (movementMode === "button") {
      payload.playerCell = { i: playerCell.i, j: playerCell.j };
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch (e) {
    console.error("saveSession error", e);
    showTransientStatus("Failed to save session", 3000);
  }
}

// Load session from localStorage. Returns true if a session was restored.
function loadSession(): boolean {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      if (
        data.movementMode === "button" || data.movementMode === "geolocation"
      ) {
        movementMode = data.movementMode;
      }
      try {
        movementModeToggle.checked = movementMode === "geolocation";
      } catch (_e) {
        console.debug("movementModeToggle not yet available");
      }

      // restore held token
      playerHeldToken = typeof data.playerHeldToken === "number"
        ? data.playerHeldToken
        : null;
      statusTextDiv.textContent = playerHeldToken === null
        ? "Holding: none"
        : `Holding: ${playerHeldToken}`;

      // restore changedCells
      changedCells.clear();
      if (data.changedCells && typeof data.changedCells === "object") {
        for (const k of Object.keys(data.changedCells)) {
          const val = data.changedCells[k];
          changedCells.set(k, { value: val === null ? null : val });
        }
      }

      // restore playerCell if button mode
      if (
        movementMode === "button" && data.playerCell &&
        typeof data.playerCell.i === "number" &&
        typeof data.playerCell.j === "number"
      ) {
        playerCell.i = data.playerCell.i;
        playerCell.j = data.playerCell.j;
        const snapped = cellBottomLeftLatLng(playerCell.i, playerCell.j);
        playerMarker.setLatLng(snapped);
        try {
          playerMarker.addTo(map);
        } catch (_e) {
          console.debug("playerMarker.addTo failed");
        }
        map.setView(snapped, GAMEPLAY_ZOOM_LEVEL);
      }

      showTransientStatus("Session loaded", 1500);
      return true;
    }
  } catch (e) {
    console.error("loadSession error", e);
    showTransientStatus("Failed to load session", 3000);
  }
  return false;
}

// Wire movement-mode toggle after movementMode and helpers are defined
movementModeToggle.checked = movementMode === "geolocation";
movementModeToggle.addEventListener("change", () => {
  const wantsGeo = movementModeToggle.checked;
  if (
    (wantsGeo && movementMode === "geolocation") ||
    (!wantsGeo && movementMode === "button")
  ) return;
  if (!wantsGeo) {
    // Switch to button controls: stop tracking but keep current cell
    movementMode = "button";
    updateMovementButtons();
    stopGeolocationWatch();
    // persist movement mode and current button-mode cell
    saveSession();
    showTransientStatus("Switched to button movement", 2000);
    return;
  }

  // Switch to geolocation: request current position to prompt for permission if needed, snap to cell on success, and start watch.
  if (!("geolocation" in navigator)) {
    showTransientStatus("Geolocation not supported in this browser", 3000);
    movementModeToggle.checked = false;
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { cell, snapped } = snapLatLngToCellBottomLeft(
        pos.coords.latitude,
        pos.coords.longitude,
      );
      playerCell.i = cell.i;
      playerCell.j = cell.j;
      playerMarker.setLatLng(snapped);
      // Ensure the marker is on the map
      try {
        playerMarker.addTo(map);
      } catch (e) {
        console.debug(e);
      }
      map.setView(snapped, GAMEPLAY_ZOOM_LEVEL);
      movementMode = "geolocation";
      updateMovementButtons();
      startGeolocationWatch();
      // persist movement mode change
      saveSession();
      showTransientStatus("Switched to geolocation movement", 2000);
      renderVisibleCells();
    },
    (_err) => {
      showTransientStatus(
        "Could not enable geolocation; staying in button mode",
        3000,
      );
      movementModeToggle.checked = false;
    },
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
  );
});

// Save/Load buttons removed: the app autosaves and autoloads from localStorage.

// Show a temporary congratulations message when player reaches a target token value
function congratulateIfReached(value: number) {
  const TARGET = 128;
  if (value !== TARGET) return;
  const msg = document.createElement("div");
  msg.textContent = `🎉 Congratulations — you made a ${TARGET} token!`;
  msg.className = "congrats-message";
  // place the message in the status panel so it's visible below the map
  statusMessagesDiv.append(msg);
  setTimeout(() => msg.remove(), 5000);
}
// Our classroom location (used as initial player/map center)
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
// Token distribution tuning: skew > 1 biases toward lower-value bins (more 1s and 2s)
const TOKEN_SKEW = 2;
// A token is present when luck < TOKEN_SPAWN_PROBABILITY
const TOKEN_SPAWN_PROBABILITY = 0.1;
// How far (in tile blocks) the player can reach to pick up a token
const PICKUP_RADIUS = 3;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Layer group that holds all currently visible cells/markers.
const viewLayer = leaflet.layerGroup().addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");

const origin = CLASSROOM_LATLNG;

// Helper: convert lat/lng to global cell coordinates aligned to Null Island (0,0).
function latLngToCell(lat: number, lng: number) {
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  return { i, j };
}

// Helper: convert global cell indices to a Leaflet LatLngBounds
function cellToBounds(i: number, j: number) {
  const south = i * TILE_DEGREES;
  const west = j * TILE_DEGREES;
  const north = (i + 1) * TILE_DEGREES;
  const east = (j + 1) * TILE_DEGREES;
  return leaflet.latLngBounds([
    [south, west],
    [north, east],
  ]);
}

// Player's current cell indices (mutable when moving)
const playerCell = latLngToCell(origin.lat, origin.lng);

// Helper: bottom-left corner LatLng of a cell (used for player placement)
function cellBottomLeftLatLng(i: number, j: number) {
  const lat = i * TILE_DEGREES;
  const lng = j * TILE_DEGREES;
  return leaflet.latLng(lat, lng);
}

// Helper: given an arbitrary lat/lng, compute the cell indices
function snapLatLngToCellBottomLeft(lat: number, lng: number) {
  const cell = latLngToCell(lat, lng);
  const snapped = cellBottomLeftLatLng(cell.i, cell.j);
  return { cell, snapped } as {
    cell: { i: number; j: number };
    snapped: leaflet.LatLng;
  };
}

// NOTE: do not place or add the player marker here — it will be placed and added once the geolocation startup check completes

// Move player by one cell in the given direction and re-render view
function movePlayer(
  dir: "north" | "south" | "east" | "west",
  options: { force?: boolean } = {},
) {
  // Prevent button-based movement when we're in geolocation mode unless forced
  if (!options.force && movementMode !== "button") {
    statusTextDiv.textContent = "Movement disabled in geolocation mode";
    return;
  }
  switch (dir) {
    case "north":
      playerCell.i += 1;
      break;
    case "south":
      playerCell.i -= 1;
      break;
    case "east":
      playerCell.j += 1;
      break;
    case "west":
      playerCell.j -= 1;
      break;
  }
  // Move the player marker to the new bottom-left corner
  const pos = cellBottomLeftLatLng(playerCell.i, playerCell.j);
  playerMarker.setLatLng(pos);
  // Re-render the visible cells so reach checks and view align with new cell
  renderVisibleCells();
  // persist session (button-mode stores playerCell)
  saveSession();
}

// Wire movement buttons to the movePlayer function
btnUp.addEventListener("click", () => movePlayer("north"));
btnDown.addEventListener("click", () => movePlayer("south"));
btnLeft.addEventListener("click", () => movePlayer("west"));
btnRight.addEventListener("click", () => movePlayer("east"));

// helper: create and add the rectangle for cell
function createRect(i: number, j: number) {
  const bounds = cellToBounds(i, j);
  const withinRange = Math.abs(i - playerCell.i) <= PICKUP_RADIUS &&
    Math.abs(j - playerCell.j) <= PICKUP_RADIUS;
  const rect = leaflet.rectangle(bounds, {
    weight: 1,
    color: withinRange ? "#33aa33" : "#3388ff",
    fillOpacity: withinRange ? 0.12 : 0.04,
  });
  rect.addTo(viewLayer);
  return rect;
}

// helper: create a coin marker centered in cell (i,j) with given value
function createCoinMarker(i: number, j: number, value: number) {
  const centerLat = (i + 0.5) * TILE_DEGREES;
  const centerLng = (j + 0.5) * TILE_DEGREES;
  const coinIcon = leaflet.divIcon({
    className: "coin-marker",
    html: `<div class="coin">${value}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  const marker = leaflet.marker([centerLat, centerLng], {
    icon: coinIcon,
    interactive: true,
  });
  marker.addTo(viewLayer);
  return marker;
}

// Render all cells that intersect the current map view.
function renderVisibleCells() {
  viewLayer.clearLayers();
  tokenMap.clear();
  const bounds = map.getBounds();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();

  const minI = Math.floor(south / TILE_DEGREES);
  const maxI = Math.floor(north / TILE_DEGREES);
  const minJ = Math.floor(west / TILE_DEGREES);
  const maxJ = Math.floor(east / TILE_DEGREES);

  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      createCell(i, j);
    }
  }
  // No global rectangle tracking — styles are applied at creation time.
}

// helper: spawn a token from deterministic luck and wire its pickup
function spawnTokenAtCell(i: number, j: number) {
  const r = luck([i, j].toString());
  if (r >= TOKEN_SPAWN_PROBABILITY) return;
  const maxBins = 7;
  const norm = r / TOKEN_SPAWN_PROBABILITY;
  let bin = Math.floor(Math.pow(norm, TOKEN_SKEW) * maxBins);
  if (bin < 0) bin = 0;
  if (bin >= maxBins) bin = maxBins - 1;
  const tokenValue = 2 ** bin;

  const coinMarker = createCoinMarker(i, j, tokenValue);
  const key = `${i},${j}`;
  tokenMap.set(key, { marker: coinMarker, value: tokenValue });
  coinMarker.on("click", () => {
    const withinRange = Math.abs(i - playerCell.i) <= PICKUP_RADIUS &&
      Math.abs(j - playerCell.j) <= PICKUP_RADIUS;
    if (!withinRange) {
      statusTextDiv.textContent =
        `Too far to pick up (need <= ${PICKUP_RADIUS} blocks)`;
      return;
    }
    const entry = tokenMap.get(key);
    if (!entry) return; // nothing to pick up (race)
    const currentValue = entry.value;
    if (playerHeldToken === null) {
      // pick up the token
      playerHeldToken = currentValue;
      statusTextDiv.textContent = `Holding: ${currentValue}`;
      entry.marker.remove();
      tokenMap.delete(key);
      // record that this cell is now empty (player picked it up)
      changedCells.set(key, { value: null });
      console.log(`changedCells[${key}] = null`);
      // persist session
      saveSession();
    } else if (playerHeldToken === currentValue) {
      // merge: double the token on the tile
      const newValue = currentValue * 2;
      const el = entry.marker.getElement();
      if (el) {
        const coinEl = el.querySelector(".coin");
        if (coinEl) coinEl.textContent = String(newValue);
      }
      tokenMap.set(key, { marker: entry.marker, value: newValue });
      // record the merge
      changedCells.set(key, { value: newValue });
      console.log(`changedCells[${key}] = ${newValue}`);
      // persist session
      saveSession();
      // If we reached the target value, show congratulations
      congratulateIfReached(newValue);
      playerHeldToken = null;
      statusTextDiv.textContent = `Merged to ${newValue} — Holding: none`;
    } else {
      statusTextDiv.textContent =
        `Already holding ${playerHeldToken}. Drop it first.`;
    }
  });
}

// helper: attach drop handler so clicking rect places a held token
function attachDropHandler(i: number, j: number, rect: leaflet.Rectangle) {
  rect.on("click", () => {
    const withinRange = Math.abs(i - playerCell.i) <= PICKUP_RADIUS &&
      Math.abs(j - playerCell.j) <= PICKUP_RADIUS;
    if (!withinRange) {
      statusTextDiv.textContent =
        `Too far to place (need <= ${PICKUP_RADIUS} blocks)`;
      return;
    }
    const key = `${i},${j}`;
    const entry = tokenMap.get(key);

    // If tile has a token and player is holding one, attempt merge (must be equal)
    if (entry && playerHeldToken !== null) {
      if (entry.value === playerHeldToken) {
        const newValue = entry.value * 2;
        const markerElement = entry.marker.getElement();
        if (markerElement) {
          const coinEl = markerElement.querySelector(".coin");
          if (coinEl) coinEl.textContent = String(newValue);
        }
        tokenMap.set(key, { marker: entry.marker, value: newValue });
        // record the merge
        changedCells.set(key, { value: newValue });
        console.log(`changedCells[${key}] = ${newValue}`);
        // persist session
        saveSession();
        // Congratulate if we produced the target value
        congratulateIfReached(newValue);
        playerHeldToken = null;
        statusTextDiv.textContent = `Merged to ${newValue} — Holding: none`;
      } else {
        statusTextDiv.textContent = `Can't merge different token values`;
      }
      return;
    }

    // If tile already occupied and there's no merging, reject
    if (entry) {
      statusTextDiv.textContent = `Tile already has a token`;
      return;
    }

    if (playerHeldToken === null) {
      statusTextDiv.textContent = `Not holding a token to place`;
      return;
    }

    const placedValue = playerHeldToken as number;
    const placedMarker = createCoinMarker(i, j, placedValue);
    tokenMap.set(key, { marker: placedMarker, value: placedValue });
    // record the placement
    changedCells.set(key, { value: placedValue });
    console.log(`changedCells[${key}] = ${placedValue}`);
    // persist session
    saveSession();
    // (Do not congratulate on simple placement — only on merges.)

    // wire pickup for placed marker (read current tokenMap value on click)
    placedMarker.on("click", () => {
      const withinRange = Math.abs(i - playerCell.i) <= PICKUP_RADIUS &&
        Math.abs(j - playerCell.j) <= PICKUP_RADIUS;
      if (!withinRange) {
        statusTextDiv.textContent =
          `Too far to pick up (need <= ${PICKUP_RADIUS} blocks)`;
        return;
      }
      const e = tokenMap.get(key);
      if (!e) return;
      const current = e.value;
      if (playerHeldToken === null) {
        // pick up
        playerHeldToken = current;
        statusTextDiv.textContent = `Holding: ${current}`;
        placedMarker.remove();
        tokenMap.delete(key);
        // record pickup -> now empty
        changedCells.set(key, { value: null });
        console.log(`changedCells[${key}] = null`);
        // persist session
        saveSession();
      } else if (playerHeldToken === current) {
        // merge
        const newValue = current * 2;
        const el = e.marker.getElement();
        if (el) {
          const coinEl = el.querySelector(".coin");
          if (coinEl) coinEl.textContent = String(newValue);
        }
        tokenMap.set(key, { marker: e.marker, value: newValue });
        // record merge
        changedCells.set(key, { value: newValue });
        console.log(`changedCells[${key}] = ${newValue}`);
        // persist session
        saveSession();
        // If this merge hit the target, show congrats
        congratulateIfReached(newValue);
        playerHeldToken = null;
        statusTextDiv.textContent = `Merged to ${newValue} — Holding: none`;
      } else {
        statusTextDiv.textContent =
          `Already holding ${playerHeldToken}. Drop it first.`;
      }
    });

    playerHeldToken = null;
    statusTextDiv.textContent = `Placed: ${placedValue} — Holding: none`;
    // persist session
    saveSession();
  });
}

// Create a single grid cell at offsets (i,j) from origin. This function
function createCell(i: number, j: number) {
  const rect = createRect(i, j);
  const key = `${i},${j}`;

  // If the player has changed this cell, honor that state.
  const changed = changedCells.get(key);
  if (changed !== undefined) {
    // If changed.value is non-null, place that token value on the tile.
    if (changed.value !== null) {
      const placedMarker = createCoinMarker(i, j, changed.value);
      tokenMap.set(key, { marker: placedMarker, value: changed.value });
      // Wire pickup/merge handlers for this placed marker
      placedMarker.on("click", () => {
        const withinRange = Math.abs(i - playerCell.i) <= PICKUP_RADIUS &&
          Math.abs(j - playerCell.j) <= PICKUP_RADIUS;
        if (!withinRange) {
          statusTextDiv.textContent =
            `Too far to pick up (need <= ${PICKUP_RADIUS} blocks)`;
          return;
        }
        const e = tokenMap.get(key);
        if (!e) return;
        const current = e.value;
        if (playerHeldToken === null) {
          // pick up
          playerHeldToken = current;
          statusTextDiv.textContent = `Holding: ${current}`;
          placedMarker.remove();
          tokenMap.delete(key);
          // record pickup -> now empty
          changedCells.set(key, { value: null });
          console.log(`changedCells[${key}] = null`);
        } else if (playerHeldToken === current) {
          // merge
          const newValue = current * 2;
          const el = e.marker.getElement();
          if (el) {
            const coinEl = el.querySelector(".coin");
            if (coinEl) coinEl.textContent = String(newValue);
          }
          tokenMap.set(key, { marker: e.marker, value: newValue });
          // record merge
          changedCells.set(key, { value: newValue });
          console.log(`changedCells[${key}] = ${newValue}`);
          // If this merge hit the target, show congrats
          congratulateIfReached(newValue);
          playerHeldToken = null;
          statusTextDiv.textContent = `Merged to ${newValue} — Holding: none`;
        } else {
          statusTextDiv.textContent =
            `Already holding ${playerHeldToken}. Drop it first.`;
        }
      });
    }
    // If changed.value is null, intentionally leave tile empty.
  } else {
    // No recorded change: spawn deterministically from luck
    spawnTokenAtCell(i, j);
  }

  attachDropHandler(i, j, rect);
}

// Attempt to use browser geolocation on startup.
function tryUseGeolocationAtStartup() {
  if (!("geolocation" in navigator)) {
    // No geolocation support — render at classroom origin
    const msg = document.createElement("div");
    msg.textContent = "Geolocation not available — using default start.";
    msg.className = "status-message";
    statusMessagesDiv.append(msg);
    setTimeout(() => msg.remove(), 4000);
    renderVisibleCells();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const { cell, snapped } = snapLatLngToCellBottomLeft(lat, lng);
      playerCell.i = cell.i;
      playerCell.j = cell.j;
      playerMarker.setLatLng(snapped);
      playerMarker.addTo(map);
      map.setView(snapped, GAMEPLAY_ZOOM_LEVEL);
      const msg = document.createElement("div");
      msg.textContent = "Using device location as starting position.";
      msg.className = "status-message";
      statusMessagesDiv.append(msg);
      setTimeout(() => msg.remove(), 4000);
      movementMode = "geolocation";
      updateMovementButtons();
      try {
        movementModeToggle.checked = true;
      } catch (e) {
        console.debug("movementModeSelect not yet available", e);
      }
      // persist movement mode choice
      saveSession();
      // Start continuous updates
      startGeolocationWatch();
      renderVisibleCells();
    },
    (_err) => {
      const msg = document.createElement("div");
      msg.textContent = `Geolocation unavailable — using default start.`;
      msg.className = "status-message";
      statusMessagesDiv.append(msg);
      setTimeout(() => msg.remove(), 4000);
      movementMode = "button";
      updateMovementButtons();
      try {
        movementModeToggle.checked = false;
      } catch (e) {
        console.debug("movementModeSelect not yet available", e);
      }
      stopGeolocationWatch();
      const { snapped } = snapLatLngToCellBottomLeft(origin.lat, origin.lng);
      playerMarker.setLatLng(snapped);
      playerMarker.addTo(map);
      // persist fallback to button mode
      saveSession();
      renderVisibleCells();
    },
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
  );
}

// Initial startup: try to restore session from localStorage; otherwise prefer geolocation
const sessionRestored = loadSession();
if (!sessionRestored || movementMode === "geolocation") {
  tryUseGeolocationAtStartup();
} else {
  // restored a button-mode session: ensure buttons are wired and view reflects restored state
  updateMovementButtons();
  renderVisibleCells();
}

// Geolocation watch controls: when in geolocation movement mode we want to continuously update the player's cell as the device moves.
let geoWatchId: number | null = null;

function startGeolocationWatch() {
  if (!("geolocation" in navigator)) return;
  if (geoWatchId !== null) return; // already watching

  geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const { cell, snapped } = snapLatLngToCellBottomLeft(lat, lng);
      // Only update when the snapped cell changes to avoid unnecessary work
      if (cell.i !== playerCell.i || cell.j !== playerCell.j) {
        playerCell.i = cell.i;
        playerCell.j = cell.j;
        playerMarker.setLatLng(snapped);
        // Keep the map centered on the player when moving
        map.setView(snapped, GAMEPLAY_ZOOM_LEVEL);
        renderVisibleCells();
        // persist movement/mode change (note: saveSession only stores playerCell when in button mode)
        saveSession();
      }
    },
    (err) => {
      // err.code values: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
      if (!err) return;
      // Ignore intermittent timeouts (3) and position-unavailable (2).
      if (err.code === 3) {
        console.debug("Geolocation watch timeout (ignored)", err.message);
        return;
      }
      if (err.code === 2) {
        console.debug(
          "Geolocation position unavailable (ignored)",
          err.message,
        );
        return;
      }
      // If permission was revoked, stop the watch and notify the user.
      if (err.code === 1) {
        stopGeolocationWatch();
        const msg = document.createElement("div");
        msg.textContent = "Location permission denied — tracking stopped.";
        msg.className = "status-message";
        statusMessagesDiv.append(msg);
        setTimeout(() => msg.remove(), 4000);
        return;
      }
      // For other errors (e.g., POSITION_UNAVAILABLE) show a brief message.
      console.warn("Geolocation watch error", err);
      const msg = document.createElement("div");
      msg.textContent = `Location error: ${err.message || "unknown"}`;
      msg.className = "status-message";
      statusMessagesDiv.append(msg);
      setTimeout(() => msg.remove(), 4000);
    },
    { enableHighAccuracy: false, maximumAge: 10000, timeout: 10000 },
  );
  const msg = document.createElement("div");
  msg.textContent = "Started location tracking";
  msg.className = "status-message";
  statusMessagesDiv.append(msg);
  setTimeout(() => msg.remove(), 2000);
}

function stopGeolocationWatch() {
  if (geoWatchId === null) return;
  navigator.geolocation.clearWatch(geoWatchId);
  geoWatchId = null;
  const msg = document.createElement("div");
  msg.textContent = "Stopped location tracking";
  msg.className = "status-message";
  statusMessagesDiv.append(msg);
  setTimeout(() => msg.remove(), 2000);
}

// Expose helpers for testing in the console
declare global {
  interface Window {
    startGeolocationWatch?: () => void;
    stopGeolocationWatch?: () => void;
  }
}

// Re-render visible cells whenever the map stops moving.
map.on("moveend", () => {
  renderVisibleCells();
});
