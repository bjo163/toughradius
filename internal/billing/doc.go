// Package billing implements the ISP subscription billing lifecycle.
//
// It creates monthly invoices, records manual payments, and applies billing
// status changes to subscriptions and their linked RADIUS accounts. Database
// operations are performed through GORM and do not replace the RADIUS protocol
// server or its accounting records.
package billing
