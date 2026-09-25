package vk

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Linker struct {
	bot  *Bot
	db   *pgxpool.Pool
	http *http.Client
}

func NewLinker(bot *Bot, db *pgxpool.Pool) *Linker {
	return &Linker{bot: bot, db: db, http: &http.Client{}}
}

func (l *Linker) StartPolling(ctx context.Context) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}
			server, key, ts, err := l.getLongPollServer()
			if err != nil {
				log.Printf("vk getLongPollServer failed: %v", err)
				time.Sleep(5 * time.Second)
				continue
			}
			l.pollLoop(ctx, server, key, ts)
		}
	}()
}

func (l *Linker) getLongPollServer() (server, key, ts string, err error) {
	var out struct {
		Response struct {
			Server string `json:"server"`
			Key    string `json:"key"`
			TS     string `json:"ts"`
		} `json:"response"`
	}
	err = l.bot.call("groups.getLongPollServer", url.Values{
		"access_token": {l.bot.token}, "v": {apiVersion},
		"group_id": {strconv.Itoa(l.bot.groupID)},
	}, &out)
	return out.Response.Server, out.Response.Key, out.Response.TS, err
}

func (l *Linker) pollLoop(ctx context.Context, server, key, ts string) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		reqURL := fmt.Sprintf("%s?act=a_check&key=%s&ts=%s&wait=25",
			server, url.QueryEscape(key), url.QueryEscape(ts))
		resp, err := l.http.Get(reqURL)
		if err != nil {
			log.Printf("vk long poll failed: %v", err)
			time.Sleep(5 * time.Second)
			return
		}

		var out struct {
			TS      string `json:"ts"`
			Failed  int    `json:"failed"`
			Updates []struct {
				Type   string `json:"type"`
				Object struct {
					Message struct {
						FromID int64  `json:"from_id"`
						Text   string `json:"text"`
					} `json:"message"`
				} `json:"object"`
			} `json:"updates"`
		}
		err = json.NewDecoder(resp.Body).Decode(&out)
		resp.Body.Close()
		if err != nil || out.Failed != 0 {
			return // пересоздаём server/key во внешнем цикле
		}
		ts = out.TS

		for _, u := range out.Updates {
			if u.Type == "message_new" {
				l.handleMessage(ctx, u.Object.Message.FromID, u.Object.Message.Text)
			}
		}
	}
}

func (l *Linker) handleMessage(ctx context.Context, vkUserID int64, text string) {
	text = strings.TrimSpace(text)
	if !strings.HasPrefix(text, "/link ") {
		return
	}
	code := strings.TrimSpace(strings.TrimPrefix(text, "/link "))

	var userID int
	if err := l.db.QueryRow(ctx, `
		SELECT user_id FROM vk_link_codes WHERE code = $1 AND expires_at > now()`,
		code,
	).Scan(&userID); err != nil {
		_ = l.bot.SendMessage(vkUserID, "Код не найден или истёк. Запросите новый в личном кабинете.")
		return
	}

	if _, err := l.db.Exec(ctx, `UPDATE users SET vk_id = $1 WHERE id = $2`, vkUserID, userID); err != nil {
		log.Printf("failed to link vk account: %v", err)
		return
	}
	_, _ = l.db.Exec(ctx, `DELETE FROM vk_link_codes WHERE code = $1`, code)
	_ = l.bot.SendMessage(vkUserID, "VK успешно привязан к вашему аккаунту!")
}
