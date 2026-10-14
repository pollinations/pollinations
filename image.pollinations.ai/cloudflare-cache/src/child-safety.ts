/**
 * Prompts asking for sexual content with minors, refused before the cache by
 * middleware/child-safety.ts. Terms are matched as whole words after folding
 * case and accents; terms in scripts written without spaces, anywhere.
 */

// Refused on their own
const ALWAYS = [
    "lolicon",
    "shotacon",
    "jailbait",
    "pthc",
    "childporn",
    "kidporn",
    "kiddieporn",
    "csam",
    "pedopornografia",
    "ロリコン",
    "萝莉控",
];

const MINORS = [
    "child",
    "children",
    "kid",
    "kids",
    "kiddie",
    "toddler",
    "toddlers",
    "infant",
    "infants",
    "newborn",
    "tween",
    "tweens",
    "preteen",
    "preteens",
    "pre teen",
    "pubescent",
    "prepubescent",
    "underage",
    "underaged",
    "under age",
    "minor",
    "minors",
    "juvenile",
    "little girl",
    "little girls",
    "little boy",
    "little boys",
    "young girl",
    "young girls",
    "young boy",
    "young boys",
    "young teen",
    "young teens",
    "early teen",
    "schoolgirl",
    "schoolgirls",
    "school girl",
    "schoolboy",
    "schoolboys",
    "school boy",
    "kindergarten",
    "elementary school",
    "middle school",
    "loli",
    "lolis",
    "shota",
    "niña",
    "niñas",
    "niño",
    "niños",
    "menor",
    "menores",
    "infantil",
    "menina",
    "meninas",
    "menino",
    "meninos",
    "criança",
    "crianças",
    "bambina",
    "bambino",
    "bambini",
    "enfant",
    "enfants",
    "fillette",
    "kinder",
    "minderjährig",
    "minderjährige",
    "девочка",
    "девочки",
    "мальчик",
    "мальчики",
    "ребёнок",
    "дети",
    "детей",
    "школьница",
    "малолетка",
    "幼女",
    "幼児",
    "幼兒",
    "萝莉",
    "蘿莉",
    "儿童",
    "兒童",
    "児童",
    "女童",
    "男童",
    "小学生",
    "小學生",
    "中学生",
    "中學生",
    "未成年",
    "아동",
    "어린이",
    "미성년",
];

// Minors, unless an age of 18 or 19 stands right by the word
const TEENS = [
    "teen",
    "teens",
    "teenage",
    "teenaged",
    "teenager",
    "teenagers",
    "adolescent",
    "adolescents",
    "adolescente",
    "adolescentes",
    "подросток",
    "подростки",
];

const SEXUAL = [
    "nude",
    "nudes",
    "nudity",
    "naked",
    "nakedness",
    "nsfw",
    "sex",
    "sexy",
    "sexual",
    "sexually",
    "sexualized",
    "sexualised",
    "porn",
    "porno",
    "pornographic",
    "pornography",
    "xxx",
    "hentai",
    "erotic",
    "erotica",
    "lewd",
    "topless",
    "bottomless",
    "nipple",
    "nipples",
    "breasts",
    "boobs",
    "tits",
    "titties",
    "vagina",
    "pussy",
    "penis",
    "cock",
    "genital",
    "genitals",
    "genitalia",
    "orgasm",
    "masturbate",
    "masturbating",
    "masturbation",
    "fuck",
    "fucking",
    "fucked",
    "rape",
    "raped",
    "molest",
    "molested",
    "molesting",
    "intercourse",
    "incest",
    "lingerie",
    "panties",
    "upskirt",
    "cameltoe",
    "camel toe",
    "seductive",
    "seducing",
    "sensual",
    "horny",
    "aroused",
    "undress",
    "undressed",
    "undressing",
    "unclothed",
    "no clothes",
    "without clothes",
    "no clothing",
    "striptease",
    "spread legs",
    "legs spread",
    "fetish",
    "bdsm",
    "cum",
    "semen",
    "blowjob",
    "blow job",
    "anal",
    "onlyfans",
    "pedo",
    "pedophile",
    "paedophile",
    "pedophilia",
    "desnuda",
    "desnudo",
    "desnudas",
    "desnudos",
    "desnudez",
    "nua",
    "nuas",
    "nudez",
    "sexo",
    "pornografía",
    "erótica",
    "erótico",
    "tetas",
    "sin ropa",
    "sem roupa",
    "nue",
    "nues",
    "sexe",
    "érotique",
    "sans vêtements",
    "seins",
    "nackt",
    "nackte",
    "nackten",
    "nackter",
    "nacktes",
    "erotisch",
    "ohne kleidung",
    "голая",
    "голые",
    "голый",
    "голенькая",
    "обнажённая",
    "обнажённые",
    "секс",
    "порно",
    "эротика",
    "без одежды",
    "裸体",
    "裸體",
    "全裸",
    "裸照",
    "色情",
    "性交",
    "做爱",
    "做愛",
    "ヌード",
    "セックス",
    "エロ",
    "ポルノ",
    "누드",
    "알몸",
    "섹스",
];

// An age next to a unit, as in "12 year old", "13yo" or "12 años"
const AGE =
    /(?<!\d)(\d{1,2}) ?(?:years? old|yrs? old|yo|y o|anos|ans|jahre|лет)(?!\p{L})/gu;

const SPACELESS =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** Lower case, no accents, every run of other characters one space, padded */
const fold = (text: string) =>
    ` ${text
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()} `;

const matcher = (terms: string[]) => {
    const folded = terms.map((term) => {
        const word = fold(term).trim();
        return SPACELESS.test(word) ? word : ` ${word} `;
    });
    return (text: string) => folded.some((term) => text.includes(term));
};

const always = matcher(ALWAYS);
const minors = matcher(MINORS);
const teens = matcher(TEENS);
const sexual = matcher(SEXUAL);

// "18 year old teen", "19yo teen", "teen aged 19": a teen who is an adult
const teenWords = TEENS.map((term) => fold(term).trim()).join("|");
const ADULT_TEEN = new RegExp(
    `(?<!\\d)1[89] ?(?:years? old |yrs? old |yo |y o )?(?:${teenWords})(?!\\p{L})` +
        `|(?<!\\p{L})(?:${teenWords}) (?:aged |age )?1[89](?!\\d)`,
    "gu",
);

// Control and format characters: the generator strips control characters,
// so each prompt is checked with them removed and with them as spaces
const HIDDEN = /[\p{Cc}\p{Cf}]/gu;

export function asksForSexualContentWithMinors(prompt: string) {
    return [prompt.replace(HIDDEN, ""), prompt.replace(HIDDEN, " ")].some(
        (variant) => refuses(fold(variant)),
    );
}

function refuses(text: string) {
    if (always(text)) return true;
    if (!sexual(text)) return false;
    const ages = [...text.matchAll(AGE)].map(([, age]) => Number(age));
    if (ages.some((age) => age < 18)) return true;
    return minors(text) || teens(text.replace(ADULT_TEEN, " "));
}
