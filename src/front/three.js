// Инициализация three.js-сцены, загрузка моделей этажей, подсветка кабинетов,
// обработка кликов по 3d-сцене.
//
// Файл называется three.js, но импортирует npm/cdn-пакет 'three' через bare
// specifier из importmap в index.html — конфликта имён нет, это разные
// механизмы резолва путей у бандлера... точнее у самого браузера.
//
// Есть циклическая зависимость с schedule.js и roomPanel.js: applyGroup,
// updatePairsUI, showRoomPanel, hideRoomPanel используются только внутри
// тел функций/обработчиков, а не на верхнем уровне модуля, поэтому порядок
// вычисления модулей не важен.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import {
    isMobile, FIT_MARGIN, FLOOR_MODELS, DIAGONAL_MARGIN, FRUSTUM_MARGIN,
    FIXED_AZIMUTH, FIXED_POLAR, floorRoomConfigs, COLOR_WHITE, COLOR_SELECTED,
    ANIMATION_DURATION, statusColors, DRAG_THRESHOLD
} from './config.js';

import {
    container, modelLoading, clickInfoDiv, stubOverlay, floorNumbers,
    roomMeshes, setRoomMeshes,
    highlightedMeshes, setHighlightedMeshes,
    selectedMesh, setSelectedMesh,
    activeHighlightedMesh, setActiveHighlightedMesh,
    currentGroup, setCurrentFloor,
    setCurrentSchedule
} from './state.js';

import { showRoomPanel, hideRoomPanel } from './roomPanel.js';
import { applyGroup, updatePairsUI } from './schedule.js';

// инициализация three.js сцены
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f2ea);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
camera.position.set(0, 10, 0);
camera.lookAt(0, 0, 0);

// создание рендерера и добавление его в контейнер
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// добавление освещения
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// настройка управления камерой
export const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.screenSpacePanning = true;
controls.enableZoom = true;
controls.zoomSpeed = 1.2;
controls.enableRotate = true;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI / 2;
controls.enablePan = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
controls.update();

// на мобильных отключаем вращение, оставляем панорамирование и зум
if (isMobile) {
    controls.enableRotate = false;
    controls.touches.ONE = THREE.TOUCH.PAN;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
}
controls.update();

// инициализация raycaster для обработки кликов
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const pointerDownPos = new THREE.Vector2();
let isPointerDown = false;

// загрузка glb-модели
const loader = new GLTFLoader();

// ссылка на загруженную модель — нужна кнопке «Сбросить вид»
let loadedModel = null;

// анимация запускается один раз, дальше рисует текущую сцену
let animationStarted = false;

// какой этаж сейчас активен (загружен или ещё грузится) — блокирует повторный
// клик по тому же этажу и делает так, что при быстрой смене кликов
// применится только самый последний запрошенный этаж
let activeFloor = null;
let loadToken = 0;

// загрузка плана выбранного этажа, вызывается при каждом переключении
export function loadFloorModel(floor) {
    const url = FLOOR_MODELS[floor];
    if (!url) return;

    const token = ++loadToken;

    if (loadedModel) {
        scene.remove(loadedModel);
        loadedModel = null;
    }

    setRoomMeshes([]);
    setHighlightedMeshes([]);
    setSelectedMesh(null);
    setActiveHighlightedMesh(null);

    modelLoading.classList.remove('hidden');
    modelLoading.querySelector('.spinner').style.display = '';
    modelLoading.querySelector('p').textContent = 'Загружаем план этажа…';

    loader.load(
        url,
        (gltf) => {
            if (token !== loadToken) return; // ответ от уже неактуальной загрузки

            const model = gltf.scene;
            loadedModel = model;
            scene.add(model);

            // собираем все меши в массив
            model.traverse((child) => {
                if (child.isMesh) roomMeshes.push(child);
            });

            // конфиг кабинетов у каждого этажа свой
            const floorConfig = floorRoomConfigs[floor] || {};

            // сопоставляем каждый меш с конфигурацией кабинета
            roomMeshes.forEach((mesh, index) => {
                let config = null;
                let roomId = null;
                const name = mesh.name || '';

                for (const id in floorConfig) {
                    if (name.includes(id)) {
                        config = floorConfig[id];
                        roomId = id;
                        break;
                    }
                }

                if (config) {
                    mesh.userData.roomId = roomId;
                    mesh.userData.roomNumber = config.number;
                    mesh.userData.roomName = config.name;
                    mesh.userData.showPanel = config.showPanel;
                } else {
                    mesh.userData.roomId = roomId || name || `unknown_${index}`;
                    mesh.userData.roomNumber = '';
                    mesh.userData.roomName = name || `Объект ${index}`;
                    mesh.userData.showPanel = false;
                }

                // клонируем материал, чтобы можно было менять цвет индивидуально
                if (mesh.material) {
                    mesh.material = Array.isArray(mesh.material)
                        ? mesh.material.map((mat) => mat.clone())
                        : mesh.material.clone();
                }
            });

            // подгоняем камеру под модель и запускаем анимацию
            fitCameraToModel(model);
            resetAllRoomsToWhite();
            modelLoading.classList.add('hidden');

            if (!animationStarted) {
                animationStarted = true;
                animate();
            }

            // подсветка пар на новом этаже
            if (currentGroup) applyGroup(currentGroup);
        },
        undefined,
        (error) => {
            if (token !== loadToken) return; // ответ от уже неактуальной загрузки

            console.error('Ошибка загрузки модели:', error);
            modelLoading.querySelector('.spinner').style.display = 'none';
            modelLoading.querySelector('p').textContent = 'Ошибка соединения. Попробуйте выбрать этаж ещё раз.';
            activeFloor = null; // разрешаем повторную попытку по клику на тот же этаж
        }
    );
}

