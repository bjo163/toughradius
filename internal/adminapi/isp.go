package adminapi

import (
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/bjo163/mwx-isp/internal/app"
	"github.com/bjo163/mwx-isp/internal/billing"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/notify"
	"github.com/bjo163/mwx-isp/internal/radiusd"
	"github.com/bjo163/mwx-isp/internal/radiusd/vendors/mikrotik"
	"github.com/bjo163/mwx-isp/internal/webserver"
	"github.com/bjo163/mwx-isp/pkg/common"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"layeh.com/radius"
)

type customerInput struct {
	Name       string  `json:"name" validate:"required,max=150"`
	Phone      string  `json:"phone" validate:"omitempty,max=32"`
	Email      string  `json:"email" validate:"omitempty,email,max=150"`
	Address    string  `json:"address" validate:"omitempty,max=500"`
	City       string  `json:"city" validate:"omitempty,max=100"`
	Province   string  `json:"province" validate:"omitempty,max=100"`
	IdentityNo string  `json:"identity_no" validate:"omitempty,max=100"`
	Status     string  `json:"status" validate:"omitempty,oneof=active inactive suspended terminated"`
	Notes      string  `json:"notes" validate:"omitempty,max=1000"`
	ODPID      int64   `json:"odp_id,string"`
	ODPCode    string  `json:"odp_code"`
	ODPPort    int     `json:"odp_port"`
	Latitude   float64 `json:"latitude"`
	Longitude  float64 `json:"longitude"`
}

type packageInput struct {
	Code            string `json:"code" validate:"omitempty,max=40"`
	Name            string `json:"name" validate:"required,max=150"`
	Price           int64  `json:"price" validate:"gte=0"`
	RadiusProfileID int64  `json:"radius_profile_id,string" validate:"required,gt=0"`
	Description     string `json:"description" validate:"omitempty,max=1000"`
	BillingCycle    string `json:"billing_cycle" validate:"omitempty,oneof=monthly"`
	FupLimitGB      int64  `json:"fup_limit_gb" validate:"gte=0"`
	FupRateDown     int    `json:"fup_rate_down" validate:"gte=0"`
	FupRateUp       int    `json:"fup_rate_up" validate:"gte=0"`
	Status          string `json:"status" validate:"omitempty,oneof=active inactive"`
}

type subscriptionInput struct {
	CustomerID   int64     `json:"customer_id,string" validate:"required,gt=0"`
	PackageID    int64     `json:"package_id,string" validate:"required,gt=0"`
	RadiusUserID string    `json:"radius_user_id"`
	Username     string    `json:"username" validate:"omitempty,min=3,max=50"`
	Password     string    `json:"password" validate:"omitempty,min=6,max=128"`
	Status       string    `json:"status" validate:"omitempty,oneof=pending active"`
	StartDate    time.Time `json:"start_date"`
	BillingDay   *int      `json:"billing_day" validate:"omitempty,gte=1,lte=28"`
	GraceDays    *int      `json:"grace_days" validate:"omitempty,gte=0,lte=60"`
}

type paymentInput struct {
	InvoiceID int64  `json:"invoice_id,string" validate:"required,gt=0"`
	Amount    int64  `json:"amount" validate:"required,gt=0"`
	Method    string `json:"method" validate:"required,oneof=cash bank_transfer manual other"`
	Reference string `json:"reference" validate:"omitempty,max=150"`
	Notes     string `json:"notes" validate:"omitempty,max=1000"`
}

func registerISPRoutes() {
	admin := requireAdmin()
	webserver.ApiGET("/isp/customers", listCustomers)
	webserver.ApiGET("/isp/customers/:id", getCustomer)
	webserver.ApiPOST("/isp/customers", createCustomer, admin)
	webserver.ApiPUT("/isp/customers/:id", updateCustomer, admin)
	webserver.ApiDELETE("/isp/customers/:id", deleteCustomer, admin)
	webserver.ApiGET("/isp/packages", listPackages)
	webserver.ApiGET("/isp/packages/:id", getPackage)
	webserver.ApiPOST("/isp/packages", createPackage, admin)
	webserver.ApiPUT("/isp/packages/:id", updatePackage, admin)
	webserver.ApiDELETE("/isp/packages/:id", deletePackage, admin)
	webserver.ApiGET("/isp/subscriptions", listSubscriptions)
	webserver.ApiGET("/isp/subscriptions/:id", getSubscription)
	webserver.ApiPOST("/isp/subscriptions", createSubscription, admin)
	webserver.ApiPOST("/isp/subscriptions/:id/:action", subscriptionAction, admin)
	webserver.ApiGET("/isp/invoices", listInvoices)
	webserver.ApiGET("/isp/invoices/:id", getInvoice)
	webserver.ApiGET("/isp/payments", listPayments)
	webserver.ApiGET("/isp/payments/:id", getPayment)
	webserver.ApiPOST("/isp/payments", createPayment, admin)
	webserver.ApiPOST("/isp/invoices/:id/send-whatsapp", sendInvoiceWhatsApp, admin)
	webserver.ApiPOST("/isp/payments/:id/send-whatsapp", sendPaymentWhatsApp, admin)
	webserver.ApiPOST("/isp/subscriptions/:id/apply-fup", applySubscriptionFUP, admin)
	webserver.ApiPOST("/isp/subscriptions/:id/reset-fup", resetSubscriptionFUP, admin)
	webserver.ApiGET("/portal/lookup", lookupCustomerPortal)
	webserver.ApiGET("/portal/invoices/:id/payment-channel", getInvoicePaymentChannel)
	webserver.ApiPOST("/portal/invoices/:id/simulate-pay", simulateInvoicePayment)
	webserver.ApiPOST("/portal/payments/webhook", handlePaymentWebhook)
	webserver.ApiGET("/public/packages", listPublicPackages)
	webserver.ApiPOST("/public/register", registerPublicCustomer)
	webserver.ApiGET("/dashboard/isp-stats", getISPDashboardStats)
}

func listCustomers(c echo.Context) error {
	page, size := parsePagination(c)
	q := GetDB(c).Model(&domain.Customer{})
	if status := strings.TrimSpace(c.QueryParam("status")); status != "" {
		q = q.Where("status = ?", status)
	}
	if search := strings.TrimSpace(c.QueryParam("q")); search != "" {
		like := "%" + escapeSessionLikePattern(search) + "%"
		q = q.Where("customer_no LIKE ? OR name LIKE ? OR phone LIKE ?", like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query customers", err.Error())
	}
	var rows []domain.Customer
	if err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query customers", err.Error())
	}
	type customerRow struct {
		domain.Customer
		PackageName    string `json:"package_name"`
		RadiusUsername string `json:"radius_username"`
		Outstanding    int64  `json:"outstanding"`
	}
	result := make([]customerRow, len(rows))
	if len(rows) == 0 {
		return paged(c, result, total, page, size)
	}
	customerIDs := make([]int64, 0, len(rows))
	for i, row := range rows {
		result[i].Customer = row
		customerIDs = append(customerIDs, row.ID)
	}
	// Load only the newest subscription for each customer in one query, then
	// batch-load the referenced packages and RADIUS users for this page.
	type subscriptionSummary struct {
		CustomerID   int64
		PackageID    int64
		RadiusUserID int64
	}
	var subscriptions []subscriptionSummary
	if err := GetDB(c).Model(&domain.Subscription{}).
		Select("customer_id, package_id, radius_user_id").
		Where("customer_id IN (?) AND id IN (?)", customerIDs,
			GetDB(c).Model(&domain.Subscription{}).Select("MAX(id)").Where("customer_id IN ?", customerIDs).Group("customer_id")).
		Find(&subscriptions).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query customer subscriptions", err.Error())
	}
	packageIDs := make([]int64, 0, len(subscriptions))
	userIDs := make([]int64, 0, len(subscriptions))
	for _, sub := range subscriptions {
		packageIDs = append(packageIDs, sub.PackageID)
		if sub.RadiusUserID > 0 {
			userIDs = append(userIDs, sub.RadiusUserID)
		}
	}
	packageNames := make(map[int64]string)
	if len(packageIDs) > 0 {
		var packages []domain.InternetPackage
		if err := GetDB(c).Select("id, name").Where("id IN ?", packageIDs).Find(&packages).Error; err != nil {
			return fail(c, 500, "DATABASE_ERROR", "Failed to query customer packages", err.Error())
		}
		for _, pkg := range packages {
			packageNames[pkg.ID] = pkg.Name
		}
	}
	usernames := make(map[int64]string)
	if len(userIDs) > 0 {
		var users []domain.RadiusUser
		if err := GetDB(c).Select("id, username").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
			return fail(c, 500, "DATABASE_ERROR", "Failed to query customer RADIUS users", err.Error())
		}
		for _, user := range users {
			usernames[user.ID] = user.Username
		}
	}
	rowByCustomer := make(map[int64]int, len(rows))
	for i, row := range rows {
		rowByCustomer[row.ID] = i
	}
	for _, sub := range subscriptions {
		if i, ok := rowByCustomer[sub.CustomerID]; ok {
			result[i].PackageName = packageNames[sub.PackageID]
			result[i].RadiusUsername = usernames[sub.RadiusUserID]
		}
	}
	type outstandingSummary struct {
		CustomerID  int64
		Outstanding int64
	}
	var balances []outstandingSummary
	if err := GetDB(c).Model(&domain.Invoice{}).
		Select("customer_id, COALESCE(SUM(balance), 0) AS outstanding").
		Where("customer_id IN ? AND balance > 0", customerIDs).Group("customer_id").Find(&balances).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query customer balances", err.Error())
	}
	for _, balance := range balances {
		if i, ok := rowByCustomer[balance.CustomerID]; ok {
			result[i].Outstanding = balance.Outstanding
		}
	}
	return paged(c, result, total, page, size)
}

