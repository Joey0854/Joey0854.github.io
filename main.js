import * as THREE from 'three';
import { gsap } from 'gsap';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// ─── 工具：建立圓形星星貼圖 ─────────────────────────────────────────────────
function makeStarTexture(size = 64) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0,   'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
}

// ─── 工具：根據星星位置生成偽隨機星體資料 ──────────────────────────────────
function seededRng(seed) {
    let s = Math.abs(seed) % 233280 || 1;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function generateStarData(pos, labelIdx) {
    const rng   = seededRng(pos.x * 73 + pos.y * 37 + pos.z * 19);
    const TYPES = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];
    const TEMPS = [[30000,50000],[10000,30000],[7500,10000],
                   [6000,7500],[5200,6000],[3700,5200],[2400,3700]];
    const ti    = Math.floor(rng() * 7);
    const temp  = Math.floor(rng() * (TEMPS[ti][1] - TEMPS[ti][0]) + TEMPS[ti][0]);
    const raH   = Math.floor(rng() * 24);
    const raM   = Math.floor(rng() * 60);
    const decD  = Math.floor(rng() * 180) - 90;
    const decM  = Math.floor(rng() * 60);
    return {
        id:       `STAR-${String(labelIdx + 1).padStart(3, '0')}`,
        // 面板一：恆星分類
        type:     TYPES[ti] + Math.floor(rng() * 10) + 'V',
        dist:     (rng() * 890 + 10).toFixed(1) + ' ly',
        temp:     temp.toLocaleString() + ' K',
        // 面板二：物理資料
        mass:     (rng() * 39 + 0.1).toFixed(2)  + ' M☉',
        lum:      (rng() * 99 + 0.01).toFixed(2) + ' L☉',
        age:      (rng() * 11 + 0.5).toFixed(1)  + ' Gyr',
        // 面板三：座標資料
        ra:       `${raH}h ${raM}m`,
        dec:      `${decD < 0 ? '' : '+'}${decD}° ${decM}'`,
        parallax: (rng() * 0.77 + 0.01).toFixed(3) + ' mas',
    };
}

// 面板定義：全部在星星右側，垂直均勻分布
// offsetX/offsetY 相對於星星螢幕座標；lineAnchorY 為連線連接到面板左緣的垂直偏移
const PANEL_DEFS = [
    {
        title:        'STELLAR CLASS',
        rows:         d => [['TYPE', d.type], ['DIST', d.dist], ['TEMP', d.temp]],
        offsetX:      +160, offsetY: -110,
    },
    {
        title:        'PHYSICAL DATA',
        rows:         d => [['MASS', d.mass], ['LUM', d.lum], ['AGE', d.age]],
        offsetX:      +160, offsetY: +50,
    },
    {
        title:        'COORDINATES',
        rows:         d => [['RA', d.ra], ['DEC', d.dec], ['PLX', d.parallax]],
        offsetX:      +160, offsetY: +210,
    },
];

// ─── 可公開調整的全域參數 ────────────────────────────────────────────────────
const PARAMS = {
    // 星星場
    starCount:        5000,   // 星星總數
    radius:           500,    // 星球分布半徑
    driftSpeed:       0.012,  // 星星漂移速度

    // 選項框（2D 標籤）
    labelCount:       5,      // 顯示幾個可點擊的星星標籤
    labelOffsetX:     14,     // 標籤距星星的水平偏移 (px)
    labelFontSize:    22,     // 字體大小 (px)
    labelPaddingV:    10,      // 垂直內距 (px)
    labelPaddingH:    20,     // 水平內距 (px)
    labelBgAlpha:     0.5,    // 標籤背景透明度
    labelBorderAlpha: 0.6,    // 標籤邊框透明度

    // 相機飛行
    fovDefault:       75,     // 預設視野角
    fovWarp:          130,    // 飛行時最大視野角（速度感）
    fovWarpTime:      0.75,    // FOV 變化時間 (秒)
    flyTime:          2.6,    // 飛行移動時間 (秒)
    stopDist:         10,      // 停在星星前方的距離
    coneDeg:          55,     // 隨機選目標星星的視錐角度
    minDist:          40,     // 最短可選目標距離

    // Bloom 光暈
    bloomDefault:     0.35,   // 預設光暈強度
    bloomPeak:        6.0,    // 抵達星星時最大光暈強度
    bloomTime:        2.2,    // 光暈增強時間 (秒)

    // 白閃過場
    flashTime:        0.4,    // 閃白持續時間 (秒)
    fadeTime:         1.4,    // 淡回黑色時間 (秒)

    // 資訊面板
    infoPanelCount:       3,      // 同時顯示幾個資訊面板（1–3）
    infoPanelWidth:       260,    // 每個面板寬度 (px)
    infoPanelFontSize:    18,     // 面板內文字大小 (px)
    infoPanelBgAlpha:     0.82,   // 面板背景透明度
    infoPanelBorderAlpha: 0.5,    // 面板邊框透明度
    infoPanelFadeIn:      0.6,    // 淡入時間 (秒)

    // 心智圖連線
    mindMapBranchDist:    80,                      // 星星到分支點的水平距離 (px)
    mindMapLineColor:     'rgba(255,255,255,0.45)', // 連線顏色
    mindMapLineWidth:     1,                        // 連線粗細 (px)

    // 瞄準環
    reticleOuterSize:     110,    // 外環直徑 (px)
    reticleInnerSize:     60,     // 內環直徑 (px)

    // 星球 3D 球體（GLSL 材質入口）
    planetRadius:         6,      // 星球半徑（Three.js 單位）
    planetSegments:       128,    // 幾何細分精度
    // GLSL uniform 初始值（可在 _initPlanet 的 ShaderMaterial 中擴充）
    planetColor1:         [0.08, 0.22, 0.55],   // 主色（deep blue）
    planetColor2:         [0.18, 0.45, 0.30],   // 次色（ocean green）
    atmosphereColor:      [0.25, 0.60, 1.00],   // 大氣光暈顏色
    atmosphereIntensity:  1.8,                   // 大氣強度

    // 左側控制選單（可自訂數量、文字、行為）
    menuItems: [
        { key: 'CLICK',  label: 'SELECT STAR',  action: 'fly'  },
        { key: 'ENTER',  label: 'SCAN DETAILS', action: 'scan' },
        { key: 'ESC',    label: 'RETURN',        action: 'back' },
    ],
    menuFontSize:         16,     // 選單文字大小 (px)
    menuLineHeight:       2.4,    // 行距倍數
    menuIndicatorWidth:   3,      // 游標指示條寬度 (px)

    // 返回動畫
    flyBackTime:          2.2,    // 返回飛行時間 (秒)
};

