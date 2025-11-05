import styled from "@emotion/styled";
import Markdown from "markdown-to-jsx";
import { useState } from "react";
import { Link } from "react-router-dom";
import termsMarkdown from "../../TERMS_OF_SERVICE.md?raw";
import privacyMarkdown from "../../PRIVACY_POLICY.md?raw";
import { Colors } from "../config/global";

const PageContainer = styled.div`
  background-color: ${Colors.offblack};
  min-height: 100vh;
  color: white;
  padding: 60px 32px 120px;
  
  @media (min-width: 768px) {
    padding: 80px 64px 140px;
  }
`;

const LogoContainer = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: 60px;
  
  a {
    display: inline-block;
    cursor: pointer;
    transition: opacity 0.3s ease;
    
    &:hover {
      opacity: 0.8;
    }
  }
  
  img {
    height: 60px;
    filter: invert(1);
    
    @media (min-width: 768px) {
      height: 80px;
    }
  }
`;

const ContentWrapper = styled.div`
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 60px;
`;

const DocumentSection = styled.div`
  background-color: rgba(255, 255, 255, 0.02);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 40px 32px;
  backdrop-filter: blur(10px);
  
  @media (min-width: 768px) {
    padding: 60px 50px;
  }
`;

const MarkdownContent = styled.div`
  line-height: 1.8;
  
  h1 {
    font-size: 2.5rem;
    font-weight: bold;
    text-align: center;
    margin-bottom: 1rem;
    color: ${Colors.lime};
    
    @media (max-width: 768px) {
      font-size: 2rem;
    }
  }
  
  h2 {
    font-size: 1.75rem;
    font-weight: bold;
    margin-top: 2.5rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid rgba(236, 248, 116, 0.3);
    color: ${Colors.offwhite};
    
    @media (max-width: 768px) {
      font-size: 1.5rem;
    }
  }
  
  h3 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    color: ${Colors.lime};
  }
  
  p {
    color: rgba(199, 212, 214, 0.9);
    margin-bottom: 1rem;
    
    &:first-of-type {
      font-style: italic;
      text-align: center;
      color: rgba(199, 212, 214, 0.75);
      margin-bottom: 2rem;
      font-size: 1.1rem;
    }
  }
  
  ul {
    margin: 1rem 0;
    padding-left: 2rem;
    list-style-type: disc;
    
    li {
      color: rgba(199, 212, 214, 0.85);
      margin-bottom: 0.5rem;
      line-height: 1.6;
    }
  }
  
  strong {
    color: ${Colors.offwhite};
    font-weight: 600;
  }
  
  em {
    font-style: italic;
    color: rgba(199, 212, 214, 0.8);
  }
  
  blockquote {
    border-left: 4px solid ${Colors.lime};
    background-color: rgba(236, 248, 116, 0.05);
    padding: 1rem 1.5rem;
    margin: 1.5rem 0;
    font-style: normal;
    
    p {
      margin: 0;
      color: rgba(199, 212, 214, 0.95);
    }
  }
  
  a {
    color: ${Colors.lime};
    text-decoration: underline;
    
    &:hover {
      color: ${Colors.offwhite};
    }
  }
  
  hr {
    border: none;
    border-top: 1px solid rgba(236, 248, 116, 0.2);
    margin: 2rem 0;
  }
`;

const ContactSection = styled.div`
  text-align: center;
  margin-top: 40px;
  
  p {
    color: ${Colors.offwhite};
    font-size: 1.1rem;
    
    a {
      color: ${Colors.lime};
      font-weight: 600;
      text-decoration: none;
      
      &:hover {
        text-decoration: underline;
      }
    }
  }
`;

const Terms = () => {
  const [copied, setCopied] = useState(false);

  const copyEmail = (e) => {
    e.preventDefault();
    navigator.clipboard.writeText('hello@pollinations.ai');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <PageContainer>
      <LogoContainer>
        <Link to="/">
          <img src="/logo-text.svg" alt="Pollinations.ai" />
        </Link>
      </LogoContainer>

      <ContentWrapper>
        <DocumentSection>
          <MarkdownContent>
            <Markdown>{termsMarkdown}</Markdown>
          </MarkdownContent>
        </DocumentSection>
        
        <DocumentSection>
          <MarkdownContent>
            <Markdown>{privacyMarkdown}</Markdown>
          </MarkdownContent>
        </DocumentSection>
      </ContentWrapper>

      <ContactSection>
        <p style={{ marginBottom: '1rem' }}>
          🌸 <strong>Join the Community</strong>
        </p>
        <p>
          <a href="https://github.com/pollinations" target="_blank" rel="noopener noreferrer">GitHub</a>
          {' • '}
          <a 
            href="mailto:hello@pollinations.ai" 
            onClick={copyEmail}
            style={{ cursor: 'pointer', position: 'relative' }}
            title="Click to copy email"
          >
            {copied ? '✓ Copied!' : 'Email'}
          </a>
          {' • '}
          <a href="https://discord.gg/k9F7SyTgqn" target="_blank" rel="noopener noreferrer">Discord</a>
        </p>
        <p style={{ marginTop: '1rem', opacity: 0.7, fontSize: '0.95rem' }}>
          Open source • Free forever • Built by the community
        </p>
      </ContactSection>
    </PageContainer>
  );
};

export default Terms;
