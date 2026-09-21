// Общие элементы интерфейса: сайдбар, свайп для его открытия на мобильных,
// ссылка на страницу недельного расписания, звук заглушки этажа, сохранение
// темы оформления. В конце файла — закомментированный код старого режима
// отладки (не удалён по требованию — см. план рефакторинга).
import { WEEK_SCHEDULE_PAGE_URL, THEME_STORAGE_KEY, DEBUG_STORAGE_KEY, DEBUG_UNLOCK_TAPS, DEBUG_VIDEO_TAPS, SWIPE_EDGE_THRESHOLD, SWIPE_MIN_DISTANCE } from './config.js';
import { sidebarToggle, sidebar, weekDetailsBtn, currentGroup, currentFloor, stubOverlay, clickInfoDiv, floorNumbers } from './state.js';
import { applyThemeBackground } from './three.js';

// управление сайдбаром
export function setSidebarOpen(open) {
    sidebar.classList.toggle('open', open);
    sidebar.setAttribute('aria-hidden', String(!open));
    sidebarToggle.setAttribute('aria-expanded', String(open));
}

sidebarToggle.addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('open')));

// Кнопки «Применить» больше нет: группу применяет открытие расписания,
// см. applySelectedGroupIfNeeded в schedule.js.

// Переход на страницу недельного расписания.
//
// Кнопка «На неделю» сейчас закомментирована в разметке, поэтому
// getElementById вернул null. Раньше на этом месте скрипт обрывался
// и переставало работать всё, что регистрируется ниже: закрытие
// сайдбара, свайпы, сброс вида, применение группы. Проверка ниже
// делает обработчик необязательным — вернёте кнопку в index.html,
// и переход заработает сам, без правок здесь.
if (weekDetailsBtn) {
    weekDetailsBtn.addEventListener('click', () => {
        const params = new URLSearchParams({ group: currentGroup || '', floor: currentFloor });
        window.location.href = `${WEEK_SCHEDULE_PAGE_URL}?${params.toString()}`;
    });
}

// свайп от левого края для открытия сайдбара на мобильных
let swipeStartX = null;
let swipeStartY = null;
let isSwipeGesture = false;

document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    if (touch.clientX <= SWIPE_EDGE_THRESHOLD) {
        swipeStartX = touch.clientX;
        swipeStartY = touch.clientY;
        isSwipeGesture = true;
    } else {
        swipeStartX = null;
        swipeStartY = null;
        isSwipeGesture = false;
    }
}, { passive: true });

document.addEventListener('touchmove', (event) => {
    if (!isSwipeGesture || swipeStartX === null || swipeStartY === null) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - swipeStartX;
    const deltaY = touch.clientY - swipeStartY;

    if (deltaX > SWIPE_MIN_DISTANCE && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (!sidebar.classList.contains('open')) {
            setSidebarOpen(true);
        }
        isSwipeGesture = false;
        swipeStartX = null;
        swipeStartY = null;
        event.preventDefault();
    }
}, { passive: false });

document.addEventListener('touchend', () => {
    isSwipeGesture = false;
    swipeStartX = null;
    swipeStartY = null;
});

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
