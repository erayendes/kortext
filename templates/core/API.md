---
status: uninitialized
author: +architect
approver: +prime
---

# API Reference

## Authentication

- **Type:** [e.g., Bearer Token, OAuth2, API Key]
- **Headers:**

## Base URLs

- **Production:** `https://api.example.com/v1`
- **Staging/Test:** `https://staging-api.example.com/v1`

## Endpoints

### [Module Name / Group Name]

#### `GET /path/to/resource` (Description)

- **Authorization:** [which role, from the model `SECURITY.md` defines — or `public`]
- **Parameters / Query:**
  - `param` (type): [Description]
- **Request Body:** (If any)

```json
{
  "key": "value"
}
```

- **Response Data (Success 2xx):**

```json
{
  "data": "value"
}
```

- **Response Data (Error 4xx/5xx):**

```json
{
  "error": "Message"
}
```

## Error Codes & Formatting

- **200:** Success
- **400:** Bad Request
- **401:** Unauthorized
- **403:** Forbidden
- **404:** Not Found
- **500:** Internal Server Error

## Revision Requests

- [One line per document, in the form: - [ ] `TARGET.md` — what must change there and why. Leave the box unticked; kortext ticks it and records the outcome underneath when the demand is settled. Leave this section empty when nothing upstream needs to change]

## Open Questions for prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
