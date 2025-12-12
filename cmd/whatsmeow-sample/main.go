//go:build ignore
// +build ignore

package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"time"

	"github.com/mdp/qrterminal/v3"
	"github.com/tulir/whatsmeow"
	"github.com/tulir/whatsmeow/store/sqlstore"
	_ "github.com/mattn/go-sqlite3"
	"github.com/tulir/whatsmeow/types/events"
	waProto "go.mau.fi/whatsmeow/binary/proto"
)

func main() {
	// Create SQLite-backed store in current folder
	dbPath := "whatsmeow_sample.db"
	container, err := sqlstore.New("sqlite3", fmt.Sprintf("file:%s?_foreign_keys=on", dbPath), nil)
	if err != nil {
		log.Fatalf("failed to create sqlstore: %v", err)
	}

	device, err := container.GetFirstDevice()
	if err != nil {
		log.Fatalf("failed to get device storage: %v", err)
	}

	client := whatsmeow.NewClient(device, nil)

	// Simple event handler: print incoming messages and echo back
	client.AddEventHandler(func(evt interface{}) {
		switch e := evt.(type) {
		case *events.QRCode:
			// Print QR to terminal (for login)
			fmt.Println("QR code received - scan with WhatsApp:")
			qrterminal.GenerateHalfBlock(e.Code, qrterminal.L, os.Stdout)
		case *events.Login:
			fmt.Println("Logged in. JID:", client.Store.ID) // best-effort
		case *events.Message:
			msg := e.Message
			var body string
			if msg == nil {
				return
			}
			if conv := msg.GetConversation(); conv != nil {
				body = *conv
			} else if extendedText := msg.GetExtendedTextMessage(); extendedText != nil {
				if extendedText.Text != nil {
					body = *extendedText.Text
				}
			}
			if body == "" {
				return
			}
			sender := e.Info.Source.Participant
			if sender == nil {
				sender = e.Info.Source.Sender
			}
			fmt.Printf("Incoming message from %v: %s\n", sender, body)

			// Echo back the message after a short delay
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
				defer cancel()
				jid := e.Info.Sender
				if jid == nil {
					return
				}
				_, err := client.SendMessage(ctx, jid, "", &waProto.Message{Conversation: waProto.String("Echo: " + body)})
				if err != nil {
					log.Printf("failed to send echo: %v", err)
				}
			}()
		}
	})

	// Connect (this will either reuse an existing session or emit a QR event)
	if err := client.Connect(); err != nil {
		log.Fatalf("failed to connect: %v", err)
	}

	// Wait for interrupt signal
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)
	<-c

	fmt.Println("disconnecting...")
	client.Disconnect()
}
