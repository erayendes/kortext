# Kortext Setup

Bu akış Kortext'i hedef projede başlatır, sistem dosyalarını korur ve ilk çalışma kararını +prime'a bildirir.

## Girdi ve Çıkış

- **Başlangıç koşulu:** Kortext dosya ağacı hedef projeye eklenmiş olmalıdır.
- **Girdi:** `../workspace/references/blueprint.md`
- **Çıkış:** Kilitlenmiş framework çekirdeği ve +prime için bir sonraki akış kararı.
- **Sonraki akış:** Yeni proje için `01a-analysis-pipeline.md`, mevcut proje için `01b-onboarding-pipeline.md`.

## Koruma

1. Başka hiçbir işlem yapmadan önce `../scripts/lock_kortext.sh` dosyasını çalıştır.
2. Aşağıdaki Kortext sistem dosyalarını ve dizinlerini salt okunur yap:
	- `../AGENTS.md`
	- `../agents/`
	- `../rules/`
	- `../workflows/`
	- `../hooks/`
	- `../scripts/`

## Anayasanın Yüklenmesi

3. Kortext protokollerini ve davranış kurallarını içeren şu dosyaları oku:
	- `../rules/behavior.md`
	- `../rules/commands.md`

## Durum Tespiti

4. Kortext dizin yapısının doğru olup olmadığını ve güncel olup olmadığını kontrol et.

> [!WARNING] BLUEPRINT KOŞULU
> `../workspace/references/blueprint.md` boşsa sistem ilerlemez.

5. `../workspace/references/blueprint.md` dosyasını kontrol et.
	- Blueprint boşsa süreci durdur ve +prime'dan blueprint'i tamamlamasını iste.
	- Blueprint doluysa Kortext kurulumu tamamlanır; yeni proje analizi veya mevcut proje onboarding kararı +prime komutuyla verilir.
	- Yeni proje için `01a-analysis-pipeline.md` akışı kullanılır.
	- Mevcut projeyi Kortext'e adapte etmek için `01b-onboarding-pipeline.md` akışı kullanılır.

## Bildirim

Duruma göre yalnızca ilgili bildirimi kullan.

> [!NOTE] KORTEXT [DURDU/YÜKLENDİ]
> +prime,
> [`../workspace/references/blueprint.md` boş olduğu için kurulumu ilerletmiyorum.
> Blueprint'i tamamladıktan sonra `!setup kortext` komutunu bekliyorum.]
> [Kortext yüklendi ve [project-name] projesi için hazır.
> Yeni projenin analizi için `!start analysis` komutunu bekliyorum.]
> [Kortext yüklendi ve [project-name] projesi için hazır.
> Mevcut projeyi Kortext'e adapte etmek için `!start onboard` komutunu bekliyorum.]
