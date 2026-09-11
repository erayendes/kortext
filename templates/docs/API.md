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

## Change Requests

- [What THIS document asks of another, one line per request: - `TARGET.md` — what must change there and why. It travels to that document when this one is approved. Lines that start with `from` are the other direction — what others asked of this document; the human decides them, kortext ticks them, leave them exactly as they are. Leave this section empty when nothing upstream needs to change]

## Questions for Prime

- [Anything prime must answer before this document can be relied on — leave this section empty when there is nothing]
