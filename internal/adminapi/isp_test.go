package adminapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/bjo163/mwx-isp/internal/domain"
)

func TestPackageCodeIsGeneratedAndStableOnEdit(t *testing.T) {
	db, e, appCtx := CreateTestAppContext(t)
	require.NoError(t, db.AutoMigrate(&domain.InternetPackage{}, &domain.Subscription{}, &domain.Invoice{}))
	profile := domain.RadiusProfile{Name: "Base profile", Status: "enabled"}
	require.NoError(t, db.Create(&profile).Error)

	create := func(name string) domain.InternetPackage {
		body := fmt.Sprintf(`{"name":%q,"price":100000,"radius_profile_id":"%d"}`, name, profile.ID)
		req := httptest.NewRequest(http.MethodPost, "/isp/packages", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		c := CreateTestContext(e, db, req, rec, appCtx)
		require.NoError(t, createPackage(c))
		require.Equal(t, http.StatusCreated, rec.Code)
		var response struct {
			Data domain.InternetPackage `json:"data"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
		return response.Data
	}

	first := create("Home 100")
	second := create("Home 200")
	require.Equal(t, "PKG-000001", first.Code)
	require.Equal(t, "PKG-000002", second.Code)

	body := fmt.Sprintf(`{"name":"Updated package","price":120000,"radius_profile_id":"%d"}`, profile.ID)
	req := httptest.NewRequest(http.MethodPut, "/isp/packages/1", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	c := CreateTestContext(e, db, req, rec, appCtx)
	c.SetParamNames("id")
	c.SetParamValues("1")
	require.NoError(t, updatePackage(c))

	var updated domain.InternetPackage
	require.NoError(t, db.First(&updated, first.ID).Error)
	require.Equal(t, "PKG-000001", updated.Code)
	require.Equal(t, "Updated package", updated.Name)
}
