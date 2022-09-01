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
      .replace('-', ' ')
      .replace('-', ' ')
      .toLowerCase();
  
    const ownGpuPath = `/create/${path}`;

    return (
      <Box>
        <div style={{ borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)'}}>
            <Link to={featured ? ownGpuPath : path} style={{textDecoration: 'none'}}>
            <CardHeaderStyle>
              <div>
                <CardTitle children={name} to={featured ?  ownGpuPath : path}  variant="h4" />
                <CardTitle children={parsedCategory} to={featured ?  ownGpuPath : path} variant="h6" />
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
          </div>
      </Box>
    )
  }
  
  
  const CardTitle = ({ to, children, variant }) => (
    <>
      <Typography className="Lato noMargin" variant={variant} gutterBottom>
        <RouterLink to={to}>{children}</RouterLink>
      </Typography>
    </>
  )


    const CardHeaderStyle = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    padding: 1em;
    `


  export default NotebookCard