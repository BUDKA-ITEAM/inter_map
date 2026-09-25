ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

CREATE TABLE IF NOT EXISTS telegram_link_codes (
    code       TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SELECT id, username, telegram_chat_id FROM users WHERE telegram_chat_id IS NOT NULL;
-- SELECT * FROM telegram_link_codes WHERE expires_at > now();