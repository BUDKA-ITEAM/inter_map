import { START_MODE_STORAGE_KEY, GROUP_STORAGE_KEY, TEACHER_STORAGE_KEY } from './config.js';
import { currentFloor, scheduleMode } from './state.js';
import { readStored, writeStored } from './storage.js';
import { setFloor } from './three.js';
import { setScheduleDrawerOpen } from './ui.js';
import { scheduleToggle } from './schedule.js';
import { openGroupPicker } from './groups.js';

const introMapBtn = document.getElementById('intro-map');
const introScheduleBtn = document.getElementById('intro-schedule');
const mapToggle = document.getElementById('map-toggle');

const SAVED_SELECTION_KEYS = {
    group: GROUP_STORAGE_KEY,
    teacher: TEACHER_STORAGE_KEY
};

function currentMode() {
    return document.documentElement.dataset.startMode;
}

function setSheetOpen(open) {
    scheduleToggle.checked = open;
    scheduleToggle.dispatchEvent(new Event('change'));
}

function showMap() {
    const leavingScheduleOnly = currentMode() === 'schedule';
    document.documentElement.dataset.startMode = 'map';

    if (leavingScheduleOnly) setSheetOpen(false);
    setFloor(currentFloor);
}

function showScheduleOnly() {
    document.documentElement.dataset.startMode = 'schedule';
    setSheetOpen(true);
}

function applyMode(mode) {
    if (mode === 'map') showMap();
    else showScheduleOnly();

    mapToggle.checked = mode === 'map';
    writeStored(START_MODE_STORAGE_KEY, mode);
}

mapToggle.addEventListener('change', () => {
    applyMode(mapToggle.checked ? 'map' : 'schedule');
    setScheduleDrawerOpen(!mapToggle.checked);
});

export async function initStartMode() {
    const saved = readStored(START_MODE_STORAGE_KEY);
    if (saved === 'map' || saved === 'schedule') {
        applyMode(saved);
        return;
    }

    await new Promise((resolve) => {
        const choose = (mode) => {
            applyMode(mode);
            resolve();
        };

        introMapBtn.addEventListener('click', () => choose('map'), { once: true });
        introScheduleBtn.addEventListener('click', () => choose('schedule'), { once: true });
    });
}

export function openScheduleStart() {
    if (currentMode() !== 'schedule') return;
    if (readStored(SAVED_SELECTION_KEYS[scheduleMode])) return;

    setScheduleDrawerOpen(true);
    if (scheduleMode === 'group') openGroupPicker();
}
