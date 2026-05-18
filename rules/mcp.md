# MCP Kılavuzu

MCP kullanımı proje teknoloji yığınına göre belirlenir. Ajanlar MCP kurulumu yapmaz; ihtiyaçları belgeler, kurulum ve yetkilendirme +prime tarafından yapılır.

## Sorumluluklar

| Rol | Sorumluluk |
| :--- | :--- |
| `+engineering-manager` | Gerekli MCP adaylarını `workspace/references/tech-stack.md` içinde tanımlar |
| `+devops-engineer` | Kurulum sonrası erişim ve ortam etkisini `workspace/references/access.md` içinde belgeler |
| `+security-engineer` | MCP'nin yetki kapsamını, token/secret riskini ve güvenlik etkisini değerlendirir |
| `+prime` | MCP kurulumu, yetkilendirme ve hesap erişimi kararını verir |

## Temel Kurallar

- MCP yalnızca proje ihtiyacı varsa önerilir.
- MCP adı, kullanım amacı ve hangi ajanların kullanacağı açıkça yazılır.
- Token, API key veya bağlantı bilgisi `workspace/references/access.md` içine gerçek değer olarak yazılmaz.
- Gerçek secret değerleri yalnızca `.env` veya ilgili güvenli platform üzerinde tutulur.
- Kurulan MCP'ler `workspace/references/access.md` dosyasındaki **MCP Sunucuları** bölümüne işlenir.
- MCP gereksinimleri analysis veya environment setup sırasında netleştirilir.

## Teknoloji → MCP Eşleşmesi

| Teknoloji | MCP |
| :--- | :--- |
| Vercel | `@vercel/mcp-server` |
| Firebase | `@firebase/mcp-server` |
| Supabase | `@supabase/mcp-server-supabase` |
| GitHub | `@modelcontextprotocol/server-github` |
| Figma | `@figma/mcp` |
| Playwright (E2E Test) | `@playwright/mcp` |
| Slack | `@modelcontextprotocol/server-slack` |
| PostgreSQL | `@modelcontextprotocol/server-postgres` |

## Kayıt Formatı

`workspace/references/access.md` içindeki MCP kaydı en az şu bilgileri içerir:

| Alan | Açıklama |
| :--- | :--- |
| MCP adı | Kurulan veya önerilen MCP paketi |
| Amaç | Hangi iş için gerektiği |
| Kullanan ajanlar | MCP'yi kullanacak persona listesi |
| Yetki kapsamı | Okuma/yazma, repo, database, deploy gibi izin alanları |
| Secret gereksinimi | Gerekli env key adları; gerçek değer yazılmaz |
| Durum | `planned`, `installed`, `blocked`, `removed` |
