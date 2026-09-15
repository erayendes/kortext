<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../assets/kortext-logo-dark.svg">
    <img src="../assets/kortext-logo-light.svg" alt="Kortext" width="420">
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/kortext"><img alt="npm" src="https://img.shields.io/npm/v/kortext.svg"></a>
  <a href="https://github.com/erayendes/kortext/actions/workflows/kortext-ci.yml"><img alt="CI" src="https://github.com/erayendes/kortext/actions/workflows/kortext-ci.yml/badge.svg"></a>
  <img alt="Node" src="https://img.shields.io/node/v/kortext">
  <a href="../../LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
  <a href="https://milowda.com"><img alt="Yerli üretim" src="https://img.shields.io/badge/YERL%C4%B0%20%C3%9CRET%C4%B0M-red?style=flat&label=%F0%9F%A4%9D&color=red&link=https%3A%2F%2Fmilowda.com"></a>
</p>

🇬🇧 [For English press 9](../../README.md)

Yapay zekayla ürün geliştirirken hep aynı iki duvara çarpıyordum: projenin nerede durduğunu göremiyordum ve bir noktada model, üzerinde anlaştığımız kuralları bırakıp kafasına göre takılmaya başlıyordu.

Biliyorum, siz de bu durumu yaşıyorsunuz, sadece henüz adını koyamadınız.
Ama ben koydum. Adı **Kortext**.

# Kortext

Kortext, ürün geliştirmeye başlamadan önce yapay zekayla el sıkıştığınız bir **ürün anayasası**.

Verdiğiniz **`BRIEF.md`** üzerinden alanında **uzman 10 farklı persona**nın hazırladığı **14 mimari belge** modelin her zaman başvuracağı tek gerçek kaynak oluyor.
Yazdığınız brief yeterli değilse Kortext bunu söylüyor. `BRIEF.md` için açıklamalar ve bir örnek panelde var.

Tek bir insan rolü var, **`Prime`**. 
Diğer personalar; `product manager`, `architect`, `designer`, `growth expert`, `security engineer`, `DevOps engineer`, `DBA`, `compliance expert`, `copywriter` ve `QA engineer`.

Brief referansıyla Kortext’in ürettiği belgeler; `PRODUCT.md`, `STACK.md`, `STRUCTURE.md`, `ARCHITECTURE.md`, `DESIGN.md`, `GROWTH.md`, `SECURITY.md`, `ENVIRONMENT.md`, `DATABASE.md`, `API.md`, `LEGAL.md`, `CONTENT.md`, `ENGINEERING.md`, `TEST.md`. Bir de en sonunda isteğe bağlı `EXPERIENCE.md` var.

Yazılan her bir belge incelemeniz için önünüze düşüyor. Üşenmeyin, okuyun. **Emin olun buna değecek.**
 
Belgelerde **size yöneltilmiş sorular** olabilir, daha önceden yazılmış bir belgeye **değişiklik talebi** olabilir ya da yazılacak bir belgeye not olabilir. Bunlar modelin kendi bildirimleri. 
Bunlarla birlikte istediğiniz satırı seçerek, soru sorabilir ve değişiklik talep edebilirsiniz.
Eğer model bir belgede değişiklik isterse ve siz onaylarsanız, o belge tekrar pipeline’a girer.
Belgelerin birbiriyle bu ilişkisi sebebiyle bazen bir döngü gibi bir belge bir kaç defa önünüze geliyor. Bunu yaparken epeyce token tüketiyor. Ama sonradan boşa gidecek zamanın ve tokenların önüne geçiyor. **Dip toplamda çok daha karlı**.

Tüm yazım işi bittiğinde proje klasörünüz içinde bir `.kortext` dizini ve içinde ürün anayasanız olacak.
Bundan sonrasında hangi yapay zeka aracını hangi arayüzden kullanıyorsanız geliştirmeye orada devam edeceksiniz. 
Kortext bu noktada görevini tamamlamış olacak. Herhangi bir giriş, anahtar ya da API ihtiyacı yok. Kortext hiçbir bilgi almıyor, telemetry tutmuyor. Ama ne kadar kullanılacağını çok merak ediyorum. Eğer tutarsa da bu anonim olur merak etmeyin.

Bu arada, daha önce başlamış projeleri de unutmadım. Kortext, mevcut kod tabanını analiz ederek oradan da başlayabiliyor. Projenin durumuna göre yeni öneriler sunabilir. 

Belge yazımını takip etmek için küçük bir MacOS menü bar uygulaması da hazırladım. Detayları MACOS.md’de.

# Son söz

Kortext'i tek başıma, akşamları yapıyorum ve MIT lisansıyla dağıtıyorum. 
Eğer projeniz için doğru bir yol gösterici olduysa, işte tam olarak bunun için uğraştım. 
Harika ürünleriniz olsun.

MIT © Eray Endes

[INSTALL](INSTALL.md) · [GUIDE](GUIDE.md) · [MACOS](MACOS.md) · [SUPPORT](../../.github/SUPPORT.md) · [SECURITY](../../.github/SECURITY.md) · [CHANGELOG](CHANGELOG.md)