import { Box, Card, CardContent, CardHeader, Typography } from "@material-ui/core";
import { Link } from "react-router-dom";
import RouterLink from "../molecules/RouterLink";
import NotebookImage from "../organisms/markdownParsers/NotebookImage";
import NotebookInfo from "../organisms/markdownParsers/NotebookInfo";

const NotebookCard = ({ notebook }) => {
    let { category, name, path, description, featured } = notebook
  
    if (!description) return null;
  
    // remove credits etc (they are separated by a horizontal rule)
    description = description.split("---")[0]
  
    // parse category
    const parsedCategory = category?.slice(2)
      .replace('-', ' ')
      .replace('-', ' ')
      .toLowerCase();
  
    return (
      <Box>
        <div style={{ borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.3)'}}>
            <Link to={path} style={{textDecoration: 'none'}}>
            <CardHeader
                subheader={<CardTitle children={featured ? name : name?.slice(2)} to={path} variant="h4" />}
                title={<CardTitle children={parsedCategory} to={path} variant="h6" />}
              />
              
  
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

  export default NotebookCard