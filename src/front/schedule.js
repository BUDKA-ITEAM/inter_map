// Работа с расписанием: запросы к api, подсветка кабинетов по расписанию,
// панель дат, нижняя шторка расписания и переход «пара → кабинет → назад».
//
// Циклическая зависимость с three.js, roomPanel.js и groups.js: импортируемые
// из них функции используются только внутри тел функций/обработчиков, а не
// на верхнем уровне модуля, поэтому порядок вычисления модулей не важен.
import {
    API_BASE_URL, API_TIMEOUT_MS, LESSONS_ENDPOINT, GROUPS_SCAN_LIMIT,
    FLOOR_MODELS, floorRoomConfigs, SHEET_EDGE_THRESHOLD, SHEET_MIN_DISTANCE
} from './config.js';

import {
    pairsContainer, dateInput, prevDayBtn, nextDayBtn, groupSelect, roomPanel, roomPanelBack,
    currentGroup, setCurrentGroup,
    currentTeacher, setCurrentTeacher,
    scheduleMode,
    viewMode, setViewMode,
    currentSchedule,
    setCurrentSchedule,
    currentDate, setCurrentDate,
    currentFloor,
    highlightedMeshes, setHighlightedMeshes,
    setSelectedMesh,
    setActiveHighlightedMesh,
    roomMeshes,
    scheduleCollapsedForRoom, setScheduleCollapsedForRoom
} from './state.js';

import {
    animateMeshColor, resetAllRoomsToWhite, getStatusColor, resetActiveSelection,
    roomSelectedColor,
    showClickInfo, controls, setFloor
} from './three.js';

import { FALLBACK_LESSONS } from './fallbackSchedule.js';
import { showRoomPanel, hideRoomPanel } from './roomPanel.js';
import { setSidebarOpen, setScheduleDrawerOpen } from './ui.js';
import { splitGroupField } from './groups.js';

