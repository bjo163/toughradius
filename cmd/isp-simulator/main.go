package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"os"
	"strings"
	"time"

	"layeh.com/radius"
	"layeh.com/radius/rfc2865"
	"layeh.com/radius/rfc2866"
)

type TestStepResult struct {
	Name    string
	Target  string
	Latency time.Duration
	Status  string
	Success bool
	Details string
}

func main() {
	authAddr := flag.String("auth", "127.0.0.1:1812", "RADIUS Authentication server address (host:port)")
	acctAddr := flag.String("acct", "127.0.0.1:1813", "RADIUS Accounting server address (host:port)")
	coaAddr := flag.String("coa", "127.0.0.1:3799", "RADIUS CoA / Disconnect server address (host:port)")
	secret := flag.String("secret", "testing123", "RADIUS shared secret")
	username := flag.String("username", "mwx_test_user", "Subscriber username")
	password := flag.String("password", "mwx_test_pass", "Subscriber password")
	nasIP := flag.String("nas-ip", "127.0.0.1", "NAS IP address")
	nasID := flag.String("nas-id", "MWX-SIMULATOR", "NAS Identifier")
	testCoA := flag.Bool("test-coa", false, "Test sending a CoA/Disconnect packet to NAS")
	timeout := flag.Duration("timeout", 4*time.Second, "Per-request timeout")
	flag.Parse()

	fmt.Println("================================================================================")
	fmt.Println("             MWX-ISP Lifecycle & Protocol Simulator CLI                         ")
	fmt.Println("================================================================================")
	fmt.Printf(" Target Auth Server : %s\n", *authAddr)
	fmt.Printf(" Target Acct Server : %s\n", *acctAddr)
	fmt.Printf(" Shared Secret      : %s\n", *secret)
	fmt.Printf(" Test Subscriber    : %s\n", *username)
	fmt.Printf(" NAS IP / ID        : %s / %s\n", *nasIP, *nasID)
	fmt.Println("--------------------------------------------------------------------------------")

	var results []TestStepResult
	sessionID := fmt.Sprintf("SIM-%d", time.Now().Unix())

	// Step 1: Access-Request (Authentication)
	{
		fmt.Printf("\n[1/4] Sending Access-Request for '%s' to %s...\n", *username, *authAddr)
		packet := radius.New(radius.CodeAccessRequest, []byte(*secret))
		_ = rfc2865.UserName_SetString(packet, *username)
		_ = rfc2865.UserPassword_SetString(packet, *password)
		_ = rfc2865.NASIdentifier_SetString(packet, *nasID)
		_ = rfc2865.NASIPAddress_Set(packet, net.ParseIP(*nasIP))

		ctx, cancel := context.WithTimeout(context.Background(), *timeout)
		start := time.Now()
		resp, err := radius.Exchange(ctx, packet, *authAddr)
		duration := time.Since(start)
		cancel()

		if err != nil {
			fmt.Printf("      FAILED: %v\n", err)
			results = append(results, TestStepResult{
				Name:    "Access-Request",
				Target:  *authAddr,
				Latency: duration,
				Status:  "ERROR",
				Success: false,
				Details: err.Error(),
			})
		} else {
			statusStr := resp.Code.String()
			success := resp.Code == radius.CodeAccessAccept
			var details []string
			if ip := rfc2865.FramedIPAddress_Get(resp); ip != nil {
				details = append(details, fmt.Sprintf("IP=%s", ip.String()))
			}
			if timeoutSec := rfc2865.SessionTimeout_Get(resp); timeoutSec > 0 {
				details = append(details, fmt.Sprintf("SessionTimeout=%ds", timeoutSec))
			}
			// Check for vendor attributes (e.g. Mikrotik 14988)
			for _, avp := range resp.Attributes {
				if avp.Type == rfc2865.VendorSpecific_Type {
					details = append(details, fmt.Sprintf("VSA(len=%d)", len(avp.Attribute)))
				}
			}
			detailStr := strings.Join(details, ", ")
			if detailStr == "" {
				detailStr = fmt.Sprintf("Code: %s", statusStr)
			}
			fmt.Printf("      RESULT: %s in %v (%s)\n", statusStr, duration.Round(time.Millisecond), detailStr)
			results = append(results, TestStepResult{
				Name:    "Access-Request",
				Target:  *authAddr,
				Latency: duration,
				Status:  statusStr,
				Success: success,
				Details: detailStr,
			})
		}
	}

	// Step 2: Accounting-Start
	{
		fmt.Printf("\n[2/4] Sending Accounting-Start (Session ID: %s) to %s...\n", sessionID, *acctAddr)
		packet := radius.New(radius.CodeAccountingRequest, []byte(*secret))
		_ = rfc2866.AcctStatusType_Set(packet, rfc2866.AcctStatusType_Value_Start)
		_ = rfc2866.AcctSessionID_SetString(packet, sessionID)
		_ = rfc2865.UserName_SetString(packet, *username)
		_ = rfc2865.NASIdentifier_SetString(packet, *nasID)
		_ = rfc2865.NASIPAddress_Set(packet, net.ParseIP(*nasIP))

		ctx, cancel := context.WithTimeout(context.Background(), *timeout)
		start := time.Now()
		resp, err := radius.Exchange(ctx, packet, *acctAddr)
		duration := time.Since(start)
		cancel()

		if err != nil {
			fmt.Printf("      FAILED: %v\n", err)
			results = append(results, TestStepResult{
				Name:    "Accounting-Start",
				Target:  *acctAddr,
				Latency: duration,
				Status:  "ERROR",
				Success: false,
				Details: err.Error(),
			})
		} else {
			statusStr := resp.Code.String()
			success := resp.Code == radius.CodeAccountingResponse
			fmt.Printf("      RESULT: %s in %v\n", statusStr, duration.Round(time.Millisecond))
			results = append(results, TestStepResult{
				Name:    "Accounting-Start",
				Target:  *acctAddr,
				Latency: duration,
				Status:  statusStr,
				Success: success,
				Details: fmt.Sprintf("Session: %s", sessionID),
			})
		}
	}

	// Step 3: Accounting-Interim-Update
	{
		fmt.Printf("\n[3/4] Sending Accounting-Interim-Update (1MB in, 2MB out) to %s...\n", *acctAddr)
		packet := radius.New(radius.CodeAccountingRequest, []byte(*secret))
		_ = rfc2866.AcctStatusType_Set(packet, rfc2866.AcctStatusType_Value_InterimUpdate)
		_ = rfc2866.AcctSessionID_SetString(packet, sessionID)
		_ = rfc2865.UserName_SetString(packet, *username)
		_ = rfc2865.NASIdentifier_SetString(packet, *nasID)
		_ = rfc2865.NASIPAddress_Set(packet, net.ParseIP(*nasIP))
		_ = rfc2866.AcctSessionTime_Set(packet, 60)
		_ = rfc2866.AcctInputOctets_Set(packet, 1048576)
		_ = rfc2866.AcctOutputOctets_Set(packet, 2097152)

		ctx, cancel := context.WithTimeout(context.Background(), *timeout)
		start := time.Now()
		resp, err := radius.Exchange(ctx, packet, *acctAddr)
		duration := time.Since(start)
		cancel()

		if err != nil {
			fmt.Printf("      FAILED: %v\n", err)
			results = append(results, TestStepResult{
				Name:    "Accounting-Interim",
				Target:  *acctAddr,
				Latency: duration,
				Status:  "ERROR",
				Success: false,
				Details: err.Error(),
			})
		} else {
			statusStr := resp.Code.String()
			success := resp.Code == radius.CodeAccountingResponse
			fmt.Printf("      RESULT: %s in %v\n", statusStr, duration.Round(time.Millisecond))
			results = append(results, TestStepResult{
				Name:    "Accounting-Interim",
				Target:  *acctAddr,
				Latency: duration,
				Status:  statusStr,
				Success: success,
				Details: "SessionTime=60s, Traffic=3MB",
			})
		}
	}

	// Step 4: Accounting-Stop
	{
		fmt.Printf("\n[4/4] Sending Accounting-Stop (5MB in, 10MB out, Terminate: User-Request) to %s...\n", *acctAddr)
		packet := radius.New(radius.CodeAccountingRequest, []byte(*secret))
		_ = rfc2866.AcctStatusType_Set(packet, rfc2866.AcctStatusType_Value_Stop)
		_ = rfc2866.AcctSessionID_SetString(packet, sessionID)
		_ = rfc2865.UserName_SetString(packet, *username)
		_ = rfc2865.NASIdentifier_SetString(packet, *nasID)
		_ = rfc2865.NASIPAddress_Set(packet, net.ParseIP(*nasIP))
		_ = rfc2866.AcctSessionTime_Set(packet, 120)
		_ = rfc2866.AcctInputOctets_Set(packet, 5242880)
		_ = rfc2866.AcctOutputOctets_Set(packet, 10485760)
		_ = rfc2866.AcctTerminateCause_Set(packet, rfc2866.AcctTerminateCause_Value_UserRequest)

		ctx, cancel := context.WithTimeout(context.Background(), *timeout)
		start := time.Now()
		resp, err := radius.Exchange(ctx, packet, *acctAddr)
		duration := time.Since(start)
		cancel()

		if err != nil {
			fmt.Printf("      FAILED: %v\n", err)
			results = append(results, TestStepResult{
				Name:    "Accounting-Stop",
				Target:  *acctAddr,
				Latency: duration,
				Status:  "ERROR",
				Success: false,
				Details: err.Error(),
			})
		} else {
			statusStr := resp.Code.String()
			success := resp.Code == radius.CodeAccountingResponse
			fmt.Printf("      RESULT: %s in %v\n", statusStr, duration.Round(time.Millisecond))
			results = append(results, TestStepResult{
				Name:    "Accounting-Stop",
				Target:  *acctAddr,
				Latency: duration,
				Status:  statusStr,
				Success: success,
				Details: "Session closed gracefully",
			})
		}
	}

	// Optional Step 5: CoA / Disconnect-Request
	if *testCoA {
		fmt.Printf("\n[Optional] Sending Disconnect-Request to NAS at %s...\n", *coaAddr)
		packet := radius.New(radius.CodeDisconnectRequest, []byte(*secret))
		_ = rfc2865.UserName_SetString(packet, *username)
		_ = rfc2866.AcctSessionID_SetString(packet, sessionID)
		_ = rfc2865.NASIPAddress_Set(packet, net.ParseIP(*nasIP))

		ctx, cancel := context.WithTimeout(context.Background(), *timeout)
		start := time.Now()
		resp, err := radius.Exchange(ctx, packet, *coaAddr)
		duration := time.Since(start)
		cancel()

		if err != nil {
			fmt.Printf("      FAILED: %v\n", err)
			results = append(results, TestStepResult{
				Name:    "CoA-Disconnect",
				Target:  *coaAddr,
				Latency: duration,
				Status:  "ERROR",
				Success: false,
				Details: err.Error(),
			})
		} else {
			statusStr := resp.Code.String()
			success := resp.Code == radius.CodeDisconnectACK
			fmt.Printf("      RESULT: %s in %v\n", statusStr, duration.Round(time.Millisecond))
			results = append(results, TestStepResult{
				Name:    "CoA-Disconnect",
				Target:  *coaAddr,
				Latency: duration,
				Status:  statusStr,
				Success: success,
				Details: fmt.Sprintf("Code: %s", statusStr),
			})
		}
	}

	// Print Summary
	fmt.Println("\n================================================================================")
	fmt.Println("                             SIMULATION SUMMARY                                 ")
	fmt.Println("================================================================================")
	fmt.Printf("%-20s %-20s %-10s %-10s %s\n", "STEP", "TARGET", "LATENCY", "STATUS", "DETAILS")
	fmt.Println("--------------------------------------------------------------------------------")

	allPassed := true
	for _, res := range results {
		verdict := "PASS"
		if !res.Success {
			verdict = "FAIL"
			allPassed = false
		}
		fmt.Printf("%-20s %-20s %-10s %-10s %s\n",
			res.Name,
			res.Target,
			res.Latency.Round(time.Millisecond).String(),
			verdict,
			res.Details,
		)
	}
	fmt.Println("================================================================================")

	if allPassed {
		fmt.Println(" SUCCESS: All protocol simulation steps passed successfully!")
		os.Exit(0)
	} else {
		fmt.Println(" NOTE: One or more steps did not receive an affirmative response.")
		fmt.Println(" Check server logs, user credentials, and NAS shared secret.")
		os.Exit(1)
	}
}
