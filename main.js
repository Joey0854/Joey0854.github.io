// =============================================
// StarFieldScene：模組化星空動畫場景
// 使用 BufferGeometry + GSAP Timeline + lil-gui
// =============================================
import * as THREE from 'three';
import { gsap } from 'gsap';
import GUI from 'lil-gui';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// =============================================
// 星場系統 Class
// =============================================
export class StarFieldScene {

    constructor() {
        this.params = {
            starCount: 3600,
            radius: 500,
            sizeMin: 0.4,
            sizeMax: 0.7,
            flickerAmt: 0.001,
            flickerFreq: 0.001,
            velocityMin: -0.01,
            velocityMax:  0.01,
            minGoDist: 50,

            fovOriginal: 85,
            fovTarget: 170,
            fovTime: 1.2,

            camMoveTime: 2.4,
            camRotateTime: 1.5,
            camRotateEase: "power1.in",

            bloomInit: 0.25,
            bloomTarget: 10.0,
            bloomTime: 2.5,

            enlargeScale: 5.0,
            fadeToBlackTime: 2.2,

            goFrontAngleDeg: 70,
        };

        this.whiteout = false;
        this.lastTargetStar = null;

        this.initThree();
        this.createStars();
        this.setupGUI();
        this.startRenderLoop();
    }

