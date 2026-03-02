
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const subtle = document.getElementById('subtle');
const inspect = document.getElementById('inspect');
const inspectTitle = inspect.querySelector('h2');
const inspectBody = inspect.querySelector('p');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8e9399);
scene.fog = new THREE.FogExp2(0x8b9197, 0.0032);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2200);
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(camera);
camera.position.set(0, 1.72, 155);

let audioCtx = null;
let ambientGain = null;
let windNodes = [];
let musicNodes = [];
let lastFootstep = 0;

function ensureAudio(){
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  ambientGain = audioCtx.createGain();
  ambientGain.gain.value = 0.09;
  ambientGain.connect(audioCtx.destination);

  const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for(let i=0;i<data.length;i++) data[i] = (Math.random() * 2 - 1) * 0.55;

  for(let i=0;i<2;i++){
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = audioCtx.createBiquadFilter();
    filter.type = i === 0 ? 'lowpass' : 'bandpass';
    filter.frequency.value = i === 0 ? 420 : 180;
    filter.Q.value = i === 0 ? 0.6 : 0.3;
    const gain = audioCtx.createGain();
    gain.gain.value = i === 0 ? 0.06 : 0.03;
    src.connect(filter); filter.connect(gain); gain.connect(ambientGain); src.start();
    windNodes.push({src, filter, gain});
  }

  const master = audioCtx.createGain();
  master.gain.value = 0.035;
  master.connect(audioCtx.destination);
  [98, 147, 196].forEach((hz, idx) => {
    const osc = audioCtx.createOscillator();
    osc.type = idx === 1 ? 'triangle' : 'sine';
    osc.frequency.value = hz;
    const gain = audioCtx.createGain();
    gain.gain.value = idx === 1 ? 0.008 : 0.005;
    osc.connect(gain); gain.connect(master); osc.start();
    musicNodes.push({osc, gain});
  });
}

function playStep(strong = false){
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const dur = strong ? 0.07 : 0.05;
  const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * dur), audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<d.length;i++){
    const env = 1 - i / d.length;
    d[i] = (Math.random() * 2 - 1) * env * env * 0.5;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = strong ? 230 : 180;
  filter.Q.value = 0.6;
  const gain = audioCtx.createGain();
  gain.gain.value = strong ? 0.04 : 0.025;
  src.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination); src.start();
}

function playInteract(tone = 120){
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(tone, now);
  osc.frequency.exponentialRampToValueAtTime(tone * 1.8, now + 0.09);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain); gain.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.13);
}

