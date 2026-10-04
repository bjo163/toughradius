package adminapi

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/webserver"
	"gorm.io/gorm"
)

const (
	brandingRecordID = 1
	maxBrandLogoSize = 1 << 20
)

var brandLogoNamePattern = regexp.MustCompile(`^logo-[a-f0-9]{32}\.png$`)
var brandingAccentPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type brandingInput struct {
	ProductName     string `json:"product_name"`
	ShortName       string `json:"short_name"`
	Tagline         string `json:"tagline"`
	AccentColor     string `json:"accent_color"`
	RemoveLogo      bool   `json:"remove_logo"`
	HeroHeadline    string `json:"hero_headline"`
	HeroSubtitle    string `json:"hero_subtitle"`
	TickerText      string `json:"ticker_text"`
	ContactPhone    string `json:"contact_phone"`
	ContactWhatsApp string `json:"contact_whatsapp"`
	ContactEmail    string `json:"contact_email"`
	ContactAddress  string `json:"contact_address"`
	CoverageAreas   string `json:"coverage_areas"`
	SlaUptime       string `json:"sla_uptime"`
	SlaLatency      string `json:"sla_latency"`
}

type brandingDTO struct {
	ProductName     string    `json:"product_name"`
	ShortName       string    `json:"short_name"`
	Tagline         string    `json:"tagline"`
	AccentColor     string    `json:"accent_color"`
	LogoURL         string    `json:"logo_url,omitempty"`
	HeroHeadline    string    `json:"hero_headline"`
	HeroSubtitle    string    `json:"hero_subtitle"`
	TickerText      string    `json:"ticker_text"`
	ContactPhone    string    `json:"contact_phone"`
	ContactWhatsApp string    `json:"contact_whatsapp"`
	ContactEmail    string    `json:"contact_email"`
	ContactAddress  string    `json:"contact_address"`
	CoverageAreas   string    `json:"coverage_areas"`
	SlaUptime       string    `json:"sla_uptime"`
	SlaLatency      string    `json:"sla_latency"`
	UpdatedAt       time.Time `json:"updated_at,omitempty"`
}

func registerBrandingRoutes() {
	webserver.ApiGET("/public/branding", getPublicBranding)
	webserver.ApiGET("/public/branding/logo", getPublicBrandLogo)
	webserver.ApiGET("/system/branding", getPublicBranding, requirePlatformAdmin())
	webserver.ApiPUT("/system/branding", saveBranding, requirePlatformAdmin())
	webserver.ApiPOST("/system/branding/reset", resetBranding, requirePlatformAdmin())
}

func defaultBranding() domain.ProductBranding {
	return domain.ProductBranding{
		ID:              brandingRecordID,
		ProductName:     "MWX-ISP",
		ShortName:       "MWX",
		Tagline:         "ISP Management + RADIUS + Billing",
		AccentColor:     "#16A34A",
		HeroHeadline:    "Internet Simetris, Stabil & Bergaransi SLA 99.98%",
		HeroSubtitle:    "Solusi jaringan backbone terpercaya untuk perumahan, perkantoran, instansi dan hotspot publik. Didukung multi-homed BGP routing, redundansi GPON optical ring, dan pemantauan NOC aktif 24 jam nonstop.",
		TickerText:      "[ NOC LIVE STATUS ] Semua gateway BGP & GPON OLT beroperasi optimal | Bantuan 24/7 Hotline & WhatsApp Ready | Peering: OpenIXP, CDIX, Cloudflare, Google Edge",
		ContactPhone:    "+62 21 5550 1234",
		ContactWhatsApp: "6281234567890",
		ContactEmail:    "noc@mwx-isp.net",
		ContactAddress:  "Cyber Building 1, Lt. 5, Jl. Kuningan Barat No. 8, Jakarta Selatan",
		CoverageAreas:   "Jakarta, Tangerang, Bekasi, Depok, Bogor, Bandung, Surabaya",
		SlaUptime:       "99.98%",
		SlaLatency:      "< 5 ms",
	}
}

