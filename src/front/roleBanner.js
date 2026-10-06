import { ROLE_TITLES, ROLES_WITH_TOOLS } from './config.js';
import { GUEST_SESSION, fetchSession, login, clearSession } from './session.js';
import { openAttendance } from './attendance.js';

const roleName = document.getElementById('role-name');
const roleGroup = document.getElementById('role-group');
const roleEmail = document.getElementById('role-email');
const roleStatus = document.getElementById('role-status');
const roleToolsBtn = document.getElementById('role-tools-btn');
const loginOpenBtn = document.getElementById('login-open-btn');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const logoutBtn = document.getElementById('logout-btn');

let session = GUEST_SESSION;
let pickedGroup = null;

function setStatus(text, isError = false) {
    roleStatus.textContent = text;
    roleStatus.classList.toggle('is-error', isError);
}

function groupTitle() {
    if (session.groups.length) return session.groups.join(', ');
    return session.group ?? pickedGroup ?? 'не выбрана';
}

function showBanner(state) {
    const signedIn = Boolean(session.userId);

    roleName.textContent = session.fullName || ROLE_TITLES[session.role];
    roleGroup.textContent = groupTitle();
    roleEmail.textContent = signedIn ? `${ROLE_TITLES[session.role]} · ${session.email}` : '';
    roleEmail.hidden = !signedIn;

    loginOpenBtn.hidden = signedIn || state === 'login';
    loginForm.hidden = state !== 'login';
    logoutBtn.hidden = !signedIn;
    roleToolsBtn.hidden = !signedIn || !ROLES_WITH_TOOLS.includes(session.role);
}

roleToolsBtn.addEventListener('click', () => openAttendance(session));

loginOpenBtn.addEventListener('click', () => {
    setStatus('');
    showBanner('login');
    loginEmail.focus();
});

document.getElementById('login-cancel-btn').addEventListener('click', () => {
    loginForm.reset();
    setStatus('');
    showBanner('guest');
});

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginSubmitBtn.disabled = true;
    setStatus('Проверяем…');

    try {
        session = await login(loginEmail.value.trim(), loginPassword.value);
    } catch (error) {
        setStatus(`Не удалось войти: ${error.message}`, true);
        return;
    } finally {
        loginSubmitBtn.disabled = false;
        loginPassword.value = '';
    }

    loginForm.reset();
    setStatus('');
    showBanner('account');
});

logoutBtn.addEventListener('click', () => {
    clearSession();
    session = GUEST_SESSION;
    setStatus('');
    showBanner('guest');
});

export function showPickedGroup(name) {
    pickedGroup = name;
    showBanner(loginForm.hidden ? 'account' : 'login');
}

export async function initRoleBanner() {
    showBanner('guest');

    try {
        session = await fetchSession();
    } catch (error) {
        setStatus(`Не удалось получить профиль: ${error.message}`, true);
        return;
    }

    showBanner('account');
}