const hemi = new THREE.HemisphereLight(0xb9c0ca, 0x2a2623, 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d2, 1.55);
sun.position.set(180, 220, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 700;
sun.shadow.camera.left = -250;
sun.shadow.camera.right = 250;
sun.shadow.camera.top = 250;
sun.shadow.camera.bottom = -250;
scene.add(sun);
scene.add(sun.target);

const textureLoader = new THREE.TextureLoader();
const anisotropy = renderer.capabilities.getMaxAnisotropy();
function loadTexture(url, {repeat = [1,1], srgb = false} = {}){
  const tx = textureLoader.load(url);
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(repeat[0], repeat[1]);
  tx.anisotropy = anisotropy;
  if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

const textures = {
  roadMap: loadTexture('./assets/asphalt_diff.jpg', {repeat:[7,34], srgb:true}),
  roadNormal: loadTexture('./assets/asphalt_nor.jpg', {repeat:[7,34]}),
  roadRough: loadTexture('./assets/asphalt_rough.jpg', {repeat:[7,34]}),
  concreteMap: loadTexture('./assets/concrete_diff.jpg', {repeat:[6,6], srgb:true}),
  concreteNormal: loadTexture('./assets/concrete_nor.jpg', {repeat:[6,6]}),
  concreteRough: loadTexture('./assets/concrete_rough.jpg', {repeat:[6,6]}),
  wallMap: loadTexture('./assets/concrete_wall_diff.jpg', {repeat:[2.5,3], srgb:true}),
  wallNormal: loadTexture('./assets/concrete_wall_nor.jpg', {repeat:[2.5,3]}),
  wallRough: loadTexture('./assets/concrete_wall_rough.jpg', {repeat:[2.5,3]}),
  brickMap: loadTexture('./assets/brick_diff.jpg', {repeat:[3,3], srgb:true}),
  brickNormal: loadTexture('./assets/brick_nor.jpg', {repeat:[3,3]}),
  brickRough: loadTexture('./assets/brick_rough.jpg', {repeat:[3,3]}),
  shutterMap: loadTexture('./assets/shutter_diff.jpg', {repeat:[2,2], srgb:true}),
  shutterNormal: loadTexture('./assets/shutter_nor.jpg', {repeat:[2,2]}),
  shutterRough: loadTexture('./assets/shutter_rough.jpg', {repeat:[2,2]})
};

function makeStd({map, normalMap, roughnessMap, color = 0xffffff, roughness = 1, metalness = 0}){
  return new THREE.MeshStandardMaterial({map, normalMap, roughnessMap, color, roughness, metalness});
}

const mats = {
  road: makeStd({map:textures.roadMap, normalMap:textures.roadNormal, roughnessMap:textures.roadRough, roughness:1}),
  concrete: makeStd({map:textures.concreteMap, normalMap:textures.concreteNormal, roughnessMap:textures.concreteRough, roughness:1}),
  wall: makeStd({map:textures.wallMap, normalMap:textures.wallNormal, roughnessMap:textures.wallRough, roughness:0.98}),
  brick: makeStd({map:textures.brickMap, normalMap:textures.brickNormal, roughnessMap:textures.brickRough, roughness:0.96}),
  shutter: makeStd({map:textures.shutterMap, normalMap:textures.shutterNormal, roughnessMap:textures.shutterRough, roughness:0.95, metalness:0.06}),
  metal: new THREE.MeshStandardMaterial({color:0x4a4e53, roughness:0.72, metalness:0.65}),
  guardrail: new THREE.MeshStandardMaterial({color:0x84888c, roughness:0.5, metalness:0.8}),
  dark: new THREE.MeshStandardMaterial({color:0x2b2d31, roughness:0.96, metalness:0.05}),
  glass: new THREE.MeshStandardMaterial({color:0x222833, roughness:0.16, metalness:0.06, transparent:true, opacity:0.84}),
  frame: new THREE.MeshStandardMaterial({color:0x3b4045, roughness:0.82, metalness:0.22}),
  rubble: new THREE.MeshStandardMaterial({color:0x5b5650, roughness:1, metalness:0.02}),
  paint: new THREE.MeshStandardMaterial({color:0x6f7377, roughness:0.92, metalness:0.05})
};

const litWindowMats = [];
const windowMaterialCache = new Map();
function makeWindowMaterial(seed = 0){
  const key = ((seed % 8) + 8) % 8;
  if (windowMaterialCache.has(key)) return windowMaterialCache.get(key);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#11151a';
  g.fillRect(0,0,c.width,c.height);
  for(let y=0;y<32;y++){
    for(let x=0;x<8;x++){
      const lit = ((x*17 + y*23 + seed*13) % 7) < 2;
      g.fillStyle = lit ? (y % 3 ? '#c6b27b' : '#9bb0be') : '#18212a';
      g.fillRect(12 + x*30, 10 + y*15, 18, 9);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(12 + x*30, 10 + y*15, 18, 1);
    }
  }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.repeat.set(1,1);
  const mat = new THREE.MeshStandardMaterial({map:tx, emissive:new THREE.Color(0x79684a), emissiveMap:tx, emissiveIntensity:0.18, roughness:0.42, metalness:0.0});
  litWindowMats.push(mat);
  windowMaterialCache.set(key, mat);
  return mat;
}

function makeSpriteTexture(colors){
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64,64,8,64,64,62);
  colors.forEach(([stop, col])=>grd.addColorStop(stop,col));
  g.fillStyle = grd;
  g.fillRect(0,0,128,128);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

const smokeSprite = makeSpriteTexture([[0,'rgba(60,60,60,.42)'],[0.55,'rgba(45,45,45,.18)'],[1,'rgba(45,45,45,0)']]);
const dustSprite = makeSpriteTexture([[0,'rgba(210,210,210,.18)'],[0.7,'rgba(180,180,180,.05)'],[1,'rgba(180,180,180,0)']]);

const world = new THREE.Group();
scene.add(world);
const interactive = [];
const solids = [];
const dustPlanes = [];
const smokePuffs = [];
const lampMaterials = [];

function addSolidRect(minX,maxX,minZ,maxZ,pad=1.2){ solids.push({minX,maxX,minZ,maxZ,pad}); }

function mesh(boxGeo, mat, x,y,z, rx=0, ry=0, rz=0, cast=true, receive=true, parent=world){
  const m = new THREE.Mesh(boxGeo, mat);
  m.position.set(x,y,z); m.rotation.set(rx,ry,rz); m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
}
function box(w,h,d,mat,x,y,z,rx=0,ry=0,rz=0,parent=world){
  return mesh(new THREE.BoxGeometry(w,h,d), mat, x,y,z,rx,ry,rz,true,true,parent);
}
function plane(w,h,mat,x,y,z,rx=0,ry=0,rz=0,parent=world){
  return mesh(new THREE.PlaneGeometry(w,h), mat, x,y,z,rx,ry,rz,false,true,parent);
}

function addRoad(x, z, w, d, y=0.01){
  const road = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), mats.road);
  road.position.set(x, y, z);
  road.receiveShadow = true;
  world.add(road);
  return road;
}
function addSidewalk(x, z, w, d, y=0.06){
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mats.concrete);
  slab.position.set(x, y, z);
  slab.receiveShadow = true;
  world.add(slab);
  return slab;
}
function addCurbLine(x,z,w,d,horizontal){
  const g = new THREE.BoxGeometry(horizontal ? w : 0.18, 0.14, horizontal ? 0.18 : d);
  const curb = new THREE.Mesh(g, mats.paint);
  curb.position.set(x, 0.1, z);
  curb.receiveShadow = true;
  world.add(curb);
}

