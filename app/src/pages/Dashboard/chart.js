import styled from '@emotion/styled';
import { MOBILE_BREAKPOINT, Colors, Fonts } from '../../styles/global';
import { ResponsiveBar } from '@nivo/bar'


const mockData = [
  {
    "country": "AD",
    "hot dog": 31,
    "hot dogColor": "hsl(52, 70%, 50%)",
    "burger": 169,
    "burgerColor": "hsl(208, 70%, 50%)",
    "sandwich": 140,
    "sandwichColor": "hsl(271, 70%, 50%)",
    "kebab": 171,
    "kebabColor": "hsl(218, 70%, 50%)",
    "fries": 91,
    "friesColor": "hsl(357, 70%, 50%)",
    "donut": 149,
    "donutColor": "hsl(170, 70%, 50%)"
  },
  {
    "country": "AE",
    "hot dog": 137,
    "hot dogColor": "hsl(299, 70%, 50%)",
    "burger": 9,
    "burgerColor": "hsl(99, 70%, 50%)",
    "sandwich": 25,
    "sandwichColor": "hsl(193, 70%, 50%)",
    "kebab": 85,
    "kebabColor": "hsl(157, 70%, 50%)",
    "fries": 56,
    "friesColor": "hsl(252, 70%, 50%)",
    "donut": 186,
    "donutColor": "hsl(242, 70%, 50%)"
  },
  {
    "country": "AF",
    "hot dog": 178,
    "hot dogColor": "hsl(180, 70%, 50%)",
    "burger": 56,
    "burgerColor": "hsl(345, 70%, 50%)",
    "sandwich": 33,
    "sandwichColor": "hsl(74, 70%, 50%)",
    "kebab": 63,
    "kebabColor": "hsl(306, 70%, 50%)",
    "fries": 128,
    "friesColor": "hsl(208, 70%, 50%)",
    "donut": 147,
    "donutColor": "hsl(60, 70%, 50%)"
  },
  {
    "country": "AG",
    "hot dog": 96,
    "hot dogColor": "hsl(202, 70%, 50%)",
    "burger": 61,
    "burgerColor": "hsl(50, 70%, 50%)",
    "sandwich": 152,
    "sandwichColor": "hsl(99, 70%, 50%)",
    "kebab": 179,
    "kebabColor": "hsl(196, 70%, 50%)",
    "fries": 198,
    "friesColor": "hsl(244, 70%, 50%)",
    "donut": 18,
    "donutColor": "hsl(297, 70%, 50%)"
  },
  {
    "country": "AI",
    "hot dog": 66,
    "hot dogColor": "hsl(301, 70%, 50%)",
    "burger": 34,
    "burgerColor": "hsl(128, 70%, 50%)",
    "sandwich": 48,
    "sandwichColor": "hsl(114, 70%, 50%)",
    "kebab": 132,
    "kebabColor": "hsl(210, 70%, 50%)",
    "fries": 47,
    "friesColor": "hsl(337, 70%, 50%)",
    "donut": 9,
    "donutColor": "hsl(41, 70%, 50%)"
  },
  {
    "country": "AL",
    "hot dog": 102,
    "hot dogColor": "hsl(304, 70%, 50%)",
    "burger": 14,
    "burgerColor": "hsl(66, 70%, 50%)",
    "sandwich": 5,
    "sandwichColor": "hsl(330, 70%, 50%)",
    "kebab": 110,
    "kebabColor": "hsl(123, 70%, 50%)",
    "fries": 178,
    "friesColor": "hsl(299, 70%, 50%)",
    "donut": 58,
    "donutColor": "hsl(138, 70%, 50%)"
  },
  {
    "country": "AM",
    "hot dog": 140,
    "hot dogColor": "hsl(168, 70%, 50%)",
    "burger": 64,
    "burgerColor": "hsl(151, 70%, 50%)",
    "sandwich": 112,
    "sandwichColor": "hsl(198, 70%, 50%)",
    "kebab": 111,
    "kebabColor": "hsl(66, 70%, 50%)",
    "fries": 110,
    "friesColor": "hsl(8, 70%, 50%)",
    "donut": 0,
    "donutColor": "hsl(51, 70%, 50%)"
  }
]
const MyResponsiveBar = ({ data /* see data tab */ }) => (
  <ResponsiveBar
      data={data}
      keys={[
          'hot dog',
          'burger',
          'sandwich',
          'kebab',
          'fries',
          'donut'
      ]}
      indexBy="country"
      // margin={{ top: 50, right: 130, bottom: 0, left: 60 }}
      padding={0.3}
      valueScale={{ type: 'linear' }}
      indexScale={{ type: 'band', round: true }}
      colors={{ scheme: 'nivo' }}
      defs={[
          {
              id: 'dots',
              type: 'patternDots',
              background: 'inherit',
              color: '#38bcb2',
              size: 4,
              padding: 1,
              stagger: true
          },
          {
              id: 'lines',
              type: 'patternLines',
              background: 'inherit',
              color: '#eed312',
              rotation: -45,
              lineWidth: 6,
              spacing: 10
          }
      ]}
      fill={[
          {
              match: {
                  id: 'fries'
              },
              id: 'dots'
          },
          {
              match: {
                  id: 'sandwich'
              },
              id: 'lines'
          }
      ]}
      borderColor={{
          from: 'color',
          modifiers: [
              [
                  'darker',
                  1.6
              ]
          ]
      }}
      axisTop={null}
      axisRight={null}
      axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: 'country',
          legendPosition: 'middle',
          legendOffset: 32
      }}
      axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: 'food',
          legendPosition: 'middle',
          legendOffset: -40
      }}
      labelSkipWidth={12}
      labelSkipHeight={12}
      labelTextColor={{
          from: 'color',
          modifiers: [
              [
                  'darker',
                  1.6
              ]
          ]
      }}
      legends={[
          {
              dataFrom: 'keys',
              anchor: 'bottom-right',
              direction: 'column',
              justify: false,
              translateX: 120,
              translateY: 0,
              itemsSpacing: 2,
              itemWidth: 100,
              itemHeight: 20,
              itemDirection: 'left-to-right',
              itemOpacity: 0.85,
              symbolSize: 20,
              effects: [
                  {
                      on: 'hover',
                      style: {
                          itemOpacity: 1
                      }
                  }
              ]
          }
      ]}
      role="application"
      ariaLabel="Nivo bar chart demo"
      barAriaLabel={function(e){return e.id+": "+e.formattedValue+" in country: "+e.indexValue}}
  />
)
const Chart = props =>{
  return (<Style>
      
    
      <MyResponsiveBar data={mockData}/>
      


</Style>)
};

export default Chart

const Style = styled.div`
width: 100%;
height: 100%;
max-height: 80vh;
position: relative;
display: flex;
justify-content: center;
`