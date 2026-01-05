import { privateEncrypt } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const POLLINATIONS_IMAGE_API = 'https://gen.pollinations.ai/image';
const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';
const POLLINATIONS_API = 'https://gen.pollinations.ai/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY = 5;

function getPreviousDayRange() {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    
    return {
        startDate,
        endDate,
    };
}


async function getMergedPRsFromPreviousDay(owner : any = 'pollinations', repo : any = 'pollinations', githubToken : string) {
    if (!githubToken) {
        throw new Error('GitHub token is required');
    }

    const { startDate, endDate } = getPreviousDayRange();
    const dateString = startDate.toISOString().split('T')[0];

    const query = `
        query($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequests(
          states: MERGED
          first: 100
          after: $cursor
          orderBy: {field: UPDATED_AT, direction: DESC}
          baseRefName: "main"
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            number
            title
            body
            url
            mergedAt
            updatedAt
            author {
              login
            }
            labels(first: 10) {
              nodes {
                name
              }
            }
          }
        }
      }
    }
    `;

    const headers = {
        Authorization: `Bearer ${githubToken}`,
        'Content-Type': 'application/json',
    };

    const allPRs = [];
    let cursor = null;

    console.log(`\n=== Fetching PRs from ${dateString} ===`);
    console.log(`Time range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    let pageNum = 1;

    while (true) {
        const variables : object = {
            owner,
            repo,
            cursor,
        };

        try {
            const response = await fetch(GITHUB_GRAPHQL_API, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    query,
                    variables,
                }),
            });

            const data = await response.json();

            if ((data as any).errors) {
                console.error('GraphQL errors:', (data as any).errors);
                break;
            }

            const prData = (data as any).data.repository.pullRequests;
            const nodes = prData.nodes;
            const pageInfo = prData.pageInfo;

            console.log(`  Page ${pageNum}: fetched ${nodes.length} PRs`);

            for (const pr of nodes) {
                const mergedDate = new Date(pr.mergedAt);

                if (mergedDate >= startDate && mergedDate < endDate) {
                    allPRs.push({
                        number: pr.number,
                        title: pr.title,
                        body: pr.body || '',
                        url: pr.url,
                        author: pr.author?.login || 'unknown',
                        labels: pr.labels?.nodes?.map((l : any) => l.name) || [],
                        mergedAt: pr.mergedAt,
                    });
                } else if (mergedDate < startDate) {
                    console.log(`  Stopping: reached PRs before ${dateString}`);
                    pageNum = 999;
                    break;
                }
            }

            if (!pageInfo.hasNextPage || pageNum > 100) break;

            cursor = pageInfo.endCursor;
            pageNum++;
            if (allPRs.length == 0) {
                return
            }
        } catch (error) {
            console.error('Fetch error:', error);
            break;
        }
    }


    console.log(`Found ${allPRs.length} merged PRs from previous day\n`);
    return { prs: allPRs, dateString };
}

async function createImagePrompt(prs : any[], dateString: string, pollactionsToken : string) {
    if (!prs || prs.length === 0) {
        return {
            prompt: 'Pollinations: A free, open-source AI image generation platform with community updates',
            summary: 'No specific updates from previous day',
            prCount: 0,
            highlights: [],
        };
    }

    const prList = prs.slice(0, 10).map(pr => pr.title).join(', ');

    const systemPrompt = `Output SHORT image prompt (2-3 sentences). Create nature-themed comic flowchart with updates as distinct natural elements (flowers, trees, creatures, vines). Bug fixes=pruned branches, Features=blooming flowers, Refactors=reorganized paths, Infrastructure=nesting animals. Bright comic style: emerald, golden, sky blue, orange, purple. Dynamic energy: wind, pollen, water, bee flight paths. Strip all dates, counts, metrics. ONLY output the image prompt.`
    const userPrompt = `Nature-themed comic flowchart: ${prList}
Short prompt only. No dates, counts, metadata.`

    try {
        console.log('Generating merged prompt using Pollinations API...');
        
        const response = await fetch(POLLINATIONS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${pollactionsToken}`,
            },
            body: JSON.stringify({
                model: 'openai-large',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 250,
                seed: 42,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.warn(`API warning: ${response.status} - ${JSON.stringify(errorData).substring(0, 200)}`);
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const generatedPrompt = (data as any).choices?.[0]?.message?.content?.trim();
        if (!data)
        {
            console.log("No data returned from Pollinations API");
        }
        if (!generatedPrompt) {
            throw new Error('No prompt generated from API');
        }

        const highlights = prs
            .slice(0, 8)
            .map(pr => {
                const title = pr.title.toLowerCase();
                let category = 'update';
                if (title.includes('fix') || title.includes('bug')) category = 'bug fix';
                else if (title.includes('feat') || title.includes('add')) category = 'feature';
                else if (title.includes('docs')) category = 'documentation';
                else if (title.includes('perf') || title.includes('optim')) category = 'optimization';
                return `${category}: ${pr.title}`;
            });

        const summary = `
${prs.length} PRs merged:
${highlights.map(h => `• ${h}`).join('\n')}
        `.trim();

        console.log('✓ Prompt generated successfully\n');
        console.log('Generated Prompt:');
        console.log(generatedPrompt);
        console.log('');

        return {
            prompt: generatedPrompt,
            summary,
            prCount: prs.length,
            highlights,
            prs: prs.map(p => ({ number: p.number, title: p.title, url: p.url })),
        };
    } catch (error) {
        console.warn(`Prompt generation failed: ${(error as any).message}`);
        console.log('Falling back to local prompt generation...\n');

        const comicPrompt = `Comic book style illustration celebrating ${prs.length} Pollinations updates:
${prs.slice(0, 5).map(p => p.title).join(', ')}.
Dynamic composition with bees pollinating code flowers, bright colors, retro comic aesthetic.
Write in pure plain text, no metadata or extra commentary or markdown`;

        const highlights = prs
            .slice(0, 8)
            .map(pr => {
                const title = pr.title.toLowerCase();
                let category = 'update';
                if (title.includes('fix') || title.includes('bug')) category = 'bug fix';
                else if (title.includes('feat') || title.includes('add')) category = 'feature';
                else if (title.includes('docs')) category = 'documentation';
                else if (title.includes('perf') || title.includes('optim')) category = 'optimization';
                return `${category}: ${pr.title}`;
            });

        return {
            prompt: comicPrompt,
            summary: `${prs.length} PRs merged (fallback)`,
            prCount: prs.length,
            highlights,
            prs: prs.map(p => ({ number: p.number, title: p.title, url: p.url })),
        };
    }
}

async function getPRsAndCreatePrompt(githubToken : string, pollactionsToken : string) {
    try {
        const result = await getMergedPRsFromPreviousDay('pollinations', 'pollinations', githubToken);
        
        if (!result || !result.prs || result.prs.length === 0) {
            console.log('ℹ️  No merged PRs found in the previous day. Exiting pipeline.');
            process.exit(0);
        }
        
        const { prs, dateString } = result;
        const promptData = await createImagePrompt(prs, dateString, pollactionsToken);
        console.log('\n=== Generated Image Prompt ===');
        console.log(promptData.prompt);
        console.log('\n');

        return promptData;
    } catch (error) {
        console.error('Error fetching PRs:', error);
        throw error;
    }
}


async function generateTitleFromPRs(prSummary : string, prCount : string, pollactionsToken : string) {
    try {
        const systemPrompt = `You are a Reddit post title generator. Generate a catchy yet descriptive development update title, maximum 12 words. The title must be clear, engaging, and professional, with natural enthusiasm. Avoid brackets, numbers, metrics, emojis, hashtags, or promotional language. Prioritize concrete features or improvements over vague hype.`;
        const userPrompt = `Generate a Reddit post title for this dev update:
${prSummary}

Title only, no explanation.`;

        const response = await fetch(POLLINATIONS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${pollactionsToken}`,
            },
            body: JSON.stringify({
                model: 'openai-large',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.8,
                max_tokens: 60,
            }),
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        let title = (data as any).choices?.[0]?.message?.content?.trim() || '';
        
        title = title.replace(/^["']|["']$/g, '').trim();
        
        if (!title || title.length < 5) {
            title = `Pollinations: ${prCount} Updates Shipped`;
        }

        return title;
    } catch (error) {
        console.error('PR title generation failed:', (error as any).message);
        return `Pollinations: ${prCount} Updates Shipped`;
    }
}

async function generateImage(prompt : string, pollactionsToken : string, attempt = 0) {
    if (attempt > 0) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(`  Retrying in ${delay}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, delay * 1000));
    }

    try {
        const URL = `${POLLINATIONS_IMAGE_API}/${encodeURIComponent(prompt)}?model=nanobanana&width=1024&height=1024&seed=42`;
        const response = await fetch(URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${pollactionsToken}`,
            },
            signal: AbortSignal.timeout(120000),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        console.log(`URL: ${URL}`);
        return {
                buffer: Buffer.from(await response.arrayBuffer()),
                url: URL
        }
    } catch (error) {
        if (attempt < MAX_RETRIES - 1) {
            console.log(`  ✗ Attempt ${attempt + 1} failed: ${(error as any).message}`);
            return generateImage(prompt, pollactionsToken, attempt + 1);
        }
        throw error;
    }
}


const githubToken = process.env.GITHUB_TOKEN
const pollinationsToken = process.env.POLLINATIONS_TOKEN

if (!githubToken) {
throw new Error('GitHub token not configured. Please set it in app settings.');
}
if (!pollinationsToken) {
throw new Error('Pollinations token not configured. Please set it in app settings.');
}

(async () => {
const promptData = await getPRsAndCreatePrompt(githubToken as string, pollinationsToken as string);
const imageData = await generateImage(promptData.prompt, pollinationsToken as string);
const TITLE = await generateTitleFromPRs(promptData.summary, String(promptData.prCount), pollinationsToken as string);
// const img_url = "https://gen.pollinations.ai/image/Bright%20nature-themed%20comic%20flowchart%20where%20each%20update%20is%20a%20distinct%20natural%20element%3A%20pruned%20branches%20for%20removing%20sops%20decrypt%20from%20the%20start%20script%3B%20blooming%20flowers%20for%20adding%20a%20Reddit%20link%2C%20updating%20the%20submit%20app%20template%2C%20adding%20AI%20Chat%20Studio%20to%20chat%2C%20improving%20the%20hello%20UI%2C%20and%20adjusting%20z-image%20(upscaling%20temporarily%20disabled%2C%20safety%20checker%20off%20by%20default).%20Reorganized%20winding%20paths%20and%20vine-lattices%20show%20refactors%20to%20standardize%20infrastructure%20keys%20and%20clean%20up%20secrets%2C%20while%20nesting%20animals%20depict%20workflow%20infrastructure%3A%20tier%20automation%20that%20gates%20app%20PRs%20on%20Enter%20account%20and%20auto-upgrades%20on%20approval.%20Use%20emerald%2C%20golden%2C%20sky%20blue%2C%20orange%2C%20and%20purple%20with%20dynamic%20wind%20swirls%2C%20floating%20pollen%2C%20flowing%20water%2C%20and%20bee%20flight%20paths%20connecting%20nodes%20in%20a%20lively%20comic%20style.?model=nanobanana&width=1024&height=1024&seed=742956"
// const TITLE = "Nature-Themed Comic Flowchart Image"
console.log('Final Results:');
console.log(`Title: ${TITLE}`);
console.log(`Image URL: ${imageData.url}`);
const fs = await import('fs');
const linkTsPath = new URL('link.ts', import.meta.url);
const updatedLinkTs = `
const LINK = "${imageData.url}";
const TITLE = "${TITLE}";
export {LINK, TITLE};
`;

fs.writeFileSync(linkTsPath, updatedLinkTs, 'utf-8');
console.log('\n✓ link.ts updated successfully');
})();

