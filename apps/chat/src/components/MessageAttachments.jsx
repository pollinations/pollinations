import React from 'react';
import PropTypes from 'prop-types';

const MessageAttachments = ({ attachments, getAttachmentUrl }) => {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="message-attachments">
      {attachments.map((attachment, index) => {
        const isImageAttachment = attachment.isImage ?? (attachment.mimeType ? attachment.mimeType.startsWith('image/') : false);
        const attachmentUrl = getAttachmentUrl(attachment);

        if (isImageAttachment && attachmentUrl) {
          return (
            <div className="message-image-container" key={`attachment-${index}`}>
              <img
                src={attachmentUrl}
                alt={attachment.name || 'Uploaded image'}
                className="message-image"
                loading="lazy"
              />
              {attachment.name && (
                <div className="image-name">
                  {attachment.name}
                </div>
              )}
            </div>
          );
        }

        return (
          <div className="message-file-attachment" key={`attachment-${index}`}>
            <div className="message-file-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
                <path d="M10 9H8" />
              </svg>
            </div>
            <div className="message-file-details">
              <div className="message-file-name">{attachment.name || 'Attachment'}</div>
              {attachment.mimeType && (
                <div className="message-file-meta">{attachment.mimeType}</div>
              )}
            </div>
            {attachmentUrl && (
              <a
                className="message-file-download"
                href={attachmentUrl}
                download={attachment.name || 'attachment'}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Download ${attachment.name || 'attachment'}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14" />
                  <path d="M5 12l7 7 7-7" />
                  <path d="M5 19h14" />
                </svg>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
};

MessageAttachments.propTypes = {
  attachments: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string,
    mimeType: PropTypes.string,
    isImage: PropTypes.bool,
    data: PropTypes.string,
    preview: PropTypes.string,
    src: PropTypes.string
  })),
  getAttachmentUrl: PropTypes.func.isRequired
};

export default MessageAttachments;