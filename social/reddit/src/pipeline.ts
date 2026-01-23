import dotenv from 'dotenv';
import { getSystemPromptTemplate } from './system_prompt.js';
dotenv.config();

const POLLINATIONS_IMAGE_API = 'https://gen.pollinations.ai/image';
const GITHUB_GRAPHQL_API = 'https://api.github.com/graphql';
const POLLINATIONS_API = 'https://gen.pollinations.ai/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY = 5;
const githubToken = process.env.GITHUB_TOKEN
const pollinationsToken = process.env.POLLINATIONS_TOKEN

if (!githubToken) {
throw new Error('GitHub token not configured. Please set it in app settings.');
}
if (!pollinationsToken) {
throw new Error('Pollinations token not configured. Please set it in app settings.');
}

function getPreviousDayRange() {
    const now = new Date();
    const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    
    return {
        startDate,
        endDate,
    };
}

function getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

async function createImagePrompt(prs : any[], dateString: string, pollinationsToken : string) {
    if (!prs || prs.length === 0) {
        return {
            prompt: 'Flat vector editorial infographic: Pollinations: A free, open-source AI image generation platform with community updates',
            summary: 'No specific updates from previous day',
            prCount: 0,
            highlights: [],
        };
    }

    const prSummary = prs.slice(0, 10).map(pr => `- ${pr.title}`).join('\n');
    const systemPrompt = getSystemPromptTemplate(prSummary);
    
    const userPrompt = `Generate an image prompt for a flat vector editorial infographic for Reddit based on these PRs:\n${prSummary}`;

    try {
        console.log('Generating merged prompt using Pollinations API...');
        
        const response = await fetch(POLLINATIONS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${pollinationsToken}`,
            },
            body: JSON.stringify({
                model: 'openai-large',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 500,
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
            dateString,
        };
    } catch (error) {
        console.warn(`Prompt generation failed: ${(error as any).message}`);
        console.log('Falling back to local prompt generation...\n');

        const comicPrompt = `Flat vector editorial infographic celebrating ${prs.length} Pollinations updates. Headline: 'POLLINATIONS - WEEKLY UPDATES'. Content includes: ${prs.slice(0, 5).map(p => p.title).join(', ')}. Style: minimal tech infographic. Color palette: cream background, navy text, lime green (#ecf874) accents. No decorative elements.`;

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
            dateString,
        };
    }
}

async function generateTitleFromPRs(prs : any[],  pollinationsToken : string, dateString: string = '') {
    try {
        const todayDate = getTodayDate();
        
        const prSummary = prs.slice(0, 5).map(pr => `- ${pr.title}`).join('\n');
        
        const systemPrompt = getSystemPromptTemplate(prSummary);
        const userPrompt = `Create a short, factual Reddit post title (5-12 words) for today's update (${todayDate}) based on these PRs:\n${prSummary}\n\nTitle must include 'Pollinations' or 'Pollinations.ai' and follow Reddit norms - factual, non-promotional.`;

        const response = await fetch(POLLINATIONS_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${pollinationsToken}`,
            },
            body: JSON.stringify({
                model: 'openai-large',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 150,
            }),
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        let title = (data as any).choices?.[0]?.message?.content?.trim() || '';
        
        title = title.replace(/^["']|["']$/g, '').trim();
        
        if (!title || title.length < 5) {
            title = `Something remarkable happened at Pollinations today`;
        }

        return title;
    } catch (error) {
        console.error('PR title generation failed:', (error as any).message);
        return `You're gonna want to see what Pollinations shipped`;
    }
}

async function generateImage(prompt : string, pollinationsToken : string, attempt = 0) {
    if (attempt > 0) {
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        console.log(`  Retrying in ${delay}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, delay * 1000));
    }

    try {
        const URL = `${POLLINATIONS_IMAGE_API}/${encodeURIComponent(prompt)}?model=nanobanana-pro&width=1024&height=1024&seed=42`;
        const response = await fetch(URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${pollinationsToken}`,
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
            return generateImage(prompt, pollinationsToken, attempt + 1);
        }
        throw error;
    }
}

async function pipeline(githubToken : string, pollinationsToken : string) {
    try {
        console.log('\n📋 Fetching merged PRs from previous day...\n');
        
        const result = await getMergedPRsFromPreviousDay('pollinations', 'pollinations', githubToken);
        
        if (!result || !result.prs || result.prs.length === 0) {
            console.log('ℹ️  No merged PRs found in the previous day. Exiting pipeline.');
            process.exit(0);
        }
        
        const { prs, dateString } = result;
        const promptData = await createImagePrompt(prs, dateString, pollinationsToken);
        console.log('\n=== Generated Image Prompt (System Prompt Based) ===');
        console.log(promptData.prompt);
        console.log('\n');


        const postTitle = await generateTitleFromPRs(prs, pollinationsToken, dateString);
        console.log('=== Generated Post Title (System Prompt Based) ===');
        console.log(postTitle);
        console.log('\n');
        
        
        const imageData = await generateImage(promptData.prompt, pollinationsToken);
        console.log('=== Generated Image URL ===');
        console.log(imageData.url);
        console.log('\n');

        const data = {
            TITLE: postTitle,
            LINK: imageData.url,
        }
        return data;
    } catch (error) {
        console.error('Error fetching PRs:', error);
        throw error;
    }
}


(async () => {
const promptData = await pipeline(githubToken as string, pollinationsToken as string);
console.log(promptData)
console.log('Final Results:');
console.log(`Image URL: ${promptData.LINK}`);
const fs = await import('fs');
const linkTsPath = new URL('link.ts', import.meta.url);
const escapedTitle = promptData.TITLE.replace(/\"/g, '\\"').replace(/\n/g, ' ').replace(/\r/g, '');
const updatedLinkTs = `const LINK = "${promptData.LINK}";
const TITLE = "${escapedTitle}";
export {LINK, TITLE};
`;
fs.writeFileSync(linkTsPath, updatedLinkTs, 'utf-8');
console.log('\n✓ link.ts updated successfully');
})();
