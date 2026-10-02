package securestore_test

import (
	"fmt"

	"github.com/talkincode/toughradius/v9/internal/securestore"
)

func ExampleSeal() {
	ciphertext, err := securestore.Seal("stable-application-secret", []byte("snmp-community"))
	if err != nil {
		fmt.Println(err)
		return
	}
	plaintext, err := securestore.Open("stable-application-secret", ciphertext)
	if err != nil {
		fmt.Println(err)
		return
	}
	fmt.Println(string(plaintext))
	// Output: snmp-community
}
