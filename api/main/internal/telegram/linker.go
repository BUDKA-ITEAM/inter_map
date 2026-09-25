package telegram

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Linker struct {
	bot *Bot
	db  *pgxpool.Pool
}

func NewLinker(bot *Bot, db *pgxpool.Pool) *Linker {
	return &Linker{bot: bot, db: db}
}

func (l *Linker) StartPolling(ctx context.Context) {
	go func() {
		offset := 0
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}

			updates, err := l.bot.GetUpdates(offset)
			if err != nil {
				log.Printf("telegram getUpdates failed: %v", err)
				time.Sleep(5 * time.Second)
				continue
			}

			for _, u := range updates {
				offset = u.UpdateID + 1
				if u.Message == nil {
					continue
				}
				l.handleMessage(ctx, u.Message.Chat.ID, u.Message.Text)
			}
		}
	}()
}

func (l *Linker) linkByCode(ctx context.Context, chatID int64, code string) {
	code = strings.TrimSpace(code)

	var userID int
	err := l.db.QueryRow(ctx, `
		SELECT user_id FROM telegram_link_codes
		WHERE code = $1 AND expires_at > now()`,
		code,
	).Scan(&userID)
	if err != nil {
		_ = l.bot.SendMessage(chatID, "Код не найден или истёк. Запросите новый в личном кабинете.")
		return
	}

	if _, err := l.db.Exec(ctx,
		`UPDATE users SET telegram_chat_id = $1 WHERE id = $2`, chatID, userID,
	); err != nil {
		log.Printf("failed to link telegram chat: %v", err)
		return
	}
	_, _ = l.db.Exec(ctx, `DELETE FROM telegram_link_codes WHERE code = $1`, code)

	_ = l.bot.SendMessage(chatID, "Telegram успешно привязан к вашему аккаунту!")
}

func (l *Linker) handleMessage(ctx context.Context, chatID int64, text string) {
	text = strings.TrimSpace(text)

	switch {
	case text == "/start":
		_ = l.bot.SendMessage(chatID, "Привет! Чтобы привязать аккаунт, откройте ссылку из личного кабинета — она пришлёт нужный код автоматически.")
	case strings.HasPrefix(text, "/start "):
		l.linkByCode(ctx, chatID, strings.TrimPrefix(text, "/start "))
	case strings.HasPrefix(text, "/link "):
		l.linkByCode(ctx, chatID, strings.TrimPrefix(text, "/link "))
	}
}