func getCustomer(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid customer ID", nil)
	}
	var row domain.Customer
	if err := GetDB(c).First(&row, id).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, 404, "NOT_FOUND", "Customer not found", nil)
	} else if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query customer", err.Error())
	}
	type subscriptionView struct {
		domain.Subscription
		PackageName   string `json:"package_name"`
		PackagePrice  int64  `json:"package_price"`
		Username      string `json:"radius_username"`
		Online        bool   `json:"online"`
		CurrentIP     string `json:"current_ip"`
		TotalUpload   int64  `json:"total_upload_bytes"`
		TotalDownload int64  `json:"total_download_bytes"`
		TotalTraffic  int64  `json:"total_traffic_bytes"`
	}
	var subscriptions []domain.Subscription
	GetDB(c).Where("customer_id = ?", id).Order("id DESC").Find(&subscriptions)
	views := make([]subscriptionView, 0, len(subscriptions))
	for _, sub := range subscriptions {
		view := subscriptionView{Subscription: sub}
		var pkg domain.InternetPackage
		if GetDB(c).First(&pkg, sub.PackageID).Error == nil {
			view.PackageName, view.PackagePrice = pkg.Name, pkg.Price
		}
		if sub.RadiusUserID > 0 {
			var user domain.RadiusUser
			if GetDB(c).First(&user, sub.RadiusUserID).Error == nil {
				view.Username = user.Username
				var session domain.RadiusOnline
				if GetDB(c).Where("username = ?", user.Username).First(&session).Error == nil {
					view.Online, view.CurrentIP = true, session.FramedIpaddr
					view.TotalUpload += session.AcctInputTotal
					view.TotalDownload += session.AcctOutputTotal
				}
				type acctTotals struct {
					Input  int64
					Output int64
				}
				var totals acctTotals
				GetDB(c).Model(&domain.RadiusAccounting{}).
					Where("username = ?", user.Username).
					Select("COALESCE(SUM(acct_input_total), 0) as input, COALESCE(SUM(acct_output_total), 0) as output").
					Scan(&totals)
				view.TotalUpload += totals.Input
				view.TotalDownload += totals.Output
				view.TotalTraffic = view.TotalUpload + view.TotalDownload
			}
		}
		views = append(views, view)
	}
	var invoices []domain.Invoice
	GetDB(c).Where("customer_id = ?", id).Order("invoice_date DESC").Limit(10).Find(&invoices)
	var payments []domain.Payment
	GetDB(c).Where("customer_id = ?", id).Order("paid_at DESC").Limit(10).Find(&payments)
	var outstanding int64
	GetDB(c).Model(&domain.Invoice{}).Where("customer_id = ? AND balance > 0", id).Select("COALESCE(SUM(balance), 0)").Scan(&outstanding)
	return ok(c, struct {
		domain.Customer
		Subscriptions []subscriptionView `json:"subscriptions"`
		Invoices      []domain.Invoice   `json:"invoices"`
		Payments      []domain.Payment   `json:"payments"`
		Outstanding   int64              `json:"outstanding"`
	}{Customer: row, Subscriptions: views, Invoices: invoices, Payments: payments, Outstanding: outstanding})
}

func createCustomer(c echo.Context) error {
	var in customerInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_REQUEST", "Unable to parse customer", err.Error())
	}
	if err := c.Validate(&in); err != nil {
		return err
	}
	status := in.Status
	if status == "" {
		status = domain.CustomerActive
	}
	row := domain.Customer{
		CustomerNo: fmt.Sprintf("TMP-%d", common.UUIDint64()),
		Name:       strings.TrimSpace(in.Name),
		Phone:      in.Phone,
		Email:      in.Email,
		Address:    in.Address,
		City:       in.City,
		Province:   in.Province,
		IdentityNo: in.IdentityNo,
		Status:     status,
		Notes:      in.Notes,
		ODPID:      in.ODPID,
		ODPCode:    in.ODPCode,
		ODPPort:    in.ODPPort,
		Latitude:   in.Latitude,
		Longitude:  in.Longitude,
	}
	if row.ODPID > 0 && row.ODPCode == "" {
		var odp domain.ODP
		if GetDB(c).First(&odp, row.ODPID).Error == nil {
			row.ODPCode = odp.Code
		}
	}
	err := GetDB(c).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		row.CustomerNo = fmt.Sprintf("MWX-%06d", row.ID)
		return tx.Model(&row).Update("customer_no", row.CustomerNo).Error
	})
	if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to create customer", err.Error())
	}
	return c.JSON(http.StatusCreated, Response{Data: row})
}

func updateCustomer(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid customer ID", nil)
	}
	var in customerInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_REQUEST", "Unable to parse customer", err.Error())
	}
	if err := c.Validate(&in); err != nil {
		return err
	}
	var row domain.Customer
	if err := GetDB(c).First(&row, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Customer not found", nil)
	}
	odpCode := in.ODPCode
	if in.ODPID > 0 && odpCode == "" {
		var odp domain.ODP
		if GetDB(c).First(&odp, in.ODPID).Error == nil {
			odpCode = odp.Code
		}
	}
	updates := map[string]interface{}{
		"name":        strings.TrimSpace(in.Name),
		"phone":       in.Phone,
		"email":       in.Email,
		"address":     in.Address,
		"city":        in.City,
		"province":    in.Province,
		"identity_no": in.IdentityNo,
		"status":      in.Status,
		"notes":       in.Notes,
		"odp_id":      in.ODPID,
		"odp_code":    odpCode,
		"odp_port":    in.ODPPort,
		"latitude":    in.Latitude,
		"longitude":   in.Longitude,
		"updated_at":  time.Now(),
	}
	if err := GetDB(c).Model(&row).Updates(updates).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to update customer", err.Error())
	}
	GetDB(c).First(&row, id)
	return ok(c, row)
}

func deleteCustomer(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid customer ID", nil)
	}
	var count int64
	GetDB(c).Model(&domain.Subscription{}).Where("customer_id = ?", id).Count(&count)
	if count > 0 {
		return fail(c, 409, "CUSTOMER_HAS_SUBSCRIPTIONS", "Customer with subscriptions cannot be deleted", nil)
	}
	deleted, err := deleteTenantRecord(c, &domain.Customer{}, id)
	if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to delete customer", err.Error())
	}
	if !deleted {
		return fail(c, 404, "NOT_FOUND", "Customer not found", nil)
	}
	return ok(c, map[string]int64{"id": id})
}

func listPackages(c echo.Context) error {
	page, size := parsePagination(c)
	q := GetDB(c).Model(&domain.InternetPackage{})
	if status := c.QueryParam("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query packages", err.Error())
	}
	var rows []domain.InternetPackage
	if err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query packages", err.Error())
	}
	return paged(c, rows, total, page, size)
}

func getPackage(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid package ID", nil)
	}
	var row domain.InternetPackage
	if err := GetDB(c).First(&row, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Package not found", nil)
	}
	return ok(c, row)
}

