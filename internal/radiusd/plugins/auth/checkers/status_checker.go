package checkers

import (
	"context"

	"github.com/bjo163/mwx-isp/internal/radiusd/errors"
	"github.com/bjo163/mwx-isp/internal/radiusd/plugins/auth"
	"github.com/bjo163/mwx-isp/pkg/common"
)

// StatusChecker verifies user status
type StatusChecker struct{}

func (c *StatusChecker) Name() string {
	return "status"
}

func (c *StatusChecker) Order() int {
	return 5 // Execute early
}

func (c *StatusChecker) Check(ctx context.Context, authCtx *auth.AuthContext) error {
	user := authCtx.User

	if user.Status == common.DISABLED {
		return errors.NewUserDisabledError()
	}

	return nil
}
