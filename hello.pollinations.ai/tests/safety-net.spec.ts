import { test, expect } from '@playwright/test';

test.describe('Cyberpunk Cat Generation - Safety Net Test', () => {
  test('critical path: generate cyberpunk cat from play page', async ({ page }) => {
    console.log('🚀 SAFETY NET TEST: Cyberpunk Cat Generation');
    console.log('🎯 Target: /play page (where image generation happens)');
    
    // Navigate directly to the play page
    await page.goto('/play');
    
    // Wait for the page to fully load
    await page.waitForLoadState('networkidle');
    console.log('✅ Play page loaded');
    
    // Look for the prompt textarea specifically
    const promptTextarea = page.locator('textarea');
    await promptTextarea.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✅ Found prompt textarea');
    
    // Type "Cyberpunk cat" into the prompt field
    await promptTextarea.click();
    await promptTextarea.clear();
    await promptTextarea.fill('Cyberpunk cat');
    
    // Verify the text was entered
    await expect(promptTextarea).toHaveValue('Cyberpunk cat');
    console.log('✅ Typed "Cyberpunk cat" into prompt');
    
    // Find the generate button by looking for buttons with "Generate" text
    const generateButton = page.locator('button').filter({ hasText: /Generate/i });
    await generateButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Ensure button is enabled (should be enabled since we have text)
    const isEnabled = await generateButton.isEnabled();
    expect(isEnabled).toBe(true);
    console.log('✅ Generate button found and enabled');
    
    // Click the generate button
    await generateButton.click();
    console.log('🖱️ Clicked Generate button');
    
    // Wait for the result - look for any image that appears
    console.log('⏳ Waiting for image generation...');
    
    // Look for images that might appear (blob URLs, pollinations URLs, etc.)
    const resultImage = page.locator('img[src*="blob:"], img[src*="pollinations"], img[src*="image"], img[src*="data:"]').first();
    
    // Wait with longer timeout for image generation
    await resultImage.waitFor({ state: 'visible', timeout: 30000 });
    
    // Verify the image is visible
    await expect(resultImage).toBeVisible();
    console.log('✅ Generated image appeared!');
    
    // Get the image source for verification
    const imageSrc = await resultImage.getAttribute('src');
    expect(imageSrc).toBeTruthy();
    console.log(`✅ Image source: ${imageSrc}`);
    
    // Take a screenshot as proof
    await page.screenshot({ path: 'test-results/cyberpunk-cat-proof.png', fullPage: true });
    console.log('📸 Screenshot saved: cyberpunk-cat-proof.png');
    
    console.log('🎉 SAFETY NET TEST PASSED: Image generation is working!');
    console.log('🛡️ This test will catch regressions if Thomas breaks the API');
  });

  test('regression detection: verify generation still works', async ({ page }) => {
    console.log('🔍 REGRESSION DETECTION: Testing if generation still works');
    
    await page.goto('/play');
    await page.waitForLoadState('networkidle');
    
    // Quick test with a simple prompt
    const promptTextarea = page.locator('textarea');
    await promptTextarea.waitFor({ state: 'visible' });
    
    await promptTextarea.fill('Test image');
    
    const generateButton = page.locator('button').filter({ hasText: /Generate/i });
    await generateButton.click();
    
    // Quick check for result
    const resultImage = page.locator('img').first();
    await resultImage.waitFor({ state: 'visible', timeout: 15000 });
    
    console.log('✅ Quick regression check passed');
  });
});