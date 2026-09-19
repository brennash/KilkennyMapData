import * as maplibregl from "https://unpkg.com/maplibre-gl@6.10.0/dist/maplibre-gl.mjs";

// ---------------------------------------------------------------------------
// Kilkenny City centre + a ~10km-radius bounding box around it.
// (1 deg lat ~= 111.32km; 1 deg lon ~= 111.32km * cos(lat) at this latitude)
// ---------------------------------------------------------------------------
const CENTER = { lng: -7.2448, lat: 52.6542 };
const RADIUS_KM = 10;

const latDelta = RADIUS_KM / 111.32;
const lonDelta = RADIUS_KM / (111.32 * Math.cos((CENTER.lat * Math.PI) / 180));

const BBOX = {
  west: CENTER.lng - lonDelta,
  east: CENTER.lng + lonDelta,
  south: CENTER.lat - latDelta,
  north: CENTER.lat + latDelta,
};

// A little slack on the pan limit so the box edges aren't glued to the
// viewport, while the visible rectangle on the map still marks the true
// 10km box requested.
const PAN_PAD = 0.3;
const MAX_BOUNDS = [
  [BBOX.west - lonDelta * PAN_PAD, BBOX.south - latDelta * PAN_PAD],
  [BBOX.east + lonDelta * PAN_PAD, BBOX.north + latDelta * PAN_PAD],
];

const INITIAL_VIEW = {
  center: [CENTER.lng, CENTER.lat],
  zoom: 11.2,
  pitch: 55,
  bearing: -12,
};

const OSM_STREETS = [
  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
  "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
];
const OPENTOPOMAP = [
  "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
  "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
  "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
];

const bboxGeoJSON = {
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [BBOX.west, BBOX.south],
        [BBOX.east, BBOX.south],
        [BBOX.east, BBOX.north],
        [BBOX.west, BBOX.north],
        [BBOX.west, BBOX.south],
      ],
    ],
  },
};

const style = {
  version: 8,
  sources: {
    "osm-streets": {
      type: "raster",
      tiles: OSM_STREETS,
      tileSize: 256,
      maxzoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    },
    opentopomap: {
      type: "raster",
      tiles: OPENTOPOMAP,
      tileSize: 256,
      maxzoom: 17,
      attribution:
        "Map data &copy; OpenStreetMap contributors, SRTM &mdash; map style &copy; OpenTopoMap (CC-BY-SA)",
    },
    terrainSource: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: 15,
      attribution: "Terrain tiles &copy; Mapzen / AWS Terrain Tiles",
    },
    // Separate (but identical) source for the hillshade layer: MapLibre
    // recommends not sharing one raster-dem source between a hillshade
    // layer and the 3D terrain to avoid tile-quality conflicts.
    hillshadeSource: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: 15,
      attribution: "Terrain tiles &copy; Mapzen / AWS Terrain Tiles",
    },
    bbox: {
      type: "geojson",
      data: bboxGeoJSON,
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#dfe6e4" } },
    {
      id: "basemap-streets",
      type: "raster",
      source: "osm-streets",
      layout: { visibility: "visible" },
    },
    {
      id: "basemap-topo",
      type: "raster",
      source: "opentopomap",
      layout: { visibility: "none" },
    },
    {
      id: "hillshade",
      type: "hillshade",
      source: "hillshadeSource",
      paint: {
        "hillshade-illumination-direction": 315,
        "hillshade-exaggeration": 0.6,
        "hillshade-shadow-color": "#3b2f24",
        "hillshade-highlight-color": "#fdf6e8",
        "hillshade-accent-color": "#5c4a36",
      },
    },
    {
      id: "bbox-line",
      type: "line",
      source: "bbox",
      paint: {
        "line-color": "#b5651d",
        "line-width": 2,
        "line-dasharray": [2, 2],
      },
    },
  ],
};