// функция подгонки камеры под размеры модели
function fitCameraToModel(model) {
    model.rotation.y = 0;
    model.position.set(0, 0, 0);
    model.updateMatrixWorld(true);

    const rawSize = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    if (rawSize.x > rawSize.z) {
        model.rotation.y = Math.PI / 2;
        model.updateMatrixWorld(true);
    }

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const diagonal = Math.sqrt(size.x ** 2 + size.y ** 2 + size.z ** 2);

    model.position.sub(center);
    model.updateMatrixWorld(true);
    controls.target.set(0, 0, 0);

    const camDistance = diagonal * DIAGONAL_MARGIN + 10;
    const polar = FIXED_POLAR;
    const azimuth = FIXED_AZIMUTH;
    camera.position.set(
        camDistance * Math.sin(polar) * Math.sin(azimuth),
        camDistance * Math.cos(polar),
        camDistance * Math.sin(polar) * Math.cos(azimuth)
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
    camera.far = diagonal * 10 + 1000;
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

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

// подпись с id по obj.
// первым идёт id меша из модели (это ключ для roomConfig), следом номер
// и название кабинета, если заданы.
export function showClickInfo(mesh) {
    if (!clickInfoDiv) return;

    if (!mesh) {
        clickInfoDiv.textContent = '';
        return;
    }

    const { roomId, roomNumber, roomName } = mesh.userData;
    const details = [roomNumber, roomName].filter(Boolean).join(' · ');
    clickInfoDiv.textContent = details ? `ID ${roomId} — ${details}` : `ID ${roomId}`;
}

// хранилище активных анимаций для возможности отмены
const activeAnimations = new Map();

// получение текущего цвета меша
function getMeshColor(mesh) {
    return Array.isArray(mesh.material) ? mesh.material[0].color.getHex() : mesh.material.color.getHex();
}

// мгновенная установка цвета
function setMeshColorInstant(mesh, hexColor) {
    if (!mesh.material) return;
    if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => mat.color.setHex(hexColor));
    } else {
        mesh.material.color.setHex(hexColor);
    }
    mesh.material.needsUpdate = true;
}

// плавная анимация изменения цвета
export function animateMeshColor(mesh, targetHex, duration = ANIMATION_DURATION) {
    if (!mesh.material) return;
    if (activeAnimations.has(mesh)) {
        cancelAnimationFrame(activeAnimations.get(mesh));
        activeAnimations.delete(mesh);
    }
    const startColor = new THREE.Color(getMeshColor(mesh));
    const targetColor = new THREE.Color(targetHex);
    const startTime = performance.now();

    function step(now) {
        const t = Math.min((now - startTime) / duration, 1);
        setMeshColorInstant(mesh, startColor.clone().lerp(targetColor, t).getHex());
        if (t < 1) {
            activeAnimations.set(mesh, requestAnimationFrame(step));
        } else {
            activeAnimations.delete(mesh);
        }
    }
    activeAnimations.set(mesh, requestAnimationFrame(step));
}

// сброс всех кабинетов к белому цвету
export function resetAllRoomsToWhite(instant = true) {
    roomMeshes.forEach((mesh) => {
        if (mesh.userData.showPanel) {
            if (instant) setMeshColorInstant(mesh, COLOR_WHITE);
            else animateMeshColor(mesh, COLOR_WHITE);
        }
    });
}

// получение цвета в зависимости от статуса пары
export function getStatusColor(status, variant = 'normal') {
    if (status === 'past') return COLOR_WHITE;
    return statusColors[status]?.[variant] ?? COLOR_WHITE;
}

