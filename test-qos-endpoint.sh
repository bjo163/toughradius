#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}====== ToughRADIUS QoS Manual Sync Testing ======${NC}\n"

# Get token first
echo -e "${YELLOW}1. Getting authentication token...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "http://localhost:1816/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Failed to get token${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ Token obtained: ${TOKEN:0:30}...${NC}\n"

# Insert test queue
echo -e "${YELLOW}2. Inserting test QoS queue to database...${NC}"
psql -U postgres -d toughradius << EOF > /dev/null 2>&1
INSERT INTO nas_qos 
(user_id, nas_id, nas_addr, vendor_code, qos_name, qos_type, up_rate, down_rate, status, created_at, updated_at)
VALUES
(1, 1, '158.140.191.83', '14988', 'test-manual-sync', 'simple_queue', 1024, 2048, 'pending', NOW(), NOW());
EOF
echo -e "${GREEN}✅ Test queue inserted${NC}\n"

# Test 1: Check QoS Status
echo -e "${YELLOW}3. Testing GET /api/v1/network/nas/1/qos/status${NC}"
STATUS=$(curl -s -X GET "http://localhost:1816/api/v1/network/nas/1/qos/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")
echo "Response:"
echo "$STATUS" | jq '.' 2>/dev/null || echo "$STATUS"
echo ""

# Test 2: List QoS Queues
echo -e "${YELLOW}4. Testing GET /api/v1/network/nas/1/qos/queues${NC}"
QUEUES=$(curl -s -X GET "http://localhost:1816/api/v1/network/nas/1/qos/queues?status=pending" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")
echo "Response:"
echo "$QUEUES" | jq '.' 2>/dev/null || echo "$QUEUES"
echo ""

# Test 3: Manual Trigger Sync
echo -e "${YELLOW}5. Testing POST /api/v1/network/nas/1/qos/sync (MANUAL TRIGGER)${NC}"
SYNC=$(curl -s -X POST "http://localhost:1816/api/v1/network/nas/1/qos/sync" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")
echo "Response:"
echo "$SYNC" | jq '.' 2>/dev/null || echo "$SYNC"
echo ""

# Test 4: Check queue status after sync
echo -e "${YELLOW}6. Checking queue status after manual sync...${NC}"
sleep 1
FINAL=$(curl -s -X GET "http://localhost:1816/api/v1/network/nas/1/qos/queues" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")
echo "Response:"
echo "$FINAL" | jq '.' 2>/dev/null || echo "$FINAL"
echo ""

echo -e "${GREEN}====== Test Complete ======${NC}"
