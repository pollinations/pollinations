import styled from '@emotion/styled'


// About Pollinations Section


const About = props => {

    return <AboutStyle>
      <p>
        Pollinations is a lively, <i> collaborative ecosystem for <br/> AI-generated media. </i> 
        We empower the creation of multiple <span> solutions </span> for the Web3 and the entertainment industry.
      </p>
    </AboutStyle>
  }

  export default About
  
  const AboutStyle = styled.div`
  
  width: 100%;
  max-width: 1280px;
  min-height: 50vh;
  display: flex;
  justify-content: center;
  align-items: center;

  padding: 4.5em 0px;
  // background-color: black;
  
  font-family: 'DM Sans';
  font-style: normal;
  font-weight: 500;
  font-size: 42px;
  line-height: 59px;
  /* or 140% */
  
  color: #FFFFFF;
  
  p {
    max-width: 85%;
  }
  
  i {
    color: rgb(233, 250, 41);
    font-weight: 400;
  }
  
  span {
    border: 1px solid #D8E449;
    border-radius: 30px;
    box-sizing: border-box;
    padding: 0 0.3em;
    margin: 0 0.2em;
    display: inline-block;  
  }
  `