type publicPackageDTO struct {
	ID           int64  `json:"id,string"`
	Code         string `json:"code"`
	Name         string `json:"name"`
	Price        int64  `json:"price"`
	Description  string `json:"description"`
	BillingCycle string `json:"billing_cycle"`
	FupLimitGB   int64  `json:"fup_limit_gb"`
	UpRateKbps   int    `json:"up_rate_kbps"`
	DownRateKbps int    `json:"down_rate_kbps"`
	SpeedDisplay string `json:"speed_display"`
	Category     string `json:"category"`
}

func listPublicPackages(c echo.Context) error {
	db := GetDB(c)
	var pkgs []domain.InternetPackage
	if err := db.Where("status = ?", "active").Order("price ASC, id ASC").Find(&pkgs).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query packages", err.Error())
	}

	if len(pkgs) == 0 {
		return ok(c, []publicPackageDTO{})
	}

	profileIDs := make([]int64, 0, len(pkgs))
	for _, p := range pkgs {
		if p.RadiusProfileID > 0 {
			profileIDs = append(profileIDs, p.RadiusProfileID)
		}
	}

	profileMap := make(map[int64]domain.RadiusProfile)
	if len(profileIDs) > 0 {
		var profiles []domain.RadiusProfile
		if err := db.Where("id IN ?", profileIDs).Find(&profiles).Error; err == nil {
			for _, prof := range profiles {
				profileMap[prof.ID] = prof
			}
		}
	}

	result := make([]publicPackageDTO, 0, len(pkgs))
	for _, p := range pkgs {
		prof, hasProf := profileMap[p.RadiusProfileID]
		up := 0
		down := 0
		if hasProf {
			up = prof.UpRate
			down = prof.DownRate
		}

		speedDisplay := ""
		if down >= 1000000 {
			speedDisplay = fmt.Sprintf("%d Gbps", down/1000000)
		} else if down >= 1000 {
			speedDisplay = fmt.Sprintf("%d Mbps", down/1000)
		} else if down > 0 {
			speedDisplay = fmt.Sprintf("%d Kbps", down)
		} else {
			lowerName := strings.ToLower(p.Name)
			if strings.Contains(lowerName, "gbps") || strings.Contains(lowerName, "mbps") {
				speedDisplay = p.Name
			} else {
				speedDisplay = "High Speed"
			}
		}

		cat := "Home Broadband"
		lowerName := strings.ToLower(p.Name)
		if strings.Contains(lowerName, "business") || strings.Contains(lowerName, "biz") {
			cat = "Corporate / Dedicated"
		} else if strings.Contains(lowerName, "enterprise") || strings.Contains(lowerName, "leased") || strings.Contains(lowerName, "giga") {
			cat = "Enterprise / Leased Line"
		} else if strings.Contains(lowerName, "hotspot") || strings.Contains(lowerName, "voucher") {
			cat = "Prepaid Hotspot"
		}

		result = append(result, publicPackageDTO{
			ID:           p.ID,
			Code:         p.Code,
			Name:         p.Name,
			Price:        p.Price,
			Description:  p.Description,
			BillingCycle: p.BillingCycle,
			FupLimitGB:   p.FupLimitGB,
			UpRateKbps:   up,
			DownRateKbps: down,
			SpeedDisplay: speedDisplay,
			Category:     cat,
		})
	}

	return ok(c, result)
}

type publicRegisterInput struct {
	Name       string `json:"name"`
	Phone      string `json:"phone"`
	Email      string `json:"email"`
	Address    string `json:"address"`
	City       string `json:"city"`
	PackageID  int64  `json:"package_id,string"`
	IdentityNo string `json:"id_card_number"`
	Notes      string `json:"notes"`
}

func registerPublicCustomer(c echo.Context) error {
	var in publicRegisterInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_REQUEST", "Format formulir pendaftaran tidak valid", err.Error())
	}
	name := strings.TrimSpace(in.Name)
	phone := strings.TrimSpace(in.Phone)
	address := strings.TrimSpace(in.Address)
	email := strings.TrimSpace(in.Email)
	if name == "" || phone == "" || address == "" {
		return fail(c, 400, "REQUIRED_FIELDS", "Nama lengkap, nomor WhatsApp, dan alamat pemasangan wajib diisi", nil)
	}
	if len(name) > 150 || len(phone) > 32 || len(email) > 150 || len(address) > 500 || len(strings.TrimSpace(in.City)) > 100 || len(strings.TrimSpace(in.IdentityNo)) > 100 || len(in.Notes) > 1000 {
		return fail(c, 400, "FIELD_TOO_LONG", "Satu atau beberapa field melebihi batas panjang", nil)
	}
	if !validPublicPhone(phone) {
		return fail(c, 400, "INVALID_PHONE", "Nomor WhatsApp tidak valid", nil)
	}
	if email != "" {
		parsed, err := mail.ParseAddress(email)
		if err != nil || parsed.Address != email {
			return fail(c, 400, "INVALID_EMAIL", "Alamat email tidak valid", nil)
		}
	}
	if in.PackageID <= 0 {
		return fail(c, 400, "PACKAGE_REQUIRED", "Pilih paket internet yang tersedia", nil)
	}

	db := GetDB(c)
	now := time.Now()

	var pkg domain.InternetPackage
	if err := db.Where("id = ? AND status = ?", in.PackageID, "active").First(&pkg).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, 400, "PACKAGE_UNAVAILABLE", "Paket tidak tersedia", nil)
	} else if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Gagal memvalidasi paket", nil)
	}
	var profile domain.RadiusProfile
	if pkg.RadiusProfileID <= 0 {
		return fail(c, 400, "PACKAGE_UNAVAILABLE", "Profil jaringan untuk paket tidak tersedia", nil)
	}
	if err := db.First(&profile, pkg.RadiusProfileID).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return fail(c, 400, "PACKAGE_UNAVAILABLE", "Profil jaringan untuk paket tidak tersedia", nil)
	} else if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Gagal memvalidasi profil jaringan", nil)
	}
	if profile.Status != "enabled" && profile.Status != "1" {
		return fail(c, 400, "PACKAGE_UNAVAILABLE", "Profil jaringan untuk paket tidak tersedia", nil)
	}
	pkgName := pkg.Name

	notes := in.Notes
	if notes == "" {
		notes = fmt.Sprintf("Pendaftaran pasang baru via website publik. Paket: %s", pkgName)
	} else {
		notes = fmt.Sprintf("Pendaftaran pasang baru via website publik. Paket: %s. Catatan: %s", pkgName, notes)
	}

	var customer domain.Customer
	var subscription domain.Subscription
	var ticket domain.TroubleTicket
	err := db.Transaction(func(tx *gorm.DB) error {
		customer = domain.Customer{
			CustomerNo: fmt.Sprintf("TMP-%d", common.UUIDint64()),
			Name:       name,
			Phone:      phone,
			Email:      email,
			IdentityNo: strings.TrimSpace(in.IdentityNo),
			Address:    address,
			City:       strings.TrimSpace(in.City),
			Status:     domain.CustomerPending,
			Notes:      notes,
			CreatedAt:  now,
			UpdatedAt:  now,
		}
		if err := tx.Create(&customer).Error; err != nil {
			return err
		}
		customer.CustomerNo = fmt.Sprintf("MWX-%06d", customer.ID)
		if err := tx.Model(&customer).Update("customer_no", customer.CustomerNo).Error; err != nil {
			return err
		}

		subscription = domain.Subscription{
			SubscriptionNo: fmt.Sprintf("TMP-%d", common.UUIDint64()),
			CustomerID:     customer.ID,
			PackageID:      pkg.ID,
			Status:         domain.SubscriptionPending,
			StartDate:      now,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		if err := tx.Create(&subscription).Error; err != nil {
			return err
		}
		subscription.SubscriptionNo = fmt.Sprintf("SUB-%06d", subscription.ID)
		if err := tx.Model(&subscription).Update("subscription_no", subscription.SubscriptionNo).Error; err != nil {
			return err
		}
		if err := tx.Create(&domain.BillingEvent{
			CustomerID: customer.ID, SubscriptionID: subscription.ID,
			Type: "registration_submitted", Description: "Public registration awaiting review: " + subscription.SubscriptionNo,
			CreatedAt: now,
		}).Error; err != nil {
			return err
		}

		ticketNo, err := nextISPTicketNumber(tx, "WO", now)
		if err != nil {
			return err
		}
		ticket = domain.TroubleTicket{
			TicketNo:       ticketNo,
			CustomerID:     customer.ID,
			SubscriptionID: subscription.ID,
			Subject:        fmt.Sprintf("Pasang Baru: %s (%s)", customer.Name, pkgName),
			Category:       "installation",
			Priority:       "normal",
			Status:         "open",
			Description:    fmt.Sprintf("Permohonan Pemasangan Baru:\n- Nama: %s\n- No WhatsApp: %s\n- Email: %s\n- Alamat Pemasangan: %s, %s\n- Pilihan Paket: %s\n- Catatan: %s", customer.Name, customer.Phone, customer.Email, customer.Address, customer.City, pkgName, in.Notes),
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		return tx.Create(&ticket).Error
	})
	if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Gagal menyimpan pendaftaran dan work order", nil)
	}

	return ok(c, map[string]any{
		"success":             true,
		"customer_no":         customer.CustomerNo,
		"subscription_no":     subscription.SubscriptionNo,
		"subscription_status": subscription.Status,
		"ticket_no":           ticket.TicketNo,
		"package":             pkgName,
		"message":             "Pendaftaran berhasil diterima! Tim teknisi kami akan segera menghubungi Anda untuk jadwal survei dan instalasi.",
	})
}

