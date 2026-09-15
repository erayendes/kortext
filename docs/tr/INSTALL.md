# Kurulum

**Node 22 veya üstü** ve PATH'inizde en az bir ajan CLI'ı (`claude`, `codex`, `antigravity` ya da bir başkası) olsun yeter.

Sonrası terminale yazacağınız hepi topu tek bir komut; 

```sh
npm install -g kortext
```
Kurulum bittikten sonra `kortext` yazın. Sunucu ayağa kalkar, tarayıcınız açılır ve Kortext paneli karşınıza gelir. Hepsi bu.

> [!NOTE]
> Kortext'e anahtar vermezsiniz; zaten kullandığınız CLI'ın aboneliğini kullanır. Cursor, Copilot, OpenCode, Amp, Droid, Goose, Qwen Code ve Cline için de tanımlar hazır.
> Sunucu 3441 portunu kullanır; isterseniz `--port` ile değiştirebilirsiniz.
> Verileriniz tek bir global SQLite veritabanında durur: `~/.kortext/kortext.db`. Onu da `--db` ile değiştirebilirsiniz.
> `kortext` açılıp da veritabanını açamazsa, betiğe bir kerelik izin vererek yeniden kurun:

```sh
npm install -g --allow-scripts=better-sqlite3 kortext
```

> [!WARNING] Windows desteği deneyseldir.
> Kortext macOS ve Linux'ta geliştiriliyor ve orada test ediliyor. Windows'a özgü kısımlar yazıldı ama gerçek bir Windows’ta koşturulmadı.
> Bir şey çalışmazsa lütfen [bir issue açın](https://github.com/erayendes/kortext/issues); sorun muhtelemen sizin kurulumunuzda değildir.

# Güncelleme

Yeni bir sürüm çıktığında panel başlığın altında mavi bir şeritle haber verir — açılışta ve sonraki her saat bakar. 
**Update now** düğmesi kurulumu sizin yerinize yapar, yeni sürüm, Kortext'i yeniden açtığınızda devreye girer. 
Düğme, koşan bir adım varsa dbitmesini bekler. 

Güncellemyi elle yapmak isterseniz, ya da düğme hata verirse:

```sh
npm update -g kortext
npm uninstall -g kortext
```

# Kaldırma

Kaldırmak yalnızca Kotext'i siler. Proje kaydınız ve loglar `~/.kortext/`'te, belgeleriniz de repo'nuzda olduğu gibi kalır. 
Tertemiz bir başlangıç istiyorsanız ikisini de kendiniz silin.

```sh
npm uninstall -g kortext
```