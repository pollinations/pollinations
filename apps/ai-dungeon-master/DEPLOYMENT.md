# AI Dungeon Master - Deployment Guide

## Live Demo
**Play Now:** [AI Dungeon Master Live Demo](https://codevector-2003.github.io/pollinations/apps/ai-dungeon-master/)

## Deployment Options

### 1. GitHub Pages (Recommended)
The project is configured for automatic deployment to GitHub Pages:

#### Setup Steps:
1. **Fork the Repository**
   ```bash
   git clone https://github.com/codevector-2003/pollinations.git
   cd pollinations/apps/ai-dungeon-master
   ```

2. **Enable GitHub Pages**
   - Go to repository Settings → Pages
   - Source: "GitHub Actions"
   - The workflow will automatically deploy on push to main/master

3. **Access Your Deployment**
   - URL: `https://[username].github.io/pollinations/`
   - Replace `[username]` with your GitHub username

#### Automatic Deployment
- Builds on every push to main/master
- Optimized production builds
- CDN delivery for fast loading
- HTTPS enabled by default

### 2. Local Development

#### Prerequisites
- Node.js 18+ 
- npm or yarn

#### Quick Start
```bash
# Navigate to project directory
cd apps/ai-dungeon-master

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5174
```

#### Production Build
```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

### 3. Other Hosting Platforms

#### Vercel
1. Connect your GitHub repository to Vercel
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Deploy automatically on git push

#### Netlify
1. Connect repository to Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Auto-deploy on push

#### Static Hosting (AWS S3, Google Cloud, etc.)
1. Run `npm run build`
2. Upload contents of `dist/` folder
3. Configure as static website
4. Enable HTTPS

## Configuration

### Environment Variables (Optional)
Create `.env` file for custom configurations:
```env
# API Configuration (defaults work fine)
VITE_API_BASE_URL=https://text.pollinations.ai
VITE_IMAGE_API_URL=https://image.pollinations.ai
```

### Build Optimization
The project is pre-configured for optimal performance:
- Code splitting
- Asset optimization
- Tree shaking
- Minification
- Browser caching

## Performance Features

### Loading Performance
- **First Load:** ~2-3 seconds
- **Subsequent Loads:** ~1 second (cached)
- **Image Generation:** 2-5 seconds per image
- **Story Generation:** 1-3 seconds per response

### Mobile Optimization
- Responsive design
- Touch-friendly interface
- Optimized for mobile bandwidth
- Progressive Web App features

## Monitoring & Analytics

### Built-in Monitoring
- Console logging for debugging
- Error tracking and reporting
- Performance metrics
- Save/load success rates

### Add Analytics (Optional)
```javascript
// Add to index.html for Google Analytics
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

## Security Features

### API Security
- HTTPS-only communication
- No sensitive data exposure
- Client-side only (no backend secrets)
- Rate limiting protection

### Data Privacy
- Local storage only (no server-side data)
- No user registration required
- No personal data collection
- GDPR compliant

## Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### API Issues
- Check network connectivity
- Verify Pollinations.ai service status
- Review browser console for errors

#### Deployment Issues
- Ensure GitHub Actions are enabled
- Check repository permissions
- Verify build logs in Actions tab

### Debug Mode
Enable debug logging:
```javascript
// In browser console
localStorage.setItem('debug', 'true');
// Reload page to see detailed logs
```

## Contributing to Deployment

### Improving Build Process
- Add Progressive Web App features
- Implement service worker for offline play
- Add image caching strategies
- Optimize bundle splitting

### Infrastructure Improvements
- Add CDN configuration
- Implement monitoring dashboard
- Add automated testing in CI/CD
- Performance budgets and alerts

### Performance Issues
- Monitor network tab in browser dev tools
- Check Pollinations.ai service status
- Verify API endpoints are responding
- Clear browser cache and localStorage

---

