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
// Track drawn rectangles by cell key so we can remove them when they leave view
const rectMap = new Map<string, leaflet.Rectangle>();
// Set of currently visible cell keys (i,j strings)
const visibleCellKeys = new Set<string>();

// Show a temporary congratulations message when player reaches a target token value
function congratulateIfReached(value: number) {
  const TARGET = 128;
  if (value !== TARGET) return;
  const msg = document.createElement("div");
  msg.textContent = `🎉 Congratulations — you made an ${TARGET} token!`;
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
playerMarker.addTo(map);

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

// Place the player marker at the bottom-left corner of the player's cell
playerMarker.setLatLng(cellBottomLeftLatLng(playerCell.i, playerCell.j));

// Move player by one cell in the given direction and re-render view
function movePlayer(dir: "north" | "south" | "east" | "west") {
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
  const bounds = map.getBounds();
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();

  const minI = Math.floor(south / TILE_DEGREES);
  const maxI = Math.floor(north / TILE_DEGREES);
  const minJ = Math.floor(west / TILE_DEGREES);
  const maxJ = Math.floor(east / TILE_DEGREES);

  const newVisible = new Set<string>();
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      newVisible.add(`${i},${j}`);
    }
  }

  // Remove cells that are no longer visible
  for (const key of Array.from(visibleCellKeys)) {
    if (!newVisible.has(key)) {
      const r = rectMap.get(key);
      if (r) {
        r.remove();
        rectMap.delete(key);
      }
      const e = tokenMap.get(key);
      if (e) {
        e.marker.remove();
        tokenMap.delete(key);
      }
      visibleCellKeys.delete(key);
    }
  }

  // Add new visible cells (leave existing ones alone)
  for (const key of newVisible) {
    if (!visibleCellKeys.has(key)) {
      const [si, sj] = key.split(",").map((s) => Number(s));
      createCell(si, sj);
      visibleCellKeys.add(key);
    }
  }
  // Update styles for all visible rectangles in case playerCell changed
  updateVisibleRectStyles();
}

// Update rectangle styles (color/fill) based on whether the cell is within
// the player's pickup radius.
function updateVisibleRectStyles() {
  for (const [key, rect] of rectMap.entries()) {
    const [iStr, jStr] = key.split(",");
    const i = Number(iStr);
    const j = Number(jStr);
    const withinRange = Math.abs(i - playerCell.i) <= PICKUP_RADIUS &&
      Math.abs(j - playerCell.j) <= PICKUP_RADIUS;
    rect.setStyle({
      color: withinRange ? "#33aa33" : "#3388ff",
      fillOpacity: withinRange ? 0.12 : 0.04,
    });
  }
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
    } else if (playerHeldToken === currentValue) {
      // merge: double the token on the tile
      const newValue = currentValue * 2;
      const el = entry.marker.getElement();
      if (el) {
        const coinEl = el.querySelector(".coin");
        if (coinEl) coinEl.textContent = String(newValue);
      }
      tokenMap.set(key, { marker: entry.marker, value: newValue });
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
      } else if (playerHeldToken === current) {
        // merge
        const newValue = current * 2;
        const el = e.marker.getElement();
        if (el) {
          const coinEl = el.querySelector(".coin");
          if (coinEl) coinEl.textContent = String(newValue);
        }
        tokenMap.set(key, { marker: e.marker, value: newValue });
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
  });
}

// Create a single grid cell at offsets (i,j) from origin. This function
function createCell(i: number, j: number) {
  const rect = createRect(i, j);
  const key = `${i},${j}`;
  rectMap.set(key, rect);
  spawnTokenAtCell(i, j);
  attachDropHandler(i, j, rect);
}

// Initial render: draw only cells visible in the current camera view.
renderVisibleCells();

// Re-render visible cells whenever the map stops moving.
map.on("moveend", () => {
  renderVisibleCells();
});
