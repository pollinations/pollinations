const fs = require('fs');
const path = require('path');

// Input file path
const inputFile = path.join(__dirname, 'results', '20250402_1718.json');

// Output file path
const outputFile = path.join(__dirname, 'results', '20250402_1718_clean.json');

// Read the input file
fs.readFile(inputFile, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading the file:', err);
    return;
  }

  try {
    // Parse the JSON data
    const jsonData = JSON.parse(data);
    
    // Filter each item to remove unwanted fields
    const cleanedData = jsonData.map(item => {
      return {
        Id: item.Id,
        Name: item.Name,
        Description: item.Description,
        CampaignId: item.CampaignId,
        CampaignName: item.CampaignName,
        Type: item.Type,
        TrackingLink: item.TrackingLink,
        LandingPageUrl: item.LandingPageUrl,
        AdvertiserName: item.AdvertiserName,
        Labels: item.Labels,
        AllowDeepLinking: item.AllowDeepLinking,
        MobileReady: item.MobileReady,
        Language: item.Language,
        StartDate: item.StartDate,
        TopSeller: item.TopSeller,
        affiliate_audience: item.affiliate_audience,
        affiliate_product: item.affiliate_product
      };
    });
    
    // Write the cleaned data to the output file
    fs.writeFile(outputFile, JSON.stringify(cleanedData, null, 2), 'utf8', (err) => {
      if (err) {
        console.error('Error writing to the output file:', err);
        return;
      }
      console.log(`Cleaned data has been written to ${outputFile}`);
    });
  } catch (error) {
    console.error('Error processing the JSON data:', error);
  }
});
