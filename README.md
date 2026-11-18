# Rental Rates website (Windows)

| | Address | Who |
|---|---|---|
| **Visitor side** | `https://your-site/` | Anyone. Prices, specials, fuel charge, estimate tool, quote request form, contact info. |
| **Partner pages** | `https://your-site/body-shop`, `/repair-shop`, `/hotels`, `/travel-agents` | Each has its own headline, welcome message and special prices, plus a QR code and printable sign. Edit them on the staff side under **Partner pages**. |
| **Staff side** | `https://your-site/staff` | Login only. Email quotes, quote requests, prices, business info, links and staff accounts. |

Everything is saved in the `data` folder (`site.json`, `requests.json`, `users.json`). Back that folder up.

---

## 1. Install the software (one time)

Open **PowerShell** and run:
```
winget install OpenJS.NodeJS.LTS
```
```
winget install Git.Git
```
Close and reopen PowerShell afterwards.

## 2. Get the site from GitHub

```
cd C:\
```
```
git clone https://github.com/ksuttonpvt-cell/Rentals.git
```
This makes `C:\Rentals`. Then make your first staff login (it's an admin):
```
cd C:\Rentals
```
```
node server.js add-user owner
```

**Moving from the old unzipped copy?** Stop the old one first (`Stop-ScheduledTask -TaskName "Rental Rates website"`),
then copy its whole `data` folder into `C:\Rentals\data`. Your prices, partner pages, requests and logins come with it,
so you can skip `add-user`.

## 3. Start it, and start it with Windows

Double-click **start-rentals.bat** to try it. The first time, it makes a `.env` settings file from `.env.example`
(port 3002, control window on 3003, your public address). Open http://localhost:3002 and http://localhost:3002/staff.

To start it automatically with Windows (replaces the old task), close that window and run in an **administrator** PowerShell:
```
cd C:\Rentals
```
```
powershell -ExecutionPolicy Bypass -File .\run-at-startup.ps1
```
Or put a shortcut to **start-rentals-hidden.vbs** in Task Scheduler / the Startup folder, the same way as the shuttle.

## Rentals Control (on/off switch, this PC only)

Double-click **Rentals Control.bat**. It shows whether the site is running and reachable at your public address,
the live log, and **Start / Stop / Restart** and **Turn off completely**, plus buttons for the log and backup folders.
It keeps working while the website is stopped. It runs on `127.0.0.1:3003`, separate from Shuttle Control (3001).

## Staff side → Server tab (admins)

- **Website switches:** turn the visitor side off (visitors see your message and phone number) or turn quote requests off.
- **Server status:** running time, version, visits and response time, errors, memory, and a traffic chart for the last hour.
- **Restart the site**, **Check for updates now**, and the list of recent updates.
- **Backups:** made every night at 12:30 AM and kept 14 days in `data\backups`. **Back up now**, download, or **Restore**
  (the current data is saved first).
- **Server log** with filters and search. Daily log files are kept 14 days in `data\logs`.

Only **admins** see the Server tab and the staff list. Under **Accounts**, admins can add staff and tick **Admin** for others.
Everyone can change their own password there.

## Updates install themselves

While it runs (from start-rentals.bat or run-at-startup.ps1), the site checks GitHub every 5 minutes.
When new changes are on the `main` branch, it downloads them and restarts in a couple of seconds.
Set `AUTO_UPDATE=0` in `.env` to turn this off.

## 4. Put it on the internet with Cloudflare Tunnel

No router ports need to be opened; the tunnel connects out from this PC.

Install cloudflared:
```
winget install Cloudflare.cloudflared
```

**Quick test link** (changes every time):
```
cloudflared tunnel --url http://localhost:3002
```

**Your own web address** (domain added to Cloudflare), easiest way:
1. In the Cloudflare dashboard go to **Zero Trust → Networks → Tunnels → Create a tunnel**, choose **Cloudflared**, name it `rental-site`.
2. Pick **Windows**. Copy the command it shows (`cloudflared.exe service install <long token>`) and run it in an **administrator** PowerShell. The tunnel now runs as a Windows service.
3. Under **Public Hostname**, add e.g. `rates.yourdomain.com` → Service **HTTP** → `localhost:3002`.

The visitor side is then `https://rates.yourdomain.com` and the staff side `https://rates.yourdomain.com/staff`.

## Settings

Set these in the `.env` file, then restart from Rentals Control.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3002` | Port to listen on |
| `HOST` | `127.0.0.1` | Only this PC can connect directly; Cloudflare Tunnel connects here. Use `0.0.0.0` to allow other PCs on your network |
| `CONTROL_PORT` | `3003` | Rentals Control window (this PC only) |
| `PUBLIC_URL` | — | Your public address, used by Rentals Control to check the site is reachable |
| `AUTO_UPDATE` | `1` | Set to `0` to stop automatic updates from GitHub |
| `DATA_DIR` | `.\data` | Where prices, requests and logins are saved |
| `TRUST_PROXY` | `1` | Needed behind Cloudflare so login limits and secure cookies work |
| `SESSION_HOURS` | `12` | How long a staff login lasts |

## How prices are worked out

- Daily price × days, for rentals under a week.
- 7 days = the weekly price. If no weekly price is entered, it's the daily price × 7 minus the weekly discount (30% by default).
- Longer rentals: each full week at the weekly price, extra days at the daily price, never more than one more week.
- Prices marked **Daily price only** never get the weekly discount.
- Fuel: a per-gallon charge ($10.00 by default) if the vehicle comes back without a full tank.

## Linux / Docker

The same files also run on Linux (`node server.js`) or with `docker compose up -d --build`.
