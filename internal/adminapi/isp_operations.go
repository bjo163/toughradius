package adminapi

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/bjo163/mwx-isp/internal/app"
	"github.com/bjo163/mwx-isp/internal/billing"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/webserver"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

func registerISPOperationsRoutes() {
	// Hotspot Voucher Management
	webserver.ApiPOST("/isp/vouchers/generate", generateVouchers, requireAdmin())
	webserver.ApiGET("/isp/vouchers", listVouchers)
	webserver.ApiGET("/isp/vouchers/batches", listVoucherBatches)
	webserver.ApiDELETE("/isp/vouchers/batches/:id", deleteVoucherBatch, requireAdmin())
	webserver.ApiGET("/public/vouchers/check", checkPublicVoucher)

	// IPAM Subnet Pools and Reverse IP Audit
	webserver.ApiGET("/network/ipam/pools", listIPAMPools)
	webserver.ApiPOST("/network/ipam/pools", createIPAMPool, requireAdmin())
	webserver.ApiPUT("/network/ipam/pools/:id", updateIPAMPool, requireAdmin())
	webserver.ApiDELETE("/network/ipam/pools/:id", deleteIPAMPool, requireAdmin())
	webserver.ApiGET("/network/ipam/audit", auditIPHistory)

	// Live Network Diagnostic Probe (Ping)
	webserver.ApiPOST("/network/diagnostics/ping", runLivePing, requireAdmin())

	// Trouble Tickets & Work Orders
	webserver.ApiGET("/isp/tickets", listTroubleTickets)
	webserver.ApiGET("/isp/tickets/:id", getTroubleTicket)
	webserver.ApiPOST("/isp/tickets", createTroubleTicket)
	webserver.ApiPUT("/isp/tickets/:id", updateTroubleTicket)
	webserver.ApiPOST("/isp/tickets/:id/dispatch", dispatchTicketWhatsApp)

	// FTTH ODP (Optical Distribution Point) Splitter Enclosures
	webserver.ApiGET("/network/odp", listODPs)
	webserver.ApiGET("/network/odp/:id", getODPDetail)
	webserver.ApiPOST("/network/odp", createODP, requireAdmin())
	webserver.ApiPUT("/network/odp/:id", updateODP, requireAdmin())
	webserver.ApiDELETE("/network/odp/:id", deleteODP, requireAdmin())

	// Intelligent Flapping Session Telemetry & Auto-Heal Work Orders
	webserver.ApiGET("/network/diagnostics/flapping", detectFlappingSubscribers)
	webserver.ApiPOST("/network/diagnostics/flapping/auto-ticket", createFlappingTicket, requireAdmin())
}

// --- 1. HOTSPOT VOUCHER ENGINE ---

type generateVoucherInput struct {
	Name            string `json:"name"`
	PackageID       int64  `json:"package_id,string"`
	Quantity        int    `json:"quantity"`
	Price           int64  `json:"price"`
	ValiditySeconds int    `json:"validity_seconds"`
	QuotaMB         int64  `json:"quota_mb"`
	Prefix          string `json:"prefix"`
	CodeLength      int    `json:"code_length"`
	SameUserPass    bool   `json:"same_user_pass"`
}

const voucherChars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ" // No 0/O, 1/I ambiguity

var errInvalidVoucherPackage = errors.New("selected package is not usable for RADIUS")

func generateRandomCode(length int) (string, error) {
	if length <= 0 {
		length = 6
	}
	result := make([]byte, length)
	charLen := big.NewInt(int64(len(voucherChars)))
	for i := 0; i < length; i++ {
		idx, err := rand.Int(rand.Reader, charLen)
		if err != nil {
			return "", err
		}
		result[i] = voucherChars[idx.Int64()]
	}
	return string(result), nil
}

