// Сцена three.js: загрузка планов этажей, подсветка кабинетов, клики по карте.
//
// Файл называется three.js, но импортирует пакет 'three' по bare specifier
// из importmap — конфликта имён нет, это разные механизмы резолва.
//
// Циклическая зависимость с schedule.js и roomPanel.js разрешена тем, что
// импортированные оттуда функции вызываются только внутри тел функций.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
    isMobile, FIT_MARGIN, FLOOR_MODELS, DIAGONAL_MARGIN, FRUSTUM_MARGIN,
    FIXED_AZIMUTH, FIXED_POLAR, floorRoomConfigs, COLOR_WHITE, COLOR_SELECTED,
    ANIMATION_DURATION, statusColors, DRAG_THRESHOLD,
    COLOR_WHITE_DARK, COLOR_SELECTED_DARK, statusColorsDark,
    AMBIENT_INTENSITY_LIGHT, AMBIENT_INTENSITY_DARK,
    DIR_INTENSITY_LIGHT, DIR_INTENSITY_DARK, DECOR_DIM_DARK,
    MAX_PIXEL_RATIO, CAMERA_DISTANCE_PADDING, FAR_PLANE_FACTOR, FAR_PLANE_PADDING,
    DARK_LIGHTNESS_THRESHOLD
} from './config.js';

import {
    container, modelLoading, clickInfoDiv, stubOverlay, floorNumbers,
    roomMeshes, setRoomMeshes,
    highlightedMeshes, setHighlightedMeshes,
    selectedMesh, setSelectedMesh,
    activeHighlightedMesh, setActiveHighlightedMesh,
    setCurrentFloor, setCurrentSchedule
} from './state.js';

import { GLB_SIZES } from './glbSizes.js';
import { showRoomPanel, hideRoomPanel } from './roomPanel.js';
import { applySelection, hasSelection, updatePairsUI } from './schedule.js';

// ---------------------------------------------------------------------------
// СЦЕНА
// ---------------------------------------------------------------------------

const scene = new THREE.Scene();

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
camera.position.set(0, 10, 0);
camera.lookAt(0, 0, 0);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, AMBIENT_INTENSITY_LIGHT);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, DIR_INTENSITY_LIGHT);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.screenSpacePanning = true;
controls.enableZoom = true;
controls.zoomSpeed = 1.2;
controls.enableRotate = !isMobile;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI / 2;
controls.enablePan = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
// на телефоне одним пальцем панорамируем, а не вращаем
controls.touches = {
    ONE: isMobile ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN
};
controls.update();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerDownPos = new THREE.Vector2();
let isPointerDown = false;

const loader = new GLTFLoader();

// ссылка на загруженную модель нужна кнопке «Сбросить вид»
let loadedModel = null;
let animationStarted = false;

// ---------------------------------------------------------------------------
// ТЕМА
// ---------------------------------------------------------------------------

const sceneBackground = new THREE.Color();
const sceneBackgroundHSL = { h: 0, s: 0, l: 0 };
const decorColor = new THREE.Color();
let darkTheme = false;

export function roomBaseColor() {
    return darkTheme ? COLOR_WHITE_DARK : COLOR_WHITE;
}

export function roomSelectedColor() {
    return darkTheme ? COLOR_SELECTED_DARK : COLOR_SELECTED;
}

function dimColor(hex, factor) {
    return decorColor.setHex(hex).multiplyScalar(factor).getHex();
}

function applyDecorColors() {
    roomMeshes.forEach((mesh) => {
        const { baseColor } = mesh.userData;
        if (baseColor == null) return;
        setMeshColorInstant(mesh, darkTheme ? dimColor(baseColor, DECOR_DIM_DARK) : baseColor);
    });
}

export function applyThemeBackground() {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--model-bg').trim();
    if (!value) return;

    scene.background = sceneBackground.setStyle(value);
    sceneBackground.getHSL(sceneBackgroundHSL);
    darkTheme = sceneBackgroundHSL.l < DARK_LIGHTNESS_THRESHOLD;

    ambientLight.intensity = darkTheme ? AMBIENT_INTENSITY_DARK : AMBIENT_INTENSITY_LIGHT;
    dirLight.intensity = darkTheme ? DIR_INTENSITY_DARK : DIR_INTENSITY_LIGHT;

    if (!roomMeshes.length) return;

    applyDecorColors();
    if (hasSelection()) applySelection();
    else resetAllRoomsToWhite(true);
}

