/*
 * Copyright (c) 2024-2025 TalkingCode
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

package validutil

import "testing"

func TestIsE164PhoneNumber(t *testing.T) {
	tests := []struct {
		name  string
		value interface{}
		valid bool
	}{
		{name: "Indonesian number", value: "+628123456789", valid: true},
		{name: "maximum E.164 length", value: "+123456789012345", valid: true},
		{name: "missing plus sign", value: "628123456789"},
		{name: "zero country code", value: "+0123456789"},
		{name: "too short", value: "+1234567"},
		{name: "too long", value: "+1234567890123456"},
		{name: "contains formatting", value: "+62 812 3456 789"},
		{name: "unsupported value type", value: 628123456789},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := IsE164PhoneNumber(test.value); got != test.valid {
				t.Errorf("IsE164PhoneNumber(%v) = %t, want %t", test.value, got, test.valid)
			}
		})
	}
}
