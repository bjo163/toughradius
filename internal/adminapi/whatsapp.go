package adminapi

import (
    "fmt"
    "net/http"
    "strings"

    "github.com/labstack/echo/v4"
    "github.com/talkincode/toughradius/v9/internal/domain"
    "github.com/talkincode/toughradius/v9/internal/whatsapp"
    "github.com/talkincode/toughradius/v9/internal/webserver"
    "go.uber.org/zap"
)

func registerWhatsAppRoutes() {
    webserver.ApiGET("/whatsapp/qr", getWhatsAppQR)
    webserver.ApiPOST("/whatsapp/connect", postWhatsAppConnect)
    webserver.ApiPOST("/whatsapp/send", postWhatsAppSend)
    webserver.ApiGET("/whatsapp/status", getWhatsAppStatus)
    webserver.ApiGET("/whatsapp/devices", listWhatsAppDevices)
    webserver.ApiPOST("/whatsapp/devices", postWhatsAppCreateDevice)
    webserver.ApiPOST("/whatsapp/devices/:jid/connect", postWhatsAppConnectDevice)
    webserver.ApiGET("/whatsapp/app/devices", listAppWhatsAppDevices)
    webserver.ApiGET("/whatsapp/devices/:id/qr", getWhatsAppDeviceQR)
    webserver.ApiPOST("/whatsapp/app/devices/:id/connect", postWhatsAppConnectAppDevice)
    webserver.ApiPOST("/whatsapp/app/devices/:id/provision", postWhatsAppProvisionAppDevice)
    webserver.ApiPOST("/whatsapp/app/devices/:id/persist", postWhatsAppPersistAppDevice)
    webserver.ApiPOST("/whatsapp/app/devices/:id/disconnect", postWhatsAppDisconnectAppDevice)
    webserver.ApiPOST("/whatsapp/app/devices/:id/remove", postWhatsAppRemoveAppDevice)
    webserver.ApiPOST("/whatsapp/send/app/:id", postWhatsAppSendFromAppDevice)
}

// getWhatsAppQR returns the latest QR code string (if any). The frontend
// should render the QR client-side (e.g. using a JS QR library) from this
// string value.
func getWhatsAppQR(c echo.Context) error {
    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }
    code := svc.GetQRCode()
    resp := map[string]interface{}{
        "code":   code,
        "has_qr": code != "",
    }
    return ok(c, resp)
}

// postWhatsAppConnect triggers a connect attempt (non-blocking). It is
// useful to request a fresh QR to be emitted by the whatsmeow client.
func postWhatsAppConnect(c echo.Context) error {
    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }
    // trigger a connect in background; any QR event will be captured by
    // the service's event handler and exposed via GET /whatsapp/qr
    svc.ConnectAsync()
    zap.L().Info("adminapi: triggered whatsapp connect")
    return ok(c, map[string]interface{}{"started": true})
}

// postWhatsAppSend sends a text message via the running WhatsApp client.
// Request JSON: { "jid": "62812xxxx@s.whatsapp.net", "text": "hello" }
func postWhatsAppSend(c echo.Context) error {
    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }

    var payload struct {
        FromJid string `json:"from_jid"`
        Jid     string `json:"jid"`
        Text    string `json:"text"`
    }
    if err := c.Bind(&payload); err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse request", err.Error())
    }
    if payload.Jid == "" || payload.Text == "" {
        return fail(c, http.StatusBadRequest, "MISSING_FIELDS", "jid and text are required", nil)
    }

    if payload.FromJid != "" {
        if err := svc.SendTextFrom(c.Request().Context(), payload.FromJid, payload.Jid, payload.Text); err != nil {
            return fail(c, http.StatusInternalServerError, "SEND_FAILED", "Failed to send message", err.Error())
        }
    } else {
        if err := svc.SendText(c.Request().Context(), payload.Jid, payload.Text); err != nil {
            return fail(c, http.StatusInternalServerError, "SEND_FAILED", "Failed to send message", err.Error())
        }
    }
    return ok(c, map[string]interface{}{"sent": true})
}

