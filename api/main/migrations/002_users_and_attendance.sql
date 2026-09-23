CREATE TYPE user_role AS ENUM ('student', 'monitor', 'curator', 'admin');

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name     TEXT NOT NULL DEFAULT '',
    role          user_role NOT NULL DEFAULT 'student',
    "group"       TEXT NOT NULL DEFAULT '', -- group for student/monitor; y curator ne usaetsa
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- kurator s neskol'kimi groupami
CREATE TABLE curator_groups (
    curator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "group"    TEXT NOT NULL,
    PRIMARY KEY (curator_id, "group")
);

-- reqests for role(monitor/student)
CREATE TABLE role_requests (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_role   user_role NOT NULL,       -- 'monitor' | 'curator'
    requested_groups TEXT[] NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by      INTEGER REFERENCES users(id),
    reviewed_at      TIMESTAMPTZ
);

CREATE TABLE attendance (
    id         SERIAL PRIMARY KEY,
    lesson_id  BIGINT NOT NULL,
    student_id INTEGER NOT NULL REFERENCES users(id),
    status     TEXT NOT NULL DEFAULT 'absent', -- 'present' | 'absent' | 'excused'
    marked_by  INTEGER NOT NULL REFERENCES users(id),
    marked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (lesson_id, student_id)
);