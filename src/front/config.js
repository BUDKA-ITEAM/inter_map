// Константы и статичные конфиги: зум, модели этажей, api, кабинеты, цвета, пороги жестов, ключи localStorage.

// определение мобильного устройства для настройки зума
export const isMobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.matchMedia('(pointer: coarse)').matches;
export const FIT_MARGIN_DESKTOP = 0.98;
export const FIT_MARGIN_MOBILE = 0.95;
export const FIT_MARGIN = isMobile ? FIT_MARGIN_MOBILE : FIT_MARGIN_DESKTOP;

// модели этажей, этаж есть в списке — готов показываем его план, нет в списке - заглушка
export const FLOOR_MODELS = {
    2: './glbs/2ndfloor.glb',
    3: './glbs/3rdfloor.glb',
    4: './glbs/4thfloor.glb',
    5: './glbs/5thfloor.glb',
    6: './glbs/6thfloor.glb',
};
export const DIAGONAL_MARGIN = 2.0;
export const FRUSTUM_MARGIN = 1.0;
export const FIXED_AZIMUTH = 0;
export const FIXED_POLAR = 0.45;

// Настройки api. заменить ссылку на норм https, на сервере нужно разрешить домен сайта в ALLOWED_ORIGINS (cors)
// Локально работаем с сервером на своей машине, на боевом сайте —
// с публичным адресом. Второй нужно подставить: он должен быть на https,
// иначе браузер заблокирует запрос со страницы, открытой по https.
// Боевой адрес: сюда впишется https-адрес api, когда он появится.
export const API_PRODUCTION_URL = 'https://ЗАМЕНИТЬ-НА-АДРЕС-API';
// Адрес для разработки: сервис поднят на соседней машине и виден
// через Radmin VPN. Поменяйте, если сервис переедет.
export const API_DEV_URL = 'http://26.70.191.230:8080';
// Локальной считаем не только localhost, но и страницу, открытую по адресу
// машины в локальной сети (Live Server на 192.168.*, заход с телефона и т.п.):
// раньше в таком случае подставлялся боевой адрес-заглушка и запрос уходил в никуда.
export const isLocalHost = ['localhost', '127.0.0.1', '', '[::1]'].includes(location.hostname)
    || location.protocol === 'file:'
    || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^26\./.test(location.hostname);
export const API_BASE_URL = isLocalHost ? API_DEV_URL : API_PRODUCTION_URL;
export const LESSONS_ENDPOINT = '/api/lessons';
export const WEEK_SCHEDULE_PAGE_URL = 'week_schedule.html';

// Сколько уроков тянем, когда собираем список групп. Отдельного
// эндпоинта для групп у api нет, поэтому берём широкую выборку уроков
// без фильтра по датам: расписание в базе может быть за любую неделю.
export const GROUPS_SCAN_LIMIT = 2000;

// описание кабинетов по идентификаторам в модели
export const roomConfigFloor2 = {
    //2ndfloor
    '6419': { number: '', name: 'Служебная лестница', showPanel: true },
    '6417': { number: '', name: 'туалетик', showPanel: true },
    '6415': { number: '', name: 'туалетик', showPanel: true },
    '6413': { number: '', name: '', showPanel: true },
    '6435': { number: '', name: 'Подсобное помещение', showPanel: false },
    '6431': { number: '', name: 'Лестничная площадка', showPanel: true },
    '6411': { number: '214', name: 'АХО', showPanel: true },
    '6409': { number: '213', name: 'Приемная директора', showPanel: true },
    '6407': { number: '212', name: 'Кабинет директора', showPanel: true },
    '6423': { number: '211', name: 'Приемная комиссия', showPanel: true },
    '6425': { number: '210', name: 'Заместитель директора по УВР', showPanel: true },
    '6427': { number: '209', name: 'Аудитория (ПК)', showPanel: true },
    '6443': { number: '208', name: 'Актовый зал', showPanel: true },
    '6439': { number: '207', name: 'Спортивный зал', showPanel: true },
    '6441': { number: '206', name: 'Лаборатория', showPanel: true },
    '6437': { number: '205', name: 'Студенческий отдел кадров (СОК)', showPanel: true },
    '6393': { number: '204', name: 'подсобное помещение', showPanel: true },
    '6400': { number: '203', name: 'Раздевалка', showPanel: true },
    '6433': { number: '202', name: 'Гардеробная', showPanel: true },
    '6429': { number: '201', name: 'Коворкинг', showPanel: true },
    // комната ground_1 не показывает панель
    'ground_1': { number: '', name: '', showPanel: false }
};

