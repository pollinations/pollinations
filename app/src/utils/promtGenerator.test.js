const buildPrompt = require("./promptGenerator")

test("promt generator can generate prompts", ()=>{
    const hello = buildPrompt()
    console.log(hello)
});