func loadBranding(db *gorm.DB) (domain.ProductBranding, error) {
	row := defaultBranding()
	err := db.First(&row, brandingRecordID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return defaultBranding(), nil
	}
	return row, err
}

func toBrandingDTO(row domain.ProductBranding) brandingDTO {
	def := defaultBranding()
	heroHeadline := row.HeroHeadline
	if heroHeadline == "" {
		heroHeadline = def.HeroHeadline
	}
	heroSubtitle := row.HeroSubtitle
	if heroSubtitle == "" {
		heroSubtitle = def.HeroSubtitle
	}
	tickerText := row.TickerText
	if tickerText == "" {
		tickerText = def.TickerText
	}
	contactPhone := row.ContactPhone
	if contactPhone == "" {
		contactPhone = def.ContactPhone
	}
	contactWhatsApp := row.ContactWhatsApp
	if contactWhatsApp == "" {
		contactWhatsApp = def.ContactWhatsApp
	}
	contactEmail := row.ContactEmail
	if contactEmail == "" {
		contactEmail = def.ContactEmail
	}
	contactAddress := row.ContactAddress
	if contactAddress == "" {
		contactAddress = def.ContactAddress
	}
	coverageAreas := row.CoverageAreas
	if coverageAreas == "" {
		coverageAreas = def.CoverageAreas
	}
	slaUptime := row.SlaUptime
	if slaUptime == "" {
		slaUptime = def.SlaUptime
	}
	slaLatency := row.SlaLatency
	if slaLatency == "" {
		slaLatency = def.SlaLatency
	}

	result := brandingDTO{
		ProductName:     row.ProductName,
		ShortName:       row.ShortName,
		Tagline:         row.Tagline,
		AccentColor:     row.AccentColor,
		HeroHeadline:    heroHeadline,
		HeroSubtitle:    heroSubtitle,
		TickerText:      tickerText,
		ContactPhone:    contactPhone,
		ContactWhatsApp: contactWhatsApp,
		ContactEmail:    contactEmail,
		ContactAddress:  contactAddress,
		CoverageAreas:   coverageAreas,
		SlaUptime:       slaUptime,
		SlaLatency:      slaLatency,
		UpdatedAt:       row.UpdatedAt,
	}
	if row.LogoFile != "" {
		result.LogoURL = "/api/v1/public/branding/logo?v=" + fmt.Sprint(row.UpdatedAt.UnixNano())
	}
	return result
}

func getPublicBranding(c echo.Context) error {
	row, err := loadBranding(GetDB(c))
	if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to load product branding", err.Error())
	}
	return ok(c, toBrandingDTO(row))
}

func getPublicBrandLogo(c echo.Context) error {
	row, err := loadBranding(GetDB(c))
	if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to load product branding", err.Error())
	}
	if !brandLogoNamePattern.MatchString(row.LogoFile) {
		return fail(c, http.StatusNotFound, "LOGO_NOT_FOUND", "Product logo is not configured", nil)
	}
	logoPath := filepath.Join(GetAppContext(c).Config().GetDataDir(), "branding", row.LogoFile)
	// LogoFile is a generated, regex-validated basename rooted under data dir.
	content, err := os.ReadFile(logoPath) //nolint:gosec // G304: validated generated logo basename.
	if errors.Is(err, os.ErrNotExist) {
		return fail(c, http.StatusNotFound, "LOGO_NOT_FOUND", "Product logo is not available", nil)
	}
	if err != nil {
		return fail(c, http.StatusInternalServerError, "LOGO_READ_FAILED", "Failed to load product logo", err.Error())
	}
	c.Response().Header().Set(echo.HeaderCacheControl, "public, max-age=3600")
	c.Response().Header().Set(echo.HeaderXContentTypeOptions, "nosniff")
	return c.Blob(http.StatusOK, "image/png", content)
}

