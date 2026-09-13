# Değişiklik günlüğü

> [!NOTE]
> [For English press 9](../CHANGELOG.md)

## [Yayımlanmamış]

Panelden uçtan uca geçirilen ilk gerçek projenin bulguları.

- **Daha çok motor.** `antigravity` (Google'ın `agy`'si) gerçek bir proje koşturdu; `cursor`,
  `copilot`, `opencode`, `amp`, `droid`, `goose`, `qwen` ve `cline` CLI belgelerinden
  hazırlandı ve kurulduğu gün, untested işaretiyle, açılır listede görünür. `~/.local/bin`'deki
  bir CLI, sunucu o PATH olmadan bir uygulamadan başlatılmış olsa da bulunur.
- **Proje başına model.** Motorun yanındaki açılır liste CLI'a söylenen modeli adlandırır —
  `claude --model`, `codex -m`, `gemini -m`. Boş, CLI'ın kendi varsayılanını korur.
- **Recheck'ler havuz işidir.** Adımlarla birlikte aynı anda üçe kadar koşarlar, her koşu gibi
  motor değişikliğini izlerler ve koşan biri To do'da beklemek yerine Doing altında `reading`
  görünür. Başarısız bir recheck `failed · recheck` der.
- **Üç, üçtür.** Panelden başlatılan bir revizyon ya da yeniden deneme dördüncü bir CLI olarak
  koşmak yerine zincirle aynı havuzda yer alır.
- **Ajan onaylamaz.** Ajanın `approved` işaretlediği belge taslağa çevrilir ve öyle iner; başka
  bir başıboş durum koşuyu başarısız kılar ve önceki metni geri koyar, böylece başarısız bir
  yazım onu okuyan adımları asla açmaz.
- **Pause bekleyen revizyona ulaşır.** Dolu havuzun ardında sıraya giren revizyon, koşan bir iş
  gibi Pause ile iptal edilir ve notlarıyla Continue'yu bekler.
- **Sürüm seçici gerçek değişikliği gösterir.** Yeniden yazım, düşürdüğü istekler ve kararlar
  geri konduktan sonra kaydedilir; fark diskteki metne karşı alınır.
- **Model CLI'ına aittir.** Motor değişince yeni CLI'ın bilmediği model, codex'e `-m sonnet`
  geçirmek yerine varsayılana döner.
- **Boş plan onaylanamaz.** Son bölme başarısız olduysa ya da görev bırakmadıysa Approve plan
  reddedilir ve soluklaşır; kart "Plan ready" yerine hatayı gösterir.
- **Hiçbir CLI sunucudan uzun yaşamaz.** kortext'i durdurmak — `kortext --stop`, Ctrl-C, bir
  geliştirme yeniden başlatması — önce koşan her CLI'ı iptal eder; eskiden biri dakikalar sonra
  bitip sonraki sunucunun çoktan başarısız işaretlediği bir belgeye yazabiliyordu.
- **Recheck okurken düzenle.** Prime'ın düzenlemeleri yalnız bir koşu belgeyi yazarken
  reddedilir; recheck yalnız okur.
- **Save, requests done.** Bir belgede istekler dururken düzenleyici kendi metnini kaydedip
  onları kapatmayı önerir — bir sayı ya da bir cümle için ajana yeniden yazım yok.
- Recheck'i sırada bekleyen taslak önce `approve` gösterir; başarısız bir Retry nedenini satıra
  yazar; altındaki belge hareket edince tepsi notun etiketini korur.

## [3.1.0] — 2026-09-06

İlk açık sürüm.

> **Tarih burada başlar.** 3.1.0'dan önce bu adla yayımlanan farklı bir araçtı — geliştirmeyi
> kendisi yürüten bir orkestrasyon motoru — kişisel olarak yapılmış ve kullanılmış, hiç
> duyurulmamış. Aşağıda anlatılan Kortext yalnız adı tutan yeni bir üründür; kaydı o
> sürümü sürdürmek yerine bu sürümle başlar.

Kortext bir brief'i ya da mevcut bir kod tabanını onaylı bir analiz temeline çevirir. Zaten
sahip olduğun ajan CLI'ını — `claude`, `codex` ya da `gemini` — kendi repo'nun içinde, arayüzsüz,
analiz koşusu başına bir belgeyle sürer; bağımlılıklar izin verdiğinde proje başına en fazla üç
koşu paralel. Uygulanabilir her belge taslak olarak iner; onaylarsın, bir satır hakkında yazarına
sorarsın ya da notlarla geri gönderirsin ve zincir onaylarınla ilerler. Her belge yerine
oturduğunda Kortext çekilir: belgeler projenin sözleşmesi olur, `AGENTS.md` ajanına koşulları
teslim eder ve kodu Kortext değil, ajanın yazar.

- **Anahtar yok, API yok.** Kortext kendi adına hiçbir model çağırmaz. Kurduğun CLI'ın
  arkasındaki aboneliği harcar; o CLI proje başına seçilir.
- **Hiçbir şey yoktan yazılmaz.** İlk adım koşmadan bir kapı brief'i okur: ne yapıldığını,
  kimin için, hangi dilde ya da neyin kapsam dışı olduğunu söylemeyen bir brief, uydurulmuş
  belgeler üretmek yerine o sorularla geri döner.
- **Belgeler senindir.** On dört analiz belgesi doğrudan `.kortext/` altında düz markdown olarak
  yaşar; yeni projelerde bir de `BRIEF.md`. Frontmatter'daki `status` tek doğru kaynaktır.
- **Panel bütün yüzeydir.** Onaylar, yazar personaya satıra bağlı sorular, belgeler arası
  revizyon istekleri ve analizi bitiren el sıkışma.
- **Tek süreç, tek port.** `localhost:3441`'de React panelin arkasında Express ve SQLite; kayıt
  `~/.kortext/kortext.db`'de tek bir global veritabanıdır.
- **Arka planda çalışır.** `kortext` sunucuyu ayrık başlatır ve paneli açar; terminal
  gidebilir. Durum çubuğundaki ⏻ düğmesi ya da `kortext --stop` onu indirir — bir adım
  yazarken asla. Aynı panel npm'de yeni sürüm olduğunda söyler ve kurar.

Node 22 ve `PATH`'te bir ajan CLI'ı gerektirir.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)'a dayanır; Kortext
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.