// Раньше здесь был toISOString(), который переводит время в UTC. Из-за
// этого ночью в Москве (UTC+3) приложение открывалось на вчерашнем дне,
// а вечером в западных поясах — на завтрашнем. Берём локальные значения.
export function getDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// понимает строку как UTC-полночь и в западных
// поясах сдвигает день назад — поэтому собираем дату по частям.
export function parseDateString(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export async function fetchFromApi(path, params) {
    const url = `${API_BASE_URL}${path}?${params}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`сервер ответил ${response.status}`);
        return await response.json();
    } catch (error) {
        // сюда попадают таймаут, обрыв связи и блокировка ответа по cors.
        // Пока сервера нет, вместо ошибки отдаём тестовые данные.
        const reason = error.name === 'AbortError'
            ? `нет ответа за ${API_TIMEOUT_MS / 1000} с (${url})`
            : `${error.message} (${url})`;
        console.warn(`Api недоступен: ${reason}. Показываем тестовое расписание.`);
        return FALLBACK_LESSONS;
    } finally {
        clearTimeout(timer);
    }
}

function trimSeconds(time) {
    return (time || '').slice(0, 5);
}

// урок из api -> карточка пары, как ее ждет остальной код.
function lessonToPair(lesson, dayDate = null) {
    return {
        time: `${trimSeconds(lesson.time_start)} - ${trimSeconds(lesson.time_end)}`,
        name: lesson.subject,
        roomId: lesson.room_number,
        teacher: lesson.teacher_name,
        group: lesson.group,
        date: dayDate || (lesson.date ? String(lesson.date).slice(0, 10) : null)
    };
}

const WEEKDAY_TITLES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function weekDaysFor(dateStr) {
    const monday = parseDateString(dateStr);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

    return WEEKDAY_TITLES.map((title, index) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + index);
        return { title, date: getDateString(day) };
    });
}

// Дату урока берём из поля date. Тестовое расписание дат не содержит,
// поэтому при их отсутствии раскладываем по weekday: 1 — понедельник.
function lessonDayDate(lesson, days) {
    if (lesson.date) return String(lesson.date).slice(0, 10);
    const weekday = Number(lesson.weekday);
    if (Number.isFinite(weekday) && weekday >= 1 && weekday <= days.length) return days[weekday - 1].date;
    return null;
}

async function fetchWeekSchedule(matches, extraParams = {}) {
    if (!FLOOR_MODELS[currentFloor]) return [];

    const days = weekDaysFor(currentDate);
    const params = new URLSearchParams({
        ...extraParams,
        date_from: days[0].date,
        date_to: days[days.length - 1].date,
        limit: String(GROUPS_SCAN_LIMIT)
    });

    const lessons = (await fetchFromApi(LESSONS_ENDPOINT, params)).filter(matches);

    return days.map((day) => ({
        ...day,
        pairs: lessons
            .filter((lesson) => lessonDayDate(lesson, days) === day.date)
            .map((lesson) => lessonToPair(lesson, day.date))
            .sort((a, b) => a.time.localeCompare(b.time))
    }));
}

// Запрос расписания за один день.
//
// Фильтр по группе делаем на клиенте, а не параметром запроса. Причина:
// в одном уроке поле group содержит несколько групп через запятую, и
// серверный фильтр сравнивает строку целиком — по названию одной группы
// он ничего не находит. Заодно это защищает от ложных совпадений вроде
// «01-23.Д.ОФ.9» внутри «01-23.Д.ОФ.99».
export async function fetchSchedule(group, dateStr = currentDate) {
    if (!FLOOR_MODELS[currentFloor]) return [];

    const params = new URLSearchParams({
        date_from: dateStr,
        date_to: dateStr,
        limit: String(GROUPS_SCAN_LIMIT)
    });

    const lessons = await fetchFromApi(LESSONS_ENDPOINT, params);
    return lessons
        .filter((lesson) => splitGroupField(lesson.group).includes(group))
        .map(lessonToPair);
}

function matchesTeacher(lesson, teacher) {
    if (lesson.teacher_id && teacher.id) return lesson.teacher_id === teacher.id;
    return lesson.teacher_name === teacher.name;
}

export async function fetchTeacherSchedule(teacher, dateStr = currentDate) {
    if (!FLOOR_MODELS[currentFloor]) return [];

    const params = new URLSearchParams({
        teacher_id: teacher.id,
        date_from: dateStr,
        date_to: dateStr,
        limit: String(GROUPS_SCAN_LIMIT)
    });

    const lessons = await fetchFromApi(LESSONS_ENDPOINT, params);
    return lessons
        .filter((lesson) => matchesTeacher(lesson, teacher))
        .map(lessonToPair);
}

// определение статуса пары (прошла, идёт, предстоит)
export function getPairStatus(pair) {
    const now = new Date();
    const day = pair.date || currentDate;
    const [startStr, endStr] = pair.time.split(' - ');
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    const start = new Date(`${day}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`);
    const end = new Date(`${day}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`);
    if (now < start) return 'upcoming';
    if (now >= start && now <= end) return 'current';
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

// обновление списка пар в нижней панели
export function updatePairsUI(schedule) {
    pairsContainer.innerHTML = '';
    if (schedule.length === 0) {
        pairsContainer.innerHTML = '<div class="no-pairs">На выбранную дату пар нет</div>';
        return;
    }
    schedule.forEach((pair) => pairsContainer.appendChild(createPairCard(pair)));
}

export function shortDate(dateStr) {
    const [, month, day] = dateStr.split('-');
    return `${day}.${month}`;
}

function updateWeekUI(week) {
    pairsContainer.innerHTML = '';

    week.forEach((day) => {
        const head = document.createElement('div');
        head.className = day.date === currentDate ? 'week-day-head is-today' : 'week-day-head';
        head.innerHTML = `<span>${day.title}</span><span class="week-day-date">${shortDate(day.date)}</span>`;
        pairsContainer.appendChild(head);

        if (!day.pairs.length) {
            const empty = document.createElement('div');
            empty.className = 'week-day-empty';
            empty.textContent = 'Пар на эту дату нет';
            pairsContainer.appendChild(empty);
            return;
        }

        day.pairs.forEach((pair) => pairsContainer.appendChild(createPairCard(pair)));
    });
}

// подсветка кабинетов, в которых есть пары
function highlightRoomsForSchedule(schedule) {
    resetActiveSelection();
    setHighlightedMeshes([]);
    resetAllRoomsToWhite();

    schedule.forEach((pair) => {
        const status = getPairStatus(pair);
        if (status === 'past') return;
        const mesh = roomMeshes.find((m) => m.userData.roomNumber === pair.roomId);
        if (mesh && mesh.userData.showPanel) {
            mesh.userData.pairStatus = status;
            animateMeshColor(mesh, getStatusColor(status, 'normal'));
            highlightedMeshes.push(mesh);
        }
    });
}

const roomFloors = new Map();
Object.entries(floorRoomConfigs).forEach(([floor, config]) => {
    Object.values(config).forEach((room) => {
        if (room.number && !roomFloors.has(room.number)) roomFloors.set(room.number, Number(floor));
    });
});

let pendingRoomId = null;

// подсветка конкретного кабинета по его номеру (например, при клике на карточку пары)
function highlightRoomByRoomId(roomId) {
    const targetFloor = roomFloors.get(roomId);
    if (targetFloor && targetFloor !== currentFloor && FLOOR_MODELS[targetFloor]) {
        pendingRoomId = roomId;
        setFloor(targetFloor);
        return;
    }

    resetActiveSelection();

    const mesh = roomMeshes.find((m) => m.userData.roomNumber === roomId);
    if (!mesh || !mesh.userData.showPanel) {
        hideRoomPanel();
        showClickInfo(null);
        return;
    }

    showClickInfo(mesh);

    if (highlightedMeshes.includes(mesh)) {
        const status = mesh.userData.pairStatus;
        if (status && status !== 'past') {
            animateMeshColor(mesh, getStatusColor(status, 'bright'));
            setActiveHighlightedMesh(mesh);
        }
    } else {
        animateMeshColor(mesh, roomSelectedColor());
        setSelectedMesh(mesh);
    }

    showRoomPanel(mesh.userData.roomNumber || '', mesh.userData.roomName);
}

// Enter и пробел на карточке работают как нажатие мышью.
pairsContainer.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.pair-card');
    if (!card) return;
    event.preventDefault();
    card.click();
});

// обработчик клика по карточке пары
pairsContainer.addEventListener('click', (event) => {
    const card = event.target.closest('.pair-card');
    if (!card) return;
    const roomId = card.dataset.roomId;
    if (roomId) {
        highlightRoomByRoomId(roomId);
    }
});

function showPairsLoading(text) {
    pairsContainer.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'pairs-loading';
    box.setAttribute('role', 'status');
    box.innerHTML = `
        <span class="pairs-circle" aria-hidden="true"><span class="pairs-circle-fill"></span></span>
        <span>${text}</span>
    `;
    pairsContainer.appendChild(box);
}

// сообщение вместо списка пар: загрузка, ошибка, пустой день.
function showPairsMessage(text, isError = false) {
    pairsContainer.innerHTML = '';
    const message = document.createElement('div');
    message.className = isError ? 'no-pairs pairs-error' : 'no-pairs';
    message.textContent = text;
    pairsContainer.appendChild(message);
}

// применение выбранной группы: загрузка и отображение расписания
function applyPendingRoom(consume) {
    if (!pendingRoomId) return;
    const roomId = pendingRoomId;
    if (consume) pendingRoomId = null;
    highlightRoomByRoomId(roomId);
    collapseScheduleForRoom();
}

let appliedKey = null;

function selectedGroupName() {
    return groupSelect.value || currentGroup;
}

export function hasSelection() {
    return Boolean(scheduleMode === 'teacher' ? currentTeacher : selectedGroupName());
}

function selectionKey() {
    const base = scheduleMode === 'teacher'
        ? (currentTeacher ? `teacher:${currentTeacher.id}` : null)
        : (selectedGroupName() ? `group:${selectedGroupName()}` : null);
    return base ? `${base}:${viewMode}:${currentDate}` : null;
}

function loadForSelection() {
    if (scheduleMode === 'teacher') {
        const teacher = currentTeacher;
        return viewMode === 'week'
            ? fetchWeekSchedule((lesson) => matchesTeacher(lesson, teacher), { teacher_id: teacher.id })
            : fetchTeacherSchedule(teacher, currentDate);
    }

    const group = selectedGroupName();
    return viewMode === 'week'
        ? fetchWeekSchedule((lesson) => splitGroupField(lesson.group).includes(group))
        : fetchSchedule(group, currentDate);
}

async function loadSelection() {
    appliedKey = selectionKey();
    showPairsLoading('Загружаем расписание…');
    applyPendingRoom(false);

    try {
        const data = await loadForSelection();
        if (viewMode === 'week') {
            const today = data.find((day) => day.date === currentDate);
            setCurrentSchedule(data.flatMap((day) => day.pairs));
            updateWeekUI(data);
            highlightRoomsForSchedule(today ? today.pairs : []);
        } else {
            setCurrentSchedule(data);
            updatePairsUI(data);
            highlightRoomsForSchedule(data);
        }
    } catch (error) {
        console.error('Не удалось загрузить расписание:', error);
        appliedKey = null;
        setCurrentSchedule([]);
        showPairsMessage(`Не удалось загрузить расписание: ${error.message}`, true);
        highlightRoomsForSchedule([]);
    }

    applyPendingRoom(true);
}

export async function applyGroup(selectedGroup) {
    setCurrentGroup(selectedGroup);
    await loadSelection();
}

export async function applyTeacher(teacher) {
    setCurrentTeacher(teacher);
    await loadSelection();
}

function clearScheduleView() {
    appliedKey = null;
    setCurrentSchedule([]);
    updatePairsUI([]);
    resetAllRoomsToWhite(true);
    hideRoomPanel();
}

export function applySelection() {
    if (!hasSelection()) {
        clearScheduleView();
        return Promise.resolve();
    }
    return loadSelection();
}

// обновление интерфейса при смене даты
function refreshForDateChange() {
    applySelection();
}

// обработчики смены даты
dateInput.addEventListener('change', () => {
    if (!dateInput.value) {
        dateInput.value = currentDate;
        return;
    }
    setCurrentDate(dateInput.value);
    refreshForDateChange();
});

prevDayBtn.addEventListener('click', () => {
    const date = parseDateString(currentDate);
    date.setDate(date.getDate() - 1);
    setCurrentDate(getDateString(date));
    dateInput.value = currentDate;
    refreshForDateChange();
});

nextDayBtn.addEventListener('click', () => {
    const date = parseDateString(currentDate);
    date.setDate(date.getDate() + 1);
    setCurrentDate(getDateString(date));
    dateInput.value = currentDate;
    refreshForDateChange();
});

// ---------------------------------------------------------------------------
// ШТОРКА РАСПИСАНИЯ
//
// Открыта она или нет — хранит скрытый чекбокс #schedule-toggle в сайдбаре.
// Css смотрит на него сам (правило :has в styles.css), поэтому здесь мы
// только переключаем галочку, а показом занимаются стили.
//
// Открыть можно тремя способами: кнопкой в сайдбаре, свайпом снизу вверх
// и программно. Закрыть — кнопкой, свайпом вниз, кликом мимо панели
// или клавишей Escape.
// ---------------------------------------------------------------------------
export const scheduleToggle = document.getElementById('schedule-toggle');
const schedulePanel = document.getElementById('schedule-panel');

let sheetStartX = null;
let sheetStartY = null;
let sheetFromBottomEdge = false;

// Открывая расписание, сразу подтягиваем выбранную в списке группу.
// Благодаря этому на телефоне достаточно одного нажатия: выбрал группу —
// нажал «Показать расписание». Отдельное «Применить» больше не нужно,
// но продолжает работать как раньше.
export function applySelectionIfNeeded() {
    if (selectionKey() === appliedKey) return;
    applySelection();
    hideRoomPanel();
}

const dayViewBtn = document.getElementById('day-view-btn');
const weekViewBtn = document.getElementById('week-details-btn');

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

// На телефоне сайдбар выезжает поверх карты. Если оставить его открытым,
// нажатие на пару подсветит кабинет, но самого кабинета видно не будет —
// поэтому вместе с расписанием закрываем сайдбар. На широком экране он
// карту не перекрывает, там закрывать нечего.
function closeSidebarOnNarrowScreen() {
    setScheduleDrawerOpen(false);
    if (window.matchMedia('(max-width: 768px)').matches) {
        setSidebarOpen(false);
    }
}

// Единая точка открытия и закрытия шторки: и свайп, и кнопка,
// и клик мимо панели проходят через неё.
function setScheduleOpen(open) {
    if (scheduleToggle.checked === open) return;
    scheduleToggle.checked = open;
    if (open) {
        applySelectionIfNeeded();
        closeSidebarOnNarrowScreen();
    }
    // карта перестаёт реагировать на жесты, пока шторка открыта:
    // за визуальную часть отвечает css, за three.js — controls
    controls.enabled = !open;
}

document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) {
        sheetStartY = null;
        return;
    }
    const touch = event.touches[0];
    sheetStartX = touch.clientX;
    sheetStartY = touch.clientY;
    sheetFromBottomEdge = touch.clientY >= window.innerHeight - SHEET_EDGE_THRESHOLD;
}, { passive: true });

document.addEventListener('touchmove', (event) => {
    if (sheetStartY === null || event.touches.length !== 1) return;

    const touch = event.touches[0];
    // deltaY меньше нуля — палец идёт вверх, больше нуля — вниз
    const deltaY = touch.clientY - sheetStartY;
    const deltaX = touch.clientX - sheetStartX;

    // жест должен быть достаточно длинным и заметно вертикальным
    if (Math.abs(deltaY) < SHEET_MIN_DISTANCE || Math.abs(deltaY) < Math.abs(deltaX) * 1.5) return;

    if (deltaY < 0 && sheetFromBottomEdge && !scheduleToggle.checked) {
        setScheduleOpen(true);
        sheetStartY = null;
    } else if (deltaY > 0 && scheduleToggle.checked && schedulePanel.contains(event.target)) {
        // вниз закрываем только если список прокручен в самое начало,
        // иначе жест принадлежит прокрутке списка пар
        if (pairsContainer.scrollTop <= 0) {
            setScheduleOpen(false);
            sheetStartY = null;
        }
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    sheetStartY = null;
    sheetFromBottomEdge = false;
});

// клик вне шторки закрывает её (кнопка в сайдбаре продолжает переключать сама)
document.addEventListener('pointerdown', (event) => {
    if (!scheduleToggle.checked) return;
    if (schedulePanel.contains(event.target)) return;
    if (event.target.closest('.sidebar-action')) return;
    if (event.target.closest('#schedule-drawer')) return;
    if (event.target.closest('#schedule-drawer-toggle')) return;
    if (event.target.closest('#open-schedule-drawer')) return;
    if (event.target.closest('#day-view-btn')) return;
    if (event.target.closest('#week-details-btn')) return;
    setScheduleOpen(false);
});

// Кнопка «Показать расписание» — это label чекбокса, она меняет его сама,
// минуя setScheduleOpen. Поэтому повторяем здесь те же три действия.
scheduleToggle.addEventListener('change', () => {
    if (scheduleToggle.checked) {
        applySelectionIfNeeded();
        closeSidebarOnNarrowScreen();
    }
    controls.enabled = !scheduleToggle.checked;
});

// escape закрывает шторку
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && scheduleToggle.checked) setScheduleOpen(false);
});

// ---------------------------------------------------------------------------
// ПЕРЕХОД «ПАРА → КАБИНЕТ → НАЗАД»
//
// На телефоне открытое расписание занимает пол-экрана, и карточка кабинета
// вместе с ним почти не оставляет места карте. Поэтому при нажатии на пару
// расписание сворачивается, а в карточке появляется кнопка «Назад»,
// возвращающая его обратно. На широком экране места хватает, там ничего
// не сворачивается и кнопка не показывается.
// ---------------------------------------------------------------------------

// Этот обработчик добавлен вторым: сначала срабатывает тот, что выше по файлу
// и открывает карточку кабинета, и только потом сворачивается расписание.
function collapseScheduleForRoom() {
    if (!scheduleToggle.checked) return;
    if (!window.matchMedia('(max-width: 768px)').matches) return;
    // Кабинета может не оказаться на плане этажа — тогда карточка не
    // открылась, и сворачивать расписание не за чем: иначе пользователь
    // терял список и не получал ничего взамен.
    if (!roomPanel.classList.contains('visible')) return;

    setScheduleCollapsedForRoom(true);
    roomPanel.classList.add('can-return');   // css покажет кнопку «Назад»
    setScheduleOpen(false);
}

pairsContainer.addEventListener('click', (event) => {
    if (!event.target.closest('.pair-card')) return;
    collapseScheduleForRoom();
});

// «Назад»: прячем карточку и возвращаем расписание на место
roomPanelBack.addEventListener('click', () => {
    const shouldReopen = scheduleCollapsedForRoom;
    hideRoomPanel();
    if (shouldReopen) setScheduleOpen(true);
});
