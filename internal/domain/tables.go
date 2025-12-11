package domain

var Tables = []interface{}{
	// System
	&SysConfig{},
	&SysOpr{},
	&SysPartner{},
	&SysOprLog{},
	// Network
	&NetNode{},
	&NetNas{},
	&NetService{},
	&NetServiceMetric{},
	&NetNasMetric{},
	&NetVendor{},
	&Product{},
	&NetScheduler{},
	// Radius
	&RadiusAccounting{},
	&RadiusOnline{},
	&RadiusProfile{},
	&RadiusUser{},
}
