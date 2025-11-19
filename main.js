import * as THREE from 'three';
import { gsap } from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ===== 可調參數 =====
const STAR_COUNT             = 3600;
const STAR_RADIUS            = 500;
const STAR_RADIUS_MIN        = 0.4;
const STAR_RADIUS_MAX        = 0.7;
const STAR_FLICKER_AMT       = 0.001;
const STAR_FLICKER_FREQ      = 0.001;
const STAR_VEL_MIN           = -0.01;
const STAR_VEL_MAX           =  0.01;
const GO_DIST_MIN            = 50;
const CAM_MOVE_TIME          = 2.4;
const CAM_ROTATE_TIME        = 1.5;
const CAM_ROTATE_EASE        = 'power1.in';
const FOV_ORIGINAL           = 85;
const FOV_TARGET             = 170;
const FOV_ANIMATE_TIME       = 1.2;
const FOV_START_MOVE_PCT     = 0.0;
const MOVE_START_FOV_REVERT_PCT = 0.8;
const CAMERA_INIT_POS        = new THREE.Vector3(0, 0, 30);
const CAMERA_INIT_LOOK       = new THREE.Vector3(0, 0, 0);
const GO_FRONT_DEG           = 70;
const BLOOM_STRENGTH_INIT    = 0.25;
const BLOOM_STRENGTH_TARGET  = 10.0;
const BLOOM_ANIMATE_TIME     = 2.5;
// 星星最大放大倍數
const STAR_ENLARGE_SCALE     = 5.0;
// 淡出黑秒數
const FADE_TO_BLACK_TIME     = 2.2;

let whiteout = false;

const scene   = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera  = new THREE.PerspectiveCamera(
    FOV_ORIGINAL,
    window.innerWidth / window.innerHeight,
    0.1, 1000
);
camera.position.copy(CAMERA_INIT_POS);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    BLOOM_STRENGTH_INIT, 0.8, 0.4
);
composer.addPass(bloomPass);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

const balls = [];
const velocityArr = [];
for (let i = 0; i < STAR_COUNT; i++) {
    const radius = Math.random() * (STAR_RADIUS_MAX - STAR_RADIUS_MIN) + STAR_RADIUS_MIN;
    const color = new THREE.Color(
        Math.random() * 0.35 + 0.65,
        Math.random() * 0.35 + 0.65,
        Math.random() * 0.55 + 0.45
    );
    const material = new THREE.MeshPhongMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: Math.random() * 0.8 + 0.4,
        shininess: 100
    });
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const ball = new THREE.Mesh(geometry, material);

    const u = Math.random();
    const r = STAR_RADIUS * Math.cbrt(u);
    const costheta = Math.random() * 2 - 1;
    const theta = Math.acos(costheta);
    const phi = Math.random() * 2 * Math.PI;

    ball.position.x = r * Math.sin(theta) * Math.cos(phi);
    ball.position.y = r * Math.sin(theta) * Math.sin(phi);
    ball.position.z = r * Math.cos(theta);

    balls.push(ball);
    scene.add(ball);

    velocityArr.push({
        x: Math.random() * (STAR_VEL_MAX - STAR_VEL_MIN) + STAR_VEL_MIN,
        y: Math.random() * (STAR_VEL_MAX - STAR_VEL_MIN) + STAR_VEL_MIN,
        z: Math.random() * (STAR_VEL_MAX - STAR_VEL_MIN) + STAR_VEL_MIN
    });
}

scene.add(new THREE.AmbientLight(0x222244, 1));
const pointLight = new THREE.PointLight(0xffffff, 0.7);
pointLight.position.set(0, 0, 50);
scene.add(pointLight);

let starsAnimating = true;
let animateId = null;
function animate() {
    if (whiteout) return;
    if (starsAnimating) {
        balls.forEach((ball, i) => {
            ball.material.emissiveIntensity += Math.sin(Date.now()*STAR_FLICKER_FREQ + i) * STAR_FLICKER_AMT;
            ball.position.x += velocityArr[i].x;
            ball.position.y += velocityArr[i].y;
            ball.position.z += velocityArr[i].z;
        });
    }
    composer.render();
    animateId = requestAnimationFrame(animate);
}
animate();

const buttonGoto = document.createElement('button');
buttonGoto.innerText = '前往遠距星星(動畫分段)';
buttonGoto.onclick = gotoFrontFarStar;
styleButton(buttonGoto, 16, 20);
document.body.appendChild(buttonGoto);

const buttonBack = document.createElement('button');
buttonBack.innerText = '返回初始位置';
buttonBack.onclick = returnToInit;
styleButton(buttonBack, 60, 20);
document.body.appendChild(buttonBack);

