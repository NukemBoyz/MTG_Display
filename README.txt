MTG DISPLAY
===========

A life-counter scoreboard for your TV. Players scan a QR code and get
their own life counter on their phone.

Works for Magic (20 life) and Yu-Gi-Oh (8000 life).

Nothing gets installed. No admin rights, no registry changes, no PATH
changes. Delete the folder and every trace is gone.


-------------------------------------------------------------------
RUN IT
-------------------------------------------------------------------

Double-click:

        MTG_Display.exe

A black window opens showing something like:

    Open the board on this PC:      http://192.168.1.50:8080/
    QR codes will point phones at:  192.168.1.50

The board opens in your browser by itself.

  - Leave the black window open. Closing it stops the server.
  - Ctrl+C in that window also stops it.
  - Phones must be on the SAME Wi-Fi as this PC.

The first time you run it, Windows asks whether to allow it through
the firewall. Say YES, or phones will not be able to reach the board.


-------------------------------------------------------------------
USING IT
-------------------------------------------------------------------

The board shows five matches at a time and scales to fill the screen,
1080p up to 4K. Press the Full Screen button (or F11) for the TV.

Click OPERATOR (top right) to open the control panel:

    Page 1 of 4        move to the next page of matches
    Hide This Page     clear the five matches on screen
    Show All Matches   bring every match back
    Cycle Off          rotate through pages automatically
    15s / 30s / 60s    how fast it rotates
    Magic (20)         Magic life totals
    Yu-Gi-Oh (8000)    Yu-Gi-Oh life totals
    Reset Life         reset the current page to starting life
    All Matches        tick to show a match, untick to hide it
    Reset Everything   wipe all names and life totals

As matches finish, untick them in the All Matches list. They disappear
and the remaining matches close ranks, so there are never empty slots.

Switching between Magic and Yu-Gi-Oh sets every match to that game's
starting life, and every Reset afterwards uses it too.


-------------------------------------------------------------------
WHERE MATCHES ARE SAVED
-------------------------------------------------------------------
    C:\Users\<you>\AppData\Local\MTG_Display\state.json

Delete that file to wipe everything back to starting life.
Copy it somewhere to back up a night's tournament.


-------------------------------------------------------------------
OPTIONS
-------------------------------------------------------------------
Run it from a command prompt to pass options:

    MTG_Display.exe --ip 192.168.1.50    force the QR code address
    MTG_Display.exe --port 8090          use a different port
    MTG_Display.exe --no-browser         do not auto-open the board

Several at once is fine.


-------------------------------------------------------------------
TROUBLE
-------------------------------------------------------------------

Phones cannot connect, board works on the PC
   1. Same Wi-Fi? Guest network or cellular data is the usual
      culprit. Check the phone is on Wi-Fi, not 4G/5G.
   2. Firewall. The first run pops up "Allow access?". If you
      clicked Cancel there is no second prompt and phones stay
      blocked. Fix: right-click ALLOW_FIREWALL.bat, choose
      "Run as administrator".
   3. Wrong address - see below.

The QR codes point at the wrong address
   Your PC has several network addresses. Anything from 100.64 to
   100.127 is a VPN (Tailscale uses that range), and Docker,
   Hyper-V and VirtualBox add their own. The program ranks them and
   prefers real LAN addresses, and prints everything it found with
   a note on each, so you can see what it picked and why.

   If it still picks wrong, force it. Open cmd, run  ipconfig  and
   look under your Wi-Fi adapter for "IPv4 Address". Then run:

        MTG_Display.exe --ip 192.168.1.50

QR codes show as blank squares
   The QR images are fetched from the internet (api.qrserver.com).
   No internet, no images. The typed link under each one still
   works.

"port 8080 is already in use"
   Something else has that port. Use  --port 8090  instead.

   Hyper-V and WSL sometimes reserve port ranges. Check with:
        netsh interface ipv4 show excludedportrange protocol=tcp

Windows SmartScreen warning
   The .exe is not code-signed. Click "More info" then "Run anyway".
   If you would rather not, the full source is on the project page
   and you can run it with Python instead.


-------------------------------------------------------------------
UNOFFICIAL FAN PROJECT
-------------------------------------------------------------------
Not affiliated with, endorsed by, or sponsored by Wizards of the
Coast or Konami. Magic: The Gathering and Yu-Gi-Oh! are trademarks
of their respective owners. The background artwork is original.
