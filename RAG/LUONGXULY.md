# Logic Cốt Lõi — Phần Mềm Quản Lý Phòng Trọ

## 1. Trạng Thái Phòng (`RoomStatus`)

```
vacant → occupied → ending → vacant
vacant → occupied → (cancelContract) → vacant
maintenance (trạng thái riêng, không tham gia flow hợp đồng)
```

| Trạng thái | Ý nghĩa |
|---|---|
| `vacant` | Phòng trống, có thể tạo hợp đồng mới |
| `occupied` | Đang có khách, có hợp đồng `active` |
| `ending` | Khách đã báo kết thúc, chưa xác nhận trả phòng chính thức |
| `maintenance` | Đang bảo trì, không cho thuê |

---

## 2. Trạng Thái Hợp Đồng (`ContractStatus`)

| Status | Ý nghĩa | Sinh ra khi |
|---|---|---|
| `active` | Đang hiệu lực | Tạo hợp đồng mới |
| `terminated` | Đã tất toán/trả phòng chính thức | `terminateContract()` |
| `cancelled` | Hủy ngang (chưa có khoản thanh toán) | `cancelContract()` |
| `expired` | Tự động đóng do data inconsistency | Auto-expire trong `createContract()` |

---

## 3. Luồng Tạo Hợp Đồng (`createContract`)

```
1. Kiểm tra blockingActiveContract:
   - room.status === 'occupied' + có active contract → BLOCK: "Phòng đang có HĐ hiệu lực"
   - room.status === 'vacant' hoặc 'ending' + có active contract → AUTO-EXPIRE contract cũ

2. Kiểm tra tenant tồn tại trong mục Khách thuê

3. Kiểm tra tenant không đang có HĐ active ở phòng khác

4. Tạo contract mới (status: active)

5. Cập nhật room → status: occupied

6. Sinh hóa đơn tháng đầu (TRỪ KHI is_migration = true):
   - Tính prorata: (daysInMonth - moveInDay + 1) / daysInMonth × base_rent
   - Nếu moveInDay === 1: thu full tháng
   - Check duplicate: cùng room_id + cùng tenant_id + is_first_month + cùng tháng → BLOCK

7. Nếu is_migration = true + migration_debt > 0: tạo phiếu nợ tồn đọng
```

---

## 4. Luồng Tất Toán / Trả Phòng (`terminateContract`)

```
1. Tính điện/nước tháng cuối: (final_reading - current_reading) × price_snapshot

2. Gộp các hóa đơn nợ chưa thanh toán (merge_invoice_ids)

3. Tính đối trừ cọc:
   - totalCharges = electricCost + waterCost + mergedDebt + damageCost
   - depositApplied = min(deposit, totalCharges)
   - netDue = totalCharges - deposit  (âm = hoàn tiền cho khách)

4. Tạo settlement invoice (is_settlement: true, billing_reason: 'contract_end')
   - payment_status: 'paid' nếu netDue ≤ 0
   - payment_status: 'partial' nếu còn thiếu sau khi trừ cọc
   - payment_status: 'unpaid' nếu không có cọc bù vào

5. Hóa đơn nợ đã gộp → status: 'merged'

6. Contract → status: 'terminated'

7. Room → status: 'vacant', reset thông tin khách, giữ chỉ số điện/nước cuối, reset cọc về 0
```

---

## 5. Luồng Hủy Hợp Đồng (`cancelContract`)

```
Điều kiện: KHÔNG có hóa đơn nào đã thanh toán (kể cả partial)
→ Nếu đã thanh toán: BLOCK, yêu cầu dùng terminateContract

1. Void toàn bộ hóa đơn unpaid/partial của khách → status: 'cancelled'
2. Contract → status: 'cancelled'
3. Room → status: 'vacant'
```

---

## 6. Loại Hóa Đơn (`billing_reason`)

| Giá trị | Label | Đặc điểm |
|---|---|---|
| `first_month` | Thu tiền tháng đầu tiên | Prorata theo ngày vào; thu cọc lần đầu; `is_first_month: true` |
| `monthly` | Thu tiền hàng tháng | Có điện/nước; không thu cọc; phải nhập chỉ số mới |
| `contract_end` | Tất toán khi kết thúc | Điện/nước tháng cuối; đối trừ cọc; `is_settlement: true` |
| `room_cycle` | Thu theo chu kỳ phòng | Không có điện/nước |
| `service` | Thu tiền dịch vụ | Chỉ phí cố định (internet, vệ sinh) |
| `deposit_collect` | Thu tiền cọc | |
| `deposit_refund` | Hoàn tiền cọc | Số âm |
| `migration_debt` | Nợ tồn đọng trước khi dùng phần mềm | Dùng khi `is_migration: true` |

---

## 7. Rules Chặn Tạo Hóa Đơn (Backend — `createInvoice`)

### Rule 1 — Không tạo 2 phiếu tháng đầu cho cùng khách
```
hasActiveFirstMonthInvoice: room_id + tenant_id + is_first_month + NOT cancelled
→ Scope: PER TENANT (khách mới vào phòng cũ không bị chặn bởi lịch sử khách trước)
```

### Rule 2 — Không tạo 2 hóa đơn cùng loại cùng tháng cho cùng khách
```
findDuplicateInvoice: room_id + tenant_id + billing_reason + month + year + NOT cancelled
→ Scope: PER TENANT
→ Có thể bypass bằng allow_duplicate: true (trừ first_month)
```

