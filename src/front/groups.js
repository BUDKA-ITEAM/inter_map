// Выбор группы (направление -> группа -> подтверждение), каталог групп из api,
// сохранение выбранной группы в localStorage.
//
// Циклическая зависимость с schedule.js: fetchFromApi/applySelection/
// scheduleToggle используются только внутри тел функций, не на верхнем уровне
// модуля, поэтому порядок вычисления модулей не важен.
import { LESSONS_ENDPOINT, GROUPS_SCAN_LIMIT, GROUP_STORAGE_KEY } from './config.js';
import { groupSelect, scheduleMode } from './state.js';
import { fetchFromApi, applySelection, scheduleToggle } from './schedule.js';

// Каталог направлений и групп. Пустой до ответа api: заполняется в
// loadGroupCatalog() ниже.
let groupCatalog = [];

const groupPickBtn = document.getElementById('group-pick-btn');
const groupPickerPanel = document.getElementById('group-picker-panel');
const directionSelect = document.getElementById('direction-select');
const groupStatus = document.getElementById('group-status');
const groupConfirmBtn = document.getElementById('group-confirm-btn');
const groupCurrent = document.getElementById('group-current');
const groupCurrentName = document.getElementById('group-current-name');
const groupChangeBtn = document.getElementById('group-change-btn');

// три состояния блока: 'empty' — кнопка, 'picking' — выбор, 'chosen' — готово
function showGroupState(state) {
    groupPickBtn.hidden = state !== 'empty';
    groupPickerPanel.hidden = state !== 'picking';
    groupCurrent.hidden = state !== 'chosen';
}

function setGroupStatus(text, isError = false) {
    groupStatus.textContent = text;
    groupStatus.classList.toggle('is-error', isError);
}

// группы из api: тянем уроки ближайших недель и собираем уникальные названия
// В поле group приходит сразу несколько групп: через запятую или пробел
// («01-25.Р.ОФ.9 01-26.Р.ОФ.11»). Разбираем на отдельные названия.
export function splitGroupField(value) {
    return (value || '')
        .split(/[,\s]+/)
        // в данных попадаются названия с точкой с запятой на конце —
        // без чистки одна и та же группа попадала бы в список дважды
        .map((name) => name.trim().replace(/^[;.]+|[;.]+$/g, ''))
        .filter(Boolean);
}

// Направление — вторая часть названия между точками:
// «01-23.ИСИП.ОФ.9» -> «ИСИП». Регистр приводим к верхнему, потому что
// в данных встречаются и «ИСИП», и «ИСиП».
function directionOf(groupName) {
    const parts = groupName.split('.');
    const code = (parts[1] || parts[0] || '').trim();
    return code ? code.toUpperCase() : 'Прочие';
}

async function loadGroupCatalog() {
    const params = new URLSearchParams({ limit: String(GROUPS_SCAN_LIMIT) });
    const lessons = await fetchFromApi(LESSONS_ENDPOINT, params);

    const names = new Set();
    lessons.forEach((lesson) => {
        splitGroupField(lesson.group).forEach((name) => names.add(name));
    });

    const byDirection = new Map();
    [...names].sort((a, b) => a.localeCompare(b, 'ru')).forEach((name) => {
        const code = directionOf(name);
        if (!byDirection.has(code)) byDirection.set(code, []);
        byDirection.get(code).push(name);
    });

    return [...byDirection.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
        .map(([title, groups]) => ({ id: title, title, groups }));
}

// заполняем селектор направлений
function fillDirections() {
    directionSelect.length = 1;

    groupCatalog.forEach((direction) => {
        const option = document.createElement('option');
        option.value = direction.id;
        option.textContent = direction.title;
        directionSelect.appendChild(option);
    });
}

// группы выбранного направления во втором селекторе
function fillGroups(directionId) {
    const direction = groupCatalog.find((item) => item.id === directionId);

    groupSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = direction ? 'Выберите группу' : 'Сначала выберите направление';
    groupSelect.appendChild(placeholder);

    if (direction) {
        direction.groups.forEach((name) => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            groupSelect.appendChild(option);
        });
    }

    groupSelect.disabled = !direction;
    groupConfirmBtn.disabled = true;
    setGroupStatus(direction ? `Групп в направлении: ${direction.groups.length}` : 'Сначала выберите направление');
}

// подтверждение: сохраняем выбор и показываем только выбранную группу
function confirmGroup(name) {
    groupCurrentName.textContent = name;
    try {
        localStorage.setItem(GROUP_STORAGE_KEY, name);
    } catch (error) {
        // приватный режим — просто не запоминаем выбор
    }
    setGroupStatus('');
    showGroupState('chosen');
    if (scheduleMode !== 'teacher' && scheduleToggle.checked) applySelection();
}

groupPickBtn.addEventListener('click', () => showGroupState('picking'));

groupChangeBtn.addEventListener('click', () => {
    // открываем список на текущем выборе: направление подставляем по группе
    const current = groupCurrentName.textContent;
    const direction = groupCatalog.find((item) => item.groups.includes(current));

    directionSelect.value = direction ? direction.id : '';
    fillGroups(directionSelect.value);
    if (direction) {
        groupSelect.value = current;
        groupConfirmBtn.disabled = false;
    }

    showGroupState('picking');
});

directionSelect.addEventListener('change', () => fillGroups(directionSelect.value));

// кнопка оживает, только когда в селекторе выбрана группа
groupSelect.addEventListener('change', () => {
    groupConfirmBtn.disabled = !groupSelect.value;
});

groupConfirmBtn.addEventListener('click', () => {
    if (groupSelect.value) confirmGroup(groupSelect.value);
});

// стартовая загрузка каталога
export async function initGroupPicker() {
    showGroupState('empty');
    groupPickBtn.disabled = true;
    setGroupStatus('Загружаем список групп…');

    try {
        groupCatalog = await loadGroupCatalog();
        fillDirections();
        groupPickBtn.disabled = false;
        setGroupStatus(groupCatalog.length ? 'Сначала выберите направление' : 'Список групп пуст');
    } catch (error) {
        console.error('Не удалось загрузить список групп:', error);
        setGroupStatus(`Не удалось загрузить список групп: ${error.message}`, true);
        return;
    }

    // восстановление сохранённого выбора
    let savedGroup = null;
    try {
        savedGroup = localStorage.getItem(GROUP_STORAGE_KEY);
    } catch (error) {
        savedGroup = null;
    }

    // группа могла исчезнуть из расписания — тогда начинаем с чистого листа
    const savedDirection = groupCatalog.find((direction) => direction.groups.includes(savedGroup));
    if (savedDirection) {
        directionSelect.value = savedDirection.id;
        fillGroups(savedDirection.id);
        groupSelect.value = savedGroup;
        confirmGroup(savedGroup);
    }
}
