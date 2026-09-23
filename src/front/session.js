// бекендик крути сюда с логикой ролей, роль привязана к почте
import { API_BASE_URL, API_TIMEOUT_MS, SESSION_ENDPOINT, ROLE_TITLES } from './config.js';

export const GUEST_SESSION = { email: null, role: 'student', group: null };

function normalizeSession({ email, role, group }) {
    return {
        email: email ?? null,
        role: role in ROLE_TITLES ? role : GUEST_SESSION.role,
        group: group ?? null
    };
}

export async function fetchSession() {
    try {
        const response = await fetch(`${API_BASE_URL}${SESSION_ENDPOINT}`, {
            credentials: 'include',
            signal: AbortSignal.timeout(API_TIMEOUT_MS)
        });
        if (!response.ok) return GUEST_SESSION;
        return normalizeSession(await response.json());
    } catch {
        return GUEST_SESSION;
    }
}
