import styled from '@emotion/styled'
import Button from '@material-ui/core/Button'
import { BaseButtonStyle } from '../../styles/classes'


const StyledButton = (props) => {

    return <Style>
    <Button variant='contained'{...props} disableRipple>
      {props.children}
    </Button>
  </Style>
}

const Style = styled.div`
button{
    ${BaseButtonStyle}
}
`

export default StyledButton