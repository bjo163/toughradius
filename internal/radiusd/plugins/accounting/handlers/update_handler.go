package handlers

import (
	"time"

	"github.com/talkincode/toughradius/v9/internal/domain"
	"github.com/talkincode/toughradius/v9/internal/radiusd/plugins/accounting"
	vendorparserspkg "github.com/talkincode/toughradius/v9/internal/radiusd/plugins/vendorparsers"
	"github.com/talkincode/toughradius/v9/internal/radiusd/repository"
	"github.com/talkincode/toughradius/v9/pkg/common"
	"go.uber.org/zap"
	"layeh.com/radius/rfc2865"
	"layeh.com/radius/rfc2866"
	"layeh.com/radius/rfc2869"
)

// UpdateHandler Accounting Update handler
type UpdateHandler struct {
	sessionRepo    repository.SessionRepository
	accountingRepo repository.AccountingRepository
}

// NewUpdateHandler CreateAccounting Update handler
func NewUpdateHandler(sessionRepo repository.SessionRepository, accountingRepo repository.AccountingRepository) *UpdateHandler {
	return &UpdateHandler{
		sessionRepo:    sessionRepo,
		accountingRepo: accountingRepo,
	}
}

func (h *UpdateHandler) Name() string {
	return "UpdateHandler"
}

func (h *UpdateHandler) CanHandle(ctx *accounting.AccountingContext) bool {
	return ctx.StatusType == int(rfc2866.AcctStatusType_Value_InterimUpdate)
}

func (h *UpdateHandler) Handle(acctCtx *accounting.AccountingContext) error {
	vendorReq := acctCtx.VendorReq
	if vendorReq == nil {
		vendorReq = &vendorparserspkg.VendorRequest{}
	}

	// Build online session data
	online := buildOnlineFromRequest(acctCtx, vendorReq)

	// Check if session exists
	exists, err := h.sessionRepo.Exists(acctCtx.Context, online.AcctSessionId)
	if err != nil {
		zap.L().Error("check radius online session existence error",
			zap.String("namespace", "radius"),
			zap.String("username", acctCtx.Username),
			zap.Error(err),
		)
		return err
	}

	// If session doesn't exist, create it (handles case where Start packet didn't arrive)
	if !exists {
		// Build a complete session record from interim-update packet
		fullOnline := domain.RadiusOnline{
			ID:                common.UUIDint64(),
			Username:          acctCtx.Username,
			NasId:             acctCtx.NAS.Identifier,
			NasAddr:           acctCtx.NAS.Ipaddr,
			NasPaddr:          acctCtx.NASIP,
			SessionTimeout:    int(rfc2865.SessionTimeout_Get(acctCtx.Request.Packet)),
			FramedIpaddr:      common.IfEmptyStr(rfc2865.FramedIPAddress_Get(acctCtx.Request.Packet).String(), common.NA),
			FramedNetmask:     common.IfEmptyStr(rfc2865.FramedIPNetmask_Get(acctCtx.Request.Packet).String(), common.NA),
			MacAddr:           vendorReq.MacAddr,
			NasPort:           0, // Not available in accounting requests typically
			NasClass:          common.NA,
			NasPortId:         common.IfEmptyStr(rfc2869.NASPortID_GetString(acctCtx.Request.Packet), common.NA),
			NasPortType:       0, // Not available in accounting requests typically
			ServiceType:       0, // Not available in accounting requests typically
			AcctSessionId:     online.AcctSessionId,
			AcctSessionTime:   online.AcctSessionTime,
			AcctInputTotal:    online.AcctInputTotal,
			AcctOutputTotal:   online.AcctOutputTotal,
			AcctInputPackets:  online.AcctInputPackets,
			AcctOutputPackets: online.AcctOutputPackets,
			AcctStartTime:     time.Now().Add(-time.Duration(online.AcctSessionTime) * time.Second),
			LastUpdate:        time.Now(),
		}

		err := h.sessionRepo.Create(acctCtx.Context, &fullOnline)
		if err != nil {
			zap.L().Error("create radius online session from interim-update error",
				zap.String("namespace", "radius"),
				zap.String("username", acctCtx.Username),
				zap.Error(err),
			)
			return err
		}

		// Also create the initial accounting record
		if h.accountingRepo != nil {
			accounting := domain.RadiusAccounting{
				AcctSessionId:     online.AcctSessionId,
				Username:          acctCtx.Username,
				NasAddr:           acctCtx.NAS.Ipaddr,
				NasId:             acctCtx.NAS.Identifier,
				FramedIpaddr:      fullOnline.FramedIpaddr,
				MacAddr:           vendorReq.MacAddr,
				AcctSessionTime:   online.AcctSessionTime,
				AcctInputTotal:    online.AcctInputTotal,
				AcctOutputTotal:   online.AcctOutputTotal,
				AcctInputPackets:  online.AcctInputPackets,
				AcctOutputPackets: online.AcctOutputPackets,
				AcctStartTime:     fullOnline.AcctStartTime,
				LastUpdate:        time.Now(),
			}
			if err := h.accountingRepo.Create(acctCtx.Context, &accounting); err != nil {
				zap.L().Warn("create initial accounting record from interim-update error",
					zap.String("namespace", "radius"),
					zap.String("username", acctCtx.Username),
					zap.Error(err),
				)
				// Don't return error for accounting creation, it's not critical
			}
		}

		zap.L().Info("created radius online session from interim-update packet",
			zap.String("namespace", "radius"),
			zap.String("username", acctCtx.Username),
			zap.String("acct_session_id", online.AcctSessionId),
		)
		return nil
	}

	// Update the existing online session record
	err = h.sessionRepo.Update(acctCtx.Context, &online)
	if err != nil {
		zap.L().Error("update radius online error",
			zap.String("namespace", "radius"),
			zap.String("username", acctCtx.Username),
			zap.Error(err),
		)
		return err
	}

	return nil
}

// buildOnlineFromRequest Build online session data from request（used for Update）
func buildOnlineFromRequest(acctCtx *accounting.AccountingContext, vr *vendorparserspkg.VendorRequest) domain.RadiusOnline {
	r := acctCtx.Request
	acctInputOctets := int(rfc2866.AcctInputOctets_Get(r.Packet))
	acctInputGigawords := int(rfc2869.AcctInputGigawords_Get(r.Packet))
	acctOutputOctets := int(rfc2866.AcctOutputOctets_Get(r.Packet))
	acctOutputGigawords := int(rfc2869.AcctOutputGigawords_Get(r.Packet))

	return domain.RadiusOnline{
		AcctSessionId:     rfc2866.AcctSessionID_GetString(r.Packet),
		AcctSessionTime:   int(rfc2866.AcctSessionTime_Get(r.Packet)),
		AcctInputTotal:    int64(acctInputOctets) + int64(acctInputGigawords)*4*1024*1024*1024,
		AcctOutputTotal:   int64(acctOutputOctets) + int64(acctOutputGigawords)*4*1024*1024*1024,
		AcctInputPackets:  int(rfc2866.AcctInputPackets_Get(r.Packet)),
		AcctOutputPackets: int(rfc2866.AcctOutputPackets_Get(r.Packet)),
		LastUpdate:        time.Now(),
	}
}
