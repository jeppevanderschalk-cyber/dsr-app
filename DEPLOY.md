# DSR score publiceren op dsr-app.nl

Gebruik de inhoud van deze map (`DSR`) als websitebestanden.

## GitHub Pages

1. Maak op GitHub een nieuwe repository, bijvoorbeeld `DSR-score`.
2. Upload de bestanden uit deze map naar de root van die repository:
   - `index.html`
   - `CNAME`
   - eventueel later extra bestanden
3. Ga in GitHub naar `Settings` -> `Pages`.
4. Kies bij `Build and deployment`:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
5. Vul bij `Custom domain` in:
   - `dsr-app.nl`
6. Sla op en zet daarna `Enforce HTTPS` aan zodra GitHub dat toestaat.

## DNS bij je domeinprovider

Maak voor `dsr-app.nl` deze A-records aan:

```txt
@  A  185.199.108.153
@  A  185.199.109.153
@  A  185.199.110.153
@  A  185.199.111.153
```

Maak voor `www.dsr-app.nl` deze CNAME aan:

```txt
www  CNAME  jouw-github-gebruikersnaam.github.io
```

Vervang `jouw-github-gebruikersnaam` door je echte GitHub-gebruikersnaam.

DNS kan enkele minuten tot 24 uur nodig hebben.
