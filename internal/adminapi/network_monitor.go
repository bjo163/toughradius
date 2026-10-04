package adminapi

import (
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/bjo163/mwx-isp/internal/app"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/securestore"
	"github.com/bjo163/mwx-isp/internal/webserver"
	"gorm.io/gorm"
)

type monitorTargetInput struct {
	Name                string `json:"name"`
	Kind                string `json:"kind"`
	Address             string `json:"address"`
	ProbeType           string `json:"probe_type"`
	Port                int    `json:"port"`
	IntervalSeconds     int    `json:"interval_seconds"`
	TimeoutMilliseconds int    `json:"timeout_milliseconds"`
	FailureThreshold    int    `json:"failure_threshold"`
	Enabled             *bool  `json:"enabled"`
	SNMPVersion         string `json:"snmp_version"`
	SNMPUsername        string `json:"snmp_username"`
	SNMPAuthProtocol    string `json:"snmp_auth_protocol"`
	SNMPPrivacyProtocol string `json:"snmp_privacy_protocol"`
	SNMPCommunity       string `json:"snmp_community"`
	SNMPAuthPassword    string `json:"snmp_auth_password"`
	SNMPPrivacyPassword string `json:"snmp_privacy_password"`
}

type monitorTargetDTO struct {
	domain.NetMonitorTarget
	SNMPSecretConfigured bool `json:"snmp_secret_configured"`
}

func toMonitorDTO(row domain.NetMonitorTarget) monitorTargetDTO {
	configured := len(row.SNMPCommunityEncrypted)+len(row.SNMPAuthEncrypted)+len(row.SNMPPrivacyEncrypted) > 0
	row.SNMPCommunityEncrypted = nil
	row.SNMPAuthEncrypted = nil
	row.SNMPPrivacyEncrypted = nil
	return monitorTargetDTO{NetMonitorTarget: row, SNMPSecretConfigured: configured}
}

func registerNetworkMonitorRoutes() {
	webserver.ApiGET("/network/monitor-targets", listMonitorTargets)
	webserver.ApiGET("/network/monitor-targets/:id", getMonitorTarget)
	webserver.ApiPOST("/network/monitor-targets", createMonitorTarget, requireAdmin())
	webserver.ApiPUT("/network/monitor-targets/:id", updateMonitorTarget, requireAdmin())
	webserver.ApiDELETE("/network/monitor-targets/:id", deleteMonitorTarget, requireAdmin())
	webserver.ApiPOST("/network/monitor-targets/:id/check", checkMonitorTarget, requireAdmin())
	webserver.ApiGET("/network/monitor-targets/:id/samples", listMonitorSamples)
	webserver.ApiGET("/network/monitor-incidents", listMonitorIncidents)
}

func listMonitorTargets(c echo.Context) error {
	page, size := parsePagination(c)
	var total int64
	query := GetDB(c).Model(&domain.NetMonitorTarget{})
	if status := c.QueryParam("status"); status != "" {
		query = query.Where("last_status = ?", status)
	}
	if err := query.Count(&total).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query monitor targets", nil)
	}
	var rows []domain.NetMonitorTarget
	if err := query.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query monitor targets", nil)
	}
	data := make([]monitorTargetDTO, 0, len(rows))
	for _, row := range rows {
		data = append(data, toMonitorDTO(row))
	}
	return paged(c, data, total, page, size)
}

func getMonitorTarget(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid target ID", nil)
	}
	var row domain.NetMonitorTarget
	if err := GetDB(c).First(&row, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Monitor target not found", nil)
	}
	return ok(c, toMonitorDTO(row))
}

