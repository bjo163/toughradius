package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"runtime"
	"time"
	_ "time/tzdata"

	"github.com/bjo163/mwx-isp/config"
	"github.com/bjo163/mwx-isp/internal/adminapi"
	"github.com/bjo163/mwx-isp/internal/app"
	"github.com/bjo163/mwx-isp/internal/domain"
	"github.com/bjo163/mwx-isp/internal/radiusd"
	"github.com/bjo163/mwx-isp/internal/webserver"
	"github.com/bjo163/mwx-isp/pkg/common"
	"golang.org/x/sync/errgroup"

	// Import vendor parsers for auto-registration via init()
	"github.com/bjo163/mwx-isp/internal/radiusd/plugins"
	_ "github.com/bjo163/mwx-isp/internal/radiusd/plugins/vendorparsers/parsers"
)

var g errgroup.Group

// Build information, injected via ldflags at compile time
// Example: go build -ldflags "-X main.Version=1.0.0 -X main.BuildTime=2024-01-01T00:00:00Z -X main.GitCommit=abc123"
var (
	// Version is the application version injected at build time.
	Version = "develop"
	// BuildTime is the UTC build timestamp injected at build time.
	BuildTime = "unknown"
	// GitCommit is the source commit hash injected at build time.
	GitCommit = "unknown"
)

var (
	h        = flag.Bool("h", false, "help usage")
	showVer  = flag.Bool("v", false, "show version")
	conffile = flag.String("c", "", "config yaml file")
	initdb   = flag.Bool("initdb", false, "run initdb")
	printcfg = flag.Bool("printcfg", false, "print config")
)

func PrintVersion() {
	_, _ = fmt.Fprintf(os.Stdout, "MWX-ISP %s\n", Version)                             //nolint:errcheck
	_, _ = fmt.Fprintf(os.Stdout, "Build Time: %s\n", BuildTime)                       //nolint:errcheck
	_, _ = fmt.Fprintf(os.Stdout, "Git Commit: %s\n", GitCommit)                       //nolint:errcheck
	_, _ = fmt.Fprintf(os.Stdout, "Go Version: %s\n", runtime.Version())               //nolint:errcheck
	_, _ = fmt.Fprintf(os.Stdout, "OS/Arch:    %s/%s\n", runtime.GOOS, runtime.GOARCH) //nolint:errcheck
}

func printHelp() {
	if *h {
		flag.PrintDefaults()
		os.Exit(0)
	}
}

func main() {
	runtime.GOMAXPROCS(runtime.NumCPU())
	flag.Parse()

	if *showVer {
		PrintVersion()
		os.Exit(0)
	}

	printHelp()

	_config := config.LoadConfig(*conffile)

	if *printcfg {
		fmt.Printf("%+v\n", common.ToJson(_config))
		return
	}

	// Create and initialize application context
	application := app.NewApplication(_config)
	coaService := radiusd.NewCoAService(nil, radiusd.WithCoATimeout(3*time.Second), radiusd.WithCoARetries(1))
	application.SetSessionDisconnectHandler(func(ctx context.Context, session domain.RadiusOnline) error {
		var nas domain.NetNas
		if err := application.DB().Where("ipaddr = ?", session.NasAddr).First(&nas).Error; err != nil {
			return err
		}
		result, err := coaService.Disconnect(ctx, radiusd.CoATargetFromNas(&nas), radiusd.SessionIdentityFromOnline(&session))
		if err != nil {
			return err
		}
		if !result.Success {
			if result.Err != "" {
				return errors.New(result.Err)
			}
			return fmt.Errorf("disconnect was not acknowledged: %s", result.ResponseCode)
		}
		return application.DB().Create(&domain.RadiusSessionActionAudit{
			AcctSessionID: result.AcctSessionID,
			Action:        string(result.Action),
			Username:      result.Username,
			NasAddr:       session.NasAddr,
			Target:        result.Target,
			Success:       result.Success,
			ResponseCode:  result.ResponseCode,
			Attempts:      result.Attempts,
			RTTMillis:     result.RTT.Milliseconds(),
			TriggeredAt:   result.SentAt,
		}).Error
	})
	application.Init(_config)

	if *initdb {
		application.InitDb()
		return
	}
	defer application.Release()

	// Initialize web server and admin API with dependency injection
	g.Go(func() error {
		webserver.Init(application)
		adminapi.Init(application)
		return webserver.Listen(application)
	})

	// Initialize RADIUS service with dependency injection
	radiusService := radiusd.NewRadiusService(application)
	defer radiusService.Release()

	// Initialize plugin system after RadiusService is created
	plugins.InitPlugins(application, radiusService.SessionRepo, radiusService.AccountingRepo)

	// Start RADIUS Auth server
	g.Go(func() error {
		return radiusd.ListenRadiusAuthServer(application, radiusd.NewAuthService(radiusService))
	})

	// Start RADIUS Acct server
	g.Go(func() error {
		return radiusd.ListenRadiusAcctServer(application, radiusd.NewAcctService(radiusService))
	})

	// Start RadSec server
	g.Go(func() error {
		radsec := radiusd.NewRadsecService(
			radiusd.NewAuthService(radiusService),
			radiusd.NewAcctService(radiusService),
		)
		return radiusd.ListenRadsecServer(application, radsec)
	})

	if err := g.Wait(); err != nil {
		log.Fatal(err)
	}
}
