package securestore

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSealOpenRoundTrip(t *testing.T) {
	sealed, err := Seal("a-long-random-app-secret", []byte("snmp-auth-secret"))
	require.NoError(t, err)
	require.NotContains(t, string(sealed), "snmp-auth-secret")

	opened, err := Open("a-long-random-app-secret", sealed)
	require.NoError(t, err)
	require.Equal(t, "snmp-auth-secret", string(opened))
}

func TestOpenRejectsWrongKeyAndTampering(t *testing.T) {
	sealed, err := Seal("primary-key", []byte("private"))
	require.NoError(t, err)
	_, err = Open("different-key", sealed)
	require.Error(t, err)

	sealed[len(sealed)-1] ^= 0xff
	_, err = Open("primary-key", sealed)
	require.Error(t, err)
}

func TestSealRejectsEmptyKey(t *testing.T) {
	_, err := Seal("", []byte("secret"))
	require.Error(t, err)
}
