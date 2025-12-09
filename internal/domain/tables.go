package domain

var Tables = []interface{}{
	// System
	&SysConfig{},
	&SysOpr{},
	&SysOprLog{},
	// Network
	&NetNode{},
	&NetNas{},
	&NetVendor{},
	&NetScheduler{},
	// Radius
	&RadiusAccounting{},
	&RadiusOnline{},
	&RadiusProfile{},
	&RadiusUser{},
}
