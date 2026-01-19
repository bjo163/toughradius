package radiusd

import (
	"context"
	"fmt"

	"github.com/talkincode/toughradius/v9/internal/app"
	"github.com/talkincode/toughradius/v9/internal/domain"
	"github.com/talkincode/toughradius/v9/internal/radiusd/plugins/accounting"
	vendorparserspkg "github.com/talkincode/toughradius/v9/internal/radiusd/plugins/vendorparsers"
	"github.com/talkincode/toughradius/v9/internal/radiusd/registry"
	"go.uber.org/zap"
	"layeh.com/radius"
	"layeh.com/radius/rfc2866"
)

// HandleAccountingWithPlugins Use plugin system to handle accounting request
func (s *AcctService) HandleAccountingWithPlugins(
	ctx context.Context,
	r *radius.Request,
	vendorReq *vendorparserspkg.VendorRequest,
	username string,
	nas *domain.NetNas,
	nasIP string,
) error {
	// getAccounting-Status-Type
	// Use the typed getter to correctly interpret the 4-byte integer value of the attribute.
	// The old method of reading just the first byte (statusTypeAttr[0]) was incorrect
	// as it would read 0 for a value of 1 (0x00000001).
	statusType := rfc2866.AcctStatusType_Get(r.Packet)
	if r.Get(rfc2866.AcctStatusType_Type) == nil {
		return fmt.Errorf("missing Acct-Status-Type attribute")
	}

	// Build the AccountingContext
	acctCtx := &accounting.AccountingContext{
		Context:    ctx,
		Request:    r,
		VendorReq:  vendorReq,
		Username:   username,
		NAS:        nas,
		NASIP:      nasIP,
		StatusType: int(statusType),
	}

	// Get registered accounting handlers
	handlers := registry.GetAccountingHandlers()
	if len(handlers) == 0 {
		return fmt.Errorf("no accounting handlers registered")
	}

	// Iterate over handlers to find one that can handle this status type
	for _, handler := range handlers {
		if handler.CanHandle(acctCtx) {
			err := handler.Handle(acctCtx)
			if err != nil {
				zap.L().Error("accounting handler failed",
					zap.String("namespace", "radius"),
					zap.String("handler", handler.Name()),
					zap.String("username", username),
					zap.Int("status_type", int(statusType)),
					zap.Error(err),
				)
				return err
			}

			// Record metrics for successful handling
			switch statusType {
			case rfc2866.AcctStatusType_Value_Start: // Start
				zap.L().Info("radius accounting start",
					zap.String("namespace", "radius"),
					zap.String("metrics", app.MetricsRadiusOline),
				)
			case rfc2866.AcctStatusType_Value_Stop: // Stop
				zap.L().Info("radius accounting stop",
					zap.String("namespace", "radius"),
					zap.String("metrics", app.MetricsRadiusOffline),
				)
			}

			return nil
		}
	}

	return fmt.Errorf("no handler found for status type %d", statusType)
}
