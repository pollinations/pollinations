import React from 'react';
import { SmallContainer } from "../styles/global";
import { PollinationsMarkdown } from "@pollinations/react";
import useRandomSeed from '../hooks/useRandomSeed';

const Terms = () => {
    const seed = useRandomSeed()
    return (
        <SmallContainer>
            <PollinationsMarkdown seed={seed} >
                {`flesh out terms conditions Pollinations.AI in attractive friendly markdown using emojis and styles
      Terms Welcome to Pollinations. ai services empower harness AI technology creation interaction digital media. consent terms review attentively Acceptance Terms accessing Pollinations ai confirm understanding agreement Terms Privacy Policy disagree advised not to use services offers AI - powered tools digital media retain ownership responsibility content encourage review licenses open - source models Content utilized commercial purposes legality ethical standards Pollinations store user - content personal data stored user privacy information User Conduct Pollinations ethically legally agree not Engage illegal activities violate local laws Infringe third - party rights intellectual property Disseminate malicious software data access probe services Prohibition of Unauthorized Materials services generate Celebrity Deepfakes Creating materials celebrities politicians public figures prohibited Child Sexual Abuse Material CSAM forbidden produce CSAM content under 18 years applies to fictional real - life subjects Intellectual Property content using Pollinationscrucial respect licenses open - source models content used for commercial purposes advise checking licenses for restrictions Pollinations GmbH claims no intellectual property rights content Modification amend terms services after accept revised terms Governing Law subject to laws Germany conflict of laws principles Privacy Policy paramount outlines practices collection use protection sharing information Information collect details collect Discord IDs Usage Information anonymously track services experience without Cookies Tracking Technologies collect information deliver maintain refine services communication notices safeguard security integrity legal requirements. Sharing not for sale. share data with third parties service providers defend rights safety. safeguards protect against unauthorized access changes destruction Changes Privacy Policy update policy occasionally. changes communicated updating Privacy Policy Contact questions Privacy Policy hello@pollinations.ai`}
            </PollinationsMarkdown>
        </SmallContainer>
    );
}

export default Terms;