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
  
  // SUBMIT INQUIRY
  if (req.method === 'POST' && path === '/api/inquiries') {
    try {
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
      
      await base('inquiries').create([{ 
        fields: { 
          productId, 
          price: priceNum,
          colors: colors || '', 
          notes: notes || '',
          submittedAt: new Date().toISOString()
        } 
      }]);
      
      return res.json({ 
        success: true, 
        message: 'Price submitted successfully!'
      });
      
    } catch (error) {
      console.error('Error submitting inquiry:', error);
      return res.status(500).json({ success: false, error: error.message });
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