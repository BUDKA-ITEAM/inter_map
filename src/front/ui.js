// Общие элементы интерфейса: сайдбар, свайп для его открытия на мобильных,
// ссылка на страницу недельного расписания, звук заглушки этажа, сохранение
// темы оформления. В конце файла — закомментированный код старого режима
// отладки (не удалён по требованию — см. план рефакторинга).
import { THEME_STORAGE_KEY, DEBUG_STORAGE_KEY, DEBUG_UNLOCK_TAPS, DEBUG_VIDEO_TAPS, SWIPE_EDGE_THRESHOLD, SWIPE_MIN_DISTANCE } from './config.js';
import { sidebarToggle, sidebar, stubOverlay, clickInfoDiv, floorNumbers } from './state.js';
import { applyThemeBackground } from './three.js';

const scheduleDrawer = document.getElementById('schedule-drawer');
const scheduleDrawerToggle = document.getElementById('schedule-drawer-toggle');

function isNarrowScreen() {
    return window.matchMedia('(max-width: 768px)').matches;
}

// управление сайдбаром
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

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && scheduleDrawer.classList.contains('open')) setScheduleDrawerOpen(false);
});

document.addEventListener('pointerdown', (event) => {
    if (!scheduleDrawer.classList.contains('open')) return;
    if (scheduleDrawer.contains(event.target)) return;
    if (event.target.closest('#schedule-drawer-toggle')) return;
    if (event.target.closest('#open-schedule-drawer')) return;
    setScheduleDrawerOpen(false);
});

// Кнопки «Применить» больше нет: группу применяет открытие расписания,
// см. applySelectionIfNeeded в schedule.js.

let swipeStartX = null;
let swipeStartY = null;
let isSwipeGesture = false;
let swipeFromLeftEdge = false;
let swipeFromRightEdge = false;

function resetSwipe() {
    swipeStartX = null;
    swipeStartY = null;
    isSwipeGesture = false;
    swipeFromLeftEdge = false;
    swipeFromRightEdge = false;
}

document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) {
        resetSwipe();
        return;
    }

    const touch = event.touches[0];
    const fromLeft = touch.clientX <= SWIPE_EDGE_THRESHOLD;
    const fromRight = touch.clientX >= window.innerWidth - SWIPE_EDGE_THRESHOLD;
    const anyOpen = sidebar.classList.contains('open') || scheduleDrawer.classList.contains('open');

    if (!fromLeft && !fromRight && !anyOpen) {
        resetSwipe();
        return;
    }

    swipeStartX = touch.clientX;
    swipeStartY = touch.clientY;
    isSwipeGesture = true;
    swipeFromLeftEdge = fromLeft;
    swipeFromRightEdge = fromRight;
}, { passive: true });

document.addEventListener('touchmove', (event) => {
    if (!isSwipeGesture || swipeStartX === null || swipeStartY === null) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - swipeStartX;
    const deltaY = touch.clientY - swipeStartY;

    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;

    const sidebarOpen = sidebar.classList.contains('open');
    const drawerOpen = scheduleDrawer.classList.contains('open');
    let handled = false;

    if (deltaX > 0) {
        if (drawerOpen) {
            setScheduleDrawerOpen(false);
            handled = true;
        } else if (swipeFromLeftEdge && !sidebarOpen) {
            setSidebarOpen(true);
            handled = true;
        }
    } else if (sidebarOpen) {
        setSidebarOpen(false);
        handled = true;
    } else if (swipeFromRightEdge && !drawerOpen) {
        setScheduleDrawerOpen(true);
        handled = true;
    }

    if (!handled) return;
    resetSwipe();
    event.preventDefault();
}, { passive: false });

document.addEventListener('touchend', resetSwipe);

// Нажатие по затемнению позади шторки закрывает её — привычное
// поведение мобильных панелей. На десктопе затемнения не видно
// и нажатий оно не ловит, поэтому обработчик там не срабатывает.
document.getElementById('sidebar-scrim').addEventListener('click', () => {
    setSidebarOpen(false);
});

// закрытие сайдбара кнопкой-крестиком (показывается на мобильных)
document.getElementById('sidebar-close').addEventListener('click', () => {
    setSidebarOpen(false);
});

