package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
	"golang.org/x/term"
)

type ownerCLIConfig struct {
	ControlHost string
	SSHUser     string
	Identity    string
	KnownHosts  string
	OwnerToken  string
	SSHPort     int
	Signer      ssh.Signer
}

type controlNodesResponse struct {
	Nodes []nodeInventory `json:"nodes"`
}

type dockerContainer struct {
	ID     string `json:"ID"`
	Names  string `json:"Names"`
	Image  string `json:"Image"`
	Status string `json:"Status"`
	Ports  string `json:"Ports"`
}

type composeProject struct {
	Name        string `json:"Name"`
	Status      string `json:"Status"`
	ConfigFiles string `json:"ConfigFiles"`
}

type ownerAuditRecord struct {
	At        time.Time `json:"at"`
	Operation string    `json:"operation"`
	NodeID    string    `json:"node_id"`
	Target    string    `json:"target,omitempty"`
	Phase     string    `json:"phase"`
	Outcome   string    `json:"outcome"`
}

type cappedOutput struct {
	buffer    bytes.Buffer
	writer    io.Writer
	remaining int
	truncated bool
}

func (o *cappedOutput) Write(data []byte) (int, error) {
	originalLength := len(data)
	if len(data) > o.remaining {
		data = data[:o.remaining]
		o.truncated = true
	}
	if len(data) > 0 {
		_, _ = o.buffer.Write(data)
		if o.writer != nil {
			if _, err := o.writer.Write(data); err != nil {
				return 0, err
			}
		}
		o.remaining -= len(data)
	}
	return originalLength, nil
}