applyThemeBackground();


// ЦВЕТА МЕШЕЙ


const activeAnimations = new Map();

function getMeshColor(mesh) {
    const { material } = mesh;
    return Array.isArray(material) ? material[0].color.getHex() : material.color.getHex();
}

function setMeshColorInstant(mesh, hexColor) {
    const { material } = mesh;
    if (Array.isArray(material)) material.forEach((item) => item.color.setHex(hexColor));
    else material.color.setHex(hexColor);
    material.needsUpdate = true;
}

export function animateMeshColor(mesh, targetHex, duration = ANIMATION_DURATION) {
    if (activeAnimations.has(mesh)) {
        cancelAnimationFrame(activeAnimations.get(mesh));
        activeAnimations.delete(mesh);
    }

    const startColor = new THREE.Color(getMeshColor(mesh));
    const targetColor = new THREE.Color(targetHex);
    const startTime = performance.now();

    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        setMeshColorInstant(mesh, startColor.clone().lerp(targetColor, progress).getHex());

        if (progress < 1) activeAnimations.set(mesh, requestAnimationFrame(step));
        else activeAnimations.delete(mesh);
    }

    activeAnimations.set(mesh, requestAnimationFrame(step));
}

export function resetAllRoomsToWhite(instant = true) {
    roomMeshes.forEach((mesh) => {
        if (!mesh.userData.showPanel) return;
        if (instant) setMeshColorInstant(mesh, roomBaseColor());
        else animateMeshColor(mesh, roomBaseColor());
    });
}

export function getStatusColor(status, variant = 'normal') {
    if (status === 'past') return roomBaseColor();
    const palette = darkTheme ? statusColorsDark : statusColors;
    return palette[status]?.[variant] ?? roomBaseColor();
}

export function resetActiveSelection() {
    if (activeHighlightedMesh) {
        const { pairStatus } = activeHighlightedMesh.userData;
        const color = pairStatus && pairStatus !== 'past'
            ? getStatusColor(pairStatus, 'normal')
            : roomBaseColor();
        animateMeshColor(activeHighlightedMesh, color);
        setActiveHighlightedMesh(null);
    }

    if (selectedMesh) {
        animateMeshColor(selectedMesh, roomBaseColor());
        setSelectedMesh(null);
    }
}

// ЗАГРУЗКА ЭТАЖА

let activeFloor = null;
let loadToken = 0;

const modelProgress = modelLoading.querySelector('.model-progress');
const modelProgressFill = modelLoading.querySelector('.model-progress-fill');
const modelProgressValue = modelLoading.querySelector('.model-progress-value');
const modelSpinner = modelLoading.querySelector('.spinner');
const modelText = modelLoading.querySelector('p');

function setLoadProgress(percent) {
    if (percent === null) {
        modelProgress.hidden = true;
        modelProgressFill.style.width = '0%';
        return;
    }

    modelProgress.hidden = false;
    modelProgress.setAttribute('aria-valuenow', String(percent));
    modelProgressFill.style.width = `${percent}%`;
    modelProgressValue.textContent = `${percent}%`;
}

function disposeFloorModel() {
    if (!loadedModel) return;

    scene.remove(loadedModel);
    loadedModel.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose();
        const { material } = child;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
    });
    loadedModel = null;
}

function findRoomConfig(meshName, floorConfig) {
    for (const [id, config] of Object.entries(floorConfig)) {
        if (meshName.includes(id)) return { id, config };
    }
    return null;
}

function assignRoomData(mesh, index, floorConfig) {
    const name = mesh.name || '';
    const match = findRoomConfig(name, floorConfig);

    if (match) {
        const { number, name: roomName, showPanel } = match.config;
        Object.assign(mesh.userData, { roomId: match.id, roomNumber: number, roomName, showPanel });
    } else {
        Object.assign(mesh.userData, {
            roomId: name || `unknown_${index}`,
            roomNumber: '',
            roomName: name || `Объект ${index}`,
            showPanel: false
        });
    }


    const { material } = mesh;
    mesh.material = Array.isArray(material) ? material.map((item) => item.clone()) : material.clone();
    if (!mesh.userData.showPanel) mesh.userData.baseColor = getMeshColor(mesh);
}

