// под ноль после показа
import { SESSION_ENDPOINT, ATTENDANCE_ENDPOINT, TOKEN_STORAGE_KEY } from './config.js';
import { writeStored } from './storage.js';
import { initRoleBanner } from './roleBanner.js';

const DEMO_PROFILE = {
    user_id: 7,
    username: 'petrova@college.ru',
    full_name: 'Петрова А. В.',
    role: 'monitor',
    group: '01-25.ДИЗ.ОФ.9'
};

const marks = [];
let stubInstalled = false;

function jsonResponse(body) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

function saveMark(mark) {
    const same = marks.find((saved) =>
        saved.lesson_id === mark.lesson_id && saved.student_id === mark.student_id);

    if (same) same.status = mark.status;
    else marks.push(mark);
}

function answerAttendance(address, options) {
    if (options?.method === 'POST') {
        saveMark(JSON.parse(options.body));
        return jsonResponse({});
    }

    const lessonId = Number(new URL(address, location.href).searchParams.get('lesson_id'));
    return jsonResponse(marks.filter((saved) => saved.lesson_id === lessonId));
}

function installStub() {
    const realFetch = window.fetch;

    window.fetch = (url, options) => {
        const address = String(url);

        if (address.includes(SESSION_ENDPOINT)) return jsonResponse(DEMO_PROFILE);
        if (address.includes(ATTENDANCE_ENDPOINT)) return answerAttendance(address, options);

        return realFetch(url, options);
    };
}

document.getElementById('demo-monitor-btn').addEventListener('click', () => {
    if (!stubInstalled) {
        installStub();
        stubInstalled = true;
    }

    writeStored(TOKEN_STORAGE_KEY, 'demo');
    initRoleBanner();
});