function addStreetGrid(){
  addRoad(0, 0, 30, 900);
  addRoad(0, 0, 560, 28);
  addRoad(96, -160, 190, 22);
  addRoad(-118, 180, 220, 22);
  addRoad(0, -240, 30, 190);

  addSidewalk(-23, 0, 12, 900);
  addSidewalk(23, 0, 12, 900);
  addSidewalk(0, -21, 560, 10);
  addSidewalk(0, 21, 560, 10);
  addSidewalk(96, -175, 190, 8);
  addSidewalk(96, -145, 190, 8);
  addSidewalk(-118, 165, 220, 8);
  addSidewalk(-118, 195, 220, 8);

  addCurbLine(-15.1,0,0.18,900,false); addCurbLine(15.1,0,0.18,900,false);
  addCurbLine(0,-14.1,560,0.18,true); addCurbLine(0,14.1,560,0.18,true);

  const laneMat = new THREE.MeshStandardMaterial({color:0xd8c7a2, roughness:0.9, metalness:0});
  for(let i=-390;i<=390;i+=34){
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.01,12), laneMat);
    dash.position.set(0,0.03,i);
    world.add(dash);
  }
  for(let i=-220;i<=220;i+=34){
    const dash = new THREE.Mesh(new THREE.BoxGeometry(12,0.01,0.22), laneMat);
    dash.position.set(i,0.03,0);
    world.add(dash);
  }
}

function addOverpass(){
  const y = 8;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(360,0.8,18), mats.concrete);
  deck.position.set(40,y,-215);
  deck.castShadow = true; deck.receiveShadow = true;
  world.add(deck);
  for(const x of [-120,-40,40,120,200]){
    const col = new THREE.Mesh(new THREE.BoxGeometry(3.2,y,3.2), mats.concrete);
    col.position.set(x, y/2, -215);
    col.castShadow = true; col.receiveShadow = true;
    world.add(col);
  }
  const rampL = new THREE.Mesh(new THREE.BoxGeometry(90,0.6,18), mats.concrete);
  rampL.position.set(-182,4.1,-215);
  rampL.rotation.z = Math.PI/16;
  rampL.castShadow = true; rampL.receiveShadow = true;
  world.add(rampL);
  const rampR = new THREE.Mesh(new THREE.BoxGeometry(90,0.6,18), mats.concrete);
  rampR.position.set(262,4.1,-215);
  rampR.rotation.z = -Math.PI/16;
  rampR.castShadow = true; rampR.receiveShadow = true;
  world.add(rampR);
  const guardGeo = new THREE.BoxGeometry(360, 0.45, 0.35);
  mesh(guardGeo, mats.guardrail, 40, y+0.7, -206.2, 0,0,0, true, true);
  mesh(guardGeo, mats.guardrail, 40, y+0.7, -223.8, 0,0,0, true, true);
  mesh(new THREE.BoxGeometry(90,0.35,0.35), mats.guardrail, -182, 4.65, -206.2, 0,0,Math.PI/16, true, true);
  mesh(new THREE.BoxGeometry(90,0.35,0.35), mats.guardrail, -182, 4.65, -223.8, 0,0,Math.PI/16, true, true);
  mesh(new THREE.BoxGeometry(90,0.35,0.35), mats.guardrail, 262, 4.65, -206.2, 0,0,-Math.PI/16, true, true);
  mesh(new THREE.BoxGeometry(90,0.35,0.35), mats.guardrail, 262, 4.65, -223.8, 0,0,-Math.PI/16, true, true);
}

function addUtilityPole(x,z,height=10){
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.2,height,10), mats.dark);
  pole.position.set(x,height/2,z); pole.castShadow = true; world.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.8,0.12,0.12), mats.dark);
  arm.position.set(x+1.2,height-1.3,z); world.add(arm);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18,12,12), new THREE.MeshStandardMaterial({color:0xffe2a8, emissive:0xffc878, emissiveIntensity:0.35}));
  lamp.position.set(x+2.4,height-1.35,z); world.add(lamp); lampMaterials.push(lamp.material);
}

