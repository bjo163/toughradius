package adminapi

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"
	"github.com/bjo163/mwx-isp/internal/domain"
)

func TestPublicBrandingDefaultsAndValidatedSave(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.ProductBranding{}))
	appCtx.Config().System.Workdir = t.TempDir()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/public/branding", nil)
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	require.NoError(t, getPublicBranding(c))
	require.Equal(t, http.StatusOK, rec.Code)
	var response struct {
		Data brandingDTO `json:"data"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.Equal(t, "MWX-ISP", response.Data.ProductName)
	require.Equal(t, "#E6FF00", response.Data.AccentColor)

	invalidReq := httptest.NewRequest(http.MethodPut, "/api/v1/system/branding", bytes.NewBufferString(`{"product_name":"Test ISP","short_name":"TEST","accent_color":"red"}`))
	invalidReq.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	invalidRec := httptest.NewRecorder()
	invalidCtx := CreateTestContext(e, db, invalidReq, invalidRec, appCtx)
	require.NoError(t, saveBranding(invalidCtx))
	require.Equal(t, http.StatusBadRequest, invalidRec.Code)
	var count int64
	require.NoError(t, db.Model(&domain.ProductBranding{}).Count(&count).Error)
	require.Zero(t, count)

	validReq := httptest.NewRequest(http.MethodPut, "/api/v1/system/branding", bytes.NewBufferString(`{"product_name":"LKIGI Network","short_name":"LKIGI","tagline":"Connectivity, clearly managed","accent_color":"#13A66B"}`))
	validReq.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	validRec := httptest.NewRecorder()
	validCtx := CreateTestContext(e, db, validReq, validRec, appCtx)
	require.NoError(t, saveBranding(validCtx))
	require.Equal(t, http.StatusOK, validRec.Code)
	require.NoError(t, json.Unmarshal(validRec.Body.Bytes(), &response))
	require.Equal(t, "LKIGI Network", response.Data.ProductName)
	require.Equal(t, "#13A66B", response.Data.AccentColor)
}

func TestBrandingLogoUploadPublicReadAndReset(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.ProductBranding{}))
	appCtx.Config().System.Workdir = t.TempDir()

	var pngBytes bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	img.Set(0, 0, color.RGBA{G: 255, A: 255})
	require.NoError(t, png.Encode(&pngBytes, img))
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{
		"product_name": "Sample ISP", "short_name": "SISP", "tagline": "Sample identity", "accent_color": "#28A86B",
	} {
		require.NoError(t, writer.WriteField(key, value))
	}
	part, err := writer.CreateFormFile("logo", "../../brand.png")
	require.NoError(t, err)
	_, err = part.Write(pngBytes.Bytes())
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	request := httptest.NewRequest(http.MethodPut, "/api/v1/system/branding", &body)
	request.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
	recorder := httptest.NewRecorder()
	ctx := CreateTestContext(e, db, request, recorder, appCtx)
	require.NoError(t, saveBranding(ctx))
	require.Equal(t, http.StatusOK, recorder.Code)
	var result struct {
		Data brandingDTO `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &result))
	require.Contains(t, result.Data.LogoURL, "/api/v1/public/branding/logo?v=")

	logoReq := httptest.NewRequest(http.MethodGet, "/api/v1/public/branding/logo", nil)
	logoRec := httptest.NewRecorder()
	logoCtx := CreateTestContext(e, db, logoReq, logoRec, appCtx)
	require.NoError(t, getPublicBrandLogo(logoCtx))
	require.Equal(t, http.StatusOK, logoRec.Code)
	require.Equal(t, "image/png", logoRec.Header().Get(echo.HeaderContentType))
	require.Equal(t, pngBytes.Bytes(), logoRec.Body.Bytes())

	var stored domain.ProductBranding
	require.NoError(t, db.First(&stored, brandingRecordID).Error)
	storedFile := filepath.Join(appCtx.Config().GetDataDir(), "branding", stored.LogoFile)
	require.FileExists(t, storedFile)

	resetReq := httptest.NewRequest(http.MethodPost, "/api/v1/system/branding/reset", nil)
	resetRec := httptest.NewRecorder()
	resetCtx := CreateTestContext(e, db, resetReq, resetRec, appCtx)
	require.NoError(t, resetBranding(resetCtx))
	require.Equal(t, http.StatusOK, resetRec.Code)
	require.NoFileExists(t, storedFile)
	_, statErr := os.Stat(storedFile)
	require.ErrorIs(t, statErr, os.ErrNotExist)
	defaultReq := httptest.NewRequest(http.MethodGet, "/api/v1/public/branding", nil)
	defaultRec := httptest.NewRecorder()
	defaultCtx := CreateTestContext(e, db, defaultReq, defaultRec, appCtx)
	require.NoError(t, getPublicBranding(defaultCtx))
	var defaultResult struct {
		Data brandingDTO `json:"data"`
	}
	require.NoError(t, json.Unmarshal(defaultRec.Body.Bytes(), &defaultResult))
	require.Equal(t, "MWX-ISP", defaultResult.Data.ProductName)
	require.Empty(t, defaultResult.Data.LogoURL)
}

func TestBrandingMutationRequiresAdmin(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.ProductBranding{}))
	req := httptest.NewRequest(http.MethodPost, "/api/v1/system/branding/reset", nil)
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	c.Set("current_operator", &domain.SysOpr{Level: LevelOperator, Status: "enabled"})
	handler := requireAdmin()(resetBranding)
	require.NoError(t, handler(c))
	require.Equal(t, http.StatusForbidden, rec.Code)
	var count int64
	require.NoError(t, db.Model(&domain.ProductBranding{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestBrandingRejectsInvalidLogoUpload(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.ProductBranding{}))
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{
		"product_name": "Sample ISP", "short_name": "SISP", "tagline": "Sample identity", "accent_color": "#28A86B",
	} {
		require.NoError(t, writer.WriteField(key, value))
	}
	part, err := writer.CreateFormFile("logo", "logo.svg")
	require.NoError(t, err)
	_, err = part.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`))
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	req := httptest.NewRequest(http.MethodPut, "/api/v1/system/branding", &body)
	req.Header.Set(echo.HeaderContentType, writer.FormDataContentType())
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	require.NoError(t, saveBranding(c))
	require.Equal(t, http.StatusBadRequest, rec.Code)
	var count int64
	require.NoError(t, db.Model(&domain.ProductBranding{}).Count(&count).Error)
	require.Zero(t, count)
}
