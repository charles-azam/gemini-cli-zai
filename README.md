# Gemini CLI ZAI -- Google Gemini CLI fork for GLM-5

A fork of [Google's Gemini CLI](https://github.com/google-gemini/gemini-cli) adapted to run **ZAI's GLM-5** model (GLM-4.7 also supported). Built for benchmarking agentic scaffoldings on [Terminal-Bench 2.0](https://github.com/laude-institute/harbor).

**Benchmark results:** Scored **0.23** on Terminal-Bench using a GLM4.7 subscription (which might give worse results than paying for the full price of an API). See the article [full writeup](https://charlesazam.com/blog/) for how this compares to Codex (0.15), Claude Code (0.29), and Mistral Vibe (0.35) using the same model.

## Why this fork exists

I wanted to test whether the same model performs differently across coding agent scaffoldings. Gemini CLI has the widest array of built-in tools among the agents I tested — 14 tools, 3 specialized sub-agent types (plus user-definable ones), A2A protocol support, a four-tier hierarchical memory system, and a sophisticated model routing framework that dynamically classifies prompts to choose between flash and pro models. The codebase is a TypeScript/React monorepo that bundles in seconds, and the developer experience is genuinely pleasant — clean separation between the core engine, tools, and the Ink-based terminal UI makes it straightforward to fork and adapt. Despite all this sophistication, it scored below simpler agents. Whether that's because scaffolding complexity doesn't translate into benchmark performance, because these CLI agents are increasingly fine-tuned to their native model in ways that don't transfer well, or simply because of rough edges in my adaptation — I'm not sure. Probably a bit of all three.

## What I changed

Gemini CLI uses Google's native API protocol, which is fundamentally different from the OpenAI-compatible format that Z.AI uses. This meant writing a full translation layer:

- **812-line `GlmContentGenerator`** -- translates between Gemini CLI's internal representation and Z.AI's OpenAI-compatible chat completions endpoint
- **Protocol translation** -- tool declarations, SSE stream parsing, finish reasons, usage metrics, and error types all had to be mapped between the two API formats
- **Preserved Thinking** -- captures `reasoning_content` from GLM-5 and feeds it back across turns
- **New `USE_GLM` auth type** -- auto-detects when `ZAI_API_KEY` is set
- **Web search routing** -- `google_web_search` tool calls are routed through Z.AI when GLM auth is active (Z.AI's web search is free with the coding endpoint)
- **106 new tests** for edge cases around non-thinking scenarios

**49 files changed** across two commits. The difficulty wasn't TypeScript -- it was the protocol gap between Google's API and OpenAI's. Tool calls, content parts, and streaming events are represented in fundamentally different ways.

## Quick install

```bash
curl -fsSL https://raw.githubusercontent.com/charles-azam/gemini-cli-zai/main/scripts/install-release.sh | bash
```

Then open a new terminal or:

```bash
source ~/.zshrc  # or ~/.bashrc
gemini-cli-zai --version
```

### Install a specific version

```bash
curl -fsSL https://raw.githubusercontent.com/charles-azam/gemini-cli-zai/main/scripts/install-release.sh | bash -s -- v1.0.0
```

### Install from source

```bash
git clone https://github.com/charles-azam/gemini-cli-zai.git
cd gemini-cli-zai
npm ci && npm run build && npm run bundle
echo 'alias gemini-cli-zai="node /path/to/gemini-cli-zai/bundle/gemini.js"' >> ~/.zshrc
```

## Usage

```bash
export ZAI_API_KEY="your_key"

# Default: GLM-5 with thinking enabled
gemini-cli-zai

# Use GLM-4.7 instead
gemini-cli-zai --model glm-4.7

# With explicit endpoint
gemini-cli-zai --model glm-5 \
  --zai-endpoint https://api.z.ai/api/coding/paas/v4/chat/completions

# Disable thinking
gemini-cli-zai --zai-disable-thinking

# Disable web search
gemini-cli-zai --no-search
```

### Settings file

```json
{
  "model": {
    "zai": {
      "endpoint": "https://api.z.ai/api/coding/paas/v4/chat/completions",
      "clearThinking": false,
      "disableThinking": false
    }
  }
}
```

## Architecture notes

Gemini CLI's architecture is notable for:
- **Dual-history system** -- maintains a comprehensive history (every message for debugging) and a curated one (valid turns only, sent to the model)
- **2,400-line edit system** with a 3-tier correction cascade (direct match, unescape heuristic, LLM-based fixer) that works around Gemini's over-escaping bug
- **3 specialized sub-agent types** (plus user-definable ones) and an Agent-to-Agent (A2A) protocol for cross-agent communication
- **Four-tier memory** -- global, extension, project, and JIT subdirectory-level context
- **10-section dynamic system prompt** that adapts to tools, permissions, and project state

This uses a separate config directory (`.gemini-cli-zai`) and binary name (`gemini-cli-zai`) to avoid conflicts with upstream Gemini CLI.

## Related

- [codex-zai](https://github.com/charles-azam/codex-zai) -- Codex fork (scored 0.15)
- [mistral-vibe-zai](https://github.com/charles-azam/mistral-vibe-zai) -- Mistral Vibe fork (scored 0.35)
- [Upstream Gemini CLI](https://github.com/google-gemini/gemini-cli) -- original project
