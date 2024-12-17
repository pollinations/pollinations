import type { ActionAlert } from '~/types/actions';
import { classNames } from '~/utils/classNames';

interface Props {
  alert: ActionAlert;
  clearAlert: () => void;
  postMessage: (message: string) => void;
}

export default function ChatAlert({ alert, clearAlert, postMessage }: Props) {
  const { type, title, description, content } = alert;

  const iconColor =
    type === 'error' ? 'text-bolt-elements-button-danger-text' : 'text-bolt-elements-button-primary-text';

  return (
    <div className={`rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4`}>
      <div className="flex items-start">
        {/* Icon */}
        <div className="flex-shrink-0">
          {type === 'error' ? (
            <div className={`i-ph:x text-xl ${iconColor}`}></div>
          ) : (
            <svg className={`h-5 w-5 ${iconColor}`} viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>

        {/* Content */}
        <div className="ml-3 flex-1">
          <h3 className={`text-sm font-medium text-bolt-elements-textPrimary`}>{title}</h3>
          <div className={`mt-2 text-sm text-bolt-elements-textSecondary`}>
            <p>{description}</p>
            {/* {content && (
              <pre className="mt-2 whitespace-pre-wrap font-mono text-xs bg-white bg-opacity-50 p-2 rounded">
                {content}
              </pre>
            )} */}
          </div>

          {/* Actions */}
          <div className="mt-4">
            <div className={classNames(' flex gap-2')}>
              {type === 'error' && (
                <button
                  onClick={() => postMessage(`*Fix this error on terminal* \n\`\`\`\n${content}\n\`\`\`\n`)}
                  className={classNames(
                    `px-2 py-1.5 rounded-md text-sm font-medium`,
                    'bg-bolt-elements-button-primary-background',
                    'hover:bg-bolt-elements-button-primary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-danger-background',
                    'text-bolt-elements-button-primary-text',
                  )}
                >
                  Fix Issue
                </button>
              )}
              <button
                onClick={clearAlert}
                className={classNames(
                  `px-2 py-1.5 rounded-md text-sm font-medium`,
                  'bg-bolt-elements-button-secondary-background',
                  'hover:bg-bolt-elements-button-secondary-backgroundHover',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-secondary-background',
                  'text-bolt-elements-button-secondary-text',
                )}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
