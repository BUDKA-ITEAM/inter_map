import './state.js';
import './three.js';
import './schedule.js';
import './roomPanel.js';
import './groups.js';
import './teachers.js';
import './ui.js';
import './startMode.js';
import './roleBanner.js';

import { setScheduleDate, scheduleToggle } from './schedule.js';
import { getDateString } from './dates.js';
import { initDateBar } from './dateBar.js';
import { initGroupPicker } from './groups.js';
import { initTeacherPicker } from './teachers.js';
import { initTheme, initDebugMode, initExtrasUnlock } from './ui.js';
import { initStartMode, openScheduleStart } from './startMode.js';
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

await initStartMode();
openScheduleStart();

if (new URLSearchParams(window.location.search).get('schedule') === '1') {
    scheduleToggle.checked = true;
    scheduleToggle.dispatchEvent(new Event('change'));
}
