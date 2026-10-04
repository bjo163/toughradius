// Package main starts the developer-operated MWX-Control peer and inventory service.
package main

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/hashicorp/memberlist"
)

const metadataLimit = 512

type config struct {
	Mode          string
	NodeID        string
	NodeName      string
	Version       string
	GossipAddr    string
	GossipPort    int
	AdvertiseAddr string
	AdvertisePort int
	GossipKey     []byte
	Peers         []string
	AllowedCIDRs  []net.IPNet
	HTTPAddr      string
	AdminToken    string
	HealthURL     string
}

type nodeMetadata struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Version        string `json:"version"`
	Mode           string `json:"mode"`
	AgentHealth    string `json:"agent_health"`
	InstanceHealth string `json:"instance_health"`
	CheckedAt      string `json:"checked_at,omitempty"`
}

type metadataDelegate struct {
	mu   sync.RWMutex
	data nodeMetadata
}

func (d *metadataDelegate) set(data nodeMetadata) {
	d.mu.Lock()
	d.data = data
	d.mu.Unlock()
}

func (d *metadataDelegate) snapshot() nodeMetadata {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.data
}

func (d *metadataDelegate) NodeMeta(limit int) []byte {
	data, err := json.Marshal(d.snapshot())
	if err != nil || len(data) > limit || len(data) > metadataLimit {
		return nil
	}
	return data
}

func (*metadataDelegate) NotifyMsg([]byte) {}

func (*metadataDelegate) GetBroadcasts(int, int) [][]byte { return nil }

func (d *metadataDelegate) LocalState(bool) []byte {
	data, _ := json.Marshal(d.snapshot())
	return data
}

func (*metadataDelegate) MergeRemoteState([]byte, bool) {}

type inventory struct {
	GeneratedAt time.Time       `json:"generated_at"`
	ClusterSize int             `json:"cluster_size"`
	Nodes       []nodeInventory `json:"nodes"`
}

type nodeInventory struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Version        string `json:"mwx_isp_version"`
	Mode           string `json:"mode"`
	AgentHealth    string `json:"agent_health"`
	InstanceHealth string `json:"instance_health"`
	CheckedAt      string `json:"checked_at,omitempty"`
	Membership     string `json:"membership"`
	Address        string `json:"address"`
}

