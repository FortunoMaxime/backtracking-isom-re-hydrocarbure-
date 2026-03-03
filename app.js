const form = document.getElementById('formula-form');
const input = document.getElementById('formula');
const statusEl = document.getElementById('status');
const viewerSection = document.getElementById('viewer-section');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const isomerLabel = document.getElementById('isomer-label');
const adjacencyEl = document.getElementById('adjacency');
const canvasWrapper = document.getElementById('canvas-wrapper');

let uniqueIsomers = [];
let currentIndex = 0;
let sceneState = null;
let threeBundle = null;

async function loadThreeBundle() {
  if (threeBundle) return threeBundle;

  try {
    const THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
    const controlsModule = await import(
      'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js'
    );
    threeBundle = { THREE, OrbitControls: controlsModule.OrbitControls };
    return threeBundle;
  } catch (error) {
    throw new Error(
      "Impossible de charger Three.js. Vérifiez votre connexion internet puis rechargez la page."
    );
  }
}

function parseFormula(formula) {
  const match = formula.trim().toUpperCase().match(/^C(\d+)H(\d+)$/);
  if (!match) {
    throw new Error('Format invalide. Utilisez CnHm (ex: C5H12).');
  }

  const carbons = Number(match[1]);
  const hydrogens = Number(match[2]);

  if (carbons < 1) {
    throw new Error('Le nombre de carbones doit être supérieur à 0.');
  }

  const expectedHydrogens = 2 * carbons + 2;
  if (hydrogens !== expectedHydrogens) {
    throw new Error(
      `Cette version supporte les alcanes acycliques: pour C${carbons}, H doit valoir ${expectedHydrogens}.`
    );
  }

  if (carbons > 9) {
    throw new Error('Limite fixée à 9 carbones pour garder une génération interactive.');
  }

  return { carbons };
}

function allEdgePairs(n) {
  const edges = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      edges.push([i, j]);
    }
  }
  return edges;
}

function generateIsomerTrees(n) {
  const pairs = allEdgePairs(n);
  const parent = Array.from({ length: n }, (_, i) => i);
  const size = Array.from({ length: n }, () => 1);
  const degree = Array.from({ length: n }, () => 0);
  const chosen = [];
  const uniqueByCanonical = new Map();

  const find = (x) => {
    while (parent[x] !== x) x = parent[x];
    return x;
  };

  const union = (a, b) => {
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) return null;
    if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
    parent[rb] = ra;
    size[ra] += size[rb];
    return [ra, rb, size[rb]];
  };

  const rollbackUnion = (entry) => {
    if (!entry) return;
    const [ra, rb, rbSize] = entry;
    parent[rb] = rb;
    size[ra] -= rbSize;
  };

  const backtrack = (idx, edgesChosen) => {
    if (edgesChosen === n - 1) {
      const tree = chosen.slice();
      const canonical = canonicalTreeCode(n, tree);
      if (!uniqueByCanonical.has(canonical)) {
        uniqueByCanonical.set(canonical, tree);
      }
      return;
    }

    if (idx >= pairs.length) return;

    const remainingPairs = pairs.length - idx;
    const missingEdges = (n - 1) - edgesChosen;
    if (remainingPairs < missingEdges) return;

    const [u, v] = pairs[idx];

    if (degree[u] < 4 && degree[v] < 4) {
      const merged = union(u, v);
      if (merged) {
        degree[u] += 1;
        degree[v] += 1;
        chosen.push([u, v]);

        backtrack(idx + 1, edgesChosen + 1);

        chosen.pop();
        degree[u] -= 1;
        degree[v] -= 1;
        rollbackUnion(merged);
      }
    }

    backtrack(idx + 1, edgesChosen);
  };

  backtrack(0, 0);
  return Array.from(uniqueByCanonical.values());
}

function canonicalTreeCode(n, edges) {
  const adjacency = buildAdjacency(n, edges);
  const centers = treeCenters(adjacency);
  const rootedCodes = centers.map((c) => rootedCode(adjacency, c, -1));
  rootedCodes.sort();
  return rootedCodes[0];
}

function treeCenters(adjacency) {
  const n = adjacency.length;
  const degree = adjacency.map((nb) => nb.length);
  const leaves = [];

  for (let i = 0; i < n; i += 1) {
    if (degree[i] <= 1) leaves.push(i);
  }

  let removed = leaves.length;
  let frontier = leaves;

  while (removed < n) {
    const next = [];
    for (const leaf of frontier) {
      for (const nb of adjacency[leaf]) {
        degree[nb] -= 1;
        if (degree[nb] === 1) next.push(nb);
      }
    }
    removed += next.length;
    if (removed >= n) return next;
    frontier = next;
  }

  return frontier;
}

function rootedCode(adjacency, node, parent) {
  const childCodes = [];
  for (const nb of adjacency[node]) {
    if (nb === parent) continue;
    childCodes.push(rootedCode(adjacency, nb, node));
  }
  childCodes.sort();
  return `(${childCodes.join('')})`;
}

function buildAdjacency(n, edges) {
  const adjacency = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return adjacency;
}

function clearRenderer() {
  if (!sceneState) return;
  sceneState.controls.dispose();
  sceneState.renderer.dispose();
  canvasWrapper.innerHTML = '';
  sceneState = null;
}