func generateVouchers(c echo.Context) error {
	var in generateVoucherInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_INPUT", "Invalid voucher generation input", nil)
	}
	if in.Quantity <= 0 || in.Quantity > 500 {
		return fail(c, 400, "INVALID_QUANTITY", "Quantity must be between 1 and 500", nil)
	}
	if in.Price < 0 {
		return fail(c, 400, "INVALID_PRICE", "Price cannot be negative", nil)
	}
	if in.CodeLength < 4 || in.CodeLength > 12 {
		in.CodeLength = 6
	}
	if in.ValiditySeconds <= 0 {
		in.ValiditySeconds = 86400 // default 1 day
	}
	if in.ValiditySeconds > 365*24*60*60 {
		return fail(c, 400, "INVALID_VALIDITY", "Voucher validity cannot exceed 365 days", nil)
	}
	if in.QuotaMB > 0 {
		return fail(c, 400, "QUOTA_NOT_SUPPORTED", "Voucher data quotas are not enforced by the RADIUS accounting path yet; use 0 for unlimited data", nil)
	}
	if in.QuotaMB < 0 || in.QuotaMB > (int64(^uint64(0)>>1)/1024/1024) {
		return fail(c, 400, "INVALID_QUOTA", "Quota must be zero (unlimited) or a positive number of MB", nil)
	}
	if in.PackageID <= 0 {
		return fail(c, 400, "PACKAGE_REQUIRED", "Select an active package linked to a RADIUS profile", nil)
	}

	db := GetDB(c)
	now := time.Now()
	var batch domain.HotspotBatch
	vouchers := make([]domain.HotspotVoucher, in.Quantity)
	err := db.Transaction(func(tx *gorm.DB) error {
		var pkg domain.InternetPackage
		if err := tx.Where("status = ?", "active").First(&pkg, in.PackageID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("%w: package is missing or inactive", errInvalidVoucherPackage)
			}
			return err
		}
		if pkg.RadiusProfileID <= 0 {
			return fmt.Errorf("%w: package has no linked RADIUS profile", errInvalidVoucherPackage)
		}
		var profile domain.RadiusProfile
		if err := tx.First(&profile, pkg.RadiusProfileID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("%w: linked RADIUS profile is unavailable", errInvalidVoucherPackage)
			}
			return err
		}
		if profile.Status != "enabled" && profile.Status != "1" {
			return fmt.Errorf("%w: linked RADIUS profile is disabled", errInvalidVoucherPackage)
		}
		serial, err := billing.NextDocumentSerial(tx, "voucher", now.Format("060102"))
		if err != nil {
			return err
		}
		batch = domain.HotspotBatch{
			BatchNo: fmt.Sprintf("BATCH-%s-%06d", now.Format("060102"), serial),
			Name:    in.Name, PackageID: pkg.ID, Quantity: in.Quantity, Price: in.Price,
			ValiditySeconds: in.ValiditySeconds, QuotaBytes: in.QuotaMB * 1024 * 1024,
			Prefix: strings.ToUpper(strings.TrimSpace(in.Prefix)), CodeLength: in.CodeLength,
			CreatedBy: "operator", CreatedAt: now,
		}
		if err := tx.Create(&batch).Error; err != nil {
			return err
		}
		radiusUsers := make([]domain.RadiusUser, in.Quantity)
		for i := 0; i < in.Quantity; i++ {
			rawCode, err := generateRandomCode(in.CodeLength)
			if err != nil {
				return err
			}
			code := batch.Prefix + rawCode
			password := code
			if !in.SameUserPass {
				password, err = generateRandomCode(4)
				if err != nil {
					return err
				}
			}
			radiusUserID := common.UUIDint64()
			vouchers[i] = domain.HotspotVoucher{
				BatchID: batch.ID, PackageID: pkg.ID, Code: code, Password: password,
				RadiusUserID: radiusUserID, Price: in.Price, ValiditySeconds: in.ValiditySeconds,
				QuotaBytes: batch.QuotaBytes, Status: "active", CreatedAt: now,
			}
			radiusUsers[i] = domain.RadiusUser{
				ID: radiusUserID, NodeId: profile.NodeId, ProfileId: profile.ID,
				Username: code, Password: password, AddrPool: profile.AddrPool, ActiveNum: profile.ActiveNum,
				UpRate: profile.UpRate, DownRate: profile.DownRate, Domain: profile.Domain,
				IPv6PrefixPool: profile.IPv6PrefixPool, DelegatedIpv6PrefixPool: profile.DelegatedIpv6PrefixPool,
				RadiusClass: profile.RadiusClass, BindMac: profile.BindMac, BindVlan: profile.BindVlan,
				ProfileLinkMode: domain.ProfileLinkModeStatic, ExpireTime: now.AddDate(100, 0, 0), Status: "enabled", CreatedAt: now, UpdatedAt: now,
			}
		}
		if err := tx.Create(&vouchers).Error; err != nil {
			return err
		}
		return tx.Create(&radiusUsers).Error
	})
	if err != nil {
		if errors.Is(err, errInvalidVoucherPackage) {
			return fail(c, 400, "INVALID_PACKAGE", err.Error(), nil)
		}
		return fail(c, 500, "DATABASE_ERROR", "Failed to generate voucher batch", nil)
	}

	return ok(c, map[string]any{
		"batch":          batch,
		"vouchers_count": len(vouchers),
		"sample_code":    vouchers[0].Code,
	})
}

func listVouchers(c echo.Context) error {
	page, size := parsePagination(c)
	db := GetDB(c)
	q := db.Model(&domain.HotspotVoucher{})

	if batchID := c.QueryParam("batch_id"); batchID != "" {
		q = q.Where("batch_id = ?", batchID)
	}
	if status := c.QueryParam("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if search := strings.TrimSpace(c.QueryParam("q")); search != "" {
		q = q.Where("code LIKE ?", "%"+search+"%")
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to count vouchers", nil)
	}

	var rows []domain.HotspotVoucher
	if err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query vouchers", nil)
	}

	return paged(c, rows, total, page, size)
}

