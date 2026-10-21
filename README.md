# Računi

Skeniraš QR kodove fiskalnih računa jedan za drugim, a aplikacija svaki sačuva kao PDF u izabrani folder na Google Drive-u. Ako je isti račun već sačuvan, ne čuva ga ponovo i označi ga kao duplikat.

**Preuzimanje:** https://github.com/NekrosBurek/racuni/releases/latest/download/racuni.apk

## Kako radi
- **Onboarding:** poveži Google nalog, izaberi folder (ili napravi novi) i format imena fajla, npr. `{datum} {prodavac} {iznos} RSD`.
- **Skeniranje:** kamera radi stalno. Svaki novi QR se odmah stavi u red i čuva u pozadini, a ti nastavljaš sa sledećim računom.
- **Duplikati:** broj računa iz QR koda upisuje se u skriveno polje fajla na Drive-u. Naziv i lokacija fajla zato nisu bitni.
- **Računi:** lista PDF-ova iz foldera sa ukupnim iznosom. Dodir otvara račun.
- **Ažuriranje:** pri pokretanju aplikacija proveri GitHub Releases i ponudi novu verziju.

Na telefonu se ništa ne čuva. Folder i format imena upisani su u skrivena polja samog foldera na Drive-u. Prijava traje dok je aplikacija otvorena.

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
