import styled from '@emotion/styled'
import useIPFS from "@pollinations/ipfs/reactHooks/useIPFS"
import { useMemo } from "react"
import TopAlert from "../components/organisms/TopAlert"
import NotebookCard from "../components/temp/NotebookCard"
import { getNotebooks } from "../data/notebooks"
import useFilter from "../hooks/useFilter"

import heroBGOverlay from '../assets/imgs/bgherooverlay.jpeg'
import FilterUi from "../components/temp/FilterUi"
import useGPUModels from "../hooks/useGPUModels"
import { BackGroundImage, BaseContainer, GridStyle, Headline } from '../styles/global'

export default function Models() {

  const { models } = useGPUModels();

  const ipfs = useIPFS("/ipns/k51qzi5uqu5dhl19ih5j7ghhgte01hoyvraq86gy0zab98iv5sd1dr3i9huvb1")
  const notebooks = useMemo(() => getNotebooks(ipfs), [ipfs])

  const test = useMemo(()=>{
    if (!notebooks) return [];
    return [
      ...Object.values(models).filter( model => model.listed),
      ...notebooks ]
  },[notebooks, models])



  const { notebookList, options, option } = useFilter(test)



    return (
      <ModelsStyle>
        <TopAlert options={options} />


        <ShowReelHeadline>
          {!options.length || 'What will you create?'}
        </ShowReelHeadline>

        <FilterUi options={options} option={option} />

        <GridStyle>
        {
          // hack to hide the ones that are not fetched
          (notebookList.length > 0) &&
          notebookList
          .sort((a,b) => b.featured )
          // .filter(notebook => !notebook.featured)
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


const ShowReelStyle = styled.div`

display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));

gap: 2em;
padding: 8em;
padding-top: 0;
`

const ShowReelHeadline = styled(Headline)`
margin: 2em 0;

`




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
margin-bottom: 2em;
`;


