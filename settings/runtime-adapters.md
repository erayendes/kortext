# Kortext Runtime Adapter Referansı

Bu dosya, Kortext framework'ünün üç farklı AI runtime'ı (Claude Code, Gemini CLI, Codex/Generic) ile nasıl bağlandığını tanımlar. Faz 2 (glue layer) kapsamında oluşturulmuştur ve `kortext init --runtime <name>` komutunun hangi adapter'ı kuracağını belirler.

## 1. Genel İlke

- **AGENTS.md herkes okur.** Bu dosya, runtime'dan bağımsız olarak tüm AI araçlarının okuduğu **baseline persona ve davranış sözleşmesidir**. Codex CLI ve generic (özelleşmemiş) runtime'lar için tek kontrol noktasıdır.
- **Her runtime için ayrı hook event mapping vardır.** Claude Code `PreToolUse` / `PostToolUse` event'leri kullanırken, Gemini CLI `preToolCall` / `postToolCall`, Codex ise yalnızca git hook chain üzerinden çalışır.
- **`kortext init --runtime <name>`** kurulum sırasında uygun adapter config dosyasını projeye yerleştirir. Runtime tespiti `--runtime` flag'i veya `KORTEXT_RUNTIME` env var üzerinden yapılır.
- **Git hook'ları runtime'dan bağımsızdır.** `pre-commit`, `commit-msg` ve `pre-push` shell hook'ları her runtime'da aynı şekilde çalışır; bu hook'lar AI runtime API'ına bağlı değildir.

## 2. Hook Event Mapping Tablosu

Kortext hook'larının her runtime'da hangi event'e bağlandığını gösteren ana referans tablosu:

| Kortext Hook | Claude Code Event | Gemini CLI Event | Codex / Generic |
|---|---|---|---|
| `write-guard.sh` | `PreToolUse:Write\|Edit` | `preToolCall` | `preTool` (AGENTS.md kuralı) |
| `audit-logger.sh` | `PostToolUse:*` | `postToolCall` | `postTool` (AGENTS.md kuralı) |
| `secret-scanner.sh` | `PreToolUse:Bash\|Write` | `preToolCall` | `preTool` (AGENTS.md kuralı) |
| `auto-locker.sh` | `PreToolUse:Edit\|Write` (path filter: `workspace/memory/context/`, `handover.md`) | `preToolCall` | `preTool` (AGENTS.md kuralı) |
| `auto-unlocker.sh` | `PostToolUse:Edit\|Write` (aynı path filter) | `postToolCall` | `postTool` (AGENTS.md kuralı) |
| `snapshot-guard.sh` | `PreToolUse:Edit\|Write` (critical paths: `handover.md`, `decisions.md`, `learned.md`, `context/`) | `preToolCall` | `preTool` (AGENTS.md kuralı) |
| `lint-guard.sh` | `git pre-commit` (shell, runtime'dan bağımsız) | aynı | aynı |
| `size-guard.sh` | `git pre-commit` | aynı | aynı |
| `commit-msg-guard.sh` | `git commit-msg` | aynı | aynı |
| `branch-guard.sh` | `git pre-push` | aynı | aynı |
| `backlog-sync-guard.sh` | `git pre-commit` | aynı | aynı |
| `handover-guard.sh` | `git pre-commit` | aynı | aynı |

**Önemli not:** Git hook'ları runtime'dan tamamen bağımsızdır. AI runtime hook'ları (Claude Code'un `PreToolUse`/`PostToolUse` mekanizması gibi) yalnızca AI ajanın tool çağrılarını yakalar; git operasyonlarına müdahale etmez.

## 3. Environment Değişkenleri

Her runtime'ın hook'lara hangi environment değişkenini ilettiğini gösterir. Tüm hook'lar `KORTEXT_FILE_PATH`'i öncelikli arar, bulamazsa runtime'a özgü değişkene düşer.

### Claude Code

- `CLAUDE_FILE_PATH` — Hedef dosyanın yolu (Write/Edit tool kullanıldığında).
- `CLAUDE_TOOL_NAME` — Çağrılan tool adı (`Write`, `Edit`, `Bash`, `Read` vb.).
- **stdin (JSON):** Claude Code, hook'lara JSON formatında bağlam iletir. Hook'lar bunu `jq` veya python ile parse eder.

### Gemini CLI

- `GEMINI_FILE_PATH` — Hedef dosyanın yolu.
- `GEMINI_TOOL_NAME` — Çağrılan tool adı.
- **Not:** Gemini CLI'nin hook API'ı Claude Code'a göre daha kısıtlıdır; bazı event'ler eşleşmeyebilir.

### Codex / Generic

- `KORTEXT_FILE_PATH` — Universal fallback. Runtime'a özgü değişken yoksa kullanılır.
- Codex ve generic runtime'larda in-process hook mekanizması olmadığı için hook'lar yalnızca git seviyesinde tetiklenir.