func main() {
	if err := run(); err != nil {
		slog.Error("MWX-Control stopped", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}

	delegate := &metadataDelegate{}
	delegate.set(nodeMetadata{
		ID: cfg.NodeID, Name: cfg.NodeName, Version: cfg.Version,
		Mode: cfg.Mode, AgentHealth: "healthy", InstanceHealth: "unknown",
	})

	memberConfig := memberlist.DefaultWANConfig()
	memberConfig.Name = cfg.NodeID
	memberConfig.BindAddr = cfg.GossipAddr
	memberConfig.BindPort = cfg.GossipPort
	memberConfig.AdvertiseAddr = cfg.AdvertiseAddr
	memberConfig.AdvertisePort = cfg.AdvertisePort
	memberConfig.SecretKey = cfg.GossipKey
	memberConfig.GossipVerifyIncoming = true
	memberConfig.GossipVerifyOutgoing = true
	memberConfig.EnableCompression = true
	memberConfig.Delegate = delegate
	memberConfig.LogOutput = io.Discard
	memberConfig.Logger = nil
	memberConfig.CIDRsAllowed = cfg.AllowedCIDRs

	peers, err := memberlist.Create(memberConfig)
	if err != nil {
		return fmt.Errorf("start encrypted gossip listener: %w", err)
	}
	defer peers.Shutdown()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if len(cfg.Peers) > 0 {
		go joinPeers(ctx, peers, cfg.Peers)
	}
	go refreshHealth(ctx, cfg, delegate, peers)

	if cfg.Mode == "agent" {
		slog.Info("MWX-Control agent is running", "node", cfg.NodeID, "gossip_port", cfg.GossipPort)
		<-ctx.Done()
		return nil
	}
	return serveOwnerAPI(ctx, cfg, peers)
}

func loadConfig() (config, error) {
	var cfg config
	cfg.Mode = env("MWX_CONTROL_MODE", "agent")
	if cfg.Mode != "control" && cfg.Mode != "agent" {
		return cfg, errors.New("MWX_CONTROL_MODE must be control or agent")
	}
	cfg.NodeID = strings.TrimSpace(os.Getenv("MWX_CONTROL_NODE_ID"))
	if cfg.NodeID == "" || len(cfg.NodeID) > 64 || strings.ContainsAny(cfg.NodeID, " \t\r\n") {
		return cfg, errors.New("MWX_CONTROL_NODE_ID is required and must be at most 64 characters without whitespace")
	}
	for _, char := range cfg.NodeID {
		if !((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '-' || char == '_' || char == '.') {
			return cfg, errors.New("MWX_CONTROL_NODE_ID may contain only letters, numbers, dot, underscore, and hyphen")
		}
	}
	cfg.NodeName = env("MWX_CONTROL_NODE_NAME", cfg.NodeID)
	if len(cfg.NodeName) > 64 || strings.ContainsAny(cfg.NodeName, "\r\n") {
		return cfg, errors.New("MWX_CONTROL_NODE_NAME must be at most 64 characters")
	}
	cfg.Version = env("MWX_CONTROL_MWX_ISP_VERSION", "unknown")
	if len(cfg.Version) > 32 || strings.ContainsAny(cfg.Version, "\r\n") {
		return cfg, errors.New("MWX_CONTROL_MWX_ISP_VERSION must be at most 32 characters")
	}
	cfg.GossipAddr = env("MWX_CONTROL_GOSSIP_ADDR", "0.0.0.0")
	cfg.GossipPort, _ = strconv.Atoi(env("MWX_CONTROL_GOSSIP_PORT", "7946"))
	if cfg.GossipPort < 1 || cfg.GossipPort > 65535 {
		return cfg, errors.New("MWX_CONTROL_GOSSIP_PORT must be between 1 and 65535")
	}
	cfg.AdvertiseAddr = strings.TrimSpace(os.Getenv("MWX_CONTROL_ADVERTISE_ADDR"))
	cfg.AdvertisePort, _ = strconv.Atoi(env("MWX_CONTROL_ADVERTISE_PORT", strconv.Itoa(cfg.GossipPort)))
	if cfg.AdvertisePort < 1 || cfg.AdvertisePort > 65535 {
		return cfg, errors.New("MWX_CONTROL_ADVERTISE_PORT must be between 1 and 65535")
	}
	keyText := strings.TrimSpace(os.Getenv("MWX_CONTROL_GOSSIP_KEY"))
	key, err := base64.StdEncoding.Strict().DecodeString(keyText)
	if err != nil || len(key) != 32 {
		return cfg, errors.New("MWX_CONTROL_GOSSIP_KEY must be a base64-encoded 32-byte key; generate one with openssl rand -base64 32")
	}
	cfg.GossipKey = key
	cfg.Peers = splitList(os.Getenv("MWX_CONTROL_PEERS"))
	cfg.AllowedCIDRs, err = parseCIDRs(splitList(os.Getenv("MWX_CONTROL_ALLOWED_CIDRS")))
	if err != nil {
		return cfg, err
	}
	cfg.HTTPAddr = env("MWX_CONTROL_HTTP_ADDR", "127.0.0.1:8080")
	cfg.AdminToken = strings.TrimSpace(os.Getenv("MWX_CONTROL_ADMIN_TOKEN"))
	cfg.HealthURL = strings.TrimSpace(os.Getenv("MWX_CONTROL_HEALTH_URL"))
	if cfg.HealthURL != "" {
		parsed, parseErr := url.ParseRequestURI(cfg.HealthURL)
		if parseErr != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return cfg, errors.New("MWX_CONTROL_HEALTH_URL must be an http(s) URL")
		}
	}
	if cfg.Mode == "agent" && len(cfg.Peers) == 0 {
		return cfg, errors.New("MWX_CONTROL_PEERS must contain at least one existing cluster peer in agent mode")
	}
	if cfg.Mode == "control" && len(cfg.AdminToken) < 32 {
		return cfg, errors.New("MWX_CONTROL_ADMIN_TOKEN must contain at least 32 characters in control mode")
	}
	return cfg, nil
}

func serveOwnerAPI(ctx context.Context, cfg config, peers *memberlist.Memberlist) error {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "mwx-control"})
	})
	mux.Handle("GET /api/v1/nodes", ownerOnly(cfg.AdminToken, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		members := peers.Members()
		result := inventory{GeneratedAt: time.Now().UTC(), ClusterSize: len(members), Nodes: make([]nodeInventory, 0, len(members))}
		for _, member := range members {
			item := nodeInventory{ID: member.Name, Membership: membershipName(member.State), Address: net.JoinHostPort(member.Addr.String(), strconv.Itoa(int(member.Port)))}
			var metadata nodeMetadata
			if json.Unmarshal(member.Meta, &metadata) == nil {
				item.ID = metadata.ID
				item.Name = metadata.Name
				item.Version = metadata.Version
				item.Mode = metadata.Mode
				item.AgentHealth = metadata.AgentHealth
				item.InstanceHealth = metadata.InstanceHealth
				item.CheckedAt = metadata.CheckedAt
			}
			result.Nodes = append(result.Nodes, item)
		}
		writeJSON(w, http.StatusOK, result)
	})))
	server := &http.Server{
		Addr: cfg.HTTPAddr, Handler: mux, ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second,
	}
	listener, err := net.Listen("tcp", cfg.HTTPAddr)
	if err != nil {
		return fmt.Errorf("listen on owner API %s: %w", cfg.HTTPAddr, err)
	}
	slog.Info("MWX-Control owner API is running", "address", cfg.HTTPAddr, "gossip_port", cfg.GossipPort)
	serveErr := make(chan error, 1)
	go func() { serveErr <- server.Serve(listener) }()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	case err := <-serveErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}

