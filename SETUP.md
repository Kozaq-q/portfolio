# Portfolio — jak to postawić i obsługiwać

Strona to zwykłe pliki (HTML/CSS/JS), hostowane za darmo na GitHub Pages.
Treści (projekty, ujęcia, teksty) edytujesz w panelu **Studio** pod adresem `/admin/`.
Panel zapisuje zmiany bezpośrednio w repozytorium na GitHubie, a strona odświeża się po ok. minucie.

---

## 1. Domena (imię i nazwisko)

1. Sprawdź dostępność, np. `imienazwisko.com` (najlepsza dla branży międzynarodowej) albo `.pl`.
2. Gdzie kupić:
   - **Cloudflare Registrar** (polecam): domena po cenie hurtowej, bez podwyżek przy odnowieniu. W pakiecie darmowy DNS i darmowe przekierowanie maili (patrz punkt 2).
   - Alternatywy w Polsce: OVH, home.pl, nazwa.pl. Uważaj na tanią promocję w pierwszym roku i drogie odnowienia.
3. Domenę kupujesz sam(a). Ja nie dokonuję płatności.

## 2. Mail z domeną (np. `hello@imienazwisko.com`)

| Opcja | Koszt | Jak działa |
|---|---|---|
| **A. Cloudflare Email Routing + Gmail** (polecam na start) | 0 zł | Maile na `hello@…` trafiają do Twojego Gmaila. W Gmailu ustawiasz „Wyślij jako hello@…”, więc odpowiadasz z adresu z domeną. |
| B. Zoho Mail (plan Free) | 0 zł | Osobna skrzynka z własną domeną (aplikacja i przeglądarka). |
| C. Google Workspace | ok. 30 zł/mies. | Pełny Gmail z własną domeną. Najwygodniejsza opcja. |

**Opcja A krok po kroku:**
1. Cloudflare → Twoja domena → **Email → Email Routing** → włącz. Cloudflare sam doda rekordy MX.
2. Dodaj adres `hello` → przekierowanie na Twój Gmail i potwierdź link w mailu.
3. Gmail → Ustawienia → Konta → **Wyślij pocztę jako** → dodaj `hello@imienazwisko.com`:
   - serwer SMTP: `smtp.gmail.com`, port 587 (TLS),
   - login: Twój Gmail, hasło: **hasło aplikacji** (Konto Google → Bezpieczeństwo → Hasła do aplikacji, wymaga weryfikacji dwuetapowej).
4. W DNS Cloudflare popraw rekord SPF (TXT na `@`): `v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all`

## 3. GitHub Pages

1. Repozytorium `portfolio` na koncie GitHub, **publiczne** (darmowe Pages wymagają publicznego repo).
2. Wrzucasz do niego zawartość tego folderu.
3. W repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`**.
4. Po minucie strona działa pod `https://<login>.github.io/portfolio/`.

## 4. Podpięcie domeny pod stronę

1. GitHub: **Settings → Pages → Custom domain** → wpisz `imienazwisko.com` → Save. GitHub doda plik `CNAME`.
2. DNS u rejestratora (w Cloudflare z wyłączonym proxy, „DNS only”, szara chmurka):
   - `A` `@` → `185.199.108.153`
   - `A` `@` → `185.199.109.153`
   - `A` `@` → `185.199.110.153`
   - `A` `@` → `185.199.111.153`
   - `CNAME` `www` → `<login>.github.io`
3. Gdy GitHub potwierdzi domenę (do kilku godzin), zaznacz **Enforce HTTPS**.
4. W Studio → Settings wpisz **Site address**: `https://imienazwisko.com`. Dzięki temu linki wysłane na Messengerze czy w mailu pokażą kadr z projektu.

## 5. Studio, czyli panel do edycji

Adres: `https://imienazwisko.com/admin/`

Pierwsze logowanie (raz na każdym urządzeniu):
1. GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new token**.
2. Repository access: **Only select repositories** → `portfolio`.
3. Permissions → **Contents: Read and write**.
4. Ustaw długą ważność, wygeneruj i wklej token w Studio.

Token zostaje tylko w tej przeglądarce. Na cudzym komputerze po pracy kliknij **Settings → Sign out**.

