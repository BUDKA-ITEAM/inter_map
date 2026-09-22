// Расписание: запросы к api, список пар в нижней шторке, подсветка кабинетов
// на карте и переход «пара → кабинет → назад».
//
// Циклическая зависимость с three.js, roomPanel.js и groups.js разрешена тем,
// что импортированные оттуда функции вызываются только внутри тел функций.
import {
    API_BASE_URL, API_TIMEOUT_MS, LESSONS_ENDPOINT, GROUPS_SCAN_LIMIT,
    FLOOR_MODELS, floorRoomConfigs, SHEET_EDGE_THRESHOLD, SHEET_MIN_DISTANCE,
    VERTICAL_GESTURE_RATIO, WEEKDAY_TITLES
} from './config.js';

import {
    pairsContainer, dateInput, prevDayBtn, nextDayBtn, groupSelect, roomPanel, roomPanelBack,
    currentGroup, setCurrentGroup,
    currentTeacher, setCurrentTeacher,
    scheduleMode,
    viewMode, setViewMode,
    currentSchedule, setCurrentSchedule,
    currentDate, setCurrentDate,
    currentFloor,
    highlightedMeshes, setHighlightedMeshes,
    setSelectedMesh, setActiveHighlightedMesh,
    roomMeshes,
    scheduleCollapsedForRoom, setScheduleCollapsedForRoom
} from './state.js';

import {
    animateMeshColor, resetAllRoomsToWhite, getStatusColor, resetActiveSelection,
    roomSelectedColor, showClickInfo, controls, setFloor
} from './three.js';

import { FALLBACK_LESSONS } from './fallbackSchedule.js';
import { showRoomPanel, hideRoomPanel } from './roomPanel.js';
import { setSidebarOpen, setScheduleDrawerOpen, isNarrowScreen } from './ui.js';
import { splitGroupField } from './groups.js';

// ---------------------------------------------------------------------------
// ДАТЫ
// ---------------------------------------------------------------------------

// toISOString() переводит время в UTC: ночью в Москве приложение открывалось
// на вчерашнем дне, а вечером в западных поясах — на завтрашнем.
export function getDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// new Date('2026-09-22') читается как UTC-полночь и в западных поясах
// сдвигает день назад, поэтому собираем дату по частям.
export function parseDateString(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function shortDate(dateStr) {
    const [, month, day] = dateStr.split('-');
    return `${day}.${month}`;
}

function weekDaysFor(dateStr) {
    const monday = parseDateString(dateStr);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

    return WEEKDAY_TITLES.map((title, index) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + index);
        return { title, date: getDateString(day) };
    });
}

// ---------------------------------------------------------------------------
// ЗАПРОСЫ
// ---------------------------------------------------------------------------

