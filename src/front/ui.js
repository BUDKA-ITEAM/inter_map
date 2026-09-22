// Сайдбар настроек, правая шторка расписания, свайпы между ними,
// тема оформления и скрытый режим отладки.
import {
    THEME_STORAGE_KEY, DEBUG_STORAGE_KEY, DEBUG_UNLOCK_TAPS, DEBUG_VIDEO_TAPS,
    SWIPE_EDGE_THRESHOLD, SWIPE_MIN_DISTANCE, MOBILE_BREAKPOINT,
    EXTRAS_UNLOCK_SWITCHES, SWITCH_COUNT_STORAGE_KEY, HORIZONTAL_GESTURE_RATIO
} from './config.js';
import { sidebarToggle, sidebar, stubOverlay, clickInfoDiv, floorNumbers } from './state.js';
import { readStored, writeStored } from './storage.js';
import { applyThemeBackground } from './three.js';

const scheduleDrawer = document.getElementById('schedule-drawer');
const scheduleDrawerToggle = document.getElementById('schedule-drawer-toggle');
const themeToggle = document.getElementById('theme-toggle');
const stubVideo = document.querySelector('.stub-video');
const debugConfirm = document.getElementById('debug-confirm');

export function isNarrowScreen() {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

export function setSidebarOpen(open) {
    sidebar.classList.toggle('open', open);
    sidebar.setAttribute('aria-hidden', String(!open));
    sidebarToggle.setAttribute('aria-expanded', String(open));
    if (open && isNarrowScreen()) setScheduleDrawerOpen(false);
}

export function setScheduleDrawerOpen(open) {
    scheduleDrawer.classList.toggle('open', open);
    scheduleDrawer.setAttribute('aria-hidden', String(!open));
    scheduleDrawerToggle.setAttribute('aria-expanded', String(open));
    if (open && isNarrowScreen()) setSidebarOpen(false);
}

sidebarToggle.addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('open')));
scheduleDrawerToggle.addEventListener('click', () => setScheduleDrawerOpen(true));

document.getElementById('open-schedule-drawer').addEventListener('click', () => setScheduleDrawerOpen(true));
document.getElementById('schedule-drawer-close').addEventListener('click', () => setScheduleDrawerOpen(false));
document.getElementById('schedule-drawer-scrim').addEventListener('click', () => setScheduleDrawerOpen(false));
document.getElementById('sidebar-scrim').addEventListener('click', () => setSidebarOpen(false));
document.getElementById('sidebar-close').addEventListener('click', () => setSidebarOpen(false));

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && scheduleDrawer.classList.contains('open')) setScheduleDrawerOpen(false);
});

document.addEventListener('pointerdown', (event) => {
    if (!scheduleDrawer.classList.contains('open')) return;
    if (scheduleDrawer.contains(event.target)) return;
    if (event.target.closest('#schedule-drawer-toggle, #open-schedule-drawer')) return;
    setScheduleDrawerOpen(false);
});

// Горизонтальные свайпы: от левого края — настройки, от правого — расписание.
// Открытую шторку закрывает обратный свайп, начатый в любой точке экрана.
const swipe = {
    startX: 0,
    startY: 0,
    active: false,
    fromLeftEdge: false,
    fromRightEdge: false
};

function resetSwipe() {
    swipe.active = false;
    swipe.fromLeftEdge = false;
    swipe.fromRightEdge = false;
}

function handleSwipe(deltaX) {
    const sidebarOpen = sidebar.classList.contains('open');
    const drawerOpen = scheduleDrawer.classList.contains('open');

    if (deltaX > 0) {
        if (drawerOpen) {
            setScheduleDrawerOpen(false);
            return true;
        }
        if (swipe.fromLeftEdge && !sidebarOpen) {
            setSidebarOpen(true);
            return true;
        }
        return false;
    }

    if (sidebarOpen) {
        setSidebarOpen(false);
        return true;
    }
    if (swipe.fromRightEdge && !drawerOpen) {
        setScheduleDrawerOpen(true);
        return true;
    }
    return false;
}

