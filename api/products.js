const Airtable = require('airtable');

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
      const { imageUrls, projectName } = req.body; // Now receives an ARRAY of URLs
      
      if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
        return res.status(400).json({ success: false, error: 'An array of image URLs is required' });
      }

      // 1. Create a new PROJECT record
      const projectId = 'proj_' + Math.floor(100000 + Math.random() * 900000);
      const projectRecord = await base('projects').create([{
        fields: {
          id: projectId,
          name: projectName || `Project ${new Date().toLocaleDateString()}`,
          status: 'Todo',
          createdAt: new Date().toISOString()
        }
      }]);

      // 2. Create a PRODUCT record for each image URL
      const productRecords = [];
      for (let i = 0; i < imageUrls.length; i++) {
        const productId = `${projectId}_item${i + 1}`; // e.g., proj_123456_item1
        productRecords.push({
          fields: {
            id: productId,
            imageUrl: imageUrls[i],
            project: [projectRecord[0].id] // Link to the project record
          }
        });
      }

      // Batch create all products in Airtable (more efficient)
      await base('products').create(productRecords);
      
      return res.json({ 
        success: true, 
        projectId: projectId,
        productCount: imageUrls.length,
        inquiryUrl: `${req.headers.origin || 'https://YOUR-FRONTEND.netlify.app'}/app.html?project=${projectId}`,
        message: `Project created with ${imageUrls.length} product(s).`
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
        products: products // Array of {id, imageUrl}
      });
    } catch (error) {
      console.error('Error fetching project:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // --- ROUTE 3: SUBMIT AN INQUIRY FOR A SINGLE PRODUCT (POST /api/inquiries) ---
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