func ownerOnly(token string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		const prefix = "Bearer "
		provided := strings.TrimPrefix(r.Header.Get("Authorization"), prefix)
		if !strings.HasPrefix(r.Header.Get("Authorization"), prefix) || subtle.ConstantTimeCompare([]byte(provided), []byte(token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func joinPeers(ctx context.Context, peers *memberlist.Memberlist, addresses []string) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		count, err := peers.Join(addresses)
		if err == nil {
			slog.Info("joined MWX-Control gossip cluster", "peer_count", count)
			return
		}
		slog.Warn("could not join gossip cluster yet; will retry", "error", err)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func refreshHealth(ctx context.Context, cfg config, delegate *metadataDelegate, peers *memberlist.Memberlist) {
	client := &http.Client{Timeout: 3 * time.Second}
	update := func() {
		metadata := delegate.snapshot()
		metadata.AgentHealth = "healthy"
		metadata.InstanceHealth = "unknown"
		metadata.CheckedAt = time.Now().UTC().Format(time.RFC3339)
		if cfg.HealthURL != "" {
			response, err := client.Get(cfg.HealthURL) // #nosec G107 -- URL is an explicit operator-controlled setting.
			if err != nil {
				metadata.InstanceHealth = "unhealthy"
			} else {
				_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
				_ = response.Body.Close()
				if response.StatusCode >= 200 && response.StatusCode < 400 {
					metadata.InstanceHealth = "healthy"
				} else {
					metadata.InstanceHealth = "unhealthy"
				}
			}
		}
		delegate.set(metadata)
		_ = peers.UpdateNode(2 * time.Second)
	}
	update()
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			update()
		}
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("write JSON response: %v", err)
	}
}

func membershipName(state memberlist.NodeStateType) string {
	switch state {
	case memberlist.StateAlive:
		return "alive"
	case memberlist.StateSuspect:
		return "suspect"
	case memberlist.StateDead:
		return "dead"
	case memberlist.StateLeft:
		return "left"
	default:
		return "unknown"
	}
}

func parseCIDRs(values []string) ([]net.IPNet, error) {
	allowed := make([]net.IPNet, 0, len(values))
	for _, value := range values {
		_, network, err := net.ParseCIDR(value)
		if err != nil {
			return nil, fmt.Errorf("invalid CIDR in MWX_CONTROL_ALLOWED_CIDRS: %q", value)
		}
		allowed = append(allowed, *network)
	}
	return allowed, nil
}

func splitList(value string) []string {
	parts := strings.Split(value, ",")
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		if item := strings.TrimSpace(part); item != "" {
			items = append(items, item)
		}
	}
	return items
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
