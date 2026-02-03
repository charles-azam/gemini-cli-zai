#!/usr/bin/env bash
set -euo pipefail

REPO="charles-azam/gemini-cli-zai"
VERSION="${1:-latest}"
INSTALL_DIR="${INSTALL_DIR:-${HOME}/.gemini-cli-zai}"

# Detect shell config file
if [[ -n "${ZSH_VERSION:-}" ]] || [[ "${SHELL}" == */zsh ]]; then
  CONFIG_FILE="${HOME}/.zshrc"
elif [[ -n "${BASH_VERSION:-}" ]] || [[ "${SHELL}" == */bash ]]; then
  CONFIG_FILE="${HOME}/.bashrc"
else
  CONFIG_FILE="${HOME}/.profile"
fi

echo "Installing gemini-cli-zai..."

# Build download URL
ARCHIVE_URL="https://github.com/${REPO}/releases/${VERSION}/download/gemini-cli-zai-bundle.tar.gz"
if [[ "${VERSION}" == "latest" ]]; then
  ARCHIVE_URL="https://github.com/${REPO}/releases/latest/download/gemini-cli-zai-bundle.tar.gz"
fi

# Download and extract
TMP_ARCHIVE="$(mktemp)"
echo "Downloading from ${ARCHIVE_URL}..."
curl -fsSL -o "${TMP_ARCHIVE}" "${ARCHIVE_URL}"

# Clean previous installation and extract
rm -rf "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
tar -xzf "${TMP_ARCHIVE}" -C "${INSTALL_DIR}"
rm -f "${TMP_ARCHIVE}"

# Add alias to shell config if not present
ALIAS_COMMAND="alias gemini-cli-zai='node ${INSTALL_DIR}/bundle/gemini.js'"
if ! grep -q "alias gemini-cli-zai=" "${CONFIG_FILE}" 2>/dev/null; then
  echo "" >> "${CONFIG_FILE}"
  echo "# gemini-cli-zai" >> "${CONFIG_FILE}"
  echo "${ALIAS_COMMAND}" >> "${CONFIG_FILE}"
  echo "Added alias to ${CONFIG_FILE}"
else
  echo "Alias already exists in ${CONFIG_FILE}"
fi

echo ""
echo "Installation complete!"
echo "Run the following to start using gemini-cli-zai:"
echo ""
echo "  source ${CONFIG_FILE}"
echo "  gemini-cli-zai --version"
echo ""
echo "Or start a new terminal session."
