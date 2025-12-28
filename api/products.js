const Airtable = require('airtable');

// Initialize Airtable - CRITICAL: Ensure your env vars are named EXACTLY like this
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ROUTE 1: CREATE PROJECT WITH IMAGES
  if (req.method === 'POST' && req.url === '/api/products') {
    console.log('🚀 API CALL: /api/products received');
    
    try {
      const { imageUrls, projectName } = req.body;
      
      // 1. Upload each image to ImgBB
      const uploadedUrls = [];
      for (let i = 0; i < imageUrls.length; i++) {
        console.log(`📤 Uploading image ${i + 1} to ImgBB...`);
        
        // Extract base64 data
        const base64Data = imageUrls[i].replace(/^data:image\/\w+;base64,/, '');
        
        // Use FormData via node-fetch
        const FormData = require('form-data');
        const form = new FormData();
        form.append('image', base64Data);
        
        // Upload to ImgBB
        const imgbbResponse = await fetch(
          `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
          {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
          }
        );
        
        const imgbbData = await imgbbResponse.json();
        console.log('ImgBB response:', imgbbData.status);
        
        if (imgbbData.success) {
          uploadedUrls.push(imgbbData.data.url);
        } else {
          throw new Error(`ImgBB upload failed: ${imgbbData.error?.message || 'Unknown error'}`);
        }
      }

      // 2. Create Airtable Project
      const projectId = 'proj_' + Math.floor(100000 + Math.random() * 900000);
      console.log('Creating Airtable project:', projectId);
      
      const projectRecord = await base('projects').create([{
        fields: {
          id: projectId,
          name: projectName || `Project ${new Date().toLocaleDateString()}`,
          status: 'Todo',
          createdAt: new Date().toISOString()
        }
      }]);

      // 3. Create Airtable Products
      const productRecords = uploadedUrls.map((url, index) => ({
        fields: {
          id: `${projectId}_item${index + 1}`,
          imageUrl: url,
          project: [projectRecord[0].id]
        }
      }));
      
      await base('products').create(productRecords);
      console.log(`✅ Created project ${projectId} with ${uploadedUrls.length} products`);

      // Return success
      return res.json({
        success: true,
        projectId: projectId,
        productCount: uploadedUrls.length,
        inquiryUrl: `https://YOUR-FRONTEND.netlify.app/app.html?project=${projectId}`,
        message: 'Project created successfully'
      });

    } catch (error) {
      console.error('❌ ERROR in /api/products:', error.message);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // ROUTE 2: GET PROJECT (for shopkeeper)
  if (req.method === 'GET' && req.query.project) {
    try {
      const projectId = req.query.project;
      const project = await base('projects').select({
        filterByFormula: `{id} = '${projectId}'`
      }).firstPage();

      if (project.length === 0) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }

      const products = await base('products').select({
        filterByFormula: `{project} = '${project[0].id}'`
      }).firstPage();

      return res.json({
        success: true,
        project: project[0].fields,
        products: products.map(p => p.fields)
      });
    } catch (error) {
      console.error('Error fetching project:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ROUTE 3: SUBMIT INQUIRY
  if (req.method === 'POST' && req.url === '/api/inquiries') {
    try {
      const { productId, price, colors, notes } = req.body;
      await base('inquiries').create([{
        fields: { productId, price: Number(price), colors, notes }
      }]);
      return res.json({ success: true, message: 'Response saved' });
    } catch (error) {
      console.error('Error saving inquiry:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Default response
  return res.status(404).json({ success: false, error: 'Route not found' });
};

// Global fetch polyfill
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));