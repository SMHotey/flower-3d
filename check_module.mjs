
const loaderEl = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const nowebgl = document.getElementById('nowebgl');

function fail(reason) {
  console.warn(reason);
  loaderEl.classList.add('done');
  nowebgl.classList.add('on');
  document.getElementById('photo').classList.add('on');
}

let THREE, GLTFLoader, OrbitControls, DRACOLoader;
try {
  THREE = await import('three');
  ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'));
  ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
  ({ DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js'));
} catch (err) {
  fail('Не загрузились модули three: ' + err);
  throw err;
}

const canvas = document.getElementById('scene');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  fail('Нет WebGL: ' + err);
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.01, 40);

// --- свет: тёплый ключевой + холодный заполняющий, как в рендере ---
scene.add(new THREE.HemisphereLight(0xdfe8cf, 0x1a1f16, 0.85));
const key = new THREE.DirectionalLight(0xffe0b8, 2.4);
key.position.set(-1.4, 2.2, 1.8);
scene.add(key);
const fill = new THREE.DirectionalLight(0xbcd4ff, 0.8);
fill.position.set(1.8, 1.0, -1.2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xfff2d0, 1.1);
rim.position.set(0.4, 1.4, -2.2);
scene.add(rim);

// --- контактная тень-«пятно» под горшком (без карт теней — дешево для телефона) ---
function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 4, 128, 128, 124);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.22)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(0.62, 0.62),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.001;
scene.add(shadow);

// --- управление ---
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.9;
controls.zoomSpeed = 0.8;
controls.enablePan = false;
controls.minDistance = 0.35;
controls.maxDistance = 2.2;

const HOME = { theta: 0.35, phi: 1.28, dist: 1.02, target: 0.24 };
function applyHome() {
  controls.target.set(0, HOME.target, 0);
  camera.position.set(
    Math.sin(HOME.theta) * Math.sin(HOME.phi) * HOME.dist,
    Math.cos(HOME.phi) * HOME.dist + HOME.target,
    Math.cos(HOME.theta) * Math.sin(HOME.phi) * HOME.dist
  );
  controls.update();
}
applyHome();

let spin = true;
let resumeTimer = null;
const btnSpin = document.getElementById('btn-spin');
btnSpin.addEventListener('click', () => {
  spin = !spin;
  btnSpin.setAttribute('aria-pressed', String(spin));
});
function pauseSpin() {
  if (!spin) return;
  controls.autoRotate = false;
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => { if (spin) controls.autoRotate = true; }, 3500);
}
controls.addEventListener('start', pauseSpin);
controls.autoRotate = true;
controls.autoRotateSpeed = 0.9;

document.getElementById('btn-reset').addEventListener('click', applyHome);

const photo = document.getElementById('photo');
document.getElementById('btn-photo').addEventListener('click', () => photo.classList.add('on'));
document.getElementById('btn-close').addEventListener('click', () => photo.classList.remove('on'));

// --- загрузка модели ---
const draco = new DRACOLoader();
draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');

const gltfLoader = new GLTFLoader({ crossOrigin: 'anonymous' }).setDRACOLoader(draco);
let model = null;

gltfLoader.load(
  'plant.glb',
  (gltf) => {
    model = gltf.scene;
    // модель в метрах, стоит на нуле — только мягко масштабируем под кадр
    model.traverse((o) => {
      if (o.isMesh) {
        o.material.envMapIntensity = 0.6;
        if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
      }
    });
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    window.__flower = {
      loaded: true,
      height: +size.y.toFixed(3),
      meshes: (() => { let n = 0; model.traverse(o => { if (o.isMesh) n++; }); return n; })(),
      tris: renderer.info.render.triangles
    };
    loaderEl.classList.add('done');
  },
  (e) => {
    if (e.total) {
      const pct = Math.round(e.loaded / e.total * 100);
      loaderText.textContent = 'Загрузка модели · ' + pct + '%';
    }
  },
  (err) => fail('Модель не загрузилась: ' + err)
);

// --- цикл ---
function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}
window.addEventListener('resize', resize);
resize();

let visible = true;
document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  if (!visible) return;
  controls.autoRotate = spin;
  controls.update();
  renderer.render(scene, camera);
  window.__frames = (window.__frames || 0) + 1;
}
tick();

// отладочный доступ для автотестов
window.__viewer = () => ({
  camDist: +camera.position.distanceTo(controls.target).toFixed(3),
  autoRotate: controls.autoRotate,
  meshes: window.__flower ? window.__flower.meshes : 0,
  frames: window.__frames || 0
});