function addStreetFurniture(){
  for(let z=-320; z<=320; z+=70){ addUtilityPole(20.5,z, z % 140 ? 9.6 : 11); }
  for(let x=-210; x<=210; x+=70){ if (Math.abs(x) > 30) addUtilityPole(x, 18.8, 10.8); }
  for(let i=0;i<7;i++){
    const hydr = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.28,0.7,10), new THREE.MeshStandardMaterial({color:0x7d2e28, roughness:0.92, metalness:0.2}));
    hydr.position.set((i%2?1:-1)*(26 + (i*17)%120), 0.35, -300 + i*92); hydr.castShadow = true; world.add(hydr);
  }
  const signGeo = new THREE.BoxGeometry(2.4,1.1,0.08);
  for(const [x,z,text] of [[-62,4,'5TH'],[82,-172,'MAPLE'],[116,12,'DISTRICT']]){
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
    const g = canvas.getContext('2d'); g.fillStyle = '#1a4b74'; g.fillRect(0,0,256,128); g.strokeStyle = '#ddd'; g.lineWidth = 6; g.strokeRect(6,6,244,116); g.fillStyle = '#f0f3f7'; g.font = '700 52px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(text,128,68);
    const tx = new THREE.CanvasTexture(canvas); tx.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({map:tx, roughness:0.8, metalness:0.15});
    const sign = new THREE.Mesh(signGeo, mat); sign.position.set(x, 4.7, z); sign.castShadow = true; world.add(sign);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,4.6,8), mats.dark); post.position.set(x,2.3,z); world.add(post);
  }
}

function addRubblePile(x,z,scale=1){
  const group = new THREE.Group();
  group.position.set(x,0,z);
  world.add(group);
  for(let i=0;i<18;i++){
    const s = (0.4 + (i%5)*0.18) * scale;
    const geo = i % 3 ? new THREE.DodecahedronGeometry(s,0) : new THREE.BoxGeometry(s*1.4,s*0.7,s*1.1);
    const m = new THREE.Mesh(geo, i % 4 ? mats.rubble : mats.dark);
    m.position.set((Math.random()-0.5)*4*scale, s*0.25 + Math.random()*0.7*scale, (Math.random()-0.5)*3*scale);
    m.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  }
  for(let i=0;i<7;i++){
    const weedMat = new THREE.SpriteMaterial({map:dustSprite, color:0x7d8767, transparent:true, opacity:0.5, depthWrite:false});
    const sp = new THREE.Sprite(weedMat);
    sp.position.set((Math.random()-0.5)*6*scale, 0.55 + Math.random()*0.35, (Math.random()-0.5)*4*scale);
    sp.scale.set(0.8 + Math.random()*0.6, 1.4 + Math.random()*1.2, 1);
    group.add(sp);
  }
}

function addStorefrontRow(x,z,width,depth,count,material,collapsed=false){
  const group = new THREE.Group(); group.position.set(x,0,z); world.add(group);
  const base = new THREE.Mesh(new THREE.BoxGeometry(width, 7.2, depth), material);
  base.position.y = 3.6; base.castShadow = true; base.receiveShadow = true; group.add(base);
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(width+0.5,0.6,depth+0.5), mats.concrete);
  parapet.position.y = 7.5; group.add(parapet);
  const unitW = width / count;
  for(let i=0;i<count;i++){
    const cx = -width/2 + unitW*(i+0.5);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(unitW*0.84, 4.1, 0.2), mats.frame);
    frame.position.set(cx, 2.45, depth/2 + 0.02); group.add(frame);
    const shutter = new THREE.Mesh(new THREE.PlaneGeometry(unitW*0.72, 3.3), mats.shutter);
    shutter.position.set(cx, 1.9, depth/2 + 0.13); group.add(shutter);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(unitW*0.74, 0.6, 0.18), new THREE.MeshStandardMaterial({color: i % 2 ? 0x5e4a36 : 0x4a555d, roughness:0.9}));
    sign.position.set(cx, 4.75, depth/2 + 0.12); group.add(sign);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(unitW*0.8, 0.14, 1.4), new THREE.MeshStandardMaterial({color:i % 2 ? 0x6a615a : 0x65635f, roughness:0.86}));
    awning.position.set(cx, 3.9, depth/2 + 0.7); awning.rotation.x = Math.PI/15; group.add(awning);
    if(i===1 || i===count-2){
      const note = new THREE.Mesh(new THREE.PlaneGeometry(0.55,0.78), new THREE.MeshStandardMaterial({color:0xf5e1bd, roughness:0.92}));
      note.position.set(cx - unitW*0.2, 2.0, depth/2 + 0.16); group.add(note);
      note.userData = {type:'note', title:'Scavenged Note', text:'No voices. No engines. The wind is the only thing left that still knows this street.'};
      interactive.push(note);
    }
  }
  if(collapsed){
    const tilt = new THREE.Mesh(new THREE.BoxGeometry(width*0.34, 4.5, depth*0.45), mats.wall);
    tilt.position.set(width*0.15, 3.1, depth*0.12); tilt.rotation.z = -0.28; tilt.rotation.x = 0.05; group.add(tilt);
    addRubblePile(x + width*0.2, z + depth*0.7, 1.15);
  }
  addSolidRect(x-width/2, x+width/2, z-depth/2, z+depth/2, 0.9);
}

