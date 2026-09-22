import {
    roomPanel, roomPanelClose, roomPanelTitle, roomPanelContent,
    currentSchedule, currentDate, setScheduleCollapsedForRoom
} from './state.js';
import { getPairStatus, shortDate } from './schedule.js';
import { resetActiveSelection, renderer } from './three.js';

function renderPairItem(pair) {
    const item = document.createElement('div');
    item.className = `room-pair-item ${getPairStatus(pair)}`;

    const when = pair.date && pair.date !== currentDate
        ? `${shortDate(pair.date)}, ${pair.time}`
        : pair.time;

    item.innerHTML = `
        <span class="room-pair-date">${when}</span>
        <div class="room-pair-group">${pair.name}</div>
        <div class="room-pair-teacher">${pair.teacher || 'Преподаватель не указан'}</div>
    `;
    return item;
}

export function showRoomPanel(roomNumber, roomName) {
    roomPanelTitle.textContent = `${roomName}${roomNumber ? ` (${roomNumber})` : ''}`;
    roomPanelContent.innerHTML = '';

    const roomPairs = currentSchedule.filter((pair) => pair.roomId === roomNumber);
    if (roomPairs.length === 0) {
        roomPanelContent.innerHTML = '<p>Нет пар на выбранную дату</p>';
    } else {
        roomPairs.forEach((pair) => roomPanelContent.appendChild(renderPairItem(pair)));
    }

    roomPanel.classList.add('visible');
}

export function hideRoomPanel() {
    roomPanel.classList.remove('visible', 'can-return');
    setScheduleCollapsedForRoom(false);
}

function closeRoomPanel() {
    resetActiveSelection();
    hideRoomPanel();
}

roomPanelClose.addEventListener('click', closeRoomPanel);

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && roomPanel.classList.contains('visible')) closeRoomPanel();
});

document.addEventListener('pointerdown', (event) => {
    if (!roomPanel.classList.contains('visible')) return;
    if (roomPanel.contains(event.target) || renderer.domElement.contains(event.target)) return;
    if (event.target.closest('.map-chip')) return;
    closeRoomPanel();
});
