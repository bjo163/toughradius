# EAP Acceptance Test Report - 2026-08-10

## English

**Verdict:** PARTIAL

Coverage note: PEAP/MSCHAPv2 external `eapol_test` scenarios are still skipped and tracked by [#495](https://github.com/talkincode/toughradius/issues/495), so this report is partial external coverage rather than complete PEAP acceptance.

### Run Context

| Field | Value |
| --- | --- |
| Started | 2026-08-10T10:37:08Z |
| Finished | 2026-08-10T10:37:09Z |
| Commit | 2bf67750ac35 |
| Ref | main |
| Workflow | [workflow run](https://github.com/talkincode/toughradius/actions/runs/31379861606) |
| Runner OS | Linux |
| Go | go version go1.25.12 linux/amd64 |
| Tool | eapol_test eapol_test v2.10 |

### Scenario Results

| Scenario | Method | Expected | Status | Duration | Detail |
| --- | --- | --- | --- | ---: | --- |
| EAP-TLS valid client certificate | EAP-TLS | Access-Accept | passed | 186 ms | external supplicant received the expected Access-Accept |
| EAP-TLS untrusted client certificate | EAP-TLS | Access-Reject | passed | 37 ms | external supplicant was rejected as expected |
| PEAP/MSCHAPv2 valid credentials | PEAP/MSCHAPv2 | Access-Accept | skipped | 0 ms | Skipped intentionally: eapol_test currently exposes a PEAP inner-framing interop gap (server rejects the decrypted phase-2 payload as an invalid inner EAP message). The in-process PEAP/MSCHAPv2 integration test remains the current acceptance coverage. Tracking issue: https://github.com/talkincode/toughradius/issues/495. |
| PEAP/MSCHAPv2 wrong password | PEAP/MSCHAPv2 | Access-Reject | skipped | 0 ms | Skipped intentionally: eapol_test currently exposes a PEAP inner-framing interop gap (server rejects the decrypted phase-2 payload as an invalid inner EAP message). The in-process PEAP/MSCHAPv2 integration test remains the current acceptance coverage. Tracking issue: https://github.com/talkincode/toughradius/issues/495. |
| EAP-TTLS/PAP valid credentials | EAP-TTLS/PAP | Access-Accept | passed | 138 ms | external supplicant received the expected Access-Accept |
| EAP-TTLS/MSCHAPv2 valid credentials | EAP-TTLS/MSCHAPv2 | Access-Accept | passed | 138 ms | external supplicant received the expected Access-Accept |
| Malformed external EAP client config | tooling | documented skip | skipped | 0 ms | Skipped intentionally: eapol_test parser failures do not exercise ToughRADIUS over RADIUS/EAP. Negative server behavior is covered by untrusted certificate and wrong password scenarios. |