const map = new maplibregl.Map({
  container: "map",
  style,
  center: INITIAL_VIEW.center,
  zoom: INITIAL_VIEW.zoom,
  pitch: INITIAL_VIEW.pitch,
  bearing: INITIAL_VIEW.bearing,
  maxBounds: MAX_BOUNDS,
  minZoom: 9,
  maxZoom: 17,
  antialias: true,
  attributionControl: { compact: true },
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

map.on("load", () => {
  map.setTerrain({ source: "terrainSource", exaggeration: 1.5 });

  try {
    map.setSky({
      "sky-color": "#7db9e8",
      "horizon-color": "#e8ecef",
      "fog-color": "#e8ecef",
      "fog-ground-blend": 0.5,
      "horizon-fog-blend": 0.5,
      "sky-horizon-blend": 0.5,
      "atmosphere-blend": 0.6,
    });
  } catch (err) {
    // Sky is a nice-to-have; ignore if unsupported.
    console.warn("Sky unavailable:", err);
  }

  // Kilkenny City centre marker.
  new maplibregl.Marker({ color: "#b5651d" })
    .setLngLat([CENTER.lng, CENTER.lat])
    .setPopup(new maplibregl.Popup({ offset: 18 }).setText("Kilkenny City centre"))
    .addTo(map);

  fitToBox(false);
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
// MapLibre throws "Style is not done loading" if a style-mutating call
// (setLayoutProperty/setPaintProperty/setTerrain) lands while the style is
// mid-update. With 3D terrain active this can linger well past the initial
// "load" event and the map's "idle" event isn't a reliable signal that it has
// cleared, so retry on a short bounded timer instead of losing the change.
function safeStyleUpdate(fn, attemptsLeft = 20) {
  try {
    fn();
  } catch (err) {
    if (attemptsLeft > 0) {
      setTimeout(() => safeStyleUpdate(fn, attemptsLeft - 1), 150);
    } else {
      console.warn("Giving up applying style update:", err);
    }
  }
}

const basemapSelect = document.getElementById("basemap-select");
basemapSelect.addEventListener("change", () => {
  const mode = basemapSelect.value;
  safeStyleUpdate(() => {
    map.setLayoutProperty("basemap-streets", "visibility", mode === "streets" ? "visible" : "none");
    map.setLayoutProperty("basemap-topo", "visibility", mode === "topo" ? "visible" : "none");
  });
});

const tiltToggle = document.getElementById("tilt-toggle");
tiltToggle.addEventListener("change", () => {
  map.easeTo({
    pitch: tiltToggle.checked ? INITIAL_VIEW.pitch : 0,
    duration: 500,
  });
});

const exaggerationSlider = document.getElementById("exaggeration-slider");
const exaggerationValue = document.getElementById("exaggeration-value");
exaggerationSlider.addEventListener("input", () => {
  const value = Number(exaggerationSlider.value);
  exaggerationValue.textContent = `${value.toFixed(1)}×`;
  safeStyleUpdate(() => {
    if (map.getTerrain()) {
      map.setTerrain({ source: "terrainSource", exaggeration: value });
    }
  });
});

const hillshadeSlider = document.getElementById("hillshade-slider");
const hillshadeValue = document.getElementById("hillshade-value");
hillshadeSlider.addEventListener("input", () => {
  const pct = Number(hillshadeSlider.value);
  hillshadeValue.textContent = `${pct}%`;
  safeStyleUpdate(() => map.setPaintProperty("hillshade", "hillshade-exaggeration", pct / 100));
});

const rotationSlider = document.getElementById("rotation-slider");
const rotationValue = document.getElementById("rotation-value");
rotationSlider.addEventListener("input", () => {
  const bearing = Number(rotationSlider.value);
  rotationValue.textContent = `${Math.round(bearing)}°`;
  map.setBearing(bearing);
});
// Keep the slider in sync when the map is rotated some other way
// (compass control drag, two-finger touch rotate, or the reset animation).
map.on("rotate", () => {
  const bearing = map.getBearing();
  rotationSlider.value = bearing;
  rotationValue.textContent = `${Math.round(bearing)}°`;
});

document.getElementById("reset-view").addEventListener("click", () => fitToBox(true));

function fitToBox(animate) {
  map.fitBounds(
    [
      [BBOX.west, BBOX.south],
      [BBOX.east, BBOX.north],
    ],
    {
      padding: 40,
      pitch: tiltToggle.checked ? INITIAL_VIEW.pitch : 0,
      bearing: INITIAL_VIEW.bearing,
      duration: animate ? 800 : 0,
    }
  );
}

// ---------------------------------------------------------------------------
// Elevation readout
// ---------------------------------------------------------------------------
const readoutElevation = document.getElementById("readout-elevation");
const readoutPosition = document.getElementById("readout-position");

let readoutPending = false;
map.on("mousemove", (e) => {
  if (readoutPending) return;
  readoutPending = true;
  requestAnimationFrame(() => {
    updateReadout(e.lngLat);
    readoutPending = false;
  });
});

function updateReadout(lngLat) {
  const elevation = map.queryTerrainElevation(lngLat);
  readoutPosition.textContent = `${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)}`;
  readoutElevation.textContent =
    elevation === null || elevation === undefined ? "–" : `${Math.round(elevation)} m`;
}

let pinnedMarker = null;
map.on("click", (e) => {
  const elevation = map.queryTerrainElevation(e.lngLat);
  const text =
    elevation === null || elevation === undefined
      ? "Elevation unavailable"
      : `<b>${Math.round(elevation)} m</b><br>${e.lngLat.lat.toFixed(4)}, ${e.lngLat.lng.toFixed(4)}`;

  if (pinnedMarker) pinnedMarker.remove();
  pinnedMarker = new maplibregl.Marker({ color: "#2b6cb0" })
    .setLngLat(e.lngLat)
    .setPopup(
      new maplibregl.Popup({ offset: 18, className: "pinned-elevation-popup" }).setHTML(text)
    )
    .addTo(map)
    .togglePopup();
});

window.addEventListener("resize", () => map.resize());
