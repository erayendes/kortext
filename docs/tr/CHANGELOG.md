# Değişiklik günlüğü

🇬🇧 [For English press 9](../CHANGELOG.md)

## [Yayımlanmamış]

- **İstek başına tek karar.** İsteyen belgede giden isteği kabul etmek hedefi o istekle hemen
  yeniden yazdırır; aynı kişinin ikinci kez kabul etmesi için gelen istek olarak düşmüyor artık.
  Send, Accept oldu.
- **Gönderilmiş tepsi tek belgeye aittir.** Apply'dan sonra tepsi bir sonraki açılan belgede de
  salt okunur kalıyordu — × yok, Apply pasif — ve yeniden yazım çekmece kapalıyken inerse
  sonsuza dek; bir belgenin notları başka belgede işaretsiz duruyordu. Artık belge, sürümü ya
  da koşunun sonucu değişince temizleniyor.
- **Öneri iste, yanıtı al.** Ask'in yanındaki **Suggest** tek kelime yazmadan yazara ne
  önerdiğini sorar; her yanıtın altındaki **Use as my answer** onu tek basışta sorunun notu
  yapar — istek satırında ise Accept ya da Deny için not kutusunu doldurur.
- **Tasarım önizlemesi tasarımcının yazdığını okur.** `--color-primary` kadar `color.primary`
  adları; tek satırda `light #X, dark #Y`; düz yazıda `space.md = 16`, px olarak çizilir. Eskiden
  "karar verilmiş token yok" diyen gerçek bir DESIGN.md artık paletini iki modda çiziyor.
- **Brief kabul etmez, taslak hazırlar.** Brief'e gelen bir istek, nedeni tooltip'te saklı
  kapalı bir Accept yerine satırında **Draft the change** gösterir.

## [3.1.0] — 2026-09-14

İlk açık sürüm.

3.1.0'dan önce bu adla yayımlanan farklı bir araçtı. Kişisel olarak kullandım ve hiç piyasaya sürmedim. Bu benzer bir yerden başlayan ama yeni bir üründür.

Biçim [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)'a dayanır; Kortext [Semantic Versioning](https://semver.org/spec/v2.0.0.html) izler.