// Точка входа: импортирует все модули (за счёт чего выполняются их побочные
// эффекты — регистрация обработчиков событий) и запускает инициализацию
// в порядке, воспроизводящем поведение исходного app.js.
import './state.js';
import './three.js';
import './schedule.js';
import './roomPanel.js';
import './groups.js';
import './ui.js';

import { setFloor } from './three.js';
import { getDateString } from './schedule.js';
import { initGroupPicker } from './groups.js';
import { initTheme, initDebugMode, initExtrasUnlock } from './ui.js';
import { dateInput, currentDate, currentFloor, setCurrentDate } from './state.js';
import { scheduleToggle } from './schedule.js';

initTheme();
initDebugMode();
initExtrasUnlock();
setCurrentDate(getDateString(new Date()));
dateInput.value = currentDate;
setFloor(currentFloor);
initGroupPicker();

if (new URLSearchParams(window.location.search).get('schedule') === '1') {
    scheduleToggle.checked = true;
    scheduleToggle.dispatchEvent(new Event('change'));
}