func saveBranding(c echo.Context) error {
	c.Request().Body = http.MaxBytesReader(c.Response().Writer, c.Request().Body, maxBrandLogoSize+(64<<10))
	var input brandingInput
	var logo []byte
	if strings.HasPrefix(strings.ToLower(c.Request().Header.Get(echo.HeaderContentType)), echo.MIMEApplicationJSON) {
		if err := json.NewDecoder(c.Request().Body).Decode(&input); err != nil {
			return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse branding settings", nil)
		}
	} else {
		if err := c.Request().ParseMultipartForm(64 << 10); err != nil {
			return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse branding form", nil)
		}
		if c.Request().MultipartForm != nil {
			defer func() { _ = c.Request().MultipartForm.RemoveAll() }()
		}
		input.ProductName = c.FormValue("product_name")
		input.ShortName = c.FormValue("short_name")
		input.Tagline = c.FormValue("tagline")
		input.AccentColor = c.FormValue("accent_color")
		input.HeroHeadline = c.FormValue("hero_headline")
		input.HeroSubtitle = c.FormValue("hero_subtitle")
		input.TickerText = c.FormValue("ticker_text")
		input.ContactPhone = c.FormValue("contact_phone")
		input.ContactWhatsApp = c.FormValue("contact_whatsapp")
		input.ContactEmail = c.FormValue("contact_email")
		input.ContactAddress = c.FormValue("contact_address")
		input.CoverageAreas = c.FormValue("coverage_areas")
		input.SlaUptime = c.FormValue("sla_uptime")
		input.SlaLatency = c.FormValue("sla_latency")
		input.RemoveLogo = strings.EqualFold(c.FormValue("remove_logo"), "true")
		if file, _, err := c.Request().FormFile("logo"); err == nil {
			defer func() { _ = file.Close() }()
			logo, err = readBrandLogo(file)
			if err != nil {
				return fail(c, http.StatusBadRequest, "INVALID_LOGO", err.Error(), nil)
			}
		} else if !errors.Is(err, http.ErrMissingFile) {
			return fail(c, http.StatusBadRequest, "INVALID_LOGO", "Unable to read uploaded logo", nil)
		}
	}
	if input.RemoveLogo && len(logo) > 0 {
		return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Choose either a new logo or remove the current logo", nil)
	}
	if err := validateBrandingInput(&input); err != nil {
		return fail(c, http.StatusBadRequest, "INVALID_BRANDING", err.Error(), nil)
	}

	newLogo := ""
	if len(logo) > 0 {
		filename, err := writeBrandLogo(GetAppContext(c).Config().GetDataDir(), logo)
		if err != nil {
			return fail(c, http.StatusInternalServerError, "LOGO_WRITE_FAILED", "Could not store product logo", err.Error())
		}
		newLogo = filename
	}

	var oldLogo string
	var updated domain.ProductBranding
	err := GetDB(c).Transaction(func(tx *gorm.DB) error {
		row, err := loadBranding(tx)
		if err != nil {
			return err
		}
		oldLogo = row.LogoFile
		row.ProductName = input.ProductName
		row.ShortName = input.ShortName
		row.Tagline = input.Tagline
		row.AccentColor = strings.ToUpper(input.AccentColor)
		if input.HeroHeadline != "" {
			row.HeroHeadline = strings.TrimSpace(input.HeroHeadline)
		}
		if input.HeroSubtitle != "" {
			row.HeroSubtitle = strings.TrimSpace(input.HeroSubtitle)
		}
		if input.TickerText != "" {
			row.TickerText = strings.TrimSpace(input.TickerText)
		}
		if input.ContactPhone != "" {
			row.ContactPhone = strings.TrimSpace(input.ContactPhone)
		}
		if input.ContactWhatsApp != "" {
			row.ContactWhatsApp = strings.TrimSpace(input.ContactWhatsApp)
		}
		if input.ContactEmail != "" {
			row.ContactEmail = strings.TrimSpace(input.ContactEmail)
		}
		if input.ContactAddress != "" {
			row.ContactAddress = strings.TrimSpace(input.ContactAddress)
		}
		if input.CoverageAreas != "" {
			row.CoverageAreas = strings.TrimSpace(input.CoverageAreas)
		}
		if input.SlaUptime != "" {
			row.SlaUptime = strings.TrimSpace(input.SlaUptime)
		}
		if input.SlaLatency != "" {
			row.SlaLatency = strings.TrimSpace(input.SlaLatency)
		}
		if newLogo != "" {
			row.LogoFile = newLogo
		} else if input.RemoveLogo {
			row.LogoFile = ""
		}
		row.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&row).Error; err != nil {
			return err
		}
		updated = row
		return nil
	})
	if err != nil {
		removeBrandLogo(GetAppContext(c).Config().GetDataDir(), newLogo)
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to save product branding", err.Error())
	}
	if (newLogo != "" || input.RemoveLogo) && oldLogo != "" && oldLogo != newLogo {
		removeBrandLogo(GetAppContext(c).Config().GetDataDir(), oldLogo)
	}
	return c.JSON(http.StatusOK, Response{Data: toBrandingDTO(updated)})
}

