const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');

// Paths
const projectListPath = path.join(__dirname, 'projectList.js');
const tempModulePath = path.join(__dirname, 'temp_module.js');
const outputPath = path.join(__dirname, 'projects.csv');

console.log(`Reading project list from: ${projectListPath}`);
console.log(`Output CSV will be written to: ${outputPath}`);

try {
    // Read the project list file content
    const projectListContent = fs.readFileSync(projectListPath, 'utf8');
    
    // Extract just the allProjects object definition
    const allProjectsMatch = projectListContent.match(/const\s+allProjects\s*=\s*(\{[\s\S]*?\}\s*;)/);
    if (!allProjectsMatch) {
        throw new Error('Could not find the allProjects object in the source file');
    }
    
    // Create a temporary CommonJS module to export the projects
    const tempModuleContent = `
        module.exports = ${allProjectsMatch[1].replace(/;$/, '')}
    `;
    
    // Write the temporary module
    fs.writeFileSync(tempModulePath, tempModuleContent);
    
    // Load the projects
    const allProjects = require(tempModulePath);
    
    // Clean up temp file
    fs.unlinkSync(tempModulePath);
    
    // --- Process projects and gather headers ---
    const records = [];
    const headerSet = new Set(['category']); // Start with 'category'

    console.log('Processing project categories...');
    for (const category in allProjects) {
        if (Object.hasOwnProperty.call(allProjects, category)) {
            console.log(`- Processing category: ${category} (${allProjects[category].length} projects)`);
            
            allProjects[category].forEach(project => {
                const record = { category };
                for (const key in project) {
                    if (Object.hasOwnProperty.call(project, key)) {
                        headerSet.add(key);
                        // Ensure value is a string for CSV, handle potential objects/arrays
                        if (typeof project[key] === 'object' && project[key] !== null) {
                            record[key] = JSON.stringify(project[key]);
                        } else {
                            record[key] = project[key];
                        }
                    }
                }
                records.push(record);
            });
        }
    }
    
    // If VibeCoder is missing, add it manually
    const hasVibeCoder = records.some(record => 
        record.name && record.name.includes('VibeCoder')
    );
    
    if (!hasVibeCoder) {
        console.log('VibeCoder entry not found, adding it manually...');
        records.push({
            category: "toolsInterfaces",
            name: "🆕 VibeCoder",
            url: "https://vibecoderbyaashir.netlify.app/",
            description: "A web app for coding with vibes, created using Pollinations.AI Open Source API without coding syntax.",
            author: "@Aashir__Shaikh",
            authorUrl: "https://x.com/Aashir__Shaikh",
            submissionDate: "2025-03-25"
        });
    }

    // --- Sort records according to the rules ---
    console.log('Sorting records...');
    records.sort((a, b) => {
        const hasDateA = !!a.submissionDate;
        const hasDateB = !!b.submissionDate;
        
        // Rule 1: Entries without dates at the top
        if (!hasDateA && hasDateB) return -1;
        if (hasDateA && !hasDateB) return 1;
        
        // Rule 2: If both have no date, sort by category alphabetically
        if (!hasDateA && !hasDateB) {
            return (a.category || '').localeCompare(b.category || '');
        }
        
        // Rule 3: If both have dates, sort from oldest to newest
        return a.submissionDate.localeCompare(b.submissionDate);
    });

    const headers = Array.from(headerSet).map(id => ({ id, title: id }));

    console.log(`Found ${headers.length} unique columns: ${headers.map(h=>h.id).join(', ')}`);
    console.log(`Total projects found and sorted: ${records.length}`);

    // --- Write to CSV ---
    const csvWriter = createObjectCsvWriter({
        path: outputPath,
        header: headers,
        encoding: 'utf8',
        append: false, // Overwrite existing file
    });

    csvWriter.writeRecords(records)
        .then(() => console.log(`Successfully wrote ${records.length} projects to ${outputPath}`))
        .catch(err => console.error('Error writing CSV file:', err));

} catch (error) {
    console.error('Error processing project list:', error);
    process.exit(1); // Indicate failure
} 