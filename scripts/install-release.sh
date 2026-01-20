#!/usr/bin/env bash
set -euo pipefail

REPO="charles-azam/gemini-cli-zai"
VERSION="${1:-latest}"
INSTALL_DIR="${INSTALL_DIR:-${HOME}/.gemini-cli-zai}"
CONFIG_FILE="${HOME}/.zshrc"
if [[ "${SHELL}" == *"/bash" ]]; then
  CONFIG_FILE="${HOME}/.bashrc"
fi

ARCHIVE_URL="https://github.com/${REPO}/releases/${VERSION}/download/gemini-cli-zai-bundle.tar.gz"
if [[ "${VERSION}" == "latest" ]]; then
  ARCHIVE_URL="https://github.com/${REPO}/releases/latest/download/gemini-cli-zai-bundle.tar.gz"
fi

TMP_ARCHIVE="$(mktemp -t gemini-cli-zai.XXXXXX.tar.gz)"
curl -fsSL -o "${TMP_ARCHIVE}" "${ARCHIVE_URL}"
mkdir -p "${INSTALL_DIR}"
tar -xzf "${TMP_ARCHIVE}" -C "${INSTALL_DIR}"
rm -f "${TMP_ARCHIVE}"

ALIAS_COMMAND="alias gemini-cli-zai='node ${INSTALL_DIR}/bundle/gemini.js'"
grep -q "alias gemini-cli-zai=" "${CONFIG_FILE}" || echo "${ALIAS_COMMAND}" >> "${CONFIG_FILE}"
echo "Installed to ${INSTALL_DIR}. Run: source ${CONFIG_FILE}"
