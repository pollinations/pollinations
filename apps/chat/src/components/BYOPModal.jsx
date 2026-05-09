import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { BYOP_STORAGE_KEY } from '../utils/api';
import './styles/BYOPModal.css';

const BYOPModal = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    try {
      const stored = window.localStorage.getItem(BYOP_STORAGE_KEY) || '';
      setApiKey(stored);
      setHasExistingKey(Boolean(stored));
    } catch {
      setApiKey('');
      setHasExistingKey(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = apiKey.trim();
    try {
      if (trimmed) {
        window.localStorage.setItem(BYOP_STORAGE_KEY, trimmed);
      } else {
        window.localStorage.removeItem(BYOP_STORAGE_KEY);
      }
    } catch { /* ignore */ }
    if (window?.showToast) {
      window.showToast(trimmed ? 'API key saved' : 'API key cleared', 'success');
    }
    onClose();
  };

  const handleRemove = () => {
    try { window.localStorage.removeItem(BYOP_STORAGE_KEY); } catch { /* ignore */ }
    setApiKey('');
    setHasExistingKey(false);
    if (window?.showToast) window.showToast('API key cleared', 'success');
  };

  return (
    <div className="themes-modal byop-modal">
      <button
        type="button"
        aria-label="Close"
        className="themes-modal-overlay"
        onClick={onClose}
      />
      <div className="themes-modal-content">
        <div className="themes-modal-header">
          <h2>Bring Your Own Pollen Key</h2>
          <button className="close-modal-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="themes-modal-body">
          <p className="byop-desc">
            Paste a Pollinations API key (<code>sk_…</code>) to use your own Pollen
            balance for requests. The key is stored only in this browser.
          </p>

          <label className="byop-label" htmlFor="byop-key-input">API key</label>
          <input
            id="byop-key-input"
            type="password"
            className="byop-input"
            placeholder="sk_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />

          <div className="byop-actions">
            {hasExistingKey && (
              <button className="byop-btn byop-btn-ghost" onClick={handleRemove} type="button">
                Remove
              </button>
            )}
            <a
              className="byop-btn byop-btn-secondary"
              href="https://enter.pollinations.ai"
              target="_blank"
              rel="noreferrer noopener"
            >
              Get a key
            </a>
            <button className="byop-btn byop-btn-primary" onClick={handleSave} type="button">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

BYOPModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default BYOPModal;
