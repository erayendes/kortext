# Handover Reports

> [!TODO]
> - Kullanım Kuralı: Yeni kayıtlar dosyanın **en üstüne** eklenir; eski kayıtlar silinmez.
> - Her görev kapanışında doldurulması zorunludur — handover tamamlanmadan görev Done'a çekilemez.
> - Oturum başlangıcında bu dosyayı `kortext-session-start.py` ile özetle: `python scripts/kortext-session-start.py`

<!-- ŞABLON — kopyala, doldur, bu yorum satırını sil -->
## Handover: [task-id] — [task-name]

> [!INFO]
> - **Author:** [+ajan] 
> - **To:** [devralan +ajan veya "Yok" — görev Done]
> - **Date:** [DD.MM.YY-HH:MM]
> - **Status:** [Tamamlandı / Bloklandı / Kısmen tamamlandı]

### ✅ Completed *(zorunlu)*

- [Ne yapıldı? Tek cümleyle özetle, gerekirse madde madde.]
 
### Changed Files *(zorunlu)*

- `[dosya-yolu]` — [ne değişti]

### Kritik Bağlam *(zorunlu — en az 1 madde)*

- [Bir sonraki ajanın **mutlaka** bilmesi gereken bilgi. Workaround, kritik bağımlılık, beklenmedik davranış, alınan karar. Boş bırakma — "Yok" yaz.]

### Watch-outs & Decisions *(varsa)*

- [Kırılgan nokta, teknik borç, ileride sorun çıkabilecek alan. `workspace/memory/decisions.md`'ye referans ver.]

### Last Commit *(zorunlu)*

- `[commit-hash]` — `[commit-mesajı]`

### Next Steps *(zorunlu)*

- [Devralan ajan ne yapacak? Yoksa "Yok" yaz — boş bırakma.]

