// Общие элементы интерфейса: сайдбар, свайп для его открытия на мобильных,
// ссылка на страницу недельного расписания, звук заглушки этажа, сохранение
// темы оформления. В конце файла — закомментированный код старого режима
// отладки (не удалён по требованию — см. план рефакторинга).
import { WEEK_SCHEDULE_PAGE_URL, THEME_STORAGE_KEY, SWIPE_EDGE_THRESHOLD, SWIPE_MIN_DISTANCE } from './config.js';
import { sidebarToggle, sidebar, weekDetailsBtn, currentGroup, currentFloor, stubOverlay } from './state.js';

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
    // saved === 'light' / null / хранилище недоступно — оставляем поведение по умолчанию
}

themeToggle.addEventListener('change', () => {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, themeToggle.checked ? 'dark' : 'light');
    } catch (error) {
        // приватный режим — не запоминаем выбор
    }
});

// ---------------------------------------------------------------------------
// РЕЖИМ ОТЛАДКИ
//
// подпись с id объекта нужна только крутым. от обычного пользователя она скрыта и
// включается двадцатью нажатиями подряд на этаж 2. Столько же нажатий
// выключает обратно. состояние запоминается в браузере.
// ---------------------------------------------------------------------------

// Ниже — закомментированный код старого режима отладки. Оставлен по просьбе
// автора проекта, не удалять.
//c//onst DEBUG_STORAGE_KEY = 'intermap.debug';
//const DEBUG_UNLOCK_TAPS = 20;

//let debugTaps = 0;

//function setDebugMode(enabled) {
 //   document.documentElement.dataset.debug = enabled ? 'on' : 'off';
//    try {
//        localStorage.setItem(DEBUG_STORAGE_KEY, enabled ? 'on' : 'off');
//    } catch (error) {
 //       // приватный режим — просто не запоминаем
 //   }
 //   if (clickInfoDiv) {
 //       clickInfoDiv.textContent = enabled ? 'Режим отладки включён' : '';
//    }
//}

//floorNumbers.forEach((span) => {
 //   span.addEventListener('click', () => {
 //       // счётчик считает нажатия подряд: другой этаж сбрасывает его
  //      if (span.dataset.floor !== '2') {
  //          debugTaps = 0;
  //          return;
  //      }
//
//        debugTaps += 1;
 //       if (debugTaps < DEBUG_UNLOCK_TAPS) return;
//
//        debugTaps = 0;
 //       setDebugMode(document.documentElement.dataset.debug !== 'on');
//    });
//});

// восстановление режима после перезагрузки