func checkPublicVoucher(c echo.Context) error {
	code := strings.TrimSpace(c.QueryParam("code"))
	if code == "" {
		return fail(c, 400, "CODE_REQUIRED", "Kode voucher wajib diisi", nil)
	}

	var v domain.HotspotVoucher
	db := GetDB(c)
	if err := db.Where("LOWER(code) = LOWER(?)", code).First(&v).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Voucher tidak ditemukan atau kode salah", nil)
	}

	var pkgName string
	if v.PackageID > 0 {
		var p domain.InternetPackage
		if err := db.First(&p, v.PackageID).Error; err == nil {
			pkgName = p.Name
		}
	}

	return ok(c, map[string]any{
		"code":             v.Code,
		"package_name":     pkgName,
		"price":            v.Price,
		"status":           v.Status,
		"validity_seconds": v.ValiditySeconds,
		"quota_bytes":      v.QuotaBytes,
		"used_bytes":       v.UsedBytes,
		"quota_enforced":   false,
		"usage_available":  false,
		"first_login_at":   v.FirstLoginAt,
		"expires_at":       v.ExpiresAt,
	})
}

func listVoucherBatches(c echo.Context) error {
	page, size := parsePagination(c)
	db := GetDB(c)
	var total int64
	db.Model(&domain.HotspotBatch{}).Count(&total)

	var rows []domain.HotspotBatch
	if err := db.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to list voucher batches", nil)
	}
	return paged(c, rows, total, page, size)
}

func deleteVoucherBatch(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid batch ID", nil)
	}
	db := GetDB(c)
	err = db.Transaction(func(tx *gorm.DB) error {
		var batch domain.HotspotBatch
		if err := tx.First(&batch, id).Error; err != nil {
			return err
		}
		var vouchers []domain.HotspotVoucher
		if err := tx.Where("batch_id = ?", id).Find(&vouchers).Error; err != nil {
			return err
		}
		userIDs := make([]int64, 0, len(vouchers))
		for _, voucher := range vouchers {
			if voucher.RadiusUserID > 0 {
				userIDs = append(userIDs, voucher.RadiusUserID)
			}
		}
		if len(userIDs) > 0 {
			if err := tx.Where("id IN ?", userIDs).Delete(&domain.RadiusUser{}).Error; err != nil {
				return err
			}
		}
		// Remove credentials generated before RadiusUserID was persisted, but
		// only when both the voucher username and password still match.
		for _, voucher := range vouchers {
			if voucher.RadiusUserID == 0 {
				if err := tx.Where("username = ? AND password = ?", voucher.Code, voucher.Password).Delete(&domain.RadiusUser{}).Error; err != nil {
					return err
				}
			}
		}
		if err := tx.Where("batch_id = ?", id).Delete(&domain.HotspotVoucher{}).Error; err != nil {
			return err
		}
		return tx.Delete(&batch).Error
	})
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, 404, "NOT_FOUND", "Voucher batch not found", nil)
	}
	if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to delete voucher batch", nil)
	}
	return ok(c, map[string]any{"id": strconv.FormatInt(id, 10)})
}

// --- 2. IPAM SUBNET MANAGEMENT & AUDIT ---

type ipamPoolInput struct {
	Name         string `json:"name"`
	CIDR         string `json:"cidr"`
	IPVersion    int    `json:"ip_version"`
	PoolType     string `json:"pool_type"`
	Gateway      string `json:"gateway"`
	DNSPrimary   string `json:"dns_primary"`
	DNSSecondary string `json:"dns_secondary"`
	Description  string `json:"description"`
}

func calculateSubnetCapacity(cidrStr string) (int64, int) {
	_, ipNet, err := net.ParseCIDR(cidrStr)
	if err != nil {
		return 0, 4
	}
	ones, bits := ipNet.Mask.Size()
	if bits == 128 { // IPv6
		return int64(1) << 16, 6 // e.g. representation
	}
	// IPv4
	hostBits := bits - ones
	if hostBits <= 0 {
		return 1, 4
	}
	total := int64(1) << hostBits
	if total > 2 {
		total -= 2 // minus network and broadcast
	}
	return total, 4
}

func listIPAMPools(c echo.Context) error {
	db := GetDB(c)
	var pools []domain.IPAMPool
	if err := db.Order("id ASC").Find(&pools).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to load IPAM pools", nil)
	}

	// Calculate live used IPs from RadiusOnline and Subscription
	for i := range pools {
		var activeSessionsCount int64
		// Count online sessions in this CIDR or pool
		db.Model(&domain.RadiusOnline{}).
			Where("framed_ipaddr != '' AND framed_ipaddr != '0.0.0.0'").
			Count(&activeSessionsCount)
		pools[i].UsedIPs = activeSessionsCount
	}

	return ok(c, pools)
}