    // =============================================
    // 初始化 THREE 基本系統
    // =============================================
    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        this.camera = new THREE.PerspectiveCamera(
            this.params.fovOriginal,
            window.innerWidth / window.innerHeight,
            0.1, 1000
        );
        this.camera.position.set(0, 0, 30);

        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            this.params.bloomInit, 0.8, 0.4
        );
        this.composer.addPass(this.bloomPass);

        window.addEventListener("resize", () => this.onResize());
    }

    // =============================================
    // 建立星星 (BufferGeometry)
    // =============================================
    createStars() {
        const p = this.params;
        const positions = [];
        const sizes = [];
        const colors = [];
        const emissivePower = [];

        const tempColor = new THREE.Color();

        this.starVel = [];

        for (let i = 0; i < p.starCount; i++) {

            // ----- 亂數位置：球體分布 -----
            const u = Math.random();
            const r = p.radius * Math.cbrt(u);
            const costheta = Math.random() * 2 - 1;
            const theta = Math.acos(costheta);
            const phi = Math.random() * 2 * Math.PI;

            const x = r * Math.sin(theta) * Math.cos(phi);
            const y = r * Math.sin(theta) * Math.sin(phi);
            const z = r * Math.cos(theta);

            positions.push(x, y, z);

            // ----- 亂數顏色 -----
            tempColor.setRGB(
                Math.random() * 0.35 + 0.65,
                Math.random() * 0.35 + 0.65,
                Math.random() * 0.55 + 0.45
            );
            colors.push(tempColor.r, tempColor.g, tempColor.b);

            // ----- 大小 -----
            sizes.push(Math.random() * (p.sizeMax - p.sizeMin) + p.sizeMin);

            // ----- 發光強度 -----
            emissivePower.push(Math.random() * 0.8 + 0.4);

            // ----- 每顆星星的速度 -----
            this.starVel.push({
                x: Math.random() * (p.velocityMax - p.velocityMin) + p.velocityMin,
                y: Math.random() * (p.velocityMax - p.velocityMin) + p.velocityMin,
                z: Math.random() * (p.velocityMax - p.velocityMin) + p.velocityMin,
            });
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        geo.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
        geo.setAttribute("emissive", new THREE.Float32BufferAttribute(emissivePower, 1));

        const mat = new THREE.PointsMaterial({
            vertexColors: true,
            size: 1.5,
            transparent: true,
            opacity: 1.0,
            sizeAttenuation: true
        });

        this.stars = new THREE.Points(geo, mat);
        this.scene.add(this.stars);
    }

    // =============================================
    // lil-gui 設定
    // =============================================
    setupGUI() {
        const gui = new GUI();

        gui.add(this.bloomPass, "strength", 0, 20).name("Bloom 強度");
        gui.add(this.camera, "fov", 30, 170).name("Camera FOV").onChange(() => {
            this.camera.updateProjectionMatrix();
        });
    }

    // =============================================
    // 點擊後執行：飛向前方某顆星
    // 使用 GSAP Timeline 管理動畫
    // =============================================
    gotoFrontStar() {
        const tl = gsap.timeline();

        const p = this.params;

        // === 選擇前方的星星 ===
        const camPos = new THREE.Vector3(0, 0, 30);
        const camDir = new THREE.Vector3(0, 0, -1).normalize();
        const angleMax = THREE.MathUtils.degToRad(p.goFrontAngleDeg);

        const pos = this.stars.geometry.getAttribute("position");
        const candidates = [];

        for (let i = 0; i < p.starCount; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            const starPos = new THREE.Vector3(x, y, z);

            const toStar = starPos.clone().sub(camPos).normalize();
            const dist = starPos.distanceTo(camPos);
            const angle = Math.acos(toStar.dot(camDir));

            if (dist > p.minGoDist && angle < angleMax)
                candidates.push(starPos);
        }

        if (candidates.length === 0) return;

        const target = candidates[Math.floor(Math.random() * candidates.length)];
        this.lastTargetStar = target.clone();

        // === 動畫：看向那顆星 ===
        tl.to(this.camera.rotation, {
            x: 0, y: 0, z: 0,
            duration: p.camRotateTime,
            ease: p.camRotateEase
        });

        // === 動畫：FOV 擴張 ===
        tl.to(this.camera, {
            fov: p.fovTarget,
            duration: p.fovTime,
            onUpdate: () => this.camera.updateProjectionMatrix()
        });

        // === 動畫：移動到星星前方 ===
        const mid = target.clone().addScaledVector(
            target.clone().sub(this.camera.position).normalize(), -3
        );

        tl.to(this.camera.position, {
            x: mid.x, y: mid.y, z: mid.z,
            duration: p.camMoveTime,
            onUpdate: () => this.camera.lookAt(target)
        });

        // === FOV 收回 ===
        tl.to(this.camera, {
            fov: p.fovOriginal,
            duration: p.fovTime,
            onUpdate: () => this.camera.updateProjectionMatrix()
        });

        // === Bloom + 星星放大 ===
        tl.to(this.bloomPass, {
            strength: p.bloomTarget,
            duration: p.bloomTime
        }, "-=1.2");

        tl.to(this.stars.scale, {
            x: p.enlargeScale,
            y: p.enlargeScale,
            z: p.enlargeScale,
            duration: p.bloomTime
        }, "<");

        // === 最後：白→黑過場 ===
        tl.add(() => this.fadeWhiteToBlack());
    }

    // =============================================
    // 白 → 黑
    // =============================================
    fadeWhiteToBlack() {
        const tl = gsap.timeline();

        this.whiteout = true;
        this.scene.background = new THREE.Color(1, 1, 1);

        const v = { t: 1 };

        tl.to(v, {
            t: 0,
            duration: this.params.fadeToBlackTime,
            ease: "power1.inOut",
            onUpdate: () => {
                this.scene.background.setRGB(v.t, v.t, v.t);
            }
        });
    }

    // =============================================
    // 重新回到初始位置
    // =============================================
    returnToInit() {
        if (!this.lastTargetStar) return;

        const tl = gsap.timeline();

        const p = this.params;

        // Bloom 收回
        tl.to(this.bloomPass, {
            strength: p.bloomInit,
            duration: p.bloomTime
        });

        // 回到原點相機
        tl.to(this.camera.position, {
            x: 0, y: 0, z: 30,
            duration: p.camMoveTime
        });

        // 恢復看向中心
        tl.to(this.camera.rotation, {
            x: 0, y: 0, z: 0,
            duration: p.camRotateTime
        });

        // 星星縮回
        tl.to(this.stars.scale, {
            x: 1, y: 1, z: 1,
            duration: 1.0
        });
    }

    // =============================================
    // 視窗 Resize
    // =============================================
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    // =============================================
    // Render Loop
    // =============================================
    startRenderLoop() {
        const p = this.params;

        const pos = this.stars.geometry.getAttribute("position");

        const render = () => {
            if (!this.whiteout) {

                // 星星閃爍 + 移動
                const now = Date.now() * p.flickerFreq;

                for (let i = 0; i < p.starCount; i++) {
                    const vx = this.starVel[i].x;
                    const vy = this.starVel[i].y;
                    const vz = this.starVel[i].z;

                    pos.array[i*3]     += vx;
                    pos.array[i*3 + 1] += vy;
                    pos.array[i*3 + 2] += vz;
                }

                pos.needsUpdate = true;
            }

            this.composer.render();
            requestAnimationFrame(render);
        };

        render();
    }
}