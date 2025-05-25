#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const DEFAULT_OUTPUT_FILE = path.join(__dirname, '..', 'docs_context.txt');

// Get all markdown files in docs directory
const getAllDocFiles = () => {
  try {
    return fs.readdirSync(DOCS_DIR)
      .filter(file => file.endsWith('.md'))
      .sort();
  } catch (error) {
    console.error('Error reading docs directory:', error.message);
    return [];
  }
};

// Create interactive CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  const docFiles = getAllDocFiles();
  
  if (docFiles.length === 0) {
    console.log('No markdown files found in the docs directory.');
    rl.close();
    return;
  }
  
  console.log('Available doc files:');
  docFiles.forEach((file, index) => {
    console.log(`${index + 1}. ${file}`);
  });
  
  const selectedInput = await askQuestion('\nEnter file numbers to include (comma-separated), "all" for all files, or "quit" to exit: ');
  
  if (selectedInput.toLowerCase() === 'quit') {
    console.log('Exiting...');
    rl.close();
    return;
  }
  
  let selectedFiles = [];
  
  if (selectedInput.toLowerCase() === 'all') {
    selectedFiles = docFiles;
  } else {
    const selectedIndices = selectedInput
      .split(',')
      .map(idx => idx.trim())
      .filter(idx => !isNaN(parseInt(idx)) && parseInt(idx) > 0 && parseInt(idx) <= docFiles.length)
      .map(idx => parseInt(idx) - 1);
    
    if (selectedIndices.length === 0) {
      console.log('No valid file numbers selected. Exiting...');
      rl.close();
      return;
    }
    
    selectedFiles = selectedIndices.map(idx => docFiles[idx]);
  }
  
  const outputPath = await askQuestion(`\nEnter output file path (default: ${DEFAULT_OUTPUT_FILE}): `);
  const finalOutputPath = outputPath.trim() || DEFAULT_OUTPUT_FILE;
  
  // Compile files content
  let combinedContent = '';
  for (const file of selectedFiles) {
    const filePath = path.join(DOCS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      combinedContent += `\n\n# ${file}\n\n${content}`;
    } catch (error) {
      console.error(`Error reading file ${file}:`, error.message);
    }
  }
  
  // Write to output file
  try {
    fs.writeFileSync(finalOutputPath, combinedContent.trim());
    console.log(`\nSuccessfully created ${finalOutputPath} with ${selectedFiles.length} doc files.`);
    console.log('Selected files:');
    selectedFiles.forEach(file => console.log(`- ${file}`));
  } catch (error) {
    console.error('Error writing output file:', error.message);
  }
  
  rl.close();
}

main(); 