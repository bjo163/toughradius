# ToughRADIUS QoS Manual Sync Endpoints

Saya sudah membuat 3 endpoint baru untuk testing QoS polling secara manual:

## 📌 Endpoints

### 1. **Manual Trigger QoS Sync**
Trigger manual sync untuk device tertentu tanpa menunggu 1 menit interval

```
POST /api/v1/network/nas/{id}/qos/sync
```

**Headers:**
```
Authorization: Bearer {{token}}
Content-Type: application/json
```

**Example:**
```bash
curl -X POST "http://localhost:1816/api/v1/network/nas/1/qos/sync" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Response (200 OK):**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "nas_id": "1",
    "nas_addr": "158.140.191.83",
    "vendor_code": "14988",
    "qos_enabled": true,
    "total_queue": 5,
    "pending_queue": 2,
    "processed_count": 2,
    "message": "Manually synced 2 QoS queues",
    "start_time": "2026-01-20T14:30:00Z",
    "end_time": "2026-01-20T14:30:01Z",
    "duration": "1.234s"
  }
}
```

---

### 2. **Get QoS Status**
Dapatkan status QoS device termasuk statistik queue

```
GET /api/v1/network/nas/{id}/qos/status
```

**Headers:**
```
Authorization: Bearer {{token}}
```

**Example:**
```bash
curl -X GET "http://localhost:1816/api/v1/network/nas/1/qos/status" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200 OK):**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "nas_id": "1",
    "nas_addr": "158.140.191.83",
    "vendor_code": "14988",
    "qos_enabled": true,
    "qos_method": "api",
    "api_host": "158.140.191.83",
    "api_port": 8728,
    "queue_stats": {
      "total": 10,
      "pending": 2,
      "synced": 7,
      "failed": 1
    },
    "last_sync": {
      "action": "synced",
      "status": "success",
      "error_msg": "",
      "executed_at": "2026-01-20T14:29:00Z"
    }
  }
}
```

---

### 3. **List QoS Queues**
Dapatkan list queue untuk device tertentu dengan filter status

```
GET /api/v1/network/nas/{id}/qos/queues?status=pending&page=1&perPage=20
```

**Query Parameters:**
- `status` (optional): Filter by status - "pending", "synced", "failed"
- `page` (optional): Page number (default: 1)
- `perPage` (optional): Items per page (default: 20, max: 100)

**Headers:**
```
Authorization: Bearer {{token}}
```

**Example:**
```bash
# Get all pending queues
curl -X GET "http://localhost:1816/api/v1/network/nas/1/qos/queues?status=pending" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get failed queues with pagination
curl -X GET "http://localhost:1816/api/v1/network/nas/1/qos/queues?status=failed&page=1&perPage=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response (200 OK):**
```json
{
  "code": 0,
  "msg": "success",
  "data": [
    {
      "id": "1",
      "user_id": "5",
      "nas_id": "1",
      "nas_addr": "158.140.191.83",
      "vendor_code": "14988",
      "qos_name": "user-premium-1",
      "qos_type": "simple_queue",
      "up_rate": 2048,
      "down_rate": 4096,
      "remote_id": "mkt-queue-001",
      "status": "synced",
      "error_msg": "",
      "synced_at": "2026-01-20T14:25:00Z",
      "created_at": "2026-01-20T14:00:00Z",
      "updated_at": "2026-01-20T14:25:00Z"
    }
  ],
  "total": 2,
  "page": 1,
  "perPage": 20
}
```

---

## 🧪 **Testing Workflow**

### **Step 1: Get Token**
```bash
curl -X POST "http://localhost:1816/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

Copy `token` dari response.

### **Step 2: Insert Test Queue (via Database)**
```sql
-- Insert test queue
INSERT INTO nas_qos 
(user_id, nas_id, nas_addr, vendor_code, qos_name, qos_type, up_rate, down_rate, status, created_at, updated_at)
VALUES
(1, 1, '158.140.191.83', '14988', 'test-queue', 'simple_queue', 1024, 2048, 'pending', NOW(), NOW());

-- Verify
SELECT * FROM nas_qos WHERE qos_name = 'test-queue';
```

### **Step 3: Check QoS Status (Before Sync)**
```bash
curl -X GET "http://localhost:1816/api/v1/network/nas/1/qos/status" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected: `pending_queue: 1`

### **Step 4: Manual Trigger Sync**
```bash
curl -X POST "http://localhost:1816/api/v1/network/nas/1/qos/sync" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Expected: `processed_count: 1`

### **Step 5: Check QoS Status (After Sync)**
```bash
curl -X GET "http://localhost:1816/api/v1/network/nas/1/qos/status" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected: `pending_queue: 0`, `synced_queue: 1`

### **Step 6: Verify in Database**
```sql
-- Check queue status
SELECT * FROM nas_qos WHERE qos_name = 'test-queue';

-- Check sync log
SELECT * FROM nas_qos_log WHERE nas_id = 1 ORDER BY executed_at DESC LIMIT 5;
```

---

## 📊 **Postman Collection**

### **1. Login**
```
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin"
}
```

Save token ke environment variable `{{token}}`

### **2. Check QoS Status**
```
GET /api/v1/network/nas/1/qos/status
Authorization: Bearer {{token}}
```

### **3. List Pending Queues**
```
GET /api/v1/network/nas/1/qos/queues?status=pending
Authorization: Bearer {{token}}
```

### **4. Manual Trigger Sync**
```
POST /api/v1/network/nas/1/qos/sync
Authorization: Bearer {{token}}
Content-Type: application/json
```

### **5. Check Status Again (After Sync)**
```
GET /api/v1/network/nas/1/qos/status
Authorization: Bearer {{token}}
```

---

## ✅ **Error Responses**

| Error Code | HTTP Status | Meaning |
|----------|------------|---------|
| `INVALID_ID` | 400 | ID format invalid |
| `NOT_FOUND` | 404 | NAS device tidak ditemukan |
| `QOS_DISABLED` | 400 | QoS belum diaktifkan untuk device ini |
| `SERVICE_ERROR` | 500 | QoS service tidak berjalan |
| `QUERY_ERROR` | 500 | Database query error |

---

## 🎯 **Use Cases**

### **Testing Baru Setup QoS**
1. Enable QoS di NAS device via API
2. Insert test queue ke database
3. Manual trigger sync dengan endpoint ini
4. Verify queue berhasil di-create di Mikrotik RouterOS
5. Check logs dan nas_qos_log table

### **Debugging QoS Issues**
1. Get QoS status untuk lihat total queue
2. List queue dengan status filter (pending/failed)
3. Check last_sync info untuk tahu kapan terakhir sync
4. Manual trigger sync untuk test koneksi
5. Check nas_qos_log untuk error messages

### **Performance Testing**
1. Insert banyak test queue ke database
2. Manual trigger sync untuk lihat berapa lama process
3. Monitor duration di response
4. Check success rate dari processed_count

---

## 📝 **Source Code**

File baru yang dibuat:
- `internal/adminapi/qos.go` - Endpoint handlers
- Updated `internal/adminapi/adminapi.go` - Route registration
- Updated `internal/radiusd/qos/service.go` - Public SyncQueue method
- Updated `internal/app/interfaces.go` - QoSServiceProvider interface
- Updated `internal/app/app.go` - GetQoSService method

---

## 🚀 **Testing dengan Script**

Run automated testing script:
```bash
chmod +x test-qos-endpoint.sh
./test-qos-endpoint.sh
```

Script akan:
1. Get authentication token
2. Insert test queue
3. Test GET status endpoint
4. Test GET queues endpoint
5. Test POST sync endpoint
6. Verify results