function handleFloorLoaded(gltf, floor) {
    const model = gltf.scene;
    loadedModel = model;
    scene.add(model);

    model.traverse((child) => {
        if (child.isMesh) roomMeshes.push(child);
    });

    const floorConfig = floorRoomConfigs[floor] || {};
    roomMeshes.forEach((mesh, index) => assignRoomData(mesh, index, floorConfig));

    applyDecorColors();
    fitCameraToModel(model);
    resetAllRoomsToWhite();
    setLoadProgress(null);
    modelLoading.classList.add('hidden');

    if (!animationStarted) {
        animationStarted = true;
        animate();
    }

    if (hasSelection()) applySelection();
}


function handleFloorProgress(event, expectedBytes) {
    const total = expectedBytes
        || (event.lengthComputable && event.total > event.loaded ? event.total : 0);

    if (!total) {
        setLoadProgress(null);
        return;
    }

    setLoadProgress(Math.min(100, Math.round((event.loaded / total) * 100)));
}

function handleFloorError(error) {
    console.error('Ошибка загрузки модели:', error);
    modelSpinner.style.display = 'none';
    modelText.textContent = 'Ошибка соединения. Попробуйте выбрать этаж ещё раз.';
    setLoadProgress(null);
    activeFloor = null; 
}

export function loadFloorModel(floor) {
    const url = FLOOR_MODELS[floor];
    if (!url) return;

    const token = ++loadToken;
    const expectedBytes = GLB_SIZES[url] || 0;

    disposeFloorModel();
    setRoomMeshes([]);
    setHighlightedMeshes([]);
    setSelectedMesh(null);
    setActiveHighlightedMesh(null);

    modelLoading.classList.remove('hidden');
    modelSpinner.style.display = '';
    modelText.textContent = 'Загружаем план этажа…';
    setLoadProgress(expectedBytes ? 0 : null);

    loader.load(
        url,
        (gltf) => { if (token === loadToken) handleFloorLoaded(gltf, floor); },
        (event) => { if (token === loadToken) handleFloorProgress(event, expectedBytes); },
        (error) => { if (token === loadToken) handleFloorError(error); }
    );
}

// КАМЕРА

function orientModel(model) {
    model.rotation.y = 0;
    model.position.set(0, 0, 0);
    model.updateMatrixWorld(true);

    const rawSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    if (rawSize.x > rawSize.z) {
        model.rotation.y = Math.PI / 2;
        model.updateMatrixWorld(true);
    }
}

function placeCamera(diagonal) {
    const distance = diagonal * DIAGONAL_MARGIN + CAMERA_DISTANCE_PADDING;
    camera.position.set(
        distance * Math.sin(FIXED_POLAR) * Math.sin(FIXED_AZIMUTH),
        distance * Math.cos(FIXED_POLAR),
        distance * Math.sin(FIXED_POLAR) * Math.cos(FIXED_AZIMUTH)
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);

    const frustumSize = diagonal * FRUSTUM_MARGIN;
    const aspect = container.clientWidth / container.clientHeight;
    camera.left = -frustumSize * aspect / 2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = -frustumSize / 2;
    camera.near = 0.1;
    camera.far = diagonal * FAR_PLANE_FACTOR + FAR_PLANE_PADDING;
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
}

function fitZoom(size) {
    const half = size.clone().multiplyScalar(0.5);
    let maxX = 0;
    let maxY = 0;

    for (let i = 0; i < 8; i++) {
        const corner = new THREE.Vector3(
            (i & 1 ? 1 : -1) * half.x,
            (i & 2 ? 1 : -1) * half.y,
            (i & 4 ? 1 : -1) * half.z
        ).applyMatrix4(camera.matrixWorldInverse);
        maxX = Math.max(maxX, Math.abs(corner.x));
        maxY = Math.max(maxY, Math.abs(corner.y));
    }

    const zoomX = maxX > 0 ? (camera.right - camera.left) / (2 * maxX) : 1;
    const zoomY = maxY > 0 ? (camera.top - camera.bottom) / (2 * maxY) : 1;
    camera.zoom = Math.min(zoomX, zoomY) * FIT_MARGIN;
    camera.updateProjectionMatrix();
    controls.update();
}