func validPublicPhone(phone string) bool {
	digits := 0
	for i, r := range phone {
		switch {
		case r >= '0' && r <= '9':
			digits++
		case r == '+' && i == 0:
		case r == ' ' || r == '-' || r == '(' || r == ')' || r == '.':
		default:
			return false
		}
	}
	return digits >= 6
}

func savePackage(c echo.Context, id int64) error {
	var in packageInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_REQUEST", "Unable to parse package", err.Error())
	}
	if in.BillingCycle == "" {
		in.BillingCycle = "monthly"
	}
	if in.Status == "" {
		in.Status = "active"
	}
	if err := c.Validate(&in); err != nil {
		return err
	}
	var profile domain.RadiusProfile
	if err := GetDB(c).First(&profile, in.RadiusProfileID).Error; err != nil {
		return fail(c, 400, "PROFILE_NOT_FOUND", "RADIUS profile not found", nil)
	}
	row := domain.InternetPackage{
		Name:            strings.TrimSpace(in.Name),
		Price:           in.Price,
		RadiusProfileID: in.RadiusProfileID,
		Description:     in.Description,
		BillingCycle:    in.BillingCycle,
		FupLimitGB:      in.FupLimitGB,
		FupRateDown:     in.FupRateDown,
		FupRateUp:       in.FupRateUp,
		Status:          in.Status,
	}
	if id == 0 {
		err := GetDB(c).Transaction(func(tx *gorm.DB) error {
			row.Code = fmt.Sprintf("TMP-%d", common.UUIDint64())
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
			row.Code = fmt.Sprintf("PKG-%06d", row.ID)
			return tx.Model(&row).Update("code", row.Code).Error
		})
		if err != nil {
			return fail(c, 409, "PACKAGE_SAVE_FAILED", "Failed to create package", err.Error())
		}
		return c.JSON(http.StatusCreated, Response{Data: row})
	}
	if err := GetDB(c).Model(&domain.InternetPackage{}).Where("id = ?", id).Updates(map[string]interface{}{
		"name":              row.Name,
		"price":             row.Price,
		"radius_profile_id": row.RadiusProfileID,
		"description":       row.Description,
		"billing_cycle":     row.BillingCycle,
		"fup_limit_gb":      row.FupLimitGB,
		"fup_rate_down":     row.FupRateDown,
		"fup_rate_up":       row.FupRateUp,
		"status":            row.Status,
		"updated_at":        time.Now(),
	}).Error; err != nil {
		return fail(c, 409, "PACKAGE_SAVE_FAILED", "Failed to update package", err.Error())
	}
	if err := GetDB(c).First(&row, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Package not found", nil)
	}
	return ok(c, row)
}
func createPackage(c echo.Context) error { return savePackage(c, 0) }
func updatePackage(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid package ID", nil)
	}
	return savePackage(c, id)
}
func deletePackage(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid package ID", nil)
	}
	var n int64
	GetDB(c).Model(&domain.Subscription{}).Where("package_id = ?", id).Count(&n)
	if n > 0 {
		return fail(c, 409, "PACKAGE_IN_USE", "Package has subscriptions and cannot be deleted", nil)
	}
	deleted, err := deleteTenantRecord(c, &domain.InternetPackage{}, id)
	if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to delete package", err.Error())
	}
	if !deleted {
		return fail(c, 404, "NOT_FOUND", "Package not found", nil)
	}
	return ok(c, map[string]int64{"id": id})
}

func listSubscriptions(c echo.Context) error {
	page, size := parsePagination(c)
	q := GetDB(c).Model(&domain.Subscription{})
	if status := c.QueryParam("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if customer := c.QueryParam("customer_id"); customer != "" {
		q = q.Where("customer_id = ?", customer)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query subscriptions", err.Error())
	}
	var rows []domain.Subscription
	if err := q.Order("id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query subscriptions", err.Error())
	}
	type subscriptionRow struct {
		domain.Subscription
		CustomerName   string `json:"customer_name"`
		PackageName    string `json:"package_name"`
		PackagePrice   int64  `json:"package_price"`
		RadiusUsername string `json:"radius_username"`
	}
	result := make([]subscriptionRow, 0, len(rows))
	for _, row := range rows {
		view := subscriptionRow{Subscription: row}
		var customer domain.Customer
		if GetDB(c).First(&customer, row.CustomerID).Error == nil {
			view.CustomerName = customer.Name
		}
		var pkg domain.InternetPackage
		if GetDB(c).First(&pkg, row.PackageID).Error == nil {
			view.PackageName, view.PackagePrice = pkg.Name, pkg.Price
		}
		var user domain.RadiusUser
		if row.RadiusUserID > 0 && GetDB(c).First(&user, row.RadiusUserID).Error == nil {
			view.RadiusUsername = user.Username
		}
		result = append(result, view)
	}
	return paged(c, result, total, page, size)
}
func getSubscription(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid subscription ID", nil)
	}
	var row domain.Subscription
	if err := GetDB(c).First(&row, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Subscription not found", nil)
	}
	var customer domain.Customer
	var pkg domain.InternetPackage
	_ = GetDB(c).First(&customer, row.CustomerID).Error
	_ = GetDB(c).First(&pkg, row.PackageID).Error
	username, currentIP, online := "", "", false
	if row.RadiusUserID > 0 {
		var user domain.RadiusUser
		if GetDB(c).First(&user, row.RadiusUserID).Error == nil {
			username = user.Username
			var session domain.RadiusOnline
			if GetDB(c).Where("username = ?", username).First(&session).Error == nil {
				online, currentIP = true, session.FramedIpaddr
			}
		}
	}
	var totalUpload, totalDownload int64
	if username != "" {
		var session domain.RadiusOnline
		if GetDB(c).Where("username = ?", username).First(&session).Error == nil {
			totalUpload += session.AcctInputTotal
			totalDownload += session.AcctOutputTotal
		}
		type trafficTotals struct {
			Input  int64
			Output int64
		}
		var hist trafficTotals
		GetDB(c).Model(&domain.RadiusAccounting{}).
			Where("username = ?", username).
			Select("COALESCE(SUM(acct_input_total), 0) as input, COALESCE(SUM(acct_output_total), 0) as output").
			Scan(&hist)
		totalUpload += hist.Input
		totalDownload += hist.Output
	}
	var outstanding int64
	GetDB(c).Model(&domain.Invoice{}).Where("subscription_id = ? AND balance > 0", row.ID).Select("COALESCE(SUM(balance), 0)").Scan(&outstanding)
	totalTraffic := totalUpload + totalDownload
	fupLimitBytes := pkg.FupLimitGB * 1024 * 1024 * 1024
	fupTriggered := fupLimitBytes > 0 && totalTraffic >= fupLimitBytes
	fupStatus := "normal"
	if fupTriggered {
		fupStatus = "throttled"
	}
	return ok(c, struct {
		domain.Subscription
		CustomerName       string `json:"customer_name"`
		PackageName        string `json:"package_name"`
		PackagePrice       int64  `json:"package_price"`
		RadiusUsername     string `json:"radius_username"`
		Online             bool   `json:"online"`
		CurrentIP          string `json:"current_ip"`
		TotalUploadBytes   int64  `json:"total_upload_bytes"`
		TotalDownloadBytes int64  `json:"total_download_bytes"`
		TotalTrafficBytes  int64  `json:"total_traffic_bytes"`
		Outstanding        int64  `json:"outstanding"`
		FupLimitGB         int64  `json:"fup_limit_gb"`
		FupLimitBytes      int64  `json:"fup_limit_bytes"`
		FupTriggered       bool   `json:"fup_triggered"`
		FupStatus          string `json:"fup_status"`
		FupRateDown        int    `json:"fup_rate_down"`
		FupRateUp          int    `json:"fup_rate_up"`
	}{
		Subscription:       row,
		CustomerName:       customer.Name,
		PackageName:        pkg.Name,
		PackagePrice:       pkg.Price,
		RadiusUsername:     username,
		Online:             online,
		CurrentIP:          currentIP,
		TotalUploadBytes:   totalUpload,
		TotalDownloadBytes: totalDownload,
		TotalTrafficBytes:  totalTraffic,
		Outstanding:        outstanding,
		FupLimitGB:         pkg.FupLimitGB,
		FupLimitBytes:      fupLimitBytes,
		FupTriggered:       fupTriggered,
		FupStatus:          fupStatus,
		FupRateDown:        pkg.FupRateDown,
		FupRateUp:          pkg.FupRateUp,
	})
}

