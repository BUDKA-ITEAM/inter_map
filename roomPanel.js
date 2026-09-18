// Панель кабинета: показ пар выбранного кабинета, закрытие по кнопке/Escape/клику мимо.
import {
    roomPanel, roomPanelClose, roomPanelTitle, roomPanelContent,
    currentSchedule, setScheduleCollapsedForRoom
} from './state.js';
import { getPairStatus } from './schedule.js';
import { resetActiveSelection, renderer } from './three.js';

export function showRoomPanel(roomNumber, roomName) {
    roomPanelTitle.textContent = `${roomName}${roomNumber ? ` (${roomNumber})` : ''}`;
    roomPanelContent.innerHTML = '';

    const roomPairs = currentSchedule.filter((p) => p.roomId === roomNumber);
    if (roomPairs.length === 0) {
        roomPanelContent.innerHTML = '<p>Нет пар на выбранную дату</p>';
    } else {
        roomPairs.forEach((pair) => {
            const item = document.createElement('div');
            item.className = `room-pair-item ${getPairStatus(pair)}`;
            item.innerHTML = `
                <span class="room-pair-date">${pair.time}</span>
                <div class="room-pair-group">${pair.name}</div>
                <div class="room-pair-teacher">${pair.teacher || 'Преподаватель не указан'}</div>
            `;
            roomPanelContent.appendChild(item);
        });
    }
    roomPanel.classList.add('visible');
}

export function hideRoomPanel() {
    roomPanel.classList.remove('visible');
    // карточку закрыли — кнопка «Назад» больше не нужна
    roomPanel.classList.remove('can-return');
    setScheduleCollapsedForRoom(false);
}

// обработчики закрытия панели кабинета
roomPanelClose.addEventListener('click', () => {
    resetActiveSelection();
    hideRoomPanel();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && roomPanel.classList.contains('visible')) {
        resetActiveSelection();
        hideRoomPanel();
    }
});

document.addEventListener('pointerdown', (event) => {
    if (!roomPanel.classList.contains('visible')) return;
    if (roomPanel.contains(event.target) || renderer.domElement.contains(event.target)) return;
    // кнопки «Подробнее» и «Скрыть» лежат поверх карты, но к карточке
    // кабинета отношения не имеют — по ним она закрываться не должна
    if (event.target.closest('.legend-btn')) return;
    resetActiveSelection();
    hideRoomPanel();
});
