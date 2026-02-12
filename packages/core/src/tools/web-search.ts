/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { WEB_SEARCH_TOOL_NAME } from './tool-names.js';
import type { GroundingMetadata } from '@google/genai';
import type { ToolInvocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolErrorType } from './tool-error.js';

import { getErrorMessage } from '../utils/errors.js';
import { type Config } from '../config/config.js';
import { getResponseText } from '../utils/partUtils.js';
import { debugLogger } from '../utils/debugLogger.js';
import { AuthType } from '../core/authTypes.js';

interface GroundingChunkWeb {
  uri?: string;
  title?: string;
}

interface GroundingChunkItem {
  web?: GroundingChunkWeb;
  // Other properties might exist if needed in the future
}

interface GroundingSupportSegment {
  startIndex: number;
  endIndex: number;
  text?: string; // text is optional as per the example
}

interface GroundingSupportItem {
  segment?: GroundingSupportSegment;
  groundingChunkIndices?: number[];
  confidenceScores?: number[]; // Optional as per example
}

interface ZaiWebSearchToolDefinition {
  type: 'web_search';
  web_search: {
    enable: 'True';
    search_engine: 'search-prime';
    count: string;
    search_result: 'True';
    search_prompt?: string;
    content_size?: 'low' | 'medium' | 'high';
    search_domain_filter?: string;
    search_recency_filter?: 'day' | 'week' | 'month' | 'year' | 'noLimit';
  };
}

interface ZaiWebSearchMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string }> | null;
}

interface ZaiWebSearchRequest {
  model: string;
  messages: ZaiWebSearchMessage[];
  tools: ZaiWebSearchToolDefinition[];
  thinking?: {
    type: 'enabled' | 'disabled';
    clear_thinking?: boolean;
  };
}

interface ZaiWebSearchResult {
  title?: string;
  link?: string;
  content?: string;
  media?: string;
  refer?: string;
}

interface ZaiWebSearchResponseChoice {
  message?: {
    content?: string | Array<{ type: string; text?: string }> | null;
  };
}

interface ZaiWebSearchResponse {
  choices?: ZaiWebSearchResponseChoice[];
  web_search?: ZaiWebSearchResult[];
}

const DEFAULT_ZAI_CHAT_ENDPOINT =
  'https://api.z.ai/api/coding/paas/v4/chat/completions';
const DEFAULT_GLM_MODEL = 'glm-5';

function normalizeZaiContent(
  content: string | Array<{ type: string; text?: string }> | null | undefined,
): string {
  if (!content) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  return content
    .map((part) => part.text ?? '')
    .filter((text) => text.length > 0)
    .join('');
}

function formatZaiSources(results: ZaiWebSearchResult[] | undefined): {
  sources: GroundingChunkItem[] | undefined;
  sourcesText: string;
} {
  if (!results || results.length === 0) {
    return { sources: undefined, sourcesText: '' };
  }
  const sources = results.map((result) => ({
    web: {
      uri: result.link,
      title: result.title,
    },
  }));
  const sourcesText = results
    .map((result, index) => {
      const title = result.title || 'Untitled';
      const uri = result.link || 'No URI';
      return `[${index + 1}] ${title} (${uri})`;
    })
    .join('\n');
  return { sources, sourcesText };
}

function formatZaiFallback(results: ZaiWebSearchResult[]): string {
  return results
    .map((result, index) => {
      const title = result.title || 'Untitled';
      const uri = result.link || 'No URI';
      const snippet = result.content ? `\n${result.content}` : '';
      return `[${index + 1}] ${title}\n${uri}${snippet}`;
    })
    .join('\n\n');
}

function mapZaiModel(model: string | undefined): string {
  if (!model) {
    return DEFAULT_GLM_MODEL;
  }
  if (model.startsWith('glm-')) {
    return model;
  }
  return DEFAULT_GLM_MODEL;
}

/**
 * Parameters for the WebSearchTool.
 */
export interface WebSearchToolParams {
  /**
   * The search query.
   */

  query: string;
}

/**
 * Extends ToolResult to include sources for web search.
 */
