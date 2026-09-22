// Выбор преподавателя и переключатель «по группе / по преподавателю».
import {
    TEACHERS_ENDPOINT, TEACHER_STORAGE_KEY, SCHEDULE_MODE_STORAGE_KEY
} from './config.js';
import { teacherSelect, scheduleMode, setScheduleMode, setCurrentTeacher } from './state.js';
import { readStored, writeStored } from './storage.js';
import { fetchFromApi, applySelection, applySelectionIfNeeded, scheduleToggle } from './schedule.js';
import { FALLBACK_LESSONS } from './fallbackSchedule.js';

const groupPicker = document.getElementById('group-picker');
const teacherPicker = document.getElementById('teacher-picker');
const modeGroupBtn = document.getElementById('mode-group-btn');
const modeTeacherBtn = document.getElementById('mode-teacher-btn');
const teacherPickBtn = document.getElementById('teacher-pick-btn');
const teacherPickerPanel = document.getElementById('teacher-picker-panel');
const teacherConfirmBtn = document.getElementById('teacher-confirm-btn');
const teacherCurrent = document.getElementById('teacher-current');
const teacherCurrentName = document.getElementById('teacher-current-name');
const teacherChangeBtn = document.getElementById('teacher-change-btn');
const teacherStatus = document.getElementById('teacher-status');

let teacherCatalog = [];

function showTeacherState(state) {
    teacherPickBtn.hidden = state !== 'empty';
    teacherPickerPanel.hidden = state !== 'picking';
    teacherCurrent.hidden = state !== 'chosen';
}

function setTeacherStatus(text, isError = false) {
    teacherStatus.textContent = text;
    teacherStatus.classList.toggle('is-error', isError);
}

function fallbackTeachers() {
    const names = new Set(FALLBACK_LESSONS.map(({ teacher_name: name }) => name).filter(Boolean));
    return [...names]
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .map((name) => ({ id: name, name }));
}


async function fetchTeacherCatalog() {
    const response = await fetchFromApi(TEACHERS_ENDPOINT, new URLSearchParams());

    const teachers = response
        .filter(({ name }) => typeof name === 'string' && name.trim())
        .map(({ id, name }) => ({ id: String(id ?? name), name: name.trim() }));

    return teachers.length
        ? teachers.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        : fallbackTeachers();
}

function fillTeachers() {
    teacherSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = teacherCatalog.length ? 'Выберите преподавателя' : 'Список пуст';
    teacherSelect.appendChild(placeholder);

    teacherCatalog.forEach(({ id, name }) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = name;
        teacherSelect.appendChild(option);
    });

    teacherSelect.disabled = !teacherCatalog.length;
    teacherConfirmBtn.disabled = true;
}

function confirmTeacher(teacher) {
    setCurrentTeacher(teacher);
    teacherCurrentName.textContent = teacher.name;
    writeStored(TEACHER_STORAGE_KEY, teacher.id);
    setTeacherStatus('');
    showTeacherState('chosen');
    if (scheduleMode === 'teacher' && scheduleToggle.checked) applySelection();
}

export function setScheduleModeUI(mode) {
    const teacherMode = mode === 'teacher';
    setScheduleMode(teacherMode ? 'teacher' : 'group');

    modeGroupBtn.setAttribute('aria-pressed', String(!teacherMode));
    modeTeacherBtn.setAttribute('aria-pressed', String(teacherMode));
    groupPicker.hidden = teacherMode;
    teacherPicker.hidden = !teacherMode;

    writeStored(SCHEDULE_MODE_STORAGE_KEY, teacherMode ? 'teacher' : 'group');
}

function switchMode(mode) {
    if (scheduleMode === mode) return;
    setScheduleModeUI(mode);
    if (scheduleToggle.checked) applySelection();
}

modeGroupBtn.addEventListener('click', () => switchMode('group'));
modeTeacherBtn.addEventListener('click', () => switchMode('teacher'));

teacherPickBtn.addEventListener('click', () => showTeacherState('picking'));

teacherChangeBtn.addEventListener('click', () => {
    const current = teacherCatalog.find(({ name }) => name === teacherCurrentName.textContent);
    teacherSelect.value = current ? current.id : '';
    teacherConfirmBtn.disabled = !teacherSelect.value;
    showTeacherState('picking');
});

teacherSelect.addEventListener('change', () => {
    teacherConfirmBtn.disabled = !teacherSelect.value;
});

teacherConfirmBtn.addEventListener('click', () => {
    const teacher = teacherCatalog.find(({ id }) => id === teacherSelect.value);
    if (teacher) confirmTeacher(teacher);
});

function restoreSavedTeacher() {
    const savedId = readStored(TEACHER_STORAGE_KEY);
    const teacher = teacherCatalog.find(({ id }) => id === savedId);
    if (!teacher) return;

    teacherSelect.value = teacher.id;
    confirmTeacher(teacher);
}

export async function initTeacherPicker() {
    setScheduleModeUI(readStored(SCHEDULE_MODE_STORAGE_KEY) === 'teacher' ? 'teacher' : 'group');

    showTeacherState('empty');
    teacherPickBtn.disabled = true;
    setTeacherStatus('Загружаем список преподавателей…');

    try {
        teacherCatalog = await fetchTeacherCatalog();
    } catch (error) {
        setTeacherStatus(`Не удалось загрузить список преподавателей: ${error.message}`, true);
        return;
    }

    fillTeachers();
    teacherPickBtn.disabled = !teacherCatalog.length;
    setTeacherStatus(teacherCatalog.length
        ? `Преподавателей в расписании: ${teacherCatalog.length}`
        : 'Список преподавателей пуст');

    restoreSavedTeacher();

    if (scheduleMode === 'teacher' && scheduleToggle.checked) applySelectionIfNeeded();
}
