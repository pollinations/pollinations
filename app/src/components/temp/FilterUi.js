import styled from '@emotion/styled'
import Button from '../../components/atoms/StyledButton'

const FilterUi = ({options, option}) => {
  
    if (!options.length) return <></>;
    
    return <FilterUiStyle>

        {!options.length || options?.map((opt) => (
          <Button 
            key={opt} 
            style={{ opacity: option.selected === opt ? '1' : '0.8' }}
            onClick={() => option.setSelected(opt)}>
            {opt}
          </Button>
        ))}

    </FilterUiStyle>  
}

const FilterUiStyle = styled.div`
display: flex;
justify-content: center;
flex-wrap: wrap;
gap: 1em;
margin: 4em 0;
`


export default FilterUi