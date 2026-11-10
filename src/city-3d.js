import * as THREE from 'three';
import { OrbitControls } from './vendor/addons/controls/OrbitControls.js';
import { GLTFExporter } from './vendor/addons/exporters/GLTFExporter.js';

var PALETTES = {
  residential: [0xd98b67, 0xe7c991, 0xd9d8c8, 0xc98e72, 0xf0d4ae],
  jobs: [0x648e9d, 0x94b6b2, 0xd39b68, 0x738aab, 0xc8d4cb],
  mixed: [0xb96750, 0xd6a16c, 0xe7c98e, 0x9d735d, 0xddb9a2],
  industrial: [0xc98755, 0x9c6a51, 0xb9a17c, 0x687a78]
};

function randomFor(seed) {
  var value = seed >>> 0;
  return function () {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function worldPoint(node, cityName) {
  var isBuiltInCity = cityName === 'Lumen Bay';
  var scale = isBuiltInCity ? 1.25 : 1;
  var spacing = isBuiltInCity && node.id === 'cbd' ? { x: 10, z: 8 } :
    isBuiltInCity && node.id === 'oldtown' ? { x: -19, z: 17 } :
      isBuiltInCity && node.id === 'riverside' ? { x: -17, z: 13 } :
        isBuiltInCity && node.id === 'harbor' ? { x: -17, z: 12 } : { x: 0, z: 0 };
  return { x: (node.x - 50) * scale + spacing.x, z: (node.y - 50) * scale + spacing.z };
}

function makeLabel(text, background, foreground) {
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  canvas.width = 512;
  canvas.height = 128;
  ctx.fillStyle = background || 'rgba(24, 42, 52, .86)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 112, 28);
  ctx.fill();
  ctx.fillStyle = foreground || '#ffffff';
  ctx.font = '700 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64, 460);
  var texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCityScene(host, data, handlers) {
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (error) {
    var status = host.querySelector('#city-scene-status');
    status.textContent = 'This browser could not start WebGL. Try enabling graphics acceleration or use an up-to-date browser.';
    throw new Error('WebGL renderer could not be created: ' + error.message);
  }

  function renderPixelRatio() {
    return Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2.25);
  }
  renderer.setPixelRatio(renderPixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'city-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.insertBefore(renderer.domElement, host.firstChild);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bd5f1);
  scene.fog = new THREE.Fog(0x9bd5f1, 100, 220);
  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 360);
  camera.position.set(72, 78, 84);
  camera.lookAt(0, 0, 0);

  var controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 70;
  controls.maxDistance = 215;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xe4f6ff, 0x67864d, 2.0));
  var sun = new THREE.DirectionalLight(0xfff0d7, 3.2);
  sun.position.set(-35, 75, 38);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -75;
  sun.shadow.camera.right = 75;
  sun.shadow.camera.top = 75;
  sun.shadow.camera.bottom = -75;
  sun.shadow.bias = -0.00015;
  scene.add(sun);

  var city = new THREE.Group();
  city.name = 'Lumen Bay City';
  scene.add(city);
  var groundGroup = new THREE.Group();
  groundGroup.name = 'Ground and District Parcels';
  var waterGroup = new THREE.Group();
  waterGroup.name = 'River and Waterfront';
  var parkGroup = new THREE.Group();
  parkGroup.name = 'Central Park';
  var roadGroup = new THREE.Group();
  roadGroup.name = 'Roads, Bridges and Sidewalks';
  var districtGroup = new THREE.Group();
  districtGroup.name = 'Neighborhoods and Buildings';
  var greenGroup = new THREE.Group();
  greenGroup.name = 'Trees and Landscape';
  var streetGroup = new THREE.Group();
  streetGroup.name = 'Street Furniture and Renewable Energy';
  var movingGroup = new THREE.Group();
  movingGroup.name = 'Vehicles';
  city.add(groundGroup, waterGroup, parkGroup, roadGroup, districtGroup, greenGroup, streetGroup, movingGroup);

  var mat = function (color, roughness, options) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: roughness == null ? 0.85 : roughness }, options || {}));
  };
  var grassMat = mat(0x76ad57);
  var lightGrassMat = mat(0x8cbe67);
  var darkGrassMat = mat(0x5d9548);
  var pavementMat = mat(0xd6cbb0);
  var asphaltMat = mat(0x42494d, 0.95);
  var markingMat = mat(0xf6f0da);
  var waterMat = mat(0x0a79aa, 0.22, { metalness: 0.12, emissive: 0x063c59, emissiveIntensity: 0.2 });
  var bankMat = mat(0xd0bd8e);
  var shallowBankMat = mat(0x75b9bc, 0.45);
  var concreteMat = mat(0xa6a59a);
  var windowMat = mat(0xbdeaf2, 0.25, { metalness: 0.08, emissive: 0x224b5b, emissiveIntensity: 0.18 });
  var roofMat = mat(0xeee4d0);
  var treeTrunkMat = mat(0x775039);
  var fenceMat = mat(0x43483f);
  var districtState = {};
  var facilityIndicators = {};
  var selectable = [];
  var roadVisuals = {};
  var districtVisuals = {};
  var vehicleMotion = [];
  var rand = randomFor(data.assumptions && data.assumptions.seed || 42);
  var dummy = new THREE.Object3D();
  var windowInstances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), windowMat, 6000);
  windowInstances.name = 'Building facade glass';
  windowInstances.count = 0;
  var balconyInstances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), pavementMat, 1200);
  balconyInstances.name = 'Residential balconies';
  balconyInstances.count = 0;
  districtGroup.add(windowInstances, balconyInstances);

  function mesh(geometry, material, parent, name, x, y, z, cast, receive) {
    var object = new THREE.Mesh(geometry, material);
    object.name = name;
    object.position.set(x || 0, y || 0, z || 0);
    object.castShadow = cast !== false;
    object.receiveShadow = receive !== false;
    parent.add(object);
    return object;
  }

  function box(parent, name, x, y, z, width, height, depth, material, rotationY) {
    var object = mesh(new THREE.BoxGeometry(width, height, depth), material, parent, name, x, y, z);
    if (rotationY) object.rotation.y = rotationY;
    return object;
  }

  function horizontalPlane(parent, name, x, z, width, depth, y, material) {
    var object = mesh(new THREE.PlaneGeometry(width, depth), material, parent, name, x, y, z, false, true);
    object.rotation.x = -Math.PI / 2;
    return object;
  }

  function addTree(x, z, scale, color, parent, name) {
    var group = new THREE.Group();
    group.name = name || 'Low-poly tree';
    group.position.set(x, 0, z);
    group.scale.setScalar(scale || 1);
    parent.add(group);
    mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.8, 6), treeTrunkMat, group, 'Tree trunk', 0, 0.9, 0);
    var foliage = mat(color || 0x55a84d);
    var crown = mesh(new THREE.IcosahedronGeometry(1.05, 1), foliage, group, 'Faceted tree crown', 0, 2.25, 0);
    crown.scale.set(1.15, 0.95, 1.05);
    var crownTop = mesh(new THREE.IcosahedronGeometry(0.7, 1), foliage, group, 'Tree crown top', 0.28, 2.9, -0.1);
    crownTop.scale.set(1.05, 0.95, 1.05);
    return group;
  }

  function createRiver() {
    var riverConfig = data.map && data.map.river;
    var riverZ = riverConfig && riverConfig.bandY0 != null && riverConfig.bandY1 != null ?
      (riverConfig.bandY0 + riverConfig.bandY1) / 2 - 50 :
      riverConfig && riverConfig.bandY0 != null ? riverConfig.bandY0 - 50 : -5;
    var curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-58, 0, riverZ + 3),
      new THREE.Vector3(-34, 0, riverZ + 1.4),
      new THREE.Vector3(-8, 0, riverZ - 0.8),
      new THREE.Vector3(18, 0, riverZ + 0.7),
      new THREE.Vector3(42, 0, riverZ + 1.6),
      new THREE.Vector3(60, 0, riverZ + 0.8)
    ]);
    function ribbon(width, y, material, name) {
      var vertices = [], indices = [], points = curve.getPoints(90);
      points.forEach(function (point, index) {
        var tangent = curve.getTangentAt(index / (points.length - 1));
        var normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        vertices.push(point.x + normal.x * width / 2, y, point.z + normal.z * width / 2);
        vertices.push(point.x - normal.x * width / 2, y, point.z - normal.z * width / 2);
        if (index < points.length - 1) {
          var i = index * 2;
          indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
        }
      });
      var geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      var surface = mesh(geometry, material, waterGroup, name, 0, 0, 0, false);
      surface.userData.riverSurface = true;
      return surface;
    }
    ribbon(15.5, -0.09, bankMat, 'Sculpted sandy riverbanks');
    ribbon(12.5, -0.015, shallowBankMat, 'Shallow water at the river edge');
    var water = ribbon(10, 0.055, waterMat, 'River water');
    [[-29, -1.7], [24, 1.6]].forEach(function (position, index) {
      var label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeLabel('RIVER', 'rgba(11, 72, 103, .92)', '#ffffff'),
        transparent: true,
        depthTest: false
      }));
      label.name = 'River name sign ' + (index + 1);
      label.position.set(position[0], 3.2, riverZ + position[1]);
      label.scale.set(6.5, 1.65, 1);
      waterGroup.add(label);
    });
    waterGroup.userData.surface = water;
  }

  function addGroundAndDistricts() {
    horizontalPlane(groundGroup, 'Shared city terrain', 0, 0, 160, 160, -0.65, grassMat);
    box(groundGroup, 'City base', 0, -0.95, 0, 160, 0.6, 160, darkGrassMat);
    data.neighbourhoods.forEach(function (n) {
      var p = worldPoint(n, data.name), material = mat(n.type === 'industrial' ? 0x8eaa76 : 0x9abf72);
      var parcel = horizontalPlane(groundGroup, n.name + ' landscaped district', p.x, p.z, 19, 17, -0.43, material);
      parcel.userData.neighbourhoodId = n.id;
      districtVisuals[n.id] = { root: new THREE.Group(), pad: parcel, label: null, marker: null };
    });
    createRiver();
  }

  function roadSegment(parent, name, x1, z1, x2, z2, width, y, material, roadId, thickness) {
    var dx = x2 - x1, dz = z2 - z1, length = Math.hypot(dx, dz);
    var rotation = Math.atan2(dx, dz);
    var centerX = (x1 + x2) / 2, centerZ = (z1 + z2) / 2;
    var surface = box(parent, name, centerX, y, centerZ, width, thickness == null ? 0.16 : thickness, length, material, rotation);
    if (roadId) surface.userData.roadId = roadId;
    return {
      x: centerX, z: centerZ, angle: rotation, length: length, dx: dx, dz: dz,
      width: width, y: y, start: { x: x1, z: z1 }, end: { x: x2, z: z2 }
    };
  }

  function buildRoad(road) {
    var a = worldPoint(data.neighbourhoods.find(function (n) { return n.id === road.from; }), data.name);
    var b = worldPoint(data.neighbourhoods.find(function (n) { return n.id === road.to; }), data.name);
    var dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    var setback = Math.min(14, length * 0.25);
    a = { x: a.x + dx / length * setback, z: a.z + dz / length * setback };
    b = { x: b.x - dx / length * setback, z: b.z - dz / length * setback };
    var group = new THREE.Group();
    group.name = road.name;
    group.userData.roadId = road.id;
    roadGroup.add(group);
    var bridge = !!road.bridge, roadY = bridge ? 0.62 : 0.08;
    var asphalt = mat(0x454b50, 0.95);
    var traffic = mat(0x35b86b, 0.72, { emissive: 0x10361b, emissiveIntensity: 0.08 });
    var state = { group: group, surface: null, asphalt: asphalt, traffic: traffic, barriers: [], flood: null, details: [] };
    var r = roadSegment(group, road.name + ' road surface', a.x, a.z, b.x, b.z, 4.4, roadY, asphalt, road.id);
    state.surface = r;

    [1, -1].forEach(function (side) {
      var offset = side * 2.75;
      var sx1 = a.x + r.dz / r.length * offset, sz1 = a.z - r.dx / r.length * offset;
      var sx2 = b.x + r.dz / r.length * offset, sz2 = b.z - r.dx / r.length * offset;
      roadSegment(group, road.name + ' raised sidewalk', sx1, sz1, sx2, sz2, 0.75, roadY + 0.12, pavementMat);
    });

    var step = Math.max(4.5, Math.min(7, r.length / 4));
    for (var distance = 2.8; distance < r.length - 1; distance += step) {
      var t = distance / r.length;
      var stripeX = a.x + r.dx * t, stripeZ = a.z + r.dz * t;
      box(group, road.name + ' dashed lane marking', stripeX, roadY + 0.095, stripeZ,
        0.16, 0.025, Math.min(2.2, step * 0.46), markingMat, r.angle);
    }

    [-1, 1].forEach(function (side) {
      var offsetX = r.dz / r.length * side;
      var offsetZ = -r.dx / r.length * side;
      roadSegment(group, road.name + ' painted road edge', a.x + offsetX * 1.82, a.z + offsetZ * 1.82,
        b.x + offsetX * 1.82, b.z + offsetZ * 1.82, 0.18, roadY + 0.1, markingMat, null, 0.035);
      roadSegment(group, road.name + ' traffic load marker', a.x + offsetX * 1.14, a.z + offsetZ * 1.14,
        b.x + offsetX * 1.14, b.z + offsetZ * 1.14, 0.32, roadY + 0.13, traffic, null, 0.045);
    });

    [0.09, 0.91].forEach(function (t) {
      var px = a.x + r.dx * t, pz = a.z + r.dz * t;
      for (var line = -1; line <= 1; line++) {
        var offset = line * 0.9;
        var localX = r.dz / r.length * offset, localZ = -r.dx / r.length * offset;
        box(group, road.name + ' pedestrian crossing', px + localX, roadY + 0.105, pz + localZ,
          0.55, 0.025, 1.25, markingMat, r.angle);
      }
    });

    if (bridge) {
      var support = mat(0x8b8b7b);
      box(group, road.name + ' bridge pier', r.x, roadY / 2, r.z, 0.9, roadY, 1.25, support, r.angle);
      [0.42, -0.42].forEach(function (side) {
        var x = r.x + r.dz / r.length * side, z = r.z - r.dx / r.length * side;
        box(group, road.name + ' bridge parapet', x, roadY + 0.38, z, 0.22, 0.45, r.length * 0.96, concreteMat, r.angle);
      });
    }

    var barrierMaterial = mat(0xe54f35);
    [-1, 1].forEach(function (side) {
      var x = r.x + r.dz / r.length * side * 1.35;
      var z = r.z - r.dx / r.length * side * 1.35;
      var barrier = box(group, road.name + ' closure barrier', x, roadY + 0.62, z, 3.4, 0.75, 0.35, barrierMaterial, r.angle);
      var light = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.13, 0.36), mat(0xffd26a, 0.45, { emissive: 0x663500 }));
      light.name = road.name + ' barrier warning stripe';
      light.position.set(x, roadY + 0.72, z);
      light.rotation.y = r.angle;
      group.add(light);
      state.barriers.push(barrier, light);
      barrier.visible = false;
      light.visible = false;
    });

    var floodMaterial = mat(0x49bde6, 0.25, { transparent: true, opacity: 0.78, emissive: 0x064c7a, emissiveIntensity: 0.2 });
    var flood = box(group, road.name + ' floodwater', r.x, roadY + 0.22, r.z, 5.8, 0.18, r.length + 0.4, floodMaterial, r.angle);
    flood.visible = false;
    flood.userData.roadId = road.id;
    state.flood = flood;
    roadVisuals[road.id] = state;
    var lampCount = Math.max(1, Math.floor(r.length / 19));
    for (var li = 0; li < lampCount; li++) {
      var t = (li + 0.5) / lampCount;
      var lx = a.x + r.dx * t + r.dz / r.length * 3.7;
      var lz = a.z + r.dz * t - r.dx / r.length * 3.7;
      addStreetLamp(lx, lz, road.name + ' streetlight');
    }
  }

  function addStreetLamp(x, z, name) {
    var pole = mesh(new THREE.CylinderGeometry(0.07, 0.12, 3.1, 6), concreteMat, streetGroup, name + ' pole', x, 1.55, z);
    pole.castShadow = true;
    var arm = box(streetGroup, name + ' arm', x + 0.4, 3.02, z, 0.9, 0.1, 0.12, concreteMat);
    var lampMaterial = mat(0xffe6a1, 0.3, { emissive: 0xb07818, emissiveIntensity: 0.35 });
    mesh(new THREE.SphereGeometry(0.18, 8, 6), lampMaterial, streetGroup, name + ' light', x + 0.82, 2.92, z);
    return { pole: pole, arm: arm };
  }

  function addBuildingWindows(group, width, height, depth, floors, columns) {
    var facadeY = 0.7;
    for (var floor = 0; floor < floors; floor++) {
      for (var column = 0; column < columns; column++) {
        var x = -width / 2 + (column + 0.5) * width / columns;
        var y = facadeY + floor * (height - 1) / floors;
        dummy.position.set(group.position.x + x, y + group.position.y, group.position.z + depth / 2 + 0.035);
        dummy.scale.set(Math.min(0.5, width / columns * 0.52), Math.min(0.52, (height - 1) / floors * 0.5), 0.07);
        dummy.updateMatrix();
        windowInstances.setMatrixAt(windowInstances.count++, dummy.matrix);
      }
    }
  }

  function addBuilding(n, index, offsetX, offsetZ, special) {
    var type = n.type || 'mixed';
    var colors = PALETTES[type] || PALETTES.mixed;
    var width = special ? 4.4 : 2.7 + rand() * 1.35;
    var depth = special ? 3.8 : 2.6 + rand() * 1.15;
    var baseHeight = type === 'jobs' ? (n.id === 'cbd' ? 7.5 : 6) : type === 'industrial' ? 4.2 : 3.5;
    var height = special ? 5.5 : baseHeight + rand() * (type === 'jobs' ? 7 : 4.5);
    var origin = worldPoint(n, data.name);
    var x = origin.x + offsetX, z = origin.z + offsetZ;
    var group = new THREE.Group();
    group.name = special ? special.name : n.name + ' building ' + (index + 1);
    group.position.set(x, 0, z);
    group.userData.neighbourhoodId = n.id;
    if (special && special.facilityId) group.userData.facilityId = special.facilityId;
    districtGroup.add(group);
    var wallMat = mat(special && special.type === 'hospital' ? 0xf1eee4 : special && special.type === 'school' ? 0xe5bd73 : colors[Math.floor(rand() * colors.length)]);
    var foundation = box(group, group.name + ' foundation', 0, 0.32, 0, width + 0.5, 0.55, depth + 0.5, concreteMat);
    foundation.userData.neighbourhoodId = n.id;
    var body = box(group, group.name + ' facade', 0, 0.55 + height / 2, 0, width, height, depth, wallMat);
    body.userData.neighbourhoodId = n.id;
    var roof = box(group, group.name + ' rooftop', 0, height + 0.64, 0, width + 0.2, 0.3, depth + 0.2, roofMat);
    roof.userData.neighbourhoodId = n.id;
    var floors = Math.max(2, Math.floor(height / 1.15));
    addBuildingWindows(group, width, height, depth, floors, Math.max(2, Math.floor(width / 0.72)));

    if (type === 'residential' || type === 'mixed') {
      var balconies = Math.max(2, Math.floor(height / 2));
      for (var level = 1; level < balconies; level++) {
        dummy.position.set(x, level * height / balconies, z + depth / 2 + 0.24);
        dummy.scale.set(width * 0.72, 0.12, 0.5);
        dummy.updateMatrix();
        balconyInstances.setMatrixAt(balconyInstances.count++, dummy.matrix);
      }
    }

    var top = mesh(new THREE.BoxGeometry(1, 0.28, 1), wallMat, group, group.name + ' rooftop access', 0, height + 0.92, 0);
    top.scale.set(0.6, 1, 0.58);
    if (special && special.facilityId) {
      var badgeMaterial = mat(0x37a978, 0.4, { emissive: 0x064b2e, emissiveIntensity: 0.22 });
      var badge = mesh(new THREE.BoxGeometry(0.55, 0.55, 0.18), badgeMaterial, group, special.name + ' status beacon', 0, height + 1.4, 0);
      facilityIndicators[special.facilityId] = badgeMaterial;
    }
    var entry = box(group, group.name + ' entrance', 0, 1.15, depth / 2 + 0.09, 0.68, 1.35, 0.15, mat(0x61594c));
    entry.userData.neighbourhoodId = n.id;
    if (special && special.type) addSign(group, special.name, 0, height + 1.1, depth / 2 + 0.18);
    return group;
  }

  function addSign(parent, text, x, y, z) {
    var texture = makeLabel(text.toUpperCase(), 'rgba(245,248,241,.96)', '#204050');
    var material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    var sign = mesh(new THREE.PlaneGeometry(3.1, 0.78), material, parent, text + ' facade sign', x, y, z, false, false);
    sign.userData.interactiveLabel = text;
    return sign;
  }

  function buildDistricts() {
    var facilities = data.services && data.services.facilities || [];
    data.neighbourhoods.forEach(function (n, index) {
      var origin = worldPoint(n, data.name), count = n.type === 'jobs' ? 12 : n.type === 'mixed' ? 10 : 8;
      var labelTexture = makeLabel(n.name);
      var labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false });
      var label = new THREE.Sprite(labelMaterial);
      label.name = n.name + ' district name';
      label.position.set(origin.x, 13, origin.z - 1);
      label.scale.set(n.name.length > 12 ? 13 : 10, 2.55, 1);
      label.renderOrder = 20;
      label.userData.neighbourhoodId = n.id;
      districtGroup.add(label);
      districtVisuals[n.id].label = label;

      for (var i = 0; i < count; i++) {
        var angle = i * 2.399963229728653 + (index % 2) * 0.3;
        var radius = 5.1 + (i % 3) * 1.8 + rand() * 0.9;
        var ox = Math.cos(angle) * radius, oz = Math.sin(angle) * radius;
        addBuilding(n, i, ox, oz);
      }
      facilities.filter(function (facility) { return facility.at === n.id; }).forEach(function (facility, i) {
        var xOffset = facility.type === 'hospital' ? 4.8 : -4.8;
        var zOffset = i % 2 === 0 ? -4.8 : 4.8;
        addBuilding(n, count + i, xOffset, zOffset, {
          name: facility.name,
          type: facility.type,
          facilityId: facility.id
        });
      });

      var colors = [0x66af4f, 0x78bd55, 0xe88336];
      for (var tree = 0; tree < 7; tree++) {
        var treeAngle = (tree + 0.4) * Math.PI * 2 / 7;
        addTree(origin.x + Math.cos(treeAngle) * (9 + rand() * 1.2),
          origin.z + Math.sin(treeAngle) * (8 + rand() * 1.3), 0.72 + rand() * 0.3,
          colors[(tree + index) % colors.length], greenGroup, n.name + ' tree ' + (tree + 1));
      }
    });
    windowInstances.instanceMatrix.needsUpdate = true;
    balconyInstances.instanceMatrix.needsUpdate = true;
  }

  function addPark() {
    var x = data.name === 'Lumen Bay' ? -2 : 1;
    var z = data.name === 'Lumen Bay' ? 12 : 17;
    var lawn = horizontalPlane(parkGroup, 'Public park lawn', x, z, 18, 14, -0.22, lightGrassMat);
    lawn.userData.interactiveLabel = 'Central Park';
    var parkLabel = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeLabel('CENTRAL PARK', 'rgba(38, 91, 48, .92)', '#ffffff'),
      transparent: true,
      depthTest: false
    }));
    parkLabel.name = 'Central Park name sign';
    parkLabel.position.set(x, 4.5, z + 6.2);
    parkLabel.scale.set(10, 2, 1);
    parkGroup.add(parkLabel);
    var pathMat = mat(0xe8ddbf);
    box(parkGroup, 'Park north path', x, -0.06, z - 4.35, 16, 0.13, 0.65, pathMat);
    box(parkGroup, 'Park south path', x, -0.06, z + 4.35, 16, 0.13, 0.65, pathMat);
    box(parkGroup, 'Park west path', x - 7.7, -0.06, z, 0.65, 0.13, 8.5, pathMat);
    box(parkGroup, 'Park east path', x + 7.7, -0.06, z, 0.65, 0.13, 8.5, pathMat);
    var water = mat(0x39c8d1, 0.18, { metalness: 0.12 });
    mesh(new THREE.CylinderGeometry(2.15, 2.25, 0.3, 12), mat(0xddd4bd), parkGroup, 'Fountain stone basin', x, 0.12, z);
    mesh(new THREE.CylinderGeometry(1.75, 1.8, 0.1, 12), water, parkGroup, 'Fountain lower pool', x, 0.31, z);
    mesh(new THREE.CylinderGeometry(1.12, 1.3, 0.22, 10), mat(0xe5dac2), parkGroup, 'Fountain middle tier', x, 0.5, z);
    mesh(new THREE.CylinderGeometry(0.88, 0.9, 0.08, 10), water, parkGroup, 'Fountain middle water', x, 0.66, z);
    mesh(new THREE.CylinderGeometry(0.25, 0.42, 0.75, 8), mat(0xd9cdae), parkGroup, 'Fountain pedestal', x, 0.92, z);
    mesh(new THREE.SphereGeometry(0.28, 10, 8), water, parkGroup, 'Fountain crown', x, 1.35, z);

    for (var side = -1; side <= 1; side += 2) {
      for (var row = 0; row < 2; row++) {
        var benchX = x + side * (5.4 + row * 1.7), benchZ = z + (row === 0 ? -2.6 : 2.6);
        box(parkGroup, 'Park bench seat', benchX, 0.58, benchZ, 1.7, 0.16, 0.48, mat(0x9b6946));
        box(parkGroup, 'Park bench back', benchX, 0.95, benchZ - 0.15, 1.7, 0.58, 0.13, mat(0x9b6946));
      }
    }

    var postMaterial = mat(0x4e5243);
    for (var edge = 0; edge < 4; edge++) {
      for (var post = 0; post <= 9; post++) {
        var t = post / 9;
        var px = edge < 2 ? x - 8.5 + t * 17 : x + (edge === 2 ? -8.5 : 8.5);
        var pz = edge < 2 ? z + (edge === 0 ? -6.5 : 6.5) : z - 6.5 + t * 13;
        mesh(new THREE.BoxGeometry(0.13, 0.8, 0.13), postMaterial, parkGroup, 'Park fence post', px, 0.4, pz);
      }
      var horizontal = edge < 2;
      box(parkGroup, 'Park fence rail', x + (horizontal ? 0 : edge === 2 ? -8.5 : 8.5), 0.68,
        z + (horizontal ? edge === 0 ? -6.5 : 6.5 : 0),
        horizontal ? 17 : 0.12, 0.1, horizontal ? 0.12 : 13, postMaterial);
    }

    var parkTrees = [0x64ab45, 0x78b84e, 0xe77b35, 0xed9b36, 0x4d9e50];
    [[-6, -4], [-5, 4], [6, -4], [6, 4], [-2, -5.3], [3, 5.3], [8, 0], [-8, 0]].forEach(function (offset, i) {
      addTree(x + offset[0], z + offset[1], 0.95 + rand() * 0.2, parkTrees[i % parkTrees.length], parkGroup, 'Central Park tree ' + (i + 1));
    });
  }

  function addChurch() {
    var oldTown = data.neighbourhoods.find(function (n) { return n.id === 'oldtown'; });
    if (!oldTown) return;
    var p = worldPoint(oldTown, data.name);
    var church = new THREE.Group();
    church.name = 'Old Town Church';
    church.position.set(p.x - 4.3, 0, p.z + 4.3);
    church.userData.neighbourhoodId = oldTown.id;
    districtGroup.add(church);
    box(church, 'Church nave', 0, 2.15, 0, 4.8, 4.2, 7.4, mat(0xf1e4c9));
    mesh(new THREE.CylinderGeometry(0.1, 2.55, 3.3, 8), mat(0xd6ad59), church, 'Church bell tower', -1.15, 5.6, 0);
    mesh(new THREE.ConeGeometry(0.85, 2.2, 8), mat(0x71614e), church, 'Church spire', -1.15, 8.25, 0);
    mesh(new THREE.CylinderGeometry(1.2, 1.45, 1.25, 10), mat(0xf1e4c9), church, 'Church dome drum', 1.15, 4.7, 0);
    mesh(new THREE.SphereGeometry(1.28, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd8b45f), church, 'Church dome', 1.15, 5.35, 0);
    var door = box(church, 'Church entrance', 0, 1.1, 3.78, 1.05, 2.2, 0.16, mat(0x594333));
    door.userData.neighbourhoodId = oldTown.id;
  }

  function addWindTurbines() {
    var turbinePositions = [[-42, -57], [-24, -61], [-4, -59], [17, -62], [38, -57]];
    turbinePositions.forEach(function (position, index) {
      var tower = new THREE.Group();
      tower.name = 'Wind turbine ' + (index + 1);
      tower.position.set(position[0], 0, position[1]);
      streetGroup.add(tower);
      var white = mat(0xf3f4e9, 0.55, { metalness: 0.08 });
      mesh(new THREE.CylinderGeometry(0.32, 0.62, 16, 7), white, tower, 'Turbine mast', 0, 8, 0);
      mesh(new THREE.SphereGeometry(0.85, 8, 6), mat(0xe2e3d7), tower, 'Turbine nacelle', 0, 16.3, 0);
      var rotor = new THREE.Group();
      rotor.name = 'Three blade rotor';
      rotor.position.set(0, 16.2, 0.2);
      tower.add(rotor);
      mesh(new THREE.ConeGeometry(0.24, 7.6, 5), white, rotor, 'Turbine blade', 0, 3.85, 0).rotation.z = Math.PI;
      mesh(new THREE.ConeGeometry(0.24, 7.6, 5), white, rotor, 'Turbine blade', 3.33, -1.92, 0).rotation.z = Math.PI / 3;
      mesh(new THREE.ConeGeometry(0.24, 7.6, 5), white, rotor, 'Turbine blade', -3.33, -1.92, 0).rotation.z = -Math.PI / 3;
      tower.userData.rotor = rotor;
    });
  }

  function addVehicles() {
    var carColors = [0xe85042, 0xf0b83e, 0x367db4, 0x43a67a, 0xe9e5d9, 0x9c55b6];
    data.roads.forEach(function (road, index) {
      var r = roadVisuals[road.id].surface;
      var vehicle = new THREE.Group();
      vehicle.name = 'City car ' + (index + 1);
      var color = mat(carColors[index % carColors.length], 0.42, { metalness: 0.1 });
      box(vehicle, 'Car body', 0, 0.45, 0, 1.2, 0.52, 2.05, color);
      box(vehicle, 'Car cabin', 0, 0.86, -0.05, 0.85, 0.42, 1.05, mat(0xa9d9e3, 0.25, { metalness: 0.1 }));
      var wheelMat = mat(0x25292b, 0.92);
      [-1, 1].forEach(function (side) {
        [-0.65, 0.68].forEach(function (axle) {
          var wheel = mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.13, 8), wheelMat, vehicle, 'Car wheel', side * 0.62, 0.24, axle);
          wheel.rotation.z = Math.PI / 2;
        });
      });
      movingGroup.add(vehicle);
      var carSpeed = 0.025 + rand() * 0.018;
      vehicleMotion.push({ mesh: vehicle, road: road, roadId: road.id, direction: index % 2 ? -1 : 1,
        phase: rand(), speed: carSpeed, baseSpeed: carSpeed });
    });

    (data.busLines || []).forEach(function (line, index) {
      var bus = new THREE.Group();
      bus.name = line.name + ' bus';
      box(bus, 'Bus body', 0, 0.88, 0, 1.45, 1.42, 3.6, mat([0xe5a839, 0x397daa, 0x4f9e69][index % 3]));
      box(bus, 'Bus windows', 0, 1.3, 0, 1.48, 0.48, 2.75, mat(0xaadce8, 0.25, { metalness: 0.1 }));
      movingGroup.add(bus);
      var roads = [];
      for (var stop = 0; stop < line.stops.length - 1; stop++) {
        var a = line.stops[stop], b = line.stops[stop + 1];
        var road = data.roads.find(function (item) { return (item.from === a && item.to === b) || (item.to === a && item.from === b); });
        if (road) roads.push({ road: road, forward: road.from === a });
      }
      if (roads.length) vehicleMotion.push({ mesh: bus, route: roads, lineId: line.id, phase: rand(), speed: 0.018, baseSpeed: 0.018 });
    });
  }

  function buildRoads() {
    data.roads.forEach(buildRoad);
  }

  function buildScene() {
    addGroundAndDistricts();
    buildRoads();
    addPark();
    buildDistricts();
    addChurch();
    addWindTurbines();
    addVehicles();
  }

  function roadColor(vc) {
    if (vc > 1.5) return new THREE.Color(0xd83931);
    var t = Math.max(0, Math.min(1, (vc - 0.3) / 1.0));
    return new THREE.Color().setHSL(0.36 * (1 - t), 0.68, 0.42);
  }

  function updateRoads(result) {
    result.edges.forEach(function (edge) {
      var visual = roadVisuals[edge.id];
      if (!visual) return;
      visual.asphalt.color.setHex(edge.closed ? (edge.flooded ? 0x527080 : 0x626768) : 0x454b50);
      visual.asphalt.emissive.setHex(edge.closed ? 0x15202a : 0x000000);
      visual.traffic.color.copy(edge.closed ? new THREE.Color(0x92999b) : roadColor(edge.vc));
      visual.barriers.forEach(function (barrier) { barrier.visible = edge.closed && !edge.flooded; });
      visual.flood.visible = !!edge.flooded;
      visual.flood.material.opacity = edge.flooded ? 0.84 : 0;
      visual.group.userData.roadName = edge.name;
      visual.group.userData.closed = edge.closed;
    });
  }

  function updateDistricts(result, selectedId, closedServices) {
    var closed = closedServices || [];
    result.byNbhd.forEach(function (area) {
      var visual = districtVisuals[area.id];
      if (!visual) return;
      var load = Math.max(0, Math.min(1, (area.commute - 12) / 38));
      var color = area.shares.none > 0.02 ? 0xd74739 : new THREE.Color().setHSL(0.34 * (1 - load), 0.7, 0.48);
      visual.pad.material.color.set(color);
      visual.pad.material.emissive.setHex(area.id === selectedId ? 0x193618 : 0x000000);
      visual.pad.material.emissiveIntensity = area.id === selectedId ? 0.45 : 0;
      if (visual.label) {
        visual.label.position.y = 13 + Math.min(3, area.commute / 18);
        visual.label.userData.commute = Math.round(area.commute);
      }
      visual.root.userData.selected = area.id === selectedId;
    });
    Object.keys(facilityIndicators).forEach(function (id) {
      var indicator = facilityIndicators[id];
      var closedNow = closed.indexOf(id) >= 0;
      indicator.color.setHex(closedNow ? 0xd63e36 : 0x37a978);
      indicator.emissive.setHex(closedNow ? 0x65130e : 0x064b2e);
    });
  }

  function updateWeather(weather) {
    var flood = !!weather.flood, heatwave = !!weather.heatwave;
    var water = waterGroup.userData.surface;
    if (water) {
      water.position.y = flood ? 0.3 : 0;
      water.material.color.setHex(flood ? 0x278ed0 : 0x30b9cc);
      water.material.opacity = flood ? 0.97 : 0.9;
    }
    groundGroup.children[0].material.color.setHex(heatwave ? 0xb1a46b : 0x76ad57);
    sun.color.setHex(heatwave ? 0xffc36c : 0xfff0d7);
    sun.intensity = heatwave ? 3.65 : 3.2;
    scene.background.setHex(heatwave ? 0xf4b977 : 0x9bd5f1);
    scene.fog.color.copy(scene.background);
  }

  function update(result, weather, selectedId, closedServices) {
    updateRoads(result);
    updateDistricts(result, selectedId, closedServices);
    updateWeather(weather || {});
    vehicleMotion.forEach(function (motion) {
      if (motion.lineId) {
        var line = result.lines.find(function (item) { return item.id === motion.lineId; });
        motion.mesh.visible = !!(line && line.active);
        motion.speed = motion.baseSpeed * (line && line.active ? line.mult : 0);
      } else {
        var edge = result.edges.find(function (item) { return item.id === motion.roadId; });
        motion.mesh.visible = !!(edge && !edge.closed);
        motion.speed = motion.baseSpeed / Math.max(1, edge ? 0.8 + edge.vc : 1);
      }
    });
  }

  function pointerToNdc(event) {
    var rect = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  var raycaster = new THREE.Raycaster();
  var pointerDown = null;
  renderer.domElement.addEventListener('pointerdown', function (event) {
    pointerDown = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener('pointerup', function (event) {
    if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5) {
      pointerDown = null;
      return;
    }
    raycaster.setFromCamera(pointerToNdc(event), camera);
    var intersections = raycaster.intersectObjects(city.children, true);
    for (var i = 0; i < intersections.length; i++) {
      var target = intersections[i].object;
      while (target && target !== city) {
        if (target.userData.roadId) {
          if (handlers.onRoadClick) handlers.onRoadClick(target.userData.roadId);
          return;
        }
        if (target.userData.neighbourhoodId) {
          if (handlers.onNeighbourhoodClick) handlers.onNeighbourhoodClick(target.userData.neighbourhoodId);
          return;
        }
        target = target.parent;
      }
    }
    pointerDown = null;
  });

  function animate() {
    animationFrame = requestAnimationFrame(animate);
    var time = performance.now() * 0.001;
    vehicleMotion.forEach(function (motion) {
      var progress = (time * motion.speed + motion.phase) % 1;
      var road, forward = motion.direction > 0;
      if (motion.route) {
        var step = Math.floor(progress * motion.route.length);
        var part = progress * motion.route.length - step;
        var routeSegment = motion.route[step % motion.route.length];
        road = routeSegment.road;
        forward = routeSegment.forward;
        progress = part;
      } else {
        road = motion.road;
      }
      var visual = roadVisuals[road.id];
      var t = forward ? progress : 1 - progress;
      var path = visual.surface;
      var x = path.start.x + path.dx * t;
      var z = path.start.z + path.dz * t;
      var y = visual.surface.y + 0.1;
      var side = motion.route ? 0 : motion.direction > 0 ? -0.72 : 0.72;
      x += visual.surface.dz / visual.surface.length * side;
      z -= visual.surface.dx / visual.surface.length * side;
      motion.mesh.position.set(x, y, z);
      motion.mesh.rotation.y = path.angle + (forward ? 0 : Math.PI);
      motion.mesh.visible = true;
    });
    streetGroup.children.forEach(function (object) {
      var rotor = object.userData.rotor;
      if (rotor) rotor.rotation.z += 0.012;
    });
    controls.update();
    renderer.render(scene, camera);
  }

  var animationFrame = 0;
  var resizeObserver = new ResizeObserver(function () {
    var width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(renderPixelRatio());
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(host);
  buildScene();
  animate();

  return {
    update: update,
    exportGlb: function () {
      var exporter = new GLTFExporter();
      return exporter.parseAsync(scene, { binary: true, onlyVisible: true }).then(function (result) {
        return new Blob([result], { type: 'model/gltf-binary' });
      });
    },
    dispose: function () {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    }
  };
}