func resetBranding(c echo.Context) error {
	row, err := loadBranding(GetDB(c))
	if err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to load product branding", err.Error())
	}
	if err := GetDB(c).Delete(&domain.ProductBranding{}, brandingRecordID).Error; err != nil {
		return fail(c, http.StatusInternalServerError, "DATABASE_ERROR", "Failed to reset product branding", err.Error())
	}
	removeBrandLogo(GetAppContext(c).Config().GetDataDir(), row.LogoFile)
	return ok(c, toBrandingDTO(defaultBranding()))
}

func validateBrandingInput(input *brandingInput) error {
	input.ProductName = strings.TrimSpace(input.ProductName)
	input.ShortName = strings.TrimSpace(input.ShortName)
	input.Tagline = strings.TrimSpace(input.Tagline)
	input.AccentColor = strings.TrimSpace(input.AccentColor)
	if input.ProductName == "" || len(input.ProductName) > 60 {
		return errors.New("product name must contain 1 to 60 bytes")
	}
	if input.ShortName == "" || len(input.ShortName) > 8 {
		return errors.New("short name must contain 1 to 8 bytes")
	}
	if len(input.Tagline) > 120 {
		return errors.New("tagline must not exceed 120 bytes")
	}
	if !brandingAccentPattern.MatchString(input.AccentColor) {
		return errors.New("accent color must be a six-digit hex color such as #E6FF00")
	}
	return nil
}

func readBrandLogo(file io.Reader) ([]byte, error) {
	content, err := io.ReadAll(io.LimitReader(file, maxBrandLogoSize+1))
	if err != nil {
		return nil, err
	}
	if len(content) == 0 || len(content) > maxBrandLogoSize {
		return nil, errors.New("logo file must be between 1 byte and 1 MiB")
	}
	config, err := png.DecodeConfig(bytes.NewReader(content))
	if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 2048 || config.Height > 2048 {
		return nil, errors.New("logo must be a valid PNG no larger than 2048 by 2048 pixels")
	}
	return content, nil
}

func writeBrandLogo(dataDir string, content []byte) (string, error) {
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", err
	}
	filename := "logo-" + hex.EncodeToString(random[:]) + ".png"
	directory := filepath.Join(dataDir, "branding")
	if err := os.MkdirAll(directory, 0o750); err != nil {
		return "", err
	}
	temporary := filepath.Join(directory, filename+".tmp")
	if err := os.WriteFile(temporary, content, 0o600); err != nil {
		return "", err
	}
	if err := os.Rename(temporary, filepath.Join(directory, filename)); err != nil {
		_ = os.Remove(temporary)
		return "", err
	}
	return filename, nil
}

func removeBrandLogo(dataDir, filename string) {
	if !brandLogoNamePattern.MatchString(filename) {
		return
	}
	_ = os.Remove(filepath.Join(dataDir, "branding", filename))
}