function addTower(x,z,w,d,h,style=0){
  const group = new THREE.Group(); group.position.set(x,0,z); world.add(group);
  const podiumH = 10 + (style%3)*2;
  const podium = new THREE.Mesh(new THREE.BoxGeometry(w, podiumH, d), style%2 ? mats.brick : mats.wall);
  podium.position.y = podiumH/2; podium.castShadow = true; podium.receiveShadow = true; group.add(podium);

  const inset = 5 + style*1.5;
  const towerW = Math.max(10, w - inset);
  const towerD = Math.max(10, d - inset);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, h, towerD), mats.dark);
  tower.position.y = podiumH + h/2; tower.castShadow = true; tower.receiveShadow = true; group.add(tower);

  const crown = new THREE.Mesh(new THREE.BoxGeometry(towerW*0.78, 4 + style, towerD*0.78), mats.frame);
  crown.position.y = podiumH + h + 2 + style*0.5; crown.castShadow = true; group.add(crown);

  const roof1 = new THREE.Mesh(new THREE.BoxGeometry(5,2.5,5), mats.metal);
  roof1.position.set(0, podiumH + h + 4.5, 0); roof1.castShadow = true; group.add(roof1);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.12,6+style*1.5,8), mats.metal);
  antenna.position.set(style%2 ? 2 : -2, podiumH + h + 7 + style, style%2 ? -2 : 1); group.add(antenna);

  const windowMat = makeWindowMaterial(style);
  const windowW = towerW*0.96;
  const windowH = h*0.94;
  const panels = [
    [0, podiumH + h/2, towerD/2 + 0.06, 0, 0, 0],
    [0, podiumH + h/2, -towerD/2 - 0.06, 0, Math.PI, 0],
    [towerW/2 + 0.06, podiumH + h/2, 0, 0, -Math.PI/2, 0],
    [-towerW/2 - 0.06, podiumH + h/2, 0, 0, Math.PI/2, 0]
  ];
  for(const p of panels){
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(windowW, windowH), windowMat);
    pm.position.set(...p.slice(0,3)); pm.rotation.set(...p.slice(3)); group.add(pm);
  }

  for(let i=0;i<4;i++){
    const setback = new THREE.Mesh(new THREE.BoxGeometry(w*0.2, podiumH*0.55, d*0.14), mats.frame);
    setback.position.set((i<2?-1:1)*(w*0.33), podiumH*0.28, (i%2?-1:1)*(d*0.36));
    setback.castShadow = true; group.add(setback);
  }

  addSolidRect(x-w/2, x+w/2, z-d/2, z+d/2, 1.4);
  return group;
}

function addHeroDistrict(){
  addStorefrontRow(-78, 92, 78, 24, 4, mats.wall, true);
  addStorefrontRow(84, 102, 86, 24, 5, mats.brick, false);
  addStorefrontRow(-96, -66, 92, 24, 5, mats.brick, true);
  addStorefrontRow(102, -92, 82, 24, 4, mats.wall, false);

  addTower(-92, 14, 48, 46, 62, 1);
  addTower(94, -18, 52, 48, 74, 2);
  addTower(-160, -118, 64, 52, 90, 0);
  addTower(168, 116, 58, 48, 84, 3);
  addTower(-188, 142, 54, 44, 70, 2);
  addTower(206, -136, 46, 42, 66, 1);

  for(let i=0;i<12;i++){
    const tx = (i%2?1:-1) * (36 + (i%3)*38 + Math.random()*10);
    const tz = -310 + i*58;
    const carBody = new THREE.Mesh(new THREE.BoxGeometry(3.6,1.2,7.2), new THREE.MeshStandardMaterial({color: i%3?0x5a5a58:0x67382f, roughness:0.96, metalness:0.18}));
    carBody.position.set(tx,0.7,tz); carBody.rotation.y = i%2 ? 0 : Math.PI; carBody.castShadow = true; world.add(carBody);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.8,1.0,3.2), mats.glass);
    cabin.position.set(tx,1.45,tz+0.1); cabin.rotation.y = carBody.rotation.y; world.add(cabin);
    for(const wx of [-1.35,1.35]) for(const wz of [-2.2,2.2]){
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,0.36,14), mats.dark);
      wheel.rotation.z = Math.PI/2; wheel.position.set(tx+wx,0.45,tz+wz); world.add(wheel);
    }
    if(i%4===0) addRubblePile(tx+2.2, tz+1.6, 0.6);
  }

  addRubblePile(-28, 134, 1.5);
  addRubblePile(26, -98, 1.1);
  addRubblePile(58, 24, 0.9);
  addRubblePile(-52, -28, 0.8);
}