### Rule 3 — Không lập HĐ hàng tháng trong cùng tháng đã có phiếu tháng đầu
```
Điều kiện: !is_first_month && !is_settlement
Tìm: room_id + tenant_id + is_first_month + cùng tháng/năm + NOT cancelled
→ Nếu tìm thấy: BLOCK, báo "phải sang tháng N+1 mới lập được"
→ Scope: PER TENANT
```

---

## 8. Rules Chặn Ở Frontend (`App.tsx`)

### `roomFirstMonthBlockedThisMonth`
```
Chỉ tính cho room.status === 'occupied'
Check: invoices có room_id + tenant_id (từ active contract) + is_first_month + tháng hiện tại + NOT cancelled
→ Nếu true: disable nút "Lập hóa đơn" trên context menu
→ Scope: PER TENANT (lấy tenant_id từ active contract của phòng)
```

### Disable nút "Thêm hóa đơn" trong `InvoiceModal`
```
disabled = isPending || (duplicateInvoice && !confirmedDuplicate) || utilityValidationFailed

currentTenantId = activeContract?.tenant_id || tenant?.id || null
  → Nếu null: KHÔNG check duplicate (tránh false-positive khi data chưa load)

duplicateInvoice: scope theo currentTenantId

utilityValidationFailed: chỉ active khi billingReason === 'monthly' hoặc hasTransfer
  → Phải nhập chỉ số điện/nước mới (electricTouched && waterTouched)
  → Chỉ số mới không được nhỏ hơn chỉ số cũ
```

---

## 9. Trạng Thái Hóa Đơn (`PaymentStatus`)

| Status | Ý nghĩa |
|---|---|
| `unpaid` | Chưa thu |
| `partial` | Đã thu một phần |
| `paid` | Đã thu đủ |
| `merged` | Đã gộp vào hóa đơn tất toán |
| `cancelled` | Đã hủy (void) — giữ lại để audit, không xóa |

---

## 10. Vùng Giá Dịch Vụ (`ServiceZone`)

- Mỗi phòng thuộc 1 zone (`room.service_zone_id`)
- Zone định nghĩa: `electric_price`, `water_price`, `internet_price`, `cleaning_price`
- Ưu tiên giá: `room.electric_price` > `zone.electric_price`
- Zone mặc định `zone-1` không thể xóa
- Phòng không có zone → bị block tạo hóa đơn (`openInvoiceFlow` redirect sang zone picker)

---

## 11. Chế Độ Migration (`is_migration`)

Dùng khi nhập khách đang ở sẵn vào phần mềm:

```
createContract({ is_migration: true, migration_debt: <số nợ> })
→ KHÔNG tạo phiếu tháng đầu
→ Nếu migration_debt > 0: tạo 1 phiếu 'migration_debt' để theo dõi nợ cũ
→ Room vẫn chuyển sang occupied bình thường
```

---

## 12. Đồng Bộ Chỉ Số Điện Nước (`syncRoomInvoiceState`)

Chạy sau mỗi lần tạo hóa đơn:
```
electric_new/old = chỉ số điện của hóa đơn gần nhất (không kể settlement)
water_new/old    = chỉ số nước của hóa đơn gần nhất
old_debt         = tổng (total - paid) của tất cả HĐ chưa tất toán của khách hiện tại
```

---

## 13. Nguyên Tắc Scope Theo Tenant

**Toàn bộ check duplicate đều scope theo `tenant_id`** vì:
- 1 phòng có thể có nhiều khách qua các thời kỳ khác nhau
- Khách A trả phòng → Khách B vào cùng tháng là hợp lệ hoàn toàn
- Lịch sử hóa đơn của Khách A không được block Khách B

```
ĐÚNG: Block khi cùng tenant_id + cùng phòng + cùng loại + cùng tháng
SAI:  Block khi chỉ cùng phòng + cùng loại + cùng tháng (không phân biệt tenant)
```

---

## 14. Cột Tài Chính — Trạng Thái Hiển Thị Theo Room Status

| Trạng thái phòng | Hóa đơn tháng hiện tại | Hiển thị cột Tài Chính |
|---|---|---|
| `vacant` | — | Dấu gạch `—` |
| `occupied` | Không có + có active contract | "Cần lập HĐ đầu tiên" (đỏ) hoặc "Có thể lập HĐ ngay" |
| `occupied` | Unpaid / Partial | Nút cam "Chưa thu tháng X" hoặc "Tháng đầu còn nợ" |
| `occupied` | Paid | Badge xanh "Đã thu" |
| **`ending`** | **Không có unpaid** | **Grey "Chờ trả phòng" — không cho lập hóa đơn mới** |
| `ending` | Có unpaid | Vẫn hiện nút thu tiền (phải thu trước khi trả phòng) |

**Lý do:** Phòng `ending` đang trong luồng kết thúc hợp đồng → hướng user vào "Xác nhận trả phòng" thay vì lập thêm hóa đơn. Hiển thị nút mờ tránh user bấm vào rồi thấy bị khóa bên trong gây nhầm lẫn.

**Settlement invoice** (`is_settlement = true`) bị loại khỏi `roomMonthInvoices` — phiếu tất toán không hiện trong cột Tài Chính hàng tháng.