func validateMonitorInput(in *monitorTargetInput, secretConfigured bool) error {
	in.Name = strings.TrimSpace(in.Name)
	in.Address = strings.TrimSpace(in.Address)
	if in.Name == "" || len(in.Name) > 120 {
		return errors.New("name must contain 1 to 120 characters")
	}
	ip := net.ParseIP(in.Address)
	if ip == nil || ip.IsUnspecified() || ip.IsMulticast() {
		return errors.New("address must be one explicit unicast IP address")
	}
	if in.Kind == "" {
		in.Kind = "router"
	}
	if in.Kind != "router" && in.Kind != "switch" && in.Kind != "server" && in.Kind != "nas" && in.Kind != "other" {
		return errors.New("invalid target kind")
	}
	if in.ProbeType != "icmp" && in.ProbeType != "tcp" && in.ProbeType != "snmp" {
		return errors.New("probe type must be icmp, tcp, or snmp")
	}
	if in.IntervalSeconds < 30 || in.IntervalSeconds > 3600 {
		return errors.New("interval must be between 30 and 3600 seconds")
	}
	if in.TimeoutMilliseconds < 100 || in.TimeoutMilliseconds > 10000 {
		return errors.New("timeout must be between 100 and 10000 milliseconds")
	}
	if in.FailureThreshold < 1 || in.FailureThreshold > 10 {
		return errors.New("failure threshold must be between 1 and 10")
	}
	if (in.ProbeType == "tcp" || in.ProbeType == "snmp") && (in.Port < 1 || in.Port > 65535) {
		if in.ProbeType == "snmp" && in.Port == 0 {
			in.Port = 161
		} else {
			return errors.New("port must be between 1 and 65535")
		}
	}
	if in.ProbeType == "snmp" {
		if in.SNMPVersion != "v2c" && in.SNMPVersion != "v3" {
			return errors.New("SNMP version must be v2c or v3")
		}
		if in.SNMPVersion == "v2c" && in.SNMPCommunity == "" && !secretConfigured {
			return errors.New("SNMP community is required")
		}
		if in.SNMPVersion == "v3" && (in.SNMPUsername == "" || (!secretConfigured && (in.SNMPAuthPassword == "" || in.SNMPPrivacyPassword == ""))) {
			return errors.New("SNMPv3 username and auth/privacy passwords are required")
		}
		if in.SNMPVersion == "v3" {
			authProtocols := map[string]bool{"SHA": true, "SHA256": true, "SHA384": true, "SHA512": true, "MD5": true}
			privacyProtocols := map[string]bool{"AES": true, "AES192": true, "AES256": true, "DES": true}
			if in.SNMPAuthProtocol != "" && !authProtocols[strings.ToUpper(in.SNMPAuthProtocol)] {
				return errors.New("unsupported SNMPv3 authentication protocol")
			}
			if in.SNMPPrivacyProtocol != "" && !privacyProtocols[strings.ToUpper(in.SNMPPrivacyProtocol)] {
				return errors.New("unsupported SNMPv3 privacy protocol")
			}
		}
	}
	return nil
}

func applyMonitorInput(c echo.Context, row *domain.NetMonitorTarget, in monitorTargetInput, creating bool) error {
	secretConfigured := len(row.SNMPCommunityEncrypted)+len(row.SNMPAuthEncrypted)+len(row.SNMPPrivacyEncrypted) > 0
	if in.SNMPVersion == "v2c" {
		secretConfigured = len(row.SNMPCommunityEncrypted) > 0
	}
	if in.SNMPVersion == "v3" {
		secretConfigured = len(row.SNMPAuthEncrypted) > 0 && len(row.SNMPPrivacyEncrypted) > 0
	}
	if err := validateMonitorInput(&in, secretConfigured); err != nil {
		return err
	}
	row.Name, row.Kind, row.Address, row.ProbeType = in.Name, in.Kind, in.Address, in.ProbeType
	row.Port, row.IntervalSeconds, row.TimeoutMilliseconds, row.FailureThreshold = in.Port, in.IntervalSeconds, in.TimeoutMilliseconds, in.FailureThreshold
	row.SNMPVersion, row.SNMPUsername, row.SNMPAuthProtocol, row.SNMPPrivacyProtocol = in.SNMPVersion, in.SNMPUsername, in.SNMPAuthProtocol, in.SNMPPrivacyProtocol
	if in.Enabled != nil {
		row.Enabled = *in.Enabled
	} else if creating {
		row.Enabled = true
	}
	if in.ProbeType == "snmp" {
		appCtx := GetAppContext(c)
		secret := appCtx.Config().Web.Secret
		if strings.TrimSpace(secret) == "" {
			return errors.New("web secret must be configured before storing SNMP credentials")
		}
		seal := func(value string) ([]byte, error) { return securestore.Seal(secret, []byte(value)) }
		if in.SNMPVersion == "v2c" && in.SNMPCommunity != "" {
			value, err := seal(in.SNMPCommunity)
			if err != nil {
				return err
			}
			row.SNMPCommunityEncrypted = value
		}
		if in.SNMPVersion == "v3" {
			if in.SNMPAuthPassword != "" {
				value, err := seal(in.SNMPAuthPassword)
				if err != nil {
					return err
				}
				row.SNMPAuthEncrypted = value
			}
			if in.SNMPPrivacyPassword != "" {
				value, err := seal(in.SNMPPrivacyPassword)
				if err != nil {
					return err
				}
				row.SNMPPrivacyEncrypted = value
			}
		}
	}
	return nil
}