export async function fetchFromApi(path, params) {
    const url = `${API_BASE_URL}${path}?${params}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`сервер ответил ${response.status}`);
        return await response.json();
    } catch (error) {
        // сюда попадают таймаут, обрыв связи и блокировка ответа по cors
        const reason = error.name === 'AbortError'
            ? `нет ответа за ${API_TIMEOUT_MS / 1000} с (${url})`
            : `${error.message} (${url})`;
        console.warn(`Api недоступен: ${reason}. Показываем тестовое расписание.`);
        return FALLBACK_LESSONS;
    } finally {
        clearTimeout(timer);
    }
}

function fetchLessons({ from, to, ...extraParams }) {
    const params = new URLSearchParams({
        ...extraParams,
        date_from: from,
        date_to: to,
        limit: String(GROUPS_SCAN_LIMIT)
    });
    return fetchFromApi(LESSONS_ENDPOINT, params);
}

function trimSeconds(time) {
    return (time || '').slice(0, 5);
}

function lessonToPair(lesson, dayDate = null) {
    const { time_start: start, time_end: end, subject, room_number: room } = lesson;
    return {
        time: `${trimSeconds(start)} - ${trimSeconds(end)}`,
        name: subject,
        roomId: room,
        teacher: lesson.teacher_name,
        group: lesson.group,
        date: dayDate ?? (lesson.date ? String(lesson.date).slice(0, 10) : null)
    };
}

// Фильтр по группе делаем на клиенте: в одном уроке поле group содержит
// несколько групп через запятую, и серверный фильтр сравнивает строку целиком.
// Заодно это спасает от ложных совпадений «01-23.Д.ОФ.9» внутри «01-23.Д.ОФ.99».
function matchesGroup(lesson, group) {
    return splitGroupField(lesson.group).includes(group);
}

function matchesTeacher(lesson, teacher) {
    if (lesson.teacher_id && teacher.id) return lesson.teacher_id === teacher.id;
    return lesson.teacher_name === teacher.name;
}

export async function fetchSchedule(group, dateStr = currentDate) {
    if (!FLOOR_MODELS[currentFloor]) return [];

    const lessons = await fetchLessons({ from: dateStr, to: dateStr });
    return lessons.filter((lesson) => matchesGroup(lesson, group)).map((lesson) => lessonToPair(lesson));
}

export async function fetchTeacherSchedule(teacher, dateStr = currentDate) {
    if (!FLOOR_MODELS[currentFloor]) return [];

    const lessons = await fetchLessons({ from: dateStr, to: dateStr, teacher_id: teacher.id });
    return lessons.filter((lesson) => matchesTeacher(lesson, teacher)).map((lesson) => lessonToPair(lesson));
}

// Дату урока берём из поля date. Тестовое расписание дат не содержит,
// поэтому при их отсутствии раскладываем по weekday: 1 — понедельник.
function lessonDayDate(lesson, days) {
    if (lesson.date) return String(lesson.date).slice(0, 10);

    const weekday = Number(lesson.weekday);
    if (Number.isFinite(weekday) && weekday >= 1 && weekday <= days.length) return days[weekday - 1].date;
    return null;
}

async function fetchWeekSchedule(matches, extraParams) {
    if (!FLOOR_MODELS[currentFloor]) return [];

    const days = weekDaysFor(currentDate);
    const lessons = await fetchLessons({
        ...extraParams,
        from: days[0].date,
        to: days.at(-1).date
    });
    const matched = lessons.filter(matches);

    return days.map((day) => ({
        ...day,
        pairs: matched
            .filter((lesson) => lessonDayDate(lesson, days) === day.date)
            .map((lesson) => lessonToPair(lesson, day.date))
            .sort((a, b) => a.time.localeCompare(b.time))
    }));
}

// ---------------------------------------------------------------------------
// СПИСОК ПАР
// ---------------------------------------------------------------------------

export function getPairStatus(pair) {
    const day = pair.date ?? currentDate;
    const [start, end] = pair.time.split(' - ').map((time) => new Date(`${day}T${time}:00`));
    const now = new Date();

    if (now < start) return 'upcoming';
    if (now <= end) return 'current';
    return 'past';
}

function createPairCard(pair) {
    const card = document.createElement('div');
    card.className = `pair-card ${getPairStatus(pair)}`;
    card.dataset.roomId = pair.roomId;
    // карточка ведёт себя как кнопка: попадает в обход по Tab
    // и озвучивается скринридером как нажимаемая
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.innerHTML = `
        <div class="pair-time">${pair.time}</div>
        <div class="pair-name">${pair.name}</div>
        <div class="pair-room">Каб. ${pair.roomId}</div>
        ${scheduleMode === 'teacher'
            ? `<div class="pair-group">${pair.group || 'Группа не указана'}</div>`
            : `<div class="pair-teacher">${pair.teacher || 'Преподаватель не указан'}</div>`}
    `;
    return card;
}

export function updatePairsUI(schedule) {
    pairsContainer.innerHTML = '';

    if (schedule.length === 0) {
        pairsContainer.innerHTML = '<div class="no-pairs">На выбранную дату пар нет</div>';
        return;
    }

    schedule.forEach((pair) => pairsContainer.appendChild(createPairCard(pair)));
}

function createDayHead({ title, date }) {
    const head = document.createElement('div');
    head.className = date === currentDate ? 'week-day-head is-today' : 'week-day-head';
    head.innerHTML = `<span>${title}</span><span class="week-day-date">${shortDate(date)}</span>`;
    return head;
}

function createDayPlaceholder() {
    const empty = document.createElement('div');
    empty.className = 'week-day-empty';
    empty.textContent = 'Пар на эту дату нет';
    return empty;
}

function updateWeekUI(week) {
    pairsContainer.innerHTML = '';

    week.forEach((day) => {
        pairsContainer.appendChild(createDayHead(day));

        if (day.pairs.length === 0) {
            pairsContainer.appendChild(createDayPlaceholder());
            return;
        }

        day.pairs.forEach((pair) => pairsContainer.appendChild(createPairCard(pair)));
    });
}

function showPairsLoading(text) {
    pairsContainer.innerHTML = `
        <div class="pairs-loading" role="status">
            <span class="pairs-circle" aria-hidden="true"><span class="pairs-circle-fill"></span></span>
            <span>${text}</span>
        </div>
    `;
}

function showPairsMessage(text, isError = false) {
    pairsContainer.innerHTML = '';
    const message = document.createElement('div');
    message.className = isError ? 'no-pairs pairs-error' : 'no-pairs';
    message.textContent = text;
    pairsContainer.appendChild(message);
}

// ---------------------------------------------------------------------------
// ПОДСВЕТКА КАБИНЕТОВ
// ---------------------------------------------------------------------------

function highlightRoomsForSchedule(schedule) {
    resetActiveSelection();
    setHighlightedMeshes([]);
    resetAllRoomsToWhite();

    schedule.forEach((pair) => {
        const status = getPairStatus(pair);
        if (status === 'past') return;

        const mesh = roomMeshes.find(({ userData }) => userData.roomNumber === pair.roomId);
        if (!mesh?.userData.showPanel) return;

        mesh.userData.pairStatus = status;
        animateMeshColor(mesh, getStatusColor(status, 'normal'));
        highlightedMeshes.push(mesh);
    });
}

const roomFloors = new Map();
Object.entries(floorRoomConfigs).forEach(([floor, config]) => {
    Object.values(config).forEach(({ number }) => {
        if (number && !roomFloors.has(number)) roomFloors.set(number, Number(floor));
    });
});

let pendingRoomId = null;

function highlightRoomByRoomId(roomId) {
    const targetFloor = roomFloors.get(roomId);
    if (targetFloor && targetFloor !== currentFloor && FLOOR_MODELS[targetFloor]) {
        pendingRoomId = roomId;
        setFloor(targetFloor);
        return;
    }

    resetActiveSelection();

    const mesh = roomMeshes.find(({ userData }) => userData.roomNumber === roomId);
    if (!mesh?.userData.showPanel) {
        hideRoomPanel();
        showClickInfo(null);
        return;
    }

    showClickInfo(mesh);

    if (highlightedMeshes.includes(mesh)) {
        const { pairStatus } = mesh.userData;
        if (pairStatus && pairStatus !== 'past') {
            animateMeshColor(mesh, getStatusColor(pairStatus, 'bright'));
            setActiveHighlightedMesh(mesh);
        }
    } else {
        animateMeshColor(mesh, roomSelectedColor());
        setSelectedMesh(mesh);
    }

    showRoomPanel(mesh.userData.roomNumber || '', mesh.userData.roomName);
}

// Кабинет с другого этажа подсвечиваем в два приёма: сначала запускаем
// загрузку этажа, потом повторяем подсветку, когда модель уже на сцене.
function applyPendingRoom(consume) {
    if (!pendingRoomId) return;

    const roomId = pendingRoomId;
    if (consume) pendingRoomId = null;
    highlightRoomByRoomId(roomId);
    collapseScheduleForRoom();
}

pairsContainer.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const card = event.target.closest('.pair-card');
    if (!card) return;

    event.preventDefault();
    card.click();
});

pairsContainer.addEventListener('click', (event) => {
    const card = event.target.closest('.pair-card');
    if (card?.dataset.roomId) highlightRoomByRoomId(card.dataset.roomId);
});

// ---------------------------------------------------------------------------
// ЗАГРУЗКА ВЫБРАННОГО РАСПИСАНИЯ
// ---------------------------------------------------------------------------

let appliedKey = null;

function selectedGroupName() {
    return groupSelect.value || currentGroup;
}

export function hasSelection() {
    return Boolean(scheduleMode === 'teacher' ? currentTeacher : selectedGroupName());
}

// Ключ меняется вместе с выбором, видом и датой — по нему видно,
// нужно ли перезапрашивать данные при открытии шторки.
function selectionKey() {
    const base = scheduleMode === 'teacher'
        ? currentTeacher && `teacher:${currentTeacher.id}`
        : selectedGroupName() && `group:${selectedGroupName()}`;
    return base ? `${base}:${viewMode}:${currentDate}` : null;
}

function loadForSelection() {
    if (scheduleMode === 'teacher') {
        return viewMode === 'week'
            ? fetchWeekSchedule((lesson) => matchesTeacher(lesson, currentTeacher), { teacher_id: currentTeacher.id })
            : fetchTeacherSchedule(currentTeacher, currentDate);
    }

    const group = selectedGroupName();
    return viewMode === 'week'
        ? fetchWeekSchedule((lesson) => matchesGroup(lesson, group))
        : fetchSchedule(group, currentDate);
}

function renderLoaded(data) {
    if (viewMode !== 'week') {
        setCurrentSchedule(data);
        updatePairsUI(data);
        highlightRoomsForSchedule(data);
        return;
    }

    // на карте показываем только выбранный день, в списке — всю неделю
    const today = data.find(({ date }) => date === currentDate);
    setCurrentSchedule(data.flatMap(({ pairs }) => pairs));
    updateWeekUI(data);
    highlightRoomsForSchedule(today ? today.pairs : []);
}

async function loadSelection() {
    appliedKey = selectionKey();
    showPairsLoading('Загружаем расписание…');
    applyPendingRoom(false);

    try {
        renderLoaded(await loadForSelection());
    } catch (error) {
        console.error('Не удалось загрузить расписание:', error);
        appliedKey = null;
        setCurrentSchedule([]);
        showPairsMessage(`Не удалось загрузить расписание: ${error.message}`, true);
        highlightRoomsForSchedule([]);
    }

    applyPendingRoom(true);
}

function clearScheduleView() {
    appliedKey = null;
    setCurrentSchedule([]);
    updatePairsUI([]);
    resetAllRoomsToWhite(true);
    hideRoomPanel();
}

export async function applyGroup(selectedGroup) {
    setCurrentGroup(selectedGroup);
    await loadSelection();
}

export async function applyTeacher(teacher) {
    setCurrentTeacher(teacher);
    await loadSelection();
}

export async function applySelection() {
    if (!hasSelection()) {
        clearScheduleView();
        return;
    }
    await loadSelection();
}

export function applySelectionIfNeeded() {
    if (selectionKey() === appliedKey) return;
    applySelection();
    hideRoomPanel();
}

// ---------------------------------------------------------------------------
// ВЫБОР ДАТЫ
// ---------------------------------------------------------------------------

function shiftCurrentDate(days) {
    const date = parseDateString(currentDate);
    date.setDate(date.getDate() + days);
    setCurrentDate(getDateString(date));
    dateInput.value = currentDate;
    applySelection();
}

dateInput.addEventListener('change', () => {
    if (!dateInput.value) {
        dateInput.value = currentDate;
        return;
    }
    setCurrentDate(dateInput.value);
    applySelection();
});

prevDayBtn.addEventListener('click', () => shiftCurrentDate(-1));
nextDayBtn.addEventListener('click', () => shiftCurrentDate(1));

// ---------------------------------------------------------------------------
// ШТОРКА РАСПИСАНИЯ
//
// Открыта она или нет — хранит скрытый чекбокс #schedule-toggle: показом
// занимается css по :has, здесь мы только переключаем галочку.
// ---------------------------------------------------------------------------

export const scheduleToggle = document.getElementById('schedule-toggle');
const schedulePanel = document.getElementById('schedule-panel');
const dayViewBtn = document.getElementById('day-view-btn');
const weekViewBtn = document.getElementById('week-details-btn');

// Кнопки вида не открывают шторку, а ведут в правую панель с выбором
// группы и даты — оттуда расписание показывают отдельной кнопкой.
function switchView(mode) {
    if (viewMode !== mode) {
        setViewMode(mode);
        dayViewBtn.setAttribute('aria-pressed', String(mode === 'day'));
        weekViewBtn.setAttribute('aria-pressed', String(mode === 'week'));
        if (scheduleToggle.checked && hasSelection()) applySelection();
    }
    setScheduleDrawerOpen(true);
}

dayViewBtn.addEventListener('click', () => switchView('day'));
weekViewBtn.addEventListener('click', () => switchView('week'));

// На телефоне панели выезжают поверх карты: нажатие на пару подсветит
// кабинет, но самого кабинета видно не будет.
function closeDrawersForSheet() {
    setScheduleDrawerOpen(false);
    if (isNarrowScreen()) setSidebarOpen(false);
}

function setScheduleOpen(open) {
    if (scheduleToggle.checked === open) return;

    scheduleToggle.checked = open;
    if (open) {
        applySelectionIfNeeded();
        closeDrawersForSheet();
    }
    // пока шторка открыта, карта не реагирует на жесты:
    // за визуальную часть отвечает css, за three.js — controls
    controls.enabled = !open;
}

scheduleToggle.addEventListener('change', () => {
    if (scheduleToggle.checked) {
        applySelectionIfNeeded();
        closeDrawersForSheet();
    }
    controls.enabled = !scheduleToggle.checked;
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && scheduleToggle.checked) setScheduleOpen(false);
});

const IGNORED_OUTSIDE_CLICKS = [
    '#schedule-drawer',
    '#schedule-drawer-toggle',
    '#open-schedule-drawer',
    '#day-view-btn',
    '#week-details-btn'
].join(', ');

document.addEventListener('pointerdown', (event) => {
    if (!scheduleToggle.checked) return;
    if (schedulePanel.contains(event.target)) return;
    if (event.target.closest(IGNORED_OUTSIDE_CLICKS)) return;
    setScheduleOpen(false);
});

// ---------------------------------------------------------------------------
// СВАЙПЫ ПО ШТОРКЕ
// ---------------------------------------------------------------------------

const sheetSwipe = { startX: 0, startY: 0, active: false, fromBottomEdge: false };

document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) {
        sheetSwipe.active = false;
        return;
    }

    const [touch] = event.touches;
    sheetSwipe.startX = touch.clientX;
    sheetSwipe.startY = touch.clientY;
    sheetSwipe.active = true;
    sheetSwipe.fromBottomEdge = touch.clientY >= window.innerHeight - SHEET_EDGE_THRESHOLD;
}, { passive: true });

document.addEventListener('touchmove', (event) => {
    if (!sheetSwipe.active || event.touches.length !== 1) return;

    const [touch] = event.touches;
    const deltaY = touch.clientY - sheetSwipe.startY;
    const deltaX = touch.clientX - sheetSwipe.startX;

    const longEnough = Math.abs(deltaY) >= SHEET_MIN_DISTANCE;
    const vertical = Math.abs(deltaY) >= Math.abs(deltaX) * VERTICAL_GESTURE_RATIO;
    if (!longEnough || !vertical) return;

    const up = deltaY < 0;
    if (up && sheetSwipe.fromBottomEdge && !scheduleToggle.checked) {
        setScheduleOpen(true);
        sheetSwipe.active = false;
        return;
    }

    // вниз закрываем, только если список прокручен в самое начало,
    // иначе жест принадлежит прокрутке списка пар
    const closing = !up && scheduleToggle.checked && schedulePanel.contains(event.target);
    if (closing && pairsContainer.scrollTop <= 0) {
        setScheduleOpen(false);
        sheetSwipe.active = false;
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    sheetSwipe.active = false;
    sheetSwipe.fromBottomEdge = false;
});

// ---------------------------------------------------------------------------
// ПЕРЕХОД «ПАРА → КАБИНЕТ → НАЗАД»
//
// На телефоне открытое расписание занимает пол-экрана и вместе с карточкой
// кабинета не оставляет места карте, поэтому список сворачивается.
// ---------------------------------------------------------------------------

function collapseScheduleForRoom() {
    if (!scheduleToggle.checked) return;
    if (!isNarrowScreen()) return;
    // кабинета может не оказаться на плане этажа: тогда карточка не открылась,
    // и сворачивать список не за чем — пользователь остался бы ни с чем
    if (!roomPanel.classList.contains('visible')) return;

    setScheduleCollapsedForRoom(true);
    roomPanel.classList.add('can-return');
    setScheduleOpen(false);
}

// Обработчик добавлен вторым: сначала срабатывает тот, что открывает
// карточку кабинета, и только потом сворачивается расписание.
pairsContainer.addEventListener('click', (event) => {
    if (event.target.closest('.pair-card')) collapseScheduleForRoom();
});

roomPanelBack.addEventListener('click', () => {
    const shouldReopen = scheduleCollapsedForRoom;
    hideRoomPanel();
    if (shouldReopen) setScheduleOpen(true);
});
