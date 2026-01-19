package clients

import (
	"context"
	"fmt"
	"strings"

	"github.com/go-routeros/routeros"
	"github.com/go-routeros/routeros/proto"
	"go.uber.org/zap"
)

// MikrotikClient implements QoSClient for Mikrotik RouterOS devices
type MikrotikClient struct {
	conn *routeros.Conn
	host string
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

	addr := fmt.Sprintf("%s:%d", host, port)
	conn, err := routeros.Dial(addr, username, password)
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
		conn: conn,
		host: host,
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

	// Build command parameters
	params := []string{
		fmt.Sprintf("=name=%s", config.Name),
		fmt.Sprintf("=max-limit=%s", maxLimit),
	}

	// Add target if specified in extra config
	if config.Extra != nil {
		if target, ok := config.Extra["target"].(string); ok && target != "" {
			params = append(params, fmt.Sprintf("=target=%s", target))
		}
	}

	// Execute /queue/simple/add command
	cmd := &routeros.Command{
		Path:       "/queue/simple/add",
		Arguments:  params,
	}

	reply := make(chan *proto.Sentence)
	go c.conn.Send(cmd, reply)

	var queueID string
	for sentence := range reply {
		if sentence.Tag == "done" {
			// Extract queue ID from response
			for _, word := range sentence.Words {
				if strings.HasPrefix(word, "=.id=") {
					queueID = strings.TrimPrefix(word, "=.id=")
					break
				}
			}
		}
		if sentence.Tag == "trap" {
			errMsg := getErrorMessage(sentence)
			return "", fmt.Errorf("create queue error: %s", errMsg)
		}
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

	cmd := &routeros.Command{
		Path:       "/queue/simple/remove",
		Arguments:  []string{fmt.Sprintf("=.id=%s", remoteID)},
	}

	reply := make(chan *proto.Sentence)
	go c.conn.Send(cmd, reply)

	for sentence := range reply {
		if sentence.Tag == "trap" {
			errMsg := getErrorMessage(sentence)
			return fmt.Errorf("delete queue error: %s", errMsg)
		}
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

	params := []string{
		fmt.Sprintf("=.id=%s", remoteID),
		fmt.Sprintf("=max-limit=%s", maxLimit),
	}

	cmd := &routeros.Command{
		Path:       "/queue/simple/set",
		Arguments:  params,
	}

	reply := make(chan *proto.Sentence)
	go c.conn.Send(cmd, reply)

	for sentence := range reply {
		if sentence.Tag == "trap" {
			errMsg := getErrorMessage(sentence)
			return fmt.Errorf("update queue error: %s", errMsg)
		}
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

	cmd := &routeros.Command{
		Path:       "/queue/simple/print",
		Arguments:  []string{fmt.Sprintf("?=.id=%s", remoteID)},
	}

	reply := make(chan *proto.Sentence)
	go c.conn.Send(cmd, reply)

	var config *QoSConfig
	for sentence := range reply {
		if sentence.Tag == "done" {
			break
		}
		if sentence.Tag == "trap" {
			errMsg := getErrorMessage(sentence)
			return nil, fmt.Errorf("get queue error: %s", errMsg)
		}

		// Parse response
		config = parseQueueResponse(sentence)
	}

	if config == nil {
		return nil, fmt.Errorf("queue not found: %s", remoteID)
	}

	return config, nil
}

// Close closes the connection to Mikrotik RouterOS
func (c *MikrotikClient) Close() error {
	if c.conn != nil {
		c.conn.Close()
		zap.L().Info("Mikrotik connection closed", zap.String("host", c.host))
	}
	return nil
}

// Helper functions

func getErrorMessage(sentence *proto.Sentence) string {
	for _, word := range sentence.Words {
		if strings.HasPrefix(word, "=message=") {
			return strings.TrimPrefix(word, "=message=")
		}
	}
	return "unknown error"
}

func parseQueueResponse(sentence *proto.Sentence) *QoSConfig {
	config := &QoSConfig{Extra: make(map[string]interface{})}

	for _, word := range sentence.Words {
		if strings.HasPrefix(word, "=name=") {
			config.Name = strings.TrimPrefix(word, "=name=")
		} else if strings.HasPrefix(word, "=max-limit=") {
			// Parse "1024k/2048k" format
			maxLimit := strings.TrimPrefix(word, "=max-limit=")
			parts := strings.Split(maxLimit, "/")
			if len(parts) == 2 {
				// Remove 'k' suffix and parse
				upStr := strings.TrimSuffix(parts[0], "k")
				downStr := strings.TrimSuffix(parts[1], "k")
				fmt.Sscanf(upStr, "%d", &config.UpRate)
				fmt.Sscanf(downStr, "%d", &config.DownRate)
			}
		} else if strings.HasPrefix(word, "=target=") {
			config.Extra["target"] = strings.TrimPrefix(word, "=target=")
		}
	}

	return config
}
