package domain

// Tables lists the complete set of domain models migrated by application startup.
// New ISP models are appended so existing RADIUS tables and subscriber rows remain intact.
var Tables = []interface{}{
	// System
	&SysConfig{},
	&SysOpr{},
	&SysOprLog{},
	&SysCert{},
	// Network
	&NetNode{},
	&NetNas{},
	// Radius
	&RadiusAccounting{},
	&RadiusOnline{},
	&RadiusSessionActionAudit{},
	&RadiusProfile{},
	&RadiusUser{},
	// ISP management and billing (additive; existing RADIUS tables remain intact).
	&Customer{},
	&InternetPackage{},
	&Subscription{},
	&Invoice{},
	&InvoiceItem{},
	&Payment{},
	&BillingEvent{},
	&DocumentSequence{},
}
