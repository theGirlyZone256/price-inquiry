const Airtable = require('airtable');

const base = new Airtable({
  apiKey: process.env.AIRTABLE_API_KEY
}).base(process.env.AIRTABLE_BASE_ID);

module.exports = async (req, res) => {
  // ================= CORRECT CORS HANDLING =================
  console.log(`🌐 Request: ${req.method} ${req.url} from origin: ${req.headers.origin}`);
  
  // Set CORS headers for EVERY response
  const origin = req.headers.origin;
  
  // ALWAYS set these headers
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Log what headers we're setting
  console.log(`✅ Setting CORS headers for origin: ${origin || '*'}`);
  
  // Handle preflight OPTIONS immediately
  if (req.method === 'OPTIONS') {
    console.log(`🛬 Handling OPTIONS preflight`);
    return res.status(200).end();
  }
  // ========================================================

  // CREATE PROJECT
  if (req.method === 'POST' && req.url === '/api/products') {
    try {
      const { imageUrls, projectName } = req.body;
      
      if (!imageUrls || !Array.isArray(imageUrls)) {
        return res.status(400).json({ success: false, error: 'Image URLs array required' });
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

      const productRecords = imageUrls.map((url, i) => ({
        fields: {
          id: `${projectId}_item${i + 1}`,
          imageUrl: url,
          project: [projectRecord[0].id]
        }
      }));
      
      await base('products').create(productRecords);
      
      return res.json({ 
        success: true, 
        projectId: projectId,
        productCount: imageUrls.length,
        inquiryUrl: `${origin || 'https://priceinquiry.netlify.app'}/?project=${projectId}`,
        message: `Project created with ${imageUrls.length} product(s).`
      });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET PROJECT WITH PRODUCTS
  if (req.method === 'GET' && req.query.project) {
    try {
      const projectId = req.query.project;
      
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
      
      console.log(`✅ Found ${linkedProducts.length} products for project ${projectId}`);
      
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
  if (req.method === 'POST' && req.url === '/api/inquiries') {
    try {
      const { productId, price, colors, notes } = req.body;
      console.log(`📝 Submitting inquiry for product: ${productId}, price: ${price}`);
      
      if (!productId || !price) {
        return res.status(400).json({ success: false, error: 'Product ID and Price are required' });
      }
      
      await base('inquiries').create([{ 
        fields: { 
          productId, 
          price: Number(price), 
          colors: colors || '', 
          notes: notes || '' 
        } 
      }]);
      
      console.log(`✅ Inquiry saved for product: ${productId}`);
      return res.json({ success: true, message: 'Inquiry response submitted.' });
    } catch (error) {
      console.error('Error submitting inquiry:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Default 404 for unmatched routes
  return res.status(404).json({ 
    success: false, 
    error: 'Route not found',
    requestedUrl: req.url,
    method: req.method 
  });
};