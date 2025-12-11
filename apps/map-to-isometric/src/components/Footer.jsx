import React from 'react';
import '../styles/Footer.css';

function Footer() {
  return (
    <footer className="footer">
      <p>
        Made for Hacktoberfest 2025  | Powered by{' '}
        <a 
          href="https://pollinations.ai" 
          target="_blank" 
          rel="noopener noreferrer"
        >
          Pollinations.AI
        </a>
      </p>
    </footer>
  );
}

export default Footer;