func createSubscription(c echo.Context) error {
	var in subscriptionInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_REQUEST", "Unable to parse subscription", err.Error())
	}
	if err := c.Validate(&in); err != nil {
		return err
	}
	radiusUserID := int64(0)
	if strings.TrimSpace(in.RadiusUserID) != "" {
		parsed, parseErr := strconv.ParseInt(in.RadiusUserID, 10, 64)
		if parseErr != nil || parsed <= 0 {
			return fail(c, http.StatusBadRequest, "INVALID_RADIUS_USER_ID", "Invalid RADIUS user ID", nil)
		}
		radiusUserID = parsed
	}
	billingDay := int(GetAppContext(c).GetSettingsInt64Value("isp", "DefaultBillingDay"))
	if in.BillingDay != nil {
		billingDay = *in.BillingDay
	}
	if billingDay < 1 || billingDay > 28 {
		billingDay = 1
	}
	graceDays := int(GetAppContext(c).GetSettingsInt64Value("isp", "DefaultGraceDays"))
	if in.GraceDays != nil {
		graceDays = *in.GraceDays
	}
	if graceDays < 0 || graceDays > 60 {
		graceDays = 3
	}
	db := GetDB(c)
	var customer domain.Customer
	var pkg domain.InternetPackage
	if err := db.First(&customer, in.CustomerID).Error; err != nil {
		return fail(c, 400, "CUSTOMER_NOT_FOUND", "Customer not found", nil)
	}
	if err := db.First(&pkg, in.PackageID).Error; err != nil {
		return fail(c, 400, "PACKAGE_NOT_FOUND", "Package not found", nil)
	}
	if radiusUserID == 0 && (in.Username == "" || in.Password == "") {
		return fail(c, 400, "RADIUS_CREDENTIALS_REQUIRED", "Provide an existing RADIUS user or a new username and password", nil)
	}
	status := in.Status
	if status == "" {
		status = domain.SubscriptionPending
	}
	start := in.StartDate
	if start.IsZero() {
		start = time.Now()
	}
	row := domain.Subscription{SubscriptionNo: fmt.Sprintf("TMP-%d", common.UUIDint64()), CustomerID: customer.ID, PackageID: pkg.ID, Status: status, StartDate: start, BillingDay: billingDay, GraceDays: graceDays}
	err := db.Transaction(func(tx *gorm.DB) error {
		if radiusUserID > 0 {
			var user domain.RadiusUser
			if err := tx.First(&user, radiusUserID).Error; err != nil {
				return err
			}
			var linked int64
			if err := tx.Model(&domain.Subscription{}).Where("radius_user_id = ?", user.ID).Count(&linked).Error; err != nil {
				return err
			}
			if linked > 0 {
				return errors.New("RADIUS user is already linked to a subscription")
			}
			row.RadiusUserID = user.ID
		} else {
			var profile domain.RadiusProfile
			if err := tx.First(&profile, pkg.RadiusProfileID).Error; err != nil {
				return err
			}
			radiusStatus := "disabled"
			if status == domain.SubscriptionActive {
				radiusStatus = "enabled"
			}
			u := domain.RadiusUser{ID: common.UUIDint64(), NodeId: profile.NodeId, ProfileId: profile.ID, Realname: customer.Name, Email: customer.Email, Mobile: customer.Phone, Address: customer.Address, Username: strings.TrimSpace(in.Username), Password: in.Password, AddrPool: profile.AddrPool, ActiveNum: profile.ActiveNum, UpRate: profile.UpRate, DownRate: profile.DownRate, Domain: profile.Domain, IPv6PrefixPool: profile.IPv6PrefixPool, DelegatedIpv6PrefixPool: profile.DelegatedIpv6PrefixPool, RadiusClass: profile.RadiusClass, BindMac: profile.BindMac, BindVlan: profile.BindVlan, ProfileLinkMode: domain.ProfileLinkModeStatic, ExpireTime: time.Now().AddDate(100, 0, 0), Status: radiusStatus, CreatedAt: time.Now(), UpdatedAt: time.Now()}
			if err := tx.Create(&u).Error; err != nil {
				return err
			}
			row.RadiusUserID = u.ID
		}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		radiusStatus := "disabled"
		if row.Status == domain.SubscriptionActive {
			radiusStatus = "enabled"
		}
		if err := tx.Model(&domain.RadiusUser{}).Where("id = ?", row.RadiusUserID).Update("status", radiusStatus).Error; err != nil {
			return err
		}
		row.SubscriptionNo = fmt.Sprintf("SUB-%06d", row.ID)
		if err := tx.Model(&row).Update("subscription_no", row.SubscriptionNo).Error; err != nil {
			return err
		}
		return tx.Create(&domain.BillingEvent{CustomerID: customer.ID, SubscriptionID: row.ID, Type: "subscription_created", Description: row.SubscriptionNo, CreatedAt: time.Now()}).Error
	})
	if err != nil {
		return fail(c, 409, "SUBSCRIPTION_CREATE_FAILED", "Failed to create subscription", err.Error())
	}
	return c.JSON(http.StatusCreated, Response{Data: row})
}

func subscriptionAction(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid subscription ID", nil)
	}
	action := strings.ToLower(c.Param("action"))
	if action != "activate" && action != "suspend" && action != "reactivate" && action != "disconnect" && action != "terminate" {
		return fail(c, 404, "UNKNOWN_ACTION", "Unknown subscription action", nil)
	}
	db := GetDB(c)
	var sub domain.Subscription
	if err := db.First(&sub, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Subscription not found", nil)
	}
	if action == "disconnect" {
		if sub.RadiusUserID > 0 {
			count, err := disconnectRadiusUsername(c, sub.RadiusUserID)
			if err != nil {
				return fail(c, http.StatusBadGateway, "DISCONNECT_FAILED", "Could not disconnect every online session", err.Error())
			}
			return ok(c, map[string]int{"disconnected_sessions": count})
		}
		return ok(c, map[string]string{"result": "no linked RADIUS user"})
	}
	switch action {
	case "activate":
		if sub.Status != domain.SubscriptionPending && sub.Status != domain.SubscriptionActive {
			return fail(c, http.StatusConflict, "INVALID_SUBSCRIPTION_STATE", "Only pending subscriptions can be activated", nil)
		}
	case "suspend":
		if sub.Status != domain.SubscriptionActive && sub.Status != domain.SubscriptionSuspended {
			return fail(c, http.StatusConflict, "INVALID_SUBSCRIPTION_STATE", "Only active subscriptions can be suspended", nil)
		}
	case "reactivate":
		if sub.Status != domain.SubscriptionSuspended && sub.Status != domain.SubscriptionActive {
			return fail(c, http.StatusConflict, "INVALID_SUBSCRIPTION_STATE", "Only suspended subscriptions can be reactivated", nil)
		}
	case "terminate":
		if sub.Status == domain.SubscriptionTerminated {
			return fail(c, http.StatusConflict, "INVALID_SUBSCRIPTION_STATE", "Subscription is already terminated", nil)
		}
	}
	status, reason, userStatus := sub.Status, sub.SuspensionReason, "enabled"
	switch action {
	case "activate", "reactivate":
		status = domain.SubscriptionActive
		reason = ""
	case "suspend":
		status = domain.SubscriptionSuspended
		reason = "manual"
		userStatus = "disabled"
	case "terminate":
		status = domain.SubscriptionTerminated
		reason = "manual"
		userStatus = "disabled"
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&sub).Updates(map[string]interface{}{"status": status, "suspension_reason": reason, "updated_at": time.Now()}).Error; err != nil {
			return err
		}
		if sub.RadiusUserID > 0 {
			if err := tx.Model(&domain.RadiusUser{}).Where("id = ?", sub.RadiusUserID).Update("status", userStatus).Error; err != nil {
				return err
			}
		}
		event := "subscription_activated"
		switch status {
		case domain.SubscriptionSuspended:
			event = "subscription_suspended"
		case domain.SubscriptionTerminated:
			event = "subscription_terminated"
		}
		return tx.Create(&domain.BillingEvent{CustomerID: sub.CustomerID, SubscriptionID: sub.ID, Type: event, Description: reason, CreatedAt: time.Now()}).Error
	})
	if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to update subscription", err.Error())
	}
	if action == "suspend" || action == "terminate" {
		if _, err := disconnectRadiusUsername(c, sub.RadiusUserID); err != nil {
			return fail(c, http.StatusBadGateway, "DISCONNECT_FAILED", "Subscription was disabled but a live session could not be disconnected", err.Error())
		}
	}
	db.First(&sub, id)
	return ok(c, sub)
}