function fitCameraToModel(model) {
    orientModel(model);

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    model.position.sub(center);
    model.updateMatrixWorld(true);
    controls.target.set(0, 0, 0);

    placeCamera(Math.hypot(size.x, size.y, size.z));
    fitZoom(size);
}

// КЛИКИ ПО КАРТЕ

export function showClickInfo(mesh) {
    if (!mesh) {
        clickInfoDiv.textContent = '';
        return;
    }

    const { roomId, roomNumber, roomName } = mesh.userData;
    const details = [roomNumber, roomName].filter(Boolean).join(' · ');
    clickInfoDiv.textContent = details ? `ID ${roomId} — ${details}` : `ID ${roomId}`;
}

function pickMeshAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const [hit] = raycaster.intersectObjects(roomMeshes, false);
    return hit?.object ?? null;
}

function handleClick({ clientX, clientY }) {
    resetActiveSelection();

    const mesh = pickMeshAt(clientX, clientY);
    if (!mesh) {
        hideRoomPanel();
        showClickInfo(null);
        return;
    }


    showClickInfo(mesh);

    const { roomNumber, roomName, showPanel, pairStatus } = mesh.userData;

    if (highlightedMeshes.includes(mesh)) {
        if (pairStatus && pairStatus !== 'past') animateMeshColor(mesh, getStatusColor(pairStatus, 'bright'));
        setActiveHighlightedMesh(mesh);
        showRoomPanel(roomNumber, roomName);
        return;
    }

    if (!showPanel) {
        hideRoomPanel();
        return;
    }

    animateMeshColor(mesh, roomSelectedColor());
    setSelectedMesh(mesh);
    showRoomPanel(roomNumber || '', roomName);
}

function isTap(clientX, clientY) {
    return Math.hypot(clientX - pointerDownPos.x, clientY - pointerDownPos.y) < DRAG_THRESHOLD;
}

renderer.domElement.addEventListener('pointerdown', ({ clientX, clientY }) => {
    isPointerDown = true;
    pointerDownPos.set(clientX, clientY);
});

renderer.domElement.addEventListener('pointerup', (event) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    if (isTap(event.clientX, event.clientY)) handleClick(event);
});

renderer.domElement.addEventListener('touchstart', (event) => {
    isPointerDown = event.touches.length === 1;
    if (isPointerDown) pointerDownPos.set(event.touches[0].clientX, event.touches[0].clientY);
});

renderer.domElement.addEventListener('touchend', (event) => {
    if (!isPointerDown) return;
    isPointerDown = false;

    const [touch] = event.changedTouches;
    if (isTap(touch.clientX, touch.clientY)) handleClick(touch);
});


// ПЕРЕКЛЮЧЕНИЕ ЭТАЖЕЙ


export function setFloor(floor) {
    if (floor === activeFloor) return;
    activeFloor = floor;

    setCurrentFloor(floor);

    floorNumbers.forEach((span) => {
        const isActive = Number(span.dataset.floor) === floor;
        span.classList.toggle('active', isActive);
        span.setAttribute('aria-current', String(isActive));
    });

    const hasModel = Boolean(FLOOR_MODELS[floor]);
    stubOverlay.classList.toggle('visible', !hasModel);

    setCurrentSchedule([]);
    updatePairsUI([]);
    hideRoomPanel();
    showClickInfo(null);

    if (hasModel) {

        loadFloorModel(floor);
        return;
    }

    resetAllRoomsToWhite(true);
    setHighlightedMeshes([]);
    setSelectedMesh(null);
    setActiveHighlightedMesh(null);
}

floorNumbers.forEach((span) => {
    const floor = Number(span.dataset.floor);

    span.addEventListener('click', () => setFloor(floor));
    span.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setFloor(floor);
    });
});

// РЕНДЕР

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}


const resizeObserver = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    renderer.setSize(width, height);

    const frustumHeight = camera.top - camera.bottom;
    const aspect = width / height;
    camera.left = -frustumHeight * aspect / 2;
    camera.right = frustumHeight * aspect / 2;
    camera.updateProjectionMatrix();
});
resizeObserver.observe(container);

document.getElementById('reset-view').addEventListener('click', () => {
    if (loadedModel) fitCameraToModel(loadedModel);
});