export interface WebSearchToolResult extends ToolResult {
  sources?: GroundingMetadata extends { groundingChunks: GroundingChunkItem[] }
    ? GroundingMetadata['groundingChunks']
    : GroundingChunkItem[];
}

class WebSearchToolInvocation extends BaseToolInvocation<
  WebSearchToolParams,
  WebSearchToolResult
> {
  constructor(
    private readonly config: Config,
    params: WebSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  override getDescription(): string {
    return `Searching the web for: "${this.params.query}"`;
  }

  async execute(signal: AbortSignal): Promise<WebSearchToolResult> {
    if (this.isGlmAuth()) {
      return this.executeZaiSearch(signal);
    }
    const geminiClient = this.config.getGeminiClient();

    try {
      const response = await geminiClient.generateContent(
        { model: 'web-search' },
        [{ role: 'user', parts: [{ text: this.params.query }] }],
        signal,
      );

      const responseText = getResponseText(response);
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const sources = groundingMetadata?.groundingChunks as
        | GroundingChunkItem[]
        | undefined;
      const groundingSupports = groundingMetadata?.groundingSupports as
        | GroundingSupportItem[]
        | undefined;

      if (!responseText || !responseText.trim()) {
        return {
          llmContent: `No search results or information found for query: "${this.params.query}"`,
          returnDisplay: 'No information found.',
        };
      }

      let modifiedResponseText = responseText;
      const sourceListFormatted: string[] = [];

      if (sources && sources.length > 0) {
        sources.forEach((source: GroundingChunkItem, index: number) => {
          const title = source.web?.title || 'Untitled';
          const uri = source.web?.uri || 'No URI';
          sourceListFormatted.push(`[${index + 1}] ${title} (${uri})`);
        });

        if (groundingSupports && groundingSupports.length > 0) {
          const insertions: Array<{ index: number; marker: string }> = [];
          groundingSupports.forEach((support: GroundingSupportItem) => {
            if (support.segment && support.groundingChunkIndices) {
              const citationMarker = support.groundingChunkIndices
                .map((chunkIndex: number) => `[${chunkIndex + 1}]`)
                .join('');
              insertions.push({
                index: support.segment.endIndex,
                marker: citationMarker,
              });
            }
          });

          // Sort insertions by index in descending order to avoid shifting subsequent indices
          insertions.sort((a, b) => b.index - a.index);

          // Use TextEncoder/TextDecoder since segment indices are UTF-8 byte positions
          const encoder = new TextEncoder();
          const responseBytes = encoder.encode(modifiedResponseText);
          const parts: Uint8Array[] = [];
          let lastIndex = responseBytes.length;
          for (const ins of insertions) {
            const pos = Math.min(ins.index, lastIndex);
            parts.unshift(responseBytes.subarray(pos, lastIndex));
            parts.unshift(encoder.encode(ins.marker));
            lastIndex = pos;
          }
          parts.unshift(responseBytes.subarray(0, lastIndex));

          // Concatenate all parts into a single buffer
          const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
          const finalBytes = new Uint8Array(totalLength);
          let offset = 0;
          for (const part of parts) {
            finalBytes.set(part, offset);
            offset += part.length;
          }
          modifiedResponseText = new TextDecoder().decode(finalBytes);
        }

        if (sourceListFormatted.length > 0) {
          modifiedResponseText +=
            '\n\nSources:\n' + sourceListFormatted.join('\n');
        }
      }

      return {
        llmContent: `Web search results for "${this.params.query}":\n\n${modifiedResponseText}`,
        returnDisplay: `Search results for "${this.params.query}" returned.`,
        sources,
      };
    } catch (error: unknown) {
      const errorMessage = `Error during web search for query "${
        this.params.query
      }": ${getErrorMessage(error)}`;
      debugLogger.warn(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error performing web search.`,
        error: {
          message: errorMessage,
          type: ToolErrorType.WEB_SEARCH_FAILED,
        },
      };
    }
  }

  private isGlmAuth(): boolean {
    return (
      this.config.getContentGeneratorConfig()?.authType === AuthType.USE_GLM
    );
  }

  private getZaiEndpoint(): string {
    return (
      this.config.getGlmEndpoint?.() ||
      process.env['GLM_API_BASE_URL'] ||
      process.env['ZAI_API_BASE_URL'] ||
      DEFAULT_ZAI_CHAT_ENDPOINT
    );
  }

  private buildZaiPayload(): ZaiWebSearchRequest {
    const thinkingEnabled = !(this.config.getGlmDisableThinking?.() ?? false);
    const thinking = thinkingEnabled
      ? {
          type: 'enabled' as const,
          clear_thinking: this.config.getGlmClearThinking?.() ?? false,
        }
      : { type: 'disabled' as const };

    return {
      model: mapZaiModel(this.config.getActiveModel()),
      messages: [{ role: 'user', content: this.params.query }],
      tools: [
        {
          type: 'web_search',
          web_search: {
            enable: 'True',
            search_engine: 'search-prime',
            count: '5',
            search_result: 'True',
            search_prompt: 'Summarize key points from {{search_result}}.',
            content_size: 'high',
            search_recency_filter: 'noLimit',
          },
        },
      ],
      thinking,
    };
  }

  private async executeZaiSearch(
    signal: AbortSignal,
  ): Promise<WebSearchToolResult> {
    try {
      const contentConfig = this.config.getContentGeneratorConfig();
      if (!contentConfig?.apiKey) {
        throw new Error('ZAI API key is not configured.');
      }

      const payload = this.buildZaiPayload();
      const endpoint = this.getZaiEndpoint();
      debugLogger.debug(`[ZAI] POST ${endpoint} web_search`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${contentConfig.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
          `ZAI web search request failed (${response.status}): ${text || response.statusText}`,
        );
      }

      const data = (await response.json()) as ZaiWebSearchResponse;
      const responseText = normalizeZaiContent(
        data.choices?.[0]?.message?.content,
      );
      const results = data.web_search ?? [];
      const { sources, sourcesText } = formatZaiSources(results);

      let finalText = responseText.trim();
      if (!finalText) {
        if (results.length === 0) {
          return {
            llmContent: `No search results or information found for query: "${this.params.query}"`,
            returnDisplay: 'No information found.',
          };
        }
        finalText = formatZaiFallback(results);
      }

      if (sourcesText) {
        finalText += `\n\nSources:\n${sourcesText}`;
      }

      return {
        llmContent: `Web search results for "${this.params.query}":\n\n${finalText}`,
        returnDisplay: `Search results for "${this.params.query}" returned.`,
        sources,
      };
    } catch (error: unknown) {
      const errorMessage = `Error during web search for query "${
        this.params.query
      }": ${getErrorMessage(error)}`;
      debugLogger.warn(errorMessage, error);
      return {
        llmContent: `Error: ${errorMessage}`,
        returnDisplay: `Error performing web search.`,
        error: {
          message: errorMessage,
          type: ToolErrorType.WEB_SEARCH_FAILED,
        },
      };
    }
  }
}

/**
 * A tool to perform web searches using the configured provider.
 */
export class WebSearchTool extends BaseDeclarativeTool<
  WebSearchToolParams,
  WebSearchToolResult
> {
  static readonly Name = WEB_SEARCH_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      WebSearchTool.Name,
      'GoogleSearch',
      'Performs a web search and returns the results. This tool is useful for finding information on the internet based on a query.',
      Kind.Search,
      {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find information on the web.',
          },
        },
        required: ['query'],
      },
      messageBus,
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  /**
   * Validates the parameters for the WebSearchTool.
   * @param params The parameters to validate
   * @returns An error message string if validation fails, null if valid
   */
  protected override validateToolParamValues(
    params: WebSearchToolParams,
  ): string | null {
    if (!params.query || params.query.trim() === '') {
      return "The 'query' parameter cannot be empty.";
    }
    return null;
  }

  protected createInvocation(
    params: WebSearchToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ): ToolInvocation<WebSearchToolParams, WebSearchToolResult> {
    return new WebSearchToolInvocation(
      this.config,
      params,
      messageBus ?? this.messageBus,
      _toolName,
      _toolDisplayName,
    );
  }
}
