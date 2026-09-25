package mailer

import (
	"io"

	"gopkg.in/gomail.v2"
)

type Mailer struct {
	dialer *gomail.Dialer
	from   string
}

func NewMailer(host string, port int, username, password, from string) *Mailer {
	return &Mailer{
		dialer: gomail.NewDialer(host, port, username, password),
		from:   from,
	}
}

func (m *Mailer) SendDocument(to, subject, body, filename string, data []byte) error {
	msg := gomail.NewMessage()
	msg.SetHeader("From", m.from)
	msg.SetHeader("To", to)
	msg.SetHeader("Subject", subject)
	msg.SetBody("text/plain", body)
	msg.Attach(filename, gomail.SetCopyFunc(func(w io.Writer) error {
		_, err := w.Write(data)
		return err
	}))
	return m.dialer.DialAndSend(msg)
}