function addFarMass(){
  for(let ring=0; ring<3; ring++){
    const radius = 320 + ring*140;
    const count = 18 + ring*8;
    for(let i=0;i<count;i++){
      const ang = (i / count) * Math.PI * 2;
      const w = 32 + (i%5)*10;
      const d = 30 + (i%4)*8;
      const h = 70 + (i%7)*24 + ring*20;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({color: ring===0 ? 0x484c50 : 0x5a5e63, roughness:0.95, metalness:0.04}));
      tower.position.set(Math.cos(ang)*radius, h/2, Math.sin(ang)*radius);
      tower.receiveShadow = false;
      world.add(tower);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w*0.94,h*0.92), makeWindowMaterial(i+ring*5));
      face.position.set(tower.position.x, tower.position.y, tower.position.z + d/2 + 0.05);
      face.lookAt(camera.position.x, face.position.y, camera.position.z);
      world.add(face);
    }
  }
}

function addAtmosphere(){
  const dustGroup = new THREE.Group(); world.add(dustGroup);
  for(let i=0;i<85;i++){
    const mat = new THREE.SpriteMaterial({map:dustSprite, transparent:true, opacity:0.14 + Math.random()*0.1, depthWrite:false, color:0xcfc8bc});
    const sp = new THREE.Sprite(mat);
    sp.position.set((Math.random()-0.5)*700, 3 + Math.random()*55, (Math.random()-0.5)*700);
    const s = 4 + Math.random()*12;
    sp.scale.set(s,s,1);
    dustGroup.add(sp);
    dustPlanes.push(sp);
  }
  for(const p of [[-120,18,-80],[84,16,94],[140,20,-180],[-180,22,140]]){
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({map:smokeSprite, transparent:true, opacity:0.25, depthWrite:false, color:0x6c6c6c}));
    puff.position.set(p[0],p[1],p[2]);
    puff.scale.set(26,26,1);
    world.add(puff); smokePuffs.push(puff);
  }
}

function addLandmarks(){
  const civic = new THREE.Group(); civic.position.set(0,0,-155); world.add(civic);
  const base = new THREE.Mesh(new THREE.BoxGeometry(52,12,34), mats.concrete); base.position.y = 6; civic.add(base); base.castShadow = true; base.receiveShadow = true;
  const steps = new THREE.Mesh(new THREE.BoxGeometry(24,1.2,10), mats.concrete); steps.position.set(0,0.6,22); civic.add(steps);
  const columns = new THREE.BoxGeometry(2.6,9.2,2.6);
  for(let i=0;i<5;i++){
    const col = new THREE.Mesh(columns, mats.wall); col.position.set(-16 + i*8, 5, 15); civic.add(col);
  }
  const pediment = new THREE.Mesh(new THREE.BoxGeometry(26,2.3,8), mats.wall); pediment.position.set(0,10.8,15); civic.add(pediment);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(4.6,1.4), new THREE.MeshStandardMaterial({color:0xbda06e, roughness:0.7, metalness:0.45}));
  plaque.position.set(0,4.6,17.1); civic.add(plaque);
  plaque.userData = {type:'landmark', title:'Civic Hall', text:'Records say emergency power held here for six days after the blast. Every bulletin after that ends mid-sentence.'};
  interactive.push(plaque);
  addSolidRect(-26,26,-172,-138,1.4);

  const generator = new THREE.Group(); generator.position.set(-44,0,58); world.add(generator);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(5,4,4), mats.metal); housing.position.y = 2; generator.add(housing); housing.castShadow = true; housing.receiveShadow = true;
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(3.2,1.6), mats.shutter); grille.position.set(0,2.1,2.02); generator.add(grille);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.18,1.2,0.18), new THREE.MeshStandardMaterial({color:0xaa2323, roughness:0.5, metalness:0.7})); lever.position.set(1.8,2.5,2.1); generator.add(lever);
  housing.userData = {type:'generator', title:'Grid Relay', text:'The relay coughs awake. A few lamps hum. Somewhere overhead, a dead circuit finally remembers what electricity feels like.'};
  interactive.push(housing);
  addSolidRect(-46.5,-41.5,56,60,0.8);

  const gate = new THREE.Group(); gate.position.set(0,0,238); world.add(gate);
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(2.2,6,0.28), mats.shutter); doorL.position.set(-1.25,3,0); gate.add(doorL);
  const doorR = new THREE.Mesh(new THREE.BoxGeometry(2.2,6,0.28), mats.shutter); doorR.position.set(1.25,3,0); gate.add(doorR);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5.4,6.4,0.22), mats.frame); frame.position.set(0,3.2,-0.12); gate.add(frame);
  gate.userData = {type:'gate', title:'Service Gate', text:'The chain gives way. The maintenance passage beyond is still choked with dust and stale air.'};
  doorL.userData = gate.userData;
  doorR.userData = gate.userData;
  interactive.push(doorL, doorR);

  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(9,7,22), mats.dark); tunnel.position.set(0,3.5,262); world.add(tunnel); addSolidRect(-4.5,4.5,251,273,0.8);
  const arch = new THREE.Mesh(new THREE.PlaneGeometry(7,5), mats.shutter); arch.position.set(0,3.5,250.9); world.add(arch); interactive.push(arch);
  arch.userData = {type:'landmark', title:'Utility Tunnel', text:'The tunnel runs under the district. The air is cool, metallic, and old enough to feel preserved.'};
}

