//go:build ignore

package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type acceptanceRun struct {
	StartedAt   string     `json:"started_at"`
	FinishedAt  string     `json:"finished_at"`
	CommitSHA   string     `json:"commit_sha"`
	RefName     string     `json:"ref_name"`
	WorkflowURL string     `json:"workflow_url"`
	RunnerOS    string     `json:"runner_os"`
	GoVersion   string     `json:"go_version"`
	Tool        string     `json:"tool"`
	ToolVersion string     `json:"tool_version"`
	Verdict     string     `json:"verdict"`
	Scenarios   []scenario `json:"scenarios"`
}

type scenario struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Method     string `json:"method"`
	Expected   string `json:"expected"`
	Status     string `json:"status"`
	Detail     string `json:"detail"`
	DurationMS int64  `json:"duration_ms"`
	Output     string `json:"output,omitempty"`
}

func main() {
	input := flag.String("input", "eap-acceptance.json", "input JSON result from TestEAPExternalAcceptance")
	reportDir := flag.String("report-dir", "docs/reports/eap", "directory for Markdown reports")
	docsSrc := flag.String("docs-site-src", "docs-site/src", "mdBook source directory")
	reportDate := flag.String("date", time.Now().UTC().Format("2006-01-02"), "report date in YYYY-MM-DD format")
	retention := flag.Int("retention", 3, "number of dated reports to retain")
	flag.Parse()

	run, err := readRun(*input)
	if err != nil {
		fail("read input: %v", err)
	}
	run.Verdict = verdictFromScenarios(run.Scenarios)
	if run.FinishedAt == "" {
		run.FinishedAt = time.Now().UTC().Format(time.RFC3339)
	}

	if err := os.MkdirAll(*reportDir, 0o755); err != nil {
		fail("create report dir: %v", err)
	}

	reportName := *reportDate + ".md"
	reportPath := filepath.Join(*reportDir, reportName)
	reportBody := renderReport(*reportDate, run)
	if err := os.WriteFile(reportPath, []byte(reportBody), 0o644); err != nil {
		fail("write dated report: %v", err)
	}
	if err := os.WriteFile(filepath.Join(*reportDir, "latest.md"), []byte(reportBody), 0o644); err != nil {
		fail("write latest report: %v", err)
	}

	reports, err := pruneReports(*reportDir, *retention)
	if err != nil {
		fail("prune reports: %v", err)
	}
	if !contains(reports, reportName) {
		reports = append([]string{reportName}, reports...)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(reports)))

	if err := writeDocsPages(*docsSrc, reports, run); err != nil {
		fail("write docs pages: %v", err)
	}
}

func readRun(path string) (acceptanceRun, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return acceptanceRun{}, err
	}
	var run acceptanceRun
	if err := json.Unmarshal(data, &run); err != nil {
		return acceptanceRun{}, err
	}
	return run, nil
}

func renderReport(date string, run acceptanceRun) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# EAP Acceptance Test Report - %s\n\n", date)
	fmt.Fprintln(&b, "## English")
	fmt.Fprintln(&b)
	fmt.Fprintf(&b, "**Verdict:** %s\n\n", strings.ToUpper(run.Verdict))
	writeCoverageNote(&b, run.Scenarios)
	fmt.Fprintln(&b, "### Run Context")
	fmt.Fprintln(&b)
	writeContextTable(&b, run)
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, "### Scenario Results")
	fmt.Fprintln(&b)
	writeScenarioTable(&b, run.Scenarios)
	writeFailureDetails(&b, run.Scenarios)
	fmt.Fprintln(&b)
	return b.String()
}

func writeContextTable(b *strings.Builder, run acceptanceRun) {
	rows := [][2]string{
		{"Started", run.StartedAt},
		{"Finished", run.FinishedAt},
		{"Commit", shortSHA(run.CommitSHA)},
		{"Ref", run.RefName},
		{"Workflow", markdownLink(run.WorkflowURL)},
		{"Runner OS", run.RunnerOS},
		{"Go", run.GoVersion},
		{"Tool", strings.TrimSpace(run.Tool + " " + run.ToolVersion)},
	}
	fmt.Fprintln(b, "| Field | Value |")
	fmt.Fprintln(b, "| --- | --- |")
	for _, row := range rows {
		fmt.Fprintf(b, "| %s | %s |\n", row[0], escapeTable(row[1]))
	}
}

func writeScenarioTable(b *strings.Builder, scenarios []scenario) {
	fmt.Fprintln(b, "| Scenario | Method | Expected | Status | Duration | Detail |")
	fmt.Fprintln(b, "| --- | --- | --- | --- | ---: | --- |")
	for _, s := range scenarios {
		fmt.Fprintf(b, "| %s | %s | %s | %s | %d ms | %s |\n",
			escapeTable(s.Name), escapeTable(s.Method), escapeTable(s.Expected),
			escapeTable(s.Status), s.DurationMS, escapeTable(s.Detail))
	}
}

func writeFailureDetails(b *strings.Builder, scenarios []scenario) {
	for _, s := range scenarios {
		if s.Status != "failed" || strings.TrimSpace(s.Output) == "" {
			continue
		}
		fmt.Fprintln(b)
		fmt.Fprintf(b, "### Failure Output: %s\n\n", s.Name)
		fmt.Fprintln(b, "```text")
		fmt.Fprintln(b, truncate(s.Output, 4000))
		fmt.Fprintln(b, "```")
	}
}