export const roomConfigFloor3 = {
    '3562': { number: '301', name: 'Аудитория (ПК)', showPanel: true },
    '3560': { number: '', name: 'Лестничная площадка', showPanel: true },
    '3564': { number: '302', name: 'Психолог', showPanel: true },
    '3566': { number: '303', name: 'Класс))', showPanel: true },
    '3568': { number: '304', name: 'Учительская', showPanel: true },
    '3570': { number: '305', name: 'Класс))', showPanel: true },
    '3572': { number: '306', name: 'Класс))', showPanel: true },
    '3574': { number: '307', name: 'Гардероб', showPanel: true },
    '3576': { number: '308', name: 'Кибер спорт))', showPanel: true },
    '3578': { number: '309', name: 'Класс))', showPanel: true },
    '3580': { number: '310', name: 'Класс))', showPanel: true },
    '3616': { number: '311', name: 'Класс))', showPanel: true },
    '3558': { number: '312', name: 'Класс))', showPanel: true },
    '3556': { number: '313', name: 'Класс))', showPanel: true },
    '3554': { number: '314', name: 'Зал для конференций', showPanel: true },
    '3552': { number: '315', name: 'Коворкинг', showPanel: true },
    '3550': { number: '316', name: 'Класс))', showPanel: true },
    '3548': { number: '317', name: 'Бухгалтерия/отдел кадров', showPanel: true },
    '3546': { number: '318', name: 'Директор школы/заместитель', showPanel: true },
    '3544': { number: '319', name: 'Коворкинг начальной школы', showPanel: true },
    '3542': { number: '', name: 'туалетик', showPanel: true },
    '3540': { number: '', name: 'туалетик', showPanel: true },
    '3538': { number: '', name: 'Служебная лестница', showPanel: true },
    '3614': { number: '', name: 'секретная будка', showPanel: true },
};

export const roomConfigFloor4 = {
    '2832': { number: '401', name: 'УПР/ руководители факультетов', showPanel: true },
    '2830': { number: '402', name: 'Лаборатория промышленной робототехники', showPanel: true },
    '2828': { number: '403', name: 'Аудитория', showPanel: true },
    '2826': { number: '404', name: 'Аудитория (ПК)', showPanel: true },
    '2822': { number: '405', name: 'Аудитория (ПК)', showPanel: true },
    '2836': { number: '406', name: 'Аудитория (ПК)', showPanel: true },
    '2818': { number: '407', name: 'Аудитория (ПК)', showPanel: true },
    '2816': { number: '408', name: 'Аудитория (ПК)', showPanel: true },
    '2824': { number: '409', name: 'Аудитория (ПК)', showPanel: true },
    '2820': { number: '410', name: 'Коворкинг', showPanel: true },
    '2812': { number: '411', name: 'Аудитория (ПК)', showPanel: true },
    '2810': { number: '412', name: 'Центр карьеры', showPanel: true },
    '2808': { number: '413', name: 'Аудитория (ПК)', showPanel: true },
    '2834': { number: '', name: 'Лестничная площадка', showPanel: true },
    '2806': { number: '', name: 'туалетик', showPanel: true },
    '2838': { number: '', name: 'туалетик', showPanel: true },
    '2840': { number: '', name: 'служебная лестница', showPanel: true },
    '2814': { number: '', name: 'Архив', showPanel: true },
    '1210': { number: '', name: 'Архив', showPanel: true },
    '1204': { number: '', name: 'Архив', showPanel: true },
    '1216': { number: '', name: 'Архив', showPanel: true },
};

export const roomConfigFloor5 = {
    '2546': { number: '501', name: 'Аудитория (ПК)', showPanel: true },
    '2518': { number: '502', name: 'Кабинет кураторов', showPanel: true },
    '2516': { number: '503', name: 'Аудитория (ПК)', showPanel: true },
    '2520': { number: '504', name: 'Аудитория (ПК)', showPanel: true },
    '2522': { number: '505', name: 'Аудитория (ПК)', showPanel: true },
    '2524': { number: '506', name: 'Аудитория (ПК)', showPanel: true },
    '2506': { number: '507', name: 'Аудитория (ПК)', showPanel: true },
    '2504': { number: '508', name: 'Аудитория (ПК)', showPanel: true },
    '2514': { number: '509', name: 'Аудитория (ПК)', showPanel: true },
    '2512': { number: '510', name: 'Зам. директора по цифровому развитию', showPanel: true },
    '2508': { number: '511', name: 'Аудитория (ПК)', showPanel: true },
    '2510': { number: '512', name: 'Преподавательская', showPanel: true },
    '2500': { number: '513', name: 'Аудитория (ПК)', showPanel: true },
    '2498': { number: '', name: 'туалетик', showPanel: true },
    '2496': { number: '', name: 'туалетик', showPanel: true },
    '2526': { number: '', name: 'Лестничная площадка', showPanel: true },
    '2494': { number: '', name: 'Служебная лестница', showPanel: true },
};

