import { useMemo } from "react"
import TopAlert from "../components/organisms/TopAlert"
import { getNotebooks } from "../data/notebooks"
import useFilter from "../hooks/useFilter"
import useIPFS from "@pollinations/ipfs/reactHooks/useIPFS"
import styled from '@emotion/styled'
import NotebookCard from "../components/temp/NotebookCard"
import FilterUi from "../components/temp/FilterUi"
import { GridStyle, BaseContainer } from '../styles/global'


export default function Models() {

  const ipfs = useIPFS("/ipns/k51qzi5uqu5dhl19ih5j7ghhgte01hoyvraq86gy0zab98iv5sd1dr3i9huvb1")
  const notebooks = useMemo(() => getNotebooks(ipfs), [ipfs])
  const { notebookList, options, option } = useFilter(notebooks)

  return (
    <ModelsStyle>
      <TopAlert options={options} />

      <h3>
        {!options.length || 'What do you want to create?'}
      </h3>

      <FilterUi options={options} option={option} />

      <GridStyle>
      {
        notebookList
        .map( notebook => <NotebookCard notebook={notebook} key={notebook.name} />)
      }
      </GridStyle>
      

    </ModelsStyle>
  )
};

const ModelsStyle = styled(BaseContainer)`
h3 {
  text-align: center;
  margin: 1em 0 0 0;
  font-size: 3rem;
  font-family: Open Sans;
  font-weight: 400;
  line-height: 1.167;
  font-family: Lato;
}
`;


