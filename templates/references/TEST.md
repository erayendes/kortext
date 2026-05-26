---
status: uninitialized
author: +qa-engineer
reviewer:
approver: +engineering-manager
---

# Testing Strategy

## Testing Scope & Approach

- **Kapsam:** [Neler test edilecek, neler (şimdilik) test edilmeyecek?]
- **Ana Yaklaşım:** [Örn: TDD uygulanacak mı, Shift-Left testing yapılacak mı?]

## Tools & Frameworks

- **Unit Testing:** [Örn: Jest, Vitest]
- **Integration/E2E Testing:** [Örn: Cypress, Playwright]
- **Load/Performance Testing:** [Örn: k6, JMeter]

## Test Layers

### Unit Tests

- **Sorumluluk:** Geliştiriciler (+backend-developer / +frontend-developer)
- **Kural:** Her fonksiyon modüler olarak test edilecek (Coverage hedefi: `%80`)

### Integration Tests

- **Sorumluluk:** Geliştiriciler & +qa-engineer
- **Kural:** API Endpoints ve Database haberleşmesi test edilecek.

### End-to-End (E2E) & Smoke Tests

- **Sorumluluk:** +qa-engineer
- **Kural:** Kullanıcının ana akışları (login, sepete ekleme, ödeme) production'a çıkmadan önce mutlaka geçmeli.

## CI/CD Integration (Pipeline Rules)

- Sonuç: `[Test Başarısız olursa Merge yasaklanır]`
- Sonuç: `[Coverage %80 altındaysa PR reddedilir]`

## Acceptance Criteria (Definition of Done)

- [Bir QA personunun onay verebilmesi için işin (Task) sağlaması gereken test kriterleri nelerdir?]