// ─── 注入全域 CSS ────────────────────────────────────────────────────────────
const style = document.createElement('style');
style.textContent = `
* { box-sizing: border-box; }

/* 星星選項框 */
.star-label {
    position: fixed;
    pointer-events: auto;
    cursor: pointer;
    border: 1px solid rgba(255,255,255,${PARAMS.labelBorderAlpha});
    background: rgba(255,255,255,${PARAMS.labelBgAlpha});
    color: rgba(0,0,0,0.85);
    font: 600 ${PARAMS.labelFontSize}px/1 'Courier New', monospace;
    letter-spacing: 0.08em;
    padding: ${PARAMS.labelPaddingV}px ${PARAMS.labelPaddingH}px;
    border-radius: 3px;
    transform: translate(${PARAMS.labelOffsetX}px, -50%);
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
    user-select: none;
}
.star-label::before {
    content: '';
    position: absolute;
    right: 100%;
    top: 50%;
    width: ${PARAMS.labelOffsetX - 4}px;
    height: 1px;
    background: rgba(255,255,255,0.6);
}
.star-label:hover {
    background: rgba(255,255,255,0.75);
    color: #000;
}

/* ── 資訊面板容器（固定覆蓋全螢幕） ── */
#star-hud {
    position: fixed;
    inset: 0;
    pointer-events: none;
    display: none;
}
#star-hud.visible {
    display: block;
}

/* ── 瞄準環（以星星螢幕位置為中心） ── */
.reticle {
    position: absolute;
    transform: translate(-50%, -50%);
}
.reticle .ring {
    position: absolute;
    border-radius: 50%;
    top: 50%; left: 50%;
}
.reticle .ring-outer {
    width: ${PARAMS.reticleOuterSize}px; height: ${PARAMS.reticleOuterSize}px;
    margin: ${-PARAMS.reticleOuterSize/2}px 0 0 ${-PARAMS.reticleOuterSize/2}px;
    border: 1px dashed rgba(120,210,255,0.55);
    animation: spinCW 10s linear infinite;
}
.reticle .ring-inner {
    width: ${PARAMS.reticleInnerSize}px; height: ${PARAMS.reticleInnerSize}px;
    margin: ${-PARAMS.reticleInnerSize/2}px 0 0 ${-PARAMS.reticleInnerSize/2}px;
    border: 1px solid rgba(120,210,255,0.35);
    animation: spinCCW 5s linear infinite;
}
/* 四個角標記（以外環半徑定位） */
.reticle .corner {
    position: absolute;
    width: 10px; height: 10px;
    border-color: rgba(120,210,255,0.8);
    border-style: solid;
}
.reticle .corner.tl { top:${-PARAMS.reticleOuterSize/2}px; left:${-PARAMS.reticleOuterSize/2}px; border-width: 1px 0 0 1px; }
.reticle .corner.tr { top:${-PARAMS.reticleOuterSize/2}px; right:${-PARAMS.reticleOuterSize/2}px; border-width: 1px 1px 0 0; }
.reticle .corner.bl { bottom:${-PARAMS.reticleOuterSize/2}px; left:${-PARAMS.reticleOuterSize/2}px; border-width: 0 0 1px 1px; }
.reticle .corner.br { bottom:${-PARAMS.reticleOuterSize/2}px; right:${-PARAMS.reticleOuterSize/2}px; border-width: 0 1px 1px 0; }

@keyframes spinCW  { to { transform: rotate(360deg);  } }
@keyframes spinCCW { to { transform: rotate(-360deg); } }

/* ── 資訊面板 ── */
.info-panel {
    position: absolute;
    pointer-events: auto;
    width: ${PARAMS.infoPanelWidth}px;
    border: 1px solid rgba(120,210,255,${PARAMS.infoPanelBorderAlpha});
    background: rgba(5,12,30,${PARAMS.infoPanelBgAlpha});
    color: rgba(160,220,255,0.9);
    font: ${PARAMS.infoPanelFontSize}px/1.6 'Courier New', monospace;
    letter-spacing: 0.06em;
    backdrop-filter: blur(4px);
    overflow: hidden;
}
/* 角標裝飾 */
.info-panel::before, .info-panel::after {
    content: '';
    position: absolute;
    width: 8px; height: 8px;
    border-color: rgba(120,210,255,0.9);
    border-style: solid;
}
.info-panel::before { top: -1px; left: -1px;  border-width: 2px 0 0 2px; }
.info-panel::after  { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

.panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 7px 10px;
    border-bottom: 1px solid rgba(120,210,255,0.25);
    font-size: 10px;
}
.panel-title { opacity: 0.55; letter-spacing: 0.15em; }
.panel-id    { color: #fff; font-weight: 700; }

/* 掃描線動畫 */
.scan-line {
    position: absolute;
    left: 0; right: 0;
    height: 2px;
    background: linear-gradient(transparent, rgba(120,210,255,0.35), transparent);
    animation: scan 3s ease-in-out infinite;
    pointer-events: none;
}
@keyframes scan {
    0%   { top: 0;    opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { top: 100%; opacity: 0; }
}

.panel-body { padding: 8px 10px; }
.data-row {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
    border-bottom: 1px solid rgba(120,210,255,0.1);
}
.data-row .key { opacity: 0.5; font-size: 10px; letter-spacing: 0.12em; }
.data-row .val { color: #fff; font-weight: 600; font-size: 11px; }

.panel-footer {
    padding: 8px 10px;
    border-top: 1px solid rgba(120,210,255,0.25);
    text-align: center;
}
.continue-btn {
    all: unset;
    cursor: pointer;
    font: 600 10px/1 'Courier New', monospace;
    letter-spacing: 0.18em;
    color: rgba(120,210,255,0.8);
    padding: 5px 14px;
    border: 1px solid rgba(120,210,255,0.4);
    transition: background 0.15s, color 0.15s;
}
.continue-btn:hover {
    background: rgba(120,210,255,0.15);
    color: #fff;
}

/* ── 左側控制選單 ── */
#ctrl-menu {
    position: fixed;
    left: 36px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: auto;
    display: none;
    flex-direction: column;
    gap: 2px;
}
#ctrl-menu.visible { display: flex; }
.ctrl-item {
    display: flex;
    align-items: center;
    gap: 14px;
    cursor: pointer;
    padding: 4px 0;
    transition: opacity 0.15s;
}
.ctrl-item:hover { opacity: 0.7; }
.ctrl-indicator {
    width: ${PARAMS.menuIndicatorWidth}px;
    height: ${PARAMS.menuFontSize * PARAMS.menuLineHeight * 0.6}px;
    background: #fff;
    opacity: 0;
    transition: opacity 0.2s;
    flex-shrink: 0;
}
.ctrl-item.active .ctrl-indicator { opacity: 1; }
.ctrl-key {
    font: 700 ${PARAMS.menuFontSize * 0.65}px/1 'Courier New', monospace;
    letter-spacing: 0.12em;
    color: rgba(255,255,255,0.4);
    min-width: 46px;
}
.ctrl-label {
    font: 400 ${PARAMS.menuFontSize}px/${PARAMS.menuLineHeight} 'Courier New', monospace;
    letter-spacing: 0.06em;
    color: rgba(255,255,255,0.9);
    white-space: nowrap;
}

/* ── 返回按鈕（右下角） ── */
#back-btn {
    position: fixed;
    right: 36px;
    bottom: 32px;
    pointer-events: auto;
    display: none;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    font: 600 13px/1 'Courier New', monospace;
    letter-spacing: 0.18em;
    color: rgba(255,255,255,0.75);
    transition: color 0.15s;
}
#back-btn.visible { display: flex; }
#back-btn:hover { color: #fff; }
#back-btn .back-icon {
    width: 28px; height: 28px;
    border: 1px solid rgba(255,255,255,0.5);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
    transition: border-color 0.15s;
}
#back-btn:hover .back-icon { border-color: #fff; }
`;
document.head.appendChild(style);

