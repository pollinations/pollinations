import { Box, Typography } from "@material-ui/core";
import { Link } from "react-router-dom";
import RouterLink from "../molecules/RouterLink";
import { NotebookImgUrl } from "../organisms/markdownParsers/NotebookImage";
import NotebookInfo from "../organisms/markdownParsers/NotebookInfo";
import styled from '@emotion/styled';

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
  
    const img_url = NotebookImgUrl(notebook);

    return (
      <FeaturedCardStyle img_url={img_url}>
        

        <FeaturedCardInfoStyle>

            <Link to={path} style={{textDecoration: 'none'}}>
            <CardTitle children={featured ? name : name?.slice(2)} to={path} variant="h4" />
            {/* <CardTitle children={parsedCategory} to={path} variant="h6" /> */}
            {/* <NotebookInfo description={description} noImg /> */}

            </Link>
          </FeaturedCardInfoStyle>
      </FeaturedCardStyle>
    )
  }

  const FeaturedCardStyle = styled.div`
    width: 100%;
    min-height: 80vh;

    margin: 2em 0;

    background: url(${props => props.img_url}) no-repeat center center;
    background-size: cover;

    display: flex;
    flex-direction: column;
    justify-content: flex-end;

    border-radius: 20px;
  `
  const FeaturedCardInfoStyle = styled.div`
    width: 100%;
    padding: 1em;
    background-color: rgba(0,0,0,0.55);
    border-radius: 0 0 20px 20px;

    `
  
  
  const CardTitle = ({ to, children, variant }) => (
    <>
      <Typography className="Lato noMargin" variant={variant} gutterBottom>
        <RouterLink to={to}>{children}</RouterLink>
      </Typography>
    </>
  )

  export default NotebookCard