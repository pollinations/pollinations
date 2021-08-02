import {buildPrompt} from "./promptGenerator"

test("promt generator can generate prompts", ()=>{
    const prompt = buildPrompt()
    expect(prompt.length > 0)
});