export const roomConfigFloor6 = {
    '2522': { number: '601', name: 'Аудитория дизайнерского рисования', showPanel: true },
    '2518': { number: '602', name: 'Кабинет кураторов', showPanel: true },
    '2516': { number: '603', name: 'Аудитория (ПК)', showPanel: true },
    '2514': { number: '604', name: 'Аудитория', showPanel: true },
    '2508': { number: '605', name: 'Аудитория', showPanel: true },
    '2506': { number: '606', name: 'Аудитория (ПК)', showPanel: true },
    '2512': { number: '607', name: 'Аудитория (ПК)', showPanel: true },
    '2510': { number: '608', name: 'Кабинет организаторов', showPanel: true },
    '2504': { number: '609', name: 'Аудитория (ПК)', showPanel: true },
    '2502': { number: '610', name: 'Аудитория', showPanel: true },
    '2500': { number: '611', name: 'Кабинет УПР', showPanel: true },
    '2498': { number: '', name: 'туалетик', showPanel: true },
    '2496': { number: '', name: 'туалетик', showPanel: true },
    '2526': { number: '', name: 'Служебная лестница', showPanel: true },
    '2520': { number: '', name: 'Лестничная площадка', showPanel: true },
};

// какой конфиг использовать для какого этажа
export const floorRoomConfigs = {
    2: roomConfigFloor2,
    3: roomConfigFloor3,
    4: roomConfigFloor4,
    5: roomConfigFloor5,
    6: roomConfigFloor6,
};

// Запрос к api с ограничением по времени.
//
// Без таймаута повисший запрос молчит бесконечно, и на экране навсегда
// остаётся «Загружаем…». AbortController обрывает его через заданное
// число секунд, а текст ошибки потом показывается пользователю.
export const API_TIMEOUT_MS = 15000;

// палитра цветов и параметры анимации
export const AMBIENT_INTENSITY_LIGHT = 0.7;
export const AMBIENT_INTENSITY_DARK = 0.34;
export const DIR_INTENSITY_LIGHT = 1;
export const DIR_INTENSITY_DARK = 0.5;
export const DECOR_DIM_DARK = 0.6;

export const COLOR_WHITE = 0xffffff;
export const COLOR_SELECTED = 0xd8d3c4;
export const COLOR_WHITE_DARK = 0x8d939b;
export const COLOR_SELECTED_DARK = 0x7a7568;
export const ANIMATION_DURATION = 350;

export const statusColors = {
    past: { normal: 0xf1e2d9, bright: 0xe6cdbd },
    current: { normal: 0xdeebe1, bright: 0xb9d7c1 },
    upcoming: { normal: 0xf3e7ce, bright: 0xe9d3a0 }
};

export const statusColorsDark = {
    past: { normal: 0x7d6b61, bright: 0x8d7566 },
    current: { normal: 0x6c8a74, bright: 0x83a88d },
    upcoming: { normal: 0x8d7f5d, bright: 0xa89469 }
};

export const DRAG_THRESHOLD = 5;

// пороги жестов свайпа для открытия сайдбара
export const SWIPE_EDGE_THRESHOLD = 24;
export const SWIPE_MIN_DISTANCE = 60;

// пороги жестов свайпа для шторки расписания
export const SHEET_EDGE_THRESHOLD = 32;
export const SHEET_MIN_DISTANCE = 60;

export const GROUP_STORAGE_KEY = 'intermap.selectedGroup';
export const THEME_STORAGE_KEY = 'intermap.theme';
export const DEBUG_STORAGE_KEY = 'intermap.debug';
export const DEBUG_UNLOCK_TAPS = 20;
export const DEBUG_VIDEO_TAPS = 30;
export const GAMBLE_UNLOCK_SWITCHES = 20;
export const GAMBLE_STORAGE_KEY = 'intermap.themeSwitches';
