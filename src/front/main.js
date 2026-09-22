import './state.js';
import './three.js';
import './schedule.js';
import './roomPanel.js';
import './groups.js';
import './teachers.js';
import './ui.js';

import { setFloor } from './three.js';
import { getDateString, scheduleToggle } from './schedule.js';
import { initGroupPicker } from './groups.js';
import { initTeacherPicker } from './teachers.js';
import { initTheme, initDebugMode, initExtrasUnlock } from './ui.js';
import { dateInput, currentDate, currentFloor, setCurrentDate } from './state.js';

initTheme();
initDebugMode();
initExtrasUnlock();

setCurrentDate(getDateString(new Date()));
dateInput.value = currentDate;
setFloor(currentFloor);

initGroupPicker();
initTeacherPicker();

if (new URLSearchParams(window.location.search).get('schedule') === '1') {
    scheduleToggle.checked = true;
    scheduleToggle.dispatchEvent(new Event('change'));
}
