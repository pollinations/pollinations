import styled from "@emotion/styled";
import { SocialLinks } from "../components/SocialLinks";
import logo from "/logo.svg";

const FooterContainer = styled.footer`
  background-color: black;
  color: white;
  padding: 60px 32px;
  @media (min-width: 768px) {
    padding: 40px 64px;
  }
`;

const MainContent = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 48px;
`;

const LeftSection = styled.div`
  display: flex;
  flex-direction: column;
  /* Removed gap from here to control spacing individually */
`;

const LogoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 32px; /* Gap below the header */
`;

const LogoImg = styled.img`
  width: 40px;
  height: 40px;
`;

const LogoText = styled.span`
  font-size: 2.5rem; /* Bigger text for Pollinations.ai */
  font-weight: bold;
`;

const EmailLink = styled.a`
  color: rgba(124, 124, 124, 0.8); /* Specific color for email */
  text-decoration: none;
  margin-bottom: 16px; /* Space below email */
  &:hover {
    color: white;
  }
`;

const CopyrightText = styled.div`
  color: white; /* All other text below mail is white */
  font-size: 0.875rem;
  max-width: 450px;
  margin-top: 16px; /* Space above copyright text */
  p {
    margin: 0;
    line-height: 1.5;
  }
`;

const RightSection = styled.div`
  display: flex;
  gap: 48px;
  flex-wrap: wrap;
`;

const LinksColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ColumnTitle = styled.h4`
  font-weight: bold;
  font-size: 1.125rem; /* Keep current size, ensure bold */
  margin: 0 0 16px 0;
  color: white; /* Ensure title is white */
`;

const FooterLink = styled.a`
  color: #a0a0a0;
  text-decoration: none;
  font-size: 1rem; /* Explicitly set font size */
  &:hover {
    color: white;
  }
`;

const BottomSection = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  /* Removed base font-size from here as children will define their own */
`;

const TermsLink = styled.a`
  color: white; /* White color for Terms & Conditions */
  text-decoration: none;
  font-size: 1.125rem; /* Bigger text */
  font-weight: bold; /* Bolder text */
  &:hover {
    color: #a0a0a0;
  }
`;

const BerlinText = styled.p`
  color: #a0a0a0; /* Lighter grey for Berlin text */
  margin: 0;
  font-size: 1rem; /* Increased text size */
`;

const Footer = () => {
  const exploreLinks = [
    { text: "Gallery", href: "#feeds" },
    { text: "API Docs", href: "https://github.com/pollinations/pollinations/blob/main/APIDOCS.md" },
    { text: "Our Models", href: "#feeds" },
  ];

  const companyLinks = [
    { text: "Generate", href: "#feeds" },
    { text: "News", href: "#news" },
    { text: "Contributions", href: "https://github.com/pollinations/pollinations/graphs/contributors" },
    { text: "Contact", href: "mailto:hello@pollinations.ai" },
  ];

  return (
    <FooterContainer>
      <MainContent>
        <LeftSection>
          <LogoContainer>
            <LogoImg src={logo} alt="Pollinations.ai Logo" />
            <LogoText>Pollinations.ai</LogoText>
          </LogoContainer>
          <EmailLink href="mailto:hello@pollinations.ai">hello@pollinations.ai</EmailLink>
          <SocialLinks gap="1em" location="footer" invert />
          <CopyrightText>
            <p>© 2025 pollinations.ai | All rights reserved.</p>
            <p style={{ marginTop: '8px' }}>
              Pollinations.AI is an open‑source generative‑AI platform on a mission to make creative tools accessible to everyone.
            </p>
          </CopyrightText>
        </LeftSection>

        <RightSection>
          <LinksColumn>
            <ColumnTitle>Explore</ColumnTitle>
            {exploreLinks.map((link, i) => (
              <FooterLink key={i} href={link.href} target={link.href.startsWith("http") ? "_blank" : "_self"} rel="noopener noreferrer">
                {link.text}
              </FooterLink>
            ))}
          </LinksColumn>
          <LinksColumn>
            <ColumnTitle>Company</ColumnTitle>
            {companyLinks.map((link, i) => (
              <FooterLink key={i} href={link.href} target={link.href.startsWith("http") ? "_blank" : "_self"} rel="noopener noreferrer">
                {link.text}
              </FooterLink>
            ))}
          </LinksColumn>
        </RightSection>
      </MainContent>

      <BottomSection>
        <TermsLink href="https://enter.pollinations.ai/terms" target="_blank" rel="noopener noreferrer">
          Terms & Conditions
        </TermsLink>
        <BerlinText>Open source AI innovation from Berlin</BerlinText>
      </BottomSection>
    </FooterContainer>
  );
};

export default Footer;