func disconnectRadiusUsername(c echo.Context, userID int64) (int, error) {
	if userID <= 0 {
		return 0, nil
	}
	var user domain.RadiusUser
	if err := GetDB(c).First(&user, userID).Error; err != nil {
		return 0, err
	}
	var sessions []domain.RadiusOnline
	if err := GetDB(c).Where("username = ?", user.Username).Find(&sessions).Error; err != nil {
		return 0, err
	}
	disconnected := 0
	var firstErr error
	for _, session := range sessions {
		var nas domain.NetNas
		if err := GetDB(c).Where("ipaddr = ?", session.NasAddr).First(&nas).Error; err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("NAS %s is not configured", session.NasAddr)
			}
			continue
		}
		target, identity := radiusd.CoATargetFromNas(&nas), radiusd.SessionIdentityFromOnline(&session)
		result, err := sessionCoAService().Disconnect(c.Request().Context(), target, identity)
		if err == nil {
			logSessionAction(c, result)
			if auditErr := persistSessionActionAudit(c, session.ID, identity, result); auditErr != nil {
				if firstErr == nil {
					firstErr = fmt.Errorf("disconnect sent but audit failed: %w", auditErr)
				}
			}
			if result.Success {
				disconnected++
			} else if firstErr == nil {
				firstErr = fmt.Errorf("NAS did not acknowledge disconnect: %s", result.ResponseCode)
			}
		} else if firstErr == nil {
			firstErr = err
		}
	}
	return disconnected, firstErr
}

func listInvoices(c echo.Context) error {
	page, size := parsePagination(c)
	q := GetDB(c).Model(&domain.Invoice{})
	if status := c.QueryParam("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	if customer := c.QueryParam("customer_id"); customer != "" {
		q = q.Where("customer_id = ?", customer)
	}
	if number := strings.TrimSpace(c.QueryParam("invoice_no")); number != "" {
		q = q.Where("invoice_no LIKE ?", "%"+escapeSessionLikePattern(number)+"%")
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query invoices", err.Error())
	}
	var rows []domain.Invoice
	if err := q.Order("invoice_date DESC, id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query invoices", err.Error())
	}
	type invoiceRow struct {
		domain.Invoice
		CustomerName   string `json:"customer_name"`
		SubscriptionNo string `json:"subscription_no"`
		PackageName    string `json:"package_name"`
	}
	result := make([]invoiceRow, 0, len(rows))
	for _, row := range rows {
		view := invoiceRow{Invoice: row}
		var customer domain.Customer
		if GetDB(c).First(&customer, row.CustomerID).Error == nil {
			view.CustomerName = customer.Name
		}
		var sub domain.Subscription
		if GetDB(c).First(&sub, row.SubscriptionID).Error == nil {
			view.SubscriptionNo = sub.SubscriptionNo
			var pkg domain.InternetPackage
			if GetDB(c).First(&pkg, sub.PackageID).Error == nil {
				view.PackageName = pkg.Name
			}
		}
		result = append(result, view)
	}
	return paged(c, result, total, page, size)
}
func getInvoice(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid invoice ID", nil)
	}
	var row domain.Invoice
	if err := GetDB(c).First(&row, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Invoice not found", nil)
	}
	var items []domain.InvoiceItem
	GetDB(c).Where("invoice_id = ?", id).Find(&items)
	var payments []domain.Payment
	GetDB(c).Where("invoice_id = ?", id).Order("paid_at DESC").Find(&payments)
	var customer domain.Customer
	GetDB(c).First(&customer, row.CustomerID)
	var sub domain.Subscription
	if row.SubscriptionID > 0 {
		GetDB(c).First(&sub, row.SubscriptionID)
	}
	return ok(c, struct {
		domain.Invoice
		Items          []domain.InvoiceItem `json:"items"`
		Payments       []domain.Payment     `json:"payments"`
		CustomerName   string               `json:"customer_name"`
		CustomerNo     string               `json:"customer_no"`
		CustomerPhone  string               `json:"customer_phone"`
		SubscriptionNo string               `json:"subscription_no"`
		CompanyName    string               `json:"company_name"`
		CompanyAddress string               `json:"company_address"`
		CompanyPhone   string               `json:"company_phone"`
		CompanyEmail   string               `json:"company_email"`
		Currency       string               `json:"currency"`
	}{Invoice: row, Items: items, Payments: payments,
		CustomerName:   customer.Name,
		CustomerNo:     customer.CustomerNo,
		CustomerPhone:  customer.Phone,
		SubscriptionNo: sub.SubscriptionNo,
		CompanyName:    GetAppContext(c).GetSettingsStringValue("isp", "CompanyName"),
		CompanyAddress: GetAppContext(c).GetSettingsStringValue("isp", "CompanyAddress"),
		CompanyPhone:   GetAppContext(c).GetSettingsStringValue("isp", "CompanyPhone"),
		CompanyEmail:   GetAppContext(c).GetSettingsStringValue("isp", "CompanyEmail"),
		Currency:       GetAppContext(c).GetSettingsStringValue("isp", "Currency")})
}
func createPayment(c echo.Context) error {
	var in paymentInput
	if err := c.Bind(&in); err != nil {
		return fail(c, 400, "INVALID_REQUEST", "Unable to parse payment", err.Error())
	}
	if err := c.Validate(&in); err != nil {
		return err
	}
	row := domain.Payment{InvoiceID: in.InvoiceID, Amount: in.Amount, Method: in.Method, Reference: in.Reference, Notes: in.Notes}
	if err := billing.RecordPayment(GetDB(c), &row, time.Now(), GetAppContext(c).GetSettingsBoolValue("isp", "AutoReactivate")); errors.Is(err, billing.ErrInvalidPayment) {
		return fail(c, 400, "INVALID_PAYMENT", err.Error(), nil)
	} else if errors.Is(err, billing.ErrInvoiceClosed) {
		return fail(c, 409, "INVOICE_CLOSED", err.Error(), nil)
	} else if err != nil {
		return fail(c, 500, "PAYMENT_FAILED", "Failed to record payment", err.Error())
	}
	return c.JSON(http.StatusCreated, Response{Data: row})
}
func listPayments(c echo.Context) error {
	page, size := parsePagination(c)
	q := GetDB(c).Model(&domain.Payment{})
	if customer := c.QueryParam("customer_id"); customer != "" {
		q = q.Where("customer_id = ?", customer)
	}
	if invoice := c.QueryParam("invoice_id"); invoice != "" {
		q = q.Where("invoice_id = ?", invoice)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query payments", err.Error())
	}
	var rows []domain.Payment
	if err := q.Order("paid_at DESC, id DESC").Offset((page - 1) * size).Limit(size).Find(&rows).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to query payments", err.Error())
	}
	type paymentRow struct {
		domain.Payment
		InvoiceNo string `json:"invoice_no"`
	}
	result := make([]paymentRow, 0, len(rows))
	for _, row := range rows {
		view := paymentRow{Payment: row}
		var invoice domain.Invoice
		if GetDB(c).First(&invoice, row.InvoiceID).Error == nil {
			view.InvoiceNo = invoice.InvoiceNo
		}
		result = append(result, view)
	}
	return paged(c, result, total, page, size)
}
func getPayment(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid payment ID", nil)
	}
	var row domain.Payment
	if err := GetDB(c).First(&row, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Payment not found", nil)
	}
	return ok(c, row)
}

