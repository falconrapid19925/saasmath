'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export interface WorldPlayer {
  id: string;
  name: string;
  avatar: number | string;
  lives: number;
  score: number;
  connected: boolean;
  x: number;
  z: number;
}

export interface WorldProps {
  players: WorldPlayer[];
  youId?: string;
  actorId?: string | null;
  phase: string;
  onMove?: (x: number, z: number) => void;
  movement?: { x: number; z: number };
  muted?: boolean;
  controlsEnabled?: boolean;
}

interface Figure {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  name: string;
  avatar: number | string;
  label?: THREE.Sprite;
  lastX: number;
  lastZ: number;
  lastSent: number;
  offset: number;
  wasMoving: boolean;
  ownedGeometries: THREE.BufferGeometry[];
  ownedMaterials: THREE.Material[];
}

const COLORS = {
  sky: '#f2efe6',
  grass: '#6ac6a3',
  grassLight: '#90d5b4',
  edge: '#3a977b',
  cream: '#fff1ce',
  ink: '#263d42',
  lilac: '#a79ce2',
  lilacDark: '#8174bc',
  pink: '#f4a4a4',
  coral: '#ee8d79',
  gold: '#f3c65d',
  wood: '#e5bc8c',
};

export default function World(props: WorldProps) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const [unavailable, setUnavailable] = useState(false);
  latest.current = props;

  useEffect(() => {
    const host = container.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setUnavailable(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.23;
    renderer.domElement.setAttribute('aria-label', 'Arena taman Math Bee tiga dimensi');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.sky);
    scene.fog = new THREE.Fog(COLORS.sky, 45, 82);
    const camera = new THREE.OrthographicCamera(-16, 16, 12, -12, 0.1, 100);
    camera.position.set(19, 23, 27);
    camera.lookAt(0, 0.3, -1);

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const materialCache = new Map<string, THREE.MeshStandardMaterial>();
    const figures = new Map<string, Figure>();
    const keys = new Set<string>();
    const plants: Array<{ mesh: THREE.Object3D; start: number; phase: number }> = [];
    let frame = 0;
    let disposed = false;
    let previousTime = 0;
    let renderFrames = 0;
    let fpsWindowStart = 0;
    let fpsWindowFrames = 0;
    let measuredFps = 0;

    const gl = renderer.getContext();
    const debugRenderer = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuRenderer = debugRenderer ? String(gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));

    const geometry = <T extends THREE.BufferGeometry,>(value: T): T => {
      geometries.add(value);
      return value;
    };
    const material = (color: THREE.ColorRepresentation, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      const key = `${color}:${JSON.stringify(extra)}`;
      let value = materialCache.get(key);
      if (!value) {
        value = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...extra });
        materials.add(value);
        materialCache.set(key, value);
      }
      return value;
    };
    const boxGeo = geometry(new THREE.BoxGeometry(1, 1, 1));
    const sphereGeo = geometry(new THREE.IcosahedronGeometry(1, 1));
    const roundedShape = (width: number, height: number, radius: number) => {
      const x = -width / 2;
      const y = -height / 2;
      const shape = new THREE.Shape();
      shape.moveTo(x + radius, y);
      shape.lineTo(x + width - radius, y);
      shape.quadraticCurveTo(x + width, y, x + width, y + radius);
      shape.lineTo(x + width, y + height - radius);
      shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      shape.lineTo(x + radius, y + height);
      shape.quadraticCurveTo(x, y + height, x, y + height - radius);
      shape.lineTo(x, y + radius);
      shape.quadraticCurveTo(x, y, x + radius, y);
      return shape;
    };
    const roundedGeo = (width: number, height: number, depth: number, radius = 0.12) => {
      const g = geometry(new THREE.ExtrudeGeometry(roundedShape(width, height, radius), {
        depth,
        bevelEnabled: true,
        bevelThickness: Math.min(0.06, radius / 2),
        bevelSize: Math.min(0.06, radius / 2),
        bevelSegments: 2,
        curveSegments: 5,
      }));
      g.translate(0, 0, -depth / 2);
      return g;
    };
    const box = (parent: THREE.Object3D, w: number, h: number, d: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(boxGeo, material(color));
      mesh.scale.set(w, h, d);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const rounded = (parent: THREE.Object3D, w: number, h: number, d: number, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, radius = 0.12) => {
      const mesh = new THREE.Mesh(roundedGeo(w, h, d, radius), material(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const ball = (parent: THREE.Object3D, size: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, scale?: [number, number, number]) => {
      const mesh = new THREE.Mesh(sphereGeo, material(color));
      const dimensions = scale || [size, size, size];
      mesh.scale.set(dimensions[0], dimensions[1], dimensions[2]);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const cylinderGeo = geometry(new THREE.CylinderGeometry(1, 1, 1, 10));
    const cylinder = (parent: THREE.Object3D, radius: number, height: number, color: THREE.ColorRepresentation, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(cylinderGeo, material(color));
      mesh.scale.set(radius, height, radius);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Vertex colors preserve the toy palette while batching hundreds of small
    // decorations. Articulated limbs remain individual meshes for animation.
    const batchMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
    materials.add(batchMaterial);
    const mergeMeshes = (parent: THREE.Object3D, meshes: THREE.Mesh[], castShadow: boolean) => {
      if (!meshes.length) return undefined;
      parent.updateWorldMatrix(true, true);
      const inverseParent = parent.matrixWorld.clone().invert();
      const positions: number[] = [];
      const normals: number[] = [];
      const colors: number[] = [];
      const vertex = new THREE.Vector3();
      const normal = new THREE.Vector3();
      for (const mesh of meshes) {
        const sourceMaterial = mesh.material;
        if (!(sourceMaterial instanceof THREE.MeshStandardMaterial)) continue;
        const matrix = new THREE.Matrix4().multiplyMatrices(inverseParent, mesh.matrixWorld);
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
        const positionAttribute = mesh.geometry.getAttribute('position');
        const normalAttribute = mesh.geometry.getAttribute('normal');
        const sourceColors = mesh.geometry.getAttribute('color');
        const indices = mesh.geometry.getIndex();
        const count = indices ? indices.count : positionAttribute.count;
        for (let i = 0; i < count; i++) {
          const index = indices ? indices.getX(i) : i;
          vertex.fromBufferAttribute(positionAttribute, index).applyMatrix4(matrix);
          normal.fromBufferAttribute(normalAttribute, index).applyMatrix3(normalMatrix).normalize();
          positions.push(vertex.x, vertex.y, vertex.z);
          normals.push(normal.x, normal.y, normal.z);
          colors.push(
            sourceMaterial.color.r * (sourceColors ? sourceColors.getX(index) : 1),
            sourceMaterial.color.g * (sourceColors ? sourceColors.getY(index) : 1),
            sourceMaterial.color.b * (sourceColors ? sourceColors.getZ(index) : 1),
          );
        }
        mesh.removeFromParent();
      }
      const merged = geometry(new THREE.BufferGeometry());
      merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      merged.computeBoundingSphere();
      const batch = new THREE.Mesh(merged, batchMaterial);
      batch.castShadow = castShadow;
      batch.receiveShadow = true;
      parent.add(batch);
      return batch;
    };

    scene.add(new THREE.HemisphereLight('#fff8ed', '#8bb9a2', 2.65));
    const sun = new THREE.DirectionalLight('#fff3d5', 4);
    sun.position.set(-12, 24, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.far = 65;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0002;
    sun.shadow.radius = 4;
    scene.add(sun);

    const ground = new THREE.Mesh(roundedGeo(24, 20, 0.65, 3.8), material(COLORS.edge));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.42;
    ground.receiveShadow = true;
    scene.add(ground);
    const turf = new THREE.Mesh(roundedGeo(23.8, 19.8, 0.18, 3.7), material(COLORS.grass));
    turf.rotation.x = -Math.PI / 2;
    turf.position.y = -0.05;
    turf.receiveShadow = true;
    scene.add(turf);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material(COLORS.sky));
    geometries.add(floor.geometry);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.79;
    floor.receiveShadow = true;
    scene.add(floor);

    // A generous, simple central plaza keeps the audience area easy to read.
    const path = new THREE.Mesh(roundedGeo(6.5, 13.2, 0.04, 2.1), material(COLORS.cream));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.085, 2);
    path.receiveShadow = true;
    scene.add(path);
    const plaza = cylinder(scene, 4.1, 0.045, COLORS.cream, 0, 0.09, 2.8);
    plaza.receiveShadow = true;
    cylinder(scene, 2.15, 0.05, '#dce9cb', 0, 0.125, 3.1);
    const plazaRing = new THREE.Mesh(geometry(new THREE.TorusGeometry(1.74, 0.035, 5, 48)), material('#fff9e8'));
    plazaRing.rotation.x = Math.PI / 2;
    plazaRing.position.set(0, 0.16, 3.1);
    scene.add(plazaRing);

    // Stage and a small stepped podium are deliberately toy-like, not a flat backdrop.
    const stage = new THREE.Group();
    stage.position.set(0, 0, -5.9);
    scene.add(stage);
    const dais = rounded(stage, 11.1, 0.68, 4.25, COLORS.lilacDark, 0, 0.37, 0, 0.45);
    dais.receiveShadow = true;
    rounded(stage, 11.3, 0.18, 4.4, '#bcb0ee', 0, 0.79, 0, 0.4);
    rounded(stage, 4.5, 0.3, 0.65, '#d6c9f1', 0, 0.18, 2.47, 0.13);
    rounded(stage, 3.9, 0.25, 0.7, '#e2d7f3', 0, 0.12, 3.04, 0.13);
    rounded(stage, 2.0, 0.16, 1.65, '#fff3cc', 0, 0.94, 0.35, 0.18);
    rounded(stage, 1.15, 0.95, 0.7, COLORS.pink, 0, 1.43, -0.5, 0.13);
    rounded(stage, 1.43, 0.14, 0.9, '#ffdfad', 0, 1.98, -0.5, 0.13);
    // Tiny microphone, a detail that makes the stage feel like a bee contest.
    const micStand = cylinder(stage, 0.035, 0.6, COLORS.ink, 0.4, 2.27, -0.5);
    micStand.rotation.z = -0.17;
    ball(stage, 0.09, COLORS.ink, 0.45, 2.59, -0.5);

    box(stage, 0.26, 4.6, 0.3, COLORS.cream, -4.65, 2.75, -1.44);
    box(stage, 0.26, 4.6, 0.3, COLORS.cream, 4.65, 2.75, -1.44);
    ball(stage, 0.27, COLORS.gold, -4.65, 5.16, -1.44);
    ball(stage, 0.27, COLORS.gold, 4.65, 5.16, -1.44);
    const arch = new THREE.Mesh(geometry(new THREE.TorusGeometry(4.65, 0.17, 8, 36, Math.PI)), material(COLORS.gold));
    arch.position.set(0, 1.55, -1.45);
    arch.scale.y = 0.64;
    arch.castShadow = true;
    stage.add(arch);
    const board = rounded(stage, 7.7, 1.35, 0.22, COLORS.cream, 0, 4.26, -1.38, 0.24);
    board.castShadow = true;

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 1024;
    signCanvas.height = 180;
    const signContext = signCanvas.getContext('2d');
    if (signContext) {
      signContext.clearRect(0, 0, 1024, 180);
      signContext.fillStyle = COLORS.ink;
      signContext.textAlign = 'center';
      signContext.textBaseline = 'middle';
      signContext.font = '900 108px "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
      signContext.fillText('MATH BEE', 512, 94);
      const texture = new THREE.CanvasTexture(signCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.add(texture);
      const signMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
      materials.add(signMaterial);
      const sign = new THREE.Mesh(geometry(new THREE.PlaneGeometry(6.8, 1.16)), signMaterial);
      sign.position.set(0, 4.26, -1.24);
      stage.add(sign);
    }

    // Bunting introduces a little movement without adding expensive effects.
    const bunting = new THREE.Group();
    bunting.position.set(0, 3.0, -7.15);
    scene.add(bunting);
    const stringGeometry = geometry(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-4.65, 0.4, 0), new THREE.Vector3(0, -0.15, 0.15), new THREE.Vector3(4.65, 0.4, 0),
    ]));
    const stringMaterial = new THREE.LineBasicMaterial({ color: '#d6b88a' });
    materials.add(stringMaterial);
    bunting.add(new THREE.Line(stringGeometry, stringMaterial));
    const flagShape = new THREE.Shape();
    flagShape.moveTo(-0.26, 0); flagShape.lineTo(0.26, 0); flagShape.lineTo(0, -0.58); flagShape.closePath();
    const flagGeo = geometry(new THREE.ShapeGeometry(flagShape));
    for (let i = 0; i < 13; i++) {
      const x = -4.12 + i * 0.687;
      const flag = new THREE.Mesh(flagGeo, material([COLORS.pink, COLORS.gold, COLORS.lilac, '#9dd9be'][i % 4], { side: THREE.DoubleSide }));
      flag.position.set(x, -0.12 + Math.abs(x) * 0.11, 0.12);
      flag.rotation.z = (i % 2 ? 1 : -1) * 0.08;
      bunting.add(flag);
    }

    const mathProp = (type: 'plus' | 'times' | 'divide', x: number, z: number, color: string, scale: number, angle: number) => {
      const group = new THREE.Group();
      group.position.set(x, 1.08, z);
      group.scale.setScalar(scale);
      group.rotation.y = angle;
      if (type === 'divide') {
        rounded(group, 1.7, 0.38, 0.42, color, 0, 0, 0, 0.1);
        ball(group, 0.24, color, 0, 0.73, 0);
        ball(group, 0.24, color, 0, -0.73, 0);
      } else {
        rounded(group, 1.8, 0.4, 0.42, color, 0, 0, 0, 0.1);
        rounded(group, 0.4, 1.8, 0.42, color, 0, 0, 0, 0.1);
        if (type === 'times') group.rotation.z = Math.PI / 4;
      }
      scene.add(group);
      return group;
    };
    mathProp('plus', -7.2, -3.8, '#f5ce70', 1.1, 0.25);
    mathProp('divide', 7.6, -4.2, '#f2a1a8', 1.0, -0.28);
    mathProp('times', -8.2, 5.8, COLORS.lilac, 0.74, 0.3);

    const bench = (x: number, z: number, angle: number) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.rotation.y = angle;
      for (const sx of [-1.12, 1.12]) {
        box(group, 0.15, 0.72, 0.85, '#69998a', sx, 0.4, 0);
        box(group, 0.14, 1.05, 0.16, '#69998a', sx, 0.9, -0.32);
      }
      rounded(group, 2.85, 0.16, 0.85, COLORS.wood, 0, 0.79, 0, 0.07);
      rounded(group, 2.85, 0.47, 0.13, '#ecccaa', 0, 1.17, -0.34, 0.07);
      scene.add(group);
    };
    bench(-6.2, 0.7, -0.25);
    bench(-6.9, 3.2, -0.37);
    bench(6.2, 0.7, 0.25);
    bench(6.9, 3.2, 0.37);

    // Trees, low shrubs, planters, and flower clusters make a small world feel inhabited.
    const tree = (x: number, z: number, scale: number, color: string, phase: number) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.scale.setScalar(scale);
      cylinder(group, 0.2, 2.0, '#b49b76', 0, 1.0, 0);
      const crown = ball(group, 1.1, color, 0, 2.52, 0, [1.04, 1.34, 1.04]);
      ball(group, 0.65, color, -0.57, 2.21, -0.05);
      ball(group, 0.65, color, 0.56, 2.32, 0.12);
      plants.push({ mesh: crown, start: 2.52, phase });
      cylinder(group, 0.64, 0.13, '#83bc92', 0, 0.12, 0);
      scene.add(group);
    };
    tree(-9.7, -6.5, 1.1, '#9dd5a7', 0);
    tree(-10.1, 0.5, 0.92, '#8dcba1', 2);
    tree(-9.3, 6.4, 0.9, '#c7d790', 1);
    tree(9.8, -6.4, 1.08, '#a4d5a3', 1.2);
    tree(10.3, 0.3, 0.85, '#91c79c', 3.0);
    tree(9.2, 6.6, 1.03, '#bed995', 2.1);

    for (const [x, z] of [[-3.5, -8.4], [3.5, -8.4], [-10, 3.9], [10, 3.9], [-5, 7.8], [5.0, 7.8]]) {
      ball(scene, 0.55, '#5bac8a', x, 0.45, z, [0.92, 0.5, 0.59]);
      ball(scene, 0.48, '#80c997', x + 0.59, 0.38, z + 0.1, [0.66, 0.42, 0.5]);
    }

    const flowerGeo = geometry(new THREE.IcosahedronGeometry(0.09, 0));
    const flowerPositions: Array<[number, number]> = [[-4.2, 5.8], [4.5, 6.8], [-7.9, -1.5], [8.1, -1.1], [-3.8, -8.5], [4.3, -8.5], [-8, 7.3], [7.6, 7.9]];
    const flowerColors = ['#ffe5a6', '#f6aeb5', '#eee0ff'];
    const dummy = new THREE.Object3D();
    flowerColors.forEach((color, colorIndex) => {
      const blooms = new THREE.InstancedMesh(flowerGeo, material(color), flowerPositions.length * 4);
      let index = 0;
      for (const [x, z] of flowerPositions) {
        for (let k = 0; k < 4; k++) {
          const angle = k * 2.4 + colorIndex * 0.8;
          dummy.position.set(x + Math.cos(angle) * (0.25 + colorIndex * 0.12), 0.16 + (k % 2) * 0.08, z + Math.sin(angle) * 0.34);
          dummy.scale.set(1, 0.6, 1);
          dummy.updateMatrix();
          blooms.setMatrixAt(index++, dummy.matrix);
        }
      }
      blooms.castShadow = false;
      scene.add(blooms);
    });

    // Pastel stepping stones frame the entrance rather than covering the play space.
    for (let i = 0; i < 5; i++) {
      const stone = cylinder(scene, 0.36, 0.08, '#f2ddb8', (i % 2 ? 0.18 : -0.13), 0.14, 7.9 + i * 0.49);
      stone.scale.z *= 0.7;
    }

    // Only six swaying treetops, the textured sign, string, and three flower
    // instances remain outside these static batches.
    scene.updateMatrixWorld(true);
    const movingPlants = new Set<THREE.Object3D>(plants.map(plant => plant.mesh));
    const staticShadowMeshes: THREE.Mesh[] = [];
    const staticFlatMeshes: THREE.Mesh[] = [];
    scene.traverse(object => {
      if (object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh) && object.material instanceof THREE.MeshStandardMaterial && !movingPlants.has(object)) {
        (object.castShadow ? staticShadowMeshes : staticFlatMeshes).push(object);
      }
    });
    mergeMeshes(scene, staticShadowMeshes, true);
    mergeMeshes(scene, staticFlatMeshes, false);

    const avatarColors = ['#f17d8b', '#71c9ad', '#a18cdb', '#f5c85d', '#81bde3', '#eda580'];
    const avatarIndex = (value: number | string) => {
      if (typeof value === 'number' && Number.isInteger(value)) return THREE.MathUtils.clamp(value, 0, 5);
      const v = String(value ?? '').toLowerCase();
      if (/^[0-5]$/.test(v)) return Number(v);
      if (v.includes('mint') || v === '1') return 1;
      if (v.includes('lilac') || v.includes('purple') || v.includes('lavender') || v === '2') return 2;
      if (v.includes('sun') || v.includes('yellow') || v === '3') return 3;
      if (v.includes('blue') || v.includes('sky')) return 4;
      if (v.includes('peach')) return 5;
      return 0;
    };
    const headGeometry = roundedGeo(0.76, 0.69, 0.68, 0.12);
    const bodyGeometry = roundedGeo(0.7, 0.66, 0.39, 0.07);
    const limbGeometry = roundedGeo(0.23, 0.62, 0.25, 0.035);
    const eyeGeometry = geometry(new THREE.SphereGeometry(0.035, 6, 5));
    const smileGeometry = geometry(new THREE.TorusGeometry(0.075, 0.012, 4, 12, Math.PI));
    const shoeGeo = roundedGeo(0.26, 0.18, 0.38, 0.045);
    const ownRingGeo = geometry(new THREE.RingGeometry(0.48, 0.56, 32));

    const nameLabel = (name: string, own: boolean) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;
      ctx.fillStyle = own ? '#273e42' : '#fff8e8';
      ctx.beginPath();
      ctx.roundRect(4, 4, 312, 65, 24);
      ctx.fill();
      ctx.font = '700 29px "Trebuchet MS", sans-serif';
      ctx.fillStyle = own ? '#fff8e8' : '#273e42';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const display = name.length > 17 ? `${name.slice(0, 16)}…` : name;
      ctx.fillText(display, 160, 38, 280);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      textures.add(texture);
      const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      materials.add(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(1.6, 0.4, 1);
      sprite.position.y = 2.43;
      sprite.renderOrder = 8;
      return sprite;
    };

    const makeFigure = (name: string, avatar: number | string, own: boolean, offset: number): Figure => {
      const previousGeometries = new Set(geometries);
      const ownedMaterials: THREE.Material[] = [];
      const index = avatarIndex(avatar);
      const color = avatarColors[index];
      const group = new THREE.Group();
      const body = new THREE.Mesh(bodyGeometry, material(color));
      body.position.y = 1.04;
      body.castShadow = true;
      group.add(body);
      const head = new THREE.Mesh(headGeometry, material('#fbe0b8'));
      head.position.y = 1.72;
      head.castShadow = true;
      group.add(head);
      // A blocky hairline and an accessory identify each preset without imported assets.
      const hair = box(group, 0.78, 0.18, 0.69, index === 2 ? '#675275' : '#624b3e', 0, 2.04, -0.015);
      hair.castShadow = true;
      if (index === 0) {
        rounded(group, 0.81, 0.18, 0.7, color, 0, 2.15, -0.02, 0.07);
        rounded(group, 0.73, 0.06, 0.35, color, 0, 2.1, 0.4, 0.04);
      } else if (index === 1) {
        ball(group, 0.14, '#a4dca3', -0.23, 2.22, 0.06);
        ball(group, 0.14, '#a4dca3', 0.23, 2.22, 0.06);
      } else if (index === 2) {
        const ear1 = rounded(group, 0.17, 0.43, 0.15, '#ddd2f5', -0.22, 2.35, 0, 0.06);
        const ear2 = rounded(group, 0.17, 0.43, 0.15, '#ddd2f5', 0.22, 2.35, 0, 0.06);
        ear1.rotation.z = 0.15; ear2.rotation.z = -0.15;
      } else if (index === 3) {
        rounded(group, 0.79, 0.16, 0.7, '#f6cf67', 0, 2.12, 0, 0.03);
        for (const x of [-0.28, 0, 0.28]) box(group, 0.14, 0.23, 0.15, '#f6cf67', x, 2.26, 0.22);
      } else if (index === 4) {
        rounded(group, 0.82, 0.28, 0.72, color, 0, 2.16, -0.01, 0.1);
        ball(group, 0.12, '#fff6df', 0, 2.42, 0);
      } else {
        ball(group, 0.25, '#805d43', -0.43, 1.98, -0.19, [0.23, 0.37, 0.24]);
        rounded(group, 0.22, 0.08, 0.12, color, -0.35, 2.15, 0.24, 0.025);
      }
      for (const x of [-0.15, 0.15]) {
        const eye = new THREE.Mesh(eyeGeometry, material(COLORS.ink));
        eye.position.set(x, 1.76, 0.351);
        group.add(eye);
      }
      const smile = new THREE.Mesh(smileGeometry, material(COLORS.ink));
      smile.rotation.z = Math.PI;
      smile.position.set(0, 1.61, 0.354);
      group.add(smile);
      const arm = (x: number) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, 1.31, 0);
        const mesh = new THREE.Mesh(limbGeometry, material(color));
        mesh.position.y = -0.24;
        mesh.castShadow = true;
        pivot.add(mesh);
        box(pivot, 0.22, 0.19, 0.25, '#fbe0b8', 0, -0.57, 0);
        group.add(pivot);
        return pivot;
      };
      const leg = (x: number) => {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.77, 0);
        const mesh = new THREE.Mesh(limbGeometry, material(index === 3 ? '#7a9294' : '#586a79'));
        mesh.position.y = -0.27;
        mesh.castShadow = true;
        pivot.add(mesh);
        const shoe = new THREE.Mesh(shoeGeo, material('#fff5df'));
        shoe.position.set(0, -0.61, 0.055);
        shoe.castShadow = true;
        pivot.add(shoe);
        group.add(pivot);
        return pivot;
      };
      const leftArm = arm(-0.5);
      const rightArm = arm(0.5);
      const leftLeg = leg(-0.19);
      const rightLeg = leg(0.19);
      // Keep only five renderable character meshes: body and four jointed limbs.
      group.updateMatrixWorld(true);
      const bodyMeshes = group.children.filter(child => child instanceof THREE.Mesh) as THREE.Mesh[];
      mergeMeshes(group, bodyMeshes, true);
      for (const limb of [leftArm, rightArm, leftLeg, rightLeg]) {
        mergeMeshes(limb, limb.children.filter(child => child instanceof THREE.Mesh) as THREE.Mesh[], true);
      }
      if (own) {
        const ringMat = new THREE.MeshBasicMaterial({ color: '#f8cf67', side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
        materials.add(ringMat);
        ownedMaterials.push(ringMat);
        const ring = new THREE.Mesh(ownRingGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.025;
        group.add(ring);
      }
      const label = name ? nameLabel(name, own) : undefined;
      // Sprite remains in the scene, rather than rotating backwards with the avatar.
      if (label) scene.add(label);
      group.scale.setScalar(0.76);
      scene.add(group);
      const ownedGeometries = [...geometries].filter(value => !previousGeometries.has(value));
      return { group, leftArm, rightArm, leftLeg, rightLeg, label, name, avatar, lastX: Number.NaN, lastZ: Number.NaN, lastSent: 0, offset, wasMoving: false, ownedGeometries, ownedMaterials };
    };

    const removeFigure = (figure: Figure) => {
      scene.remove(figure.group);
      figure.ownedGeometries.forEach(value => { geometries.delete(value); value.dispose(); });
      figure.ownedMaterials.forEach(value => { materials.delete(value); value.dispose(); });
      if (figure.label) {
        scene.remove(figure.label);
        const mat = figure.label.material as THREE.SpriteMaterial;
        if (mat.map) { textures.delete(mat.map); mat.map.dispose(); }
        materials.delete(mat); mat.dispose();
      }
    };

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      const aspect = width / height;
      // Keep the little island inside the view on portrait screens, too.
      const halfHeight = aspect < 0.82 ? 17.8 : aspect < 1.15 ? 15.3 : 12.5;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]') || target?.closest('[role="dialog"]') || latest.current.controlsEnabled === false) return;
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        keys.add(key);
        if (latest.current.youId) event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => { keys.delete(event.key.toLowerCase()); };
    const clearKeys = () => keys.clear();
    const contextLost = (event: Event) => { event.preventDefault(); setUnavailable(true); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearKeys);
    document.addEventListener('visibilitychange', clearKeys);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);

    const render = (timeMs: number) => {
      if (disposed) return;
      const dt = previousTime ? Math.min((timeMs - previousTime) / 1000, 0.05) : 0;
      previousTime = timeMs;
      const time = timeMs / 1000;
      const current = latest.current;
      const landing = current.players.length === 0;
      const displayPlayers: WorldPlayer[] = landing ? [{ id: '__mascot', name: '', avatar: 'coral', lives: 3, score: 0, connected: true, x: 0, z: 3.2 }] : current.players;
      const ids = new Set(displayPlayers.map(p => p.id));
      for (const [id, figure] of figures) {
        if (!ids.has(id)) { removeFigure(figure); figures.delete(id); }
      }
      displayPlayers.forEach((player, index) => {
        let figure = figures.get(player.id);
        const own = player.id === current.youId;
        if (figure && (figure.avatar !== player.avatar || figure.name !== player.name)) {
          removeFigure(figure); figures.delete(player.id); figure = undefined;
        }
        if (!figure) {
          figure = makeFigure(player.name, player.avatar, own, index * 0.9);
          figure.group.position.set(Number.isFinite(player.x) ? player.x : (index - 3) * 1.2, 0.13, Number.isFinite(player.z) ? player.z : 3);
          figures.set(player.id, figure);
        }

        const atStage = player.id === current.actorId && ['transition', 'answering', 'feedback'].includes(current.phase);
        const oldX = figure.group.position.x;
        const oldZ = figure.group.position.z;
        const wasAtStage = figure.group.position.y > 0.6;
        if (atStage) {
          figure.group.position.x = THREE.MathUtils.damp(figure.group.position.x, 0, 4.5, dt);
          figure.group.position.z = THREE.MathUtils.damp(figure.group.position.z, -5.8, 4.5, dt);
          figure.group.position.y = THREE.MathUtils.damp(figure.group.position.y, 1.04, 4, dt);
          figure.group.rotation.y = THREE.MathUtils.damp(figure.group.rotation.y, 0, 5, dt);
        } else if (own && !landing) {
          let dx = current.controlsEnabled === false ? 0 : (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0) + (current.movement?.x || 0);
          let dz = current.controlsEnabled === false ? 0 : (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0) + (current.movement?.z || 0);
          const length = Math.hypot(dx, dz);
          if (length > 1) { dx /= length; dz /= length; }
          if (wasAtStage) {
            figure.group.position.x = Number.isFinite(player.x) ? player.x : 0;
            figure.group.position.z = Math.max(-1.6, Number.isFinite(player.z) ? player.z : 3);
          }
          figure.group.position.y = THREE.MathUtils.damp(figure.group.position.y, 0.13, 6, dt);
          figure.group.position.x = THREE.MathUtils.clamp(figure.group.position.x + dx * dt * 3.3, -8.7, 8.7);
          figure.group.position.z = THREE.MathUtils.clamp(figure.group.position.z + dz * dt * 3.3, -1.6, 7.9);
          if (length > 0.05) {
            figure.group.rotation.y = Math.atan2(dx, dz);
            if (timeMs - figure.lastSent >= 180) {
              current.onMove?.(figure.group.position.x, figure.group.position.z);
              figure.lastSent = timeMs;
            }
          } else if (figure.wasMoving) {
            current.onMove?.(figure.group.position.x, figure.group.position.z);
            figure.lastSent = timeMs;
          }
          figure.wasMoving = length > 0.05;
          const serverChanged = player.x !== figure.lastX || player.z !== figure.lastZ;
          if (serverChanged && Number.isFinite(player.x) && Number.isFinite(player.z)) {
            if (Math.hypot(figure.group.position.x - player.x, figure.group.position.z - player.z) > 4 && length < 0.05) {
              figure.group.position.x = player.x;
              figure.group.position.z = Math.max(-1.6, player.z);
            }
            figure.lastX = player.x; figure.lastZ = player.z;
          }
        } else {
          const targetX = Number.isFinite(player.x) ? player.x : (index - 3) * 1.2;
          const targetZ = Number.isFinite(player.z) ? player.z : 3;
          figure.group.position.x = THREE.MathUtils.damp(oldX, targetX, 8, dt);
          figure.group.position.z = THREE.MathUtils.damp(oldZ, targetZ, 8, dt);
          figure.group.position.y = THREE.MathUtils.damp(figure.group.position.y, 0.13, 6, dt);
          if (Math.hypot(targetX - oldX, targetZ - oldZ) > 0.08) figure.group.rotation.y = Math.atan2(targetX - oldX, targetZ - oldZ);
          if (landing) {
            figure.group.rotation.y = 0.2 + Math.sin(time * 0.32) * 0.12;
            figure.rightArm.rotation.z = -0.18 - Math.sin(time * 2.4) * 0.12;
          }
        }
        const moving = Math.hypot(figure.group.position.x - oldX, figure.group.position.z - oldZ) > 0.005;
        const stride = moving ? Math.sin(time * 10 + figure.offset) * 0.55 : Math.sin(time * 1.6 + figure.offset) * 0.025;
        figure.leftLeg.rotation.x = stride;
        figure.rightLeg.rotation.x = -stride;
        figure.leftArm.rotation.x = -stride * 0.8;
        figure.rightArm.rotation.x = stride * 0.8;
        if (figure.label) {
          figure.label.position.copy(figure.group.position);
          figure.label.position.y += 2.08;
          figure.label.material.opacity = player.connected ? 1 : 0.48;
        }
      });
      plants.forEach(plant => { plant.mesh.position.y = plant.start + Math.sin(time * 1.3 + plant.phase) * 0.025; });
      bunting.rotation.z = Math.sin(time * 0.8) * 0.006;
      renderer.render(scene, camera);
      renderFrames++;
      fpsWindowFrames++;
      if (!fpsWindowStart) fpsWindowStart = timeMs;
      if (timeMs - fpsWindowStart >= 1000) {
        measuredFps = Math.round(fpsWindowFrames * 1000 / (timeMs - fpsWindowStart));
        fpsWindowFrames = 0;
        fpsWindowStart = timeMs;
      }
      const diagnostics = {
        frame: renderFrames,
        fps: measuredFps,
        dpr: renderer.getPixelRatio(),
        info: {
          render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
          memory: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures },
        },
        gpuRenderer,
        playerPositions: Object.fromEntries([...figures].filter(([id]) => id !== '__mascot').map(([id, figure]) => [id, { x: figure.group.position.x, y: figure.group.position.y, z: figure.group.position.z }])),
      };
      (window as Window & { __THREE_GAME_DIAGNOSTICS__?: typeof diagnostics }).__THREE_GAME_DIAGNOSTICS__ = diagnostics;
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose());
      scene.clear();
      renderer.dispose();
      renderer.domElement.remove();
      delete (window as Window & { __THREE_GAME_DIAGNOSTICS__?: unknown }).__THREE_GAME_DIAGNOSTICS__;
    };
  }, []);

  return (
    <div className="world-canvas" ref={container}>
      {unavailable && (
        <div className="world-fallback" role="status">
          <span aria-hidden="true">✦</span>
          <strong>Arena 3D belum bisa ditampilkan.</strong>
          <span>Coba browser terbaru dengan WebGL aktif. Koneksi permainan tetap diperiksa terpisah.</span>
        </div>
      )}
    </div>
  );
}
