package adminapi

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/talkincode/toughradius/v9/internal/billing"
	"github.com/talkincode/toughradius/v9/internal/domain"
	"github.com/talkincode/toughradius/v9/internal/radiusd"
	"github.com/talkincode/toughradius/v9/internal/webserver"
	"github.com/talkincode/toughradius/v9/pkg/common"
	"gorm.io/gorm"
)

type customerInput struct {
	Name       string `json:"name" validate:"required,max=150"`
	Phone      string `json:"phone" validate:"omitempty,max=32"`
	Email      string `json:"email" validate:"omitempty,email,max=150"`
	Address    string `json:"address" validate:"omitempty,max=500"`
	City       string `json:"city" validate:"omitempty,max=100"`
	Province   string `json:"province" validate:"omitempty,max=100"`
	IdentityNo string `json:"identity_no" validate:"omitempty,max=100"`
	Status     string `json:"status" validate:"omitempty,oneof=active inactive suspended terminated"`
	Notes      string `json:"notes" validate:"omitempty,max=1000"`
}

type packageInput struct {
	Code            string `json:"code" validate:"omitempty,max=40"`
	Name            string `json:"name" validate:"required,max=150"`
	Price           int64  `json:"price" validate:"gte=0"`
	RadiusProfileID int64  `json:"radius_profile_id,string" validate:"required,gt=0"`
	Description     string `json:"description" validate:"omitempty,max=1000"`
	BillingCycle    string `json:"billing_cycle" validate:"omitempty,oneof=monthly"`
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
	result := make([]customerRow, 0, len(rows))
	for _, row := range rows {
		view := customerRow{Customer: row}
		var sub domain.Subscription
		if GetDB(c).Where("customer_id = ?", row.ID).Order("id DESC").First(&sub).Error == nil {
			var pkg domain.InternetPackage
			if GetDB(c).First(&pkg, sub.PackageID).Error == nil {
				view.PackageName = pkg.Name
			}
			var user domain.RadiusUser
			if sub.RadiusUserID > 0 && GetDB(c).First(&user, sub.RadiusUserID).Error == nil {
				view.RadiusUsername = user.Username
			}
		}
		GetDB(c).Model(&domain.Invoice{}).Where("customer_id = ? AND balance > 0", row.ID).Select("COALESCE(SUM(balance), 0)").Scan(&view.Outstanding)
		result = append(result, view)
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
		PackageName  string `json:"package_name"`
		PackagePrice int64  `json:"package_price"`
		Username     string `json:"radius_username"`
		Online       bool   `json:"online"`
		CurrentIP    string `json:"current_ip"`
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
				}
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
	row := domain.Customer{CustomerNo: fmt.Sprintf("TMP-%d", common.UUIDint64()), Name: strings.TrimSpace(in.Name), Phone: in.Phone, Email: in.Email, Address: in.Address, City: in.City, Province: in.Province, IdentityNo: in.IdentityNo, Status: status, Notes: in.Notes}
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
	if err := GetDB(c).Model(&row).Updates(map[string]interface{}{"name": strings.TrimSpace(in.Name), "phone": in.Phone, "email": in.Email, "address": in.Address, "city": in.City, "province": in.Province, "identity_no": in.IdentityNo, "status": in.Status, "notes": in.Notes, "updated_at": time.Now()}).Error; err != nil {
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
	if err := GetDB(c).Delete(&domain.Customer{}, id).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to delete customer", err.Error())
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
	row := domain.InternetPackage{Name: strings.TrimSpace(in.Name), Price: in.Price, RadiusProfileID: in.RadiusProfileID, Description: in.Description, BillingCycle: in.BillingCycle, Status: in.Status}
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
	if err := GetDB(c).Model(&domain.InternetPackage{}).Where("id = ?", id).Updates(map[string]interface{}{"name": row.Name, "price": row.Price, "radius_profile_id": row.RadiusProfileID, "description": row.Description, "billing_cycle": row.BillingCycle, "status": row.Status, "updated_at": time.Now()}).Error; err != nil {
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
	if err := GetDB(c).Delete(&domain.InternetPackage{}, id).Error; err != nil {
		return fail(c, 500, "DATABASE_ERROR", "Failed to delete package", err.Error())
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
	var outstanding int64
	GetDB(c).Model(&domain.Invoice{}).Where("subscription_id = ? AND balance > 0", row.ID).Select("COALESCE(SUM(balance), 0)").Scan(&outstanding)
	return ok(c, struct {
		domain.Subscription
		CustomerName   string `json:"customer_name"`
		PackageName    string `json:"package_name"`
		PackagePrice   int64  `json:"package_price"`
		RadiusUsername string `json:"radius_username"`
		Online         bool   `json:"online"`
		CurrentIP      string `json:"current_ip"`
		Outstanding    int64  `json:"outstanding"`
	}{Subscription: row, CustomerName: customer.Name, PackageName: pkg.Name, PackagePrice: pkg.Price, RadiusUsername: username, Online: online, CurrentIP: currentIP, Outstanding: outstanding})
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
		if status == domain.SubscriptionSuspended {
			event = "subscription_suspended"
		} else if status == domain.SubscriptionTerminated {
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
	return ok(c, struct {
		domain.Invoice
		Items          []domain.InvoiceItem `json:"items"`
		Payments       []domain.Payment     `json:"payments"`
		CompanyName    string               `json:"company_name"`
		CompanyAddress string               `json:"company_address"`
		CompanyPhone   string               `json:"company_phone"`
		CompanyEmail   string               `json:"company_email"`
		Currency       string               `json:"currency"`
	}{Invoice: row, Items: items, Payments: payments,
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
