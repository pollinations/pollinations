import styled from '@emotion/styled';
import { Box, CardContent, Tooltip, Typography } from "@material-ui/core";
import Debug from "debug";
import { Link } from "react-router-dom";
import RouterLink from "../molecules/RouterLink";
import NotebookImage from "../organisms/markdownParsers/NotebookImage";
import NotebookInfo from "../organisms/markdownParsers/NotebookInfo";

const debug = Debug("components:NotebookCard");

const NotebookCard = ({ notebook }) => {

    debug("notebook", notebook)
    let { category, name, path, description, featured, url } = notebook
  
  
    if (notebook?.metadata?.colabLink)
      path = `/redirect/${notebook.metadata.colabLink}`
      
    // use a regular expression to remove leading number and whitespace from name
    name = name?.replace(/^\d+\s*/, '')
    
    if (!description) return null;
  
    // remove credits etc (they are separated by a horizontal rule)
    description = description.split("---")[0]
  
    // parse category
    const parsedCategory = category?.slice(2)
      .replace('-', ' → ')
      .replace('-', ' ')
      .replace('To', '')
      .toLowerCase();
  
    const ownGpuPath = `/create/${path}`;
    debug("path",path, featured)
    
    const linkUrl = featured ? ownGpuPath : path;

    return (
      <Box>
        <CardContainer>
            <Link to={linkUrl} style={{textDecoration: 'none'}}>
            <CardHeaderStyle>
              <div style={{maxWidth: '95%'}}>
                <CardTitle children={name} to={linkUrl}  variant="h4" />
                <CardTitle children={parsedCategory} to={linkUrl} variant="h6" isCategory />
              </div>
              <Tooltip title={featured ? "This model runs on our own GPU." : "This model runs on Google Colab."}>
                  {featured ? <h2>🐝</h2> : <img src="/colabIcon.png" style={{width: '1.5em'}}/>}  
              </Tooltip>
            </CardHeaderStyle>
              
  
              <NotebookImage metadata={notebook} style={{ width: "100%" }} />
  
              <CardContent>
                <NotebookInfo description={description} noImg />
              </CardContent>
            </Link>
          </CardContainer>
      </Box>
    )
  }
  
  
  const CardTitle = ({ to, children, variant, isCategory }) => (
      <Typography className={`noMargin ${isCategory && 'categoryText'}`} variant={variant} gutterBottom>
        <RouterLink to={to}>
          {children}
        </RouterLink>
      </Typography>
  )

    const CardContainer = styled.div`
      border-radius: 20px;
      background-color: rgba(0,0,0,0.3);

      transition: background-color 0.05s ease;
      &:hover {
        background-color: rgba(0,0,0,0.5);
      }
  
    `
    const CardHeaderStyle = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: 0.5em 1em;

    .MuiTypography-h4{
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 1.7rem;
      margin: 0;
    }
    a {
      text-decoration: none !important;
    }
    .categoryText {
      a {
        color: rgba(233, 250, 41, 0.7) !important;
        text-decoration: none;
      }
    }
    h2 {
      margin: 0.2em 0 0 0;
      align-self: flex-start;
      filter: saturate(0.5);
    }
    `


  export default NotebookCard