/**
 * Pollinations Flow - Frontend JavaScript
 */

document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const sections = document.querySelectorAll('section');
  const navLinks = document.querySelectorAll('nav a');
  const authRequiredElements = document.querySelectorAll('.auth-required');
  const authNotRequiredElements = document.querySelectorAll('.auth-not-required');
  
  // Token elements
  const tokenField = document.getElementById('token-field');
  const toggleTokenBtn = document.getElementById('toggle-token');
  const copyTokenBtn = document.getElementById('copy-token');
  const regenerateTokenBtn = document.getElementById('regenerate-token');
  
  // Large token display elements
  const tokenFieldLarge = document.getElementById('token-field-large');
  const toggleTokenLargeBt = document.getElementById('toggle-token-large');
  const copyTokenLargeBt = document.getElementById('copy-token-large');
  const regenerateTokenLargeBt = document.getElementById('regenerate-token-large');
  
  // User info elements
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const userGithub = document.getElementById('user-github');
  const referrerCount = document.getElementById('referrer-count');
  
  // Referrer management elements
  const referrerTable = document.getElementById('referrer-table-body');
  const newReferrerInput = document.getElementById('new-referrer');
  const addReferrerBtn = document.getElementById('add-referrer-btn');
  
  // Code tabs
  const tabHeaders = document.querySelectorAll('.tab-header');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  // Application state
  let userData = null;
  let isAuthenticated = false;
  
  /**
   * Initialize the application
   */
  async function init() {
    // Check authentication status
    await checkAuth();
    
    // Set up event listeners
    setupNavigation();
    setupTokenManagement();
    setupReferrerManagement();
    setupCodeTabs();
    
    // Update code examples with token
    updateCodeExamples();
    
    // Show home section by default
    showSection('home');
  }
  
  /**
   * Check if the user is authenticated
   */
  async function checkAuth() {
    try {
      const response = await fetch('/status');
      const data = await response.json();
      
      isAuthenticated = data.authenticated;
      
      if (isAuthenticated) {
        userData = data.user;
        showAuthenticatedUI();
      } else {
        showUnauthenticatedUI();
      }
    } catch (error) {
      console.error('Error checking authentication status:', error);
      showUnauthenticatedUI();
    }
  }
  
  /**
   * Show authenticated UI elements
   */
  function showAuthenticatedUI() {
    authRequiredElements.forEach(el => el.classList.remove('hidden'));
    authNotRequiredElements.forEach(el => el.classList.add('hidden'));
    
    // Update user info
    updateUserInfo();
    
    // Update referrer list
    loadReferrers();
  }
  
  /**
   * Show unauthenticated UI elements
   */
  function showUnauthenticatedUI() {
    authRequiredElements.forEach(el => el.classList.add('hidden'));
    authNotRequiredElements.forEach(el => el.classList.remove('hidden'));
  }
  
  /**
   * Update user information
   */
  function updateUserInfo() {
    if (!userData) return;
    
    // Set user avatar
    if (userData.avatar_url) {
      userAvatar.src = userData.avatar_url;
    } else {
      // Default avatar with github username initial
      userAvatar.src = `https://ui-avatars.com/api/?name=${userData.github_username}&background=00c853&color=fff`;
    }
    
    // Set user name and github username
    userName.textContent = userData.github_username;
    userGithub.textContent = `@${userData.github_username}`;
    
    // Set token fields
    tokenField.value = userData.pollinations_token;
    tokenFieldLarge.value = userData.pollinations_token;
    
    // Update referrer count
    if (userData.referrers) {
      referrerCount.textContent = `${userData.referrers.length} ${userData.referrers.length === 1 ? 'domain' : 'domains'}`;
    } else {
      referrerCount.textContent = '0 domains';
    }
  }
  
  /**
   * Set up navigation
   */
  function setupNavigation() {
    // Handle navigation clicks
    navLinks.forEach(link => {
      link.addEventListener('click', function(e) {
        // Don't handle external links or auth links
        if (link.href.startsWith('http') || 
            link.href.includes('/github/login') || 
            link.href.includes('/logout')) {
          return;
        }
        
        e.preventDefault();
        
        const targetId = link.getAttribute('href').substring(1);
        showSection(targetId);
      });
    });
    
    // Handle hash changes
    window.addEventListener('hashchange', function() {
      const hash = window.location.hash.substring(1);
      if (hash) {
        showSection(hash);
      }
    });
    
    // Check initial hash
    const initialHash = window.location.hash.substring(1);
    if (initialHash) {
      showSection(initialHash);
    }
  }
  
  /**
   * Show a specific section
   */
  function showSection(sectionId) {
    // Hide all sections
    sections.forEach(section => {
      section.classList.remove('active');
    });
    
    // Show target section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
      targetSection.classList.add('active');
      
      // Update URL hash
      window.location.hash = sectionId;
    }
  }
  
  /**
   * Set up token management
   */
  function setupTokenManagement() {
    // Toggle token visibility
    toggleTokenBtn.addEventListener('click', function() {
      toggleTokenVisibility(tokenField);
    });
    
    toggleTokenLargeBt.addEventListener('click', function() {
      toggleTokenVisibility(tokenFieldLarge);
    });
    
    // Copy token to clipboard
    copyTokenBtn.addEventListener('click', function() {
      copyToClipboard(tokenField.value);
    });
    
    copyTokenLargeBt.addEventListener('click', function() {
      copyToClipboard(tokenFieldLarge.value);
    });
    
    // Regenerate token
    regenerateTokenBtn.addEventListener('click', function() {
      regenerateToken();
    });
    
    regenerateTokenLargeBt.addEventListener('click', function() {
      regenerateToken();
    });
  }
  
  /**
   * Toggle token visibility
   */
  function toggleTokenVisibility(inputField) {
    if (inputField.type === 'password') {
      inputField.type = 'text';
    } else {
      inputField.type = 'password';
    }
  }
  
  /**
   * Copy text to clipboard
   */
  function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
      .then(() => {
        showNotification('Token copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy text:', err);
        showNotification('Failed to copy token', 'error');
      });
  }
  
  /**
   * Regenerate token
   */
  async function regenerateToken() {
    if (!confirm('Are you sure you want to regenerate your token? This will invalidate your current token.')) {
      return;
    }
    
    try {
      const response = await fetch('/token/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update token in UI
        tokenField.value = data.token;
        tokenFieldLarge.value = data.token;
        
        // Update user data
        userData.pollinations_token = data.token;
        
        // Update code examples
        updateCodeExamples();
        
        showNotification('Token regenerated successfully!');
      } else {
        showNotification('Failed to regenerate token: ' + data.message, 'error');
      }
    } catch (error) {
      console.error('Error regenerating token:', error);
      showNotification('Failed to regenerate token', 'error');
    }
  }
  
  /**
   * Set up referrer management
   */
  function setupReferrerManagement() {
    // Add referrer
    addReferrerBtn.addEventListener('click', function() {
      addReferrer();
    });
    
    // Handle enter key in input
    newReferrerInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        addReferrer();
      }
    });
  }
  
  /**
   * Load referrers
   */
  async function loadReferrers() {
    try {
      const response = await fetch('/referrers');
      const data = await response.json();
      
      if (data.success) {
        // Update referrers in UI
        updateReferrerTable(data.referrers);
        
        // Update user data
        userData.referrers = data.referrers;
        
        // Update referrer count
        referrerCount.textContent = `${data.referrers.length} ${data.referrers.length === 1 ? 'domain' : 'domains'}`;
      } else {
        showNotification('Failed to load referrers: ' + data.message, 'error');
      }
    } catch (error) {
      console.error('Error loading referrers:', error);
      showNotification('Failed to load referrers', 'error');
    }
  }
  
  /**
   * Update referrer table
   */
  function updateReferrerTable(referrers) {
    // Clear table
    referrerTable.innerHTML = '';
    
    if (!referrers || referrers.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="2">No referrers added yet</td>';
      referrerTable.appendChild(row);
      return;
    }
    
    // Add rows for each referrer
    referrers.forEach(referrer => {
      const row = document.createElement('tr');
      
      row.innerHTML = `
        <td>${referrer}</td>
        <td>
          <button class="button danger small" data-referrer="${referrer}">Remove</button>
        </td>
      `;
      
      referrerTable.appendChild(row);
      
      // Add event listener to remove button
      const removeBtn = row.querySelector('.button');
      removeBtn.addEventListener('click', function() {
        removeReferrer(referrer);
      });
    });
  }
  
  /**
   * Add referrer
   */
  async function addReferrer() {
    const referrer = newReferrerInput.value.trim();
    
    if (!referrer) {
      showNotification('Please enter a referrer domain', 'error');
      return;
    }
    
    try {
      const response = await fetch('/referrer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ referrer })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update referrers in UI
        updateReferrerTable(data.referrers);
        
        // Update user data
        userData.referrers = data.referrers;
        
        // Update referrer count
        referrerCount.textContent = `${data.referrers.length} ${data.referrers.length === 1 ? 'domain' : 'domains'}`;
        
        // Clear input
        newReferrerInput.value = '';
        
        showNotification('Referrer added successfully!');
      } else {
        showNotification('Failed to add referrer: ' + data.message, 'error');
      }
    } catch (error) {
      console.error('Error adding referrer:', error);
      showNotification('Failed to add referrer', 'error');
    }
  }
  
  /**
   * Remove referrer
   */
  async function removeReferrer(referrer) {
    if (!confirm(`Are you sure you want to remove ${referrer} from your authorized referrers?`)) {
      return;
    }
    
    try {
      const response = await fetch('/referrer', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ referrer })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update referrers in UI
        updateReferrerTable(data.referrers);
        
        // Update user data
        userData.referrers = data.referrers;
        
        // Update referrer count
        referrerCount.textContent = `${data.referrers.length} ${data.referrers.length === 1 ? 'domain' : 'domains'}`;
        
        showNotification('Referrer removed successfully!');
      } else {
        showNotification('Failed to remove referrer: ' + data.message, 'error');
      }
    } catch (error) {
      console.error('Error removing referrer:', error);
      showNotification('Failed to remove referrer', 'error');
    }
  }
  
  /**
   * Set up code tabs
   */
  function setupCodeTabs() {
    tabHeaders.forEach(header => {
      header.addEventListener('click', function() {
        const tabId = this.getAttribute('data-tab');
        
        // Deactivate all tabs
        tabHeaders.forEach(h => h.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));
        
        // Activate selected tab
        this.classList.add('active');
        document.getElementById(`${tabId}-example`).classList.add('active');
      });
    });
  }
  
  /**
   * Update code examples with token
   */
  function updateCodeExamples() {
    if (!userData) return;
    
    const token = userData.pollinations_token;
    
    // Update token in code examples
    document.querySelectorAll('pre code').forEach(code => {
      code.textContent = code.textContent.replace(/YOUR_TOKEN/g, token);
    });
  }
  
  /**
   * Show notification
   */
  function showNotification(message, type = 'success') {
    // Check if notification container exists
    let container = document.querySelector('.notification-container');
    
    if (!container) {
      // Create container
      container = document.createElement('div');
      container.className = 'notification-container';
      document.body.appendChild(container);
      
      // Add styles
      const style = document.createElement('style');
      style.textContent = `
        .notification-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
        }
        
        .notification {
          padding: 12px 20px;
          margin-bottom: 10px;
          border-radius: 4px;
          color: white;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          font-size: 14px;
          transition: all 0.3s ease;
          opacity: 0;
          transform: translateY(-20px);
        }
        
        .notification.show {
          opacity: 1;
          transform: translateY(0);
        }
        
        .notification.success {
          background-color: #4caf50;
        }
        
        .notification.error {
          background-color: #f44336;
        }
        
        .notification.info {
          background-color: #2196f3;
        }
      `;
      document.head.appendChild(style);
    }
    
    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add to container
    container.appendChild(notification);
    
    // Show notification
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      
      // Remove from DOM after animation
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }
  
  // Initialize application
  init();
});