function make3DLayout(n, edges, THREE) {
  const adjacency = buildAdjacency(n, edges);
  const level = Array.from({ length: n }, () => -1);
  const queue = [0];
  level[0] = 0;

  for (let i = 0; i < queue.length; i += 1) {
    const node = queue[i];
    for (const nb of adjacency[node]) {
      if (level[nb] === -1) {
        level[nb] = level[node] + 1;
        queue.push(nb);
      }
    }
  }

  const groups = new Map();
  for (let i = 0; i < n; i += 1) {
    if (!groups.has(level[i])) groups.set(level[i], []);
    groups.get(level[i]).push(i);
  }

  const positions = Array.from({ length: n }, () => new THREE.Vector3());
  for (const [depth, nodes] of groups.entries()) {
    const radius = 1 + depth * 1.2;
    nodes.forEach((node, idx) => {
      const angle = (idx / Math.max(1, nodes.length)) * Math.PI * 2;
      const y = (depth - groups.size / 2) * 0.9;
      const z = Math.sin(angle * 1.7) * 0.6;
      positions[node].set(Math.cos(angle) * radius, y, z);
    });
  }

  return positions;
}

async function renderIsomer(isomer, index, total) {
  clearRenderer();

  const { THREE, OrbitControls } = await loadThreeBundle();

  const width = canvasWrapper.clientWidth;
  const height = canvasWrapper.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 1000);
  camera.position.set(0, 0, 14);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  canvasWrapper.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const directional = new THREE.DirectionalLight(0xffffff, 0.9);
  directional.position.set(4, 8, 6);
  scene.add(directional);

  const points = make3DLayout(isomer.n, isomer.edges, THREE);
  const carbonMaterial = new THREE.MeshStandardMaterial({ color: '#2f81f7' });
  const carbonGeometry = new THREE.SphereGeometry(0.35, 24, 24);
  const bondMaterial = new THREE.MeshStandardMaterial({ color: '#8b949e' });

  for (const [a, b] of isomer.edges) {
    const start = points[a];
    const end = points[b];
    const dir = new THREE.Vector3().subVectors(end, start);
    const length = dir.length();
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    const bondGeo = new THREE.CylinderGeometry(0.1, 0.1, length, 12);
    const bond = new THREE.Mesh(bondGeo, bondMaterial);
    bond.position.copy(mid);
    bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    scene.add(bond);
  }

  points.forEach((pos) => {
    const atom = new THREE.Mesh(carbonGeometry, carbonMaterial);
    atom.position.copy(pos);
    scene.add(atom);
  });

  scene.add(new THREE.AxesHelper(3));

  const animate = () => {
    if (!sceneState || sceneState.renderer !== renderer) return;
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };

  sceneState = { camera, renderer, controls };
  animate();

  isomerLabel.textContent = `Isomère ${index + 1} / ${total}`;
}

function renderAdjacency(isomer) {
  adjacencyEl.textContent = `Adjacence (carbones indexés de 1 à ${isomer.n})\n${isomer.edges
    .map(([a, b]) => `${a + 1} - ${b + 1}`)
    .join('\n')}`;
}

async function showCurrent() {
  if (!uniqueIsomers.length) return;
  const isomer = uniqueIsomers[currentIndex];
  renderAdjacency(isomer);

  try {
    await renderIsomer(isomer, currentIndex, uniqueIsomers.length);
  } catch (error) {
    clearRenderer();
    isomerLabel.textContent = `Isomère ${currentIndex + 1} / ${uniqueIsomers.length}`;
    statusEl.textContent = `${uniqueIsomers.length} isomère(s) trouvé(s), mais le rendu 3D a échoué: ${error.message}`;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusEl.textContent = '';

  try {
    const { carbons } = parseFormula(input.value);
    statusEl.textContent = 'Génération des isomères en cours...';

    const trees = generateIsomerTrees(carbons);
    uniqueIsomers = trees.map((edges) => ({ n: carbons, edges }));
    currentIndex = 0;

    if (!uniqueIsomers.length) {
      viewerSection.classList.add('hidden');
      statusEl.textContent = 'Aucun isomère trouvé.';
      return;
    }

    viewerSection.classList.remove('hidden');
    statusEl.textContent = `${uniqueIsomers.length} isomère(s) unique(s) trouvé(s) pour C${carbons}H${2 * carbons + 2}.`;
    await showCurrent();
  } catch (error) {
    viewerSection.classList.add('hidden');
    clearRenderer();
    statusEl.textContent = error.message;
  }
});

prevBtn.addEventListener('click', async () => {
  if (!uniqueIsomers.length) return;
  currentIndex = (currentIndex - 1 + uniqueIsomers.length) % uniqueIsomers.length;
  await showCurrent();
});

nextBtn.addEventListener('click', async () => {
  if (!uniqueIsomers.length) return;
  currentIndex = (currentIndex + 1) % uniqueIsomers.length;
  await showCurrent();
});

window.addEventListener('resize', () => {
  if (!sceneState) return;
  const width = canvasWrapper.clientWidth;
  const height = canvasWrapper.clientHeight;
  sceneState.camera.aspect = width / height;
  sceneState.camera.updateProjectionMatrix();
  sceneState.renderer.setSize(width, height);
});
