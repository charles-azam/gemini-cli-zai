# Gemini-CLI ZAI Fork

Fork of gemini-cli adapted to use ZAI's GLM-4.7 API for benchmarking.

## Objectives

1. Implement ZAI with thinking capabilities (GLM-4.7)
2. Add mode to disable thinking
3. Connect web search to ZAI's API

---

## ZAI API Reference (Verified by Testing)

### Endpoints

| Endpoint                                               | Purpose                             | Notes                                  |
| ------------------------------------------------------ | ----------------------------------- | -------------------------------------- |
| `https://api.z.ai/api/coding/paas/v4/chat/completions` | **Coding Plan** (used in this fork) | Preserved Thinking enabled by default  |
| `https://api.z.ai/api/paas/v4/chat/completions`        | Standard API                        | Preserved Thinking disabled by default |

### Authentication

```
Authorization: Bearer $ZAI_API_KEY
```

### Thinking Configuration

```json
{
  "thinking": {
    "type": "enabled", // "enabled" | "disabled"
    "clear_thinking": false // false = Preserved Thinking (keep reasoning in context)
  }
}
```

**Key Points:**

- `type: "enabled"` (default for GLM-4.7): Model reasons before answering,
  returns `reasoning_content`
- `type: "disabled"`: Direct answers, no reasoning, faster/cheaper (~2 tokens vs
  ~70+ for same question)
- `clear_thinking: false`: Preserve reasoning across turns (better for
  multi-turn coding sessions)
- `clear_thinking: true`: Clear reasoning each turn (saves tokens but loses
  context)

### Response Structure

```json
{
  "choices": [{
    "message": {
      "content": "Final answer",
      "reasoning_content": "Thinking process...",  // Only if thinking enabled
      "role": "assistant",
      "tool_calls": [...]  // If tools requested
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 17,
    "completion_tokens": 72,
    "total_tokens": 89,
    "prompt_tokens_details": {"cached_tokens": 2},         // Preserved Thinking cache hits
    "completion_tokens_details": {"reasoning_tokens": 69}  // Tokens spent on thinking
  }
}
```

### Streaming (SSE)

Request with `"stream": true`. Response format:

```
data: {"choices":[{"delta":{"reasoning_content":"..."}}]}
data: {"choices":[{"delta":{"content":"..."}}]}
data: {"choices":[{"finish_reason":"stop"}],"usage":{...}}
data: [DONE]
```

### Tool Calling

Standard OpenAI-compatible format:

```json
{
  "tools": [{
    "type": "function",
    "function": {
      "name": "tool_name",
      "description": "...",
      "parameters": {"type": "object", "properties": {...}}
    }
  }],
  "tool_choice": "auto"  // "auto" | "none" | "required" | {"type":"function","function":{"name":"..."}}
}
```

**Interleaved Thinking**: When using tools with thinking enabled, preserve
`reasoning_content` in message history:

```json
{"role": "assistant", "content": "...", "reasoning_content": "...", "tool_calls": [...]}
```

### Web Search (Tool)

```json
{
  "tools": [
    {
      "type": "web_search",
      "web_search": {
        "enable": "True",
        "search_engine": "search-prime",
        "count": "5",
        "search_domain_filter": "example.com", // Optional: restrict to domain
        "search_recency_filter": "noLimit" // Optional: time filter
      }
    }
  ]
}
```

Search results are automatically injected into the model's context. Model
references them as `[Source: ref_1]`, etc.

---

## Implementation Notes

### Current Implementation (`packages/core/src/core/glmContentGenerator.ts`)

- Uses coding endpoint by default
- Thinking always enabled with `clear_thinking` configurable
- Supports streaming with proper SSE parsing
- Maps Gemini tool format to OpenAI-compatible format
- Handles `reasoning_content` → `thought: true` part conversion

### Key Considerations

1. **Token Efficiency**: Disable thinking for simple queries (facts, formatting)
2. **Preserved Thinking**: Keep `clear_thinking: false` for multi-turn coding
   sessions
3. **Tool Calls**: Always return `reasoning_content` with tool results to
   maintain reasoning continuity
4. **Cache Hits**: `cached_tokens` in response indicates Preserved Thinking is
   working

### Models

- `glm-4.7` - Latest with full thinking support
- `glm-4.6` - Previous generation
- `glm-4-air` - Faster/cheaper variant
