const Airtable = require('airtable');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// 1. Initialize Airtable with YOUR credentials
const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

module.exports = async (req, res) => {
  // Set headers to allow your frontend to talk to this backend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle browser preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // --- ROUTE 1: CREATE A NEW PROJECT WITH MULTIPLE IMAGES (POST /api/products) ---
  if (req.method === 'POST' && req.url === '/api/products') {
    try {
      const { imageUrls, projectName } = req.body; // imageUrls is now an array of Base64 strings
      
      if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
        return res.status(400).json({ success: false, error: 'An array of image data is required' });
      }

      // UPLOAD EACH IMAGE TO IMGBB AND GET URL
      const uploadedImageUrls = [];
      for (let i = 0; i < imageUrls.length; i++) {
        const base64Data = imageUrls[i].replace(/^data:image\/\w+;base64,/, '');
        const formData = new URLSearchParams();
        formData.append('image', base64Data);

        const imgbbResponse = await fetch(`https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`, {
          method: 'POST',
          body: formData
        });
        
        const imgbbData = await imgbbResponse.json();
        
        if (imgbbData.success) {
          // Get the direct image URL from ImgBB's response
          uploadedImageUrls.push(imgbbData.data.url);
        } else {
          throw new Error(`Failed to upload image ${i + 1} to ImgBB: ${imgbbData.error?.message || 'Unknown error'}`);
        }
      }

      // 1. Create a new PROJECT record in Airtable
      const projectId = 'proj_' + Math.floor(100000 + Math.random() * 900000);
      const projectRecord = await base('projects').create([{
        fields: {
          id: projectId,
          name: projectName || `Project ${new Date().toLocaleDateString()}`,
          status: 'Todo',
          createdAt: new Date().toISOString()
        }
      }]);

      // 2. Create a PRODUCT record for each UPLOADED ImgBB URL
      const productRecords = [];
      for (let i = 0; i < uploadedImageUrls.length; i++) {
        const productId = `${projectId}_item${i + 1}`;
        productRecords.push({
          fields: {
            id: productId,
            imageUrl: uploadedImageUrls[i], // This is now a clean ImgBB URL
            project: [projectRecord[0].id]
          }
        });
      }

      // Batch create all products in Airtable
      await base('products').create(productRecords);
      
      return res.json({ 
        success: true, 
        projectId: projectId,
        productCount: uploadedImageUrls.length,
        inquiryUrl: `${req.headers.origin || 'https://YOUR-FRONTEND.netlify.app'}/app.html?project=${projectId}`,
        message: `Project created with ${uploadedImageUrls.length} product(s).`
      });
    } catch (error) {
      console.error('Error creating project:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // --- ROUTE 2: GET ALL PRODUCTS FOR A PROJECT (GET /api/products?project=proj_123) ---
  if (req.method === 'GET' && req.query.project) {
    try {
      const projectId = req.query.project;
      
      // Fetch the project details first
      const projectRecords = await base('projects').select({ filterByFormula: `{id} = '${projectId}'` }).firstPage();
      if (projectRecords.length === 0) {
        return res.status(404).json({ success: false, error: 'Project not found' });
      }
      const project = projectRecords[0].fields;
      
      // Fetch ALL products linked to this project
      const productRecords = await base('products').select({ 
        filterByFormula: `{project} = '${projectRecords[0].id}'` 
      }).firstPage();
      
      const products = productRecords.map(record => record.fields);
      
      return res.json({ 
        success: true, 
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
          createdAt: project.createdAt
        },
        products: products // Array of {id, imageUrl} where imageUrl is ImgBB link
      });
    } catch (error) {
      console.error('Error fetching project:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // --- ROUTE 3: SUBMIT AN INQUIRY (POST /api/inquiries) ---
  if (req.method === 'POST' && req.url === '/api/inquiries') {
    try {
      const { productId, price, colors, notes } = req.body;
      if (!productId || !price) {
        return res.status(400).json({ success: false, error: 'Product ID and Price are required' });
      }
      // Save to Airtable 'inquiries' table
      await base('inquiries').create([{ fields: { productId, price: Number(price), colors, notes } }]);
      
      return res.json({ success: true, message: 'Inquiry response submitted.' });
    } catch (error) {
      console.error('Error submitting inquiry:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // If no route matches
  return res.status(404).json({ success: false, error: 'Route not found' });
};