func createMonitorTarget(c echo.Context) error {
	var targetCount int64
	if err := GetDB(c).Model(&domain.NetMonitorTarget{}).Count(&targetCount).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to validate target capacity", nil)
	}
	if targetCount >= 500 {
		return fail(c, 400, "TARGET_LIMIT", "At most 500 network monitoring targets are supported", nil)
	}
	var in monitorTargetInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_REQUEST", "Invalid target configuration", nil)
	}
	row := domain.NetMonitorTarget{}
	if err := applyMonitorInput(c, &row, in, true); err != nil {
		return fail(c, 400, "INVALID_TARGET", err.Error(), nil)
	}
	if err := GetDB(c).Create(&row).Error; err != nil {
		return fail(c, 400, "TARGET_SAVE_FAILED", "Could not save target; its name may already be used", nil)
	}
	return c.JSON(http.StatusCreated, Response{Data: toMonitorDTO(row)})
}

func updateMonitorTarget(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid target ID", nil)
	}
	var row domain.NetMonitorTarget
	if err := GetDB(c).First(&row, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Monitor target not found", nil)
	}
	var in monitorTargetInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_REQUEST", "Invalid target configuration", nil)
	}
	if err := applyMonitorInput(c, &row, in, false); err != nil {
		return fail(c, 400, "INVALID_TARGET", err.Error(), nil)
	}
	if err := GetDB(c).Save(&row).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to save monitor target", nil)
	}
	return ok(c, toMonitorDTO(row))
}

func deleteMonitorTarget(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid target ID", nil)
	}
	err = GetDB(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("target_id = ?", id).Delete(&domain.NetMonitorSample{}).Error; err != nil {
			return err
		}
		if err := tx.Where("target_id = ?", id).Delete(&domain.NetMonitorIncident{}).Error; err != nil {
			return err
		}
		return tx.Delete(&domain.NetMonitorTarget{}, id).Error
	})
	if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to remove monitor target", nil)
	}
	return ok(c, map[string]any{"id": strconv.FormatInt(id, 10)})
}

func checkMonitorTarget(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid target ID", nil)
	}
	provider, okProvider := GetAppContext(c).(app.NetworkMonitorProvider)
	if !okProvider || provider.NetworkMonitor() == nil {
		return fail(c, 503, "MONITOR_UNAVAILABLE", "Network monitor is unavailable", nil)
	}
	if err := provider.NetworkMonitor().CheckTarget(c.Request().Context(), id, time.Now()); err != nil {
		return fail(c, 400, "CHECK_FAILED", "Target check failed", nil)
	}
	var row domain.NetMonitorTarget
	if err := GetDB(c).First(&row, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Monitor target not found", nil)
	}
	return ok(c, toMonitorDTO(row))
}

func listMonitorSamples(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid target ID", nil)
	}
	page, size := parsePagination(c)
	q := GetDB(c).Model(&domain.NetMonitorSample{}).Where("target_id = ?", id)
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query samples", nil)
	}
	var rows []domain.NetMonitorSample
	if err := q.Order("checked_at DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query samples", nil)
	}
	return paged(c, rows, total, page, size)
}

func listMonitorIncidents(c echo.Context) error {
	page, size := parsePagination(c)
	q := GetDB(c).Model(&domain.NetMonitorIncident{})
	if target := c.QueryParam("target_id"); target != "" {
		q = q.Where("target_id = ?", target)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query incidents", nil)
	}
	var rows []domain.NetMonitorIncident
	if err := q.Order("started_at DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query incidents", nil)
	}
	return paged(c, rows, total, page, size)
}
