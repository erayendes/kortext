# Branch ve Versiyon Kuralları

- **Amaç:** Kod kalitesini, izlenebilirliği ve production güvenliğini korumak.
- **Sorumlu:** +devops-engineer branch, merge, tag ve release kayıtlarından sorumludur. Geliştirici ajanlar kendi item branch'lerinden sorumludur.

## Branch Tipleri

| Branch | Kaynak | Hedef | Açıklama |
| :--- | :--- | :--- | :--- |
| `main` | - | - | Production'da çalışan son kararlı hattır. Doğrudan geliştirme yapılmaz. |
| `development` | `main` | `main` | Staging/preprod hattıdır. Tamamlanan item'lar burada toplanır. |
| `feature/[item-id]-[short-name]` | `development` | `development` | Yeni özellik veya planlı geliştirme işi. |
| `bugfix/[item-id]-[short-name]` | `development` | `development` | Production'a çıkmamış hata düzeltmesi. |
| `hotfix/[item-id]-[short-name]` | `main` | `main` + `development` | Production'daki kritik hata düzeltmesi. |
| `release/vA.B.C` | `development` | `main` | Production release hazırlığı. Gerekli değilse atlanabilir. |
| `chore/[short-name]` | `development` | `development` | Özellik içermeyen bakım işi: CI, dokümantasyon, config, bağımlılık güncellemesi. |

## İsimlendirme

- Branch adları küçük harf ve kebab-case olmalıdır.
- Item'a bağlı branch'lerde item ID zorunludur.
- Örnekler:
  - `feature/t01-login-form`
  - `bugfix/b04-token-expiry`
  - `hotfix/b07-login-crash`
  - `release/v1.2.0`
  - `chore/update-ci-cache`

## Koruma Kuralları

- `main` ve `development` üzerinde doğrudan geliştirme yapılmaz.
- Hotfix haricinde `main` üzerinden branch açılmaz.
- Force push ve history rewrite yasaktır.
- Merge conflict'leri manuel çözülür; conflict görmezden gelinmez.
- Mevcut tasarım, config ve proje yapısı gereksiz refactor ile değiştirilmez.

## Merge Kuralları

- `feature/*`, `bugfix/*` ve `chore/*` branch'leri `development` hedefine PR ile alınır.
- `hotfix/*` önce `main` hedefine alınır, sonra aynı değişiklik `development` hattına geri taşınır.
- Production release `development` içeriğinin `main` hattına kontrollü alınmasıdır.
- `main` ve `development` branch'leri hiçbir durumda yer değiştirmez.
- Production sorunu çıkarsa çözüm `07-rollback-pipeline.md` veya `08-hotfix-pipeline.md` üzerinden yapılır; branch geçmişi yeniden yazılmaz.
- Merge yöntemi proje ayarına bağlıdır; varsayılan tercih `Squash and Merge` ile item geçmişini sade tutmaktır.

## PR ve Onay Kuralları

- PR açıldığında doğrulama süreci `workflows/05-test-cycle.md` standardına göre yürütülür.
- `main` hedefine giden PR'larda +prime onayı zorunludur.
- Teknik inceleme +engineering-manager tarafından yapılır.
- Gerekli Review Gates varsa +qa-engineer, +security-engineer ve +designer kontrolleri tamamlanmadan merge yapılmaz.

## Commit Kuralları

- Commit mesajları İngilizce ve Conventional Commits formatında olmalıdır.
- Örnekler:
  - `feat: add login form`
  - `fix: resolve token expiry`
  - `docs: update setup guide`
  - `chore: update ci cache`
- Item ID commit body veya footer alanında belirtilir:

```text
Refs: T01
```

## Versiyon ve Tag Kuralları

- Semantic Versioning kullanılır: `vMAJOR.MINOR.PATCH`.
- Release tag formatı: `vA.B.C`.
- Release candidate gerekiyorsa format: `vA.B.C-rcN`.
- Build metadata gerekiyorsa format: `vA.B.C+build.N`.
- Hotfix patch numarasını artırır: `v1.0.0` -> `v1.0.1`.
- Release tag'i production doğrulaması başarıyla tamamlandıktan sonra `workflows/06-deployment-cycle.md` kapsamında +devops-engineer tarafından oluşturulur.

## Workflow Referansları

- Normal geliştirme: `workflows/04-development-cycle.md`
- Test ve doğrulama: `workflows/05-test-cycle.md`
- Production deployment: `workflows/06-deployment-cycle.md`
- Rollback: `workflows/07-rollback-pipeline.md`
- Hotfix: `workflows/08-hotfix-pipeline.md`
