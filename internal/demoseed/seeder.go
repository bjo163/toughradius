package demoseed

import (
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"time"

	"github.com/talkincode/toughradius/v9/internal/billing"
	"github.com/talkincode/toughradius/v9/internal/domain"
	"gorm.io/gorm"
)

const demoMarker = "demo-seed"

type demoSeeder struct {
	db                *gorm.DB
	now               time.Time
	historyDays       int
	ctx               seedContext
	accountingCount   int
	customerCount     int
	packageCount      int
	subscriptionCount int
	invoiceCount      int
	paymentCount      int
	monitorCount      int
}

type seedContext struct {
	nodes    map[string]*domain.NetNode
	nas      map[string]*domain.NetNas
	profiles map[string]*domain.RadiusProfile
	users    map[string]*domain.RadiusUser
}

type Counts struct {
	Nodes, NAS, Profiles, Users                                                               int
	Customers, Packages, Subscriptions, Invoices, Payments, MonitorTargets, AccountingRecords int
}

// Seed creates the marked sample dataset inside one transaction.
func Seed(db *gorm.DB, now time.Time, historyDays int) (Counts, error) {
	if db == nil {
		return Counts{}, fmt.Errorf("database is required")
	}
	if historyDays < 1 || historyDays > 90 {
		return Counts{}, fmt.Errorf("history days must be between 1 and 90")
	}
	seeder := &demoSeeder{db: db, now: now, historyDays: historyDays}
	err := seeder.run()
	return Counts{Nodes: len(seeder.ctx.nodes), NAS: len(seeder.ctx.nas), Profiles: len(seeder.ctx.profiles), Users: len(seeder.ctx.users), Customers: seeder.customerCount, Packages: seeder.packageCount, Subscriptions: seeder.subscriptionCount, Invoices: seeder.invoiceCount, Payments: seeder.paymentCount, MonitorTargets: seeder.monitorCount, AccountingRecords: seeder.accountingCount}, err
}

// Clean removes only marked sample data, preserving operator-created dependencies.
func Clean(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("database is required")
	}
	return (&demoSeeder{db: db}).clean()
}
func (s *demoSeeder) run() error {
	s.ctx = seedContext{}
	s.accountingCount, s.customerCount, s.packageCount = 0, 0, 0
	s.subscriptionCount, s.invoiceCount, s.paymentCount, s.monitorCount = 0, 0, 0, 0
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := s.cleanup(tx); err != nil {
			return err
		}
		if err := s.seedNodes(tx); err != nil {
			return err
		}
		if err := s.seedNAS(tx); err != nil {
			return err
		}
		if err := s.seedProfiles(tx); err != nil {
			return err
		}
		if err := s.seedUsers(tx); err != nil {
			return err
		}
		if err := s.seedBusinessRecords(tx); err != nil {
			return err
		}
		if err := s.seedMonitorTargets(tx); err != nil {
			return err
		}
		if err := s.seedAccountingHistory(tx); err != nil {
			return err
		}
		return nil
	})
}

func (s *demoSeeder) clean() error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		return s.cleanup(tx)
	})
}

