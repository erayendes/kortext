---
status: uninitialized
owner: +engineering-manager
last_review: 2026-05-17
---

# API Reference

> [!INFO]
> - status: [draft/approved] | [DD.MM.YY-HH:MM]
> - author: +engineering-manager
> - reviewer: +backend-developer

---

## Authentication

- **Type:** [Örn: Bearer Token, OAuth2, API Key]
- **Headers:** 

## Base URLs

- **Production:** `https://api.example.com/v1`
- **Staging/Test:** `https://staging-api.example.com/v1`

## Endpoints

### [Modül Adı / Grup Adı]
#### `GET /path/to/resource` (Açıklama)
- **Parameters / Query:**
- `param` (type): [Açıklama]
- **Request Body:** (Eğer varsa)
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
- vb.