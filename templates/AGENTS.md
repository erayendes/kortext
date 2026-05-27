# Kortext Ajan Bootstrap

> AI araçları (Claude Code, Cursor, Codex) için proje kökü giriş noktası. Keşif dosyası — repo kökünde tut.

## Boot Persona

Her yeni oturum `+operation-manager` olarak başlar.

## İlk Kontroller

Sırayla incele:

- `.kortext/data/` — SQL motor durumu (contexts, runs, locks). Motor okur, ajan doğrudan parse etmez.
- `.kortext/memory/handover.md` — son devir notu (entry-level frontmatter blokları).
- `.kortext/memory/decisions.md` — ADR TOC; seçici okuma.
- `.kortext/memory/learned.md` — Knowledge Base TOC; seçici okuma.

## Bootstrap Kararı

- Motor oturum için aktif bir context bildiriyorsa, `+operation-manager` referans verilen persona'yı resume eder.
- Aksi durumda `handover.md`'de `Next Steps`'i açık bir `## Handover: …` bloğu varsa, `+operation-manager` sıradaki adımı organize eder.
- Aksi durumda `+operation-manager` `workflows/00-kortext-setup.md`'yi tetikler (workflow'lar global pakette yaşar — bu repo'da değil).

Onay gate'leri (`approver: +prime`) dashboard inbox üzerinden kullanıcıya (`+prime`) düşer — ajanlar kendilerini onaylamaz.

## Kurallar

npm paketi `node_modules/kortext/rules/` altında altı rule dosyası taşır:

- `behavior.md` — ton, otonomi sınırları, escalation disiplini.
- `branching.md` — git worktree + branch isimlendirme konvansiyonları.
- `commands.md` — shell-free spawn disiplini, izinli CLI desenleri.
- `emergency.md` — kill-switch + rollback kuralları.
- `mcp.md` — MCP tool envelope ve stdio disiplini.
- `models.md` — persona → executor (Claude / Codex / Gemini / Antigravity) yönlendirmesi.

Kurallar motor tarafından boot'ta yüklenir ve runtime'da enforce edilir — ajanlar her adımda okumaz, ama her persona bu kurallara bağlıdır. Bir disiplinden emin değilsen ilgili rule dosyasına bak (ör. yıkıcı bir komut çalıştırmadan önce `rules/commands.md`).

## Şeyler nerede yaşar (v3.1+)

- Persona / workflow / rule tanımları: **global npm paketi** (`node_modules/kortext/{agents,workflows,rules}/`) — buraya asla kopyalanmaz.
- Proje kaynakları:
  - `.kortext/foundation/{BRD,PRD,TRD,PFD}.md` — analiz fazı çıktıları, bir kez üretilir sonra donar (git-tracked).
  - `.kortext/references/*.md` — ALL-CAPS canlı referanslar (ACCESS, API, CONTENT, DATABASE, DESIGN, ENVIRONMENT, GLOSSARY, GROWTH, LEGAL, SECURITY, STACK, STRUCTURE, TEST).
  - `.kortext/reports/*.md` — per-file engine + persona raporları (`<scope>_<slug>_<ts>.md`).
  - `.kortext/memory/*.md` — handover, decisions, learned.
- Motor durumu: `.kortext/data/` (git-ignored — SQLite + worktrees + logs).
- Backlog item'lar: SQL (`backlog_items` tablosu), dosya değil. Yeni bir backlog item oluşturulurken `body_md` `node_modules/kortext/templates/backlogs/<type>.md`'den seed edilir.

## Frontmatter disiplini

Her reference / report / memory dosyası YAML frontmatter taşır (tek doğru kaynak):

- `references/` — `status, author, reviewer, approver`
- `reports/` — `status, author, reviewer, updated_at`
- `memory/handover.md` — **entry-level** (her `## Handover: …` bloğunun kendi frontmatter'ı vardır)
- `memory/decisions.md` / `memory/learned.md` — section-level header pattern + TOC

Engine `decisions.md` / `learned.md`'deki TOC girdilerini otomatik olarak korur.