let lastTargetStar = null;
function gotoFrontFarStar() {
    starsAnimating = false;
    let camDir = new THREE.Vector3().subVectors(CAMERA_INIT_LOOK, CAMERA_INIT_POS).normalize();
    const maxAngleRad = THREE.MathUtils.degToRad(GO_FRONT_DEG);

    const candidates = balls.filter(ball => {
        const toStar = new THREE.Vector3().subVectors(ball.position, CAMERA_INIT_POS).normalize();
        const dist = ball.position.distanceTo(CAMERA_INIT_POS);
        const dot = toStar.dot(camDir);
        const angle = Math.acos(dot);
        return dist > GO_DIST_MIN && angle < maxAngleRad;
    });

    if (candidates.length === 0) return;

    const star = candidates[Math.floor(Math.random() * candidates.length)];
    lastTargetStar = star;
    const starPos = star.position.clone();

    const startLook = CAMERA_INIT_LOOK.clone();
    let lookTarget = startLook.clone();
    gsap.to(lookTarget, {
        x: starPos.x, y: starPos.y, z: starPos.z,
        duration: CAM_ROTATE_TIME,
        ease: CAM_ROTATE_EASE,
        onUpdate: () => {
            camera.lookAt(lookTarget);
            composer.render();
        },
        onComplete: () => {
            let moveStarted = false, fovRevertStarted = false;
            const direction = new THREE.Vector3().subVectors(starPos, camera.position).normalize();
            const midTargetPos = starPos.clone().addScaledVector(direction, -3);

            gsap.to(camera, {
                fov: FOV_TARGET,
                duration: FOV_ANIMATE_TIME,
                onUpdate: function() {
                    camera.updateProjectionMatrix();
                    composer.render();
                    const t = this.progress();
                    if (!moveStarted && t >= FOV_START_MOVE_PCT) {
                        moveStarted = true;

                        // 前進到距離3
                        gsap.to(camera.position, {
                            x: midTargetPos.x,
                            y: midTargetPos.y,
                            z: midTargetPos.z,
                            duration: CAM_MOVE_TIME,
                            onUpdate: function() {
                                camera.lookAt(starPos);
                                composer.render();
                                const t2 = this.progress();
                                if (!fovRevertStarted && t2 >= MOVE_START_FOV_REVERT_PCT) {
                                    fovRevertStarted = true;
                                    gsap.to(camera, {
                                        fov: FOV_ORIGINAL,
                                        duration: FOV_ANIMATE_TIME,
                                        onUpdate: () => {
                                            camera.updateProjectionMatrix();
                                            composer.render();
                                        },
                                        onComplete: () => {
                                            // ======= bloom和星星放大同步 =======
                                            gsap.to(bloomPass, {
                                                strength: BLOOM_STRENGTH_TARGET,
                                                duration: BLOOM_ANIMATE_TIME,
                                                ease: "power1.out",
                                                onUpdate: () => composer.render()
                                            });
                                            // 放大 star 尺寸
                                            gsap.to(star.scale, {
                                                x: STAR_ENLARGE_SCALE,
                                                y: STAR_ENLARGE_SCALE,
                                                z: STAR_ENLARGE_SCALE,
                                                duration: BLOOM_ANIMATE_TIME,
                                                ease: "power1.out",
                                                onUpdate: () => composer.render(),
                                                onComplete: () => {
                                                    switchToWhiteThenFadeBlack();
                                                }
                                            });
                                        }
                                    });
                                }
                            }
                        });
                    }
                }
            });
        }
    });
}

// ====== 白→黑過場 ======
function switchToWhiteThenFadeBlack() {
    whiteout = true;
    if (animateId) cancelAnimationFrame(animateId);
    while (scene.children.length) scene.remove(scene.children[0]);
    scene.background = new THREE.Color(0xffffff);
    camera.fov = FOV_ORIGINAL;
    camera.updateProjectionMatrix();
    renderer.setClearColor(0xffffff);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    composer.passes.length = 0;
    renderer.render(scene, camera);

    // GSAP：全白到全黑過場
    let v = { t: 1 };
    gsap.to(v, {
        t: 0,
        duration: FADE_TO_BLACK_TIME,
        ease: 'power1.inOut',
        onUpdate: () => {
            scene.background.setRGB(v.t, v.t, v.t);
            renderer.setClearColor(scene.background);
            renderer.clear(true, true, true);
            renderer.render(scene, camera);
        }
    });
}

function returnToInit() {
    if (!lastTargetStar) return;
    whiteout = false;
    starsAnimating = false;
    const starPos = lastTargetStar.position.clone();

    gsap.to(bloomPass, {
        strength: BLOOM_STRENGTH_INIT,
        duration: BLOOM_ANIMATE_TIME,
        ease: "power1.inOut",
        onUpdate: () => composer.render()
    });

    gsap.to(camera.position, {
        x: CAMERA_INIT_POS.x,
        y: CAMERA_INIT_POS.y,
        z: CAMERA_INIT_POS.z,
        duration: CAM_MOVE_TIME,
        onUpdate: () => {
            camera.lookAt(starPos);
            composer.render();
        },
        onComplete: () => {
            // 星星縮小回原始
            if (lastTargetStar) lastTargetStar.scale.set(1, 1, 1);

            let lookTarget = starPos.clone();
            gsap.to(lookTarget, {
                x: CAMERA_INIT_LOOK.x,
                y: CAMERA_INIT_LOOK.y,
                z: CAMERA_INIT_LOOK.z,
                duration: CAM_ROTATE_TIME,
                onUpdate: () => {
                    camera.lookAt(lookTarget);
                    composer.render();
                },
                onComplete: () => {
                    starsAnimating = true;
                    whiteout = false;
                    animate();
                }
            });
        }
    });
}

function styleButton(button, topPx, rightPx) {
    button.style.position = 'fixed';
    button.style.top = `${topPx}px`;
    button.style.right = `${rightPx}px`;
    button.style.zIndex = '10';
    button.style.background = '#222';
    button.style.color = '#fff';
    button.style.padding = '8px 18px';
    button.style.border = 'none';
    button.style.borderRadius = '8px';
    button.style.fontSize = '16px';
    button.style.boxShadow = '0 2px 10px #0005';
    button.style.cursor = 'pointer';
}
