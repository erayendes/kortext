# Spike Workflow (`!start spike`)

## Tanım

1. **+engineering-manager:** Spike konusunu, hipotezi ve time-box'ı tanımla. Hipotez "X yöntemi Y sorunu çözer" şeklinde test edilebilir bir önerme; başarı kriteri ölçülebilir; time-box 2 saat (kısa araştırma), 4-8 saat (PoC) veya 1 gün (mimari araştırma). Time-box uzatma sadece `+prime` onayıyla mümkün.
   - inputs: `.kortext/foundation/TRD.md`

## Araştırma

1. **+engineering-manager:** Hipotezi test et. Dokümantasyon + kaynak tara, gerekirse küçük PoC yaz (production'a gitmeyecek deneme kodu). Bulguları, beklenmedik kısıtlamaları ve denenmiş alternatifleri not al. Time-box dolduğunda devam etme — mevcut bilgiyle karar al.

## Karar

1. **+engineering-manager:** Spike sonucuna göre çıktı üret. Üç olası dal:
   - Hipotez doğrulandı → `write_decision` MCP tool ile ADR yaz (decision_id, title, status=accepted, body: hipotez + bulgular + seçilen yol + reddedilen alternatifler), sonraki akış `development-cycle`.
   - Kapsam belirsizleşti → `add_backlog_item --type spike` ile yeni Task aç + neden netleşmediğini açıkla, sonraki akış `planning-pipeline`.
   - Hipotez reddedildi → `+prime`'a alternatif yol için `pending_question` aç, karar bekle.
   - approver: +prime

**Sonraki akış:** `development-cycle`
