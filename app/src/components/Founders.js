import styled from '@emotion/styled';
import CarolPic from '../assets/imgs/founders/carol.jpg';
import NielsPic from '../assets/imgs/founders/niels.jpg';
import ThomasPic from '../assets/imgs/founders/thomash.jpg';
import { MOBILE_BREAKPOINT } from '../styles/global';

const FoundersArray = [
    {
        name: <>Thomas <br/> Haferlach <br/> </>,
        title: 'CEO',
        pic: ThomasPic,
    },
    {
        name: <>Caroline <br/> Barrueco <br/> </>,
        title: 'CPO',
        pic: CarolPic,
    },
    {
        name: <>Niels <br/> Warncke <br/> </>,
        title: 'CTO',
        pic: NielsPic,
    },
]

const Founders = () => {


    return <Style>
    {
        FoundersArray
        .map(
            founder => <div>
                <img src={founder.pic} />
                <p>{founder.name}</p>
                <p><b>{founder.title}</b></p>
            </div>
        )
    }
    
    
    </Style>
}
export default Founders

const Style = styled.div`
margin-top: 2em;
width: 100%;
display: grid;
grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
gap: 1em;
img {
    max-width: 100%;
    border-radius: 20px;
    margin: 0;
}
p {
  font-style: normal;
  font-weight: 400;
  font-size: 18px;
    line-height: 18px;
  color: #FFFFFF;
  margin-top: 0.5em;
    margin-bottom: 0;
}
@media (max-width: ${MOBILE_BREAKPOINT}) {
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));

    p {
    font-size: 14px;
    line-height: 14px;
    margin: 0;
}
}
`