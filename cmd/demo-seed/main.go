package main

import (
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/talkincode/toughradius/v9/config"
	"github.com/talkincode/toughradius/v9/internal/app"
	"github.com/talkincode/toughradius/v9/internal/demoseed"
	"go.uber.org/zap"
)

func main() {
	cfgPath := flag.String("c", "toughradius.yml", "path to config file")
	days := flag.Int("days", 7, "number of days of accounting history to generate")
	clean := flag.Bool("clean", false, "remove only records marked by this demo seeder")
	flag.Parse()
	if !*clean && (*days < 1 || *days > 90) {
		fmt.Fprintln(os.Stderr, "-days must be between 1 and 90")
		os.Exit(2)
	}

	cfg := config.LoadConfig(*cfgPath)
	application := app.NewApplication(cfg)
	application.Init(cfg)
	defer application.Release()

	if *clean {
		if err := demoseed.Clean(application.DB()); err != nil {
			zap.L().Fatal("demo cleanup failed", zap.Error(err))
		}
		fmt.Println("Marked demo data removed. Monthly sequence counters were preserved.")
		return
	}

	counts, err := demoseed.Seed(application.DB(), time.Now(), *days)
	if err != nil {
		zap.L().Fatal("seed data failed", zap.Error(err))
	}
	fmt.Println("Demo data inserted successfully!")
	fmt.Printf("  Nodes: %d\n", counts.Nodes)
	fmt.Printf("  NAS devices: %d\n", counts.NAS)
	fmt.Printf("  Profiles: %d\n", counts.Profiles)
	fmt.Printf("  Users: %d\n", counts.Users)
	fmt.Printf("  Customers: %d\n", counts.Customers)
	fmt.Printf("  Packages: %d\n", counts.Packages)
	fmt.Printf("  Subscriptions: %d\n", counts.Subscriptions)
	fmt.Printf("  Invoices: %d\n", counts.Invoices)
	fmt.Printf("  Payments: %d\n", counts.Payments)
	fmt.Printf("  Disabled sample monitor targets: %d\n", counts.MonitorTargets)
	fmt.Printf("  Accounting records: %d\n", counts.AccountingRecords)
	fmt.Println("  Live sessions and probe results are not simulated.")
}