addStreetGrid();
addOverpass();
addStreetFurniture();
addHeroDistrict();
addLandmarks();
addFarMass();
addAtmosphere();

box(540, 2, 540, new THREE.MeshStandardMaterial({color:0x4b463f, roughness:1}), 0, -1.01, 0, 0,0,0, world).receiveShadow = true;

const loader = new GLTFLoader();
const truckText = document.getElementById('truckModel').textContent;
loader.parse(truckText, '', (gltf) => {
  const base = gltf.scene;
  base.traverse((obj) => {
    if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; }
  });
  const placements = [
    [-22,0,-112,Math.PI*0.04,1.25],
    [38,0,146,Math.PI*1.02,1.22],
    [118,0,-208,Math.PI*0.5,1.15]
  ];
  placements.forEach(([x,y,z,rot,scale], idx) => {
    const truck = base.clone(true);
    truck.position.set(x,y,z); truck.rotation.y = rot; truck.scale.setScalar(scale);
    truck.traverse(o=>{
      if(o.isMesh){
        o.material = o.material.clone();
        o.material.roughness = 0.92;
        o.material.metalness = 0.08;
        if(idx === 0) o.material.color.multiplyScalar(0.72);
      }
    });
    if(idx === 1){ truck.rotation.z = -0.05; }
    if(idx === 2){ truck.rotation.z = 0.03; }
    world.add(truck);
  });
}, (err) => console.warn('Truck asset parse failed', err));

const keys = Object.create(null);
let showPrompt = false;
let currentTarget = null;
let isReading = false;
let crouch = false;
let velocityY = 0;
let eyeHeight = 1.72;
const playerRadius = 0.75;

const raycaster = new THREE.Raycaster();
function setPrompt(text=''){
  subtle.textContent = text;
  subtle.style.opacity = text ? '1' : '0';
}
function openInspect(obj){
  const data = obj.userData || currentTarget?.userData;
  if (!data) return;
  inspectTitle.textContent = data.title || 'Observation';
  inspectBody.textContent = data.text || '';
  inspect.style.display = 'block';
  isReading = true;
  playInteract(data.type === 'generator' ? 90 : 140);
  if (data.type === 'generator') {
    lampMaterials.forEach((m,i) => m.emissiveIntensity = 0.8 + (i%3)*0.08);
  }
}
function closeInspect(){ inspect.style.display = 'none'; isReading = false; }

function collides(x,z){
  for(const r of solids){
    if(x > r.minX - (r.pad ?? playerRadius) && x < r.maxX + (r.pad ?? playerRadius) && z > r.minZ - (r.pad ?? playerRadius) && z < r.maxZ + (r.pad ?? playerRadius)) return true;
  }
  return false;
}

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyC') crouch = true;
  if (e.code === 'KeyE'){
    if (isReading) closeInspect();
    else if (currentTarget) openInspect(currentTarget);
  }
  if ((e.code === 'Space') && Math.abs(camera.position.y - eyeHeight) < 0.04) velocityY = 5.6;
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'KeyC') crouch = false; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

startBtn.addEventListener('click', async () => {
  ensureAudio();
  await audioCtx?.resume?.();
  controls.lock();
});
controls.addEventListener('lock', () => { overlay.style.display = 'none'; });
controls.addEventListener('unlock', () => { overlay.style.display = 'grid'; closeInspect(); });

