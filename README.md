# Miner LTC MinotaurX – Electron

App desktop Windows che esegue in continuo lo script di mining MinotaurX (LTC su zpool) con Firebase multi-device e controllo Telegram.

## Requisiti

- **Node.js** 18+ (https://nodejs.org)
- Windows 10/11

## Installazione e avvio

Apri PowerShell o Prompt dei comandi nella cartella del progetto:

```bash
cd minotaurx-electron
npm install
npm start
```

All’avvio:
1. Compare il gate “Come si chiama questo device?” → inserisci un nome (es. `PC Casa`).
2. Il miner si avvia automaticamente.
3. **Ctrl+M** apre/chiude il pannello completo (hashrate, saldo, log, impostazioni).

## Funzionalità

- Mining MinotaurX continuo (earnify.cc)
- Pool default: `minotaurx.na.mine.zpool.ca:7019` → payout LTC
- Wallet già impostato nello script (modificabile dal pannello)
- Firebase: saldo live multi-device + comandi remoti (start/stop/withdraw) via Telegram
- PowerSaveBlocker: riduce il rischio di sospensione del PC mentre l’app è aperta
- Finestra minimizzabile; il mining continua in background

## Modificare wallet / pool

Apri il pannello con **Ctrl+M** e cambia:
- Server
- Porta
- Worker (indirizzo LTC)
- Password (`c=LTC`)

Oppure modifica i valori di default in `index.html` (cerca `DEFAULT` e gli `input` con id `server`, `worker`, ecc.).

## Build eseguibile (.exe)

```bash
npm install
npm run build
```

Troverai i file in `dist/` (portable + installer NSIS).

## Note

- Il mining usa la CPU. Lascia il PC acceso e collegato alla corrente.
- Antivirus possono segnalare l’app (comportamento normale per i miner).
- Chiudi l’app dall’icona X o dal menu tray se abilitato.
