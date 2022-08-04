import { useMemo } from "react"
import TopAlert from "../components/organisms/TopAlert"
import { getNotebooks } from "../data/notebooks"
import useFilter from "../hooks/useFilter"
import useIPFS from "@pollinations/ipfs/reactHooks/useIPFS"
import styled from '@emotion/styled'
import NotebookCard from "../components/temp/NotebookCard"
import FilterUi from "../components/temp/FilterUi"
import { GridStyle, BaseContainer, BackGroundImage } from '../styles/global'
import heroBGOverlay from '../assets/imgs/bgherooverlay.jpeg'
import { MODELS_MAP } from "../assets/GPUModels"


export default function Models() {

  const ipfs = useIPFS("/ipns/k51qzi5uqu5dhl19ih5j7ghhgte01hoyvraq86gy0zab98iv5sd1dr3i9huvb1")
  const notebooks = useMemo(() => getNotebooks(ipfs), [ipfs])
  
  const { notebookList, options, option } = useFilter(notebooks)

  const test = useMemo(()=> notebookList.map( notebook => 
    Object.values(MODELS_MAP).find(model => notebook.name === model.id2pop) || notebook 
    ),[notebookList])
  
  
    console.log(test)
  return (
    <ModelsStyle>
      <TopAlert options={options} />

      <h3>
        {!options.length || 'What do you want to create?'}
      </h3>

      <FilterUi options={options} option={option} />

      <GridStyle>
      {
        test
        .sort((a,b) => b.featured )
        .map( notebook => <NotebookCard notebook={notebook} key={notebook.name} />)
      }
      </GridStyle>
      
      <BackGroundImage 
        src={heroBGOverlay} 
        top='0'
        zIndex='-1' 
        position='fixed'
        transform='rotate(-180deg)' 
        alt="hero_bg_overlay" />

    </ModelsStyle>
  )
};

const ModelsStyle = styled(BaseContainer)`
display: flex;
flex-direction: column;

width: 100%;
min-height: 100vh;
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


