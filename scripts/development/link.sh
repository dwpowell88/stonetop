#!/usr/bin/env bash
# Creates a symlink from the Foundry systems directory to this repo.
#
# Override the Foundry data path if yours differs from the default:
#   FOUNDRY_DATA_PATH=/path/to/FoundryVTT/Data ./scripts/development/link.sh

set -euo pipefail

FOUNDRY_DATA_PATH="${FOUNDRY_DATA_PATH:-$HOME/.local/share/FoundryVTT/Data}"
SYSTEMS_DIR="$FOUNDRY_DATA_PATH/systems"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SYSTEM_ID="stonetop"
LINK_PATH="$SYSTEMS_DIR/$SYSTEM_ID"

if [ ! -d "$SYSTEMS_DIR" ]; then
  echo "Error: Foundry systems directory not found at $SYSTEMS_DIR"
  echo "Set FOUNDRY_DATA_PATH to your Foundry data directory and try again."
  exit 1
fi

if [ -e "$LINK_PATH" ] || [ -L "$LINK_PATH" ]; then
  echo "Error: $LINK_PATH already exists. Run unlink.sh first to remove it."
  exit 1
fi

ln -s "$REPO_ROOT" "$LINK_PATH"
echo "Linked: $LINK_PATH -> $REPO_ROOT"

# Also link the copyrighted illustration store so packs that reference `stonetop-art/...`
# (resolved relative to the Foundry data root) resolve in a linked dev world. See stonetop-art/README.md.
ART_LINK="$FOUNDRY_DATA_PATH/stonetop-art"
if [ -e "$ART_LINK" ] || [ -L "$ART_LINK" ]; then
  echo "Note: $ART_LINK already exists — leaving it as-is."
else
  ln -s "$REPO_ROOT/stonetop-art" "$ART_LINK"
  echo "Linked: $ART_LINK -> $REPO_ROOT/stonetop-art"
fi
