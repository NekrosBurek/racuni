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
- **Račun bez QR koda:** u skeneru izaberi **Račun bez QR** i polako pomeraj kameru niz račun. Aplikacija uživo čita tekst (Google ML Kit, na telefonu, bez interneta) i skuplja PFR broj, datum, iznos, radnju i artikle iz više kadrova. Kad nađe PFR broj i datum, **Sačuvaj** postaje aktivno. Na Drive ide PDF od fotografija računa, imenovan po istim pravilima. Duplikati se prepoznaju po PFR broju, isto kao kod QR-a. ML Kit ne čita ćirilicu, pa se oznake prepoznaju po obliku podataka, a radnja ili artikli ispisani ćirilicom slabije se čitaju. QR kod se i u ovom režimu čita normalno.
- **Duplikati:** broj računa iz QR koda upisuje se u skriveno polje fajla na Drive-u. Naziv i lokacija fajla zato nisu bitni.
- **Računi:** lista PDF-ova iz foldera sa ukupnim iznosom. Dodir otvara račun.
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
