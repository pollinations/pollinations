const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Corrected paths relative to affiliate/impact/scripts/
const impactScriptPath = path.join(__dirname, '1_fetch_impact_ads.js');
const analyzeScriptPath = path.join(__dirname, '2_analyze_ad_links.js');

// Updated output directory to affiliate/results/
const outputDir = path.join(__dirname, '..', 'results'); // Go up one level to impact/, then into results/

// Function to get timestamp string YYYYMMDD_HHMM
function getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}`;
}

// Construct dynamic output filename
const timestamp = getTimestamp();
const outputFilename = `${timestamp}.json`;
const outputFilePath = path.join(outputDir, outputFilename);

// console.log('Starting affiliate analysis pipeline...'); // Removed log
// console.log(`[Pipeline] Running Impact script: ${impactScriptPath}`); // Removed log

// Spawn the first script (Impact ads fetcher)
const impactProcess = spawn('node', [impactScriptPath], {
    cwd: __dirname // CWD is the directory the script is in
});

// Spawn the second script (Pollinations analysis)
// console.log(`[Pipeline] Running Analysis script: ${analyzeScriptPath}`); // Removed log
const analyzeProcess = spawn('node', [analyzeScriptPath], {
    cwd: __dirname // CWD is the directory the script is in
});

// Pipe stdout of impactProcess to stdin of analyzeProcess
impactProcess.stdout.pipe(analyzeProcess.stdin);

// Handle stderr for the Impact script - COMMENTED OUT
// impactProcess.stderr.on('data', (data) => {
//     console.error(`[Impact Fetch Error]: ${data}`);
// });

impactProcess.on('close', (code) => {
    if (code !== 0) {
        // Keep this error log
        console.error(`[Pipeline] Impact fetch script exited with code ${code}`); 
    }
});

impactProcess.on('error', (err) => {
     // Keep this error log
    console.error('[Pipeline] Failed to start Impact fetch script:', err);
    analyzeProcess.kill(); 
});

// Handle stderr for the Analysis script - KEEP THIS
analyzeProcess.stderr.on('data', (data) => {
    // Only print logs specifically from analyze_link.js
    if (data.toString().includes('[analyze_link]')) { 
        console.error(data.toString().trim()); 
    } 
    // Optionally log other analysis errors if needed, but keep it minimal
    // else { console.error(`[Link Analysis Error]: ${data}`); }
});

// Collect stdout from the analysis script and write to file
let finalJsonOutput = '';
analyzeProcess.stdout.on('data', (data) => {
    finalJsonOutput += data;
});

analyzeProcess.on('close', (code) => {
    if (code !== 0) {
        // Keep this error log
        console.error(`[Pipeline] Link analysis script exited with code ${code}`); 
    } else {
        // console.log(`[Pipeline] Link analysis script finished. Writing results to ${outputFilePath}`); // Removed log
        try {
            // Ensure the output directory exists
            if (!fs.existsSync(outputDir)){
                fs.mkdirSync(outputDir, { recursive: true });
                // console.log(`[Pipeline] Created output directory: ${outputDir}`); // Removed log
            }
            
            // Ensure the final output is valid JSON before writing
            JSON.parse(finalJsonOutput); // Test if it parses
            fs.writeFileSync(outputFilePath, finalJsonOutput);
            // console.log(`[Pipeline] Successfully wrote results to ${outputFilePath}`); // Removed log
        } catch (err) {
            // Keep this error log
            console.error(`[Pipeline] Error writing output file (or final JSON invalid): ${err}`);
            console.error("--- Final raw output attempt: ---");
            console.error(finalJsonOutput); // Log raw output on error
            console.error("--- End of raw output ---");
        }
    }
    // console.log('Affiliate analysis pipeline finished.'); // Removed log
});

analyzeProcess.on('error', (err) => {
    // Keep this error log
    console.error('[Pipeline] Failed to start Link analysis script:', err);
}); 