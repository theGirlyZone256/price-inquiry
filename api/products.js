const Airtable = require('airtable');

// Initialize Airtable
let base;
try {
  base = new Airtable({
    apiKey: process.env.AIRTABLE_API_KEY
  }).base(process.env.AIRTABLE_BASE_ID);
} catch (error) {
  console.error('Airtable init error:', error);
}

// Main handler
const handler = async (req, res) => {
  // === CORS - SET THESE HEADERS FOR EVERY RESPONSE ===
  res.setHeader('Access-Control-Allow-Origin', 'https://priceinquiry.netlify.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // === HANDLE OPTIONS PREFLIGHT - RETURN EARLY ===
  if (req.method === 'OPTIONS') {
    console.log('✅ OPTIONS preflight handled');
    return res.status(200).end();
  }
  
  console.log(`➡️ ${req.method} ${req.url}`);
  
  // Parse URL to get path
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  
  // CREATE PROJECT
  if (req.method === 'POST' && path === '/api/products') {
    try {
      const { imageUrls, projectName } = req.body;
      
      if (!imageUrls || !Array.isArray(imageUrls)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Image URLs array required' 
        });
      }
      
      const projectId = 'proj_' + Math.floor(100000 + Math.random() * 900000);
      
      const projectRecord = await base('projects').create([{
        fields: {
          id: projectId,
          name: projectName || `Project ${new Date().toLocaleDateString()}`,
          Status: 'Todo',
          createdAt: new Date().toISOString().split('T')[0]
        }
      }]);
      
      const projectAirtableId = projectRecord[0].id;
      
      const productRecords = imageUrls.map((url, i) => ({
        fields: {
          id: `${projectId}_item${i + 1}`,
          imageUrl: url,
          project: [projectAirtableId]
        }
      }));
      
      await base('products').create(productRecords);
      
      return res.json({ 
        success: true, 
        projectId: projectId,
        productCount: imageUrls.length,
        inquiryUrl: `https://priceinquiry.netlify.app/?project=${projectId}`,
        message: `Project created with ${imageUrls.length} product(s).`
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
  
  // GET PROJECT WITH PRODUCTS
  if (req.method === 'GET' && url.searchParams.get('project')) {
    try {
      const projectId = url.searchParams.get('project');
      
      const projectRecords = await base('projects').select({
        filterByFormula: `{id} = '${projectId}'`
      }).firstPage();
      
      if (projectRecords.length === 0) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      
      const project = projectRecords[0].fields;
      const projectAirtableId = projectRecords[0].id;
      
      const allProducts = await base('products').select().all();
      const linkedProducts = [];
      
      allProducts.forEach(record => {
        if (record.fields.project && 
            Array.isArray(record.fields.project) && 
            record.fields.project.includes(projectAirtableId)) {
          linkedProducts.push({
            id: record.fields.id,
            imageUrl: record.fields.imageUrl
          });
        }
      });
      
      return res.json({
        success: true,
        project: {
          id: project.id,
          name: project.name,
          status: project.Status || 'Todo',
          createdAt: project.createdAt
        },
        products: linkedProducts
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
  
  // ========== SUBMIT INQUIRY (WITH EMAIL NOTIFICATION) ==========
  if (req.method === 'POST' && path === '/api/inquiries') {
    try {
      console.log('📝 Received inquiry submission:', req.body);
      const { productId, price, colors, notes } = req.body;
      
      if (!productId || !price) {
        return res.status(400).json({ 
          success: false, 
          error: 'Product ID and Price are required' 
        });
      }
      
      const priceNum = Number(price);
      if (isNaN(priceNum) || priceNum <= 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Price must be a positive number' 
        });
      }
      
      console.log(`💸 Creating inquiry for ${productId}: UGX ${priceNum}`);
      
      // === 1. FIND THE PRODUCT TO GET THE IMAGE ===
      const productRecords = await base('products').select({
        filterByFormula: `{id} = '${productId}'`
      }).firstPage();
      
      if (productRecords.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'Product not found' 
        });
      }
      
      const product = productRecords[0].fields;
      const productImageUrl = product.imageUrl || '';
      const projectId = productId.split('_item')[0]; // Extract proj_xxxxxx
      
      // === 2. SAVE TO AIRTABLE ===
      const inquiryRecord = await base('inquiries').create([{ 
        fields: { 
          productId, 
          price: priceNum,
          colors: colors || '', 
          notes: notes || '',
          submittedAt: new Date().toISOString()
        } 
      }]);
      
      console.log(`✅ Inquiry saved to Airtable. ID: ${inquiryRecord[0].id}`);
      
      // === 3. SEND EMAIL VIA SENDGRID ===
      // Only try to send if the API key is configured
      if (process.env.SENDGRID_API_KEY) {
        // Dynamically require SendGrid to avoid errors if not installed yet
        let sgMail;
        try {
          sgMail = require('@sendgrid/mail');
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          
          const msg = {
            to: 'epignosistic@gmail.com', // Your email
            // ⚠️ IMPORTANT: Change this to match your VERIFIED sender email in SendGrid
            from: 'epignosistic@gmail.com', // MUST be your verified sender
            subject: `🛒 New Price Quote: ${productId}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2 style="color: #4f46e5;">📦 New Price Submission</h2>
                <p><strong>Project:</strong> ${projectId}</p>
                <p><strong>Product ID:</strong> ${productId}</p>
                <hr style="border: 1px solid #eee;">
                <p><strong>💰 Price Quoted:</strong> <span style="font-size: 1.2em; color: #10b981; font-weight: bold;">UGX ${priceNum.toLocaleString()}</span></p>
                <p><strong>🎨 Colors/Variations:</strong> ${colors || '<em>Not specified</em>'}</p>
                <p><strong>📝 Additional Notes:</strong> ${notes || '<em>None</em>'}</p>
                <hr style="border: 1px solid #eee;">
                ${productImageUrl ? `
                  <p><strong>🖼️ Product Image:</strong></p>
                  <img src="${productImageUrl}" alt="Product Image" style="max-width: 300px; border: 1px solid #ddd; border-radius: 8px;" />
                  <p><small><a href="${productImageUrl}">Open image in new tab</a></small></p>
                ` : '<p><em>No image available for this product.</em></p>'}
                <br>
                <p style="background-color: #f3f4f6; padding: 12px; border-radius: 6px;">
                  <strong>⏰ Submitted:</strong> ${new Date().toLocaleString()}<br>
                  <strong>🔗 Airtable Record:</strong> New entry in your 'inquiries' table.
                </p>
              </div>
            `
          };
          
          await sgMail.send(msg);
          console.log('✅ Inquiry email sent to epignosistic@gmail.com');
        } catch (sgError) {
          // If SendGrid fails, log but don't crash the whole submission
          console.error('⚠️ SendGrid email failed (but inquiry was saved):', sgError.message);
        }
      } else {
        console.warn('⚠️ SendGrid API key not found. Email notification skipped.');
      }
      
      // === 4. RETURN SUCCESS TO THE SHOPKEEPER ===
      return res.json({ 
        success: true, 
        message: 'Price submitted successfully!',
        inquiryId: inquiryRecord[0].id
      });
      
    } catch (error) {
      console.error('❌ Error in inquiry submission process:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to process submission. Please try again.' 
      });
    }
  }
  
  return res.status(404).json({ 
    success: false, 
    error: 'Route not found',
    path: path,
    method: req.method
  });
};

// Export for Vercel
module.exports = handler;