// listWhatsAppDevices returns configured devices (JID and whether an in-memory client exists)
func listWhatsAppDevices(c echo.Context) error {
    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }
    devs, err := svc.ListDevices(c.Request().Context())
    if err != nil {
        zap.L().Warn("adminapi: list devices failed", zap.Error(err))
        return fail(c, http.StatusInternalServerError, "LIST_FAILED", "Failed to list devices", err.Error())
    }
    return ok(c, map[string]interface{}{"devices": devs})
}

// postWhatsAppCreateDevice creates a new device entry. Currently not implemented server-side.
func postWhatsAppCreateDevice(c echo.Context) error {
    var payload struct {
        NodeID string `json:"node_id"`
        Phone  string `json:"phone"`
        Name   string `json:"name"`
    }
    if err := c.Bind(&payload); err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse request", err.Error())
    }
    if payload.NodeID == "" || payload.Phone == "" || payload.Name == "" {
        return fail(c, http.StatusBadRequest, "MISSING_FIELDS", "node_id, phone and name are required", nil)
    }
    svc := whatsapp.Get()
    // If the whatsmeow-backed service is not initialized we still allow creating
    // an application-level WhatsAppDevice record so admins can prepare devices in
    // the database and pair them later when the service becomes available.
    if svc == nil {
        // create DB-only record
        var nid int64
        if _, err := fmt.Sscan(payload.NodeID, &nid); err != nil || nid == 0 {
            return fail(c, http.StatusBadRequest, "INVALID_NODE_ID", "Invalid node id", nil)
        }
        wad := &domain.WhatsAppDevice{
            NodeId: nid,
            Phone:  payload.Phone,
            Name:   payload.Name,
            Status: "created",
        }
        if err := GetDB(c).Create(wad).Error; err != nil {
            zap.L().Warn("adminapi: create app whatsapp device failed (db-only)", zap.Error(err))
            return fail(c, http.StatusInternalServerError, "CREATE_FAILED", "Failed to create device (db)", err.Error())
        }
        return ok(c, map[string]interface{}{"id": wad.ID})
    }

    id, err := svc.CreateDevice(c.Request().Context(), payload.NodeID, payload.Phone, payload.Name)
    if err != nil {
        return fail(c, http.StatusInternalServerError, "CREATE_FAILED", "Failed to create device", err.Error())
    }
    return ok(c, map[string]interface{}{"id": id})
}

// postWhatsAppConnectDevice triggers a connect for the specified device jid
func postWhatsAppConnectDevice(c echo.Context) error {
    jid := c.Param("jid")
    if jid == "" {
        return fail(c, http.StatusBadRequest, "MISSING_FIELDS", "jid required", nil)
    }
    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }
    if err := svc.ConnectDevice(jid); err != nil {
        return fail(c, http.StatusInternalServerError, "CONNECT_FAILED", "Failed to connect device", err.Error())
    }
    return ok(c, map[string]interface{}{"started": true})
}

// listAppWhatsAppDevices returns application-level WhatsAppDevice records
func listAppWhatsAppDevices(c echo.Context) error {
    var devs []domain.WhatsAppDevice
    if err := GetDB(c).Order("id DESC").Find(&devs).Error; err != nil {
        zap.L().Warn("adminapi: list app devices failed", zap.Error(err))
        return fail(c, http.StatusInternalServerError, "LIST_FAILED", "Failed to list devices", err.Error())
    }
    return ok(c, map[string]interface{}{"devices": devs})
}