func createIPAMPool(c echo.Context) error {
	var in ipamPoolInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_INPUT", "Invalid IPAM configuration", nil)
	}
	totalIPs, ipVer := calculateSubnetCapacity(in.CIDR)
	if totalIPs <= 0 {
		return fail(c, 400, "INVALID_CIDR", "Invalid CIDR notation (e.g. 100.64.0.0/22)", nil)
	}

	pool := domain.IPAMPool{
		Name:         in.Name,
		CIDR:         in.CIDR,
		IPVersion:    ipVer,
		PoolType:     in.PoolType,
		Gateway:      in.Gateway,
		DNSPrimary:   in.DNSPrimary,
		DNSSecondary: in.DNSSecondary,
		TotalIPs:     totalIPs,
		UsedIPs:      0,
		Description:  in.Description,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	if err := GetDB(c).Create(&pool).Error; err != nil {
		return fail(c, 400, "SAVE_FAILED", "Could not save IPAM pool; CIDR may already exist", nil)
	}
	return ok(c, pool)
}

func updateIPAMPool(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid pool ID", nil)
	}
	var in ipamPoolInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_INPUT", "Invalid input", nil)
	}
	var pool domain.IPAMPool
	db := GetDB(c)
	if err := db.First(&pool, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "IPAM pool not found", nil)
	}
	totalIPs, ipVer := calculateSubnetCapacity(in.CIDR)
	pool.Name = in.Name
	pool.CIDR = in.CIDR
	pool.IPVersion = ipVer
	pool.PoolType = in.PoolType
	pool.Gateway = in.Gateway
	pool.DNSPrimary = in.DNSPrimary
	pool.DNSSecondary = in.DNSSecondary
	pool.TotalIPs = totalIPs
	pool.Description = in.Description
	pool.UpdatedAt = time.Now()
	if err := db.Save(&pool).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to update IPAM pool", nil)
	}
	return ok(c, pool)
}

func deleteIPAMPool(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid pool ID", nil)
	}
	GetDB(c).Delete(&domain.IPAMPool{}, id)
	return ok(c, map[string]any{"id": strconv.FormatInt(id, 10)})
}

// auditIPHistory searches historical RADIUS accounting records to find which subscriber
// was assigned a specific IP address at a target timestamp (crucial for Kominfo/Cyber crime compliance).
func auditIPHistory(c echo.Context) error {
	targetIP := strings.TrimSpace(c.QueryParam("ip"))
	if targetIP == "" {
		return fail(c, 400, "IP_REQUIRED", "Target IP address is required", nil)
	}

	atStr := c.QueryParam("at")
	targetTime := time.Now()
	if atStr != "" {
		if parsed, err := time.Parse(time.RFC3339, atStr); err == nil {
			targetTime = parsed
		}
	}

	db := GetDB(c)
	// Check currently active online sessions first
	var currentSession domain.RadiusOnline
	var matches []map[string]any

	if err := db.Where("framed_ipaddr = ?", targetIP).First(&currentSession).Error; err == nil {
		matches = append(matches, map[string]any{
			"type":            "live_online",
			"username":        currentSession.Username,
			"acct_session_id": currentSession.AcctSessionId,
			"nas_addr":        currentSession.NasAddr,
			"framed_ip":       currentSession.FramedIpaddr,
			"mac_addr":        currentSession.MacAddr,
			"start_time":      currentSession.AcctStartTime,
			"last_update":     currentSession.LastUpdate,
			"status":          "CONNECTED",
		})
	}

	// Query historical accounting records overlapping targetTime
	var historical []domain.RadiusAccounting
	db.Where("framed_ipaddr = ? AND acct_start_time <= ? AND (acct_stop_time >= ? OR acct_stop_time IS NULL)", targetIP, targetTime, targetTime).
		Order("acct_start_time DESC").
		Limit(20).
		Find(&historical)

	for _, h := range historical {
		matches = append(matches, map[string]any{
			"type":            "historical_accounting",
			"username":        h.Username,
			"acct_session_id": h.AcctSessionId,
			"nas_addr":        h.NasAddr,
			"framed_ip":       h.FramedIpaddr,
			"mac_addr":        h.MacAddr,
			"start_time":      h.AcctStartTime,
			"stop_time":       h.AcctStopTime,
			"session_time":    h.AcctSessionTime,
			"status":          "CLOSED",
		})
	}

	return ok(c, map[string]any{
		"queried_ip":   targetIP,
		"queried_time": targetTime,
		"total_found":  len(matches),
		"results":      matches,
	})
}

// --- 3. LIVE DIAGNOSTIC PROBE (PING) ---

