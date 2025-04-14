const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createObjectCsvWriter } = require('csv-writer');

const projectListPath = path.join(__dirname, '..', 'pollinations.ai', 'src', 'config', 'projectList.js');
const outputPath = path.join(__dirname, '..', 'projects.csv'); // Output in the root

console.log(`Reading project list from: ${projectListPath}`);
console.log(`Output CSV will be written to: ${outputPath}`);

try {
    // Read the source file content
    const fileContent = fs.readFileSync(projectListPath, 'utf8');

    // --- Extract the allProjects object definition ---
    // This is a bit brittle and relies on the specific formatting.
    // It looks for the start of the object assignment and the closing brace/semicolon.
    const startIndex = fileContent.indexOf('const allProjects = {');
    if (startIndex === -1) {
        throw new Error('Could not find the start of the "allProjects" object definition.');
    }

    let braceLevel = 0;
    let endIndex = -1;
    let inString = false;
    let inComment = false;
    let escapeNext = false;

    for (let i = startIndex + 'const allProjects = '.length; i < fileContent.length; i++) {
        const char = fileContent[i];
        const prevChar = i > 0 ? fileContent[i-1] : null;

        if (inComment) {
            if (char === '\n') {
                inComment = false;
            }
            continue;
        }

        if (!inString && char === '/' && prevChar === '/') {
             inComment = true;
             continue;
        }
        
        if (char === '"' || char === "'") {
             if (!escapeNext) {
                inString = !inString;
             }
        }

        if (!inString) {
            if (char === '{') {
                braceLevel++;
            } else if (char === '}') {
                braceLevel--;
                if (braceLevel === 0) {
                    endIndex = i + 1; // Include the closing brace
                    // Find the next semicolon if it exists immediately after
                    const nextChar = fileContent.substring(endIndex).trimStart()[0];
                    if (nextChar === ';') {
                        endIndex = fileContent.indexOf(';', endIndex) + 1;
                    }
                    break;
                }
            }
        }
        
        escapeNext = char === '\\' && !escapeNext;
    }


    if (endIndex === -1) {
        throw new Error('Could not find the end of the "allProjects" object definition.');
    }

    const objectString = fileContent.substring(startIndex + 'const '.length, endIndex);
    
    // --- Safely evaluate the object string ---
    // Construct a valid script for vm: declare the constant and assign it to a context property
    const script = new vm.Script(`const ${objectString}; global.tempData = allProjects;`); 
    const context = vm.createContext({ global: {} }); // Provide an empty global object
    script.runInContext(context);
    const allProjects = context.global.tempData; // Retrieve the object from the context

    if (!allProjects || typeof allProjects !== 'object') {
         throw new Error('Failed to evaluate "allProjects" object correctly using vm.');
    }
    
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
                        // Ensure value is a string for CSV, handle potential objects/arrays simply
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

    // --- Sort records by submissionDate (descending) ---
    console.log('Sorting records by submission date (newest first)...');
    records.sort((a, b) => {
        const dateA = a.submissionDate;
        const dateB = b.submissionDate;

        // Basic validation for YYYY-MM-DD format
        const isValidDate = (dateStr) => dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);

        const validA = isValidDate(dateA);
        const validB = isValidDate(dateB);

        if (validA && validB) {
            // Both dates are valid, compare directly (descending)
            return dateB.localeCompare(dateA); 
        } else if (validA) {
            // Only A is valid, A is newer (comes first)
            return -1; 
        } else if (validB) {
            // Only B is valid, B is newer (comes first)
            return 1;
        } else {
            // Neither is valid, maintain original relative order (or treat as equal)
            return 0; 
        }
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