document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) {
        resetSwipe();
        return;
    }

    const [touch] = event.touches;
    const fromLeftEdge = touch.clientX <= SWIPE_EDGE_THRESHOLD;
    const fromRightEdge = touch.clientX >= window.innerWidth - SWIPE_EDGE_THRESHOLD;
    const anyOpen = sidebar.classList.contains('open') || scheduleDrawer.classList.contains('open');

    if (!fromLeftEdge && !fromRightEdge && !anyOpen) {
        resetSwipe();
        return;
    }

    swipe.startX = touch.clientX;
    swipe.startY = touch.clientY;
    swipe.active = true;
    swipe.fromLeftEdge = fromLeftEdge;
    swipe.fromRightEdge = fromRightEdge;
}, { passive: true });

document.addEventListener('touchmove', (event) => {
    if (!swipe.active) return;

    const [touch] = event.touches;
    const deltaX = touch.clientX - swipe.startX;
    const deltaY = touch.clientY - swipe.startY;

    const longEnough = Math.abs(deltaX) >= SWIPE_MIN_DISTANCE;
    const horizontal = Math.abs(deltaX) >= Math.abs(deltaY) * HORIZONTAL_GESTURE_RATIO;
    if (!longEnough || !horizontal) return;

    if (!handleSwipe(deltaX)) return;
    resetSwipe();
    event.preventDefault();
}, { passive: false });

document.addEventListener('touchend', resetSwipe);

// важнейшая функция //
stubOverlay.addEventListener('click', () => {
    stubVideo.muted = !stubVideo.muted;
    if (stubVideo.paused) stubVideo.play();
});

export function initTheme() {
    if (readStored(THEME_STORAGE_KEY) === 'dark') themeToggle.checked = true;
    applyThemeBackground();
}

themeToggle.addEventListener('change', () => {
    applyThemeBackground();
    writeStored(THEME_STORAGE_KEY, themeToggle.checked ? 'dark' : 'light');
});

// ---------------------------------------------------------------------------
// РЕЖИМ ОТЛАДКИ: серия нажатий по номеру второго этажа
// ---------------------------------------------------------------------------

const DEBUG_FLOOR = '2';

function setDebugMode(enabled) {
    document.documentElement.dataset.debug = enabled ? 'on' : 'off';
    writeStored(DEBUG_STORAGE_KEY, enabled ? 'on' : 'off');
    clickInfoDiv.textContent = enabled ? 'Режим отладки включён' : '';
}

function isDebugMode() {
    return document.documentElement.dataset.debug === 'on';
}

export function initDebugMode() {
    document.documentElement.dataset.debug = readStored(DEBUG_STORAGE_KEY) === 'on' ? 'on' : 'off';
}

function playDebugVideo() {
    stubOverlay.classList.add('visible');
    stubVideo.currentTime = 0;
    stubVideo.muted = false;
    stubVideo.play().catch(() => {});
}


function countFloorTaps(limit, onReached) {
    let taps = 0;

    floorNumbers.forEach((span) => {
        span.addEventListener('click', () => {
            if (span.dataset.floor !== DEBUG_FLOOR) {
                taps = 0;
                return;
            }

            taps += 1;
            if (taps < limit) return;

            taps = 0;
            onReached();
        });
    });
}

countFloorTaps(DEBUG_UNLOCK_TAPS, () => setDebugMode(!isDebugMode()));

countFloorTaps(DEBUG_VIDEO_TAPS, () => {
    if (isDebugMode()) debugConfirm.hidden = false;
});

document.getElementById('debug-confirm-yes').addEventListener('click', () => {
    debugConfirm.hidden = true;
    playDebugVideo();
});

document.getElementById('debug-confirm-no').addEventListener('click', () => {
    debugConfirm.hidden = true;
});



let themeSwitches = 0;
let extrasRequested = false;

async function unlockExtrasIfEarned() {
    if (extrasRequested || themeSwitches < EXTRAS_UNLOCK_SWITCHES) return;
    extrasRequested = true;
    const extras = await import('./extras.js');
    extras.mount();
}

themeToggle.addEventListener('change', () => {
    themeSwitches += 1;
    writeStored(SWITCH_COUNT_STORAGE_KEY, String(themeSwitches));
    unlockExtrasIfEarned();
});

export function initExtrasUnlock() {
    const saved = Number.parseInt(readStored(SWITCH_COUNT_STORAGE_KEY) ?? '', 10);
    themeSwitches = Number.isFinite(saved) && saved > 0 ? saved : 0;
    unlockExtrasIfEarned();
}
