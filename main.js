import * as THREE from 'three';
import { gsap } from 'gsap';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
document.body.appendChild(renderer.domElement);

const loader = new GLTFLoader();

let blackHole;
let blackHoleposition;
loader.load('./data/scene.gltf', function (gltf) 
{
    //gltf.scene.scale.set(0.001, 0.001, 0.001);
    gltf.scene.position.set(0, 0, 0);
    const root = gltf.scene;
    scene.add(root);
    blackHole = root.getObjectByName('BlackHole')
    blackHoleposition = blackHole.position;
}, undefined, function (error) {
    console.error(error);
});


const geometry = new THREE.BoxGeometry(1, 1, 1);
const material1 = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const material2 = new THREE.MeshBasicMaterial({ color: 0x0000ff });

const cube1 = new THREE.Mesh(geometry, material1);
const cube2 = new THREE.Mesh(geometry, material2);

cube2.position.y = -5; // 第二個 cube 放在下面

scene.add(cube1);
scene.add(cube2);

camera.position.set(5, 2, 0);
let angle = 0;
let radius = 5;
let targetRadius = 5;
let height = .1;
let position = cube1.position; // x=0, y=0, z=0

let isDragging = false;
let previousMouseX = 0;
let previousMouseY = 0;

let dragDeltaX = 0; // 水平拖動累計角度（Y 軸旋轉）
let dragDeltaY = 0; // 垂直拖動累計角度（X 軸旋轉）

const maxVerticalAngle = Math.PI / 2 - 0.1; // 限制上下角度，避免翻轉

// === 🎯 監聽滑鼠滾輪 ===
window.addEventListener('wheel', (event) => {
    // deltaY > 0 = 向下滾（拉遠），< 0 = 向上滾（拉近）
    if (event.deltaY > 0)
    {
        targetRadius += 0.1; // 滾輪往下：拉遠
    }
    else
    {
        targetRadius -= 0.1; // 滾輪往上：拉近
    }
    
    // 限制相機距離範圍
    targetRadius = Math.min(Math.max(targetRadius, 0), 12);
});

// 按下滑鼠
window.addEventListener('mousedown', (event) => {
    isDragging = true;
    previousMouseX = event.clientX;
});

// 放開滑鼠
window.addEventListener('mouseup', () => {
    isDragging = false;
});

// 滑鼠移動
window.addEventListener('mousemove', (event) => {
    if (!isDragging) return;

    const deltaX = event.clientX - previousMouseX;
    const deltaY = event.clientY - previousMouseY;

    previousMouseX = event.clientX;
    previousMouseY = event.clientY;

    dragDeltaX += deltaX * 0.01; // 水平旋轉靈敏度
    dragDeltaY += deltaY * 0.01; // 垂直旋轉靈敏度

    // 限制垂直旋轉角度
    dragDeltaY = Math.max(-maxVerticalAngle, Math.min(maxVerticalAngle, dragDeltaY));
});

function animate() {
    // 自動旋轉角度
    angle += 0.01;

    // 將拖動累加角度加入旋轉
    const totalAngleX = dragDeltaX;         // Y 軸旋轉
    const totalAngleY = dragDeltaY;         // X 軸旋轉

    // 平滑插值鏡頭距離
    radius += (targetRadius - radius) * 0.1;

    camera.position.x = Math.cos(totalAngleX) * Math.cos(totalAngleY) * radius;
    camera.position.y = Math.sin(totalAngleY) * radius;
    camera.position.z = Math.sin(totalAngleX) * Math.cos(totalAngleY) * radius;

    camera.lookAt(position);

    renderer.render(scene, camera);
}