// getWhatsAppDeviceQR returns the current QR code for the application device id (if any)
func getWhatsAppDeviceQR(c echo.Context) error {
    idStr := c.Param("id")
    var id int64
    if _, err := fmt.Sscan(idStr, &id); err != nil || id == 0 {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid device id", nil)
    }
    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }
    // First try per-device mapped QR (preferred)
    code := svc.GetDeviceQRCode(id)
    usedFallback := false
    if code == "" {
        // Fallback: use generic last QR (may include a prefix 'jid|code')
        fallback := svc.GetQRCode()
        if fallback != "" {
            usedFallback = true
            // If stored as 'jid|code', extract the code part
            if idx := strings.Index(fallback, "|"); idx >= 0 && idx+1 < len(fallback) {
                code = fallback[idx+1:]
            } else {
                code = fallback
            }
        }
    }

    // Log query and result for debugging
    if code != "" {
        zap.L().Info("adminapi: getWhatsAppDeviceQR", zap.Int64("id", id), zap.Bool("used_fallback", usedFallback), zap.Int("code_len", len(code)))
    } else {
        zap.L().Info("adminapi: getWhatsAppDeviceQR - no QR available", zap.Int64("id", id), zap.Bool("used_fallback", usedFallback))
    }

    return ok(c, map[string]interface{}{"code": code, "has_qr": code != ""})
}

// postWhatsAppConnectAppDevice triggers connect for application device id
func postWhatsAppConnectAppDevice(c echo.Context) error {
    idStr := c.Param("id")
    var id int64
    if _, err := fmt.Sscan(idStr, &id); err != nil || id == 0 {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid device id", nil)
    }
    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }
    if err := svc.ConnectDeviceByAppID(id); err != nil {
        return fail(c, http.StatusInternalServerError, "CONNECT_FAILED", "Failed to connect device", err.Error())
    }
    return ok(c, map[string]interface{}{"started": true})
}

// postWhatsAppSendFromAppDevice sends a text message using an application-level WhatsApp device id.
// Path: POST /whatsapp/send/app/:id
// Body JSON: { "jid": "recipient_jid", "text": "message body" }
func postWhatsAppSendFromAppDevice(c echo.Context) error {
    idStr := c.Param("id")
    var id int64
    if _, err := fmt.Sscan(idStr, &id); err != nil || id == 0 {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid device id", nil)
    }

    var payload struct {
        Jid  string `json:"jid"`
        Text string `json:"text"`
    }
    if err := c.Bind(&payload); err != nil {
        return fail(c, http.StatusBadRequest, "INVALID_REQUEST", "Unable to parse request", err.Error())
    }
    if payload.Jid == "" || payload.Text == "" {
        return fail(c, http.StatusBadRequest, "MISSING_FIELDS", "jid and text are required", nil)
    }

    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }

    var wad domain.WhatsAppDevice
    if err := GetDB(c).Where("id = ?", id).First(&wad).Error; err != nil {
        zap.L().Warn("adminapi: lookup app whatsapp device failed", zap.Error(err))
        return fail(c, http.StatusNotFound, "DEVICE_NOT_FOUND", "App device not found", err.Error())
    }
    if wad.Jid == "" {
        return fail(c, http.StatusBadRequest, "DEVICE_NOT_PAIRED", "Device has not completed pairing (no JID)", nil)
    }

    if err := svc.SendTextFrom(c.Request().Context(), wad.Jid, payload.Jid, payload.Text); err != nil {
        return fail(c, http.StatusInternalServerError, "SEND_FAILED", "Failed to send message", err.Error())
    }
    return ok(c, map[string]interface{}{"sent": true})
}

// postWhatsAppProvisionAppDevice provisions an existing application-level WhatsAppDevice
// into the whatsmeow sqlstore and starts pairing/connect.
func postWhatsAppProvisionAppDevice(c echo.Context) error {
    idStr := c.Param("id")
    var id int64
    if _, err := fmt.Sscan(idStr, &id); err != nil || id == 0 {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid device id", nil)
    }
    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }
    if err := svc.ProvisionAppDevice(c.Request().Context(), id); err != nil {
        zap.L().Warn("adminapi: provision app device failed", zap.Error(err), zap.Int64("id", id))
        return fail(c, http.StatusInternalServerError, "PROVISION_FAILED", "Failed to provision device", err.Error())
    }
    return ok(c, map[string]interface{}{"started": true})
}

