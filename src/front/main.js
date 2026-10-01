import './state.js';
import './three.js';
import './schedule.js';
import './roomPanel.js';
import './groups.js';
import './teachers.js';
import './ui.js';
import './mapMode.js';
import './roleBanner.js';

import { setScheduleDate, scheduleToggle } from './schedule.js';
import { getDateString } from './dates.js';
import { initDateBar } from './dateBar.js';
import { initGroupPicker } from './groups.js';
import { initTeacherPicker } from './teachers.js';
import { initTheme, initDebugMode, initExtrasUnlock } from './ui.js';
import { initMapMode, openScheduleStart } from './mapMode.js';
import { initRoleBanner } from './roleBanner.js';
import { currentDate, setCurrentDate } from './state.js';

initTheme();
initDebugMode();
initExtrasUnlock();

setCurrentDate(getDateString(new Date()));
initDateBar(currentDate, setScheduleDate);

initRoleBanner();
initGroupPicker();
initTeacherPicker();

await initMapMode();
openScheduleStart();

if (new URLSearchParams(window.location.search).get('schedule') === '1') {
    scheduleToggle.checked = true;
    scheduleToggle.dispatchEvent(new Event('change'));
}
