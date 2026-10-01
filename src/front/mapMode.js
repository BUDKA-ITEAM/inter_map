import { MAP_STORAGE_KEY, GROUP_STORAGE_KEY, TEACHER_STORAGE_KEY } from './config.js';
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

function mapShown() {
    return document.documentElement.dataset.map === 'on';
}

function setSheetOpen(open) {
    scheduleToggle.checked = open;
    scheduleToggle.dispatchEvent(new Event('change'));
}

function showMap() {
    const wasHidden = !mapShown();
    document.documentElement.dataset.map = 'on';

    if (wasHidden) setSheetOpen(false);
    setFloor(currentFloor);
}

function hideMap() {
    document.documentElement.dataset.map = 'off';
    setSheetOpen(true);
}

function applyMapMode(shown) {
    if (shown) showMap();
    else hideMap();

    mapToggle.checked = shown;
    writeStored(MAP_STORAGE_KEY, shown ? 'on' : 'off');
}

mapToggle.addEventListener('change', () => {
    applyMapMode(mapToggle.checked);
    setScheduleDrawerOpen(!mapToggle.checked);
});

export async function initMapMode() {
    const saved = readStored(MAP_STORAGE_KEY);
    if (saved === 'on' || saved === 'off') {
        applyMapMode(saved === 'on');
        return;
    }

    await new Promise((resolve) => {
        const choose = (shown) => {
            delete document.documentElement.dataset.intro;
            applyMapMode(shown);
            resolve();
        };

        introMapBtn.addEventListener('click', () => choose(true), { once: true });
        introScheduleBtn.addEventListener('click', () => choose(false), { once: true });
    });
}

export function openScheduleStart() {
    if (mapShown()) return;
    if (readStored(SAVED_SELECTION_KEYS[scheduleMode])) return;

    setScheduleDrawerOpen(true);
    if (scheduleMode === 'group') openGroupPicker();
}
