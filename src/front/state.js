export const container = document.getElementById('model-container');
export const modelLoading = document.getElementById('model-loading');
export const clickInfoDiv = document.getElementById('click-info');
export const sidebarToggle = document.getElementById('sidebar-toggle');
export const sidebar = document.getElementById('sidebar');
export const groupSelect = document.getElementById('group-select');
export const teacherSelect = document.getElementById('teacher-select');
export const pairsContainer = document.getElementById('pairs-container');
export const roomPanel = document.getElementById('room-panel');
export const roomPanelClose = document.getElementById('room-panel-close');
export const roomPanelBack = document.getElementById('room-panel-back');
export const roomPanelTitle = document.getElementById('room-panel-title');
export const roomPanelContent = document.getElementById('room-panel-content');
export const dateInput = document.getElementById('date-input');
export const prevDayBtn = document.getElementById('prev-day');
export const nextDayBtn = document.getElementById('next-day');
export const stubOverlay = document.getElementById('stub-overlay');
export const floorNumbers = document.querySelectorAll('.floor-numbers span');

export let currentGroup = null;
export function setCurrentGroup(value) { currentGroup = value; }

export let currentTeacher = null;
export function setCurrentTeacher(value) { currentTeacher = value; }

export let scheduleMode = 'group';
export function setScheduleMode(value) { scheduleMode = value; }

export let viewMode = 'day';
export function setViewMode(value) { viewMode = value; }

export let currentSchedule = [];
export function setCurrentSchedule(value) { currentSchedule = value; }

export let highlightedMeshes = [];
export function setHighlightedMeshes(value) { highlightedMeshes = value; }

export let selectedMesh = null;
export function setSelectedMesh(value) { selectedMesh = value; }

export let activeHighlightedMesh = null;
export function setActiveHighlightedMesh(value) { activeHighlightedMesh = value; }

export let currentDate = null;
export function setCurrentDate(value) { currentDate = value; }

export let currentFloor = 2;
export function setCurrentFloor(value) { currentFloor = value; }


export let scheduleCollapsedForRoom = false;
export function setScheduleCollapsedForRoom(value) { scheduleCollapsedForRoom = value; }

export let roomMeshes = [];
export function setRoomMeshes(value) { roomMeshes = value; }
