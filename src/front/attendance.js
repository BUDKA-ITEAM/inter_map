import { ATTENDANCE_ENDPOINT, ATTENDANCE_STATUSES } from './config.js';
import { currentSchedule, currentDate } from './state.js';
import { authorizedRequest } from './session.js';
import { shortDate } from './dates.js';

const panel = document.getElementById('attendance');
const panelTitle = document.getElementById('attendance-title');
const lessonSelect = document.getElementById('attendance-lesson');
const list = document.getElementById('attendance-list');
const panelStatus = document.getElementById('attendance-status');
// стаб студентс заглушка
const STUB_STUDENTS = [
    'Антонов А. А.', 'Белова Е. И.', 'Волков Д. С.', 'Гордеева М. П.',
    'Ефимов Р. К.', 'Жукова Л. А.', 'Зайцев Н. В.', 'Ильина О. Д.',
    'Козлов С. М.', 'Лебедева В. Т.', 'Морозов И. А.', 'Новикова Я. С.'
];

let students = [];
let marks = new Map();

// заглушка стаб студентс
async function fetchGroupStudents(group) {
    return STUB_STUDENTS.map((fullName, index) => ({ id: index + 1, fullName, group }));
}

async function fetchMarks(lessonId) {
    const response = await authorizedRequest(`${ATTENDANCE_ENDPOINT}?lesson_id=${lessonId}`, { method: 'GET' });
    if (!response.ok) throw new Error(`сервер ответил ${response.status}`);

    const records = await response.json();
    return new Map(records.map(({ student_id: id, status }) => [id, status]));
}

async function sendMark(lessonId, studentId, status) {
    const response = await authorizedRequest(ATTENDANCE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson_id: lessonId, student_id: studentId, status })
    });
    if (!response.ok) throw new Error(`сервер ответил ${response.status}`);
}

function setStatus(text, isError = false) {
    panelStatus.textContent = text;
    panelStatus.classList.toggle('is-error', isError);
}

function createStudentRow({ id, fullName }) {
    const row = document.createElement('div');
    row.className = 'attendance-row';
    row.dataset.studentId = id;

    const name = document.createElement('span');
    name.className = 'attendance-name';
    name.textContent = fullName;

    const buttons = document.createElement('div');
    buttons.className = 'attendance-marks';
    buttons.setAttribute('role', 'group');
    buttons.setAttribute('aria-label', fullName);

    ATTENDANCE_STATUSES.forEach(({ id: status, title }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'attendance-mark';
        button.dataset.status = status;
        button.textContent = title;
        button.setAttribute('aria-pressed', String(marks.get(id) === status));
        buttons.appendChild(button);
    });

    row.append(name, buttons);
    return row;
}

function renderStudents() {
    list.replaceChildren(...students.map(createStudentRow));
}

function showRowMark(studentId, status) {
    const row = list.querySelector(`[data-student-id="${studentId}"]`);
    row.querySelectorAll('.attendance-mark').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.status === status));
    });
}

function selectedLessonId() {
    return Number(lessonSelect.value);
}

function fillLessons() {
    const lessons = currentSchedule.filter(({ id }) => id);

    lessonSelect.replaceChildren(...lessons.map(({ id, time, name }) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${time} · ${name}`;
        return option;
    }));

    lessonSelect.disabled = !lessons.length;
    return lessons.length;
}

async function loadLesson() {
    setStatus('Загружаем отметки…');

    try {
        marks = await fetchMarks(selectedLessonId());
    } catch (error) {
        marks = new Map();
        setStatus(`Отметки не загрузились: ${error.message}`, true);
        renderStudents();
        return;
    }

    setStatus('');
    renderStudents();
}

async function applyMark(studentId, status) {
    const previous = marks.get(studentId) ?? null;

    marks.set(studentId, status);
    showRowMark(studentId, status);
    setStatus('');

    try {
        await sendMark(selectedLessonId(), studentId, status);
    } catch (error) {
        if (previous) marks.set(studentId, previous);
        else marks.delete(studentId);

        showRowMark(studentId, previous);
        setStatus(`Отметка не сохранилась: ${error.message}`, true);
    }
}

function closeAttendance() {
    panel.hidden = true;
}

list.addEventListener('click', (event) => {
    const button = event.target.closest('.attendance-mark');
    if (!button) return;

    const row = button.closest('.attendance-row');
    applyMark(Number(row.dataset.studentId), button.dataset.status);
});

lessonSelect.addEventListener('change', loadLesson);

document.getElementById('attendance-close').addEventListener('click', closeAttendance);

panel.addEventListener('click', (event) => {
    if (event.target === panel) closeAttendance();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closeAttendance();
});

export async function openAttendance({ group, groups }) {
    panel.hidden = false;
    panelTitle.textContent = `Посещаемость · ${shortDate(currentDate)}`;
    students = await fetchGroupStudents(group ?? groups[0]);

    if (!fillLessons()) {
        list.replaceChildren();
        setStatus('На этот день пар нет - выберите другую дату в расписании / через 15 секунд загрузится тестовое расписание, пожалуйста подождите');
        return;
    }

    loadLesson();
}