type pingRequest struct {
	Host  string `json:"host"`
	Count int    `json:"count"`
}

func runLivePing(c echo.Context) error {
	var in pingRequest
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_REQUEST", "Invalid ping parameters", nil)
	}
	host := strings.TrimSpace(in.Host)
	if host == "" {
		return fail(c, 400, "HOST_REQUIRED", "Target host or IP address is required", nil)
	}
	if in.Count <= 0 || in.Count > 10 {
		in.Count = 4
	}

	type pingResult struct {
		Seq       int    `json:"seq"`
		RTTMillis int64  `json:"rtt_ms"`
		Success   bool   `json:"success"`
		Error     string `json:"error,omitempty"`
	}

	results := make([]pingResult, in.Count)
	var sumRTT, minRTT, maxRTT int64
	minRTT = 999999
	successCount := 0

	for i := 0; i < in.Count; i++ {
		start := time.Now()
		targetAddr := host
		if !strings.Contains(targetAddr, ":") {
			targetAddr = net.JoinHostPort(targetAddr, "80") // TCP SYN ping test
		}
		conn, err := net.DialTimeout("tcp", targetAddr, 1500*time.Millisecond)
		rtt := time.Since(start).Milliseconds()
		if err == nil {
			_ = conn.Close()
			results[i] = pingResult{Seq: i + 1, RTTMillis: rtt, Success: true}
			successCount++
			sumRTT += rtt
			if rtt < minRTT {
				minRTT = rtt
			}
			if rtt > maxRTT {
				maxRTT = rtt
			}
		} else {
			// Even if port 80 refused, connection reaching host means host is UP!
			if strings.Contains(err.Error(), "refused") || strings.Contains(err.Error(), "reset") {
				results[i] = pingResult{Seq: i + 1, RTTMillis: rtt, Success: true}
				successCount++
				sumRTT += rtt
				if rtt < minRTT {
					minRTT = rtt
				}
				if rtt > maxRTT {
					maxRTT = rtt
				}
			} else {
				results[i] = pingResult{Seq: i + 1, RTTMillis: 0, Success: false, Error: err.Error()}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}

	var avgRTT int64
	if successCount > 0 {
		avgRTT = sumRTT / int64(successCount)
	} else {
		minRTT = 0
	}

	packetLoss := float64(in.Count-successCount) / float64(in.Count) * 100.0

	return ok(c, map[string]any{
		"host":         host,
		"sent":         in.Count,
		"received":     successCount,
		"loss_percent": packetLoss,
		"min_rtt_ms":   minRTT,
		"avg_rtt_ms":   avgRTT,
		"max_rtt_ms":   maxRTT,
		"details":      results,
	})
}

// --- 4. TROUBLE TICKETS & FIELD TECHNICIANS ---

type ticketInput struct {
	CustomerID         int64  `json:"customer_id,string"`
	SubscriptionID     int64  `json:"subscription_id,string"`
	Subject            string `json:"subject"`
	Category           string `json:"category"`
	Priority           string `json:"priority"`
	Status             string `json:"status"`
	AssignedTechnician string `json:"assigned_technician"`
	TechnicianPhone    string `json:"technician_phone"`
	Description        string `json:"description"`
	ResolutionNotes    string `json:"resolution_notes"`
}

func listTroubleTickets(c echo.Context) error {
	page, size := parsePagination(c)
	db := GetDB(c)
	q := db.Model(&domain.TroubleTicket{})

	if status := c.QueryParam("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if priority := c.QueryParam("priority"); priority != "" {
		q = q.Where("priority = ?", priority)
	}
	if customerID := c.QueryParam("customer_id"); customerID != "" {
		q = q.Where("customer_id = ?", customerID)
	}
	if search := strings.TrimSpace(c.QueryParam("q")); search != "" {
		q = q.Where("ticket_no LIKE ? OR subject LIKE ? OR assigned_technician LIKE ?", "%"+search+"%", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	q.Count(&total)

	var rows []domain.TroubleTicket
	if err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query tickets", nil)
	}
	return paged(c, rows, total, page, size)
}

func getTroubleTicket(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid ticket ID", nil)
	}
	var ticket domain.TroubleTicket
	if err := GetDB(c).First(&ticket, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Ticket not found", nil)
	}
	return ok(c, ticket)
}

func createTroubleTicket(c echo.Context) error {
	var in ticketInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_INPUT", "Invalid ticket input", nil)
	}
	if strings.TrimSpace(in.Subject) == "" {
		return fail(c, 400, "SUBJECT_REQUIRED", "Ticket subject is required", nil)
	}

	now := time.Now()
	ticketNo := fmt.Sprintf("TCK-%s-%04d", now.Format("060102"), time.Now().Nanosecond()%10000)

	ticket := domain.TroubleTicket{
		TicketNo:           ticketNo,
		CustomerID:         in.CustomerID,
		SubscriptionID:     in.SubscriptionID,
		Subject:            in.Subject,
		Category:           in.Category,
		Priority:           in.Priority,
		Status:             "open",
		AssignedTechnician: in.AssignedTechnician,
		TechnicianPhone:    in.TechnicianPhone,
		Description:        in.Description,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if ticket.Priority == "" {
		ticket.Priority = "normal"
	}
	if ticket.Category == "" {
		ticket.Category = "no_internet"
	}

	if err := GetDB(c).Create(&ticket).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to create trouble ticket", nil)
	}
	return c.JSON(http.StatusCreated, Response{Data: ticket})
}

