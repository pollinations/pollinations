import React, { memo } from 'react';
import { formatMessage } from '../utils/markdown';

const MemoizedMessageContent = memo(({ content }) => {
  const html = formatMessage(content);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
});

export default MemoizedMessageContent;
