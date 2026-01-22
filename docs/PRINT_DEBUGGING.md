# Print Debugging Guide

## Issue: Browser Freeze During Print Preview
When clicking the "Print / PDF Preview" button, you may notice that the browser window seems to freeze or the DOM stops updating.

### Why this happens
This is **standard browser behavior**, not a bug in the application.
When `window.print()` is called:
1. The browser halts JavaScript execution on the main thread.
2. It renders the current page state into a static print view.
3. It opens the native OS print dialog.

Until this dialog is closed (either by printing or canceling), the browser tab will remain unresponsive.

## Workaround: Debugging Print Layout Without Freezing
To verify the print layout without triggering the freeze, you can inspect the `.print-container` component directly in the DOM.

### Method 1: Developer Tools (Manual)
1. Open Chrome DevTools (F12).
2. Find the `.print-container` element (it is usually hidden with `display: none` on screen).
3. Force it to be visible by adding these styles to the element:
   ```css
   display: block !important;
   visibility: visible !important;
   position: fixed;
   top: 0;
   left: 0;
   z-index: 9999;
   background: white;
   width: 100%;
   height: 100vh;
   overflow: auto;
   ```
4. You can now inspect the layout, spacing, and borders as they would appear on paper, without the browser freezing.

### Method 2: Console Script (Automated)
Run this snippet in the browser console to instantly overlay the print view:

```javascript
(() => {
  const printContainer = document.querySelector('.print-container');
  if (printContainer) {
    // Clone to avoid breaking original state if needed, or just style the original
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'white';
    overlay.style.zIndex = '99999';
    overlay.style.overflow = 'auto';
    overlay.style.padding = '20px';
    
    // Copy content
    overlay.innerHTML = printContainer.outerHTML;
    
    // Ensure the inner container is visible
    const inner = overlay.querySelector('.print-container');
    if (inner) {
      inner.style.display = 'block';
      inner.style.visibility = 'visible';
    }
    
    document.body.appendChild(overlay);
    console.log("Print preview overlay enabled. Refresh page to close.");
  } else {
    console.error("Print container not found.");
  }
})();
```
