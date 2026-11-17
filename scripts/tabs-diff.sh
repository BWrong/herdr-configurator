#!/bin/sh
# How far mods/workshop/tabbar.js has drifted from the tab bar Herdr ships.
# Run after a Herdr update; a large diff means the port needs a fresh pass.
set -eu
upstream="${HOME}/.config/herdr-app/mods/tabs/main.js"
[ -f "$upstream" ] || { echo "no $upstream — is the tabs mod installed?"; exit 1; }
here=$(dirname "$0")/../mods/workshop/tabbar.js
diff -u "$upstream" "$here" | wc -l
