import { useEffect, useMemo, useState } from "react";
import useIPFS from '@pollinations/ipfs/reactHooks/useIPFS';
import { getPollens } from '@pollinations/ipfs/awsPollenRunner';
import MediaViewer from "../MediaViewer/";
import { mediaToDisplay } from "../../data/media";
import styled from "@emotion/styled";
import { useGPUModels } from "../../hooks/useGPUModels";
import { getInputs } from "../../pages/Create/Form/utils";

function Examples(props) {
    const { url,  } = props;
    const { models } = useGPUModels();
    // const { primary_input } = getInputs(models, selectedModel);


    const { primary_input } = useMemo(()=> {
        return getInputs(models, props);
    },[models, props])


    const [ examples, setExamples ] = useState([]);

    useEffect(()=> {
        const InitialFetch = async () => setExamples(await getPollens({image:url, success:true}));
        InitialFetch()    
    },[ url ])

    useEffect(()=>{
        console.log(examples)
    } ,[examples])

    // shuffle examples
    const shuffledExamples = examples.sort(()=>Math.random()-0.5);
    // select 20 random examples
    const selectedExamples = shuffledExamples.slice(0,20);

    if (!examples) return <></>;
    return <Style>
    <div>
    <h3>
        Examples
    </h3>
    <p>
        Some stuff people already did with this model in pollinations.
    </p>
    </div>
    {
        selectedExamples.map(({ output }) => 
        <Example  output={output} primary_input={primary_input} />
        )
    }
    </Style>;
}

function Example({ output, primary_input }) {

    const ipfs = useIPFS(output);

    // console.log(ipfs.input[primary_input])
    
    const props = {
        // filename: 'whatever',
        content: mediaToDisplay(ipfs.output)?.first?.url,
        type: "image",
    }
    return <>
        <MediaViewer {...props} />
    </>
}


const Style = styled.div`
display: grid;
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
gap: 1em;
`



export default Examples