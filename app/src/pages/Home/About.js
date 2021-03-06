import styled from '@emotion/styled'


// About Pollinations Section


const About = props => {

    return <AboutStyle>
      <p>
        Pollinations is a lively, <i> collaborative ecosystem for AI art. </i> <br/>
        We curate the latest<span> AI models </span>and make them accessible through an easy interface. 
        Pollinations empowers the creation and translation of <i> multiple forms of human expression. </i>
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
  
  padding: 2em 0;
  background-color: black;
  
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
    color: #D8E449;
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