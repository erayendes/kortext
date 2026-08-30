# Planning Pipeline — "Kopeng'e aktar" (işi görevlere bölme)

> Yalnız +prime paneldeki **"Kopeng'e aktar"** butonuna basınca koşar. Onaylı analiz
> belgelerinden Version → Epic → Task yapısını üretir ve Kopeng'in okuyacağı dosyaları
> `.kopeng/` altına koyar. Bu, el sıkışmanın son adımıdır.

## Girdiler

Onaylı belgeler: `foundation/PRD.md`, `foundation/TRD.md`, `.kortext/ARCHITECTURE.md`,
`STACK.md`, `SECURITY.md`, `LEGAL.md`, `API.md`, `DATABASE.md`, `DESIGN.md`, `TEST.md`
(not-applicable olanları atla).

## Çıktı — `.kopeng/` dosya düzeni (TASLAK sözleşme; Kopeng bu formata uyar)

```
.kopeng/
├── project.yaml                  # name, code, status: draft, created
├── versions/
│   └── v0.1.yaml                 # id, name, description, epics: [ACME-E01, …]
├── epics/
│   └── ACME-E01.yaml             # id, name, version, description, tasks: [ACME-T001, …]
└── tasks/
    └── ACME-T001.md              # frontmatter + gövde (aşağıda)
```

**Task dosyası** (`tasks/<ID>.md`) — frontmatter:
`id`, `name`, `epic` (opsiyonel — task epic'siz olabilir), `assignee` (`ai` | `prime`),
`blocked_by: []` (her zaman yaz, boşsa boş liste), `blocks: []`.
Gövde başlıkları (hepsi zorunlu; uygulanmıyorsa "—" yaz):

```
## Description
## Functional Requirements
## User Flow
## UI Requirements
## Technical Notes
## Acceptance Criteria
```

## Kurallar

1. **ID konvansiyonu:** proje kodu önek — `<CODE>-E01` (epic), `<CODE>-T001` (task).
   Slug/kebab-case id YASAK.
2. **Kapsam tavanı:** PRD/BRD'de item sınırı ya da "MVP/küçük" notu varsa AŞMA; şüphede
   daha az, daha büyük task. Bir özellik = bir task; frontend/backend/test diye BÖLME.
3. **Az versiyon:** MVP için 1–3 versiyon; her epic bir versiyona bağlı; task'lar epic'e
   bağlı olmak zorunda değil (bağımsız task version köküne yazılmaz, epic'siz kalır).
4. **+prime ön-gereksinimleri (ZORUNLU):** STACK/SECURITY/LEGAL/API'yi tara; insan aksiyonu
   gerektiren her ihtiyacı (hesap açma, API key, domain, cihaz, bütçe onayı)
   `assignee: prime` task'ı olarak üret ve ona bağımlı task'ların `blocked_by`'ına ekle.
5. **Bağımlılıklar:** gerçek sıralama zorunluluklarını `blocked_by` ile kur; dangling id
   bırakma; `blocks` alanını ters yönde tutarlı yaz.
6. **Acceptance Criteria** TEST.md'nin kalite çıtasıyla uyumlu, davranış odaklı ve
   doğrulanabilir olsun.
7. **Öz denetim (bitirmeden):** her dosya şemaya uygun mu; her epic'in `version`'ı ve
   listelenen `tasks`'ı gerçek mi; her task'ın frontmatter alanları eksiksiz mi; id'ler
   konvansiyonda mı; `project.yaml` `status: draft` mı. Sorun bulursan düzelt.
8. Kararlarını `.kortext/DECISIONS.md`'ye ekle (neden bu versiyonlama/bölme).
