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

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// What token the player is currently holding (null = empty-handed)
let playerHeldToken: number | null = null;
statusPanelDiv.innerHTML = `Holding: none`;
// Track tokens on tiles by their i,j key -> { marker, value }
const tokenMap = new Map<string, { marker: leaflet.Marker; value: number }>();

// Our classroom location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE_X = 35;
const NEIGHBORHOOD_SIZE_Y = 14;
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

// Add a marker to represent the player
const playerMarker = leaflet.marker(CLASSROOM_LATLNG);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

const origin = CLASSROOM_LATLNG;

// helper: create and add the rectangle for cell
function createRect(i: number, j: number) {
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);
  const rect = leaflet.rectangle(bounds, {
    weight: 1,
    color: "#3388ff",
    fillOpacity: 0.04,
  });
  rect.addTo(map);
  return rect;
}

// helper: create a coin marker centered in cell (i,j) with given value
function createCoinMarker(i: number, j: number, value: number) {
  const centerLat = origin.lat + (i + 0.5) * TILE_DEGREES;
  const centerLng = origin.lng + (j + 0.5) * TILE_DEGREES;
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
  marker.addTo(map);
  return marker;
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
    const withinRange = Math.abs(i) <= PICKUP_RADIUS &&
      Math.abs(j) <= PICKUP_RADIUS;
    if (!withinRange) {
      statusPanelDiv.innerHTML =
        `Too far to pick up (need <= ${PICKUP_RADIUS} blocks)`;
      return;
    }
    if (playerHeldToken === null) {
      playerHeldToken = tokenValue;
      statusPanelDiv.innerHTML = `Holding: ${tokenValue}`;
      coinMarker.remove();
      tokenMap.delete(key);
    } else {
      statusPanelDiv.innerHTML =
        `Already holding ${playerHeldToken}. Drop it first.`;
    }
  });
}

// helper: attach drop handler so clicking rect places a held token
function attachDropHandler(i: number, j: number, rect: leaflet.Rectangle) {
  rect.on("click", () => {
    const withinRange = Math.abs(i) <= PICKUP_RADIUS &&
      Math.abs(j) <= PICKUP_RADIUS;
    if (!withinRange) {
      statusPanelDiv.innerHTML =
        `Too far to place (need <= ${PICKUP_RADIUS} blocks)`;
      return;
    }
    const key = `${i},${j}`;
    if (tokenMap.has(key)) {
      statusPanelDiv.innerHTML = `Tile already has a token`;
      return;
    }
    if (playerHeldToken === null) {
      statusPanelDiv.innerHTML = `Not holding a token to place`;
      return;
    }

    const placedValue = playerHeldToken as number;
    const placedMarker = createCoinMarker(i, j, placedValue);
    tokenMap.set(key, { marker: placedMarker, value: placedValue });

    // wire pickup for placed marker
    placedMarker.on("click", () => {
      const withinRange = Math.abs(i) <= PICKUP_RADIUS &&
        Math.abs(j) <= PICKUP_RADIUS;
      if (!withinRange) {
        statusPanelDiv.innerHTML =
          `Too far to pick up (need <= ${PICKUP_RADIUS} blocks)`;
        return;
      }
      if (playerHeldToken === null) {
        playerHeldToken = placedValue;
        statusPanelDiv.innerHTML = `Holding: ${placedValue}`;
        placedMarker.remove();
        tokenMap.delete(key);
      } else {
        statusPanelDiv.innerHTML =
          `Already holding ${playerHeldToken}. Drop it first.`;
      }
    });

    playerHeldToken = null;
    statusPanelDiv.innerHTML = `Placed: ${placedValue} — Holding: none`;
  });
}

// Create a single grid cell at offsets (i,j) from origin. This function
function createCell(i: number, j: number) {
  const rect = createRect(i, j);
  spawnTokenAtCell(i, j);
  attachDropHandler(i, j, rect);
}

// Draw a grid of tiles around the player's location using the neighborhood range.
for (let i = -NEIGHBORHOOD_SIZE_Y; i <= NEIGHBORHOOD_SIZE_Y; i++) {
  for (let j = -NEIGHBORHOOD_SIZE_X; j <= NEIGHBORHOOD_SIZE_X; j++) {
    createCell(i, j);
  }
}