### Tüm Runtime'lar İçin Ortak

- `KORTEXT_AGENT_NAME` — Aktif ajanın adı (örn: `backend-developer`). Audit log ve lock dosyaları bu değeri kullanır.
- `KORTEXT_RUNTIME` — Aktif runtime adı (`claude_code`, `gemini_cli`, `codex`). Hook'lar runtime-specific davranış için bu değeri okuyabilir.
- `KORTEXT_HOOK_MODE` — `permissive` (varsayılan) veya `strict`. Strict modda eksik env var hatası fail-loud yapar.
- `KORTEXT_INTERACTION_LANGUAGE` — Kullanıcıyla iletişim dili (`tr` / `en`).

## 4. Kurulum Akışı

`kortext init --runtime <name>` komutu çağrıldığında izlenen adımlar:

1. **Runtime Tespiti**
   - `--runtime` flag'i öncelikli okunur.
   - Flag yoksa `KORTEXT_RUNTIME` env var kontrol edilir.
   - O da yoksa `claude_code` varsayılan kabul edilir (en olgun adapter).

2. **Adapter Config Dosyasını Yerleştir**
   - `claude_code` → projedeki `.claude/settings.json` olarak kopyalanır. Template: `settings/.claude-settings.template.json`.
   - `gemini_cli` → projedeki `.gemini/config.json` olarak kopyalanır. Template: `settings/.gemini-config.template.json` (Faz 2 v2'de eklenecek; şimdilik placeholder).
   - `codex` → AGENTS.md proje köküne kopyalanır. Codex zaten AGENTS.md'yi otomatik okur, ek config gerekmez.

3. **Git Hook'ları Kur** (runtime'dan bağımsız)
   - `.git/hooks/pre-commit`, `.git/hooks/commit-msg`, `.git/hooks/pre-push` symlink olarak kurulur.
   - Hedef dosyalar `<kortext-root>/hooks/git-pre-commit.sh`, `commit-msg-guard.sh`, `git-pre-push.sh`.

4. **Environment Değişkeni Önerisi** (opsiyonel)
   - `KORTEXT_RUNTIME=<name>` değişkeninin shell profile (`~/.zshrc`, `~/.bashrc`) veya proje `.env` dosyasına eklenmesi önerilir.
   - Bu sayede sonraki oturumlarda runtime tespiti otomatik olur.

## 5. Genişletilebilirlik

Yeni bir runtime eklemek için aşağıdaki adımlar izlenir:

1. **Bu dosyaya yeni sütun ekle** — Bölüm 2'deki tabloya yeni runtime sütunu eklenir; her hook için event mapping tanımlanır.
2. **Yeni template config dosyası oluştur** — `settings/.<runtime>-config.template.<format>` (örn: `.openai-config.template.json`).
3. **`hooks/kortext-init.sh` güncelle** — Yeni bir runtime branch'i eklenir; tespit ve dosya kopyalama mantığı yazılır.
4. **Environment değişkeni dokümante et** — Bölüm 3'e yeni runtime için file_path env var'ı eklenir.
5. **Test et** — `kortext init --runtime <new>` ile boş bir projede smoke test yap.

## 6. Bilinen Sınırlar

- **Gemini CLI hook API olgunluğu:** Gemini CLI'nin hook API'ı şu an Claude Code kadar olgun değil. Bazı event'ler (özellikle JSON stdin tabanlı bağlam aktarımı) tam olarak desteklenmiyor olabilir. Gemini runtime'ında hook'lar fallback davranışına düşebilir (`KORTEXT_HOOK_MODE=permissive`).

- **Codex / Generic'te in-process hook yok:** Codex CLI ve generic runtime'lar, AI ajan tool çağrılarını yakalamak için in-process bir hook mekanizması sunmuyor. Bu nedenle:
  - `write-guard.sh`, `auto-locker.sh`, `secret-scanner.sh` gibi pre-tool hook'lar **çalışmaz**.
  - Ajan davranışı kontrolü tamamen **AGENTS.md** üzerinden sağlanır (ajan AGENTS.md kurallarına uymak zorunda olduğu varsayımıyla).
  - Yalnızca git seviyesi hook chain çalışır (`pre-commit`, `commit-msg`, `pre-push`).

- **Runtime karışık modu desteklenmez:** Aynı projede birden fazla runtime aynı anda kullanılamaz. `kortext init` çalıştırıldığında tek bir runtime seçilir; geçiş yapmak için tekrar `init` gerekir.

- **Path filter granülaritesi:** Claude Code'da `matcher` field'ı regex destekler ama path-based filtering native değildir. Path filter mantığı hook script içinde uygulanır (`auto-locker.sh` zaten `case "$FILE_PATH" in *"context.md"*) ...` ile bunu yapıyor).
