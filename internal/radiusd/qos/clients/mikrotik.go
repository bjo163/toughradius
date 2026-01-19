package clients

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"

	"github.com/go-routeros/routeros/v3"
	"github.com/go-routeros/routeros/v3/proto"
	"go.uber.org/zap"
)

// MikrotikClient implements QoSClient for Mikrotik RouterOS devices
type MikrotikClient struct {
	client *routeros.Client
	host   string
}

// NewMikrotikClient creates a new Mikrotik RouterOS API client
// Parameters:
//   - host: RouterOS device IP address or hostname
//   - username: API username
//   - password: API password
//   - port: API port (default 8728 for unencrypted, 8729 for encrypted)
//
// Returns:
//   - *MikrotikClient: Initialized client ready for use
//   - error: Connection or authentication error
func NewMikrotikClient(host, username, password string, port int) (*MikrotikClient, error) {
	if port <= 0 {
		port = 8728 // Default RouterOS API port
	}

	addr := net.JoinHostPort(host, fmt.Sprintf("%d", port))

	client, err := routeros.Dial(addr, username, password)
	if err != nil {
		zap.L().Error("failed to connect to Mikrotik",
			zap.String("host", host),
			zap.Int("port", port),
			zap.Error(err),
		)
		return nil, fmt.Errorf("mikrotik connection failed: %w", err)
	}

	zap.L().Info("connected to Mikrotik RouterOS",
		zap.String("host", host),
		zap.Int("port", port),
	)

	return &MikrotikClient{
		client: client,
		host:   host,
	}, nil
}

// CreateQueue creates a simple queue on Mikrotik RouterOS
// Uses /queue/simple command with max-limit parameter
// Format of max-limit: "uploadKbps/downloadKbps" (e.g., "1024k/2048k")
func (c *MikrotikClient) CreateQueue(ctx context.Context, config *QoSConfig) (string, error) {
	if config == nil {
		return "", fmt.Errorf("queue config is nil")
	}

	if config.Name == "" {
		return "", fmt.Errorf("queue name is required")
	}

	if config.UpRate < 0 || config.DownRate < 0 {
		return "", fmt.Errorf("queue rates cannot be negative")
	}

	// Format: "1024k/2048k" for 1Mbps upload / 2Mbps download
	maxLimit := fmt.Sprintf("%dk/%dk", config.UpRate, config.DownRate)

	// Build command arguments
	args := []string{
		"/queue/simple/add",
		fmt.Sprintf("=name=%s", config.Name),
		fmt.Sprintf("=max-limit=%s", maxLimit),
	}

	// Add target if specified in extra config
	if config.Extra != nil {
		if target, ok := config.Extra["target"].(string); ok && target != "" {
			args = append(args, fmt.Sprintf("=target=%s", target))
		}
	}

	// Execute /queue/simple/add command
	reply, err := c.client.RunArgs(args)
	if err != nil {
		return "", fmt.Errorf("create queue error: %w", err)
	}

	// Extract queue ID from done sentence
	queueID := ""
	if reply.Done != nil {
		queueID = reply.Done.Map[".id"]
	}

	if queueID == "" {
		return "", fmt.Errorf("no queue ID returned from Mikrotik")
	}

	zap.L().Info("queue created successfully",
		zap.String("queue_id", queueID),
		zap.String("queue_name", config.Name),
		zap.Int("up_rate", config.UpRate),
		zap.Int("down_rate", config.DownRate),
	)

	return queueID, nil
}

// DeleteQueue removes a queue from Mikrotik RouterOS
func (c *MikrotikClient) DeleteQueue(ctx context.Context, remoteID string) error {
	if remoteID == "" {
		return fmt.Errorf("queue ID is required")
	}

	args := []string{
		"/queue/simple/remove",
		fmt.Sprintf("=.id=%s", remoteID),
	}

	_, err := c.client.RunArgs(args)
	if err != nil {
		return fmt.Errorf("delete queue error: %w", err)
	}

	zap.L().Info("queue deleted successfully",
		zap.String("queue_id", remoteID),
	)

	return nil
}

// UpdateQueue updates an existing queue configuration on Mikrotik
func (c *MikrotikClient) UpdateQueue(ctx context.Context, remoteID string, config *QoSConfig) error {
	if remoteID == "" {
		return fmt.Errorf("queue ID is required")
	}

	if config == nil {
		return fmt.Errorf("queue config is nil")
	}

	maxLimit := fmt.Sprintf("%dk/%dk", config.UpRate, config.DownRate)

	args := []string{
		"/queue/simple/set",
		fmt.Sprintf("=.id=%s", remoteID),
		fmt.Sprintf("=max-limit=%s", maxLimit),
	}

	_, err := c.client.RunArgs(args)
	if err != nil {
		return fmt.Errorf("update queue error: %w", err)
	}

	zap.L().Info("queue updated successfully",
		zap.String("queue_id", remoteID),
	)

	return nil
}

// GetQueue retrieves a queue configuration from Mikrotik
func (c *MikrotikClient) GetQueue(ctx context.Context, remoteID string) (*QoSConfig, error) {
	if remoteID == "" {
		return nil, fmt.Errorf("queue ID is required")
	}

	args := []string{
		"/queue/simple/print",
		fmt.Sprintf("?.id=%s", remoteID),
	}

	reply, err := c.client.RunArgs(args)
	if err != nil {
		return nil, fmt.Errorf("get queue error: %w", err)
	}

	if len(reply.Re) == 0 {
		return nil, fmt.Errorf("queue not found: %s", remoteID)
	}

	config := parseQueueResponse(reply.Re[0])
	return config, nil
}

// Close closes the connection to Mikrotik RouterOS
func (c *MikrotikClient) Close() error {
	if c.client != nil {
		err := c.client.Close()
		zap.L().Info("Mikrotik connection closed", zap.String("host", c.host))
		return err
	}
	return nil
}

// Helper functions

func parseQueueResponse(sentence *proto.Sentence) *QoSConfig {
	config := &QoSConfig{Extra: make(map[string]interface{})}

	// Parse from Map
	if sentence.Map != nil {
		if name, ok := sentence.Map["name"]; ok {
			config.Name = name
		}

		// Parse max-limit: "1024k/2048k" format
		if maxLimit, ok := sentence.Map["max-limit"]; ok {
			parts := strings.Split(maxLimit, "/")
			if len(parts) == 2 {
				// Remove 'k' suffix and parse
				upStr := strings.TrimSuffix(parts[0], "k")
				downStr := strings.TrimSuffix(parts[1], "k")

				if up, err := strconv.Atoi(upStr); err == nil {
					config.UpRate = up
				}
				if down, err := strconv.Atoi(downStr); err == nil {
					config.DownRate = down
				}
			}
		}

		if target, ok := sentence.Map["target"]; ok {
			config.Extra["target"] = target
		}
	}

	return config
}