func writeCoverageNote(b *strings.Builder, scenarios []scenario) {
	if !hasPEAPExternalCoverageGap(scenarios) {
		return
	}
	fmt.Fprintln(b, "Coverage note: PEAP/MSCHAPv2 external `eapol_test` scenarios are still skipped and tracked by [#495](https://github.com/bjo163/mwx-isp/issues/495), so this report is partial external coverage rather than complete PEAP acceptance.")
	fmt.Fprintln(b)
}

func pruneReports(dir string, retention int) ([]string, error) {
	if retention < 1 {
		retention = 1
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	dateFile := regexp.MustCompile(`^\d{4}-\d{2}-\d{2}\.md$`)
	var reports []string
	for _, entry := range entries {
		if entry.IsDir() || !dateFile.MatchString(entry.Name()) {
			continue
		}
		reports = append(reports, entry.Name())
	}
	sort.Sort(sort.Reverse(sort.StringSlice(reports)))
	if len(reports) > retention {
		for _, old := range reports[retention:] {
			if err := os.Remove(filepath.Join(dir, old)); err != nil {
				return nil, err
			}
		}
		reports = reports[:retention]
	}
	return reports, nil
}

func writeDocsPages(src string, reports []string, run acceptanceRun) error {
	en := filepath.Join(src, "en", "eap-acceptance-reports.md")
	id := filepath.Join(src, "id", "eap-acceptance-reports.md")
	if err := os.MkdirAll(filepath.Dir(en), 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(id), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(en, []byte(renderDocsEN(reports, run)), 0o644); err != nil {
		return err
	}
	return os.WriteFile(id, []byte(renderDocsID(reports, run)), 0o644)
}

func renderDocsEN(reports []string, run acceptanceRun) string {
	var b strings.Builder
	fmt.Fprintln(&b, "# EAP Acceptance Reports")
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, "Weekly EAP acceptance runs validate MWX-ISP with an external `eapol_test` supplicant and publish the latest retained reports here.")
	fmt.Fprintln(&b)
	fmt.Fprintf(&b, "**Latest verdict:** %s\n\n", strings.ToUpper(run.Verdict))
	writeCoverageNote(&b, run.Scenarios)
	fmt.Fprintln(&b, "## Latest Scenario Summary")
	fmt.Fprintln(&b)
	writeScenarioTable(&b, run.Scenarios)
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, "## Retained Reports")
	fmt.Fprintln(&b)
	writeReportLinks(&b, reports)
	return b.String()
}

func renderDocsID(reports []string, run acceptanceRun) string {
	var b strings.Builder
	fmt.Fprintln(&b, "# Laporan Penerimaan EAP")
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, "> English version: [EAP Acceptance Reports](../en/eap-acceptance-reports.md)")
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, "Pengujian mingguan memverifikasi MWX-ISP menggunakan supplicant eksternal `eapol_test`. Rincian skenario dan konteks runner tersedia pada laporan berikut:")
	fmt.Fprintln(&b)
	fmt.Fprintf(&b, "**Verdik terbaru:** %s\n\n", strings.ToUpper(run.Verdict))
	writeCoverageNote(&b, run.Scenarios)
	fmt.Fprintln(&b, "## Ringkasan skenario terbaru")
	fmt.Fprintln(&b)
	writeScenarioTable(&b, run.Scenarios)
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, "## Laporan sebelumnya")
	fmt.Fprintln(&b)
	writeReportLinks(&b, reports)
	return b.String()
}

func writeReportLinks(b *strings.Builder, reports []string) {
	if len(reports) == 0 {
		fmt.Fprintln(b, "No scheduled reports have been generated yet.")
		return
	}
	for _, report := range reports {
		date := strings.TrimSuffix(report, ".md")
		fmt.Fprintf(b, "- [%s](https://github.com/bjo163/mwx-isp/blob/main/docs/reports/eap/%s)\n", date, report)
	}
}

func verdictFromScenarios(scenarios []scenario) string {
	passed := 0
	partial := false
	for _, s := range scenarios {
		switch s.Status {
		case "failed":
			return "failed"
		case "passed":
			passed++
		case "skipped":
			if isPEAPMSCHAPv2Scenario(s.ID) {
				partial = true
			}
		}
	}
	if passed == 0 {
		return "incomplete"
	}
	if partial {
		return "partial"
	}
	return "accepted"
}

func hasPEAPExternalCoverageGap(scenarios []scenario) bool {
	for _, s := range scenarios {
		if s.Status == "skipped" && isPEAPMSCHAPv2Scenario(s.ID) {
			return true
		}
	}
	return false
}

func isPEAPMSCHAPv2Scenario(id string) bool {
	return strings.HasPrefix(id, "peap-mschapv2-")
}

func markdownLink(url string) string {
	if url == "" {
		return ""
	}
	return "[workflow run](" + url + ")"
}

func shortSHA(sha string) string {
	if len(sha) > 12 {
		return sha[:12]
	}
	return sha
}

func escapeTable(value string) string {
	value = strings.ReplaceAll(value, "\n", "<br>")
	return strings.ReplaceAll(value, "|", "\\|")
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max] + "\n...[truncated]"
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func fail(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
