# Handover Reports

> **Entry-level frontmatter disipline:** Her devir kaydı kendi YAML frontmatter'ı ile başlar (dosya-level frontmatter YOK). Yeni kayıtlar dosyanın **en üstüne** eklenir; eski kayıtlar silinmez.
>
> **Rotation:** 5 devir VEYA dosya boyutu > 30 KB olduğunda engine `handover-<YYYY-MM-DD-HHMM>.md` adıyla rotation yapar.

<!-- ŞABLON — kopyala, doldur, bu yorum satırını sil -->

---
status: uninitialized
author: +<persona>
updated_at: 1970-01-01T00:00:00Z
---

## Handover: [task-id] — [task-name]

- **To:** [devralan +ajan veya "Yok" — görev Done] *(opsiyonel)*
- **Date:** [DD.MM.YY-HH:MM]
- **Status:** [Tamamlandı / Bloklandı / Kısmen tamamlandı]

### Completed *(zorunlu)*

- [Ne yapıldı? Tek cümleyle özetle, gerekirse madde madde.]

### Changed Files *(zorunlu)*

- `[dosya-yolu]` — [ne değişti]

### Kritik Bağlam *(zorunlu — en az 1 madde)*

- [Bir sonraki ajanın mutlaka bilmesi gereken bilgi. Workaround, kritik bağımlılık, beklenmedik davranış, alınan karar. Boş bırakma — "Yok" yaz.]

### Watch-outs & Decisions *(varsa)*

- [Kırılgan nokta, teknik borç, ileride sorun çıkabilecek alan. `.kortext/memory/decisions.md`'ye referans ver.]

### Last Commit *(zorunlu)*

- `[commit-hash]` — `[commit-mesajı]`

### Next Steps *(zorunlu)*

- [Devralan ajan ne yapacak? Yoksa "Yok" yaz — boş bırakma.]