const clock = new THREE.Clock();
const tmpVec = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
let lastTime = 0;

function updatePrompt(){
  raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
  const hits = raycaster.intersectObjects(interactive, false);
  currentTarget = null;
  if (hits.length && hits[0].distance < 4.2) {
    const obj = hits[0].object;
    currentTarget = obj;
    if (!isReading) setPrompt('Press E');
  } else if (!isReading) setPrompt('');
}

function updateMovement(dt){
  const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? 9.6 : 5.4;
  const moveZ = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const moveX = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  let moving = false;

  forward.set(0,0,-1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize();
  right.set(1,0,0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
  tmpVec.set(0,0,0);
  if (moveZ) tmpVec.addScaledVector(forward, moveZ);
  if (moveX) tmpVec.addScaledVector(right, moveX);
  if (tmpVec.lengthSq() > 0) {
    tmpVec.normalize().multiplyScalar(speed * dt);
    let nx = camera.position.x + tmpVec.x;
    let nz = camera.position.z + tmpVec.z;
    if (!collides(nx, camera.position.z) && Math.abs(nx) < 265) camera.position.x = nx;
    if (!collides(camera.position.x, nz) && nz > -410 && nz < 430) camera.position.z = nz;
    moving = true;
  }

  eyeHeight += (((crouch ? 1.18 : 1.72)) - eyeHeight) * Math.min(1, dt * 10);
  velocityY -= 12 * dt;
  camera.position.y += velocityY * dt;
  if (camera.position.y < eyeHeight) {
    camera.position.y = eyeHeight;
    velocityY = 0;
  }

  if (moving && controls.isLocked && !isReading) {
    const now = performance.now();
    const interval = speed > 8 ? 260 : 390;
    if (now - lastFootstep > interval && Math.abs(camera.position.y - eyeHeight) < 0.06) {
      playStep(speed > 8);
      lastFootstep = now;
    }
  }
}

function updateDayNight(t){
  const cycle = 0.5 + 0.5 * Math.sin(t * 0.02 - 0.9);
  const sky = new THREE.Color().setHSL(0.58, 0.08 + cycle*0.08, 0.24 + cycle*0.42);
  const fog = new THREE.Color().setHSL(0.58, 0.05 + cycle*0.06, 0.16 + cycle*0.34);
  scene.background.copy(sky);
  scene.fog.color.copy(fog);
  hemi.intensity = 0.45 + cycle * 1.1;
  hemi.color.setHSL(0.56, 0.15, 0.64 + cycle*0.1);
  hemi.groundColor.setHSL(0.08, 0.15, 0.12 + cycle*0.1);
  sun.intensity = 0.1 + cycle * 1.65;
  const ang = t * 0.03;
  sun.position.set(Math.cos(ang) * 180, 80 + cycle*180, Math.sin(ang) * 120);
  sun.color.setHSL(0.1, 0.35, 0.65 + cycle*0.15);
  renderer.toneMappingExposure = 0.78 + cycle*0.5;
  litWindowMats.forEach((m,i)=>m.emissiveIntensity = 0.12 + (1-cycle)*(0.9 + (i%4)*0.07));
  lampMaterials.forEach((m,i)=>m.emissiveIntensity = Math.max(m.emissiveIntensity, 0.12 + (1-cycle) * (0.8 + (i%3)*0.05)));
  if (audioCtx && windNodes.length) {
    windNodes[0].gain.gain.value = 0.04 + (1-cycle)*0.03;
    windNodes[1].gain.gain.value = 0.02 + (1-cycle)*0.015;
    musicNodes.forEach((node,idx)=> node.gain.gain.value = (idx===1?0.008:0.005) + (1-cycle)*0.002);
  }
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  if (controls.isLocked && !isReading) updateMovement(dt);
  updatePrompt();
  updateDayNight(t);

  dustPlanes.forEach((sp, i) => {
    sp.position.x += Math.sin(t*0.14 + i) * 0.004;
    sp.position.z += Math.cos(t*0.11 + i*0.7) * 0.006;
    sp.material.opacity = 0.06 + 0.08 * (0.5 + 0.5*Math.sin(t*0.22 + i));
  });
  smokePuffs.forEach((sp, i) => {
    sp.position.y += Math.sin(t*0.18 + i) * 0.01;
    const s = 24 + Math.sin(t*0.16 + i) * 2.5;
    sp.scale.set(s,s,1);
    sp.material.opacity = 0.16 + 0.1*(0.5 + 0.5*Math.sin(t*0.13 + i));
  });

  renderer.render(scene, camera);
}
animate();
