import styled from '@emotion/styled';
import CarolPic from '../assets/imgs/founders/carol.jpeg';
import NielsPic from '../assets/imgs/founders/niels.png';
import ThomasPic from '../assets/imgs/founders/thomash.png';
import AlePic from '../assets/imgs/founders/ale.jpg';
import { MOBILE_BREAKPOINT } from '../styles/global';

const FoundersArray = [
    {
        name: 'Thomas Haferlach',
        title: 'CEO',
        pic: ThomasPic,
    },
    {
        name: 'Caroline Barrueco',
        title: 'CPO',
        pic: CarolPic,
    },
    {
        name: 'Niels Warncke',
        title: 'CTO',
        pic: NielsPic,
    },
    {
        name: 'Alexandre Silveira',
        title: 'CCM',
        pic: AlePic,
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
                <p>{founder.title}</p>
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
    margin-bottom: 1em;
    border-radius: 20px;
}
p {
    font-family: 'DM Sans';
  font-style: normal;
  font-weight: 400;
  font-size: 18px;
    line-height: 18px;
    // margin: 0.3em 0;

  color: #FFFFFF;
    margin: 0;
}
@media (max-width: ${MOBILE_BREAKPOINT}) {
    p {font-size: 14px;
    line-height: 14px;
    margin: 0;
}
}
`