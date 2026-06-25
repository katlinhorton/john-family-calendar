#!/usr/bin/env bash
set -e

# ---------------------------------------------------------------------------
# setup.sh — populate HA config files from your personal config
#
# Usage:
#   ./setup.sh                  # uses my-config.yaml if present
#   ./setup.sh my-config.enc.yaml   # decrypt a SOPS-encrypted file first
#
# Output goes to _deploy/ — copy those files to your HA /config/ directory.
# ---------------------------------------------------------------------------

ENCRYPTED=""
CLEANUP=false

if [ -n "$1" ]; then
    ENCRYPTED="$1"
elif [ ! -f my-config.yaml ] && [ -f my-config.enc.yaml ]; then
    ENCRYPTED="my-config.enc.yaml"
fi

if [ -n "$ENCRYPTED" ]; then
    if ! command -v sops &>/dev/null; then
        echo "Error: sops is not installed. Install it or decrypt the file manually."
        exit 1
    fi
    echo "Decrypting $ENCRYPTED..."
    sops -d "$ENCRYPTED" > my-config.yaml
    CLEANUP=true
fi

if [ ! -f my-config.yaml ]; then
    echo "Error: my-config.yaml not found."
    echo "Copy my-config.example.yaml to my-config.yaml and fill in your values."
    exit 1
fi

if ! python3 -c "import yaml" &>/dev/null; then
    echo "Installing pyyaml..."
    pip3 install --quiet pyyaml 2>/dev/null || pip3 install --quiet --break-system-packages pyyaml
fi

python3 setup.py

if [ "$CLEANUP" = "true" ]; then
    rm -f my-config.yaml
fi
