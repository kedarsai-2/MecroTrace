# Seller Mark Override for Contact-Linked Sellers

## Background

Each seller in an arrival is stored as a `seller_in_vehicle` row. A seller can be either:

- **Contact seller** — linked to an existing contact via `contact_id`
- **Free-text seller** — no contact link; identified by name/phone/mark

The `seller_in_vehicle` table has always had a `seller_mark` column (varchar 50, nullable). Previously, this column was only written for free-text sellers. For contact sellers, `seller_mark` was always left `null` and the mark was read directly from `Contact.mark` (the contact's global alias).

## What Changed

### File: `server/src/main/java/com/mercotrace/service/ArrivalService.java`

Three targeted changes were made — no new methods, no schema changes, no new API endpoints.

---

### Change 1 — Create path: save per-arrival mark override for contact sellers

**Before:**
```java
if (contactId != null) {
    ...
    sellerInVehicle.setContactId(contactId);
    // seller_mark was NOT set — left null
} else {
    ...
    sellerInVehicle.setSellerMark(sellerDTO.getSellerMark() != null ? sellerDTO.getSellerMark().trim() : null);
}
```

**After:**
```java
if (contactId != null) {
    ...
    sellerInVehicle.setContactId(contactId);
    sellerInVehicle.setSellerMark(sellerDTO.getSellerMark() != null && !sellerDTO.getSellerMark().isBlank() ? sellerDTO.getSellerMark().trim() : null);
} else {
    ...
    sellerInVehicle.setSellerMark(sellerDTO.getSellerMark() != null ? sellerDTO.getSellerMark().trim() : null);
}
```

---

### Change 2 — Update path: same fix applied to the PATCH/update flow

**Before:**
```java
if (contactId != null) {
    ...
    siv.setContactId(contactId);
    // seller_mark was NOT set
} else {
    ...
    siv.setSellerMark(sellerDTO.getSellerMark() != null ? sellerDTO.getSellerMark().trim() : null);
}
```

**After:**
```java
if (contactId != null) {
    ...
    siv.setContactId(contactId);
    siv.setSellerMark(sellerDTO.getSellerMark() != null && !sellerDTO.getSellerMark().isBlank() ? sellerDTO.getSellerMark().trim() : null);
} else {
    ...
    siv.setSellerMark(sellerDTO.getSellerMark() != null ? sellerDTO.getSellerMark().trim() : null);
}
```

---

### Change 3 — Read path (`getArrivalById`): prefer per-arrival mark, fallback to contact's global mark

**Before:**
```java
if (siv.getContactId() != null) {
    sellerFull.setSellerName(contactNameById.getOrDefault(siv.getContactId(), ""));
    sellerFull.setSellerPhone(contactPhoneById.getOrDefault(siv.getContactId(), ""));
    sellerFull.setSellerMark(contactMarkById.getOrDefault(siv.getContactId(), ""));
    // always returned Contact.mark — ignored seller_in_vehicle.seller_mark
}
```

**After:**
```java
if (siv.getContactId() != null) {
    sellerFull.setSellerName(contactNameById.getOrDefault(siv.getContactId(), ""));
    sellerFull.setSellerPhone(contactPhoneById.getOrDefault(siv.getContactId(), ""));
    // prefer per-arrival mark override stored on seller row; fall back to the contact's global mark
    String sivMark = siv.getSellerMark();
    sellerFull.setSellerMark(sivMark != null && !sivMark.isBlank() ? sivMark : contactMarkById.getOrDefault(siv.getContactId(), ""));
}
```

---

### Change 4 — Mark Propagation to Contact (Global Update)

**Purpose:** When a mark is edited for a contact seller in an arrival, propagate it back to `Contact.mark` so future arrivals pre-fill with the updated value.

**Implementation:**

Added `propagateMarkToContact` helper method that is called after saving the per-arrival mark override:

```java
/**
 * Propagate per-arrival mark override to Contact.mark for global use.
 * Throws IllegalArgumentException if mark cannot be saved (conflict, length).
 */
private void propagateMarkToContact(Contact contact, String mark, Long traderId) {
    if (mark == null || mark.isBlank()) return;
    String trimmed = mark.trim();
    
    // Validate length against Contact.mark column (varchar 20)
    if (trimmed.length() > 20) {
        throw new IllegalArgumentException(
            "Mark/alias must be 20 characters or less to save globally. Current: " + trimmed.length() + " chars"
        );
    }
    
    // Skip if already set to same value (case-insensitive)
    String current = contact.getMark() != null ? contact.getMark().trim() : "";
    if (trimmed.equalsIgnoreCase(current)) return;
    
    // Check conflicts with other trader contacts
    boolean conflictsTrader = contactRepository
        .findOneByTraderIdAndMarkIgnoreCaseAndIdNot(traderId, trimmed, contact.getId())
        .isPresent();
    if (conflictsTrader) {
        throw new IllegalArgumentException(
            "This mark is already in use by another contact. Please choose a unique mark."
        );
    }
    
    // Check conflicts with global self-registered contacts
    boolean conflictsGlobal = contactRepository
        .findOneByMarkAndTraderIdIsNull(trimmed)
        .isPresent();
    if (conflictsGlobal) {
        throw new IllegalArgumentException(
            "This mark is already in use by a registered contact. Please choose a unique mark."
        );
    }
    
    contact.setMark(trimmed);
    contactRepository.save(contact);
}
```

**Behavior:**

- Mark updates to `Contact.mark` immediately when arrival saves (strict enforcement)
- If mark conflicts or exceeds 20 chars, arrival save **fails** with clear error message
- Error propagates through transaction → entire arrival save is rolled back
- Frontend reloads contacts after successful save to reflect changes in dropdown

**Validation enforced:**

1. Mark ≤ 20 characters (Contact.mark column limit is varchar 20)
2. No conflict with other trader contacts (case-insensitive)
3. No conflict with global self-registered contacts

**Error messages user will see:**

- "Mark/alias must be 20 characters or less to save globally. Current: X chars"
- "This mark is already in use by another contact. Please choose a unique mark."
- "This mark is already in use by a registered contact. Please choose a unique mark."

**Frontend changes:**

- Mark input `maxLength` capped at 20 characters for contact sellers (changed from 50)
- Placeholder updated: "Mark / alias (optional, 2–20)"
- Validation message updated: "2–20 if set"
- `loadContactsFromApi()` called after every successful arrival save/update to refresh dropdown

---

## Why No Database Migration Is Needed

The `seller_mark` column already exists on `seller_in_vehicle` (added in changelog `20260314140000_seller_contact_nullable.xml`) and is already:

- `varchar(50)` — sufficient for per-arrival overrides (frontend caps at 20 for contact sellers to match Contact.mark)
- Nullable — no `NOT NULL` constraint, so existing rows with `null` are untouched

The `Contact.mark` column is:

- `varchar(20)` — propagation validates length before saving
- Nullable — can be null if never set

---

## Validation — No Rules Broken

`validateSellerMarks` has two checks:

1. **Within-vehicle uniqueness** — applies to all sellers (contact and free-text). A contact seller's mark participates in this check the same way any mark would.
2. **Global contact conflict check** — only runs when `contactId == null` (free-text sellers). Contact sellers are explicitly excluded from this check.

The new `propagateMarkToContact` adds **strict validation** for contact sellers:

- Length must be ≤ 20 (Contact.mark column limit)
- Must not conflict with other trader contacts (case-insensitive)
- Must not conflict with global self-registered contacts

These checks **match** the validation already enforced by `ContactResource` when creating/updating contacts directly.

---

## Backward Compatibility

- **Existing arrivals** where contact sellers have no `seller_mark` override (`null`) will continue to display the contact's global mark — the fallback in Change 3 covers this.
- **No API contract change** — `seller_mark` was already part of the create and update request/response DTOs (`ArrivalSellerDTO`, `ArrivalSellerFullDTO`). No new fields, no version bump needed.
- **List endpoint** (`listArrivalsDetail`) is unaffected — it does not map `seller_mark` at all.
- **Contact.mark propagation** is transactional — if it fails, the entire arrival save rolls back (strict consistency).

## Production Readiness

| Check | Status |
|---|---|
| Contact.mark column supports changes | `varchar(20)`, nullable — safe |
| Transaction boundary correct | Single `@Transactional` in parent — rollback works correctly |
| Uniqueness validation matches ContactResource | Uses same repo queries — consistent |
| Frontend prevents >20 char input | `maxLength={20}` enforced on contact seller inputs |
| Error messages clear to user | Explicit validation failures with helpful messages |
| Contacts reload after save | `loadContactsFromApi()` called after every successful save |
| No breaking changes to existing arrivals | Read path fallback logic preserved |
| Free-text sellers unaffected | Still use seller_in_vehicle.seller_mark only (no propagation) |
