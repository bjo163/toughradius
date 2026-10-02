// Package securestore provides authenticated encryption for operator-managed
// network credentials that must be stored alongside application data.
package securestore

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
)

var errEmptyKey = errors.New("secret encryption key is empty")

// Seal encrypts plaintext using AES-GCM and returns a versioned ciphertext.
// keyMaterial should be a stable, high-entropy application secret; changing it
// makes existing ciphertext unreadable. It returns errEmptyKey for an empty key
// and wraps errors from cipher or nonce generation.
func Seal(keyMaterial string, plaintext []byte) ([]byte, error) {
	if keyMaterial == "" {
		return nil, errEmptyKey
	}
	key := deriveKey(keyMaterial)
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, fmt.Errorf("create secret cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create secret authenticator: %w", err)
	}
	result := make([]byte, 1+aead.NonceSize(), 1+aead.NonceSize()+len(plaintext)+aead.Overhead())
	result[0] = 1
	if _, err := io.ReadFull(rand.Reader, result[1:1+aead.NonceSize()]); err != nil {
		return nil, fmt.Errorf("generate secret nonce: %w", err)
	}
	return aead.Seal(result, result[1:1+aead.NonceSize()], plaintext, []byte("mwx-isp-secret-v1")), nil
}

// Open authenticates and decrypts a value produced by Seal. It rejects an empty
// key, unsupported versions, truncated values, and ciphertext modified without
// the matching key.
func Open(keyMaterial string, ciphertext []byte) ([]byte, error) {
	if keyMaterial == "" {
		return nil, errEmptyKey
	}
	if len(ciphertext) == 0 || ciphertext[0] != 1 {
		return nil, errors.New("unsupported encrypted secret version")
	}
	key := deriveKey(keyMaterial)
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, fmt.Errorf("create secret cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create secret authenticator: %w", err)
	}
	if len(ciphertext) < 1+aead.NonceSize()+aead.Overhead() {
		return nil, errors.New("encrypted secret is truncated")
	}
	nonce := ciphertext[1 : 1+aead.NonceSize()]
	plaintext, err := aead.Open(nil, nonce, ciphertext[1+aead.NonceSize():], []byte("mwx-isp-secret-v1"))
	if err != nil {
		return nil, fmt.Errorf("authenticate encrypted secret: %w", err)
	}
	return plaintext, nil
}

func deriveKey(material string) [32]byte {
	return sha256.Sum256([]byte("mwx-isp-secret-store-v1\x00" + material))
}
