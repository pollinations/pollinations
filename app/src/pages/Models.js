import Box from "@material-ui/core/Box"
import Button from "@material-ui/core/Button"
import Card from "@material-ui/core/Card"
import CardContent from "@material-ui/core/CardContent"
import CardHeader from "@material-ui/core/CardHeader"
import Typography from "@material-ui/core/Typography"
import Debug from "debug"
import { useMemo } from "react"
import RouterLink from "../components/molecules/RouterLink"
import NotebookImage from "../components/organisms/markdownParsers/NotebookImage"
import NotebookInfo from "../components/organisms/markdownParsers/NotebookInfo"
import TopAlert from "../components/organisms/TopAlert"
import { getNotebooks } from "../data/notebooks"
import useFilter from "../hooks/useFilter"
import useIPFS from "../hooks/useIPFS"
import { CardContainerStyle } from "./styles/card"
import { Link } from "react-router-dom"

const debug = Debug("home")

export default function Models() {
  const ipfs = useIPFS("/ipns/k51qzi5uqu5dhl19ih5j7ghhgte01hoyvraq86gy0zab98iv5sd1dr3i9huvb1")

  const notebooks = useMemo(() => getNotebooks(ipfs), [ipfs])
  const { notebookList, options, option } = useFilter(notebooks)

  debug("got notebooks", notebooks)
  return (
    <>
      <TopAlert options={options} />

      <Box margin="calc(1.5em + 50px) 0 1.5em 0">
        {options.length ? (
          <>
            <Typography
              className="Lato"
              align="center"
              variant="h3"
              gutterBottom
              style={{ marginBottom: "0.8em" }}
            >
              What do you want to create?
            </Typography>

            <Box display="flex" justifyContent="center" marginBottom="8em">
              {options?.map((opt) => (
                <Button
                  key={opt}
                  style={{ margin: "0 0.5em" }}
                  variant={opt === option.selected ? "contained" : "outlined"}
                  color={opt === option.selected ? "secondary" : "primary"}
                  onClick={() => option.setSelected(opt)}
                >
                  {opt}
                </Button>
              ))}
            </Box>
          </>
        ) : (
          <></>
        )}
      </Box>

      <Box display="grid" gridGap="2em" gridTemplateColumns="repeat(auto-fill, minmax(300px, 1fr))">
        {notebookList.map((notebook) => (
          <NotebookCard key={notebook.name} notebook={notebook} />
        ))}
      </Box>
    </>
  )
}

// Cards
// Component

const NotebookCard = ({ notebook }) => {
  let { category, name, path, description } = notebook

  // remove credits etc (they are separated by a horizontal rule)
  description = description.split("---")[0]

  // parse category
  const parsedCategory = category?.slice(2)
    .replace('-', ' ')
    .replace('-', ' ')
    .toLowerCase();

  return (
    <Box>
      <Card style={CardContainerStyle}>
          <Link to={path} style={{textDecoration: 'none'}}>
            <CardHeader
              subheader={<CardTitle children={name?.slice(2)} to={path} variant="h4" />}
              title={<CardTitle children={parsedCategory} to={path} variant="h6" />}
            />

            <NotebookImage metadata={notebook} style={{ width: "100%" }} />

            <CardContent>
              <NotebookInfo description={description} noImg />
            </CardContent>
          </Link>
      </Card>
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