// postWhatsAppPersistAppDevice attempts to persist an in-memory whatsmeow
// client for the given application device id into sqlstore. This helps when
// initial persistence failed but an in-memory client later completed pairing.
func postWhatsAppPersistAppDevice(c echo.Context) error {
    idStr := c.Param("id")
    var id int64
    if _, err := fmt.Sscan(idStr, &id); err != nil || id == 0 {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid device id", nil)
    }
    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }
    if err := svc.PersistAppClient(c.Request().Context(), id); err != nil {
        zap.L().Warn("adminapi: persist app device failed", zap.Error(err), zap.Int64("id", id))
        return fail(c, http.StatusInternalServerError, "PERSIST_FAILED", "Failed to persist device", err.Error())
    }
    return ok(c, map[string]interface{}{"persisted": true})
}

// postWhatsAppDisconnectAppDevice disconnects an in-memory client for the given app device id
func postWhatsAppDisconnectAppDevice(c echo.Context) error {
    idStr := c.Param("id")
    var id int64
    if _, err := fmt.Sscan(idStr, &id); err != nil || id == 0 {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid device id", nil)
    }
    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }
    if err := svc.DisconnectDeviceByAppID(id); err != nil {
        zap.L().Warn("adminapi: disconnect app device failed", zap.Error(err), zap.Int64("id", id))
        return fail(c, http.StatusInternalServerError, "DISCONNECT_FAILED", "Failed to disconnect device", err.Error())
    }
    return ok(c, map[string]interface{}{"disconnected": true})
}

// postWhatsAppRemoveAppDevice deletes the application-level WhatsAppDevice record
func postWhatsAppRemoveAppDevice(c echo.Context) error {
    idStr := c.Param("id")
    var id int64
    if _, err := fmt.Sscan(idStr, &id); err != nil || id == 0 {
        return fail(c, http.StatusBadRequest, "INVALID_ID", "Invalid device id", nil)
    }
    svc := whatsapp.Get()
    if svc == nil {
        return fail(c, http.StatusServiceUnavailable, "WA_NOT_INITIALIZED", "WhatsApp service not initialized", nil)
    }
    // optional query parameter to also attempt deletion of the persisted whatsmeow store device
    q := strings.ToLower(strings.TrimSpace(c.QueryParam("delete_store")))
    deleteStore := q == "1" || q == "true" || q == "yes"
    // Audit log: record remote address and a masked snippet of the Authorization header
    auth := c.Request().Header.Get("Authorization")
    authSnippet := ""
    if auth != "" {
        if len(auth) > 20 {
            authSnippet = auth[:20] + "..."
        } else {
            authSnippet = auth
        }
    }
    zap.L().Info("adminapi: remove app device requested", zap.Int64("id", id), zap.Bool("delete_store", deleteStore), zap.String("remote_addr", c.Request().RemoteAddr), zap.String("auth_snippet", authSnippet))

    if err := svc.RemoveAppDevice(c.Request().Context(), id, deleteStore); err != nil {
        zap.L().Warn("adminapi: remove app device failed", zap.Error(err), zap.Int64("id", id), zap.Bool("delete_store", deleteStore))
        return fail(c, http.StatusInternalServerError, "REMOVE_FAILED", "Failed to remove device", err.Error())
    }
    return ok(c, map[string]interface{}{"removed": true})
}

// getWhatsAppStatus returns basic runtime status (connected, jid)
func getWhatsAppStatus(c echo.Context) error {
    svc := whatsapp.Get()
    if svc == nil {
        return ok(c, map[string]interface{}{"initialized": false})
    }
    // best-effort: get stored id if available via exported helper
    jid := svc.GetStoredJIDString()
    var id interface{} = nil
    if jid != "" {
        id = jid
    }
    return ok(c, map[string]interface{}{"initialized": true, "jid": id})
}
