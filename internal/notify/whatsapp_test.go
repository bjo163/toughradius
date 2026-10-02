package notify

import (
	"fmt"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestWhatsAppManagerInitializesPersistentStore(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	manager, err := NewWhatsAppManager(db)
	require.NoError(t, err)
	require.Equal(t, "not_linked", manager.Status().State)
	require.NoError(t, manager.Close())
}

func ExampleNormalizeRecipient() {
	recipient, err := NormalizeRecipient("+62 (812) 3456-7890")
	if err != nil {
		fmt.Println(err)
		return
	}
	fmt.Println(recipient)
	// Output: 6281234567890
}