// ═══════════════════════════════════════════════════════════════════════════
class StarField {
    constructor() {
        this._busy = false;           // 動畫進行中旗標（防止重複觸發）
        this._labelsVisible = true;   // 選項框是否顯示中
        this._lastTarget    = null;   // 最後飛向的目標位置（供返回使用）

        this._initRenderer();
        this._initStars();
        this._initPlanet();
        this._initLabels();
        this._initHUD();
        this._initMenu();
        this._initBackBtn();
        this._bindEvents();
        this._tick();
    }

    // ─── 初始化 Three.js 渲染器、相機、後製 ─────────────────────────────────
    _initRenderer() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);

        this.camera = new THREE.PerspectiveCamera(
            PARAMS.fovDefault,
            window.innerWidth / window.innerHeight,
            0.1, 2000
        );
        this.camera.position.set(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        // Effect Composer（後製管線）
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        // Bloom 光暈 Pass
        this.bloom = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            PARAMS.bloomDefault, 0.6, 0.3
        );
        this.composer.addPass(this.bloom);

        // 視窗大小改變時同步更新
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.composer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // ─── 星球 3D 球體（GLSL 材質入口） ──────────────────────────────────────
    _initPlanet() {
        // ── Vertex Shader ────────────────────────────────────────────────────
        const vertexShader = /* glsl */`
            varying vec3 vNormal;
            varying vec3 vViewDir;
            varying vec2 vUv;

            void main() {
                vUv       = uv;
                vNormal   = normalize(normalMatrix * normal);
                vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                vViewDir  = normalize(-mvPos.xyz);
                gl_Position = projectionMatrix * mvPos;
            }
        `;

        // ── Fragment Shader ──────────────────────────────────────────────────
        // 此處為預設佔位 shader，使用者可在此加入自訂 GLSL
        const fragmentShader = /* glsl */`
            uniform vec3  uColor1;
            uniform vec3  uColor2;
            uniform vec3  uAtmosphereColor;
            uniform float uAtmosphereIntensity;
            uniform float uTime;

            varying vec3 vNormal;
            varying vec3 vViewDir;
            varying vec2 vUv;

            // ── 簡易雜訊（可替換為自訂紋理採樣）──
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            float noise(vec2 p) {
                vec2 i = floor(p), f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i),            hash(i + vec2(1,0)), f.x),
                           mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
            }

            void main() {
                // 球面條紋 + 雜訊混合
                float n    = noise(vUv * 6.0 + vec2(uTime * 0.04, 0.0));
                float band = smoothstep(0.3, 0.7, sin(vUv.y * 10.0 + n * 2.5) * 0.5 + 0.5);
                vec3  base = mix(uColor1, uColor2, band + n * 0.25);

                // 大氣邊緣光暈（rim light）
                float rim  = 1.0 - max(dot(vNormal, vViewDir), 0.0);
                rim        = pow(rim, 3.5) * uAtmosphereIntensity;
                vec3  col  = base + uAtmosphereColor * rim;

                // 極點暗化
                col *= 0.75 + 0.25 * smoothstep(0.0, 0.4, abs(vNormal.y));

                gl_FragColor = vec4(col, 1.0);
            }
        `;

        // 將 PARAMS 中的初始值轉為 THREE.Color / float uniform
        const p = PARAMS;
        this._planetMat = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uColor1:             { value: new THREE.Color(...p.planetColor1) },
                uColor2:             { value: new THREE.Color(...p.planetColor2) },
                uAtmosphereColor:    { value: new THREE.Color(...p.atmosphereColor) },
                uAtmosphereIntensity:{ value: p.atmosphereIntensity },
                uTime:               { value: 0 },
            },
        });

        this._planetMesh = new THREE.Mesh(
            new THREE.SphereGeometry(p.planetRadius, p.planetSegments, p.planetSegments),
            this._planetMat
        );
        this._planetMesh.visible = false;
        this.scene.add(this._planetMesh);
    }

    _showPlanet(target) {
        this._planetMesh.position.copy(target);
        this._planetMesh.visible = true;
    }

    _hidePlanet() {
        this._planetMesh.visible = false;
    }

    // ─── 左側控制選單 ────────────────────────────────────────────────────────
    _initMenu() {
        const menu = document.createElement('div');
        menu.id = 'ctrl-menu';
        document.body.appendChild(menu);
        this._menu = menu;

        // 根據 PARAMS.menuItems 動態建立項目
        PARAMS.menuItems.forEach((item, i) => {
            const el = document.createElement('div');
            el.className = 'ctrl-item' + (i === 0 ? ' active' : '');
            el.innerHTML = `
                <div class="ctrl-indicator"></div>
                <span class="ctrl-key">${item.key}</span>
                <span class="ctrl-label">${item.label}</span>
            `;
            el.addEventListener('click', () => this._onMenuAction(item.action));
            el.addEventListener('mouseenter', () => {
                menu.querySelectorAll('.ctrl-item').forEach(e => e.classList.remove('active'));
                el.classList.add('active');
            });
            menu.appendChild(el);
        });
    }

    // 選單行為分發
    _onMenuAction(action) {
        if (action === 'back') { this._flyBack(); return; }
        if (action === 'fly')  {
            if (this._busy) return;
            this._closeHUD();
            return;
        }
        // 其他自訂行為可在此擴充
    }

    _showMenu() {
        this._menu.classList.add('visible');
        gsap.fromTo(this._menu, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' });
    }

    _hideMenu() {
        gsap.to(this._menu, {
            opacity: 0, x: -20, duration: 0.3,
            onComplete: () => this._menu.classList.remove('visible')
        });
    }

    // ─── 返回按鈕（右下角） ──────────────────────────────────────────────────
    _initBackBtn() {
        const btn = document.createElement('div');
        btn.id = 'back-btn';
        btn.innerHTML = `<div class="back-icon">B</div><span>BACK</span>`;
        btn.addEventListener('click', () => this._flyBack());
        document.body.appendChild(btn);
        this._backBtn = btn;
    }

    _showBackBtn() {
        this._backBtn.classList.add('visible');
        gsap.fromTo(this._backBtn, { opacity: 0 }, { opacity: 1, duration: 0.4 });
    }

    _hideBackBtn() {
        gsap.to(this._backBtn, {
            opacity: 0, duration: 0.25,
            onComplete: () => this._backBtn.classList.remove('visible')
        });
    }

    // ─── 反轉動畫：飛回原點 ─────────────────────────────────────────────────
    _flyBack() {
        if (!this._lastTarget) return;

        // 隱藏 HUD、選單、返回按鈕、星球
        gsap.to(this._hud,     { opacity: 0, duration: 0.25, onComplete: () => this._hud.classList.remove('visible') });
        this._hideMenu();
        this._hideBackBtn();
        this._hidePlanet();

        const { bloomDefault, flyBackTime } = PARAMS;

        // 記錄此刻的朝向，用於平滑轉回正前方
        const startDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const endDir   = new THREE.Vector3(0, 0, -1); // 預設朝向

        const tl = gsap.timeline({
            onComplete: () => {
                this._resetCamera();
                this._busy = false;
                this._showLabels();
            }
        });

        // 飛回原點（同步 lookAt 讓視角自然穿越星空）
        tl.to(this.camera.position, {
            x: 0, y: 0, z: 0,
            duration: flyBackTime,
            ease: 'power2.inOut',
        });

        // Bloom 收回（與飛行同步）
        tl.to(this.bloom, {
            strength: bloomDefault,
            duration: flyBackTime,
            ease: 'power2.out',
        }, '<');

        // FOV 鐘形（與飛行同步：先擴後縮）
        tl.to(this.camera, {
            fov: PARAMS.fovWarp,
            duration: flyBackTime * 0.5,
            ease: 'power2.in',
            onUpdate: () => this.camera.updateProjectionMatrix(),
        }, '<');
        tl.to(this.camera, {
            fov: PARAMS.fovDefault,
            duration: flyBackTime * 0.5,
            ease: 'power2.out',
            onUpdate: () => this.camera.updateProjectionMatrix(),
        });

        // 旋轉回正前方（在飛行後段執行）
        const rot = { t: 0 };
        tl.to(rot, {
            t: 1,
            duration: flyBackTime * 0.6,
            ease: 'power2.inOut',
            onUpdate: () => {
                const dir = startDir.clone().lerp(endDir, rot.t).normalize();
                this.camera.lookAt(this.camera.position.clone().add(dir));
            },
        }, `<-${flyBackTime * 0.3}`);
    }

    // ─── 建立星星點雲 ────────────────────────────────────────────────────────
    _initStars() {
        const count = PARAMS.starCount;
        const R     = PARAMS.radius;
        const pos   = new Float32Array(count * 3);
        const col   = new Float32Array(count * 3);
        this._vel   = new Float32Array(count * 3); // 每顆星星的漂移速度

        const color = new THREE.Color();

        for (let i = 0; i < count; i++) {
            // 球體均勻分布（cbrt 確保體積密度均勻）
            const r    = R * Math.cbrt(Math.random());
            const cosT = Math.random() * 2 - 1;
            const sinT = Math.sqrt(1 - cosT * cosT);
            const phi  = Math.random() * Math.PI * 2;

            pos[i*3]   = r * sinT * Math.cos(phi);
            pos[i*3+1] = r * sinT * Math.sin(phi);
            pos[i*3+2] = r * cosT;

            // 顏色：75% 藍白色（類太陽型），25% 暖黃色
            const warm = Math.random() < 0.25;
            color.setHSL(
                warm ? 0.07 + Math.random() * 0.07 : 0.58 + Math.random() * 0.10,
                warm ? 0.4  + Math.random() * 0.3  : 0.2  + Math.random() * 0.3,
                0.75 + Math.random() * 0.25
            );
            col[i*3]   = color.r;
            col[i*3+1] = color.g;
            col[i*3+2] = color.b;

            // 隨機漂移速度
            const s = PARAMS.driftSpeed;
            this._vel[i*3]   = (Math.random() - 0.5) * s;
            this._vel[i*3+1] = (Math.random() - 0.5) * s;
            this._vel[i*3+2] = (Math.random() - 0.5) * s;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

        this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
            map: makeStarTexture(),   // 圓形貼圖（非方形）
            vertexColors: true,
            size: 1.4,
            sizeAttenuation: true,
            transparent: true,
            alphaTest: 0.01,
            depthWrite: false,
        }));

        this.scene.add(this.stars);
    }

    // ─── 建立 2D 選項框標籤 ─────────────────────────────────────────────────
    _initLabels() {
        const attr    = this.stars.geometry.getAttribute('position');
        const indices = new Set();

        // 隨機選取不重複的星星索引
        while (indices.size < PARAMS.labelCount) {
            indices.add(Math.floor(Math.random() * PARAMS.starCount));
        }

        // 為每個索引建立 DOM 元素與對應資料
        // wasInView：追蹤上一幀是否在畫面中，用於偵測「剛離開畫面」的時機
        this._labels = [...indices].map((idx, i) => {
            const data = generateStarData(
                new THREE.Vector3(attr.getX(idx), attr.getY(idx), attr.getZ(idx)), i
            );

            const el = document.createElement('div');
            el.className = 'star-label';
            el.textContent = data.id;
            document.body.appendChild(el);

            return { idx, data, el, wasInView: true };
        });

        this._labelsVisible = true;
    }

    // 淡入顯示所有標籤
    _showLabels() {
        this._labelsVisible = true;
        this._labels.forEach(({ el }) => {
            el.style.display = '';
            gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.5 });
        });
    }

    // 淡出隱藏所有標籤
    _hideLabels() {
        this._labelsVisible = false;
        this._labels.forEach(({ el }) => {
            gsap.to(el, {
                opacity: 0, duration: 0.25,
                onComplete: () => { el.style.display = 'none'; }
            });
        });
    }

    // 在所有星星中找出畫面內的索引（排除已使用的）
    _pickVisibleStarIndex(excludeIndices) {
        const attr  = this.stars.geometry.getAttribute('position');
        const v     = new THREE.Vector3();
        const cands = [];
        const excl  = new Set(excludeIndices);

        for (let i = 0; i < PARAMS.starCount; i++) {
            if (excl.has(i)) continue;
            v.set(attr.getX(i), attr.getY(i), attr.getZ(i));
            const ndc = v.clone().project(this.camera);
            // NDC 範圍 [-0.85, 0.85] 確保標籤有足夠邊距
            if (ndc.z <= 1 && Math.abs(ndc.x) < 0.85 && Math.abs(ndc.y) < 0.85) {
                cands.push(i);
            }
        }
        return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
    }

    // 每幀將 3D 位置投影至螢幕座標，更新標籤位置
    // 若星星離開畫面則重新選取一顆可見的星星
    _updateLabelPositions() {
        if (!this._labelsVisible) return;
        const attr = this.stars.geometry.getAttribute('position');
        const v    = new THREE.Vector3();

        this._labels.forEach((label, i) => {
            v.set(attr.getX(label.idx), attr.getY(label.idx), attr.getZ(label.idx));
            const ndc     = v.clone().project(this.camera);
            const inView  = ndc.z <= 1
                         && Math.abs(ndc.x) < 0.85
                         && Math.abs(ndc.y) < 0.85;

            if (!inView) {
                // 剛離開畫面：重新選取一顆畫面內的星星（只觸發一次）
                if (label.wasInView) {
                    label.wasInView = false;
                    const others = this._labels.map(l => l.idx);
                    const newIdx = this._pickVisibleStarIndex(others);
                    if (newIdx !== null) {
                        label.idx  = newIdx;
                        label.data = generateStarData(
                            new THREE.Vector3(attr.getX(newIdx), attr.getY(newIdx), attr.getZ(newIdx)), i
                        );
                        label.el.textContent = label.data.id;
                    }
                }
                label.el.style.visibility = 'hidden';
                return;
            }

            label.wasInView          = true;
            label.el.style.visibility = '';
            label.el.style.left      = `${(ndc.x *  0.5 + 0.5) * window.innerWidth}px`;
            label.el.style.top       = `${(ndc.y * -0.5 + 0.5) * window.innerHeight}px`;
        });
    }

    // ─── 建立 HUD 資訊面板 DOM ───────────────────────────────────────────────
    _initHUD() {
        const hud = document.createElement('div');
        hud.id = 'star-hud';
        document.body.appendChild(hud);
        this._hud = hud;

        // SVG 層：用於畫心智圖連線（全螢幕覆蓋，不攔截事件）
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
        hud.appendChild(svg);
        this._svg = svg;

        // 瞄準環
        const reticle = document.createElement('div');
        reticle.className = 'reticle';
        reticle.innerHTML = `
            <div class="corner tl"></div><div class="corner tr"></div>
            <div class="corner bl"></div><div class="corner br"></div>
            <div class="ring ring-outer"></div>
            <div class="ring ring-inner"></div>
        `;
        hud.appendChild(reticle);
        this._reticle = reticle;

        // 根據 infoPanelCount 建立對應數量的面板 DOM
        const count = Math.min(PARAMS.infoPanelCount, PANEL_DEFS.length);
        this._panels = PANEL_DEFS.slice(0, count).map((def, i) => {
            const panel = document.createElement('div');
            panel.className = 'info-panel';

            const isLast = (i === count - 1);
            panel.innerHTML = `
                <div class="scan-line"></div>
                <div class="panel-header">
                    <span class="panel-title">${def.title}</span>
                    <span class="panel-id"></span>
                </div>
                <div class="panel-body"></div>
                ${isLast ? `<div class="panel-footer">
                    <button class="continue-btn">▶ CONTINUE</button>
                </div>` : ''}
            `;

            if (isLast) {
                panel.querySelector('.continue-btn').addEventListener('click', () => this._closeHUD());
            }

            hud.appendChild(panel);
            return { el: panel, def };
        });
    }

    // 開啟 HUD：定位瞄準環、擺放面板、畫心智圖連線
    _openHUD(target, data) {
        const ndc = target.clone().project(this.camera);
        const sx  = (ndc.x *  0.5 + 0.5) * window.innerWidth;
        const sy  = (ndc.y * -0.5 + 0.5) * window.innerHeight;

        // 瞄準環
        this._reticle.style.left = `${sx}px`;
        this._reticle.style.top  = `${sy}px`;

        const W       = PARAMS.infoPanelWidth;
        const M       = 10;
        const bx      = sx + PARAMS.mindMapBranchDist; // 水平分支點 X
        const SVG_NS  = 'http://www.w3.org/2000/svg';

        // 清除舊連線
        this._svg.innerHTML = '';

        this._panels.forEach(({ el, def }) => {
            // 面板位置
            const px = Math.max(M, Math.min(sx + def.offsetX, window.innerWidth - W - M));
            const py = Math.max(M, sy + def.offsetY);
            el.style.left = `${px}px`;
            el.style.top  = `${py}px`;

            // 填入資料
            el.querySelector('.panel-id').textContent   = data.id;
            el.querySelector('.panel-body').innerHTML   = def.rows(data)
                .map(([k, v]) => `<div class="data-row">
                    <span class="key">${k}</span><span class="val">${v}</span>
                </div>`).join('');

            // 估算面板中線 Y（header ≈ 30px + rows ≈ 22px × 3 / 2）
            const panelMidY = py + 30 + (def.rows(data).length * 22) / 2;

            // 心智圖連線：star → 分支點 → 面板左緣中線
            // 路徑：M star → L branchX,starY → L panelLeft,panelMidY
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', `M ${sx} ${sy} L ${bx} ${sy} L ${px} ${panelMidY}`);
            path.setAttribute('stroke', PARAMS.mindMapLineColor);
            path.setAttribute('stroke-width', String(PARAMS.mindMapLineWidth));
            path.setAttribute('fill', 'none');
            this._svg.appendChild(path);
        });

        // 顯示星球、選單、返回按鈕，並整體淡入 HUD
        this._showPlanet(target);
        this._hud.classList.add('visible');
        gsap.fromTo(this._hud, { opacity: 0 }, { opacity: 1, duration: PARAMS.infoPanelFadeIn });
        this._showMenu();
        this._showBackBtn();
    }

    // 關閉 HUD → 觸發白閃過場
    _closeHUD() {
        this._hidePlanet();
        this._hideMenu();
        this._hideBackBtn();
        gsap.to(this._hud, {
            opacity: 0, duration: 0.3,
            onComplete: () => {
                this._hud.classList.remove('visible');
                this._flashAndReset();
            }
        });
    }

    // ─── 選取前方視錐內的隨機星星 ───────────────────────────────────────────
    _pickTarget() {
        const camPos = this.camera.position.clone();
        const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const cosMax = Math.cos(THREE.MathUtils.degToRad(PARAMS.coneDeg));
        const attr   = this.stars.geometry.getAttribute('position');
        const cands  = [];

        for (let i = 0; i < PARAMS.starCount; i++) {
            const s = new THREE.Vector3(attr.getX(i), attr.getY(i), attr.getZ(i));
            if (s.distanceTo(camPos) < PARAMS.minDist) continue;
            const dir = s.clone().sub(camPos).normalize();
            if (dir.dot(camFwd) > cosMax) cands.push(s);
        }

        return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
    }

    // ─── 相機飛行至目標星星 ──────────────────────────────────────────────────
    _flyTo(target, data = null) {
        this._busy = true;
        this._lastTarget = target.clone(); // 儲存目標供返回動畫使用
        this._hideLabels();

        const { fovDefault, fovWarp, fovWarpTime, flyTime,
                stopDist, bloomPeak, bloomTime } = PARAMS;

        // 計算停止位置（星星前方 stopDist 單位）
        const camPos   = this.camera.position.clone();
        const toTarget = target.clone().sub(camPos).normalize();
        const dest     = target.clone().sub(toTarget.clone().multiplyScalar(stopDist));

        // 取得當前與目標的朝向向量，用於平滑轉向
        const startDir  = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        const targetDir = toTarget.clone();

        const turnTime = fovWarpTime * 1.6;
        const tl = gsap.timeline({
            onComplete: () => {
                // 抵達後開啟 HUD（不觸發白閃，等使用者按 CONTINUE）
                this._openHUD(target, data || generateStarData(target, 0));
            }
        });

        // 1. 平滑轉向（純旋轉，FOV 不變）
        const rot = { t: 0 };
        tl.to(rot, {
            t: 1,
            duration: turnTime,
            ease: 'power2.inOut',
            onUpdate: () => {
                const dir = startDir.clone().lerp(targetDir, rot.t).normalize();
                this.camera.lookAt(this.camera.position.clone().add(dir));
            },
        });

        // 2. 飛向星星（轉向完全結束後才開始）
        //    持續 lookAt(target) 確保星星始終對齊畫面正中央
        tl.to(this.camera.position, {
            x: dest.x, y: dest.y, z: dest.z,
            duration: flyTime,
            ease: 'power2.inOut',
            onUpdate: () => this.camera.lookAt(target),
        });

        // 3. FOV 淡入：飛行前半段擴張
        tl.to(this.camera, {
            fov: fovWarp,
            duration: flyTime * 0.5,
            ease: 'power2.in',
            onUpdate: () => this.camera.updateProjectionMatrix(),
        }, '<');

        // 4. FOV 淡出：飛行後半段收回（接在擴張結束後）
        tl.to(this.camera, {
            fov: fovDefault,
            duration: flyTime * 0.5,
            ease: 'power2.out',
            onUpdate: () => this.camera.updateProjectionMatrix(),
        });

        // 5. Bloom 增強（與整段飛行同步）
        tl.to(this.bloom, {
            strength: bloomPeak,
            duration: bloomTime,
            ease: 'power2.in',
        }, `<-${flyTime * 0.5}`);
    }

    // ─── 白閃過場 → 重置場景 ─────────────────────────────────────────────────
    _flashAndReset() {
        const { flashTime, fadeTime, bloomDefault } = PARAMS;

        this.scene.background = new THREE.Color(1, 1, 1);
        const v = { t: 1 };

        gsap.to(v, {
            t: 0,
            duration: flashTime + fadeTime,
            ease: 'power1.inOut',
            onUpdate: () => this.scene.background.setRGB(v.t, v.t, v.t),
            onComplete: () => {
                this.bloom.strength = bloomDefault;
                this.scene.background = new THREE.Color(0x000000);
                this._resetCamera();
                this._busy = false;
                this._showLabels(); // 重置後重新顯示選項框
            },
        });
    }

    // 重置相機至原點
    _resetCamera() {
        this.camera.position.set(0, 0, 0);
        this.camera.rotation.set(0, 0, 0);
        this.camera.fov = PARAMS.fovDefault;
        this.camera.updateProjectionMatrix();
    }

    // ─── 事件綁定 ────────────────────────────────────────────────────────────
    _bindEvents() {
        // 點擊選項框 → 飛向對應星星
        // 透過 label 物件參照讀取 idx/data，確保重選後仍能取到最新值
        this._labels.forEach((label) => {
            label.el.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止觸發背景點擊
                if (this._busy) return;
                const attr = this.stars.geometry.getAttribute('position');
                const target = new THREE.Vector3(
                    attr.getX(label.idx), attr.getY(label.idx), attr.getZ(label.idx)
                );
                this._flyTo(target, label.data);
            });
        });

        // 點擊背景 → 飛向隨機星星（debounce 防止雙擊誤觸）
        let timer = null;
        window.addEventListener('click', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                if (this._busy) return;
                const target = this._pickTarget();
                if (target) this._flyTo(target);
            }, 200);
        });
        window.addEventListener('dblclick', () => clearTimeout(timer));
    }

    // ─── 主渲染迴圈 ──────────────────────────────────────────────────────────
    _tick() {
        const attr = this.stars.geometry.getAttribute('position');
        const R2   = (PARAMS.radius * 1.4) ** 2;

        const loop = () => {
            requestAnimationFrame(loop);

            // 選擇星星後暫停所有星星移動，直到重置後才繼續
            if (!this._busy) {
                for (let i = 0; i < PARAMS.starCount; i++) {
                    attr.array[i*3]   += this._vel[i*3];
                    attr.array[i*3+1] += this._vel[i*3+1];
                    attr.array[i*3+2] += this._vel[i*3+2];

                    const x = attr.array[i*3];
                    const y = attr.array[i*3+1];
                    const z = attr.array[i*3+2];
                    if (x*x + y*y + z*z > R2) {
                        attr.array[i*3]   = -x * 0.9;
                        attr.array[i*3+1] = -y * 0.9;
                        attr.array[i*3+2] = -z * 0.9;
                    }
                }
                attr.needsUpdate = true;
            }

            this._updateLabelPositions(); // 同步標籤位置

            // 更新星球 shader 時間（帶動大氣旋轉等動畫）
            if (this._planetMesh.visible) {
                this._planetMat.uniforms.uTime.value += 0.016;
            }

            this.composer.render();
        };

        loop();
    }
}

new StarField();