func (s *demoSeeder) cleanup(tx *gorm.DB) error {
	var demoCustomers []domain.Customer
	if err := tx.Where("notes = ? AND name LIKE ?", demoMarker, "Sample %").Find(&demoCustomers).Error; err != nil {
		return err
	}
	if len(demoCustomers) > 0 {
		customerIDs := make([]int64, 0, len(demoCustomers))
		for _, customer := range demoCustomers {
			customerIDs = append(customerIDs, customer.ID)
		}
		var invoices []domain.Invoice
		if err := tx.Where("customer_id IN ? AND notes = ?", customerIDs, demoMarker).Find(&invoices).Error; err != nil {
			return err
		}
		invoiceIDs := make([]int64, 0, len(invoices))
		for _, invoice := range invoices {
			var operatorPayments int64
			if err := tx.Model(&domain.Payment{}).Where("invoice_id = ? AND (notes IS NULL OR notes <> ?)", invoice.ID, demoMarker).Count(&operatorPayments).Error; err != nil {
				return err
			}
			if operatorPayments == 0 {
				invoiceIDs = append(invoiceIDs, invoice.ID)
			}
		}
		if len(invoiceIDs) > 0 {
			if err := tx.Where("invoice_id IN ?", invoiceIDs).Delete(&domain.BillingEvent{}).Error; err != nil {
				return err
			}
			if err := tx.Where("invoice_id IN ? AND notes = ?", invoiceIDs, demoMarker).Delete(&domain.Payment{}).Error; err != nil {
				return err
			}
			if err := tx.Where("invoice_id IN ?", invoiceIDs).Delete(&domain.InvoiceItem{}).Error; err != nil {
				return err
			}
			if err := tx.Where("id IN ?", invoiceIDs).Delete(&domain.Invoice{}).Error; err != nil {
				return err
			}
		}
		var demoSubscriptions []domain.BillingEvent
		if err := tx.Where("customer_id IN ? AND type = ? AND description = ?", customerIDs, "demo_seed", demoMarker).Find(&demoSubscriptions).Error; err != nil {
			return err
		}
		// Read the marker events before deleting them so only seeded subscriptions
		// are removed; a later operator-created subscription for a sample customer
		// is preserved.
		if len(demoSubscriptions) > 0 {
			subscriptionIDs := make([]int64, 0, len(demoSubscriptions))
			markerEventIDs := make([]int64, 0, len(demoSubscriptions))
			for _, event := range demoSubscriptions {
				var remainingInvoices int64
				if err := tx.Model(&domain.Invoice{}).Where("subscription_id = ?", event.SubscriptionID).Count(&remainingInvoices).Error; err != nil {
					return err
				}
				if remainingInvoices == 0 {
					subscriptionIDs = append(subscriptionIDs, event.SubscriptionID)
					markerEventIDs = append(markerEventIDs, event.ID)
				}
			}
			if len(subscriptionIDs) > 0 {
				if err := tx.Where("id IN ?", subscriptionIDs).Delete(&domain.Subscription{}).Error; err != nil {
					return err
				}
				if err := tx.Where("id IN ?", markerEventIDs).Delete(&domain.BillingEvent{}).Error; err != nil {
					return err
				}
			}
		}
		for _, customer := range demoCustomers {
			var subscriptionsLeft, invoicesLeft, paymentsLeft int64
			if err := tx.Model(&domain.Subscription{}).Where("customer_id = ?", customer.ID).Count(&subscriptionsLeft).Error; err != nil {
				return err
			}
			if err := tx.Model(&domain.Invoice{}).Where("customer_id = ?", customer.ID).Count(&invoicesLeft).Error; err != nil {
				return err
			}
			if err := tx.Model(&domain.Payment{}).Where("customer_id = ?", customer.ID).Count(&paymentsLeft).Error; err != nil {
				return err
			}
			if subscriptionsLeft+invoicesLeft+paymentsLeft == 0 {
				if err := tx.Delete(&customer).Error; err != nil {
					return err
				}
			}
		}
	}
	var demoPackages []domain.InternetPackage
	if err := tx.Where("code LIKE ? AND description LIKE ?", "DEMO-PKG-%", demoMarker+":%").Find(&demoPackages).Error; err != nil {
		return err
	}
	for _, pkg := range demoPackages {
		var subscriptions int64
		if err := tx.Model(&domain.Subscription{}).Where("package_id = ?", pkg.ID).Count(&subscriptions).Error; err != nil {
			return err
		}
		if subscriptions == 0 {
			if err := tx.Delete(&pkg).Error; err != nil {
				return err
			}
		}
	}
	var demoTargets []domain.NetMonitorTarget
	if err := tx.Where("name LIKE ? AND last_error LIKE ?", "demo-monitor-%", demoMarker+":%").Find(&demoTargets).Error; err != nil {
		return err
	}
	if len(demoTargets) > 0 {
		targetIDs := make([]int64, 0, len(demoTargets))
		for _, target := range demoTargets {
			var samples, incidents int64
			if err := tx.Model(&domain.NetMonitorSample{}).Where("target_id = ?", target.ID).Count(&samples).Error; err != nil {
				return err
			}
			if err := tx.Model(&domain.NetMonitorIncident{}).Where("target_id = ?", target.ID).Count(&incidents).Error; err != nil {
				return err
			}
			if target.Enabled || samples > 0 || incidents > 0 {
				continue
			}
			targetIDs = append(targetIDs, target.ID)
		}
		if len(targetIDs) > 0 {
			if err := tx.Where("id IN ?", targetIDs).Delete(&domain.NetMonitorTarget{}).Error; err != nil {
				return err
			}
		}
	}
	if err := tx.Where("nas_class = ?", demoMarker).Delete(&domain.RadiusAccounting{}).Error; err != nil {
		return err
	}
	if err := tx.Where("nas_class = ?", demoMarker).Delete(&domain.RadiusOnline{}).Error; err != nil {
		return err
	}
	if err := deleteUnusedDemoRecords(tx); err != nil {
		return err
	}
	return nil
}

