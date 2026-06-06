# Spike Pipeline

> **Bu dosyada:** Bir teknik belirsizliği koda başlamadan çözen otonom araştırma. Planning'de planlı ya da geliştirme sırasında runtime tespitiyle açılır — prime başlatmaz. Sonunda **her zaman** prime'a sade bir rapor + onay gelir; prime onaylamadan bu karara bağlı geliştirme başlamaz. Foundation okunmaz; references source-of-truth.

## Araştırma

1. **+engineering-manager:** Spike item'ının hipotezini ölçülebilir biçimde netleştir ("X yöntemi Y'yi çözer", başarı kriteri ölçülebilir). Hipotezi test et — dokümantasyon + kaynak tara, gerekirse production'a gitmeyecek küçük PoC yaz. Bulguları, kısıtları ve denenen alternatifleri not al. Karar verecek kadar bilgi toplandığında dur; kapsamı genişletme.
   - inputs: `.kortext/references/STACK.md`, `.kortext/references/STRUCTURE.md`
   - outputs: spike-explored

## Karar

1. **+engineering-manager:** Spike sonucunu ADR olarak yaz (`.kortext/memory/decisions.md`'e işle): seçilen yol + gerekçe + elenen alternatifler + tahmini maliyet/etki. Prime'ın teknik bilgisi olmadığı varsayımıyla sade dille: hangi belirsizlik vardı, ne araştırıldı, ne seçildi, neden, neyi eledik, maliyeti ne. Hipotez çürüdüyse veya kapsam belirsizleştiyse bunu da aynı sadelikte raporla (öneri: alternatif yol ya da yeni spike). Motor ADR'yi prime onayına sunar.
   - inputs: spike-explored
   - approver: +prime
   - outputs: spike-decided

**Sonraki akış:** Prime ADR'yi onaylar → karara bağlı item `development-cycle`'a girer; kapsam belirsizse `planning-pipeline`. Onay gelmeden bu karara bağlı geliştirme başlamaz.
