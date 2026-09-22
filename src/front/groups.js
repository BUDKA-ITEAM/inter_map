import { LESSONS_ENDPOINT, GROUPS_SCAN_LIMIT, GROUP_STORAGE_KEY } from './config.js';
import { groupSelect, scheduleMode } from './state.js';
import { readStored, writeStored } from './storage.js';
import { fetchFromApi, applySelection, scheduleToggle } from './schedule.js';

const groupPickBtn = document.getElementById('group-pick-btn');
const groupPickerPanel = document.getElementById('group-picker-panel');
const directionSelect = document.getElementById('direction-select');
const groupStatus = document.getElementById('group-status');
const groupConfirmBtn = document.getElementById('group-confirm-btn');
const groupCurrent = document.getElementById('group-current');
const groupCurrentName = document.getElementById('group-current-name');
const groupChangeBtn = document.getElementById('group-change-btn');

let groupCatalog = [];

function showGroupState(state) {
    groupPickBtn.hidden = state !== 'empty';
    groupPickerPanel.hidden = state !== 'picking';
    groupCurrent.hidden = state !== 'chosen';
}

function setGroupStatus(text, isError = false) {
    groupStatus.textContent = text;
    groupStatus.classList.toggle('is-error', isError);
}
export function splitGroupField(value) {
    return (value || '')
        .split(/[,\s]+/)
        .map((name) => name.trim().replace(/^[;.]+|[;.]+$/g, ''))
        .filter(Boolean);
}
function directionOf(groupName) {
    const parts = groupName.split('.');
    const code = (parts[1] || parts[0] || '').trim();
    return code ? code.toUpperCase() : 'Прочие';
}
async function fetchGroupCatalog() {
    const params = new URLSearchParams({ limit: String(GROUPS_SCAN_LIMIT) });
    const lessons = await fetchFromApi(LESSONS_ENDPOINT, params);

    const names = new Set();
    lessons.forEach((lesson) => splitGroupField(lesson.group).forEach((name) => names.add(name)));

    const byDirection = new Map();
    [...names].sort((a, b) => a.localeCompare(b, 'ru')).forEach((name) => {
        const code = directionOf(name);
        if (!byDirection.has(code)) byDirection.set(code, []);
        byDirection.get(code).push(name);
    });

    return [...byDirection.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'ru'))
        .map(([title, groups]) => ({ id: title, title, groups }));
}

function fillDirections() {
    directionSelect.length = 1;

    groupCatalog.forEach(({ id, title }) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = title;
        directionSelect.appendChild(option);
    });
}

function fillGroups(directionId) {
    const direction = groupCatalog.find((item) => item.id === directionId);

    groupSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = direction ? 'Выберите группу' : 'Сначала выберите направление';
    groupSelect.appendChild(placeholder);

    direction?.groups.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        groupSelect.appendChild(option);
    });

    groupSelect.disabled = !direction;
    groupConfirmBtn.disabled = true;
    setGroupStatus(direction ? `Групп в направлении: ${direction.groups.length}` : 'Сначала выберите направление');
}

function confirmGroup(name) {
    groupCurrentName.textContent = name;
    writeStored(GROUP_STORAGE_KEY, name);
    setGroupStatus('');
    showGroupState('chosen');
    if (scheduleMode !== 'teacher' && scheduleToggle.checked) applySelection();
}

groupPickBtn.addEventListener('click', () => showGroupState('picking'));

groupChangeBtn.addEventListener('click', () => {
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

groupSelect.addEventListener('change', () => {
    groupConfirmBtn.disabled = !groupSelect.value;
});

groupConfirmBtn.addEventListener('click', () => {
    if (groupSelect.value) confirmGroup(groupSelect.value);
});

function restoreSavedGroup() {
    const savedGroup = readStored(GROUP_STORAGE_KEY);
    const direction = groupCatalog.find((item) => item.groups.includes(savedGroup));
    if (!direction) return;

    directionSelect.value = direction.id;
    fillGroups(direction.id);
    groupSelect.value = savedGroup;
    confirmGroup(savedGroup);
}

export async function initGroupPicker() {
    showGroupState('empty');
    groupPickBtn.disabled = true;
    setGroupStatus('Загружаем список групп…');

    try {
        groupCatalog = await fetchGroupCatalog();
    } catch (error) {
        setGroupStatus(`Не удалось загрузить список групп: ${error.message}`, true);
        return;
    }

    fillDirections();
    groupPickBtn.disabled = false;
    setGroupStatus(groupCatalog.length ? 'Сначала выберите направление' : 'Список групп пуст');

    restoreSavedGroup();
}