type ispDashboardStats struct {
	Customers              int64 `json:"customers"`
	ActiveSubscriptions    int64 `json:"active_subscriptions"`
	SuspendedSubscriptions int64 `json:"suspended_subscriptions"`
	OnlineUsers            int64 `json:"online_users"`
	InvoicesThisMonth      int64 `json:"invoices_this_month"`
	PaymentsThisMonth      int64 `json:"payments_this_month"`
	Outstanding            int64 `json:"outstanding"`
	Overdue                int64 `json:"overdue"`
}

func getISPDashboardStats(c echo.Context) error {
	db := GetDB(c)
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var s ispDashboardStats
	db.Model(&domain.Customer{}).Count(&s.Customers)
	db.Model(&domain.Subscription{}).Where("status = ?", domain.SubscriptionActive).Count(&s.ActiveSubscriptions)
	db.Model(&domain.Subscription{}).Where("status = ?", domain.SubscriptionSuspended).Count(&s.SuspendedSubscriptions)
	db.Model(&domain.RadiusOnline{}).Count(&s.OnlineUsers)
	db.Model(&domain.Invoice{}).Where("invoice_date >= ?", start).Count(&s.InvoicesThisMonth)
	db.Model(&domain.Payment{}).Where("paid_at >= ? AND status = ?", start, domain.PaymentReceived).Count(&s.PaymentsThisMonth)
	db.Model(&domain.Invoice{}).Where("balance > 0").Select("COALESCE(SUM(balance), 0)").Scan(&s.Outstanding)
	db.Model(&domain.Invoice{}).Where("status = ? AND balance > 0", domain.InvoiceOverdue).Count(&s.Overdue)
	return ok(c, s)
}

func formatIDR(n int64) string {
	in := strconv.FormatInt(n, 10)
	var out []byte
	l := len(in)
	for i := range in {
		if i > 0 && (l-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, in[i])
	}
	return string(out)
}

func sendInvoiceWhatsApp(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid invoice ID", nil)
	}
	var inv domain.Invoice
	if err := GetDB(c).First(&inv, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Invoice not found", nil)
	}
	var customer domain.Customer
	if err := GetDB(c).First(&customer, inv.CustomerID).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Customer not found", nil)
	}
	rawPhone := strings.TrimSpace(customer.Phone)
	if rawPhone == "" {
		return fail(c, 400, "NO_PHONE", "Customer has no phone number", nil)
	}
	recipient, err := notify.NormalizeRecipient(rawPhone)
	if err != nil {
		return fail(c, 400, "INVALID_PHONE", "Invalid customer phone number: "+err.Error(), nil)
	}
	provider, providerOK := GetAppContext(c).(app.NotificationProvider)
	if !providerOK {
		return fail(c, 503, "WHATSAPP_UNAVAILABLE", "WhatsApp service unavailable", nil)
	}
	manager, err := provider.WhatsAppManager()
	if err != nil {
		return fail(c, 503, "WHATSAPP_UNAVAILABLE", "WhatsApp session store is unavailable", nil)
	}
	if manager.Status().State != "connected" {
		return fail(c, 400, "WHATSAPP_NOT_CONNECTED", "WhatsApp is not connected on server. Scan QR code in Operations > WhatsApp.", nil)
	}
	body := fmt.Sprintf("Halo %s,\n\nTagihan internet Anda nomor %s sebesar Rp %s telah diterbitkan.\nJatuh tempo: %s\nStatus: %s\n\nSilakan lakukan pembayaran tepat waktu agar koneksi internet tetap lancar. Terima kasih.",
		customer.Name, inv.InvoiceNo, formatIDR(inv.Total), inv.DueDate.Format("02-01-2006"), inv.Status)
	if err := manager.Send(c.Request().Context(), recipient, body); err != nil {
		return fail(c, 503, "SEND_FAILED", "Failed to send WhatsApp message: "+err.Error(), nil)
	}
	return ok(c, map[string]any{"sent": true, "recipient": recipient})
}

func sendPaymentWhatsApp(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid payment ID", nil)
	}
	var payment domain.Payment
	if err := GetDB(c).First(&payment, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Payment not found", nil)
	}
	var inv domain.Invoice
	if err := GetDB(c).First(&inv, payment.InvoiceID).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Invoice not found", nil)
	}
	var customer domain.Customer
	if err := GetDB(c).First(&customer, inv.CustomerID).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Customer not found", nil)
	}
	rawPhone := strings.TrimSpace(customer.Phone)
	if rawPhone == "" {
		return fail(c, 400, "NO_PHONE", "Customer has no phone number", nil)
	}
	recipient, err := notify.NormalizeRecipient(rawPhone)
	if err != nil {
		return fail(c, 400, "INVALID_PHONE", "Invalid customer phone number: "+err.Error(), nil)
	}
	provider, providerOK := GetAppContext(c).(app.NotificationProvider)
	if !providerOK {
		return fail(c, 503, "WHATSAPP_UNAVAILABLE", "WhatsApp service unavailable", nil)
	}
	manager, err := provider.WhatsAppManager()
	if err != nil {
		return fail(c, 503, "WHATSAPP_UNAVAILABLE", "WhatsApp session store is unavailable", nil)
	}
	if manager.Status().State != "connected" {
		return fail(c, 400, "WHATSAPP_NOT_CONNECTED", "WhatsApp is not connected on server. Scan QR code in Operations > WhatsApp.", nil)
	}
	paidDate := payment.PaidAt.Format("02-01-2006 15:04")
	body := fmt.Sprintf("Halo %s,\n\nPembayaran tagihan %s sebesar Rp %s telah kami terima pada %s via %s (Ref: %s).\nTerima kasih atas kepercayaan Anda menggunakan layanan internet kami.",
		customer.Name, inv.InvoiceNo, formatIDR(payment.Amount), paidDate, payment.Method, payment.Reference)
	if err := manager.Send(c.Request().Context(), recipient, body); err != nil {
		return fail(c, 503, "SEND_FAILED", "Failed to send WhatsApp message: "+err.Error(), nil)
	}
	return ok(c, map[string]any{"sent": true, "recipient": recipient})
}

func lookupCustomerPortal(c echo.Context) error {
	q := strings.TrimSpace(c.QueryParam("q"))
	if q == "" {
		return fail(c, 400, "QUERY_REQUIRED", "Search parameter q is required (customer_no, phone, or identity_no)", nil)
	}
	var customer domain.Customer
	if err := GetDB(c).Where("customer_no = ? OR phone = ? OR identity_no = ?", q, q, q).First(&customer).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Customer not found", nil)
	}
	var sub domain.Subscription
	GetDB(c).Where("customer_id = ?", customer.ID).Order("id DESC").First(&sub)
	var pkg domain.InternetPackage
	if sub.PackageID > 0 {
		GetDB(c).First(&pkg, sub.PackageID)
	}
	var invoices []domain.Invoice
	GetDB(c).Where("customer_id = ?", customer.ID).Order("id DESC").Limit(10).Find(&invoices)
	var outstanding int64
	GetDB(c).Model(&domain.Invoice{}).Where("customer_id = ? AND balance > 0", customer.ID).Select("COALESCE(SUM(balance), 0)").Scan(&outstanding)

	type portalResp struct {
		CustomerNo         string           `json:"customer_no"`
		Name               string           `json:"name"`
		Status             string           `json:"status"`
		PackageName        string           `json:"package_name"`
		PackagePrice       int64            `json:"package_price"`
		SubscriptionStatus string           `json:"subscription_status"`
		Outstanding        int64            `json:"outstanding"`
		Invoices           []domain.Invoice `json:"invoices"`
	}
	return ok(c, portalResp{
		CustomerNo:         customer.CustomerNo,
		Name:               customer.Name,
		Status:             customer.Status,
		PackageName:        pkg.Name,
		PackagePrice:       pkg.Price,
		SubscriptionStatus: sub.Status,
		Outstanding:        outstanding,
		Invoices:           invoices,
	})
}

