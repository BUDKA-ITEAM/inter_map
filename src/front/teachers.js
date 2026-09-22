import { TEACHERS_ENDPOINT, TEACHER_STORAGE_KEY, SCHEDULE_MODE_STORAGE_KEY } from './config.js';
import { teacherSelect, scheduleMode, setScheduleMode, setCurrentTeacher } from './state.js';
import { fetchFromApi, applySelectionIfNeeded, applySelection, scheduleToggle } from './schedule.js';
import { FALLBACK_LESSONS } from './fallbackSchedule.js';

let teacherCatalog = [];

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
    const names = new Set();
    FALLBACK_LESSONS.forEach((lesson) => {
        if (lesson.teacher_name) names.add(lesson.teacher_name);
    });
    return [...names]
        .sort((a, b) => a.localeCompare(b, 'ru'))
        .map((name) => ({ id: name, name }));
}

async function loadTeacherCatalog() {
    const response = await fetchFromApi(TEACHERS_ENDPOINT, new URLSearchParams());
    const teachers = Array.isArray(response) ? response : [];
    const parsed = teachers
        .filter((item) => item && typeof item.name === 'string' && item.name.trim())
        .map((item) => ({ id: String(item.id ?? item.name), name: item.name.trim() }));

    if (!parsed.length) return fallbackTeachers();

    return parsed.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function fillTeachers() {
    teacherSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = teacherCatalog.length ? 'Выберите преподавателя' : 'Список пуст';
    teacherSelect.appendChild(placeholder);

    teacherCatalog.forEach((teacher) => {
        const option = document.createElement('option');
        option.value = teacher.id;
        option.textContent = teacher.name;
        teacherSelect.appendChild(option);
    });

    teacherSelect.disabled = !teacherCatalog.length;
    teacherConfirmBtn.disabled = true;
}

function confirmTeacher(teacher) {
    setCurrentTeacher(teacher);
    teacherCurrentName.textContent = teacher.name;
    try {
        localStorage.setItem(TEACHER_STORAGE_KEY, teacher.id);
    } catch (error) {
    }
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

    try {
        localStorage.setItem(SCHEDULE_MODE_STORAGE_KEY, teacherMode ? 'teacher' : 'group');
    } catch (error) {
    }
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
    const current = teacherCatalog.find((item) => item.name === teacherCurrentName.textContent);
    teacherSelect.value = current ? current.id : '';
    teacherConfirmBtn.disabled = !teacherSelect.value;
    showTeacherState('picking');
});

teacherSelect.addEventListener('change', () => {
    teacherConfirmBtn.disabled = !teacherSelect.value;
});

teacherConfirmBtn.addEventListener('click', () => {
    const teacher = teacherCatalog.find((item) => item.id === teacherSelect.value);
    if (teacher) confirmTeacher(teacher);
});

export async function initTeacherPicker() {
    let savedMode = null;
    try {
        savedMode = localStorage.getItem(SCHEDULE_MODE_STORAGE_KEY);
    } catch (error) {
        savedMode = null;
    }
    setScheduleModeUI(savedMode === 'teacher' ? 'teacher' : 'group');

    showTeacherState('empty');
    teacherPickBtn.disabled = true;
    setTeacherStatus('Загружаем список преподавателей…');

    try {
        teacherCatalog = await loadTeacherCatalog();
        fillTeachers();
        teacherPickBtn.disabled = !teacherCatalog.length;
        setTeacherStatus(teacherCatalog.length
            ? `Преподавателей в расписании: ${teacherCatalog.length}`
            : 'Список преподавателей пуст');
    } catch (error) {
        console.error('Не удалось загрузить список преподавателей:', error);
        setTeacherStatus(`Не удалось загрузить список преподавателей: ${error.message}`, true);
        return;
    }

    let savedTeacherId = null;
    try {
        savedTeacherId = localStorage.getItem(TEACHER_STORAGE_KEY);
    } catch (error) {
        savedTeacherId = null;
    }

    const savedTeacher = teacherCatalog.find((item) => item.id === savedTeacherId);
    if (savedTeacher) {
        teacherSelect.value = savedTeacher.id;
        confirmTeacher(savedTeacher);
    }

    if (scheduleMode === 'teacher' && scheduleToggle.checked) applySelectionIfNeeded();
}
