# Kilkenny DEM Viewer

An interactive digital elevation model (DEM) viewer for a 25km-radius area
around Kilkenny City, Ireland. Built with [MapLibre GL JS](https://maplibre.org/),
hosted as a static site on GitHub Pages.

**Live demo:** https://brennash.github.io/KilkennyMapData/

## Features

- 3D terrain rendering with adjustable vertical exaggeration
- Hillshade relief shading with adjustable intensity
- Switchable basemaps: OpenStreetMap streets, OpenTopoMap, or hillshade-only
- Click/hover elevation readout (via `queryTerrainElevation`)
- Map is bounded to a ~25km radius around Kilkenny City centre
  (52.6542° N, -7.2448° W)

## Data sources

- **Elevation**: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)
  (Terrarium-encoded raster-dem, derived from SRTM / EU-DEM / GMTED2010, via
  Mapzen), served from the public `elevation-tiles-prod` S3 bucket — no API
  key required.
- **Basemaps**: [OpenStreetMap](https://www.openstreetmap.org/copyright) standard
  tiles and [OpenTopoMap](https://opentopomap.org/) (CC-BY-SA) — both free,
  no API key required.

## Running locally

This is a static site with no build step. Serve the directory with any
static file server, e.g.:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## Deploying

Push to the `main` branch and enable GitHub Pages (Settings → Pages → Deploy
from branch `main`, root). No build step is required.
