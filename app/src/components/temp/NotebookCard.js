import styled from '@emotion/styled';
import { Box, CardContent, Tooltip, Typography } from "@material-ui/core";
import { Link } from "react-router-dom";
import RouterLink from "../molecules/RouterLink";
import NotebookImage from "../organisms/markdownParsers/NotebookImage";
import NotebookInfo from "../organisms/markdownParsers/NotebookInfo";


const NotebookCard = ({ notebook }) => {
    let { category, name, path, description, featured, url } = notebook
  
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

    return (
      <Box>
        <CardContainer>
            <Link to={featured ? ownGpuPath : path} style={{textDecoration: 'none'}}>
            <CardHeaderStyle>
              <div style={{maxWidth: '95%'}}>
                <CardTitle children={name} to={featured ?  ownGpuPath : path}  variant="h4" />
                <CardTitle children={parsedCategory} to={featured ?  ownGpuPath : path} variant="h6" isCategory />
              </div>
              <Tooltip title="This model runs on our own GPU.">
                  <h2 children={featured ? '🐝' : ''}/> 
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
      <Typography className={`Lato noMargin ${isCategory && 'categoryText'}`} variant={variant} gutterBottom>
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
        color: rgba(233, 250, 41, 0.8) !important;
        text-decoration: none;
      }
    }
    h2 {
      margin: 0.2em 0 0 0;
      align-self: flex-start;
    }
    `


  export default NotebookCard