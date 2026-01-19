package clients

import "context"

// QoSConfig represents generic QoS configuration for any vendor
type QoSConfig struct {
	Name     string // Queue/Policy name
	UpRate   int    // Upload rate in Kbps
	DownRate int    // Download rate in Kbps
	Extra    map[string]interface{} // Vendor-specific extra fields
}

// QoSClient is the interface for vendor-specific QoS clients
// Supports multiple vendors: Mikrotik, Huawei, H3C, etc.
type QoSClient interface {
	// CreateQueue creates a queue/policy on the NAS device
	// Returns the remote queue ID assigned by the device
	CreateQueue(ctx context.Context, config *QoSConfig) (remoteID string, err error)

	// DeleteQueue removes a queue/policy from the NAS device
	DeleteQueue(ctx context.Context, remoteID string) error

	// UpdateQueue updates an existing queue/policy configuration
	UpdateQueue(ctx context.Context, remoteID string, config *QoSConfig) error

	// GetQueue retrieves queue/policy configuration from the device
	GetQueue(ctx context.Context, remoteID string) (*QoSConfig, error)

	// Close closes the connection to the NAS device
	Close() error
}