func updateTroubleTicket(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid ticket ID", nil)
	}
	var in ticketInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_INPUT", "Invalid input", nil)
	}

	var ticket domain.TroubleTicket
	db := GetDB(c)
	if err := db.First(&ticket, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Ticket not found", nil)
	}

	ticket.Subject = in.Subject
	ticket.Category = in.Category
	ticket.Priority = in.Priority
	ticket.AssignedTechnician = in.AssignedTechnician
	ticket.TechnicianPhone = in.TechnicianPhone
	ticket.Description = in.Description
	ticket.ResolutionNotes = in.ResolutionNotes
	ticket.UpdatedAt = time.Now()

	if in.Status != "" && in.Status != ticket.Status {
		ticket.Status = in.Status
		if in.Status == "resolved" || in.Status == "closed" {
			now := time.Now()
			ticket.ResolvedAt = &now
		}
	}

	if err := db.Save(&ticket).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to update ticket", nil)
	}
	return ok(c, ticket)
}

func dispatchTicketWhatsApp(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid ticket ID", nil)
	}

	var ticket domain.TroubleTicket
	db := GetDB(c)
	if err := db.First(&ticket, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Ticket not found", nil)
	}

	if ticket.TechnicianPhone == "" {
		return fail(c, 400, "PHONE_REQUIRED", "Assigned technician has no phone number", nil)
	}

	// Lookup customer name and address
	var customer domain.Customer
	customerName := "Customer"
	customerAddress := "-"
	if ticket.CustomerID > 0 {
		if err := db.First(&customer, ticket.CustomerID).Error; err == nil {
			customerName = customer.Name
			customerAddress = customer.Address
		}
	}

	msgBody := fmt.Sprintf(
		"🔔 *DISPOSISI TIKET GANGGUAN ISP*\n"+
			"------------------------------------\n"+
			"No. Tiket: *%s*\n"+
			"Prioritas: *%s*\n"+
			"Kategori: *%s*\n"+
			"Pelanggan: *%s*\n"+
			"Alamat: %s\n"+
			"Kendala: %s\n"+
			"------------------------------------\n"+
			"Mohon segera kunjungi lokasi & perbarui status di sistem.",
		ticket.TicketNo,
		strings.ToUpper(ticket.Priority),
		strings.ToUpper(ticket.Category),
		customerName,
		customerAddress,
		ticket.Subject,
	)

	// Dispatch via application notification outbox if configured
	if appProvider, ok := GetAppContext(c).(app.NotificationProvider); ok && appProvider.NotificationDispatcher() != nil {
		_ = appProvider.NotificationDispatcher().Enqueue(
			"ticket.assigned",
			fmt.Sprintf("ticket:%d", ticket.ID),
			msgBody,
		)
	}

	return ok(c, map[string]any{
		"dispatched": true,
		"recipient":  ticket.TechnicianPhone,
		"message":    msgBody,
	})
}

// --- 5. ODP (OPTICAL DISTRIBUTION POINT) MANAGEMENT ---