var safeDockerTarget = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$`)

func runOwnerCLI(args []string) error {
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		printOwnerCLIHelp(os.Stdout)
		return nil
	}
	if args[0] == "version" {
		fmt.Printf("MWX-Control %s (%s, built %s)\n", version, gitCommit, buildTime)
		return nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("find user home directory: %w", err)
	}
	defaultKey := filepath.Join(home, ".ssh", "id_ed25519")
	defaultKnownHosts := filepath.Join(home, ".ssh", "known_hosts")
	defaultSSHUser := "root"
	if configured := strings.TrimSpace(os.Getenv("MWX_CONTROL_SSH_USER")); configured != "" {
		defaultSSHUser = configured
	}

	flags := flag.NewFlagSet("mwx-control "+args[0], flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	cfg := ownerCLIConfig{
		ControlHost: strings.TrimSpace(os.Getenv("MWX_CONTROL_SSH_HOST")),
		SSHUser:     defaultSSHUser,
		Identity:    env("MWX_CONTROL_SSH_KEY", defaultKey),
		KnownHosts:  env("MWX_CONTROL_KNOWN_HOSTS", defaultKnownHosts),
		OwnerToken:  strings.TrimSpace(os.Getenv("MWX_CONTROL_ADMIN_TOKEN")),
		SSHPort:     22,
	}
	flags.StringVar(&cfg.ControlHost, "control", cfg.ControlHost, "SSH host of the MWX-Control node (host or host:port)")
	flags.StringVar(&cfg.SSHUser, "user", cfg.SSHUser, "SSH account on the control node and VPS nodes")
	flags.StringVar(&cfg.Identity, "identity", cfg.Identity, "path to the owner's SSH private key")
	flags.StringVar(&cfg.KnownHosts, "known-hosts", cfg.KnownHosts, "path to the verified SSH known_hosts file")
	flags.IntVar(&cfg.SSHPort, "ssh-port", cfg.SSHPort, "SSH port for VPS nodes; control host may include its own port")
	if err := flags.Parse(args[1:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			printOwnerCLIHelp(os.Stdout)
			return nil
		}
		return err
	}
	commandArgs := flags.Args()
	if cfg.SSHUser == "" || strings.ContainsAny(cfg.SSHUser, " \t\r\n") {
		return errors.New("set a valid SSH account with --user or MWX_CONTROL_SSH_USER")
	}
	if cfg.Identity == "" || cfg.KnownHosts == "" {
		return errors.New("SSH identity and known_hosts are required")
	}
	if cfg.SSHPort < 1 || cfg.SSHPort > 65535 {
		return errors.New("--ssh-port must be between 1 and 65535")
	}
	cfg.Signer, err = loadOwnerSigner(cfg.Identity)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	cmd := args[0]
	if cmd == "nodes" {
		if cfg.ControlHost == "" {
			return errors.New("set --control or MWX_CONTROL_SSH_HOST")
		}
		if cfg.OwnerToken == "" {
			return errors.New("set MWX_CONTROL_ADMIN_TOKEN; the token is read only from the environment")
		}
		return listControlNodes(ctx, cfg)
	}
	if cmd != "services" && cmd != "projects" && cmd != "docker" && cmd != "update" && cmd != "shell" {
		printOwnerCLIHelp(os.Stdout)
		return fmt.Errorf("unknown command %q", cmd)
	}
	if len(commandArgs) == 0 {
		return fmt.Errorf("%s requires a node ID; run `mwx-control nodes` first", cmd)
	}
	if cfg.ControlHost == "" {
		return errors.New("set --control or MWX_CONTROL_SSH_HOST")
	}
	if cfg.OwnerToken == "" {
		return errors.New("set MWX_CONTROL_ADMIN_TOKEN; the token is read only from the environment")
	}
	nodeArg := 0
	if cmd == "docker" {
		if len(commandArgs) != 3 {
			return errors.New("usage: mwx-control docker <start|stop|restart> <node-id> <container-name>")
		}
		nodeArg = 1
	}

	nodes, err := getControlNodes(ctx, cfg)
	if err != nil {
		return err
	}
	node, err := findNode(nodes, commandArgs[nodeArg])
	if err != nil {
		return err
	}
	addr, err := nodeSSHAddress(node, cfg.SSHPort)
	if err != nil {
		return err
	}
	client, err := dialOwnerSSH(ctx, cfg, addr)
	if err != nil {
		return err
	}
	defer client.Close()

	switch cmd {
	case "services":
		if len(commandArgs) != 1 {
			return errors.New("usage: mwx-control services <node-id>")
		}
		return runAudited("docker-discovery", node.ID, "containers", func() error { return showDockerContainers(client) })
	case "projects":
		if len(commandArgs) != 1 {
			return errors.New("usage: mwx-control projects <node-id>")
		}
		return runAudited("docker-discovery", node.ID, "compose-projects", func() error { return showComposeProjects(client) })
	case "docker":
		return runAudited("docker-"+commandArgs[0], node.ID, commandArgs[2], func() error { return runDockerAction(client, commandArgs) })
	case "update":
		if len(commandArgs) != 1 {
			return errors.New("usage: mwx-control update <node-id>")
		}
		return runAudited("mwx-isp-update", node.ID, "/opt/mwx-isp", func() error {
			fmt.Fprintf(os.Stderr, "This runs the existing rollback-aware MWX-ISP VPS updater on %s. Continue only if its tracked Compose installation is the intended target.\n", node.ID)
			if err := confirmOwnerAction("UPDATE " + node.ID); err != nil {
				return err
			}
			return runRemoteCommand(client, "if [ \"$(id -u)\" -eq 0 ]; then /opt/mwx-isp/scripts/vps-update.sh; else sudo -n /opt/mwx-isp/scripts/vps-update.sh; fi")
		})
	case "shell":
		if len(commandArgs) != 1 {
			return errors.New("usage: mwx-control shell <node-id>")
		}
		return runAudited("interactive-shell", node.ID, addr, func() error {
			fmt.Fprintf(os.Stderr, "Opening an interactive SSH shell on %s (%s). The VPS SSH account controls its privileges.\n", node.ID, addr)
			if err := confirmOwnerAction("SHELL " + node.ID); err != nil {
				return err
			}
			return runRemoteShell(client)
		})
	default:
		return errors.New("unsupported operation")
	}
}

func printOwnerCLIHelp(w io.Writer) {
	fmt.Fprintln(w, `MWX-Control owner CLI

Commands:
  version                       Show build version
  nodes                         Show the peer inventory from the control node
  services <node-id>            Discover running/stopped Docker containers
  projects <node-id>            Discover Docker Compose projects
  docker restart <node-id> <container>
  docker start   <node-id> <container>
  docker stop    <node-id> <container>
  update <node-id>              Run the rollback-aware MWX-ISP VPS updater
  shell <node-id>               Open an interactive SSH shell

Connection settings:
  --control <host[:port]>       Control VPS SSH address
  --user <account>              SSH account (default: root)
  --identity <path>             SSH private key (default: ~/.ssh/id_ed25519)
  --known-hosts <path>          Verified SSH host keys (default: ~/.ssh/known_hosts)
  MWX_CONTROL_ADMIN_TOKEN       Owner API token, read from the environment

