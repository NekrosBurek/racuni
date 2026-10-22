# Računi

Skeniraš QR kodove fiskalnih računa jedan za drugim, a aplikacija svaki sačuva kao PDF u izabrani folder na Google Drive-u. Ako je isti račun već sačuvan, ne čuva ga ponovo i označi ga kao duplikat.

**Preuzimanje:** https://github.com/NekrosBurek/racuni/releases/latest/download/racuni.apk

## Kako radi
- **Onboarding:** poveži Google nalog, izaberi folder (ili napravi novi) i format imena fajla, podrazumevano `{datum}_{radnja}_{stavke}`.
- **Ime fajla:** `{radnja}` je naziv radnje spojeno (`AutoKraljevo`, `TelekomSrbija`, za lance mesto prodaje: `Momax`). `{stavke}` se pravi pravilima iz artikala na računu, bez AI-a:
  - 1–2 artikla: nazivi artikala, npr. `Viljuska_Desna_i_Termostat`;
  - uređaj poznatog brenda koji čini bar pola računa: brend + uređaj, npr. `Bosch_Inverter_Klime`;
  - više artikala: kategorije sortirane po iznosu, npr. `Rasveta_Jastuci_i_Posteljina`; preko 3 kategorije, dve najveće i `Ostalo` (`Meso_Mlecni_i_Ostalo` za veliku kupovinu u marketu).
  Šifre, modeli, količine i jedinice se izbacuju. Spisak kategorija i brendova je u `naming.js` i lako se dopunjuje. Ostala polja: `{prodavac}` (puni naziv), `{iznos}`, `{vreme}`, `{broj}`.
- **Skeniranje:** kamera radi stalno. Svaki novi QR se odmah stavi u red i čuva u pozadini, a ti nastavljaš sa sledećim računom.
- **Račun bez QR koda:** u skeneru tapni **📄 Račun bez QR**. Otvara se kamera u aplikaciji: dodirom izoštriš, a 🔦 pali blic. Slikaj dno računa sa PFR podacima ili ceo račun, do 4 slike, pa tapni **Gotovo**. Aplikacija na telefonu pročita PFR broj, brojač računa, PFR vreme i iznos (Google ML Kit, bez interneta) i pokaže ih da ih proveriš i ispraviš. **Preuzmi sa Poreske uprave** otvara proveru računa bez QR koda (suf.purs.gov.rs/verify) u aplikaciji, sam popuni polja i dobija overen račun, koji se čuva isto kao posle QR skeniranja. Ako se polja ne popune sama, dopuni ih na toj stranici i tapni Провери. **Sačuvaj samo sliku** čuva fotografije kao PDF za račun koji Poreska ne može da potvrdi. **Prikaži pročitan tekst** pokazuje šta je OCR pročitao, za doterivanje pravila.
- **Duplikati:** broj računa iz QR koda upisuje se u skriveno polje fajla na Drive-u. Naziv i lokacija fajla zato nisu bitni.
- **Računi:** lista PDF-ova iz foldera, grupisana po mesecima sa mesečnim zbirom, sa pretragom po radnji, datumu i iznosu. Dodir otvara račun **u aplikaciji**, odakle može i u Drive. **Dugi pritisak** briše račun (fajl ide u kantu na Drive-u, pa može da se vrati).
- **Stariji računi bez iznosa:** fajlovi koje nije sačuvala ova aplikacija, ili koje je sačuvala pre nego što je pamtila podatke, nemaju iznos ni PFR broj. **Dopuni podatke** u listi pročita tekst iz njihovog PDF-a preko Drive-a i upiše iznos, datum, PFR broj i radnju, pa i oni ulaze u zbir i u proveru duplikata.
- **Pregled:** ovaj i prošli mesec, prosečan račun, poslednjih 6 meseci i radnje u kojima najviše trošiš. **Izvezi tabelu (CSV)** pravi tabelu za Excel/Sheets u Drive folderu.
- **Uvod i podešavanja:** pri prvom pokretanju kratak uvod. Podešavanja su poseban tab: izađeš bez čuvanja promena, a Android dugme Nazad uvek vodi na skener.
- **Preimenovanje bez skeniranja:** u Podešavanjima, **Preimenuj postojeće račune** daje svim računima u folderu ime po formatu iz polja iznad. Novi računi čuvaju podatke za ime (radnja, mesto prodaje, artikli) u opisu fajla na Drive-u. Stariji se jednom pročitaju iz PDF-a. Pre promene se prikaže koliko fajlova se menja, sa primerima.
- **Ažuriranje:** pri pokretanju i pri povratku u aplikaciju (najviše jednom na sat) proveri GitHub Releases. Ako ima novija verzija, na „Preuzmi" je sama skine i otvori Android instalaciju. Prvi put Android traži dozvolu da Računi instalira aplikacije.

Folder i format imena upisani su u skrivena polja samog foldera na Drive-u. Na telefonu se čuva samo Google prijava (refresh token, šifrovan u Android Keystore-u), pa se ne loguješ pri svakom paljenju. **Odjavi se** u podešavanjima (⚙) briše je i opoziva pristup.

## Podešavanje Google prijave (jednom)
1. Otvori https://console.cloud.google.com, napravi projekat i uključi **Google Drive API**.
2. Na **OAuth consent screen** izaberi External i dodaj svoj Gmail pod *Test users*.
3. Pod **Credentials → Create OAuth client ID → Android** upiši:
   - package: `rs.racuni.app`
   - SHA-1: `F8:FE:97:84:5D:C8:27:FF:38:FD:45:62:73:C5:51:A0:EE:5A:BC:AF`
4. U tom Android klijentu otvori **Advanced settings** i uključi **Enable custom URI scheme** (bez toga Google ne vraća prijavu u aplikaciju).
5. Upiši dobijeni client ID u `ANDROID_CLIENT_ID` na vrhu `App.js` i pushuj. Novi APK se napravi automatski.

## Build
Svaki push na `main` pokreće GitHub Actions. Build pusti testove, napravi APK potpisan ključem iz repo secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`) i objavi release `v1.0.<broj builda>`.

Test parsera: `node receipt.test.mjs`

## Deljenje sa ukućanima
1. Na Google Drive-u podeli folder sa računima (Share → mejl ukućana → Editor).
2. U Google Cloud konzoli dodaj njihov Gmail pod **Audience → Test users**. Bez toga Google ne pušta prijavu dok je aplikacija u Testing režimu.
3. Oni instaliraju APK, prijave se svojim nalogom i u podešavanjima izaberu folder označen sa 👥.

Svi tada čuvaju u isti folder i vide iste račune, garancije, rate i budžet. Isti račun se ne može sačuvati dvaput, ma ko ga skenirao.