W Studio możesz:
- dodawać, usuwać i układać projekty (ich kolejność = kolejność listy na stronie),
- wpisać tytuł, rodzaj („Short film”, drobny druk), rok, ekipę, opis, festiwale i link do filmu lub trailera,
- wrzucać zdjęcia i klipy (przeciągnij pliki). Pierwszy materiał otwiera podstronę projektu,
- zaznaczać **Homepage** przy ujęciach, które mają lecieć na stronie głównej, i układać je w zakładce Homepage,
- ustawić showreel, bio, maila, Instagram i jasny lub ciemny wygląd.

Nic nie trafia na stronę, dopóki nie klikniesz **Publish**.

## 6. Jak przygotować klipy do kafelków

- MP4 (H.264), 1280–1920 px szerokości, **5–10 s**, **bez dźwięku**.
- Bitrate ok. 4–8 Mb/s, czyli plik do ok. **15 MB**. Lżejsze pliki = szybsza strona.
- Najlepiej wyglądają klipy z płynną pętlą (bez szarpnięcia na sklejce).
- Dowolne proporcje kadru (2.39, 1.85, 16:9, pion). Siatka sama się dopasuje.
- Zdjęcia: dowolny JPG, PNG lub HEIC z eksportu. Studio samo je zmniejszy.

## 7. Przykładowe treści

Projekty „Low Tide”, „Paper Houses” itd. oraz pliki w `media/samples/` to atrapy.
Usuń je w Studio, gdy dodasz swoje projekty.

## 8. Limity GitHub Pages

Strona do 1 GB, transfer ok. 100 GB miesięcznie. Kilkadziesiąt lekkich pętli mieści się bez problemu.
Pełne filmy i showreel trzymaj na Vimeo lub YouTube (wklejasz tylko link).
Jeden plik może mieć najwyżej 100 MB. Jeśli to za mało, podłącz magazyn na filmy (punkt 9).

## 9. Większy limit na filmy: Cloudflare R2

Po podłączeniu R2 nowe klipy z Studio trafiają do R2 zamiast na GitHuba. Limit to 2 GB na plik, 10 GB za darmo łącznie (potem ok. 0,015 USD za GB miesięcznie), a transfer do widzów jest bezpłatny. Zdjęcia zostają na GitHubie.

1. Załóż konto na https://dash.cloudflare.com/sign-up. To samo konto przyda się później do domeny.
2. W menu po lewej wybierz **R2 Object Storage** i włącz R2 (plan darmowy). Cloudflare poprosi o kartę, ale w darmowym limicie nic nie pobiera.
3. Kliknij **Create bucket**. Nazwa: `portfolio-media`, Location: Automatic. Potem kliknij **Create bucket**.
4. W buckecie wejdź w **Settings**, znajdź **Public Development URL** (r2.dev) i kliknij **Enable**. Skopiuj adres `https://pub-….r2.dev`.
5. W tym samym miejscu znajdź **CORS Policy**, kliknij **Add / Edit** i wklej:
   ```json
   [
     {
       "AllowedOrigins": ["https://kozaq-q.github.io", "http://localhost:8484"],
       "AllowedMethods": ["GET", "HEAD", "PUT", "DELETE"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Gdy strona dostanie własną domenę, dopisz ją do `AllowedOrigins`, np. `"https://imienazwisko.com"`.
6. Wróć do **R2 Object Storage**, wejdź w **Manage API tokens** i kliknij **Create Account API token** (albo **Create API token**).
   - Nazwa: `Studio`.
   - Permissions: **Object Read & Write**.
   - Specify bucket(s): tylko `portfolio-media`.
   - TTL: Forever.

   Kliknij **Create**. Skopiuj **Access Key ID** i **Secret Access Key**: secret pokazuje się tylko raz. Na tej samej stronie, albo w prawej kolumnie strony R2, jest **Account ID**.
7. Otwórz Studio, wejdź w **Settings**, potem w **Video storage — Cloudflare R2**. Wpisz Account ID, nazwę bucketu (`portfolio-media`), publiczny adres z kroku 4 oraz oba klucze. Kliknij **Save and test**, a potem **Publish**, żeby strona znała adres filmów.

Klucze zapisują się tylko w tej przeglądarce, tak jak token GitHuba. Na innym komputerze wpisz je ponownie. Jeśli klucz wycieknie, usuń token w Cloudflare i utwórz nowy.

Później, po kupnie domeny w Cloudflare, zamiast adresu r2.dev możesz w ustawieniach bucketu podpiąć **Custom Domain** (np. `media.imienazwisko.com`). Adres r2.dev ma ograniczenia przy dużym ruchu. Wtedy podmień „Public bucket URL” w Studio i opublikuj. Wcześniej wgrane klipy dalej będą działać.
