import styled from '@emotion/styled'

export const SmallContainer = ({ children }) => 
    <div style={{ minWidth: '20%', maxWidth: 600, margin: 'auto', marginBottom: '7em' }}>
        {children}
    </div>

export const GridStyle = styled.div`
display: grid;
grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
grid-gap: 1em;
`