type odpInput struct {
	Code        string  `json:"code"`
	Name        string  `json:"name"`
	Zone        string  `json:"zone"`
	OLTName     string  `json:"olt_name"`
	PONPort     string  `json:"pon_port"`
	TotalPorts  int     `json:"total_ports"`
	OpticalLoss float64 `json:"optical_loss"`
	Status      string  `json:"status"`
	Address     string  `json:"address"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Notes       string  `json:"notes"`
}

func listODPs(c echo.Context) error {
	page, size := parsePagination(c)
	db := GetDB(c)
	q := db.Model(&domain.ODP{})

	if search := strings.TrimSpace(c.QueryParam("q")); search != "" {
		like := "%" + search + "%"
		q = q.Where("code LIKE ? OR name LIKE ? OR zone LIKE ? OR olt_name LIKE ? OR address LIKE ?", like, like, like, like, like)
	}
	if zone := strings.TrimSpace(c.QueryParam("zone")); zone != "" {
		q = q.Where("zone = ?", zone)
	}
	if status := strings.TrimSpace(c.QueryParam("status")); status != "" {
		q = q.Where("status = ?", status)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to count ODPs", err.Error())
	}

	var rows []domain.ODP
	if err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to query ODPs", err.Error())
	}

	type odpItem struct {
		domain.ODP
		AvailablePorts int     `json:"available_ports"`
		UtilizationPct float64 `json:"utilization_pct"`
	}

	result := make([]odpItem, len(rows))
	for i, odp := range rows {
		var usedCount int64
		_ = db.Model(&domain.Customer{}).Where("odp_id = ?", odp.ID).Count(&usedCount)
		used := int(usedCount)
		if odp.TotalPorts <= 0 {
			odp.TotalPorts = 16
		}
		avail := odp.TotalPorts - used
		if avail < 0 {
			avail = 0
		}
		var util float64
		if odp.TotalPorts > 0 {
			util = float64(used) / float64(odp.TotalPorts) * 100.0
		}
		odp.UsedPorts = used
		result[i] = odpItem{
			ODP:            odp,
			AvailablePorts: avail,
			UtilizationPct: util,
		}
	}

	return ok(c, map[string]any{
		"data":  result,
		"total": total,
	})
}

func getODPDetail(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid ODP ID", nil)
	}

	var odp domain.ODP
	if err := GetDB(c).First(&odp, id).Error; err != nil {
		return fail(c, http.StatusNotFound, "NOT_FOUND", "ODP enclosure not found", nil)
	}

	var customers []domain.Customer
	_ = GetDB(c).Where("odp_id = ?", odp.ID).Find(&customers)

	return ok(c, map[string]any{
		"odp":             odp,
		"connected_count": len(customers),
		"customers":       customers,
	})
}

func createODP(c echo.Context) error {
	var input odpInput
	if err := c.Bind(&input); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_INPUT", err.Error(), nil)
	}
	input.Code = strings.TrimSpace(input.Code)
	if input.Code == "" {
		return fail(c, http.StatusBadRequest, "VALIDATION_FAILED", "ODP code is required (e.g. ODP-KNG-001)", nil)
	}
	if input.Name == "" {
		input.Name = input.Code
	}
	if input.TotalPorts <= 0 {
		input.TotalPorts = 16
	}
	if input.Status == "" {
		input.Status = "active"
	}

	odp := domain.ODP{
		Code:        input.Code,
		Name:        input.Name,
		Zone:        input.Zone,
		OLTName:     input.OLTName,
		PONPort:     input.PONPort,
		TotalPorts:  input.TotalPorts,
		OpticalLoss: input.OpticalLoss,
		Status:      input.Status,
		Address:     input.Address,
		Latitude:    input.Latitude,
		Longitude:   input.Longitude,
		Notes:       input.Notes,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := GetDB(c).Create(&odp).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to create ODP", err.Error())
	}

	return ok(c, odp)
}

func updateODP(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid ODP ID", nil)
	}

	var odp domain.ODP
	if err := GetDB(c).First(&odp, id).Error; err != nil {
		return fail(c, http.StatusNotFound, "NOT_FOUND", "ODP enclosure not found", nil)
	}

	var input odpInput
	if err := c.Bind(&input); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_INPUT", err.Error(), nil)
	}

	if input.Name != "" {
		odp.Name = input.Name
	}
	if input.Zone != "" {
		odp.Zone = input.Zone
	}
	if input.OLTName != "" {
		odp.OLTName = input.OLTName
	}
	if input.PONPort != "" {
		odp.PONPort = input.PONPort
	}
	if input.TotalPorts > 0 {
		odp.TotalPorts = input.TotalPorts
	}
	if input.OpticalLoss != 0 {
		odp.OpticalLoss = input.OpticalLoss
	}
	if input.Status != "" {
		odp.Status = input.Status
	}
	if input.Address != "" {
		odp.Address = input.Address
	}
	if input.Latitude != 0 {
		odp.Latitude = input.Latitude
	}
	if input.Longitude != 0 {
		odp.Longitude = input.Longitude
	}
	if input.Notes != "" {
		odp.Notes = input.Notes
	}
	odp.UpdatedAt = time.Now()

	if err := GetDB(c).Save(&odp).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to update ODP", err.Error())
	}

	return ok(c, odp)
}

func deleteODP(c echo.Context) error {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid ODP ID", nil)
	}

	var count int64
	GetDB(c).Model(&domain.Customer{}).Where("odp_id = ?", id).Count(&count)
	if count > 0 {
		return fail(c, http.StatusConflict, "HAS_CUSTOMERS", fmt.Sprintf("Cannot delete ODP: %d customers are connected to this splitter", count), nil)
	}

	if err := GetDB(c).Delete(&domain.ODP{}, id).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to delete ODP", err.Error())
	}

	return ok(c, map[string]any{"deleted": true, "id": id})
}

// --- 6. FLAPPING TELEMETRY & AUTO-HEALING WORK ORDERS ---

type flappingSubscriber struct {
	Username            string    `json:"username"`
	CustomerNo          string    `json:"customer_no"`
	CustomerName        string    `json:"customer_name"`
	Phone               string    `json:"phone"`
	Address             string    `json:"address"`
	ODPCode             string    `json:"odp_code"`
	DisconnectCount     int       `json:"disconnect_count"`
	LastTerminateCause  string    `json:"last_terminate_cause"`
	LastSeenTime        time.Time `json:"last_seen_time"`
	Severity            string    `json:"severity"` // urgent (>=5), warning (>=3)
	SuggestedResolution string    `json:"suggested_resolution"`
}

func detectFlappingSubscribers(c echo.Context) error {
	db := GetDB(c)
	oneHourAgo := time.Now().Add(-1 * time.Hour)

	type stopGroup struct {
		Username string
		Cnt      int
	}

	var groups []stopGroup
	db.Model(&domain.RadiusAccounting{}).
		Select("username, count(*) as cnt").
		Where("acct_stop_time > ? AND username != ''", oneHourAgo).
		Group("username").
		Having("count(*) >= 3").
		Order("cnt DESC").
		Limit(50).
		Scan(&groups)

	results := make([]flappingSubscriber, 0, len(groups))
	for _, g := range groups {
		var lastAcct domain.RadiusAccounting
		db.Where("username = ? AND acct_stop_time > ?", g.Username, oneHourAgo).
			Order("acct_stop_time DESC").
			First(&lastAcct)

		var cust domain.Customer
		var sub domain.Subscription
		var custName, custNo, phone, address, odpCode string
		if err := db.Where("radius_user_id IN (SELECT id FROM radius_user WHERE username = ?)", g.Username).First(&sub).Error; err == nil {
			if err := db.First(&cust, sub.CustomerID).Error; err == nil {
				custName = cust.Name
				custNo = cust.CustomerNo
				phone = cust.Phone
				address = cust.Address
				odpCode = cust.ODPCode
			}
		}

		severity := "warning"
		if g.Cnt >= 5 {
			severity = "urgent"
		}

		stopTime := time.Now()
		if !lastAcct.AcctStopTime.IsZero() {
			stopTime = lastAcct.AcctStopTime
		}

		results = append(results, flappingSubscriber{
			Username:            g.Username,
			CustomerNo:          custNo,
			CustomerName:        custName,
			Phone:               phone,
			Address:             address,
			ODPCode:             odpCode,
			DisconnectCount:     g.Cnt,
			LastTerminateCause:  fmt.Sprintf("Session Time %ds, NAS %s", lastAcct.AcctSessionTime, lastAcct.NasAddr),
			LastSeenTime:        stopTime,
			Severity:            severity,
			SuggestedResolution: "Periksa redaman optik (dBm) dropcore, konektor SC-UPC kotor/kendur, atau splitter ODP berdebu.",
		})
	}

	return ok(c, map[string]any{
		"flapping_count": len(results),
		"subscribers":    results,
	})
}

type flappingTicketInput struct {
	Username    string `json:"username"`
	CustomerNo  string `json:"customer_no"`
	Description string `json:"description"`
}

func createFlappingTicket(c echo.Context) error {
	var input flappingTicketInput
	if err := c.Bind(&input); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_INPUT", err.Error(), nil)
	}
	input.Username = strings.TrimSpace(input.Username)
	if input.Username == "" {
		return fail(c, http.StatusBadRequest, "MISSING_FIELD", "Username is required", nil)
	}

	db := GetDB(c)
	var cust domain.Customer
	var sub domain.Subscription
	if err := db.Where("radius_user_id IN (SELECT id FROM radius_user WHERE username = ?)", input.Username).First(&sub).Error; err == nil {
		_ = db.First(&cust, sub.CustomerID)
	}

	ticketNo := fmt.Sprintf("FLAP-%s-%04d", time.Now().Format("060102"), time.Now().Unix()%10000)
	ticket := domain.TroubleTicket{
		TicketNo:       ticketNo,
		CustomerID:     cust.ID,
		SubscriptionID: sub.ID,
		Subject:        fmt.Sprintf("[AUTO-NOC] Flapping Fiber Link Detected on %s", input.Username),
		Category:       "los_red",
		Priority:       "urgent",
		Status:         "open",
		Description: fmt.Sprintf(
			"Sistem MWX-ISP mendeteksi flapping link berulang pada akun PPPoE %s (Customer: %s / %s).\n\nDetail:\n- ODP: %s\n- Alamat: %s\n- Waktu Deteksi: %s\n- Catatan: %s",
			input.Username, cust.CustomerNo, cust.Name, cust.ODPCode, cust.Address, time.Now().Format(time.RFC1123), input.Description,
		),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := db.Create(&ticket).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to create flapping ticket", err.Error())
	}

	return ok(c, ticket)
}
