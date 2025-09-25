// Titan Theme License Validation
(function() {
  'use strict';

  // Function to get the shop domain
  function getShopDomain() {
    // First try Shopify's built-in JS variable
    if (window.Shopify?.shop) {
      return window.Shopify.shop;
    }
    
    // Try to extract from current hostname
    const hostname = window.location.hostname;
    
    // If it's a myshopify.com domain, return as-is
    if (hostname.includes('myshopify.com')) {
      return hostname;
    }
    
    // For custom domains, check if there's a meta tag with shop domain
    const shopMeta = document.querySelector('meta[name="shopify-shop-domain"]');
    if (shopMeta) {
      return shopMeta.content;
    }
    
    // Final fallback - return current hostname
    return hostname;
  }

  const CONFIG = {
    licenseKey: 'TITAN-MFAM9G08-8PIZ4EAK',
    shopDomain: getShopDomain(),
    validationUrl: 'https://titan.gadget.app/api-verify-license',
    retryAttempts: 3,
    retryDelay: 2000
  };

  let validationInProgress = false;
  let validationResult = null;

  function validateLicense() {
    if (validationInProgress || validationResult?.isValid) {
      return Promise.resolve(validationResult);
    }

    if (!CONFIG.licenseKey || !CONFIG.shopDomain) {
      console.log('Titan: License validation skipped - missing config');
      return Promise.resolve({ isValid: true, reason: 'config_missing' });
    }

    validationInProgress = true;

    return fetch(CONFIG.validationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        shopDomain: CONFIG.shopDomain
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Validation failed: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      validationResult = data;
      validationInProgress = false;
      
      if (!data.isValid && data.message && data.message.includes('SUBSCRIPTION')) {
        showSubscriptionPrompt();
      }
      
      return data;
    })
    .catch(error => {
      console.warn('Titan: License validation error:', error);
      validationInProgress = false;
      // Don't lock on validation errors
      validationResult = { isValid: true, reason: 'validation_error' };
      return validationResult;
    });
  }

  function showSubscriptionPrompt() {
    console.log('Titan: Subscription required for continued access');
    
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #f44336;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 9999;
      font-family: Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    notification.textContent = 'Titan Theme: Subscription required';
    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  // Initialize validation on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', validateLicense);
  } else {
    validateLicense();
  }

  // Re-validate periodically (every 30 minutes)
  setInterval(validateLicense, 30 * 60 * 1000);

})();