// важнейшая функция //
const stubVideo = document.querySelector('.stub-video');
if (stubVideo) {
    stubOverlay.addEventListener('click', () => {
        stubVideo.muted = !stubVideo.muted;
        if (stubVideo.paused) stubVideo.play();
    });
}

// сохранение и восстановление темы оформления
const themeToggle = document.getElementById('theme-toggle');

export function initTheme() {
    let saved = null;
    try {
        saved = localStorage.getItem(THEME_STORAGE_KEY);
    } catch (error) {
        saved = null; // приватный режим — не восстанавливаем
    }
    if (saved === 'dark') {
        themeToggle.checked = true;
    }
    applyThemeBackground();
    // saved === 'light' / null / хранилище недоступно — оставляем поведение по умолчанию
}

themeToggle.addEventListener('change', () => {
    applyThemeBackground();
    try {
        localStorage.setItem(THEME_STORAGE_KEY, themeToggle.checked ? 'dark' : 'light');
    } catch (error) {
        // приватный режим — не запоминаем выбор
    }
});


// РЕЖИМ ОТЛАДКИ
let debugTaps = 0;

function setDebugMode(enabled) {
    document.documentElement.dataset.debug = enabled ? 'on' : 'off';
    try {
        localStorage.setItem(DEBUG_STORAGE_KEY, enabled ? 'on' : 'off');
    } catch (error) {
    }
    if (clickInfoDiv) {
        clickInfoDiv.textContent = enabled ? 'Режим отладки включён' : '';
    }
}

floorNumbers.forEach((span) => {
    span.addEventListener('click', () => {
        if (span.dataset.floor !== '2') {
            debugTaps = 0;
            return;
        }

        debugTaps += 1;
        if (debugTaps < DEBUG_UNLOCK_TAPS) return;

        debugTaps = 0;
        setDebugMode(document.documentElement.dataset.debug !== 'on');
    });
});

export function initDebugMode() {
    let saved = null;
    try {
        saved = localStorage.getItem(DEBUG_STORAGE_KEY);
    } catch (error) {
        saved = null;
    }
    document.documentElement.dataset.debug = saved === 'on' ? 'on' : 'off';
}

let videoTaps = 0;

function playDebugVideo() {
    if (!stubVideo) return;
    stubOverlay.classList.add('visible');
    stubVideo.currentTime = 0;
    stubVideo.muted = false;
    stubVideo.play().catch(() => {});
}

floorNumbers.forEach((span) => {
    span.addEventListener('click', () => {
        if (span.dataset.floor !== '2') {
            videoTaps = 0;
            return;
        }

        videoTaps += 1;
        if (videoTaps < DEBUG_VIDEO_TAPS) return;

        videoTaps = 0;
        if (document.documentElement.dataset.debug !== 'on') return;
        if (debugConfirm) debugConfirm.hidden = false;
        else playDebugVideo();
    });
});

const debugConfirm = document.getElementById('debug-confirm');
const debugConfirmYes = document.getElementById('debug-confirm-yes');
const debugConfirmNo = document.getElementById('debug-confirm-no');

if (debugConfirmYes && debugConfirmNo) {
    debugConfirmYes.addEventListener('click', () => {
        debugConfirm.hidden = true;
        playDebugVideo();
    });

    debugConfirmNo.addEventListener('click', () => {
        debugConfirm.hidden = true;
    });
}

let themeSwitches = 0;

const EXTRAS_UNLOCK_SWITCHES = 20;
const SWITCH_COUNT_KEY = 'intermap.themeSwitches.v2';

let extrasRequested = false;

function unlockExtrasIfEarned() {
    if (extrasRequested || themeSwitches < EXTRAS_UNLOCK_SWITCHES) return;
    extrasRequested = true;
    import('./extras.js').then((module) => module.mount());
}

themeToggle.addEventListener('change', () => {
    themeSwitches += 1;
    try {
        localStorage.setItem(SWITCH_COUNT_KEY, String(themeSwitches));
    } catch (error) {
    }
    unlockExtrasIfEarned();
});

export function initExtrasUnlock() {
    let saved = null;
    try {
        saved = localStorage.getItem(SWITCH_COUNT_KEY);
    } catch (error) {
        saved = null;
    }
    const parsed = Number.parseInt(saved ?? '', 10);
    themeSwitches = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    unlockExtrasIfEarned();
}
