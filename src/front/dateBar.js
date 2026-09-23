import {
    DATE_STRIP_PAST_DAYS, DATE_STRIP_FUTURE_DAYS,
    WEEKDAY_SHORT, MONTH_TITLES, CALENDAR_WEEKS
} from './config.js';
import { getDateString, parseDateString, shortDate } from './dates.js';

const strip = document.getElementById('date-strip');
const pickBtn = document.getElementById('date-pick-btn');
const pickLabel = document.getElementById('date-pick-label');
const calendar = document.getElementById('calendar');
const calendarTitle = document.getElementById('calendar-title');
const calendarGrid = document.getElementById('calendar-grid');

let selectedDate = null;
let visibleMonth = null;
let pickDate = null;

function today() {
    return getDateString(new Date());
}

function createDayChip(date) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'day-chip';
    chip.dataset.date = getDateString(date);
    chip.classList.toggle('is-today', chip.dataset.date === today());

    const weekday = document.createElement('span');
    weekday.className = 'day-chip-weekday';
    weekday.textContent = WEEKDAY_SHORT[date.getDay()];

    const number = document.createElement('span');
    number.className = 'day-chip-number';
    number.textContent = date.getDate();

    chip.append(weekday, number);
    return chip;
}

function buildStrip(anchor) {
    const base = parseDateString(anchor);
    const chips = [];

    for (let offset = -DATE_STRIP_PAST_DAYS; offset <= DATE_STRIP_FUTURE_DAYS; offset += 1) {
        const day = new Date(base);
        day.setDate(base.getDate() + offset);
        chips.push(createDayChip(day));
    }

    strip.replaceChildren(...chips);
}

function chipFor(value) {
    return strip.querySelector(`[data-date="${value}"]`);
}

function weekStart(date) {
    const monday = new Date(date);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return monday;
}

function createDayCell(date) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'calendar-day';
    cell.dataset.date = getDateString(date);
    cell.textContent = date.getDate();

    cell.classList.toggle('is-outside', date.getMonth() !== visibleMonth.getMonth());
    cell.classList.toggle('is-today', cell.dataset.date === today());
    cell.classList.toggle('is-selected', cell.dataset.date === selectedDate);

    return cell;
}

function renderCalendar() {
    calendarTitle.textContent = `${MONTH_TITLES[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`;

    const start = weekStart(visibleMonth);
    const cells = [];

    for (let offset = 0; offset < CALENDAR_WEEKS * 7; offset += 1) {
        const day = new Date(start);
        day.setDate(start.getDate() + offset);
        cells.push(createDayCell(day));
    }

    calendarGrid.replaceChildren(...cells);
}

function setCalendarOpen(open) {
    calendar.hidden = !open;
    pickBtn.setAttribute('aria-expanded', String(open));

    if (open) {
        visibleMonth = parseDateString(selectedDate);
        visibleMonth.setDate(1);
        renderCalendar();
    }
}

function shiftMonth(months) {
    visibleMonth.setMonth(visibleMonth.getMonth() + months);
    renderCalendar();
}

function choose(value) {
    setCalendarOpen(false);
    pickDate(value);
}

export function markSelectedDate(value) {
    selectedDate = value;
    if (!chipFor(value)) buildStrip(value);

    strip.querySelectorAll('.day-chip').forEach((chip) => {
        const selected = chip.dataset.date === value;
        chip.classList.toggle('is-selected', selected);
        chip.setAttribute('aria-pressed', String(selected));
    });

    chipFor(value).scrollIntoView({ inline: 'center', block: 'nearest' });
    pickLabel.textContent = shortDate(value);
}

export function initDateBar(selected, onPick) {
    pickDate = onPick;
    markSelectedDate(selected);

    strip.addEventListener('click', (event) => {
        const chip = event.target.closest('.day-chip');
        if (chip) pickDate(chip.dataset.date);
    });

    calendarGrid.addEventListener('click', (event) => {
        const cell = event.target.closest('.calendar-day');
        if (cell) choose(cell.dataset.date);
    });

    pickBtn.addEventListener('click', () => setCalendarOpen(calendar.hidden));
    document.getElementById('calendar-prev').addEventListener('click', () => shiftMonth(-1));
    document.getElementById('calendar-next').addEventListener('click', () => shiftMonth(1));
    document.getElementById('calendar-today').addEventListener('click', () => choose(today()));

    document.addEventListener('pointerdown', (event) => {
        if (!calendar.hidden && !event.target.closest('.date-pick')) setCalendarOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !calendar.hidden) setCalendarOpen(false);
    });
}
