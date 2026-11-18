# Rental Rates website (Windows)

| | Address | Who |
|---|---|---|
| **Visitor side** | `https://your-site/` | Anyone. Prices, specials, fuel charge, estimate tool, quote request form, contact info. |
| **Partner pages** | `https://your-site/body-shop`, `/repair-shop`, `/hotels`, `/travel-agents` | Each has its own headline, welcome message and special prices, plus a QR code and printable sign. Edit them on the staff side under **Partner pages**. |
| **Staff side** | `https://your-site/staff` | Login only. Email quotes, quote requests, prices, business info, links and staff accounts. |

Everything is saved in the `data` folder (`site.json`, `requests.json`, `users.json`). Back that folder up.

---

## 1. Install Node.js (one time)

Open **PowerShell** and run:
```
winget install OpenJS.NodeJS.LTS
```
Or download the **LTS** installer from nodejs.org. Close and reopen PowerShell afterwards.

## 2. Try it

1. Unzip `rental-site` somewhere permanent, for example `C:\rental-site`.
2. Double-click **add-staff-login.bat**, type a username, then a password (10+ characters; it won't show as you type).
3. Double-click **start-site.bat**. Leave that window open.
4. Open **http://localhost:8080** (visitor side) and **http://localhost:8080/staff** (staff side).
5. Log in and fill in **Business info**: name, phone, address, hours.

More staff logins can be added on the staff side under **Staff accounts**.

## 3. Start it automatically with Windows

Close the start-site window first. Then open **PowerShell as administrator** in the folder and run:
```
powershell -ExecutionPolicy Bypass -File .\run-at-startup.ps1
```
The site now runs in the background, even after a restart. Its log goes to `data\server.log`.
To stop it starting automatically:
```
Unregister-ScheduledTask -TaskName "Rental Rates website" -Confirm:$false
```

## Updating to a new version

Your prices, requests and logins live in the `data` folder, so updates never touch them.

1. Stop the site. If it runs at startup, in an administrator PowerShell:
   `Stop-ScheduledTask -TaskName "Rental Rates website"`
   (or close the start-site window).
2. Unzip the new version **over** the old folder and choose **Replace** for all files. Don't delete `data`.
3. Start it again: `Start-ScheduledTask -TaskName "Rental Rates website"` (or double-click start-site.bat).

## 4. Put it on the internet with Cloudflare Tunnel

No router ports need to be opened; the tunnel connects out from this PC.

Install cloudflared:
```
winget install Cloudflare.cloudflared
```

**Quick test link** (changes every time):
```
cloudflared tunnel --url http://localhost:8080
```

**Your own web address** (domain added to Cloudflare), easiest way:
1. In the Cloudflare dashboard go to **Zero Trust → Networks → Tunnels → Create a tunnel**, choose **Cloudflared**, name it `rental-site`.
2. Pick **Windows**. Copy the command it shows (`cloudflared.exe service install <long token>`) and run it in an **administrator** PowerShell. The tunnel now runs as a Windows service.
3. Under **Public Hostname**, add e.g. `rates.yourdomain.com` → Service **HTTP** → `localhost:8080`.

The visitor side is then `https://rates.yourdomain.com` and the staff side `https://rates.yourdomain.com/staff`.

## Settings

Set these in `start-site.bat` / `run-at-startup.ps1` if you need to change them.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `HOST` | `127.0.0.1` | Only this PC can connect directly; Cloudflare Tunnel connects here. Use `0.0.0.0` to allow other PCs on your network |
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
