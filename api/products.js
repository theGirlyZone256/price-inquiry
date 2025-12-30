async function submitSingleInquiry(productId) {
  const priceInput = document.getElementById(`price-${productId}`);
  const colorsInput = document.getElementById(`colors-${productId}`);
  const notesInput = document.getElementById(`notes-${productId}`);
  const messageEl = document.getElementById(`message-${productId}`);
  
  const price = priceInput.value.trim();
  const colors = colorsInput.value.trim();
  const notes = notesInput.value.trim();
  
  if (!price || isNaN(price) || Number(price) <= 0) {
    messageEl.innerHTML = '<span style="color:var(--accent-red);">❌ Please enter a valid price.</span>';
    return;
  }
  
  // Show loading state
  messageEl.innerHTML = '<span style="color:var(--text-secondary);">⏳ Submitting...</span>';
  priceInput.disabled = true;
  
  try {
    console.log('Submitting:', { productId, price, colors, notes });
    
    const response = await fetch(BACKEND_URL + '/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        productId, 
        price: Number(price), 
        colors, 
        notes 
      })
    });
    
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);
    
    if (data.success) {
      messageEl.innerHTML = '<span style="color:var(--accent-green);">✅ Submitted!</span>';
      priceInput.style.borderColor = 'var(--accent-green)';
      
      // Disable the submit button
      const submitBtn = priceInput.parentElement.parentElement.querySelector('.browse-btn');
      if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Submitted';
        submitBtn.style.background = 'linear-gradient(135deg, var(--accent-green), #059669)';
        submitBtn.disabled = true;
        submitBtn.onclick = null;
      }
    } else {
      throw new Error(data.error || 'Submission failed');
    }
  } catch (error) {
    console.error('Submission error:', error);
    messageEl.innerHTML = `<span style="color:var(--accent-red);">❌ Error: ${error.message}</span>`;
    priceInput.disabled = false;
  }
}