The SSH known_hosts file must already contain verified host keys. The CLI never
trusts or learns an unknown host key automatically. Docker operations require
an SSH account with Docker privileges.`)
}

func listControlNodes(ctx context.Context, cfg ownerCLIConfig) error {
	nodes, err := getControlNodes(ctx, cfg)
	if err != nil {
		return err
	}
	fmt.Printf("%-28s %-24s %-18s %-12s %-12s %s\n", "NODE ID", "NAME", "VERSION", "MEMBERSHIP", "INSTANCE", "SSH TARGET")
	for _, node := range nodes {
		addr, addrErr := nodeSSHAddress(node, cfg.SSHPort)
		target := "unavailable"
		if addrErr == nil {
			target = cfg.SSHUser + "@" + addr
		}
		fmt.Printf("%-28s %-24s %-18s %-12s %-12s %s\n", truncate(node.ID, 28), truncate(node.Name, 24), truncate(node.Version, 18), node.Membership, node.InstanceHealth, target)
	}
	return nil
}

func getControlNodes(ctx context.Context, cfg ownerCLIConfig) ([]nodeInventory, error) {
	client, err := dialOwnerSSH(ctx, cfg, normalizeSSHAddress(cfg.ControlHost, 22))
	if err != nil {
		return nil, fmt.Errorf("connect to MWX-Control host: %w", err)
	}
	defer client.Close()
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return client.Dial("tcp", "127.0.0.1:8080")
	}}
	defer transport.CloseIdleConnections()
	httpClient := &http.Client{Transport: transport, Timeout: 10 * time.Second}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://mwx-control.internal/api/v1/nodes", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+cfg.OwnerToken)
	response, err := httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("query control inventory through the verified SSH tunnel: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("control API returned %s: %s", response.Status, strings.TrimSpace(string(body)))
	}
	var result controlNodesResponse
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode control inventory: %w", err)
	}
	return result.Nodes, nil
}

func findNode(nodes []nodeInventory, id string) (nodeInventory, error) {
	for _, node := range nodes {
		if node.ID == id {
			if node.Membership != "alive" {
				return nodeInventory{}, fmt.Errorf("node %q is %s; remote operations require an alive peer", id, node.Membership)
			}
			return node, nil
		}
	}
	return nodeInventory{}, fmt.Errorf("node %q is not in the control inventory", id)
}

func nodeSSHAddress(node nodeInventory, defaultPort int) (string, error) {
	host, _, err := net.SplitHostPort(node.Address)
	if err != nil || net.ParseIP(host) == nil {
		return "", fmt.Errorf("node %q has no usable advertised IP address; configure its reachable MWX_CONTROL_ADVERTISE_ADDR", node.ID)
	}
	return net.JoinHostPort(host, strconv.Itoa(defaultPort)), nil
}

func normalizeSSHAddress(address string, defaultPort int) string {
	if _, _, err := net.SplitHostPort(address); err == nil {
		return address
	}
	return net.JoinHostPort(strings.Trim(address, "[]"), strconv.Itoa(defaultPort))
}

func dialOwnerSSH(ctx context.Context, cfg ownerCLIConfig, address string) (*ssh.Client, error) {
	callback, err := knownhosts.New(cfg.KnownHosts)
	if err != nil {
		return nil, fmt.Errorf("load verified SSH host keys from %q: %w", cfg.KnownHosts, err)
	}
	config := &ssh.ClientConfig{
		User:            cfg.SSHUser,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(cfg.Signer)},
		HostKeyCallback: callback,
		Timeout:         12 * time.Second,
	}
	address = normalizeSSHAddress(address, cfg.SSHPort)
	dialer := &net.Dialer{Timeout: 12 * time.Second}
	connection, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	_ = connection.SetDeadline(time.Now().Add(config.Timeout))
	clientConn, channels, requests, err := ssh.NewClientConn(connection, address, config)
	if err != nil {
		_ = connection.Close()
		return nil, fmt.Errorf("SSH authentication or host-key verification failed: %w", err)
	}
	_ = connection.SetDeadline(time.Time{})
	return ssh.NewClient(clientConn, channels, requests), nil
}

func loadOwnerSigner(identityPath string) (ssh.Signer, error) {
	keyData, err := os.ReadFile(identityPath)
	if err != nil {
		return nil, fmt.Errorf("read SSH identity %q: %w", identityPath, err)
	}
	if runtime.GOOS != "windows" {
		keyInfo, statErr := os.Stat(identityPath)
		if statErr != nil {
			return nil, fmt.Errorf("inspect SSH identity %q: %w", identityPath, statErr)
		}
		if keyInfo.Mode().Perm()&0o077 != 0 {
			return nil, fmt.Errorf("SSH identity %q is readable by group or others; restrict it to its owner (for example chmod 600)", identityPath)
		}
	}
	signer, err := ssh.ParsePrivateKey(keyData)
	if err != nil {
		var passErr *ssh.PassphraseMissingError
		if !errors.As(err, &passErr) {
			return nil, fmt.Errorf("parse SSH identity: %w", err)
		}
		if !term.IsTerminal(int(os.Stdin.Fd())) {
			return nil, errors.New("SSH key is encrypted; run in a terminal to enter its passphrase")
		}
		fmt.Fprint(os.Stderr, "SSH key passphrase: ")
		passphrase, readErr := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
		if readErr != nil {
			return nil, fmt.Errorf("read SSH key passphrase: %w", readErr)
		}
		signer, err = ssh.ParsePrivateKeyWithPassphrase(keyData, passphrase)
		for i := range passphrase {
			passphrase[i] = 0
		}
		if err != nil {
			return nil, fmt.Errorf("decrypt SSH identity: %w", err)
		}
	}
	return signer, nil
}

func showDockerContainers(client *ssh.Client) error {
	output, err := runRemoteOutput(client, "docker ps --all --format '{{json .}}'")
	if err != nil {
		return fmt.Errorf("discover Docker containers: %w", err)
	}
	if strings.TrimSpace(output) == "" {
		fmt.Println("No Docker containers found.")
		return nil
	}
	fmt.Printf("%-24s %-34s %-24s %s\n", "NAME", "IMAGE", "STATE", "PORTS")
	scanner := bufio.NewScanner(strings.NewReader(output))
	scanner.Buffer(make([]byte, 4096), 1<<20)
	for scanner.Scan() {
		var item dockerContainer
		if err := json.Unmarshal(scanner.Bytes(), &item); err != nil {
			return fmt.Errorf("decode Docker inventory: %w", err)
		}
		fmt.Printf("%-24s %-34s %-24s %s\n", truncate(item.Names, 24), truncate(item.Image, 34), truncate(item.Status, 24), truncate(item.Ports, 60))
	}
	return scanner.Err()
}

func showComposeProjects(client *ssh.Client) error {
	output, err := runRemoteOutput(client, "docker compose ls --all --format json")
	if err != nil {
		return fmt.Errorf("discover Docker Compose projects: %w", err)
	}
	var projects []composeProject
	if err := json.Unmarshal([]byte(output), &projects); err != nil {
		return fmt.Errorf("decode Compose project inventory: %w", err)
	}
	fmt.Printf("%-32s %-18s %s\n", "PROJECT", "STATUS", "CONFIG FILES")
	for _, project := range projects {
		fmt.Printf("%-32s %-18s %s\n", truncate(project.Name, 32), truncate(project.Status, 18), truncate(project.ConfigFiles, 80))
	}
	return nil
}

func runDockerAction(client *ssh.Client, args []string) error {
	if len(args) != 3 {
		return errors.New("usage: mwx-control docker <start|stop|restart> <node-id> <container-name>")
	}
	action, target := args[0], args[2]
	if action != "start" && action != "stop" && action != "restart" {
		return errors.New("Docker action must be start, stop, or restart")
	}
	if !safeDockerTarget.MatchString(target) {
		return errors.New("container target may contain only letters, numbers, dot, underscore, and hyphen")
	}
	fmt.Printf("Requesting docker %s for container %s.\n", action, target)
	if err := confirmOwnerAction(strings.ToUpper(action) + " " + target); err != nil {
		return err
	}
	return runRemoteCommand(client, "docker "+action+" "+target)
}

func confirmOwnerAction(expected string) error {
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return errors.New("remote changes require an interactive terminal for confirmation")
	}
	fmt.Fprintf(os.Stderr, "Type %q to confirm: ", expected)
	answer, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil {
		return fmt.Errorf("read confirmation: %w", err)
	}
	if strings.TrimSpace(answer) != expected {
		return errors.New("operation cancelled; confirmation did not match")
	}
	return nil
}

func runAudited(operation, nodeID, target string, action func() error) error {
	if err := appendOwnerAudit(ownerAuditRecord{
		At: time.Now().UTC(), Operation: operation, NodeID: nodeID,
		Target: target, Phase: "started", Outcome: "pending",
	}); err != nil {
		if strings.HasPrefix(operation, "docker-") || operation == "mwx-isp-update" || operation == "interactive-shell" {
			return fmt.Errorf("refusing remote action because its local audit record cannot be written: %w", err)
		}
		fmt.Fprintf(os.Stderr, "Warning: could not append local owner audit record: %v\n", err)
	}
	actionErr := action()
	outcome := "success"
	if actionErr != nil {
		outcome = "failed"
	}
	if err := appendOwnerAudit(ownerAuditRecord{
		At: time.Now().UTC(), Operation: operation, NodeID: nodeID,
		Target: target, Phase: "completed", Outcome: outcome,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: could not append local owner audit record: %v\n", err)
	}
	return actionErr
}

func appendOwnerAudit(record ownerAuditRecord) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	directory := filepath.Join(home, ".mwx-control")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	path := filepath.Join(directory, "audit.jsonl")
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	if err := json.NewEncoder(file).Encode(record); err != nil {
		return err
	}
	return file.Sync()
}

func runRemoteOutput(client *ssh.Client, command string) (string, error) {
	session, err := client.NewSession()
	if err != nil {
		return "", err
	}
	defer session.Close()
	output := &cappedOutput{remaining: 1 << 20}
	errorOutput := &cappedOutput{remaining: 1 << 20, writer: os.Stderr}
	session.Stdout = output
	session.Stderr = errorOutput
	timeout := time.AfterFunc(90*time.Second, func() { _ = client.Close() })
	defer timeout.Stop()
	if err := session.Run(command); err != nil {
		return output.buffer.String(), err
	}
	if output.truncated || errorOutput.truncated {
		return output.buffer.String(), errors.New("remote discovery output exceeded the 1 MiB limit")
	}
	return output.buffer.String(), nil
}

func runRemoteCommand(client *ssh.Client, command string) error {
	session, err := client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()
	stdout := &cappedOutput{remaining: 1 << 20, writer: os.Stdout}
	stderr := &cappedOutput{remaining: 1 << 20, writer: os.Stderr}
	session.Stdout = stdout
	session.Stderr = stderr
	timeout := time.AfterFunc(15*time.Minute, func() { _ = client.Close() })
	defer timeout.Stop()
	if err := session.Run(command); err != nil {
		return fmt.Errorf("remote operation failed: %w", err)
	}
	if stdout.truncated || stderr.truncated {
		fmt.Fprintln(os.Stderr, "Remote output was truncated at 1 MiB.")
	}
	return nil
}

func runRemoteShell(client *ssh.Client) error {
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return errors.New("interactive shell requires a terminal")
	}
	session, err := client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()
	width, height, err := term.GetSize(int(os.Stdin.Fd()))
	if err != nil {
		width, height = 120, 40
	}
	if err := session.RequestPty("xterm-256color", height, width, ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400}); err != nil {
		return fmt.Errorf("request SSH terminal: %w", err)
	}
	stdin, err := session.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		return err
	}
	state, err := term.MakeRaw(int(os.Stdin.Fd()))
	if err != nil {
		return fmt.Errorf("put local terminal in raw mode: %w", err)
	}
	defer func() { _ = term.Restore(int(os.Stdin.Fd()), state) }()
	if err := session.Shell(); err != nil {
		return fmt.Errorf("start remote shell: %w", err)
	}
	copyDone := make(chan struct{}, 3)
	go func() { _, _ = io.Copy(stdin, os.Stdin); _ = stdin.Close(); copyDone <- struct{}{} }()
	go func() { _, _ = io.Copy(os.Stdout, stdout); copyDone <- struct{}{} }()
	go func() { _, _ = io.Copy(os.Stderr, stderr); copyDone <- struct{}{} }()
	if err := session.Wait(); err != nil {
		return fmt.Errorf("remote shell ended: %w", err)
	}
	return nil
}

func truncate(value string, max int) string {
	value = strings.ReplaceAll(strings.ReplaceAll(value, "\n", " "), "\r", " ")
	if len(value) <= max {
		return value
	}
	return value[:max-1] + "…"
}
