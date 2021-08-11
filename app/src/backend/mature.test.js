import mature from "./mature"

test('mature words are filtered if they have spaces around them', () => {
    expect(mature("ass")).toBe("***")
});

test('mature words are filtered if they are at the end of sentence', () => {
    expect(mature("the ass.")).toBe("the ***.")
});


test('mature words are not filtered if they are part of a word', () => {
    expect(mature("tasser")).toBe("tasser")
});
