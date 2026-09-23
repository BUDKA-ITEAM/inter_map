import { ROLE_TITLES, ROLES_WITH_TOOLS } from './config.js';
import { GUEST_SESSION, fetchSession } from './session.js';

const roleName = document.getElementById('role-name');
const roleGroup = document.getElementById('role-group');
const roleEmail = document.getElementById('role-email');
const roleToolsBtn = document.getElementById('role-tools-btn');
const roleStatus = document.getElementById('role-status');

let session = GUEST_SESSION;
let pickedGroup = null;

function renderBanner() {
    roleName.textContent = ROLE_TITLES[session.role];
    roleGroup.textContent = session.group ?? pickedGroup ?? 'не выбрана';
    roleEmail.textContent = session.email ?? '';
    roleEmail.hidden = !session.email;
    roleToolsBtn.hidden = !ROLES_WITH_TOOLS.includes(session.role);
}

// сюда подключаются будущие экраны старосты и куратора, остается развести по ней конкретные разделы
roleToolsBtn.addEventListener('click', () => {
    roleStatus.textContent = `Раздел «${ROLE_TITLES[session.role]}» откроется после входа по почте`;
});

export function showPickedGroup(name) {
    pickedGroup = name;
    renderBanner();
}

export async function initRoleBanner() {
    renderBanner();
    session = await fetchSession();
    renderBanner();
}
