# Interactive 3D city

The simulator renders the city as a real-time Three.js scene assembled from editable
geometry and the current city data. The local development server opens the landing
page at `/`; **Open the simulator** navigates to `/simulator.html`. GitHub Pages
publishes the intro as its root `index.html` and the simulator at `simulator.html`.
The local development server keeps `/index.html` as a direct simulator URL and
also serves `/simulator.html` as an alias.

The scene includes separately named buildings, road surfaces and markings, district
parcels, service buildings, park features, trees, streetlights, vehicles and renewable
energy landmarks. Roads retain their IDs and endpoints from the city file; clicking
roads and districts still uses the simulator's normal controls. **Download 3D city**
exports the named scene as a binary glTF (GLB) for use in other 3D tools.

Three.js and its GLTF exporter are vendored under `src/vendor` for static hosting;
their MIT license is included alongside the files. The npm dependency records the
upstream version used by the scene.
