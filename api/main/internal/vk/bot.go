package vk

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"time"
)

const apiVersion = "5.199"

type Bot struct {
	token   string
	groupID int
	http    *http.Client
}

func NewBot(token string, groupID int) *Bot {
	return &Bot{token: token, groupID: groupID, http: &http.Client{}}
}

func (b *Bot) SendMessage(userID int64, text string) error {
	params := url.Values{
		"access_token": {b.token}, "v": {apiVersion},
		"user_id":   {fmt.Sprintf("%d", userID)},
		"random_id": {fmt.Sprintf("%d", time.Now().UnixNano())},
		"message":   {text},
	}
	return b.call("messages.send", params, nil)
}

func (b *Bot) SendDocument(userID int64, filename string, data []byte, caption string) error {
	attachment, err := b.uploadDocument(filename, data)
	if err != nil {
		return err
	}
	params := url.Values{
		"access_token": {b.token}, "v": {apiVersion},
		"user_id":    {fmt.Sprintf("%d", userID)},
		"random_id":  {fmt.Sprintf("%d", time.Now().UnixNano())},
		"attachment": {attachment},
	}
	if caption != "" {
		params.Set("message", caption)
	}
	return b.call("messages.send", params, nil)
}

// uploadDocument — у VK, в отличие от Telegram, нельзя просто отправить
// файл одним запросом: сначала получаем сервер загрузки, грузим файл туда,
// потом сохраняем через docs.save и получаем строку-вложение "doc<owner>_<id>"
func (b *Bot) uploadDocument(filename string, data []byte) (string, error) {
	var uploadResp struct {
		Response struct {
			UploadURL string `json:"upload_url"`
		} `json:"response"`
	}
	if err := b.call("docs.getMessagesUploadServer", url.Values{
		"access_token": {b.token}, "v": {apiVersion},
		"type": {"doc"}, "peer_id": {"0"},
	}, &uploadResp); err != nil {
		return "", err
	}

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", err
	}
	if _, err := part.Write(data); err != nil {
		return "", err
	}
	if err := writer.Close(); err != nil {
		return "", err
	}

	req, err := http.NewRequest(http.MethodPost, uploadResp.Response.UploadURL, &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := b.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var uploadResult struct {
		File string `json:"file"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&uploadResult); err != nil {
		return "", err
	}

	var saveResp struct {
		Response []struct {
			Doc struct {
				ID      int64 `json:"id"`
				OwnerID int64 `json:"owner_id"`
			} `json:"doc"`
		} `json:"response"`
	}
	if err := b.call("docs.save", url.Values{
		"access_token": {b.token}, "v": {apiVersion}, "file": {uploadResult.File},
	}, &saveResp); err != nil {
		return "", err
	}
	if len(saveResp.Response) == 0 {
		return "", fmt.Errorf("vk docs.save returned no document")
	}
	doc := saveResp.Response[0].Doc
	return fmt.Sprintf("doc%d_%d", doc.OwnerID, doc.ID), nil
}

func (b *Bot) call(method string, params url.Values, out any) error {
	resp, err := b.http.PostForm(fmt.Sprintf("https://api.vk.com/method/%s", method), params)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var apiErr struct {
		Error *struct {
			ErrorMsg string `json:"error_msg"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &apiErr) == nil && apiErr.Error != nil {
		return fmt.Errorf("vk api error: %s", apiErr.Error.ErrorMsg)
	}
	if out != nil {
		return json.Unmarshal(body, out)
	}
	return nil
}