// сброс активной подсветки (выбранного или активного кабинета)
export function resetActiveSelection() {
    if (activeHighlightedMesh) {
        const status = activeHighlightedMesh.userData.pairStatus;
        animateMeshColor(activeHighlightedMesh, status && status !== 'past' ? getStatusColor(status, 'normal') : COLOR_WHITE);
        setActiveHighlightedMesh(null);
    }
    if (selectedMesh) {
        animateMeshColor(selectedMesh, COLOR_WHITE);
        setSelectedMesh(null);
    }
}

// обработка клика по 3d-сцене
function handleClick(event) {
    const clientX = event.clientX ?? event.touches?.[0]?.clientX;
    const clientY = event.clientY ?? event.touches?.[0]?.clientY;
    if (clientX == null || clientY == null) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(roomMeshes, false);

    resetActiveSelection();

    if (intersects.length === 0) {
        hideRoomPanel();
        showClickInfo(null);
        return;
    }

    const mesh = intersects[0].object;
    const userData = mesh.userData;
    // подпись показываем для любого объекта, даже если карточки у него нет
    showClickInfo(mesh);

    if (highlightedMeshes.includes(mesh)) {
        const status = mesh.userData.pairStatus;
        if (status && status !== 'past') animateMeshColor(mesh, getStatusColor(status, 'bright'));
        setActiveHighlightedMesh(mesh);
        showRoomPanel(userData.roomNumber, userData.roomName);
    } else if (userData.showPanel) {
        animateMeshColor(mesh, COLOR_SELECTED);
        setSelectedMesh(mesh);
        showRoomPanel(userData.roomNumber || '', userData.roomName);
    } else {
        hideRoomPanel();
    }
}

// регистрация событий pointer и touch для различения клика и перетаскивания
renderer.domElement.addEventListener('pointerdown', (event) => {
    isPointerDown = true;
    pointerDownPos.set(event.clientX, event.clientY);
});
renderer.domElement.addEventListener('pointerup', (event) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    const dx = event.clientX - pointerDownPos.x;
    const dy = event.clientY - pointerDownPos.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) handleClick(event);
});
renderer.domElement.addEventListener('touchstart', (event) => {
    if (event.touches.length === 1) {
        isPointerDown = true;
        pointerDownPos.set(event.touches[0].clientX, event.touches[0].clientY);
    } else {
        isPointerDown = false;
    }
});
renderer.domElement.addEventListener('touchend', (event) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    const touch = event.changedTouches[0];
    if (Math.hypot(touch.clientX - pointerDownPos.x, touch.clientY - pointerDownPos.y) < DRAG_THRESHOLD) {
        handleClick(touch);
    }
});

// переключение этажей
export function setFloor(floor) {
    if (floor === activeFloor) return; // этот этаж уже активен или грузится — повторный клик игнорируем
    activeFloor = floor;

    setCurrentFloor(floor);

    floorNumbers.forEach((span) => {
        const isActive = parseInt(span.dataset.floor, 10) === floor;
        span.classList.toggle('active', isActive);
        span.setAttribute('aria-current', isActive ? 'true' : 'false');
    });

    const hasModel = Boolean(FLOOR_MODELS[floor]);
    stubOverlay.classList.toggle('visible', !hasModel);

    setCurrentSchedule([]);
    updatePairsUI([]);
    hideRoomPanel();
    showClickInfo(null);

    if (hasModel) {
        // модель грузится заново; расписание подтянется в ее колбэке
        loadFloorModel(floor);
    } else {
        resetAllRoomsToWhite(true);
        setHighlightedMeshes([]);
        setSelectedMesh(null);
        setActiveHighlightedMesh(null);
    }
}

floorNumbers.forEach((span) => {
    span.addEventListener('click', () => setFloor(parseInt(span.dataset.floor, 10)));
    span.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setFloor(parseInt(span.dataset.floor, 10));
        }
    });
});

// основной цикл анимации
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Обработка изменения размеров контейнера.
//
// Раньше здесь вызывался controls.handleResize() — такого метода у
// OrbitControls нет, и обработчик падал с ошибкой на каждом ресайзе.
// Из-за этого же не пересчитывались границы видимой области камеры:
// ортокамера, в отличие от перспективной, не выводит их из размера
// холста сама, и модель растягивалась при смене размера окна.
// Высоту области оставляем прежней, а ширину заново считаем из пропорций.
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

// кнопка Сбросить вид: возвращает камеру в исходное положение,
// если пользователь увёл карту зумом или перетаскиванием
document.getElementById('reset-view').addEventListener('click', () => {
    if (loadedModel) fitCameraToModel(loadedModel);
});
