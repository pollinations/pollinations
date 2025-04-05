const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Script paths
const impactScriptPath = path.join(__dirname, '1_impact_ad_fetch.js');
const enrichScriptPath = path.join(__dirname, '2_impact_ad_enrich.js'); 
const combineScriptPath = path.join(__dirname, '3_custom_ad_combine.js');
const analyzeScriptPath = path.join(__dirname, '4_ad_llm_enrich.js');

// Output directory
const outputDir = path.join(__dirname, 'result');

// Get timestamp string YYYYMMDD_HHMM
function getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}`;
}

// Output filename
const timestamp = getTimestamp();
const outputFilename = `get_affiliate_list_${timestamp}.json`;
const outputFilePath = path.join(outputDir, outputFilename);

// Spawn processes for each script
const impactProcess = spawn('node', [impactScriptPath], {
    cwd: __dirname
});

const enrichProcess = spawn('node', [enrichScriptPath], {
    cwd: __dirname
});

const combineProcess = spawn('node', [combineScriptPath], {
    cwd: __dirname
});

const analyzeProcess = spawn('node', [analyzeScriptPath], {
    cwd: __dirname
});

// Connect scripts via pipes
impactProcess.stdout.pipe(enrichProcess.stdin);
enrichProcess.stdout.pipe(combineProcess.stdin);
combineProcess.stdout.pipe(analyzeProcess.stdin);

// Error handling for impact fetch script
impactProcess.stderr.on('data', (data) => {
    console.error(`[Pipeline Impact Debug]: ${data}`);
});

impactProcess.on('close', (code) => {
    if (code !== 0) {
        console.error(`[Pipeline] Impact fetch script exited with code ${code}`); 
    }
});

impactProcess.on('error', (err) => {
    console.error('[Pipeline] Failed to start Impact fetch script:', err);
    enrichProcess.kill();
    combineProcess.kill();
    analyzeProcess.kill(); 
});

// Error handling for enrichment script
enrichProcess.stderr.on('data', (data) => {
    if (data.toString().includes('[enrich_ad]')) { 
        console.error(data.toString().trim()); 
    }
});

enrichProcess.on('close', (code) => {
    if (code !== 0) {
        console.error(`[Pipeline] Data enrichment script exited with code ${code}`);
    }
});

enrichProcess.on('error', (err) => {
    console.error('[Pipeline] Failed to start Data enrichment script:', err);
    combineProcess.kill();
    analyzeProcess.kill();
});

// Error handling for combine script
combineProcess.stderr.on('data', (data) => {
    if (data.toString().includes('[combine_affiliates]')) { 
        console.error(data.toString().trim()); 
    }
});

combineProcess.on('close', (code) => {
    if (code !== 0) {
        console.error(`[Pipeline] Combine affiliates script exited with code ${code}`);
    }
});

combineProcess.on('error', (err) => {
    console.error('[Pipeline] Failed to start Combine affiliates script:', err);
    analyzeProcess.kill();
});

// Error handling for analysis script
analyzeProcess.stderr.on('data', (data) => {
    if (data.toString().includes('[analyze_link]')) { 
        console.error(data.toString().trim()); 
    }
});

// Collect and output final result
let finalJsonOutput = '';
analyzeProcess.stdout.on('data', (data) => {
    finalJsonOutput += data;
});

analyzeProcess.on('close', (code) => {
    if (code !== 0) {
        console.error(`[Pipeline] Link analysis script exited with code ${code}`); 
    } else {
        try {
            // Ensure output directory exists
            if (!fs.existsSync(outputDir)){
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            // Validate and write JSON
            JSON.parse(finalJsonOutput);
            fs.writeFileSync(outputFilePath, finalJsonOutput);
            console.error(`[Pipeline] Successfully wrote results to ${outputFilePath}`);
        } catch (err) {
            console.error(`[Pipeline] Error writing output file (or final JSON invalid): ${err}`);
            console.error("--- Final raw output attempt: ---");
            console.error(finalJsonOutput);
            console.error("--- End of raw output ---");
        }
    }
});

analyzeProcess.on('error', (err) => {
    console.error('[Pipeline] Failed to start Link analysis script:', err);
}); 