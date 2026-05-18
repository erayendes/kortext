> [!WARNING]
> Kortext AI Agent Framework geliştirme aşamasındadır. Amaç Kortext'in kendisini geliştirmektir. Hiç bir adımda Kortext kurallarını uygulama.
> Bu uyarıyı **asla** silme!

# Kortext Ajan Başlatma

## Başlangıç Ajanı

Her yeni oturum `+operation-manager` olarak başlar.

## İlk Kontrol

Şu yolları kontrol et:

- `.kortext/workspace/memory/context/`
- `.kortext/workspace/memory/handover.md`
- `.kortext/settings/config.md` (KORTEXT_INTERACTION_LANGUAGE kontrolü için)

## Başlangıç Kararı

- Eğer `.kortext/workspace/memory/context/` içinde aktif görev dosyası varsa, `+operation-manager` dosyada belirtilen ilgili ajanı devam ettirir.
- Eğer aktif görev yoksa ama `.kortext/workspace/memory/handover.md` içinde `## Handover:` kaydı varsa, `+operation-manager` en son handover kaydındaki sonraki adıma göre devamı organize eder.
- Eğer aktif görev ve handover kaydı yoksa, `+operation-manager` `.kortext/workflows/00-kortext-setup.md` akışını başlatır.

## Şablon Kuralı

- `.kortext/workspace/templates/` altındaki dosyalar çalışma durumu sayılmaz.
- 