// бекендик крути сюда с логикой ролей, роль привязана к почте
import {
    API_BASE_URL, API_TIMEOUT_MS, SESSION_ENDPOINT, LOGIN_ENDPOINT,
    TOKEN_STORAGE_KEY, ROLE_TITLES
} from './config.js';
import { readStored, writeStored, removeStored } from './storage.js';

export const GUEST_SESSION = {
    userId: null,
    email: null,
    fullName: '',
    role: 'student',
    group: null,
    groups: []
};

function readToken() {
    return readStored(TOKEN_STORAGE_KEY);
}

function request(path, options) {
    return fetch(`${API_BASE_URL}${path}`, {
        ...options,
        signal: AbortSignal.timeout(API_TIMEOUT_MS)
    });
}

function toSession(data) {
    const { user_id: userId, username, full_name: fullName, role, group, groups } = data;

    return {
        userId: userId ?? null,
        email: username ?? null,
        fullName: fullName ?? '',
        role: role in ROLE_TITLES ? role : GUEST_SESSION.role,
        group: group || null,
        groups: groups ?? []
    };
}

export function clearSession() {
    removeStored(TOKEN_STORAGE_KEY);
}

export async function fetchSession() {
    const token = readToken();
    if (!token) return GUEST_SESSION;

    const response = await request(SESSION_ENDPOINT, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
        clearSession();
        return GUEST_SESSION;
    }
    if (!response.ok) throw new Error(`сервер ответил ${response.status}`);

    return toSession(await response.json());
}

export async function login(username, password) {
    const response = await request(LOGIN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

    if (response.status === 401) throw new Error('неверная почта или пароль');
    if (!response.ok) throw new Error(`сервер ответил ${response.status}`);

    const { token } = await response.json();
    writeStored(TOKEN_STORAGE_KEY, token);

    return fetchSession();
}
