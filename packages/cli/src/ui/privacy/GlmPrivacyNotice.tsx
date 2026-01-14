/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Newline, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface GlmPrivacyNoticeProps {
  onExit: () => void;
}

export const GlmPrivacyNotice = ({ onExit }: GlmPrivacyNoticeProps) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onExit();
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={theme.text.accent}>
        GLM API Key Notice
      </Text>
      <Newline />
      <Text color={theme.text.primary}>
        By connecting a GLM API key from Z.AI
        <Text color={theme.text.link}>[1]</Text>, you agree to the applicable
        service terms
        <Text color={theme.status.error}>[2]</Text> and privacy policy
        <Text color={theme.status.success}>[3]</Text> provided by Z.AI.
      </Text>
      <Newline />
      <Text color={theme.text.primary}>
        <Text color={theme.text.link}>[1]</Text>{' '}
        https://docs.z.ai/guides/llm/glm-4.7
      </Text>
      <Text color={theme.text.primary}>
        <Text color={theme.status.error}>[2]</Text> https://z.ai/terms
      </Text>
      <Text color={theme.text.primary}>
        <Text color={theme.status.success}>[3]</Text> https://z.ai/privacy
      </Text>
      <Newline />
      <Text color={theme.text.secondary}>Press Esc to exit.</Text>
    </Box>
  );
};