func handlePaymentWebhook(c echo.Context) error {
	return fail(c, http.StatusServiceUnavailable, "PAYMENT_PROVIDER_UNCONFIGURED",
		"Payment callbacks are disabled until a verified payment provider is configured", nil)
}
func applySubscriptionFUP(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid subscription ID", nil)
	}
	db := GetDB(c)
	var sub domain.Subscription
	if err := db.First(&sub, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Subscription not found", nil)
	}
	var pkg domain.InternetPackage
	if err := db.First(&pkg, sub.PackageID).Error; err != nil {
		return fail(c, 404, "PACKAGE_NOT_FOUND", "Package not found", nil)
	}
	if pkg.FupLimitGB <= 0 || pkg.FupRateDown <= 0 {
		return fail(c, 400, "FUP_NOT_CONFIGURED", "Package does not have FUP quota or throttled rate configured", nil)
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&sub).Updates(map[string]interface{}{
			"fup_triggered": true,
			"updated_at":    time.Now(),
		}).Error; err != nil {
			return err
		}
		if sub.RadiusUserID > 0 {
			if err := tx.Model(&domain.RadiusUser{}).Where("id = ?", sub.RadiusUserID).Updates(map[string]interface{}{
				"up_rate":    pkg.FupRateUp,
				"down_rate":  pkg.FupRateDown,
				"updated_at": time.Now(),
			}).Error; err != nil {
				return err
			}
		}
		return tx.Create(&domain.BillingEvent{
			CustomerID:     sub.CustomerID,
			SubscriptionID: sub.ID,
			Type:           "fup_throttled",
			Description:    fmt.Sprintf("FUP applied: throttled to %dKbps/%dKbps", pkg.FupRateUp, pkg.FupRateDown),
			CreatedAt:      time.Now(),
		}).Error
	})
	if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to apply FUP", err.Error())
	}

	coaSuccess := false
	if sub.RadiusUserID > 0 {
		var user domain.RadiusUser
		if db.First(&user, sub.RadiusUserID).Error == nil {
			var sessions []domain.RadiusOnline
			db.Where("username = ?", user.Username).Find(&sessions)
			for _, session := range sessions {
				var nas domain.NetNas
				if db.Where("ipaddr = ?", session.NasAddr).First(&nas).Error == nil {
					target, identity := radiusd.CoATargetFromNas(&nas), radiusd.SessionIdentityFromOnline(&session)
					rateSetter := func(p *radius.Packet) error {
						return mikrotik.MikrotikRateLimit_SetString(p, fmt.Sprintf("%dk/%dk", pkg.FupRateUp, pkg.FupRateDown))
					}
					res, coaErr := sessionCoAService().CoA(c.Request().Context(), target, identity, rateSetter)
					if coaErr == nil && res.Success {
						coaSuccess = true
					} else {
						_, _ = sessionCoAService().Disconnect(c.Request().Context(), target, identity)
					}
				}
			}
		}
	}

	var customer domain.Customer
	if db.First(&customer, sub.CustomerID).Error == nil && customer.Phone != "" {
		if recipient, err := notify.NormalizeRecipient(customer.Phone); err == nil {
			if provider, ok := GetAppContext(c).(app.NotificationProvider); ok {
				if mgr, err := provider.WhatsAppManager(); err == nil && mgr.Status().State == "connected" {
					msg := fmt.Sprintf("Halo %s,\n\nPenggunaan kuota internet paket %s Anda telah mencapai batas wajar (FUP). Kecepatan koneksi Anda disesuaikan menjadi %d Kbps sesuai ketentuan. Kuota akan direset otomatis pada awal periode berikutnya. Terima kasih!",
						customer.Name, pkg.Name, pkg.FupRateDown)
					_ = mgr.Send(c.Request().Context(), recipient, msg)
				}
			}
		}
	}

	return ok(c, map[string]any{
		"subscription_id": sub.ID,
		"fup_triggered":   true,
		"fup_rate_up":     pkg.FupRateUp,
		"fup_rate_down":   pkg.FupRateDown,
		"coa_applied":     coaSuccess,
		"message":         "FUP throttle applied successfully",
	})
}

func resetSubscriptionFUP(c echo.Context) error {
	id, err := parseIDParam(c, "id")
	if err != nil {
		return fail(c, 400, "INVALID_ID", "Invalid subscription ID", nil)
	}
	db := GetDB(c)
	var sub domain.Subscription
	if err := db.First(&sub, id).Error; err != nil {
		return fail(c, 404, "NOT_FOUND", "Subscription not found", nil)
	}
	var pkg domain.InternetPackage
	if err := db.First(&pkg, sub.PackageID).Error; err != nil {
		return fail(c, 404, "PACKAGE_NOT_FOUND", "Package not found", nil)
	}
	var profile domain.RadiusProfile
	if err := db.First(&profile, pkg.RadiusProfileID).Error; err != nil {
		return fail(c, 404, "PROFILE_NOT_FOUND", "Profile not found", nil)
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&sub).Updates(map[string]interface{}{
			"fup_triggered": false,
			"updated_at":    time.Now(),
		}).Error; err != nil {
			return err
		}
		if sub.RadiusUserID > 0 {
			if err := tx.Model(&domain.RadiusUser{}).Where("id = ?", sub.RadiusUserID).Updates(map[string]interface{}{
				"up_rate":    profile.UpRate,
				"down_rate":  profile.DownRate,
				"updated_at": time.Now(),
			}).Error; err != nil {
				return err
			}
		}
		return tx.Create(&domain.BillingEvent{
			CustomerID:     sub.CustomerID,
			SubscriptionID: sub.ID,
			Type:           "fup_restored",
			Description:    fmt.Sprintf("FUP reset: restored to %dKbps/%dKbps", profile.UpRate, profile.DownRate),
			CreatedAt:      time.Now(),
		}).Error
	})
	if err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to reset FUP", err.Error())
	}

	if sub.RadiusUserID > 0 {
		var user domain.RadiusUser
		if db.First(&user, sub.RadiusUserID).Error == nil {
			var sessions []domain.RadiusOnline
			db.Where("username = ?", user.Username).Find(&sessions)
			for _, session := range sessions {
				var nas domain.NetNas
				if db.Where("ipaddr = ?", session.NasAddr).First(&nas).Error == nil {
					target, identity := radiusd.CoATargetFromNas(&nas), radiusd.SessionIdentityFromOnline(&session)
					rateSetter := func(p *radius.Packet) error {
						return mikrotik.MikrotikRateLimit_SetString(p, fmt.Sprintf("%dk/%dk", profile.UpRate, profile.DownRate))
					}
					res, coaErr := sessionCoAService().CoA(c.Request().Context(), target, identity, rateSetter)
					if coaErr != nil || !res.Success {
						_, _ = sessionCoAService().Disconnect(c.Request().Context(), target, identity)
					}
				}
			}
		}
	}

	var customer domain.Customer
	if db.First(&customer, sub.CustomerID).Error == nil && customer.Phone != "" {
		if recipient, err := notify.NormalizeRecipient(customer.Phone); err == nil {
			if provider, ok := GetAppContext(c).(app.NotificationProvider); ok {
				if mgr, err := provider.WhatsAppManager(); err == nil && mgr.Status().State == "connected" {
					speedMbps := profile.DownRate / 1024
					if speedMbps == 0 {
						speedMbps = 10
					}
					msg := fmt.Sprintf("Halo %s,\n\nKuota internet paket %s Anda telah direset kembali normal! Kecepatan telah dipulihkan ke kecepatan maksimal (%d Mbps). Selamat menikmati layanan internet kami!",
						customer.Name, pkg.Name, speedMbps)
					_ = mgr.Send(c.Request().Context(), recipient, msg)
				}
			}
		}
	}

	return ok(c, map[string]any{
		"subscription_id":    sub.ID,
		"fup_triggered":      false,
		"restored_rate_up":   profile.UpRate,
		"restored_rate_down": profile.DownRate,
		"message":            "FUP reset and normal speed restored",
	})
}

func getInvoicePaymentChannel(c echo.Context) error {
	return fail(c, http.StatusServiceUnavailable, "PAYMENT_PROVIDER_UNCONFIGURED",
		"Online payment channels are unavailable until a verified payment provider is configured", nil)
}

func simulateInvoicePayment(c echo.Context) error {
	return fail(c, http.StatusGone, "SIMULATED_PAYMENT_DISABLED",
		"Simulated payments cannot settle invoices. Record a payment only after it has been received", nil)
}
