# LaserWeb (4.0.x)

---

## Fork Changes

This is a fork of the original [LaserWeb4](https://github.com/LaserWeb/LaserWeb4) (`dev-es6` branch). The following features and bug fixes have been added on top of the original codebase.

### Bug Fixes

- **GCode generation for mixed open/closed geometry** — Documents containing both closed paths (shapes/polygons) and open paths (lines, polylines, strokes) now correctly generate GCode for all elements. Previously, the preflight worker's path classification logic would discard open paths whenever any closed path was present in the same document, because Clipper's `CleanPolygons`/`SimplifyPolygons` was applied to all paths at once. Closed and open raw paths are now split and processed independently before routing to `geometry` and `openGeometry` respectively.

- **GCode preview coordinate system** — GCode preview rendering now correctly transforms machine coordinates to WebGL space, respecting the configured machine origin position and axis directions.

### New Features

#### Machine Origin & Coordinate System
- **Configurable machine origin** — Added support for selecting the machine origin corner (`BL`, `BR`, `TL`, `TR`) with per-axis inversion options. All coordinate transforms (GCode generation, preview rendering, object placement) respect the configured origin and axis directions.

#### FluidNC Support
- **FluidNC HTTP and WebSocket integration** — Added a FluidNC communication backend using HTTP and WebSocket clients, enabling native connectivity to FluidNC-based controllers alongside the existing Grbl/Smoothieware/TinyG support.

#### Workspace & Selection
- **Double-click to select parent group** — Double-clicking an element in the workspace now selects its parent group instead of the individual child element, making it easier to work with grouped SVG structures.
- **Toggle selection** — Added toggle-based document selection in the workspace canvas (clicking a selected document deselects it).
- **Select / toggle visibility by color** — Documents can now be selected or have their visibility toggled by matching stroke/fill color, making it easy to manage layers imported from multi-color SVG files.

#### CAM Operations
- **Order inside features first** — Laser Cut and Mill operations now support an *Order Inside First* option, which sorts toolpaths so that interior features (pockets, holes) are cut before the outer contour, preventing the workpiece from shifting.
- **Genetic algorithm path optimization** — Laser Cut and Mill operations expose configurable parameters for the Genetic Algorithm (GA) used to minimize rapid travel between paths: population size, number of generations, crossover rate, and mutation rate.
- **Improved error handling in GCode generation** — Validation errors in laser cut operations no longer silently continue past the `done(false)` call; generation is now properly aborted when parameters are invalid.

#### Floating Toolbar
- **Duplicate selected object** — A *Duplicate* button has been added to the floating selection toolbar (equivalent to `Ctrl+D`), creating an in-place copy of the selected document(s).
- **Array Clone** — An *Array* button in the floating toolbar opens an inline panel to create a rectangular grid of copies. Parameters include number of rows and columns, X/Y gap between copies, and a *Gap + Size* toggle to choose between center-to-center or edge-to-edge spacing. Offsets are automatically adjusted to respect the configured machine origin coordinate system.

#### Tab Generation
- **Holding tabs with optional mouse bites** — The floating toolbar provides a *Tabs* panel that distributes holding tabs evenly around the perimeter of selected closed shapes. Configurable parameters include number of tabs, tab width and height. An optional *Mouse Bites* mode replaces each solid tab with a row of small overlapping circles (drill spots) so the part can be snapped out cleanly after cutting. Tabs are automatically added to all compatible operations (Laser Cut, Mill Cut, etc.) that reference the same documents.

#### Lead-In / Lead-Out
- **Lead-in and lead-out paths** — Laser Cut and Mill operations now support configurable lead-in and lead-out path segments that are appended to each closed contour toolpath. This prevents burn marks or dwell marks at the cut start/end point by moving the entry and exit away from the seam. Options per operation:
  - **Lead-In / Lead-Out** — enable independently per operation.
  - **Shape** — `line` (straight tangential ramp) or `arc` (circular approach).
  - **Length** — lead segment length in mm.
  - **Angle** — approach angle in degrees (0° = fully tangential, 90° = radial perpendicular).
  - **Side** — *Inside* checkbox controls whether the approach comes from inside or outside the contour. Open paths (engraving lines) are left unchanged.

#### Keyboard Shortcuts
- **Delete key removes selected objects** — Pressing `Delete` or `Backspace` while the workspace has focus now removes the currently selected document(s). The shortcut is suppressed when a text input, number field, or select control is focused to prevent accidental deletions while editing values in the toolbar.

#### Build System Upgrade
- **Webpack 2 → Webpack 5 migration** — The build toolchain has been upgraded from webpack 2.2 to webpack 5.105, webpack-dev-server 2 to 5.x, and Babel 6 to Babel 7. All source code incompatibilities have been fixed:
- **Vulnerability reduction:** Package audit vulnerabilities reduced from 80 to 11 via dependency upgrades. Remaining issues are unrelated to build/dev toolchain (bootstrap XSS, legacy packages).

---

This repository is a "development environment" - and no regular user would have to touch this at all (dont download the repo from here, use the Download links below)

## Download
Releases are made available on https://github.com/LaserWeb/LaserWeb4-Binaries/

## Documentation
For more documentation, go to the [Wiki](https://github.com/LaserWeb/LaserWeb4/wiki) or our website https://laserweb.yurl.ch

## Docker

- run image:
```sh
docker run -device=/dev/ttyUSB0 -p 8000:8000 joesantos/laserweb:latest
```
- connect to app: http://localhost:8000

### Development

Docker user targets:
- dev
- test

You can run the `dev` version of the app in Docker using the commands below.
- build `dev` image:
```sh
docker build --target dev -t laserweb:dev .
```
- run image:
```sh
docker run -it -device=/dev/ttyUSB0 --rm -p 8000:8000 laserweb:dev
```
- connect to app: http://localhost:8000

To build the release version:
```sh
docker build -f Dockerfile.release -t laserweb:release .
```

## Community
Please use the community forum on https://forum.makerforums.info/c/cad-cam/laserweb-cncweb/78 for questions and support.
Please only report confirmed bugs on the git [Issues tab](https://github.com/LaserWeb/LaserWeb4/issues).

## Supported firmwares

Note: Ever changing. See the Issues tab above for details.

| Firmware                  | Supported  | Raster Performance  | CNC Support  |Pull Requests Accepted             |
| ------------------------- |------------|:-------------------:|:------------:|:---------------------------------:|
| Grbl > v1.1f (ATmega328)  | Yes        | Good                |   Great      | Yes - improvements                |
| Grbl-Mega (ATmega2560)    | Yes        | Good                |   Great      | Yes - improvements                |
| Grbl-LPC (LPC176x)        | Yes        | Great               |   Great      | Yes - improvements                |
| Grbl_ESP32 (ESP32)        | Yes        | Great               |   Great      | Yes - improvements                |
| Smoothieware              | Yes *      | Okayish             |   Okayish    | Yes - improvements                |
| TinyG                     | Yes        | Unknown             |   Good       | Yes - improvements                |
| Marlin                    | Yes        | Unknown             |   No         | Yes - improvements                | 
| MarlinKimbra              | Yes        | Unknown             |   No         | Yes - improvements                | 
| Repetier                  | Yes        | Unknown             |   No         | Yes - improvements                |
| RepRapFirmware            | Yes        | Unknown             |   Yes        | Yes - improvements                |

* If fast raster engraving is important for you, we recommend replacing Smoothieware with grbl-LPC (https://github.com/cprezzi/grbl-LPC) which also runs on the LPC1769 based boards and performs much faster for laser raster applications.

## Wishlist

If you want to contribute, below are long standing community-requested enhancements, that a) we don't have time to code or b) need extra skills

* GCODE Optimiser - to cut down on G0 moves (something like http://parano.github.io/GeneticAlgorithm-TSP/)
* Implement "Raster > TSP-Vector" operation
* More Controllers! Help us implement more firmwares (improve TinyG add Marlin/Repetier, etc)
* WebGL Transformation Filters to use Webcam to setup stock
* Automate Electron Builds for all platforms

## How to contribute ?

Details on [https://github.com/LaserWeb/LaserWeb4/wiki/How-to-Contribute](https://github.com/LaserWeb/LaserWeb4/wiki/How-to-Contribute)