func deleteUnusedDemoRecords(tx *gorm.DB) error {
	var users []domain.RadiusUser
	if err := tx.Where("remark = ?", demoMarker).Find(&users).Error; err != nil {
		return err
	}
	for _, user := range users {
		var subscriptions int64
		if err := tx.Model(&domain.Subscription{}).Where("radius_user_id = ?", user.ID).Count(&subscriptions).Error; err != nil {
			return err
		}
		if subscriptions == 0 {
			if err := tx.Delete(&user).Error; err != nil {
				return err
			}
		}
	}

	var profiles []domain.RadiusProfile
	if err := tx.Where("remark = ?", demoMarker).Find(&profiles).Error; err != nil {
		return err
	}
	for _, profile := range profiles {
		var usersCount, packagesCount int64
		if err := tx.Model(&domain.RadiusUser{}).Where("profile_id = ?", profile.ID).Count(&usersCount).Error; err != nil {
			return err
		}
		if err := tx.Model(&domain.InternetPackage{}).Where("radius_profile_id = ?", profile.ID).Count(&packagesCount).Error; err != nil {
			return err
		}
		if usersCount+packagesCount == 0 {
			if err := tx.Delete(&profile).Error; err != nil {
				return err
			}
		}
	}

	var nasRows []domain.NetNas
	if err := tx.Where("remark = ?", demoMarker).Find(&nasRows).Error; err != nil {
		return err
	}
	for _, nas := range nasRows {
		var onlineCount, accountingCount int64
		if err := tx.Model(&domain.RadiusOnline{}).Where("nas_id = ?", nas.Identifier).Count(&onlineCount).Error; err != nil {
			return err
		}
		if err := tx.Model(&domain.RadiusAccounting{}).Where("nas_id = ?", nas.Identifier).Count(&accountingCount).Error; err != nil {
			return err
		}
		if onlineCount+accountingCount == 0 {
			if err := tx.Delete(&nas).Error; err != nil {
				return err
			}
		}
	}

	var nodes []domain.NetNode
	if err := tx.Where("remark = ?", demoMarker).Find(&nodes).Error; err != nil {
		return err
	}
	for _, node := range nodes {
		var nasCount, profileCount int64
		if err := tx.Model(&domain.NetNas{}).Where("node_id = ?", node.ID).Count(&nasCount).Error; err != nil {
			return err
		}
		if err := tx.Model(&domain.RadiusProfile{}).Where("node_id = ?", node.ID).Count(&profileCount).Error; err != nil {
			return err
		}
		if nasCount+profileCount == 0 {
			if err := tx.Delete(&node).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *demoSeeder) seedNodes(tx *gorm.DB) error {
	s.ctx.nodes = make(map[string]*domain.NetNode)
	specs := []struct {
		Name string
		Tags string
	}{
		{Name: "demo-core", Tags: "core,metro"},
		{Name: "demo-edge", Tags: "edge,ftth"},
		{Name: "demo-access", Tags: "access,ftth"},
	}

	for _, spec := range specs {
		record := domain.NetNode{
			Name:   spec.Name,
			Remark: demoMarker,
			Tags:   spec.Tags,
		}
		if err := tx.Where("name = ?", spec.Name).FirstOrCreate(&record).Error; err != nil {
			return err
		}
		s.ctx.nodes[spec.Name] = &record
	}
	return nil
}

func (s *demoSeeder) seedNAS(tx *gorm.DB) error {
	s.ctx.nas = make(map[string]*domain.NetNas)
	specs := []struct {
		Name       string
		Identifier string
		Hostname   string
		IPAddr     string
		Secret     string
		Node       string
		VendorCode string
	}{
		{Name: "demo-bras-1", Identifier: "demo-bras-1", Hostname: "bras1.demo.local", IPAddr: "10.0.0.1", Secret: "demo-secret", Node: "demo-core", VendorCode: "2011"},
		{Name: "demo-bras-2", Identifier: "demo-bras-2", Hostname: "bras2.demo.local", IPAddr: "10.0.1.1", Secret: "demo-secret", Node: "demo-edge", VendorCode: "25506"},
		{Name: "demo-bras-3", Identifier: "demo-bras-3", Hostname: "bras3.demo.local", IPAddr: "10.0.2.1", Secret: "demo-secret", Node: "demo-access", VendorCode: "9999"},
	}

	for _, spec := range specs {
		node := s.ctx.nodes[spec.Node]
		if node == nil {
			return fmt.Errorf("node %s not found", spec.Node)
		}
		record := domain.NetNas{
			NodeId:     node.ID,
			Name:       spec.Name,
			Identifier: spec.Identifier,
			Hostname:   spec.Hostname,
			Ipaddr:     spec.IPAddr,
			Secret:     spec.Secret,
			Status:     "disabled",
			VendorCode: spec.VendorCode,
			Tags:       "demo",
			Remark:     demoMarker,
		}
		if err := tx.Where("identifier = ?", spec.Identifier).FirstOrCreate(&record).Error; err != nil {
			return err
		}
		s.ctx.nas[spec.Name] = &record
	}
	return nil
}

func (s *demoSeeder) seedProfiles(tx *gorm.DB) error {
	s.ctx.profiles = make(map[string]*domain.RadiusProfile)
	node := s.ctx.nodes["demo-edge"]
	if node == nil {
		return fmt.Errorf("default node not found")
	}
	specs := []struct {
		Name      string
		UpRate    int
		DownRate  int
		ActiveNum int
	}{
		{Name: "demo-basic", UpRate: 50_000, DownRate: 200_000, ActiveNum: 2},
		{Name: "demo-premium", UpRate: 100_000, DownRate: 500_000, ActiveNum: 4},
		{Name: "demo-vip", UpRate: 200_000, DownRate: 1_000_000, ActiveNum: 8},
	}

	for _, spec := range specs {
		record := domain.RadiusProfile{
			NodeId:    node.ID,
			Name:      spec.Name,
			Status:    "enabled",
			ActiveNum: spec.ActiveNum,
			UpRate:    spec.UpRate,
			DownRate:  spec.DownRate,
			Remark:    demoMarker,
		}
		if err := tx.Where("name = ?", spec.Name).FirstOrCreate(&record).Error; err != nil {
			return err
		}
		s.ctx.profiles[spec.Name] = &record
	}
	return nil
}

func (s *demoSeeder) seedUsers(tx *gorm.DB) error {
	s.ctx.users = make(map[string]*domain.RadiusUser)
	specs := []struct {
		Username   string
		Realname   string
		Profile    string
		Node       string
		ExpireDays int
		Mobile     string
		Addr       string
	}{
		{"demo-alice", "Alice Chen", "demo-basic", "demo-core", 180, "13800000001", "Building A"},
		{"demo-bob", "Bob Li", "demo-basic", "demo-edge", 365, "13800000002", "Building B"},
		{"demo-carol", "Carol Wu", "demo-premium", "demo-core", 120, "13800000003", "Campus East"},
		{"demo-dave", "Dave Zhang", "demo-premium", "demo-edge", 60, "13800000004", "Campus West"},
		{"demo-eve", "Eve Qian", "demo-vip", "demo-core", 365, "13800000005", "HQ"},
		{"demo-frank", "Frank Gu", "demo-vip", "demo-edge", 90, "13800000006", "Branch"},
	}

	for idx, spec := range specs {
		profile := s.ctx.profiles[spec.Profile]
		node := s.ctx.nodes[spec.Node]
		if profile == nil || node == nil {
			return fmt.Errorf("missing profile or node for user %s", spec.Username)
		}
		record := domain.RadiusUser{
			NodeId:     node.ID,
			ProfileId:  profile.ID,
			Username:   spec.Username,
			Password:   "123456",
			Realname:   spec.Realname,
			Mobile:     spec.Mobile,
			AddrPool:   "demo-pool",
			ActiveNum:  2,
			UpRate:     profile.UpRate,
			DownRate:   profile.DownRate,
			Vlanid1:    100 + idx,
			IpAddr:     fmt.Sprintf("10.8.0.%d", 10+idx),
			MacAddr:    fmt.Sprintf("00:11:22:33:44:%02X", idx),
			Status:     "disabled",
			ExpireTime: s.now.AddDate(0, 0, spec.ExpireDays),
			Remark:     demoMarker,
		}
		if err := tx.Where("username = ?", spec.Username).FirstOrCreate(&record).Error; err != nil {
			return err
		}
		s.ctx.users[spec.Username] = &record
	}
	return nil
}

func (s *demoSeeder) seedBusinessRecords(tx *gorm.DB) error {
	profiles := []string{"demo-basic", "demo-premium", "demo-vip"}
	packages := []domain.InternetPackage{
		{Code: "DEMO-PKG-STARTER", Name: "Sample Fiber 50", Price: 250_000, Description: "demo-seed: 50 Mbps sample package", BillingCycle: "monthly", Status: "active"},
		{Code: "DEMO-PKG-FAMILY", Name: "Sample Fiber 100", Price: 350_000, Description: "demo-seed: 100 Mbps sample package", BillingCycle: "monthly", Status: "active"},
		{Code: "DEMO-PKG-PRO", Name: "Sample Fiber 300", Price: 550_000, Description: "demo-seed: 300 Mbps sample package", BillingCycle: "monthly", Status: "active"},
	}
	for i := range packages {
		profile := s.ctx.profiles[profiles[i]]
		if profile == nil {
			return fmt.Errorf("sample profile %s not found", profiles[i])
		}
		packages[i].RadiusProfileID = profile.ID
		if err := tx.Where("code = ?", packages[i].Code).FirstOrCreate(&packages[i]).Error; err != nil {
			return err
		}
		s.packageCount++
	}

	customerNames := []string{"Sample Ayu Pratama", "Sample Bima Santoso", "Sample Citra Lestari", "Sample Danu Wijaya", "Sample Eka Permata", "Sample Farah Nabila"}
	usernames := []string{"demo-alice", "demo-bob", "demo-carol", "demo-dave", "demo-eve", "demo-frank"}
	subscriptionIDs := make([]int64, 0, len(customerNames))
	for i, name := range customerNames {
		customer := domain.Customer{
			CustomerNo: fmt.Sprintf("TMP-DEMO-CUST-%04d", i+1), Name: name,
			Address: fmt.Sprintf("Sample Street %d", i+1), City: "Jakarta", Province: "DKI Jakarta",
			Status: domain.CustomerActive, Notes: demoMarker,
		}
		if err := tx.Where("name = ? AND notes = ?", name, demoMarker).FirstOrCreate(&customer).Error; err != nil {
			return err
		}
		if strings.HasPrefix(customer.CustomerNo, "TMP-DEMO-") {
			customer.CustomerNo = fmt.Sprintf("MWX-%06d", customer.ID)
			if err := tx.Model(&customer).Update("customer_no", customer.CustomerNo).Error; err != nil {
				return err
			}
		}
		s.customerCount++
		var user domain.RadiusUser
		if err := tx.Where("username = ?", usernames[i]).First(&user).Error; err != nil {
			return fmt.Errorf("sample RADIUS user %s: %w", usernames[i], err)
		}
		pkg := packages[i%len(packages)]
		seedEvent := domain.BillingEvent{CustomerID: customer.ID, Type: "demo_seed", Description: demoMarker, CreatedAt: s.now}
		result := tx.Where("customer_id = ? AND type = ? AND description = ?", customer.ID, seedEvent.Type, seedEvent.Description).FirstOrCreate(&seedEvent)
		if result.Error != nil {
			return result.Error
		}
		var subscription domain.Subscription
		if result.RowsAffected == 0 {
			if err := tx.First(&subscription, seedEvent.SubscriptionID).Error; err != nil {
				return err
			}
		} else {
			subscription = domain.Subscription{
				SubscriptionNo: fmt.Sprintf("TMP-DEMO-SUB-%04d", i+1), CustomerID: customer.ID,
				PackageID: pkg.ID, RadiusUserID: user.ID, Status: domain.SubscriptionActive,
				StartDate: s.now.AddDate(0, -1, 0), BillingDay: 1, GraceDays: 3,
			}
			if err := tx.Create(&subscription).Error; err != nil {
				return err
			}
			subscription.SubscriptionNo = fmt.Sprintf("SUB-%06d", subscription.ID)
			if err := tx.Model(&subscription).Update("subscription_no", subscription.SubscriptionNo).Error; err != nil {
				return err
			}
			if err := tx.Model(&seedEvent).Update("subscription_id", subscription.ID).Error; err != nil {
				return err
			}
		}
		s.subscriptionCount++
		subscriptionIDs = append(subscriptionIDs, subscription.ID)
	}

	periodStart := time.Date(s.now.Year(), s.now.Month(), 1, 0, 0, 0, 0, s.now.Location())
	var existingInvoices []domain.Invoice
	if err := tx.Where("subscription_id IN ? AND period_start = ?", subscriptionIDs, periodStart).Find(&existingInvoices).Error; err != nil {
		return err
	}
	existingInvoiceIDs := make(map[int64]bool, len(existingInvoices))
	for _, invoice := range existingInvoices {
		existingInvoiceIDs[invoice.ID] = true
	}
	_, err := billing.GenerateMonthlyInvoicesForSubscriptions(tx, s.now, 10, subscriptionIDs)
	if err != nil {
		return fmt.Errorf("generate sample invoices: %w", err)
	}
	var invoices []domain.Invoice
	if err := tx.Where("subscription_id IN ? AND period_start = ?", subscriptionIDs, periodStart).Order("subscription_id").Find(&invoices).Error; err != nil {
		return err
	}
	demoInvoices := make([]domain.Invoice, 0, len(invoices))
	for _, invoice := range invoices {
		if !existingInvoiceIDs[invoice.ID] {
			if err := tx.Model(&invoice).Update("notes", demoMarker).Error; err != nil {
				return err
			}
			invoice.Notes = demoMarker
		}
		if invoice.Notes == demoMarker {
			demoInvoices = append(demoInvoices, invoice)
		}
	}
	s.invoiceCount = len(demoInvoices)
	for i := 0; i < 3 && i < len(demoInvoices); i++ {
		var existingPayments int64
		if err := tx.Model(&domain.Payment{}).Where("invoice_id = ? AND notes = ?", demoInvoices[i].ID, demoMarker).Count(&existingPayments).Error; err != nil {
			return err
		}
		if existingPayments > 0 || demoInvoices[i].Balance <= 0 {
			continue
		}
		amount := demoInvoices[i].Balance
		if i == 1 {
			amount /= 2
		}
		payment := domain.Payment{
			InvoiceID: demoInvoices[i].ID, Amount: amount,
			Method: "bank_transfer", Reference: fmt.Sprintf("DEMO-REF-%04d", i+1), Notes: demoMarker,
		}
		if err := billing.RecordPayment(tx, &payment, s.now, false); err != nil {
			return fmt.Errorf("create sample payment: %w", err)
		}
		s.paymentCount++
	}
	return nil
}

func (s *demoSeeder) seedMonitorTargets(tx *gorm.DB) error {
	specs := []struct {
		name string
		addr string
		port int
	}{
		{"demo-monitor-edge", "192.0.2.10", 443},
		{"demo-monitor-core", "192.0.2.20", 22},
		{"demo-monitor-access", "192.0.2.30", 161},
	}
	for _, spec := range specs {
		target := domain.NetMonitorTarget{
			Name: spec.name, Kind: "router", Address: spec.addr,
			ProbeType: "tcp", Port: spec.port, IntervalSeconds: 60,
			TimeoutMilliseconds: 1500, FailureThreshold: 2,
			Enabled: false, LastStatus: "unknown",
			LastError: demoMarker + ": sample only; replace the documentation address and explicitly enable before use.",
		}
		result := tx.Where("name = ?", spec.name).FirstOrCreate(&target)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected > 0 {
			if err := tx.Model(&target).Update("enabled", false).Error; err != nil {
				return err
			}
			target.Enabled = false
		}
		if !target.Enabled && strings.HasPrefix(target.Address, "192.0.2.") {
			s.monitorCount++
		}
	}
	return nil
}

func (s *demoSeeder) seedAccountingHistory(tx *gorm.DB) error {
	if err := tx.Where("nas_class = ?", demoMarker).Delete(&domain.RadiusAccounting{}).Error; err != nil {
		return err
	}

	if len(s.ctx.users) == 0 {
		return fmt.Errorf("no users to generate accounting history")
	}
	nasList := make([]*domain.NetNas, 0, len(s.ctx.nas))
	for _, nas := range s.ctx.nas {
		nasList = append(nasList, nas)
	}
	usernames := make([]string, 0, len(s.ctx.users))
	for name := range s.ctx.users {
		usernames = append(usernames, name)
	}
	sort.Strings(usernames)
	sort.Slice(nasList, func(i, j int) bool { return nasList[i].Name < nasList[j].Name })
	rng := rand.New(rand.NewSource(42)) //nolint:gosec // G404: deterministic seed for reproducible demo data
	startDay := startOfDay(s.now).AddDate(0, 0, -(s.historyDays - 1))

	for day := 0; day < s.historyDays; day++ {
		dayStart := startDay.AddDate(0, 0, day)
		for idx, username := range usernames {
			if idx >= 4 {
				break
			}
			sessionStart := dayStart.Add(time.Duration((idx*3+day)%24) * time.Hour).Add(time.Duration(rng.Intn(30)) * time.Minute)
			duration := time.Duration(30+rng.Intn(90)) * time.Minute
			upBytes := int64(400+day*30+idx*20) * 1024 * 1024
			downBytes := int64(900+day*40+idx*25) * 1024 * 1024
			nas := nasList[(day+idx)%len(nasList)]
			accounting := domain.RadiusAccounting{
				Username:          username,
				AcctSessionId:     fmt.Sprintf("demo-acct-%d-%d-%s", day, idx, username),
				NasId:             nas.Identifier,
				NasAddr:           nas.Ipaddr,
				NasPaddr:          nas.Ipaddr,
				SessionTimeout:    7200,
				FramedIpaddr:      fmt.Sprintf("10.99.%d.%d", idx+1, day+10),
				FramedNetmask:     "255.255.255.0",
				MacAddr:           fmt.Sprintf("6C:FA:A7:%02X:%02X:%02X", day, idx, (day+idx)%255),
				ServiceType:       2,
				NasPort:           int64(2000 + idx),
				NasPortId:         fmt.Sprintf("vlan/%d", 200+idx),
				NasPortType:       15,
				AcctSessionTime:   int(duration.Seconds()),
				AcctInputTotal:    upBytes,
				AcctOutputTotal:   downBytes,
				AcctInputPackets:  1500 + rng.Intn(900),
				AcctOutputPackets: 2000 + rng.Intn(1200),
				AcctStartTime:     sessionStart,
				AcctStopTime:      sessionStart.Add(duration),
				LastUpdate:        sessionStart.Add(duration),
				NasClass:          demoMarker,
			}
			if err := tx.Create(&accounting).Error; err != nil {
				return err
			}
			s.accountingCount++
		}
	}

	// Heavier traffic samples during last 24 hours for better charts
	hourlyStart := s.now.Add(-23 * time.Hour)
	topUsers := usernames
	if len(topUsers) > 2 {
		topUsers = topUsers[:2]
	}
	for hour := 0; hour < 24; hour++ {
		slot := hourlyStart.Add(time.Duration(hour) * time.Hour)
		for idx, username := range topUsers {
			nas := nasList[(hour+idx)%len(nasList)]
			upBytes := int64(120+hour*5+idx*30) * 1024 * 1024
			downBytes := int64(200+hour*7+idx*25) * 1024 * 1024
			accounting := domain.RadiusAccounting{
				Username:          username,
				AcctSessionId:     fmt.Sprintf("demo-24h-%d-%d-%s", hour, idx, username),
				NasId:             nas.Identifier,
				NasAddr:           nas.Ipaddr,
				NasPaddr:          nas.Ipaddr,
				SessionTimeout:    3600,
				FramedIpaddr:      fmt.Sprintf("10.200.%d.%d", idx+1, hour+1),
				FramedNetmask:     "255.255.255.0",
				MacAddr:           fmt.Sprintf("8A:BC:%02X:%02X:%02X:%02X", hour, idx, hour+idx, idx+10),
				ServiceType:       2,
				NasPort:           int64(3000 + idx),
				NasPortId:         fmt.Sprintf("pppoe-%d", hour+idx),
				NasPortType:       15,
				AcctSessionTime:   int((20 * time.Minute).Seconds()),
				AcctInputTotal:    upBytes,
				AcctOutputTotal:   downBytes,
				AcctInputPackets:  800 + hour*10 + idx*50,
				AcctOutputPackets: 900 + hour*12 + idx*60,
				AcctStartTime:     slot,
				AcctStopTime:      slot.Add(20 * time.Minute),
				LastUpdate:        slot.Add(20 * time.Minute),
				NasClass:          demoMarker,
			}
			if err := tx.Create(&accounting).Error; err != nil {
				return err
			}
			s.accountingCount++
		}
	}
	return nil
}

func startOfDay(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
}
